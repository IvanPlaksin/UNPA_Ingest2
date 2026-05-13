/**
 * KB-Integrated Graph Loader
 *
 * Loads GXE graphs from Graph Catalog with caching,
 * DAG conversion, subgraph resolution, and file fallback.
 *
 * Replaces file-only graph loading for FlowDesk runtime.
 *
 * @module services/flowdesk/graph-loader-kb
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[GraphLoaderKB]';

let _catalog = null;
function catalog() {
  if (!_catalog) {
    const mod = require('../../../services/graphCatalog.service');
    _catalog = mod.graphCatalogService || mod;
  }
  return _catalog;
}

const CONFIG = {
  defaultNamespace: 'FLOWDESK',
  fallbackToFile: true,
  fallbackDir: path.resolve(__dirname, 'graphs')
};

// Simple in-memory cache
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// ═══════════════════════════════════════════════════════════════
// MAIN LOADER
// ═══════════════════════════════════════════════════════════════

/**
 * Load graph by name — catalog first, file fallback
 * @param {string} graphName - e.g. 'flowdesk.classify.pipeline'
 * @param {Object} [options]
 * @param {boolean} [options.useCache=true]
 * @param {boolean} [options.convertToDag=true]
 * @returns {Promise<{success, source, graph, dag?, metadata}>}
 */
async function loadGraph(graphName, options = {}) {
  const { useCache = true, convertToDag = true, namespace = CONFIG.defaultNamespace } = options;

  // Cache check
  if (useCache && _cache.has(graphName)) {
    const cached = _cache.get(graphName);
    if (Date.now() - cached.ts < CACHE_TTL) {
      return { success: true, source: 'cache', graph: cached.graph, dag: cached.dag, metadata: cached.metadata };
    }
    _cache.delete(graphName);
  }

  // Try catalog
  try {
    const entries = await catalog().listGraphs({ namespace, limit: 200 });
    const items = entries.items || entries || [];
    const entry = items.find(g => g.name === graphName);

    if (entry) {
      const entryId = entry.id || entry.entryId;
      const full = await catalog().getGraphById(entryId);
      const nodes = typeof full.nodes === 'string' ? JSON.parse(full.nodes) : full.nodes || [];
      const edges = typeof full.edges === 'string' ? JSON.parse(full.edges) : full.edges || [];

      const graph = { id: entryId, name: graphName, version: full.currentVersion || 1, nodes, edges };
      const dag = convertToDag ? convertGraphToDag(graph) : null;
      const metadata = { source: 'catalog', loadedAt: new Date().toISOString() };

      if (useCache) _cache.set(graphName, { graph, dag, metadata, ts: Date.now() });

      console.log(`${LOG_PREFIX} Loaded ${graphName} from catalog (${nodes.length} nodes)`);
      return { success: true, source: 'catalog', graph, dag, metadata };
    }
  } catch (err) {
    console.warn(`${LOG_PREFIX} Catalog load failed for ${graphName}: ${err.message}`);
  }

  // File fallback
  if (CONFIG.fallbackToFile) {
    return loadGraphFromFile(graphName, options);
  }

  return { success: false, error: `Graph not found: ${graphName}`, source: 'none' };
}

/**
 * Load multiple graphs
 */
async function loadGraphs(names, options = {}) {
  const results = {};
  await Promise.all(names.map(async n => { results[n] = await loadGraph(n, options); }));
  return results;
}

/**
 * Preload common graphs at startup
 */
async function preloadGraphs(names) {
  const defaults = [
    'flowdesk.classify.pipeline', 'flowdesk.sla.decision',
    'flowdesk.route.queue', 'flowdesk.intake.enhanced'
  ];
  const toLoad = names || defaults;
  console.log(`${LOG_PREFIX} Preloading ${toLoad.length} graphs...`);
  const results = await loadGraphs(toLoad);
  const ok = Object.values(results).filter(r => r.success).length;
  console.log(`${LOG_PREFIX} Preloaded ${ok}/${toLoad.length} graphs`);
  return results;
}

// ═══════════════════════════════════════════════════════════════
// DAG CONVERSION
// ═══════════════════════════════════════════════════════════════

