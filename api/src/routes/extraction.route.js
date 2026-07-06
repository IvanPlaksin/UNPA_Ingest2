'use strict';

/**
 * Extraction Routes — Methodology-based extraction (Variant A)
 *
 * POST  /api/extraction/run                 — run selected methodologies on a document
 * GET   /api/extraction/methodologies       — list all methodologies with metadata
 * GET   /api/extraction/runs/:runId         — get a completed run's results
 * GET   /api/extraction/compare/:docId      — list all runs for a document
 *
 * Variant A: direct comparison endpoint (parallel to existing pipeline).
 * Variant C: BullMQ integration in unified-queue.js (mode: METHODOLOGY).
 */

const express = require('express');
const router  = express.Router();
const { registry } = require('../services/extraction/methodology-registry');
const glinerClient = require('../../services/gliner/gliner.client');

let _mg;
function mg() { if (!_mg) _mg = require('../services/memgraph.service'); return _mg; }
let _redisGet, _redisSet;
function redisGet(k)          { if (!_redisGet) ({ get: _redisGet, set: _redisSet } = require('../services/redis.service')); return _redisGet(k); }
function redisSet(k, v, ...a) { if (!_redisSet) ({ get: _redisGet, set: _redisSet } = require('../services/redis.service')); return _redisSet(k, v, ...a); }

const RUN_TTL = 7200; // 2 hours in Redis

function _n(v) { return typeof v === 'object' ? (v?.low ?? 0) : (v || 0); }
const ok  = (res, data)            => res.json({ ok: true,  data });
const err = (res, msg, code = 500) => res.status(code).json({ ok: false, error: msg });

// ── Document text loader ──────────────────────────────────────────────────────

async function loadDocumentText(docId) {
  const { documentExtractionService: docSvc } =
    require('../services/knowledge/document-extraction.service');

  const doc = await docSvc._loadDoc(docId);
  if (!doc) return null;
  if (!doc.storagePath) return { ...doc, text: '' };

  try {
    const text = await docSvc._readText(doc.storagePath, doc.originalname);
    return { ...doc, name: doc.originalname || doc.documentTitle, text: text || '' };
  } catch {
    return { ...doc, name: doc.originalname || doc.documentTitle, text: '' };
  }
}

