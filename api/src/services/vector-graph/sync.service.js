'use strict';

const { v4: uuidv4 } = require('uuid');

let _qdrant, _tei, _mg;
function qdrant() { if (!_qdrant) _qdrant = require('../qdrant.service'); return _qdrant; }
function tei()    { if (!_tei)    _tei    = require('../tei.service');    return _tei; }
function mg()     { if (!_mg)     _mg     = require('../memgraph.service'); return _mg; }

const LOG = '[VectorGraphSync]';

/**
 * Collection routing table — nodeLabel → collection name
 * P4-002 will create these collections; this service routes to them.
 */
const COLLECTIONS = {
  Document:       'doc_chunks',
  EntityMention:  'entities',
  ESEntity:       'canonical',
  // Workspace draft nodes → existing workspace collection (handled separately)
  DraftEntity:         'entities',
  DraftBusinessRule:   'entities',
  DraftWorkflow:       'entities',
  DraftConcept:        'entities',
};

// Fallback if nodeLabel not in routing table
const DEFAULT_COLLECTION = 'entities';

/**
 * VectorGraphSyncService
 *
 * Owns all vector ↔ graph operations:
 *   vectorize()      — embed a node and upsert to Qdrant, write back vectorId
 *   findSimilar()    — semantic search with optional graph node resolution
 *   getNodeVectors() — list Qdrant refs for a graph node
 *   getVectorNode()  — resolve graph node from a Qdrant point
 *   deleteNodeVectors() — cascade-delete vectors when node is removed
 */
class VectorGraphSyncService {

  /**
   * Embed a Memgraph node and upsert to Qdrant.
   * Idempotent — re-running with the same nodeId updates the vector.
   *
   * @param {string} nodeId
   * @param {string} nodeLabel
   * @param {Object} [opts]
   * @param {string} [opts.text]          - Override embedding text (default: fetched from graph)
   * @param {Object} [opts.extraPayload]  - Merge into Qdrant payload
   * @param {string} [opts.extractionJobId]
   * @param {string} [opts.methodologyId]
   * @param {string} [opts.collection]    - Override collection routing
   * @returns {Promise<{pointId, collection}>}
   */
  async vectorize(nodeId, nodeLabel, opts = {}) {
    const collection = opts.collection || COLLECTIONS[nodeLabel] || DEFAULT_COLLECTION;
    await this._ensureCollection(collection);

    // Fetch node data from Memgraph if text not provided
    let text = opts.text;
    let nodeData = {};
    if (!text) {
      nodeData = await this._fetchNode(nodeId, nodeLabel);
      text = _buildText(nodeData, nodeLabel);
    }

    // Embed
    const vector = await tei().getEmbedding(text);
    if (!vector) throw new Error(`TEI returned null embedding for nodeId=${nodeId}`);

    // Qdrant point — shared UUID: pointId === nodeId
    const pointId = nodeId;
    const payload = {
      graphNodeId:    nodeId,
      graphLabel:     nodeLabel,
      vectorType:     _labelToVectorType(nodeLabel),
      name:           nodeData.name || opts.extraPayload?.name || '',
      type:           nodeData.type || nodeData.nodeType || '',
      epistemicLayer: nodeData.epistemicLayer || null,
      documentId:     nodeData.documentId || null,
      extractionJobId: opts.extractionJobId || null,
      methodologyId:  opts.methodologyId || null,
      embeddingModel: 'MiniLM-L6-v2',
      indexedAt:      new Date().toISOString(),
      ...(opts.extraPayload || {}),
    };

    await qdrant().client.upsert(collection, {
      wait: true,
      points: [{ id: pointId, vector, payload }],
    });

    // Write vectorId back to Memgraph node
    await mg().runQuery(
      `MATCH (n {id: $id}) SET n.vectorId = $vId, n.vectorCollection = $col, n.vectorIndexedAt = $ts`,
      { id: nodeId, vId: pointId, col: collection, ts: new Date().toISOString() }
    ).catch(e => console.warn(`${LOG} vectorId patch failed: ${e.message}`));

    console.log(`${LOG} vectorize OK nodeId=${nodeId} label=${nodeLabel} collection=${collection}`);
    return { pointId, collection };
  }