function convertGraphToDag(graph) {
  const { nodes, edges } = graph;
  const adj = {};
  const inDeg = {};

  for (const n of nodes) { adj[n.id] = []; inDeg[n.id] = 0; }
  for (const e of edges) {
    if (adj[e.source]) adj[e.source].push({ target: e.target, label: e.label, type: e.type || 'default' });
    inDeg[e.target] = (inDeg[e.target] || 0) + 1;
  }

  const dagNodes = nodes.map(n => ({
    id: n.id,
    type: mapType(n.type),
    tool: n.data?.tool || inferTool(n),
    config: n.data?.config || {},
    position: n.position,
    outputs: (adj[n.id] || []).map(e => ({ targetId: e.target, condition: e.label, edgeType: e.type }))
  }));

  return {
    nodes: dagNodes,
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label, type: e.type || 'default' })),
    entryNodes: nodes.filter(n => (inDeg[n.id] || 0) === 0).map(n => n.id),
    exitNodes: nodes.filter(n => (adj[n.id] || []).length === 0).map(n => n.id),
    metadata: { nodeCount: nodes.length, edgeCount: edges.length, convertedAt: new Date().toISOString() }
  };
}

function mapType(t) {
  return { start: 'entry', end: 'exit', action: 'executor', condition: 'branch', switch: 'switch', subgraph: 'subgraph' }[t] || 'executor';
}

function inferTool(node) {
  if (node.type === 'start') return 'workflow.start';
  if (node.type === 'end') return 'workflow.end';
  if (node.type === 'condition') return 'workflow.condition';
  if (node.type === 'switch') return 'workflow.switch';
  return 'workflow.action';
}

// ═══════════════════════════════════════════════════════════════
// FILE FALLBACK
// ═══════════════════════════════════════════════════════════════

function loadGraphFromFile(graphName, options = {}) {
  // flowdesk.classify.pipeline → classify-pipeline.graph.json
  const parts = graphName.split('.');
  const filename = parts.slice(1).join('-') + '.graph.json';
  const filePath = path.join(CONFIG.fallbackDir, filename);

  // Also try: intake-dialog.graph.json for flowdesk.intake.enhanced
  const altFilename = parts[parts.length - 1] + '-dialog.graph.json';
  const altPath = path.join(CONFIG.fallbackDir, altFilename);

  for (const p of [filePath, altPath]) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        const nodes = raw.nodes || raw.definition?.nodes || [];
        const edges = raw.edges || raw.definition?.edges || [];
        const graph = { name: graphName, version: 'file', nodes, edges };
        const dag = options.convertToDag !== false ? convertGraphToDag(graph) : null;
        console.log(`${LOG_PREFIX} Loaded ${graphName} from file: ${path.basename(p)}`);
        return { success: true, source: 'file', graph, dag, metadata: { filePath: p } };
      } catch { /* skip */ }
    }
  }

  return { success: false, error: `File not found for ${graphName}`, source: 'file' };
}

// ═══════════════════════════════════════════════════════════════
// SUBGRAPH RESOLUTION
// ═══════════════════════════════════════════════════════════════

async function resolveSubgraphs(dag, options = {}) {
  const maxDepth = options.maxDepth || 5;
  const resolved = new Set();

  const resolvedNodes = await Promise.all(dag.nodes.map(async (node) => {
    if (node.type !== 'subgraph' || !node.config?.graphId) return node;
    if (resolved.has(node.config.graphId)) return node; // circular guard
    resolved.add(node.config.graphId);

    const sub = await loadGraph(node.config.graphId, { useCache: true });
    if (!sub.success) {
      console.warn(`${LOG_PREFIX} Failed to resolve subgraph: ${node.config.graphId}`);
      return node;
    }
    return { ...node, resolvedSubgraph: sub.dag, inputMapping: node.config.inputMapping || {}, outputMapping: node.config.outputMapping || {} };
  }));

  return { ...dag, nodes: resolvedNodes };
}

// ═══════════════════════════════════════════════════════════════
// CACHE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function invalidateCache(graphName) {
  if (graphName) {
    _cache.delete(graphName);
    console.log(`${LOG_PREFIX} Cache invalidated: ${graphName}`);
  } else {
    _cache.clear();
    console.log(`${LOG_PREFIX} Cache cleared`);
  }
}

function getCacheStats() {
  return { size: _cache.size, keys: [..._cache.keys()] };
}

module.exports = {
  loadGraph, loadGraphs, preloadGraphs,
  convertGraphToDag, resolveSubgraphs,
  loadGraphFromFile, invalidateCache, getCacheStats,
  CONFIG
};