async function loadExistingEntities(docId) {
  try {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $id})-[:MENTIONS]->(em:EntityMention)
       RETURN em.id AS id, em.name AS name, em.type AS type
       LIMIT 200`,
      { id: docId }
    );
    return rows.map(r => ({ id: r.id, name: r.name, type: r.type }));
  } catch {
    return [];
  }
}

// ── Redis run storage ─────────────────────────────────────────────────────────

async function storeRun(runId, data) {
  try {
    // redis.service.js's set(key, value, ttlSeconds) handles JSON.stringify internally
    await redisSet(`extraction:run:${runId}`, data, RUN_TTL);
  } catch { /* ignore */ }
}

async function loadRun(runId) {
  try {
    // redis.service.js's get() already calls JSON.parse — returns object directly
    const data = await redisGet(`extraction:run:${runId}`);
    return data || null;
  } catch { return null; }
}

async function storeDocRuns(docId, runId) {
  try {
    const key = `extraction:docruns:${docId}`;
    const existing = await redisGet(key);
    const arr = Array.isArray(existing) ? existing : [];
    if (!arr.includes(runId)) arr.unshift(runId);
    await redisSet(key, arr.slice(0, 50), RUN_TTL);
  } catch { /* ignore */ }
}

async function loadDocRuns(docId) {
  try {
    const data = await redisGet(`extraction:docruns:${docId}`);
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

// ── POST /api/extraction/run ──────────────────────────────────────────────────
//
// Body: { docId: string, methodologies: string[], options?: {} }
// Runs each methodology sequentially and returns all results.
// For parallel mode: pass options.parallel = true (up to 3 concurrent).

router.post('/run', async (req, res) => {
  try {
    const { docId, methodologies = ['M1'], options = {} } = req.body || {};

    if (!docId) return err(res, 'docId is required', 400);
    if (!Array.isArray(methodologies) || methodologies.length === 0)
      return err(res, 'methodologies array is required', 400);
    if (methodologies.length > 6)
      return err(res, 'max 6 methodologies per run', 400);

    // Check GLiNER availability (used by M2, M3, M5)
    const needsGliner = methodologies.some(m => registry.list([m])[0]?.requiresGLiNER);
    let glinerAvailable = false;
    if (needsGliner) {
      const ping = await glinerClient.ping();
      glinerAvailable = ping.available && ping.modelLoaded;
    }

    // Validate methodology IDs
    const validation = registry.validate(methodologies, {
      docSize: 0,
      glinerAvailable,
    });
    if (!validation.valid) return err(res, validation.issues.join('; '), 400);

    // Load document
    const doc = await loadDocumentText(docId);
    if (!doc) return err(res, `Document not found: ${docId}`, 404);
    if (!doc.text || doc.text.length < 10) return err(res, 'Document has no extractable text', 422);

    // Load pre-marked entities for context
    const existingEntities = await loadExistingEntities(docId);

    const sessionId = `sess-${Date.now().toString(36)}`;
    const runs      = [];
    const startAll  = Date.now();

    // Run methodologies (sequential by default; set options.parallel for concurrent)
    const parallel = options.parallel === true;
    const runExtraction = async (mId) => {
      const extractor = registry.getExtractor(mId, options[mId] || {});
      const t0 = Date.now();
      try {
        const result = await extractor.extract(docId, doc.text, existingEntities);
        await storeRun(result.runId, {
          ...result,
          docName: doc.name,
          docType: doc.documentType,
          sessionId,
        });
        await storeDocRuns(docId, result.runId);
        return { methodology: mId, runId: result.runId, status: 'completed',
                 timeMs: Date.now() - t0, entities: result.entities.length,
                 relations: result.relations.length, cost: result.metrics.cost };
      } catch (e) {
        return { methodology: mId, status: 'failed', error: e.message, timeMs: Date.now() - t0 };
      }
    };

    if (parallel) {
      const results = await Promise.all(methodologies.map(mId => runExtraction(mId)));
      runs.push(...results);
    } else {
      for (const mId of methodologies) {
        runs.push(await runExtraction(mId));
      }
    }

    ok(res, {
      sessionId,
      docId,
      docName:       doc.name,
      docType:       doc.documentType,
      totalTimeMs:   Date.now() - startAll,
      methodologies: runs,
      warnings:      validation.warnings,
    });
  } catch (e) { err(res, e.message); }
});

// ── GET /api/extraction/methodologies ────────────────────────────────────────
router.get('/methodologies', (_req, res) => {
  ok(res, registry.list());
});

// ── GET /api/extraction/runs/:runId ──────────────────────────────────────────
router.get('/runs/:runId', async (req, res) => {
  try {
    const data = await loadRun(req.params.runId);
    if (!data) return err(res, `Run not found or expired: ${req.params.runId}`, 404);
    ok(res, data);
  } catch (e) { err(res, e.message); }
});

// ── GET /api/extraction/compare/:docId ───────────────────────────────────────
// Returns summary of all cached runs for a document (for comparison UI).
router.get('/compare/:docId', async (req, res) => {
  try {
    const runIds = await loadDocRuns(req.params.docId);
    if (!runIds.length) return ok(res, []);

    const summaries = await Promise.all(runIds.map(async (runId) => {
      const data = await loadRun(runId);
      if (!data) return null;
      return {
        runId,
        methodology:  data.methodology,
        extractedAt:  data.metadata?.extractedAt,
        entities:     data.entities?.length  || 0,
        relations:    data.relations?.length || 0,
        cost:         data.metrics?.cost,
        totalTimeMs:  data.metrics?.totalTimeMs,
        modelUsed:    data.metadata?.modelUsed,
      };
    }));

    ok(res, summaries.filter(Boolean));
  } catch (e) { err(res, e.message); }
});

module.exports = router;
