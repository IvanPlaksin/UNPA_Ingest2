'use strict';

/**
 * Document Adapter
 *
 * Plugs Documents-specific logic into the unified extraction pipeline:
 *   - loadSource: read Document node + extract text from storagePath
 *   - persistGraph: create EntityMention nodes via MERGE
 *   - storeResult: write ExtractionResult + update Document.status
 *   - postProcessHooks: Knowledge Triangle, KQS, gap detection
 *
 * aiProvider = 'claude-code' → Claude Code CLI subprocess
 * allowRegexFallback = true
 */

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../../memgraph.service');
  return _mg;
}

// ── LOAD SOURCE ─────────────────────────────────────────────

async function loadSource(ctx) {
  const { documentExtractionService: docSvc } = require('../../knowledge/document-extraction.service');

  const doc = await docSvc._loadDoc(ctx.sourceId);
  if (!doc) throw new Error(`Document not found: ${ctx.sourceId}`);

  ctx.sourceRef = doc;
  ctx.documentType   = doc.documentType   || 'UNKNOWN';
  ctx.epistemicLayer = doc.epistemicLayer  || null;
  ctx.domain         = null;

  // Extract text using doc.storagePath + doc.originalname
  const text = await docSvc._readText(doc.storagePath, doc.originalname);
  ctx.text = text || '';
}

// ── PERSIST GRAPH ───────────────────────────────────────────

async function persistGraph(ctx) {
  const now = new Date().toISOString();
  const ids = new Map();

  const batch = ctx.entities.slice(0, 200);
  for (const e of batch) {
    const id = e.id || uuidv4();
    await mg().runQuery(
      `MATCH (d:Document {id: $docId})
       MERGE (em:EntityMention {type: $type, name: $name, documentId: $docId})
       ON CREATE SET em.id = $id, em.match = $match,
                     em.category = $cat, em.epistemicLayer = $layer,
                     em.relevance = $relevance, em.confidence = $conf,
                     em.extractedByAI = $byAI, em.createdAt = $now
       ON MATCH  SET em.match = $match, em.category = $cat,
                     em.relevance = $relevance, em.confidence = $conf
       MERGE (d)-[:MENTIONS]->(em)`,
      {
        docId: ctx.sourceId,
        id, type: e.type, name: e.name,
        match: e.description || e.match || '',
        cat: e.category || null,
        layer: e.epistemicLayer || ctx.epistemicLayer || null,
        relevance: e.relevance || 'MEDIUM',
        conf: e.confidence || 0.8,
        byAI: e.extractedByAI !== false,
        now,
      }
    ).catch(() => {});

    // Resolve real ID from Memgraph (id may differ from e.id on MERGE)
    const row = await mg().runQuery(
      `MATCH (em:EntityMention {type: $type, name: $name, documentId: $docId}) RETURN em.id AS id`,
      { type: e.type, name: e.name, docId: ctx.sourceId }
    ).catch(() => []);
    const realId = row[0]?.id || id;

    ids.set(e.name, { nodeId: realId, nodeLabel: 'EntityMention', entity: e });
  }

  ctx.persistedIds = ids;
}

// ── STORE RESULT ────────────────────────────────────────────

async function storeResult(ctx) {
  const now = new Date().toISOString();
  const resId = uuidv4();
  const pp = ctx.postProcessResults;
  const triangleEdges = pp?.buildTriangle?.edges || {};
  const kqsScore = pp?.calculateKQS?.score ?? null;
  const gapsDetected = pp?.detectGaps?.count ?? 0;

  // Create ExtractionResult node
  await mg().runQuery(
    `CREATE (r:ExtractionResult {
       id: $id, documentId: $docId, mode: 'DOCUMENT', pipelineVersion: 'unified-v1',
       startedAt: $startedAt, completedAt: $now, durationMs: $dur,
       entitiesExtracted: $entities, relationsFound: $relations,
       vectorsIndexed: $vectors, gapsDetected: $gaps,
       kqsScore: $kqs,
       triangleGoverns: $tgov, triangleOperationalizes: $top, triangleRevealsGapIn: $trgi,
       errorCount: $errors, aiModel: $model, aiSummary: $summary
     })`,
    {
      id: resId, docId: ctx.sourceId,
      startedAt: ctx.startedAt, now, dur: ctx.stats.durationMs,
      entities: ctx.stats.entitiesExtracted, relations: ctx.stats.relationsFound,
      vectors: ctx.stats.vectorsIndexed, gaps: gapsDetected, kqs: kqsScore,
      tgov: triangleEdges.governs || 0, top: triangleEdges.operationalizes || 0,
      trgi: triangleEdges.revealsGapIn || 0,
      errors: ctx.stats.errors.length,
      model: ctx.entities[0]?._aiModel || null,
      summary: ctx.entities[0]?._aiSummary || null,
    }
  );

  // Link to document
  const extractedIds = [...ctx.persistedIds.values()].map(v => v.nodeId);
  await mg().runQuery(
    `MATCH (d:Document {id: $docId}), (r:ExtractionResult {id: $resId})
     CREATE (d)-[:HAS_EXTRACTION_RESULT]->(r)`,
    { docId: ctx.sourceId, resId }
  );

  // Update document status
  await mg().runQuery(
    `MATCH (d:Document {id: $docId})
     SET d.status = $status, d.extractedAt = $now,
         d.kqsScore = $kqs, d.extractedNodeIds = $ids`,
    {
      docId: ctx.sourceId, now,
      status: ctx.stats.errors.some(e => e.step === 'extract-entities') ? 'FAILED' : 'COMPLETED',
      kqs: kqsScore, ids: JSON.stringify(extractedIds),
    }
  );

  ctx.resultId = resId;
}

// ── POST-PROCESS HOOKS ──────────────────────────────────────

async function buildTriangleHook(ctx) {
  try {
    const triangleSvc = require('../../knowledge/knowledge-triangle.service');
    const result = await triangleSvc.buildTriangleEdges(ctx.sourceId, ctx.entities, ctx.sourceRef);
    return result || {};
  } catch (err) {
    return { error: err.message };
  }
}
buildTriangleHook.hookName = 'buildTriangle';

async function calculateKQSHook(ctx) {
  try {
    const kqsSvc = require('../../knowledge/kqs.service');
    const result = await kqsSvc.calculateForDocument(ctx.sourceId, ctx.entities);
    return result || {};
  } catch (err) {
    return { error: err.message };
  }
}
calculateKQSHook.hookName = 'calculateKQS';

async function detectGapsHook(ctx) {
  try {
    const gapSvc = require('../../knowledge/gap-detection.service');
    const result = await gapSvc.detectStaleGaps(ctx.sourceId);
    return result || {};
  } catch (err) {
    return { error: err.message };
  }
}
detectGapsHook.hookName = 'detectGaps';

// ── ADAPTER EXPORT ──────────────────────────────────────────

module.exports = {
  name: 'document',
  mode: 'DOCUMENT',
  aiProvider: 'claude-code',
  allowRegexFallback: true,
  loadSource,
  persistGraph,
  storeResult,
  postProcessHooks: [buildTriangleHook, calculateKQSHook, detectGapsHook],
};
