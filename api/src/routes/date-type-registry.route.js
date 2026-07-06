'use strict';

/**
 * DateTypeRegistry API
 *
 * GET  /api/date-types             — list all date types (grouped by category)
 * GET  /api/date-types/flat        — flat list
 * GET  /api/date-types/:code       — get one date type
 * POST /api/date-types/seed        — re-seed built-in types (idempotent)
 * GET  /api/date-types/document/:docId — get temporal data extracted for a document
 * GET  /api/date-types/supersession/:docId — get supersession chain for a document
 */

const express = require('express');
const router  = express.Router();

const { ok, err } = (() => {
  const ok  = (res, data, meta = {}) => res.json({ success: true, data, ...meta });
  const err = (res, msg, status = 500) => res.status(status).json({ success: false, error: { message: msg } });
  return { ok, err };
})();

let _mg = null;
function mg() { if (!_mg) _mg = require('../services/memgraph.service'); return _mg; }

// GET /api/date-types — grouped list
router.get('/', async (req, res) => {
  try {
    const { dateTypeRegistryService } = require('../services/knowledge/date-type-registry.service');
    const grouped = await dateTypeRegistryService.listGrouped();
    ok(res, grouped);
  } catch (e) { err(res, e.message); }
});

// GET /api/date-types/flat
router.get('/flat', async (req, res) => {
  try {
    const { dateTypeRegistryService } = require('../services/knowledge/date-type-registry.service');
    const all = await dateTypeRegistryService.loadAll();
    ok(res, [...all.values()]);
  } catch (e) { err(res, e.message); }
});

// POST /api/date-types/seed
router.post('/seed', async (req, res) => {
  try {
    const { dateTypeRegistryService } = require('../services/knowledge/date-type-registry.service');
    await dateTypeRegistryService.seedBuiltIns();
    ok(res, { seeded: true });
  } catch (e) { err(res, e.message); }
});

// GET /api/date-types/document/:docId — temporal extraction data for a document
router.get('/document/:docId', async (req, res) => {
  try {
    const { docId } = req.params;
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $docId})
       RETURN d.adoptionDate        AS adoptionDate,
              d.entryIntoForceDate  AS entryIntoForceDate,
              d.operationalDate     AS operationalDate,
              d.expiryDate          AS expiryDate,
              d.mandateStartDate    AS mandateStartDate,
              d.mandateEndDate      AS mandateEndDate,
              d.extensionDate       AS extensionDate,
              d.terminationDate     AS terminationDate,
              d.reviewDate          AS reviewDate,
              d.reportingDate       AS reportingDate,
              d.signatureDate       AS signatureDate,
              d.ratificationDeadline AS ratificationDeadline,
              d.reportingPeriodStart AS reportingPeriodStart,
              d.reportingPeriodEnd   AS reportingPeriodEnd,
              d.implementationDeadline AS implementationDeadline,
              d.temporalDatesJson   AS temporalDatesJson,
              d.mandatePeriodJson   AS mandatePeriodJson,
              d.temporalExtractedAt AS temporalExtractedAt`,
      { docId }
    );
    if (!rows.length) return err(res, 'Document not found', 404);

    const r = rows[0];
    const result = {
      adoptionDate:          r.adoptionDate         || null,
      entryIntoForceDate:    r.entryIntoForceDate    || null,
      operationalDate:       r.operationalDate       || null,
      expiryDate:            r.expiryDate            || null,
      mandateStartDate:      r.mandateStartDate      || null,
      mandateEndDate:        r.mandateEndDate        || null,
      extensionDate:         r.extensionDate         || null,
      terminationDate:       r.terminationDate       || null,
      reviewDate:            r.reviewDate            || null,
      reportingDate:         r.reportingDate         || null,
      signatureDate:         r.signatureDate         || null,
      ratificationDeadline:  r.ratificationDeadline  || null,
      reportingPeriodStart:  r.reportingPeriodStart  || null,
      reportingPeriodEnd:    r.reportingPeriodEnd    || null,
      implementationDeadline: r.implementationDeadline || null,
      temporalExtractedAt:   r.temporalExtractedAt   || null,
      allDates:              r.temporalDatesJson ? JSON.parse(r.temporalDatesJson) : [],
      mandatePeriod:         r.mandatePeriodJson  ? JSON.parse(r.mandatePeriodJson)  : null,
    };
    ok(res, result);
  } catch (e) { err(res, e.message); }
});

// GET /api/date-types/supersession/:docId — supersession graph for a document
router.get('/supersession/:docId', async (req, res) => {
  try {
    const { docId } = req.params;

    const [supersedes, supersededBy] = await Promise.all([
      mg().runQuery(
        `MATCH (src:Document {id: $docId})-[r:SUPERSEDES]->(tgt:Document)
         RETURN tgt.id AS id, tgt.unSymbol AS symbol, tgt.documentTitle AS title,
                tgt.isSuperseded AS isSuperseded,
                r.relType AS relType, r.scope AS scope, r.confidence AS confidence,
                r.evidence AS evidence, r.extractedAt AS extractedAt`,
        { docId }
      ),
      mg().runQuery(
        `MATCH (src:Document)-[r:SUPERSEDES]->(tgt:Document {id: $docId})
         RETURN src.id AS id, src.unSymbol AS symbol, src.documentTitle AS title,
                r.relType AS relType, r.scope AS scope, r.confidence AS confidence,
                r.evidence AS evidence, r.extractedAt AS extractedAt`,
        { docId }
      ),
    ]);

    // Also get pending supersession (target not yet in system)
    const pendingRows = await mg().runQuery(
      `MATCH (d:Document {id: $docId})
       WHERE d.pendingSupersessionJson IS NOT NULL
       RETURN d.pendingSupersessionJson AS json`,
      { docId }
    ).catch(() => []);
    const pending = pendingRows[0]?.json ? (() => { try { return JSON.parse(pendingRows[0].json); } catch { return []; } })() : [];

    ok(res, {
      documentId: docId,
      supersedes:   supersedes.map(r => ({
        id: r.id, symbol: r.symbol, title: r.title,
        relType: r.relType, scope: r.scope,
        confidence: r.confidence, evidence: r.evidence,
        extractedAt: r.extractedAt,
      })),
      supersededBy: supersededBy.map(r => ({
        id: r.id, symbol: r.symbol, title: r.title,
        relType: r.relType, scope: r.scope,
        confidence: r.confidence, evidence: r.evidence,
        extractedAt: r.extractedAt,
      })),
      pendingLinks: pending,
      isSuperseded: supersededBy.length > 0,
    });
  } catch (e) { err(res, e.message); }
});

// GET /api/date-types/:code — get one date type
router.get('/:code', async (req, res) => {
  try {
    const { dateTypeRegistryService } = require('../services/knowledge/date-type-registry.service');
    const dt = await dateTypeRegistryService.getByCode(req.params.code.toUpperCase());
    if (!dt) return err(res, `Date type not found: ${req.params.code}`, 404);
    ok(res, dt);
  } catch (e) { err(res, e.message); }
});

module.exports = router;
