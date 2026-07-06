'use strict';
const express = require('express');
const router = express.Router();
const {
  getQueueStats, getJobList, cancelJob, retryJob, retryAllFailed,
  enqueueDocument, enqueueMethodology, progressEmitter, getJobStatus, getJobFull,
  getConcurrency, setConcurrency,
} = require('../services/extraction/unified-queue');

let _mg;
function mg() { if (!_mg) _mg = require('../services/memgraph.service'); return _mg; }
function _n(v) { return typeof v === 'object' ? (v?.low ?? 0) : (v || 0); }

const ok  = (res, data)            => res.json({ ok: true, data });
const err = (res, msg, code = 500) => res.status(code).json({ ok: false, error: msg });

// ── Document stats from Memgraph (persistent) ────────────────────────────────

async function getDocumentStats() {
  const [rows, orphanRows] = await Promise.all([
    mg().runQuery(
      // Filter by uploadedAt to exclude mis-labelled ESEntity nodes with :Document label
      `MATCH (d:Document) WHERE d.uploadedAt IS NOT NULL
       RETURN d.status AS status, count(d) AS cnt`
    ),
    mg().runQuery(
      `MATCH (n:EntityMention {type: 'DOCUMENTREF'})
       WHERE NOT (n)-->()
       RETURN count(n) AS cnt`
    ),
  ]);
  const byStatus = {};
  let total = 0;
  for (const r of rows) {
    const cnt = _n(r.cnt);
    byStatus[r.status || 'UNKNOWN'] = cnt;
    total += cnt;
  }
  const docRefOrphans = _n(orphanRows[0]?.cnt);
  return { total, byStatus, docRefOrphans };
}

// GET /stats — combined BullMQ queue state + Memgraph document counts
router.get('/stats', async (req, res) => {
  try {
    const [queue, docs] = await Promise.all([
      getQueueStats(),
      getDocumentStats().catch(() => null),
    ]);
    ok(res, { ...queue, docs, concurrency: getConcurrency() });
  } catch (e) { err(res, e.message); }
});

// POST /concurrency  body: { concurrency: number }
router.post('/concurrency', async (req, res) => {
  try {
    const { concurrency } = req.body || {};
    if (!concurrency || isNaN(concurrency)) return err(res, 'concurrency number required', 400);
    const applied = await setConcurrency(parseInt(concurrency, 10));
    ok(res, { concurrency: applied });
  } catch (e) { err(res, e.message); }
});

// GET /jobs?statuses=active,waiting,completed,failed&limit=30
router.get('/jobs', async (req, res) => {
  try {
    const statuses = req.query.statuses ? req.query.statuses.split(',') : undefined;
    const limit    = Math.min(parseInt(req.query.limit) || 30, 100);
    ok(res, await getJobList({ statuses, limit }));
  } catch (e) { err(res, e.message); }
});

// GET /zero-entity-docs — COMPLETED docs with no extracted entities
router.get('/zero-entity-docs', async (req, res) => {
  try {
    const rows = await mg().runQuery(
      `MATCH (d:Document)
       WHERE d.status = 'COMPLETED'
         AND NOT exists((d)-[:MENTIONS]->(:EntityMention))
       RETURN d.id AS id, d.originalname AS name, d.namespace AS ns,
              d.documentType AS docType, d.uploadedAt AS uploadedAt
       ORDER BY d.uploadedAt DESC
       LIMIT 500`
    );
    ok(res, rows.map(r => ({
      id: r.id, name: r.name, namespace: r.ns,
      documentType: r.docType, uploadedAt: r.uploadedAt,
    })));
  } catch (e) { err(res, e.message); }
});

// POST /enqueue  body: { documentIds: string[], options?: {} }
router.post('/enqueue', async (req, res) => {
  try {
    const { documentIds = [], options = {} } = req.body;
    if (!Array.isArray(documentIds) || documentIds.length === 0)
      return err(res, 'documentIds array required', 400);
    const results = await Promise.allSettled(
      documentIds.map(id => enqueueDocument(id, options))
    );
    ok(res, results.map((r, i) => ({
      documentId: documentIds[i],
      ...(r.status === 'fulfilled'
        ? { jobId: r.value.jobId, queued: true }
        : { queued: false, error: r.reason?.message }),
    })));
  } catch (e) { err(res, e.message); }
});

