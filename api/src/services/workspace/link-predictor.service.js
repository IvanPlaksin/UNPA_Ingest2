/**
 * WorkSpace Link Predictor Service (WS3-007)
 *
 * Predicts likely links between draft entities in a workspace using the
 * external GNN service. Falls back gracefully:
 *   1. Try POST /api/v1/gnn/predict-links (preferred — model-based)
 *   2. Fallback: fetch embeddings via /api/v1/gnn/embed/text and compute
 *      cosine similarity pairwise locally
 *   3. Final fallback: return empty result with reason='unavailable'
 *
 * Output format:
 *   {
 *     predictions: [
 *       {
 *         source: { id, name, type },
 *         target: { id, name, type },
 *         probability: 0..1,
 *         suggestedType: string,    // inferred from node types
 *         method: 'gnn' | 'embedding-cosine'
 *       }
 *     ],
 *     stats: { method, totalPairs, passedThreshold, gnnAvailable }
 *   }
 *
 * @module services/workspace/link-predictor.service
 */

'use strict';

const LOG_PREFIX = '[LinkPredictor]';
const GNN_SERVICE_URL = process.env.GNN_SERVICE_URL || 'http://localhost:5000';
const GNN_TIMEOUT_MS = parseInt(process.env.GNN_TIMEOUT_MS, 10) || 5000;

let _draftService = null;
let _contradictionService = null;

function drafts() {
  if (!_draftService) _draftService = require('./draft.service');
  return _draftService;
}
function contradictions() {
  if (!_contradictionService) _contradictionService = require('./contradiction.service');
  return _contradictionService;
}

// Suggest a relation type based on the kinds of the two drafts.
function suggestRelationType(typeA, typeB) {
  if (!typeA || !typeB) return 'RELATES_TO';
  if (typeA === typeB) return 'SIMILAR_TO';

  const a = typeA.toLowerCase();
  const b = typeB.toLowerCase();

  // Heuristics
  if (a === 'entity' && b === 'business_rule') return 'GOVERNED_BY';
  if (a === 'business_rule' && b === 'entity') return 'GOVERNS';
  if (a === 'workflow'  && b === 'entity')     return 'OPERATES_ON';
  if (a === 'entity'    && b === 'workflow')   return 'PROCESSED_BY';
  if (a === 'schema'    && b === 'entity')     return 'DEFINES';
  if (a === 'entity'    && b === 'schema')     return 'DEFINED_BY';
  if (a === 'requirement' && b === 'entity')   return 'CONSTRAINS';
  if (a === 'concept'   && b === 'entity')     return 'CATEGORIZES';

  return 'RELATES_TO';
}

class LinkPredictorService {

  /**
   * Main entry — predict links for a workspace.
   *
   * @param {string} workspaceId
   * @param {Object} [options]
   * @param {number} [options.threshold=0.7]   Minimum probability to include
   * @param {number} [options.limit=20]        Max predictions to return
   * @param {boolean} [options.skipExisting=true] Filter out pairs with existing edge
   * @returns {Promise<Object>}
   */
  async predictLinks(workspaceId, options = {}) {
    const threshold = options.threshold ?? 0.7;
    const limit = options.limit ?? 20;
    const skipExisting = options.skipExisting !== false;

    if (!workspaceId) throw new Error('workspaceId is required');

    // 1. Fetch all drafts in workspace
    const allDrafts = await drafts().listWithSource(workspaceId);
    if (allDrafts.length < 2) {
      return {
        predictions: [],
        stats: { method: 'noop', totalPairs: 0, passedThreshold: 0, gnnAvailable: false }
      };
    }

    // 2. Build set of existing edges to filter out
    let existingPairs = new Set();
    if (skipExisting) {
      try {
        const draftSvc = drafts();
        for (const d of allDrafts) {
          const edges = await draftSvc.getEdges(workspaceId, d.id, { direction: 'both' }).catch(() => []);
          for (const e of (edges || [])) {
            const src = e.source || e.sourceId;
            const tgt = e.target || e.targetId;
            if (src && tgt) existingPairs.add(this._pairKey(src, tgt));
          }
        }
      } catch (err) {
        console.warn(`${LOG_PREFIX} edge prefetch failed: ${err.message}`);
      }
    }

    // 3. Try GNN service first (preferred), then fallback to embedding cosine
    const gnnAvailable = await this._isGNNAvailable();

    let result = null;
    if (gnnAvailable) {
      result = await this._predictViaGNN(workspaceId, allDrafts, threshold, limit, existingPairs);
      if (result) {
        return { ...result, stats: { ...result.stats, gnnAvailable: true } };
      }
      // GNN endpoint not available — fall back to embedding cosine
    }

    // 4. Fallback: pairwise embedding cosine
    result = await this._predictViaEmbeddingCosine(allDrafts, threshold, limit, existingPairs);
    return { ...result, stats: { ...result.stats, gnnAvailable } };
  }

  // ──────────────────────────────────────────────────────────────
  // GNN service path
  // ──────────────────────────────────────────────────────────────

