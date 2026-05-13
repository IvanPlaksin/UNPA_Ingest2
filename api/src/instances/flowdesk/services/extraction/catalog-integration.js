/**
 * FlowDesk Graph Catalog Integration
 *
 * Saves generated GXE graphs to Graph Catalog with versioning.
 *
 * @module services/workspace/extraction/flowdesk/catalog-integration
 */

'use strict';

const LOG_PREFIX = '[FlowDeskCatalog]';
const FLOWDESK_NAMESPACE = 'FLOWDESK';

let _catalogService = null;
function catalog() {
  if (!_catalogService) {
    const mod = require('../../../../services/graphCatalog.service');
    _catalogService = mod.graphCatalogService || mod;
  }
  return _catalogService;
}

const GRAPH_META = {
  'flowdesk.sla.decision':     { type: 'decision',  tags: ['sla', 'decision', 'auto-generated'] },
  'flowdesk.sla.escalation':   { type: 'workflow',  tags: ['sla', 'escalation', 'auto-generated'] },
  'flowdesk.classify.pipeline': { type: 'workflow', tags: ['classification', 'pipeline', 'auto-generated'] },
  'flowdesk.route.queue':      { type: 'decision',  tags: ['routing', 'queue', 'auto-generated'] },
  'flowdesk.route.approval':   { type: 'decision',  tags: ['routing', 'approval', 'auto-generated'] },
  'flowdesk.route.scope':      { type: 'decision',  tags: ['routing', 'scope', 'auto-generated'] },
  'flowdesk.intake.enhanced':  { type: 'dialog',    tags: ['dialog', 'intake', 'auto-generated'] }
};

/**
 * Save graph to catalog (create or version)
 */
async function saveGraphToCatalog(graph, options = {}) {
  const name = graph.name;
  const meta = GRAPH_META[name] || { type: 'workflow', tags: ['auto-generated'] };

  try {
    // Try to find existing
    let existing = null;
    try {
      const list = await catalog().listGraphs({ namespace: FLOWDESK_NAMESPACE, limit: 200 });
      existing = (list.items || list || []).find(g => g.name === name);
    } catch { /* not found */ }

    if (existing) {
      // Create new version
      console.log(`${LOG_PREFIX} Versioning ${name} (entry=${existing.id || existing.entryId})`);
      const entryId = existing.id || existing.entryId;
      const version = await catalog().createVersion(entryId, {
        nodes: graph.nodes,
        edges: graph.edges,
        changelog: options.changelog || 'Auto-regenerated from FlowDesk extraction'
      });
      return { action: 'versioned', entryId, graphName: name };
    } else {
      // Create new
      console.log(`${LOG_PREFIX} Creating ${name}`);
      const entry = await catalog().createGraph({
        name,
        description: graph.description,
        type: meta.type,
        namespace: FLOWDESK_NAMESPACE,
        tags: meta.tags,
        nodes: graph.nodes,
        edges: graph.edges,
        requiredParams: graph.requiredParams || []
      });
      return { action: 'created', entryId: entry.id || entry.entryId, graphName: name };
    }
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to save ${name}: ${error.message}`);
    return { action: 'error', graphName: name, error: error.message };
  }
}

/**
 * Save multiple graphs
 */
async function saveAllGraphsToCatalog(graphs, options = {}) {
  const graphList = Array.isArray(graphs) ? graphs : Object.values(graphs);
  const results = { success: [], errors: [], stats: { total: graphList.length, created: 0, versioned: 0, failed: 0 } };

  for (const graph of graphList) {
    const validation = validateGraph(graph);
    if (!validation.valid) {
      results.errors.push({ graphName: graph.name, error: validation.errors.join(', ') });
      results.stats.failed++;
      continue;
    }

    const r = await saveGraphToCatalog(graph, options);
    if (r.action === 'error') {
      results.errors.push(r);
      results.stats.failed++;
    } else {
      results.success.push(r);
      r.action === 'created' ? results.stats.created++ : results.stats.versioned++;
    }
  }

  console.log(`${LOG_PREFIX} Saved: ${results.stats.created} created, ${results.stats.versioned} versioned, ${results.stats.failed} failed`);
  return results;
}

/**
 * Validate graph before saving
 */
function validateGraph(graph) {
  const errors = [];
  if (!graph.name) errors.push('Missing name');
  if (!graph.nodes?.length) errors.push('No nodes');
  if (!graph.nodes?.some(n => n.type === 'start' || n.data?.tool === 'workflow.start')) errors.push('No start node');
  if (!graph.nodes?.some(n => n.type === 'end' || n.data?.tool === 'workflow.end')) errors.push('No end node');

  const nodeIds = new Set((graph.nodes || []).map(n => n.id));
  for (const e of (graph.edges || [])) {
    if (!nodeIds.has(e.source)) errors.push(`Edge source ${e.source} not found`);
    if (!nodeIds.has(e.target)) errors.push(`Edge target ${e.target} not found`);
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { saveGraphToCatalog, saveAllGraphsToCatalog, validateGraph, FLOWDESK_NAMESPACE, GRAPH_META };
