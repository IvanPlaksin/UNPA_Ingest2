/**
 * Similarity Scorer Service
 *
 * Computes similarity between Draft objects and KB entities.
 * Hybrid approach: semantic (embedding) + structural (name, type, attributes).
 *
 * @module services/workspace/promotion/similarity-scorer
 */

'use strict';

const LOG_PREFIX = '[SimilarityScorer]';

let _qdrant = null, _memgraph = null, _tei = null;
function qdrant() { if (!_qdrant) _qdrant = require('../../qdrant.service'); return _qdrant; }
function mg() { if (!_memgraph) _memgraph = require('../../memgraph.service'); return _memgraph; }
function tei() { if (!_tei) _tei = require('../../tei.service'); return _tei; }

const CONFIG = {
  weights: { semantic: 0.50, nameSimilarity: 0.25, typeSimilarity: 0.15, attributeOverlap: 0.10 },
  semanticTopK: 20,
  nameSearchLimit: 10,
  collectionMap: {
    CORE: 'core_knowledge', PROJECT: 'project', FLOWDESK: 'flowdesk_knowledge', META: 'meta_knowledge'
  }
};

const TYPE_MAP = {
  entity: 'Entity', business_rule: 'BusinessRule', workflow: 'Workflow',
  calculation: 'Calculation', concept: 'Concept', relationship: 'Relationship',
  policy: 'Policy', requirement: 'Requirement', anomaly: 'Anomaly',
  schema: 'Schema', api_contract: 'APIContract'
};

/**
 * Find similar KB entities for a draft
 */
async function findSimilarKBEntities(draft, options = {}) {
  const { namespace = 'CORE', limit = 10 } = options;

  try {
    // Semantic search
    let semanticMatches = [];
    try {
      const draftText = generateDraftText(draft);
      const embedding = await tei().getEmbedding(draftText);
      if (embedding) {
        const collection = CONFIG.collectionMap[namespace] || 'core_knowledge';

        // Skip silently if the target Qdrant collection doesn't exist yet
        // (e.g. brand-new install with no global KB indexed). Avoid noisy
        // 404 warnings on every promotion diff call.
        let collectionExists = false;
        try {
          const list = await qdrant().client.getCollections();
          collectionExists = (list?.collections || []).some(c => c.name === collection);
        } catch { /* probe failure → fall through to attempt + catch */ }

        if (collectionExists) {
          const results = await qdrant().client.search(collection, {
            vector: embedding, limit: CONFIG.semanticTopK,
            with_payload: true, score_threshold: 0.3
          });
          semanticMatches = (results || []).map(r => ({
            kbId: r.payload?.entityId || String(r.id),
            name: r.payload?.name, type: r.payload?.type,
            semanticScore: r.score, source: 'semantic'
          }));
        }
      }
    } catch (err) {
      // 404 on missing collection is expected for fresh installs — log at debug level only
      if (err.status !== 404 && !/not found/i.test(err.message)) {
        console.warn(`${LOG_PREFIX} Semantic search failed: ${err.message}`);
      }
    }

    // Name-based search
    let nameMatches = [];
    try {
      const nameFragment = (draft.name || '').toLowerCase().split(/\s+/)[0];
      if (nameFragment.length >= 3) {
        // Memgraph rejects parameterized LIMIT — interpolate the literal int.
        const safeLimit = parseInt(CONFIG.nameSearchLimit, 10) || 10;
        const results = await mg().runQuery(
          `MATCH (n) WHERE n.namespace = $ns AND toLower(n.name) CONTAINS $frag RETURN n LIMIT ${safeLimit}`,
          { ns: namespace.toLowerCase(), frag: nameFragment }
        );
        nameMatches = results.map(r => {
          const props = r.n?.properties || r.n;
          return {
            kbId: props.id || props.entityId, name: props.name, type: props.type,
            entity: props, nameScore: calculateNameSimilarity(draft.name, props.name),
            source: 'name'
          };
        });
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} Name search failed: ${err.message}`);
    }

    // Merge
    const merged = new Map();
    for (const m of semanticMatches) merged.set(m.kbId, { ...m, nameScore: 0 });
    for (const m of nameMatches) {
      if (merged.has(m.kbId)) { merged.get(m.kbId).nameScore = m.nameScore; merged.get(m.kbId).entity = m.entity; }
      else merged.set(m.kbId, { ...m, semanticScore: 0 });
    }

    // Score
    const scored = [];
    for (const match of merged.values()) {
      if (!match.entity) {
        try {
          const r = await mg().runQuery('MATCH (n {id: $id}) RETURN n', { id: match.kbId });
          if (r.length > 0) match.entity = r[0].n?.properties || r[0].n;
        } catch { /* skip */ }
      }
      if (!match.entity) continue;

      const semantic = match.semanticScore || 0;
      const name = match.nameScore || calculateNameSimilarity(draft.name, match.entity.name);
      const type = calculateTypeSimilarity(draft.type, match.entity.type);
      const attr = calculateAttributeOverlap(draft.content, match.entity.content || match.entity);

      const score = CONFIG.weights.semantic * semantic + CONFIG.weights.nameSimilarity * name
        + CONFIG.weights.typeSimilarity * type + CONFIG.weights.attributeOverlap * attr;

      scored.push({
        kbId: match.kbId, entity: match.entity, score: Math.min(score, 1.0),
        components: { semantic, name, type, attributes: attr }
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error: ${error.message}`);
    return [];
  }
}