  async _isGNNAvailable() {
    try {
      const res = await fetch(`${GNN_SERVICE_URL}/api/v1/gnn/model-status`, {
        signal: AbortSignal.timeout(GNN_TIMEOUT_MS)
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async _predictViaGNN(workspaceId, allDrafts, threshold, limit, existingPairs) {
    try {
      const res = await fetch(`${GNN_SERVICE_URL}/api/v1/gnn/predict-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          namespace: `workspace:${workspaceId}`,
          nodeIds: allDrafts.map(d => d.id),
          threshold,
          limit
        }),
        signal: AbortSignal.timeout(GNN_TIMEOUT_MS * 4)
      });

      if (!res.ok) {
        // 404 means endpoint not implemented — this is expected fallback path
        if (res.status === 404) return null;
        throw new Error(`GNN service responded ${res.status}`);
      }

      const data = await res.json();
      const rawPredictions = Array.isArray(data?.predictions) ? data.predictions : [];

      const draftMap = new Map(allDrafts.map(d => [d.id, d]));
      const predictions = rawPredictions
        .map(p => {
          const sId = p.sourceId || p.source;
          const tId = p.targetId || p.target;
          const src = draftMap.get(sId);
          const tgt = draftMap.get(tId);
          if (!src || !tgt) return null;
          if (existingPairs.has(this._pairKey(sId, tId))) return null;
          if (src.type !== tgt.type && false) return null; // allow cross-type
          return {
            source: { id: src.id, name: src.name, type: src.type },
            target: { id: tgt.id, name: tgt.name, type: tgt.type },
            probability: typeof p.score === 'number' ? p.score : (p.probability ?? 0),
            suggestedType: suggestRelationType(src.type, tgt.type),
            method: 'gnn'
          };
        })
        .filter(p => p && p.probability >= threshold)
        .sort((a, b) => b.probability - a.probability)
        .slice(0, limit);

      return {
        predictions,
        stats: {
          method: 'gnn',
          totalPairs: rawPredictions.length,
          passedThreshold: predictions.length
        }
      };
    } catch (err) {
      console.warn(`${LOG_PREFIX} GNN predict-links call failed: ${err.message}`);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Fallback: embedding cosine via GNN /embed/text
  // ──────────────────────────────────────────────────────────────

  async _predictViaEmbeddingCosine(allDrafts, threshold, limit, existingPairs) {
    // Try GNN /embed/text for each draft (batched would be ideal — but the
    // existing endpoint accepts one text per call). To keep cost bounded,
    // cap at 200 drafts.
    const candidates = allDrafts.slice(0, 200);
    const embeddings = new Map(); // id → vector

    let embeddingsAvailable = true;
    for (const d of candidates) {
      const text = `${d.name || ''} ${d.description || ''}`.trim();
      if (!text) continue;
      try {
        const res = await fetch(`${GNN_SERVICE_URL}/api/v1/gnn/embed/text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(GNN_TIMEOUT_MS)
        });
        if (!res.ok) { embeddingsAvailable = false; break; }
        const json = await res.json();
        const vec = json.embedding || json.vector;
        if (Array.isArray(vec)) embeddings.set(d.id, vec);
      } catch {
        embeddingsAvailable = false;
        break;
      }
    }

    if (!embeddingsAvailable || embeddings.size < 2) {
      return {
        predictions: [],
        stats: {
          method: 'unavailable',
          totalPairs: 0,
          passedThreshold: 0,
          reason: 'GNN service did not return embeddings'
        }
      };
    }

    // Pairwise cosine
    const { cosineSimilarity } = contradictions();
    const draftMap = new Map(allDrafts.map(d => [d.id, d]));
    const idsWithVecs = [...embeddings.keys()];
    const predictions = [];

    for (let i = 0; i < idsWithVecs.length; i++) {
      for (let j = i + 1; j < idsWithVecs.length; j++) {
        const aId = idsWithVecs[i];
        const bId = idsWithVecs[j];
        if (existingPairs.has(this._pairKey(aId, bId))) continue;

        const score = cosineSimilarity(embeddings.get(aId), embeddings.get(bId));
        if (score < threshold) continue;

        const src = draftMap.get(aId);
        const tgt = draftMap.get(bId);
        if (!src || !tgt) continue;
        // Skip same-source pairs (we predict CROSS-source links)
        if (src.sourceId && tgt.sourceId && src.sourceId === tgt.sourceId) continue;

        predictions.push({
          source: { id: src.id, name: src.name, type: src.type },
          target: { id: tgt.id, name: tgt.name, type: tgt.type },
          probability: Math.max(0, Math.min(1, score)),
          suggestedType: suggestRelationType(src.type, tgt.type),
          method: 'embedding-cosine'
        });
      }
    }

    predictions.sort((a, b) => b.probability - a.probability);
    const top = predictions.slice(0, limit);

    return {
      predictions: top,
      stats: {
        method: 'embedding-cosine',
        totalPairs: predictions.length,
        passedThreshold: top.length
      }
    };
  }

  // ──────────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────────

  _pairKey(a, b) {
    return [a, b].sort().join('|');
  }
}

const instance = new LinkPredictorService();

module.exports = instance;
module.exports.LinkPredictorService = LinkPredictorService;
module.exports.suggestRelationType = suggestRelationType;
