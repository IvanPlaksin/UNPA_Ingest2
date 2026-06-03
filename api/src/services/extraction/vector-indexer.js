'use strict';

/**
 * Vector Indexer
 *
 * Step 08 logic: embed persisted graph nodes via TEI, upsert to Qdrant,
 * then write vectorId back to Memgraph nodes.
 *
 * Collection strategy:
 *  - WORKSPACE mode → `workspace_{workspaceId}` (existing workspace collection)
 *  - DOCUMENT mode  → `documents_entities`       (shared collection, payload-indexed)
 */

const DOCS_COLLECTION = 'documents_entities';
const VECTOR_SIZE = 384; // MiniLM-L6-v2 default; TEI returns whatever the model produces

let _qdrant = null;
let _tei = null;
let _mg = null;

function qdrant() {
  if (!_qdrant) _qdrant = require('../qdrant.service');
  return _qdrant;
}
function tei() {
  if (!_tei) _tei = require('../tei.service');
  return _tei;
}
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

// ── KNOWLEDGE FAMILY MAP for EntityMention ──────────────────
const TYPE_TO_FAMILY = {
  BUSINESS_OBJECT: 'STRUCTURAL',
  ACTOR:           'STRUCTURAL',
  SYSTEM:          'STRUCTURAL',
  DOCUMENT:        'STRUCTURAL',
  LOCATION:        'CONTEXTUAL',
  EVENT:           'BEHAVIORAL',
  CONCEPT:         'SEMANTIC',
  PROCESS:         'BEHAVIORAL',
  POLICY:          'OPERATIONAL',
  REQUIREMENT:     'OPERATIONAL',
  DECISION:        'GOVERNANCE',
  ANOMALY:         'CONTEXTUAL',
};

// ── BUILD EMBEDDING TEXT ────────────────────────────────────

function buildEmbedText(node, label) {
  const parts = [node.name || ''];
  const c = node.content || {};

  switch (label) {
    case 'DraftBusinessRule':
      if (c.condition) parts.push(`Condition: ${c.condition}`);
      if (c.action)    parts.push(`Action: ${c.action}`);
      break;
    case 'DraftWorkflow':
      if (c.triggerEvent) parts.push(`Trigger: ${c.triggerEvent}`);
      if (c.states?.length) parts.push(`States: ${c.states.map(s => s.name).join(', ')}`);
      break;
    case 'DraftConcept':
      if (c.definition) parts.push(c.definition);
      if (c.relatedConcepts?.length) parts.push(`Related: ${c.relatedConcepts.join(', ')}`);
      break;
    case 'DraftAnomaly':
      if (c.description) parts.push(c.description);
      if (c.severity)    parts.push(`Severity: ${c.severity}`);
      break;
    default:
      if (node.description) parts.push(node.description);
      if (node.category)    parts.push(`Category: ${node.category}`);
      if (node.epistemicLayer) parts.push(`Layer: ${node.epistemicLayer}`);
  }

  return parts.filter(Boolean).join('. ').substring(0, 1000);
}

// ── ENSURE DOCUMENTS COLLECTION ────────────────────────────

async function ensureDocumentsCollection() {
  try {
    const q = qdrant();
    if (typeof q.client?.getCollection === 'function') {
      const exists = await q.client.getCollection(DOCS_COLLECTION).then(() => true).catch(() => false);
      if (!exists) {
        await q.client.createCollection(DOCS_COLLECTION, {
          vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
          optimizers_config: { default_segment_number: 2 },
        });
        // Payload indexes for filtering
        for (const field of ['documentId', 'type', 'epistemicLayer', 'memgraphNodeLabel', 'knowledgeFamily']) {
          await q.client.createPayloadIndex(DOCS_COLLECTION, {
            field_name: field, field_schema: 'keyword',
          }).catch(() => {});
        }
        console.log(`[VectorIndexer] Created collection '${DOCS_COLLECTION}'`);
      }
    }
  } catch (err) {
    console.warn(`[VectorIndexer] Could not ensure documents collection: ${err.message}`);
  }
}

// ── MAIN ENTRY POINT ────────────────────────────────────────

