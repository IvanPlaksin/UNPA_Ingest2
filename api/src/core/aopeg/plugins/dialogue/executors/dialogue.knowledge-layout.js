'use strict';

const http  = require('http');
const https = require('https');
const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

const GNN_BASE = process.env.GNN_SERVICE_URL || 'http://localhost:5001';

function _httpPost(url, bodyObj, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(bodyObj);
    const parsed  = new URL(url);
    const mod     = parsed.protocol === 'https:' ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port:     parseInt(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + (parsed.search || ''),
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) },
      timeout:  timeoutMs,
    }, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`GNN service returned ${res.statusCode}: ${raw.slice(0, 200)}`));
        }
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error(`Invalid JSON from GNN service`)); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('GNN service request timed out')); });
    req.write(bodyStr);
    req.end();
  });
}

/**
 * dialogue.knowledge-layout
 *
 * Fetches all entity vectors from knowledge_entities Qdrant collection,
 * sends them to gnn-service UMAP endpoint, and writes xyz+cluster back.
 *
 * Designed to run after batch entity upserts or on manual trigger.
 * Idempotent — safe to re-run; only updates coordinates.
 */
const dialogueKnowledgeLayoutExecutor = createSimpleExecutor({
  type: 'dialogue.knowledge-layout',
  displayName: 'Knowledge Map Layout (UMAP)',
  description: 'Compute 3D UMAP layout for all knowledge entities and store xyz coordinates.',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      nNeighbors:     { type: 'integer', description: 'UMAP n_neighbors (default 15)' },
      minDist:        { type: 'number',  description: 'UMAP min_dist (default 0.1)' },
      minClusterSize: { type: 'integer', description: 'HDBSCAN min_cluster_size (default 3)' },
    },
  },

  async execute(params) {
    const { nNeighbors = 15, minDist = 0.1, minClusterSize = 3 } = params;
    const { knowledgeQdrant } = require('../services/dialogue.knowledge-qdrant');

    // 1. Fetch all entity vectors from Qdrant
    const entities = await knowledgeQdrant.getAllWithVectors({ limit: 5000 });
    if (entities.length === 0) {
      return createSuccessResult({ message: 'No entities to layout', count: 0 });
    }
    // Filter entities that actually have a vector
    const withVectors = entities.filter(e => e.vector && e.vector.length > 0);
    if (withVectors.length < 2) {
      return createSuccessResult({ message: 'Not enough entities for layout', count: withVectors.length });
    }

    console.log(`[KnowledgeLayout] Running UMAP on ${withVectors.length} entities…`);

    // 2. Call gnn-service UMAP endpoint
    let layout;
    try {
      const bodyObj = {
        entities: withVectors.map(e => ({
          entity_id: e.id,
          vector:    e.vector,
          name:      e.payload?.name,
          type:      e.payload?.type,
        })),
        n_neighbors:     nNeighbors,
        min_dist:        minDist,
        min_cluster_size: minClusterSize,
      };
      const data = await _httpPost(`${GNN_BASE}/api/v1/knowledge-map/layout`, bodyObj, 120000);
      layout = data.layout;
      console.log(`[KnowledgeLayout] UMAP complete: ${data.entity_count} entities, ${data.cluster_count} clusters`);
    } catch (err) {
      return createErrorResult('LAYOUT_FAILED', `UMAP service error: ${err.message}`);
    }

    // 3. Write xyz + cluster back to Qdrant
    await knowledgeQdrant.updateLayout(
      layout.map(p => ({ id: p.entity_id, x: p.x, y: p.y, z: p.z, cluster: p.cluster }))
    );

    // 4. Store cluster summary in Memgraph for fast retrieval
    try {
      const mg = require('../../../../../services/memgraph.service');
      const clusterMap = {};
      layout.forEach(p => {
        if (p.cluster >= 0) {
          if (!clusterMap[p.cluster]) clusterMap[p.cluster] = [];
          clusterMap[p.cluster].push(p.entity_id);
        }
      });
      for (const [clusterId, ids] of Object.entries(clusterMap)) {
        await mg.runQuery(
          `MERGE (c:KnowledgeCluster {clusterId: $cid})
           SET c.entityCount = $count, c.updatedAt = $now`,
          { cid: parseInt(clusterId), count: ids.length, now: new Date().toISOString() }
        );
      }
    } catch { /* non-fatal */ }

    return createSuccessResult({
      message:  `Layout computed for ${layout.length} entities`,
      count:    layout.length,
      clusters: [...new Set(layout.map(p => p.cluster))].filter(c => c >= 0).length,
    });
  },
});

module.exports = { dialogueKnowledgeLayoutExecutor };
