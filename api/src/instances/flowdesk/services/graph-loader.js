'use strict';

/**
 * Graph Loader — loads graphs from Memgraph via GraphCatalog.
 * Shared by dialog-session.js and workflow-runner.js.
 * Falls back to JSON files if graph not found in Memgraph.
 */

const fs = require('fs');
const path = require('path');
const { graphCatalogService } = require('../../../services/graphCatalog.service');

const GRAPHS_DIR = path.join(__dirname, 'graphs');
const cache = new Map();
const CACHE_TTL = 60000; // 1 minute

/**
 * Load a graph by ID. Tries Memgraph first, falls back to JSON file.
 *
 * @param {string} graphId - Graph ID (e.g., 'flowdesk.dialog.intake')
 * @returns {object} Graph definition with nodes, edges, metadata
 */
async function loadGraph(graphId) {
  // Check cache
  const cached = cache.get(graphId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.graph;
  }

  let graph = null;

  // Try Memgraph via GraphCatalog
  try {
    // Search by name pattern or tags containing the graphId
    const results = await graphCatalogService.listGraphs({
      namespace: 'FLOWDESK',
      search: graphId.includes('intake') ? 'Intake Dialog' : graphId.includes('it-hw-lap') ? 'Laptop Request' : graphId,
    });

    if (results.data && results.data.length > 0) {
      const entry = results.data[0];
      const full = await graphCatalogService.getGraphById(entry.entryId);

      if (full) {
        // Convert from GraphCatalog format to runtime format
        graph = {
          id: graphId,
          entryId: full.entryId,
          name: full.name,
          namespace: full.namespace,
          type: full.type,
          version: full.currentVersion,
          source: 'memgraph',
          nodes: (full.nodes || []).map(n => ({
            id: n.id,
            type: n.data?.type || n.type,
            executor: n.data?.executor || n.data?.label,
            prompt: n.data?.prompt,
            config: n.data?.config || {},
            transitions: n.data?.transitions,
          })),
          edges: (full.edges || []).map(e => ({
            from: e.source,
            to: e.target,
            condition: e.data?.condition || e.label || null,
          })),
          metadata: full.metadata || {},
        };
      }
    }
  } catch (err) {
    console.warn(`[GraphLoader] Memgraph load failed for ${graphId}: ${err.message}`);
  }

  // Fallback to JSON file
  if (!graph) {
    try {
      const files = fs.readdirSync(GRAPHS_DIR).filter(f => f.endsWith('.graph.json'));
      for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(GRAPHS_DIR, file), 'utf-8'));
        if (data.id === graphId) {
          graph = { ...data, source: 'file' };
          break;
        }
      }
    } catch (err) {
      console.warn(`[GraphLoader] File fallback failed for ${graphId}: ${err.message}`);
    }
  }

  if (!graph) {
    throw new Error(`Graph not found: ${graphId}`);
  }

  cache.set(graphId, { graph, ts: Date.now() });
  console.log(`[GraphLoader] Loaded ${graphId} from ${graph.source} (v${graph.version || '?'})`);
  return graph;
}

/**
 * Invalidate cache for a graph (call after updates via GXE).
 */
function invalidateCache(graphId) {
  if (graphId) {
    cache.delete(graphId);
  } else {
    cache.clear();
  }
}

module.exports = { loadGraph, invalidateCache };