function calculateNameSimilarity(n1, n2) {
  if (!n1 || !n2) return 0;
  const s1 = n1.toLowerCase().trim(), s2 = n2.toLowerCase().trim();
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.8;
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  const matrix = [];
  for (let i = 0; i <= shorter.length; i++) { matrix[i] = [i]; }
  for (let j = 0; j <= longer.length; j++) { matrix[0][j] = j; }
  for (let i = 1; i <= shorter.length; i++)
    for (let j = 1; j <= longer.length; j++)
      matrix[i][j] = shorter[i-1] === longer[j-1] ? matrix[i-1][j-1] : 1 + Math.min(matrix[i-1][j-1], matrix[i][j-1], matrix[i-1][j]);
  return Math.max(0, 1 - matrix[shorter.length][longer.length] / longer.length);
}

function calculateTypeSimilarity(draftType, kbType) {
  const mapped = TYPE_MAP[draftType] || draftType;
  if (!mapped || !kbType) return 0;
  if (mapped.toLowerCase() === kbType.toLowerCase()) return 1.0;
  const groups = { structural: ['Entity','Schema','APIContract'], behavioral: ['BusinessRule','Workflow','Calculation'], semantic: ['Concept','Relationship'] };
  for (const g of Object.values(groups)) if (g.includes(mapped) && g.includes(kbType)) return 0.5;
  return 0;
}

function calculateAttributeOverlap(c1, c2) {
  if (!c1 || !c2) return 0;
  const k1 = new Set(Object.keys(c1).filter(k => !k.startsWith('_')));
  const k2 = new Set(Object.keys(c2).filter(k => !k.startsWith('_')));
  if (!k1.size || !k2.size) return 0;
  const inter = [...k1].filter(k => k2.has(k)).length;
  return inter / new Set([...k1, ...k2]).size;
}

function generateDraftText(draft) {
  const parts = [draft.name || '', draft.description || '', draft.type || ''];
  if (draft.content && typeof draft.content === 'object') {
    for (const [k, v] of Object.entries(draft.content)) {
      if (typeof v === 'string') parts.push(`${k}: ${v}`);
      else if (Array.isArray(v)) parts.push(`${k}: ${v.join(', ')}`);
    }
  }
  return parts.filter(Boolean).join(' ').slice(0, 2000);
}

module.exports = {
  findSimilarKBEntities, calculateNameSimilarity, calculateTypeSimilarity,
  calculateAttributeOverlap, generateDraftText, TYPE_MAP, CONFIG
};
