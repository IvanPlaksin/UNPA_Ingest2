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
 * allowRegexFallback = false
 */

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../../memgraph.service');
  return _mg;
}

// ── LOAD SOURCE ─────────────────────────────────────────────

async function loadSource(ctx) {
  const { addLog } = require('../pipeline-context');
  const { documentExtractionService: docSvc } = require('../../knowledge/document-extraction.service');

  addLog(ctx, 'load-source', `Querying Memgraph: Document id=${ctx.sourceId}`);
  const doc = await docSvc._loadDoc(ctx.sourceId);
  if (!doc) {
    addLog(ctx, 'load-source',
      `Document not found in Memgraph: id=${ctx.sourceId} — node may have been deleted`, 'error');
    throw new Error(`Document not found: ${ctx.sourceId}`);
  }

  const docLabel = doc.originalname || doc.documentTitle || doc.unSymbol || doc.id;
  addLog(ctx, 'load-source', `Found: "${docLabel}" | type=${doc.documentType || 'UNKNOWN'} | layer=${doc.epistemicLayer || 'null'} | status=${doc.status || 'null'}`);
  addLog(ctx, 'load-source', `storagePath: ${doc.storagePath || '(none)'}`);

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
      addLog(ctx, 'load-source', `Methodology: ${methodology.id} (${methodology.name || methodology.id})`);
    }
  } catch (e) {
    // Methodology catalog not seeded yet or unavailable — continue without
  }

  // Extract text using doc.storagePath + doc.originalname
  if (!doc.storagePath) {
    addLog(ctx, 'load-source',
      `Document "${docLabel}" has no storagePath — upload may be incomplete or file missing`, 'error');
    throw new Error(`Document "${docLabel}" (${ctx.sourceId}) has no storagePath — file not uploaded or missing`);
  }

  addLog(ctx, 'load-source', `Reading file: ${doc.storagePath} (${doc.originalname || 'unknown filename'})`);
  const rawText = await docSvc._readText(doc.storagePath, doc.originalname);
  // OCR for scanned PDFs is handled by the dedicated 'ocr-scan' pipeline step (01b-ocr-scan.step.js)
  ctx.text = rawText || '';
  if (!ctx.text.trim()) {
    addLog(ctx, 'load-source', `WARNING: file read returned empty text — file may be empty or unreadable`, 'warn');
  }
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

  // Extract per-step durations for efficiency tracking
  function _stepMs(name) {
    const s = (ctx.steps || []).find(st => st.name === name);
    return s?.duration ?? null;
  }
  const stepLoadMs      = _stepMs('load-source');
  const stepChunkMs     = _stepMs('chunk-text');
  const stepEntitiesMs  = _stepMs('extract-entities');
  const stepRelationsMs = _stepMs('extract-relations');
  const stepEmbedMs     = _stepMs('embed-and-index');
  const stepGraphMs     = _stepMs('persist-graph');

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
       errorCount: $errors, aiModel: $model, aiSummary: $summary,
       stepLoadMs: $stepLoad, stepChunkMs: $stepChunk,
       stepEntitiesMs: $stepEntities, stepRelationsMs: $stepRelations,
       stepEmbedMs: $stepEmbed, stepGraphMs: $stepGraph
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
      stepLoad: stepLoadMs, stepChunk: stepChunkMs,
      stepEntities: stepEntitiesMs, stepRelations: stepRelationsMs,
      stepEmbed: stepEmbedMs, stepGraph: stepGraphMs,
    }
  );

  // Link to document
  const extractedIds = [...ctx.persistedIds.values()].map(v => v.nodeId);
  await mg().runQuery(
    `MATCH (d:Document {id: $docId}), (r:ExtractionResult {id: $resId})
     CREATE (d)-[:HAS_EXTRACTION_RESULT]->(r)`,
    { docId: ctx.sourceId, resId }
  );

  // Update document status; set uploadedAt if missing so the doc appears in /documents list
  const finalStatus = ctx.stats.errors.some(e => e.step === 'extract-entities') ? 'FAILED' : 'COMPLETED';
  await mg().runQuery(
    `MATCH (d:Document {id: $docId})
     SET d.status = $status, d.extractedAt = $now, d.aiExtractedAt = $now,
         d.kqsScore = $kqs, d.extractedNodeIds = $ids,
         d.uploadedAt = coalesce(d.uploadedAt, $now)`,
    {
      docId: ctx.sourceId, now,
      status: finalStatus,
      kqs: kqsScore, ids: JSON.stringify(extractedIds),
    }
  );
  console.log(`[TEST-LOG][storeResult] Document ${ctx.sourceId} → status=${finalStatus} entities=${ctx.stats.entitiesExtracted} vectors=${ctx.stats.vectorsIndexed} kqs=${kqsScore} dur=${ctx.stats.durationMs}ms`);

  ctx.resultId = resId;

  // Persist temporal data extracted by step 05b (non-fatal)
  await _persistTemporalData(ctx, now).catch(e =>
    console.warn(`[DocumentAdapter] Temporal persist failed (non-fatal): ${e.message}`)
  );

  // Auto-import EntityMentions → Entity Store (non-fatal)
  try {
    const { entityStoreService } = require('../../knowledge/entity-store.service');
    const importResult = await entityStoreService.importFromDocument(ctx.sourceId, { namespace: 'DEFAULT' });
    const { addLog } = require('../pipeline-context');
    addLog(ctx, 'store-result', `Entity Store import: +${importResult.created} created, ${importResult.linked} linked, ${importResult.skipped} skipped`);
  } catch (importErr) {
    // Non-fatal — entities still in EntityMention nodes, user can import manually
  }
}