/**
 * Embed all persisted nodes and upsert to Qdrant.
 * Patches Memgraph nodes with vectorId on success.
 *
 * @param {import('./pipeline-context').PipelineContext} ctx
 * @returns {Promise<number>} count of vectors indexed
 */
async function embedAndIndex(ctx) {
  const { addLog } = require('./pipeline-context');

  if (ctx.persistedIds.size === 0) {
    addLog(ctx, 'embed-and-index', 'No persisted nodes to embed', 'warn');
    return 0;
  }

  // Check TEI availability
  try {
    await tei();
  } catch {
    addLog(ctx, 'embed-and-index', 'TEI service not available — skipping vector indexing', 'warn');
    return 0;
  }

  // Collect (nodeId, nodeLabel, entity) tuples from persistedIds
  const nodeTuples = [];
  for (const [, info] of ctx.persistedIds) {
    nodeTuples.push(info); // { nodeId, nodeLabel, name, entity }
  }

  // Build embedding texts
  const texts = nodeTuples.map(t => buildEmbedText(t.entity || t, t.nodeLabel));

  addLog(ctx, 'embed-and-index', `Embedding ${texts.length} nodes...`);

  let embeddings;
  try {
    embeddings = await tei().getEmbeddings(texts);
  } catch (err) {
    addLog(ctx, 'embed-and-index', `TEI getEmbeddings failed: ${err.message}`, 'error');
    return 0;
  }

  if (!embeddings || embeddings.length !== texts.length) {
    addLog(ctx, 'embed-and-index', 'Embedding count mismatch — skipping', 'warn');
    return 0;
  }

  // Build Qdrant points
  const points = nodeTuples.map((t, i) => ({
    id: t.nodeId,  // deterministic: same as Memgraph node ID (UUID)
    vector: embeddings[i],
    payload: buildPayload(t, ctx),
  }));

  // Upsert to Qdrant
  try {
    if (ctx.mode === 'WORKSPACE' && ctx.workspaceId) {
      await qdrant().workspaceUpsert(ctx.workspaceId, points);
    } else {
      await ensureDocumentsCollection();
      await qdrant().client.upsert(DOCS_COLLECTION, {
        wait: true,
        points: points.map(p => ({ id: p.id, vector: p.vector, payload: p.payload })),
      });
    }
    addLog(ctx, 'embed-and-index', `Upserted ${points.length} vectors to Qdrant`);
  } catch (err) {
    addLog(ctx, 'embed-and-index', `Qdrant upsert failed: ${err.message}`, 'error');
    return 0;
  }

  // Patch Memgraph nodes with vectorId
  const now = new Date().toISOString();
  const updates = points.map(p => ({ nodeId: p.id, vectorId: p.id }));
  try {
    await mg().runQuery(
      `UNWIND $updates AS u
       MATCH (n {id: u.nodeId})
       SET n.vectorId = u.vectorId, n.vectorIndexedAt = $now`,
      { updates, now }
    );
  } catch (err) {
    addLog(ctx, 'embed-and-index', `Memgraph vectorId patch failed: ${err.message}`, 'warn');
  }

  // Store in context for downstream use
  for (const p of points) {
    ctx.vectorIds.set(p.id, p.id);
  }

  return points.length;
}

function buildPayload(t, ctx) {
  const entity = t.entity || t;
  return {
    memgraphNodeId:    t.nodeId,
    memgraphNodeLabel: t.nodeLabel,
    mode:              ctx.mode,
    sourceId:          ctx.sourceId,
    workspaceId:       ctx.workspaceId || null,
    documentId:        ctx.mode === 'DOCUMENT' ? ctx.sourceId : null,
    name:              entity.name || '',
    type:              entity.type || '',
    knowledgeFamily:   entity.knowledgeFamily || TYPE_TO_FAMILY[entity.type] || 'SEMANTIC',
    status:            entity.status || null,
    epistemicLayer:    entity.epistemicLayer || null,
    confidence:        entity.confidence || null,
    indexedAt:         new Date().toISOString(),
  };
}

module.exports = { embedAndIndex, buildEmbedText, DOCS_COLLECTION };