// POST /enqueue-methodology  body: { documentId: string, methodology: string|string[], options?: {} }
// Variant C: enqueue a BullMQ METHODOLOGY job via the registry
router.post('/enqueue-methodology', async (req, res) => {
  try {
    const { documentId, methodology = 'M1', options = {} } = req.body;
    if (!documentId) return err(res, 'documentId is required', 400);
    const result = await enqueueMethodology(documentId, methodology, options);
    ok(res, result);
  } catch (e) { err(res, e.message); }
});

// POST /requeue  body: { mode: 'failed'|'zero-entity'|'ids', documentIds?: [], options?: {} }
// Resets document status → CLASSIFIED and enqueues for extraction.
// options.methodology = 'M2' etc. → uses enqueueMethodology instead of enqueueDocument
router.post('/requeue', async (req, res) => {
  try {
    const { mode = 'ids', documentIds = [], options = {} } = req.body;
    const { methodology, ...restOptions } = options;
    const now = new Date().toISOString();
    let docs = [];

    if (mode === 'failed') {
      const rows = await mg().runQuery(
        `MATCH (d:Document)
         WHERE d.status IN ['EXTRACTION_FAILED', 'FAILED']
         RETURN d.id AS id, d.originalname AS name, d.namespace AS ns`
      );
      docs = rows.map(r => r.id);
    } else if (mode === 'zero-entity') {
      const rows = await mg().runQuery(
        `MATCH (d:Document)
         WHERE d.status = 'COMPLETED'
           AND NOT exists((d)-[:MENTIONS]->(:EntityMention))
         RETURN d.id AS id`
      );
      docs = rows.map(r => r.id);
    } else {
      docs = documentIds;
    }

    if (!docs.length) return ok(res, { attempted: 0, queued: 0, failed: 0, errors: [] });

    // Reset status → CLASSIFIED so extraction is permitted
    await mg().runQuery(
      `UNWIND $ids AS docId
       MATCH (d:Document {id: docId})
       SET d.status = 'CLASSIFIED', d.updatedAt = $now`,
      { ids: docs, now }
    );

    const results = await Promise.allSettled(
      docs.map(id =>
        methodology
          ? enqueueMethodology(id, methodology, { ...restOptions, force: true })
          : enqueueDocument(id, { ...restOptions, force: true })
      )
    );

    ok(res, {
      attempted:  docs.length,
      queued:     results.filter(r => r.status === 'fulfilled').length,
      failed:     results.filter(r => r.status === 'rejected').length,
      errors:     results.filter(r => r.status === 'rejected').map(r => r.reason?.message),
      documentIds: docs,
      methodology: methodology || 'standard',
    });
  } catch (e) { err(res, e.message); }
});

// POST /enqueue-pending-from-queue
// Finds sourceIds in BullMQ (waiting/active/failed) that exist in Memgraph
// but are NOT yet COMPLETED, then re-enqueues them for extraction.
// options.methodology → uses enqueueMethodology instead of enqueueDocument
router.post('/enqueue-pending-from-queue', async (req, res) => {
  try {
    const { options = {}, dryRun = false } = req.body || {};
    const { methodology, ...restOptions } = options;
    const now = new Date().toISOString();

    // Collect all unique sourceIds from BullMQ (non-completed states)
    const jobs = await getJobList({ statuses: ['waiting', 'active', 'failed'], limit: 100 });
    const allIds = new Set();
    for (const status of ['waiting', 'active', 'failed']) {
      for (const j of jobs[status] || []) {
        if (j.sourceId && j.mode === 'DOCUMENT') allIds.add(j.sourceId);
      }
    }

    if (!allIds.size) return ok(res, { found: 0, queued: 0, skipped: 0, notInMemgraph: [] });

    const idList = [...allIds];

    // Check which exist in Memgraph and their current status
    const rows = await mg().runQuery(
      `UNWIND $ids AS docId
       MATCH (d:Document {id: docId})
       RETURN d.id AS id, d.status AS status, d.originalname AS name`,
      { ids: idList }
    );

    const inMemgraph = new Map(rows.map(r => [r.id, { status: r.status, name: r.name }]));
    const notInMemgraph = idList.filter(id => !inMemgraph.has(id));
    const toProcess = idList.filter(id => {
      const doc = inMemgraph.get(id);
      return doc && !['COMPLETED', 'EXTRACTING'].includes(doc.status);
    });

    if (dryRun) {
      return ok(res, {
        found: idList.length,
        toProcess: toProcess.length,
        skipped: idList.length - toProcess.length - notInMemgraph.length,
        notInMemgraph,
        docs: toProcess.map(id => ({ id, ...inMemgraph.get(id) })),
      });
    }

    if (!toProcess.length) {
      return ok(res, { found: idList.length, queued: 0, skipped: idList.length, notInMemgraph });
    }

    // Reset to CLASSIFIED so extraction proceeds
    await mg().runQuery(
      `UNWIND $ids AS docId
       MATCH (d:Document {id: docId})
       SET d.status = 'CLASSIFIED', d.updatedAt = $now`,
      { ids: toProcess, now }
    );

    const results = await Promise.allSettled(
      toProcess.map(id =>
        methodology
          ? enqueueMethodology(id, methodology, { ...restOptions, force: true })
          : enqueueDocument(id, { ...restOptions, force: true })
      )
    );

    ok(res, {
      found:         idList.length,
      queued:        results.filter(r => r.status === 'fulfilled').length,
      failed:        results.filter(r => r.status === 'rejected').length,
      skipped:       idList.length - toProcess.length,
      notInMemgraph,
      documentIds:   toProcess,
      methodology:   methodology || 'standard',
      errors:        results.filter(r => r.status === 'rejected').map(r => r.reason?.message),
    });
  } catch (e) { err(res, e.message); }
});