// ── TEMPORAL DATA PERSISTENCE ───────────────────────────────

/**
 * Persist temporal dates and supersession links extracted by step 05b.
 *
 * 1. Updates Document node with extracted date fields
 * 2. Creates SUPERSEDES/AMENDS/EXTENDS/etc. edges between Document nodes
 * 3. Attempts to also create ESEntity-level supersession via supersessionService
 */
async function _persistTemporalData(ctx, now) {
  const temporal     = ctx.temporalData      || {};
  const superLinks   = ctx.supersessionLinks || [];
  const documentDates = temporal.documentDates || [];
  const mandatePeriod = temporal.mandatePeriod || null;

  if (documentDates.length === 0 && superLinks.length === 0 && !mandatePeriod) return;

  const { addLog } = require('../pipeline-context');

  // ── 1. Build date fields for Document node ────────────────────────────────
  const dateFieldMap = {
    ADOPTION_DATE:        'adoptionDate',
    ENTRY_INTO_FORCE:     'entryIntoForceDate',
    OPERATIONAL_DATE:     'operationalDate',
    EXPIRY_DATE:          'expiryDate',
    MANDATE_END:          'mandateEndDate',
    MANDATE_START:        'mandateStartDate',
    EXTENSION_DATE:       'extensionDate',
    TERMINATION_DATE:     'terminationDate',
    REVIEW_DATE:          'reviewDate',
    REPORTING_DATE:       'reportingDate',
    IMPLEMENTATION_DEADLINE: 'implementationDeadline',
    SIGNATURE_DATE:       'signatureDate',
    RATIFICATION_DEADLINE:'ratificationDeadline',
    REPORTING_PERIOD_START: 'reportingPeriodStart',
    REPORTING_PERIOD_END:   'reportingPeriodEnd',
  };

  // Collect the highest-confidence value per date field
  const dateFields = {};
  for (const entry of documentDates) {
    if (!entry.dateType || !entry.dateValue) continue;
    const field = dateFieldMap[entry.dateType];
    if (!field) continue;
    const existing = dateFields[field];
    if (!existing || (entry.confidence || 0) > (existing.confidence || 0)) {
      dateFields[field] = { value: entry.dateValue, confidence: entry.confidence || 0.8 };
    }
  }

  // Override with mandatePeriod if available
  if (mandatePeriod?.startDate) dateFields.mandateStartDate = { value: mandatePeriod.startDate, confidence: 0.9 };
  if (mandatePeriod?.endDate)   dateFields.mandateEndDate   = { value: mandatePeriod.endDate,   confidence: 0.9 };

  // Persist to Document node
  const setClause = Object.keys(dateFields)
    .map(f => `d.${f} = $${f}`)
    .join(', ');
  const params = { docId: ctx.sourceId };
  for (const [f, { value }] of Object.entries(dateFields)) {
    params[f] = value;
  }

  if (setClause) {
    await mg().runQuery(
      `MATCH (d:Document {id: $docId}) SET ${setClause},
       d.temporalExtractedAt = $now,
       d.temporalDatesJson = $datesJson,
       d.mandatePeriodJson = $mandateJson`,
      {
        ...params,
        now,
        datesJson:  JSON.stringify(documentDates),
        mandateJson: mandatePeriod ? JSON.stringify(mandatePeriod) : null,
      }
    ).catch(e => addLog(ctx, 'store-result', `Temporal date fields persist failed: ${e.message}`, 'warn'));

    addLog(ctx, 'store-result',
      `Temporal: set ${Object.keys(dateFields).join(', ')} on Document ${ctx.sourceId}`
    );
  } else if (documentDates.length > 0) {
    // Store raw dates even if we couldn't map to known fields
    await mg().runQuery(
      `MATCH (d:Document {id: $docId}) SET d.temporalExtractedAt = $now, d.temporalDatesJson = $datesJson`,
      { docId: ctx.sourceId, now, datesJson: JSON.stringify(documentDates) }
    ).catch(() => {});
  }

  // ── 2. Create SUPERSEDES/AMENDS/EXTENDS/etc. edges between Document nodes ──
  let supersessionCount = 0;
  for (const link of superLinks) {
    if (!link.targetDocumentRef || (link.confidence || 0) < 0.5) continue;

    const ref = String(link.targetDocumentRef).trim();
    const relType = link.relationType || 'SUPERSEDES';

    // Find the target Document by unSymbol or documentTitle
    const targetRows = await mg().runQuery(
      `MATCH (target:Document)
       WHERE target.unSymbol = $ref
          OR toLower(target.unSymbol) = toLower($ref)
          OR (target.documentTitle IS NOT NULL AND toLower(target.documentTitle) CONTAINS toLower($ref) AND size($ref) >= 8)
       RETURN target.id AS id, target.unSymbol AS symbol
       LIMIT 1`,
      { ref }
    ).catch(() => []);

    if (targetRows.length === 0) {
      // Target document not yet in the system — store pending supersession on the source document
      await mg().runQuery(
        `MATCH (d:Document {id: $docId})
         SET d.pendingSupersessionJson = coalesce(d.pendingSupersessionJson, '[]')
         WITH d, apoc.convert.fromJsonList(d.pendingSupersessionJson) AS existing
         SET d.pendingSupersessionJson = apoc.convert.toJson(existing + [{
           relType: $relType, targetRef: $ref, scope: $scope,
           confidence: $conf, evidence: $evidence, detectedAt: $now
         }])`,
        {
          docId: ctx.sourceId, relType, ref,
          scope: link.scope || 'full',
          conf: link.confidence || 0.7,
          evidence: (link.evidence || '').slice(0, 300),
          now,
        }
      ).catch(() => {
        // apoc may not be available — store as simple JSON string instead
        mg().runQuery(
          `MATCH (d:Document {id: $docId})
           SET d.pendingSupersessionJson = $json`,
          {
            docId: ctx.sourceId,
            json: JSON.stringify(superLinks.map(l => ({
              relType: l.relationType, targetRef: l.targetDocumentRef,
              scope: l.scope || 'full', confidence: l.confidence || 0.7,
              evidence: (l.evidence || '').slice(0, 300), detectedAt: now,
            }))),
          }
        ).catch(() => {});
      });
      continue;
    }

    const targetId = targetRows[0].id;
    // Create edge between Document nodes
    await mg().runQuery(
      `MATCH (src:Document {id: $srcId}), (tgt:Document {id: $tgtId})
       MERGE (src)-[r:SUPERSEDES {relType: $relType}]->(tgt)
       SET r.scope      = $scope,
           r.confidence = $conf,
           r.evidence   = $evidence,
           r.extractedAt = $now,
           r.extractionJobId = $jobId`,
      {
        srcId: ctx.sourceId, tgtId: targetId,
        relType,
        scope:    link.scope || 'full',
        conf:     link.confidence || 0.7,
        evidence: (link.evidence || '').slice(0, 400),
        now,
        jobId:    ctx.extractionJobId || null,
      }
    ).catch(e => addLog(ctx, 'store-result', `Supersession edge ${relType} failed: ${e.message}`, 'warn'));

    supersessionCount++;
    addLog(ctx, 'store-result', `Supersession: ${relType} → ${targetRows[0].symbol || targetId}`);

    // Also update the target Document's isSuperseded flag
    await mg().runQuery(
      `MATCH (tgt:Document {id: $tgtId})
       SET tgt.isSuperseded = true, tgt.supersededBy = $srcId, tgt.supersededAt = $now`,
      { tgtId: targetId, srcId: ctx.sourceId, now }
    ).catch(() => {});
  }

  if (supersessionCount > 0) {
    addLog(ctx, 'store-result', `Created ${supersessionCount} Document-level supersession edge(s)`);
  }

  // ── Compute in-force status now that temporal + supersession are persisted ──
  try {
    const { validityService } = require('../../document/validity.service');
    const status = await validityService.updateDocumentStatus(ctx.sourceId);
    if (status && status !== 'UNKNOWN') addLog(ctx, 'store-result', `In-force status: ${status}`);
  } catch (e) {
    addLog(ctx, 'store-result', `Validity compute skipped: ${e.message}`, 'warn');
  }

  // ── 3. Try ESEntity-level supersession (non-fatal) ─────────────────────────
  // Done asynchronously after this function returns — Entity Store import may not be complete yet.
  // We'll schedule it via a short delay.
  if (superLinks.length > 0) {
    setImmediate(() => _linkESEntitySupersession(ctx.sourceId, superLinks, now).catch(() => {}));
  }
}

