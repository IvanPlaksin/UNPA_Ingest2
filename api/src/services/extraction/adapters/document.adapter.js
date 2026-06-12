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

  // Resolve methodology for this document (non-fatal — pipeline works without it)
  try {
    const { methodologyService } = require('../../extraction/methodology.service');
    const extractionDepth = ctx.options?.extractionDepth || 'STANDARD';
    const methodology = await methodologyService.getMethodologyForDocument({
      documentType:   ctx.documentType,
      epistemicLayer: ctx.epistemicLayer,
      extractionDepth,
    });
    if (methodology) {
      ctx.methodology   = methodology;
      ctx.methodologyId = methodology.id;
    }
  } catch (e) {
    // Methodology catalog not seeded yet or unavailable — continue without
  }

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
                     em.extractedByAI = $byAI, em.createdAt = $now,
                     em.extractionJobId = $jobId,
                     em.chunkIndex = $chunkIdx,
                     em.charOffsetStart = $charStart,
                     em.charOffsetEnd = $charEnd
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
        jobId:     ctx.extractionJobId || null,
        chunkIdx:  e.chunkIndex  ?? null,
        charStart: e.charOffsetStart ?? null,
        charEnd:   e.charOffsetEnd   ?? null,
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

  // Persist RELATED_TO edges between EntityMention nodes (from Phase 2 claude-code extraction)
  if (ctx.relations && ctx.relations.length > 0) {
    let relCount = 0;
    for (const rel of ctx.relations) {
      const src = ids.get(rel.sourceEntity);
      const tgt = ids.get(rel.targetEntity);
      if (!src || !tgt || src.nodeId === tgt.nodeId) continue;
      await mg().runQuery(
        `MATCH (a:EntityMention {id: $aId}), (b:EntityMention {id: $bId})
         MERGE (a)-[r:RELATED_TO {documentId: $docId, type: $relType}]->(b)
         ON CREATE SET r.context = $ctx, r.confidence = $conf, r.extractedAt = $now,
                       r.extractionJobId = $jobId
         ON MATCH  SET r.context = $ctx, r.confidence = $conf`,
        {
          aId: src.nodeId, bId: tgt.nodeId, docId: ctx.sourceId,
          relType: rel.relationType || 'RELATED_TO',
          ctx:  rel.context   || null,
          conf: rel.confidence ?? 0.8,
          now,
          jobId: ctx.extractionJobId || null,
        }
      ).catch(() => {});
      relCount++;
    }
    ctx.stats.relationsFound = relCount;
    const { addLog } = require('../pipeline-context');
    addLog(ctx, 'persist-graph', `Persisted ${relCount} RELATED_TO edges`);
  }
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
       extractionJobId: $jobId, methodologyId: $methodId,
       startedAt: $startedAt, completedAt: $now, durationMs: $dur,
       entitiesExtracted: $entities, relationsFound: $relations,
       vectorsIndexed: $vectors, gapsDetected: $gaps,
       kqsScore: $kqs,
       triangleGoverns: $tgov, triangleOperationalizes: $top, triangleRevealsGapIn: $trgi,
       errorCount: $errors, aiModel: $model, aiSummary: $summary
     })`,
    {
      id: resId, docId: ctx.sourceId,
      jobId: ctx.extractionJobId || null,
      methodId: ctx.methodologyId || null,
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
    const { knowledgeTriangleService } = require('../../knowledge/knowledge-triangle.service');
    const layer = ctx.sourceRef?.epistemicLayer || ctx.epistemicLayer;
    const result = { processesLinked: 0, edges: { governs: 0, operationalizes: 0, revealsGapIn: 0 } };
    if (!layer || ctx.entities.length === 0) return result;

    const entityNames = [...new Set(ctx.entities.map(e => e.name).filter(Boolean))];
    const matches = await mg().runQuery(
      `UNWIND $names AS n
       MATCH (kn:KnowledgeNode) WHERE toLower(kn.name) CONTAINS toLower(n)
       RETURN kn.id AS id LIMIT 20`,
      { names: entityNames.slice(0, 50) }
    ).catch(() => []);

    for (const m of matches) {
      const targetId = m.id;
      if (!targetId || targetId === ctx.sourceId) continue;
      try {
        if (['L0', 'L1', 'L2'].includes(layer)) {
          await knowledgeTriangleService.createGovernsEdge(ctx.sourceId, targetId).catch(() => {});
          result.edges.governs++;
        } else if (layer === 'L3') {
          await knowledgeTriangleService.createOperationalizesEdge(ctx.sourceId, targetId).catch(() => {});
          result.edges.operationalizes++;
        } else if (layer === 'L4') {
          await knowledgeTriangleService.createRevealsGapEdge(ctx.sourceId, targetId, {
            gapType: 'COMPLIANCE', severity: 'MEDIUM',
            title: `Gap detected from ${ctx.sourceRef?.originalname || ctx.sourceId}`
          }).catch(() => {});
          result.edges.revealsGapIn++;
        }
        result.processesLinked++;
      } catch { /* skip individual edge errors */ }
    }
    return result;
  } catch (err) {
    return { error: err.message };
  }
}
buildTriangleHook.hookName = 'buildTriangle';

async function calculateKQSHook(ctx) {
  try {
    const { kqsService } = require('../../knowledge/kqs.service');
    const entityIds = ctx.entities.map(e => e.id).filter(Boolean);
    if (entityIds.length > 0) {
      await kqsService.calculateKQSBatch(entityIds.slice(0, 50), { persist: true }).catch(() => {});
    }
    const docKqs = await kqsService.calculateKQSById(ctx.sourceId, { persist: true }).catch(() => null);
    return { score: docKqs?.kqs ?? null, entitiesScored: entityIds.length };
  } catch (err) {
    return { error: err.message };
  }
}
calculateKQSHook.hookName = 'calculateKQS';

async function detectGapsHook(ctx) {
  try {
    const { gapDetectionService } = require('../../knowledge/gap-detection.service');
    const stale = await gapDetectionService.findStaleGaps({ daysOld: 90, limit: 100 });
    return { count: Array.isArray(stale) ? stale.length : 0 };
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