// GET /extraction-history/:docId — ExtractionRecord nodes persisted in Memgraph
router.get('/extraction-history/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 50);
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $docId})-[:HAS_EXTRACTION_RECORD]->(er:ExtractionRecord)
       RETURN er.id AS id, er.methodology AS methodology, er.success AS success,
              er.extractedAt AS extractedAt, er.entitiesExtracted AS entities,
              er.relationsFound AS relations, er.vectorsIndexed AS vectors,
              er.durationMs AS durationMs, er.textChars AS textChars, er.jobId AS jobId
       ORDER BY er.extractedAt DESC
       LIMIT ${limit}`,
      { docId }
    );
    ok(res, rows.map(r => ({
      id: r.id,
      methodology: r.methodology,
      success: r.success,
      extractedAt: r.extractedAt,
      entities: _n(r.entities),
      relations: _n(r.relations),
      vectors: _n(r.vectors),
      durationMs: _n(r.durationMs),
      textChars: _n(r.textChars),
      jobId: r.jobId,
    })));
  } catch (e) { err(res, e.message); }
});

// GET /docref-stats — count of DOCUMENTREF ESEntities with matching unextracted Documents
router.get('/docref-stats', async (req, res) => {
  try {
    const rows = await mg().runQuery(
      `MATCH (ref:ESEntity {type: 'DOCUMENTREF'})
       WHERE NOT (ref)-[:ES_RELATED_TO]->(:ESEntity {type: 'DOCUMENT'})
       WITH DISTINCT ref.name AS refName
       MATCH (d:Document)
       WHERE d.storagePath IS NOT NULL
         AND d.uploadedAt IS NOT NULL
         AND d.status <> 'EXTRACTING'
         AND d.status <> 'COMPLETED'
         AND (
           d.unSymbol = refName
           OR toLower(d.unSymbol) = toLower(refName)
           OR (d.unSymbol IS NOT NULL AND toLower(d.unSymbol) CONTAINS toLower(refName) AND size(refName) >= 5)
         )
       RETURN count(DISTINCT d.id) AS actionable`,
      {}
    );
    const total = await mg().runQuery(
      `MATCH (ref:ESEntity {type: 'DOCUMENTREF'})
       WHERE NOT (ref)-[:ES_RELATED_TO]->(:ESEntity {type: 'DOCUMENT'})
       RETURN count(ref) AS pending`,
      {}
    );
    ok(res, {
      pendingDocRefs: _n(total[0]?.pending),
      actionableDocuments: _n(rows[0]?.actionable),
    });
  } catch (e) { err(res, e.message); }
});

// POST /queue-docrefs — reset + enqueue all Documents matched by pending DOCUMENTREF ESEntities
router.post('/queue-docrefs', async (req, res) => {
  try {
    const now = new Date().toISOString();
    const { options = {} } = req.body || {};
    const { methodology, ...restOptions } = options;

    // Find Documents referenced by pending DOCUMENTREFs
    const rows = await mg().runQuery(
      `MATCH (ref:ESEntity {type: 'DOCUMENTREF'})
       WHERE NOT (ref)-[:ES_RELATED_TO]->(:ESEntity {type: 'DOCUMENT'})
       WITH DISTINCT ref.name AS refName
       MATCH (d:Document)
       WHERE d.storagePath IS NOT NULL
         AND d.uploadedAt IS NOT NULL
         AND d.status <> 'EXTRACTING'
         AND d.status <> 'COMPLETED'
         AND (
           d.unSymbol = refName
           OR toLower(d.unSymbol) = toLower(refName)
           OR (d.unSymbol IS NOT NULL AND toLower(d.unSymbol) CONTAINS toLower(refName) AND size(refName) >= 5)
         )
       RETURN DISTINCT d.id AS id, d.originalname AS name, d.status AS status
       ORDER BY d.id
       LIMIT 500`,
      {}
    );

    if (!rows.length) return ok(res, { found: 0, queued: 0, skipped: 0 });

    const docIds = rows.map(r => r.id);

    // Reset status + clear aiExtractedAt for all (allows agent to pick up even previously-attempted docs)
    await mg().runQuery(
      `UNWIND $ids AS docId
       MATCH (d:Document {id: docId})
       SET d.status = 'CLASSIFIED', d.aiExtractedAt = null, d.updatedAt = $now`,
      { ids: docIds, now }
    );

    const results = await Promise.allSettled(
      docIds.map(id =>
        methodology
          ? enqueueMethodology(id, methodology, { ...restOptions, force: true })
          : enqueueDocument(id, { ...restOptions, force: true })
      )
    );

    ok(res, {
      found:   docIds.length,
      queued:  results.filter(r => r.status === 'fulfilled').length,
      failed:  results.filter(r => r.status === 'rejected').length,
      errors:  results.filter(r => r.status === 'rejected').map(r => r.reason?.message),
      methodology: methodology || 'standard',
    });
  } catch (e) { err(res, e.message); }
});

// POST /docref-reconcile — link all orphaned DOCUMENTREF ESEntities to matching DOCUMENT ESEntities
router.post('/docref-reconcile', async (req, res) => {
  try {
    const { entityStoreService } = require('../services/knowledge/entity-store.service');
    const result = await entityStoreService.reconcileDocumentRefs();
    ok(res, result);
  } catch (e) { err(res, e.message); }
});

// GET /verify-completed?limit=500 — scan all Completed jobs for incomplete pipeline stages
const REQUIRED_STEPS = ['load-source', 'chunk-text', 'extract-entities', 'deduplicate', 'persist-graph', 'embed-and-index', 'store-result'];

router.get('/verify-completed', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || '500', 10), 2000);
    const allJobs = await getJobList({ statuses: ['completed'], limit });
    const completedJobs = (allJobs.completed || []);

    const problematic = [];
    const legacySourceIds = []; // jobs with no steps data

    for (const job of completedJobs) {
      const rv = job.returnvalue || {};
      const steps = Array.isArray(rv.steps) ? rv.steps : [];

      if (steps.length === 0) {
        if (job.mode === 'DOCUMENT' && job.sourceId) {
          // Legacy DOCUMENT job (before steps tracking) — need Memgraph entity count check
          legacySourceIds.push({ jobId: job.jobId, sourceId: job.sourceId, finishedOn: job.finishedOn });
        } else if (job.mode === 'METHODOLOGY' && job.sourceId && Array.isArray(rv.runs)) {
          // Old-format METHODOLOGY job: returnvalue has runs[] but no stats/steps
          // (jobs completed before the fix that adds full pipeline data to returnvalue)
          const run = rv.runs[0] || {};
          problematic.push({
            jobId:       job.jobId,
            sourceId:    job.sourceId,
            finishedOn:  job.finishedOn,
            hasStepsData: false,
            failedSteps: [],
            stats: {
              entitiesExtracted: run.entities      || 0,
              relationsFound:    run.relations     || 0,
              vectorsIndexed:    run.vectorsIndexed || 0,
              durationMs:        run.timeMs        || 0,
            },
            methodology: run.methodology || (Array.isArray(rv.methodology) ? rv.methodology[0] : null),
            issue: 'methodology-no-step-data',
          });
        }
        continue;
      }

      const failedSteps = [];
      for (const reqStep of REQUIRED_STEPS) {
        const s = steps.find(st => st.name === reqStep);
        if (!s || s.status !== 'completed') {
          failedSteps.push({ step: reqStep, status: s?.status || 'missing', error: s?.error || null });
        }
      }

      if (failedSteps.length > 0) {
        problematic.push({
          jobId: job.jobId,
          sourceId: job.sourceId,
          finishedOn: job.finishedOn,
          hasStepsData: true,
          failedSteps,
          stats: rv.stats || null,
          issue: 'incomplete-steps',
        });
      }
    }

    // For legacy jobs: batch-check entity counts in Memgraph
    if (legacySourceIds.length > 0) {
      const ids = legacySourceIds.map(x => x.sourceId);
      const rows = await mg().runQuery(
        `UNWIND $ids AS docId
         MATCH (d:Document {id: docId})
         OPTIONAL MATCH (d)-[:MENTIONS]->(em:EntityMention)
         RETURN d.id AS id, count(em) AS entityCount`,
        { ids }
      ).catch(() => []);
      const countMap = Object.fromEntries(rows.map(r => [r.id, _n(r.entityCount)]));
      for (const { jobId, sourceId, finishedOn } of legacySourceIds) {
        const entityCount = countMap[sourceId] ?? -1;
        if (entityCount === 0) {
          problematic.push({
            jobId, sourceId, finishedOn,
            hasStepsData: false,
            failedSteps: [],
            stats: { entitiesExtracted: 0 },
            issue: 'no-entities-legacy',
          });
        }
      }
    }

    // Enrich with document names from Memgraph
    if (problematic.length > 0) {
      const docIds = [...new Set(problematic.map(p => p.sourceId).filter(Boolean))];
      const nameRows = await mg().runQuery(
        `UNWIND $ids AS id
         MATCH (d:Document {id: id})
         RETURN d.id AS id, d.originalname AS name, d.status AS status, d.namespace AS ns`,
        { ids: docIds }
      ).catch(() => []);
      const nameMap = Object.fromEntries(nameRows.map(r => [r.id, { name: r.name, status: r.status, ns: r.ns }]));
      for (const p of problematic) {
        const info = nameMap[p.sourceId];
        if (info) { p.docName = info.name; p.docStatus = info.status; p.namespace = info.ns; }
      }
    }

    // Sort: most recent first
    problematic.sort((a, b) => (b.finishedOn || 0) - (a.finishedOn || 0));

    ok(res, { checked: completedJobs.length, problematic, total: problematic.length });
  } catch (e) { err(res, e.message); }
});

// GET /jobs/:jobId
router.get('/jobs/:jobId', async (req, res) => {
  try { ok(res, await getJobStatus(req.params.jobId)); }
  catch (e) { err(res, e.message); }
});

// DELETE /jobs/:jobId
router.delete('/jobs/:jobId', async (req, res) => {
  try { ok(res, await cancelJob(req.params.jobId)); }
  catch (e) { err(res, e.message); }
});

// POST /jobs/:jobId/retry
router.post('/jobs/:jobId/retry', async (req, res) => {
  try { ok(res, await retryJob(req.params.jobId)); }
  catch (e) { err(res, e.message); }
});

// POST /jobs/retry-all-failed
router.post('/jobs/retry-all-failed', async (req, res) => {
  try { ok(res, await retryAllFailed()); }
  catch (e) { err(res, e.message); }
});

// ── Advisor ──────────────────────────────────────────────────────────────────

// GET /advisor/commands — suggested commands sorted by usage
router.get('/advisor/commands', (req, res) => {
  const { getSuggestedCommands } = require('../services/extraction/pipeline-advisor.service');
  ok(res, getSuggestedCommands());
});

// POST /advisor/analyze  body: { jobId, message, history?: [] }
router.post('/advisor/analyze', async (req, res) => {
  try {
    const { jobId, message, history = [] } = req.body || {};
    if (!jobId || !message) return err(res, 'jobId and message required', 400);

    const jobData = await getJobFull(jobId);
    if (!jobData) return err(res, `Job not found: ${jobId}`, 404);

    const { analyzeJob } = require('../services/extraction/pipeline-advisor.service');
    const result = await analyzeJob(jobData, message, history);
    ok(res, result);
  } catch (e) { err(res, e.message); }
});

// GET /stream  — global SSE for all job events
router.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }
    catch {}
  };

  try {
    const [queueStats, docStats] = await Promise.all([
      getQueueStats(),
      getDocumentStats().catch(() => null),
    ]);
    send('connected', { ts: Date.now(), stats: { ...queueStats, docs: docStats } });
  } catch {}

  const onGlobal = (payload) => send('job', payload);
  progressEmitter.on('global', onGlobal);

  const hb = setInterval(() => { try { res.write(':hb\n\n'); } catch {} }, 25000);

  req.on('close', () => {
    clearInterval(hb);
    progressEmitter.off('global', onGlobal);
  });
});

module.exports = router;