/**
 * Create ESEntity-level SUPERSEDES edges via supersessionService.
 * Runs after storeResult (via setImmediate) so Entity Store import has time to complete.
 */
async function _linkESEntitySupersession(documentId, superLinks, now) {
  const { supersessionService } = require('../../knowledge/supersession.service');

  // Find the ESEntity for the source document
  const srcRows = await mg().runQuery(
    `MATCH (e:ESEntity {type: 'DOCUMENT', provenanceDocId: $docId}) RETURN e.id AS id LIMIT 1`,
    { docId: documentId }
  ).catch(() => []);
  if (!srcRows.length) return;
  const srcEntityId = srcRows[0].id;

  for (const link of superLinks) {
    if (!link.targetDocumentRef || (link.confidence || 0) < 0.6) continue;
    const ref = String(link.targetDocumentRef).trim();

    // Find target ESEntity by name or document symbol
    const tgtRows = await mg().runQuery(
      `MATCH (e:ESEntity {type: 'DOCUMENT'})
       WHERE e.name = $ref OR toLower(e.name) = toLower($ref)
          OR e.documentSymbol = $ref OR toLower(e.documentSymbol) = toLower($ref)
       RETURN e.id AS id LIMIT 1`,
      { ref }
    ).catch(() => []);
    if (!tgtRows.length) continue;

    await supersessionService.createSupersession(srcEntityId, tgtRows[0].id, {
      reason:        link.relationType || 'SUPERSEDES',
      effectiveDate: link.effectiveFrom || null,
    }).catch(() => {});
  }
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
  allowRegexFallback: false,
  loadSource,
  persistGraph,
  storeResult,
  postProcessHooks: [buildTriangleHook, calculateKQSHook, detectGapsHook],
};