  /**
   * Semantic search across one or more collections.
   *
   * @param {string} queryText
   * @param {Object} [opts]
   * @param {string[]} [opts.collections]   - Default: ['entities']
   * @param {number}   [opts.limit]         - Default: 10
   * @param {Object}   [opts.filter]        - Qdrant filter object
   * @param {boolean}  [opts.includeNodes]  - Fetch full node from Memgraph
   * @returns {Promise<Array<{point, node, score, collection}>>}
   */
  async findSimilar(queryText, opts = {}) {
    const collections = opts.collections || ['entities'];
    const limit = opts.limit || 10;

    const queryVector = await tei().getEmbedding(queryText);
    if (!queryVector) return [];

    const allResults = [];

    for (const col of collections) {
      try {
        await this._ensureCollection(col);
        const results = await qdrant().client.search(col, {
          vector: queryVector,
          limit,
          filter: opts.filter || undefined,
          with_payload: true,
        });
        for (const r of (results || [])) {
          allResults.push({ point: r, score: r.score, collection: col, node: null });
        }
      } catch (e) {
        console.warn(`${LOG} search failed in ${col}: ${e.message}`);
      }
    }

    // Sort by score desc
    allResults.sort((a, b) => b.score - a.score);
    const top = allResults.slice(0, limit);

    // Optionally resolve Memgraph nodes
    if (opts.includeNodes && top.length > 0) {
      const nodeIds = top.map(r => r.point?.payload?.graphNodeId).filter(Boolean);
      if (nodeIds.length > 0) {
        const nodeMap = await this._fetchNodesBatch(nodeIds);
        for (const r of top) {
          const gId = r.point?.payload?.graphNodeId;
          if (gId) r.node = nodeMap[gId] || null;
        }
      }
    }

    return top;
  }

  /**
   * Get Qdrant vector refs for a Memgraph node.
   * @returns {Promise<Array<{pointId, collection, indexedAt}>>}
   */
  async getNodeVectors(nodeId) {
    const rows = await mg().runQuery(
      `MATCH (n {id: $id})
       RETURN n.vectorId AS vectorId, n.vectorCollection AS collection,
              n.vectorIndexedAt AS indexedAt`,
      { id: nodeId }
    ).catch(() => []);
    if (!rows.length || !rows[0].vectorId) return [];
    return rows.map(r => ({
      pointId:    r.vectorId,
      collection: r.collection || DEFAULT_COLLECTION,
      indexedAt:  r.indexedAt  || null,
    }));
  }

  /**
   * Resolve a Memgraph node from a Qdrant point.
   * @returns {Promise<{point, node}|null>}
   */
  async getVectorNode(pointId, collection) {
    try {
      await this._ensureCollection(collection);
      const results = await qdrant().client.retrieve(collection, {
        ids: [pointId], with_payload: true,
      });
      const point = results?.[0] || null;
      if (!point) return null;

      const graphNodeId = point.payload?.graphNodeId || pointId;
      const node = await this._fetchNode(graphNodeId, point.payload?.graphLabel).catch(() => null);
      return { point, node };
    } catch (e) {
      console.warn(`${LOG} getVectorNode failed: ${e.message}`);
      return null;
    }
  }

  /**
   * Delete all vectors for a node from Qdrant and clear vectorId on node.
   */
  async deleteNodeVectors(nodeId) {
    const refs = await this.getNodeVectors(nodeId);
    for (const ref of refs) {
      try {
        await qdrant().client.delete(ref.collection, { points: [ref.pointId] });
      } catch (e) {
        console.warn(`${LOG} delete failed pointId=${ref.pointId}: ${e.message}`);
      }
    }
    await mg().runQuery(
      `MATCH (n {id: $id}) REMOVE n.vectorId, n.vectorCollection, n.vectorIndexedAt`,
      { id: nodeId }
    ).catch(() => {});
    return { nodeId, deleted: refs.length };
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  async _ensureCollection(name) {
    const { vectorGraphCollectionService } = require('./collections.service');
    await vectorGraphCollectionService.ensure(name);
  }

  async _fetchNode(nodeId, nodeLabel) {
    const rows = await mg().runQuery(
      `MATCH (n {id: $id}) RETURN n`,
      { id: nodeId }
    ).catch(() => []);
    if (!rows.length) return {};
    const node = rows[0].n || rows[0];
    return typeof node === 'object' && node !== null ? node : {};
  }

  async _fetchNodesBatch(nodeIds) {
    const rows = await mg().runQuery(
      `UNWIND $ids AS id MATCH (n {id: id}) RETURN n.id AS id, n`,
      { ids: nodeIds }
    ).catch(() => []);
    const map = {};
    for (const r of rows) {
      if (r.id) map[r.id] = r.n || r;
    }
    return map;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _buildText(node, label) {
  const parts = [node.name || ''];
  if (node.description || node.match)  parts.push(node.description || node.match);
  if (node.category)                   parts.push(`Category: ${node.category}`);
  if (node.epistemicLayer)             parts.push(`Layer: ${node.epistemicLayer}`);
  if (node.type || node.nodeType)      parts.push(`Type: ${node.type || node.nodeType}`);
  return parts.filter(Boolean).join('. ').substring(0, 1000);
}

function _labelToVectorType(label) {
  if (!label) return 'entity';
  const l = label.toLowerCase();
  if (l.includes('document'))  return 'document_chunk';
  if (l.includes('mention'))   return 'entity_mention';
  if (l.includes('esentity'))  return 'canonical_entity';
  if (l === 'esentity')        return 'canonical_entity';
  return 'entity';
}

const vectorGraphSyncService = new VectorGraphSyncService();
module.exports = { vectorGraphSyncService, VectorGraphSyncService, COLLECTIONS };
