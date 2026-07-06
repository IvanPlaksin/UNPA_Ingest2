'use strict';
const express = require('express');
const router = express.Router();

let _mg;
function mg() { if (!_mg) _mg = require('../services/memgraph.service'); return _mg; }

// Safely coerce Memgraph integer/float node objects to JS numbers
function _n(v) { return typeof v === 'object' && v !== null ? (v?.low ?? 0) : (parseInt(v) || 0); }
function _f(v) { return typeof v === 'object' && v !== null ? (v?.low ?? 0) : (parseFloat(v) || 0); }

const ok   = (res, data)            => res.json({ ok: true, data });
const fail = (res, msg, code = 500) => res.status(code).json({ ok: false, error: msg });

// Validate ISO date string (basic sanitization)
function _validDate(s) {
  if (!s || typeof s !== 'string') return null;
  return /^\d{4}-\d{2}-\d{2}(T[\d:.Z+\-]+)?$/.test(s) ? s : null;
}

// Build AND conditions for a date range on `field`
function _dateWhere(field, from, to) {
  const parts = [];
  if (from) parts.push(`${field} >= '${from}'`);
  if (to)   parts.push(`${field} <= '${to}'`);
  return parts.length ? 'AND ' + parts.join(' AND ') : '';
}

// ─── GET /overview ────────────────────────────────────────────────────────────
// Aggregate totals: document counts by status, extraction sums, ESEntity count
router.get('/overview', async (req, res) => {
  try {
    const from = _validDate(req.query.from);
    const to   = _validDate(req.query.to);
    const dw   = _dateWhere('d.uploadedAt', from, to);

    const [docRows, exRows, esRows] = await Promise.all([
      mg().runQuery(`
        MATCH (d:Document) WHERE d.uploadedAt IS NOT NULL ${dw}
        RETURN d.status AS status, count(d) AS cnt
      `),
      // Aggregate per-document first (take max of each metric across all runs),
      // then sum across documents — avoids inflating counts from re-extractions
      mg().runQuery(`
        MATCH (d:Document) WHERE d.uploadedAt IS NOT NULL ${dw}
        OPTIONAL MATCH (d)-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
        WITH d,
             max(COALESCE(r.entitiesExtracted, 0)) AS docEnt,
             max(COALESCE(r.relationsFound,    0)) AS docRel,
             max(COALESCE(r.vectorsIndexed,    0)) AS docVec,
             avg(r.kqsScore)                       AS docKqs,
             avg(COALESCE(r.durationMs,        0)) AS docDur,
             count(r) AS runs
        WHERE runs > 0
        RETURN
          sum(docEnt) AS entities,
          sum(docRel) AS relations,
          sum(docVec) AS vectors,
          avg(docKqs) AS avgKqs,
          avg(docDur) AS avgDuration,
          count(d)    AS processed
      `),
      mg().runQuery(`MATCH (es:ESEntity) RETURN count(es) AS cnt`),
    ]);

    const byStatus = {};
    let total = 0;
    for (const r of docRows) {
      const cnt = _n(r.cnt);
      byStatus[r.status || 'UNKNOWN'] = cnt;
      total += cnt;
    }

    const completed = byStatus['COMPLETED'] || 0;
    const failed    = (byStatus['EXTRACTION_FAILED'] || 0) + (byStatus['FAILED'] || 0);
    const ex        = exRows[0] || {};

    ok(res, {
      documents: { total, byStatus },
      extraction: {
        entities:    _n(ex.entities),
        relations:   _n(ex.relations),
        vectors:     _n(ex.vectors),
        avgKqs:      parseFloat((_f(ex.avgKqs)).toFixed(3)),
        avgDurationMs: Math.round(_f(ex.avgDuration)),
        processed:   _n(ex.processed),
      },
      esEntityCount: _n(esRows[0]?.cnt),
      successRate: (completed + failed) > 0
        ? Math.round(completed / (completed + failed) * 100)
        : null,
    });
  } catch (e) { fail(res, e.message); }
});

// ─── GET /timeline?from=&to=&granularity=day|hour ─────────────────────────────
// Time-bucketed extraction events for area/line charts
router.get('/timeline', async (req, res) => {
  try {
    const from = _validDate(req.query.from);
    const to   = _validDate(req.query.to);
    const gran = req.query.granularity === 'hour' ? 'hour' : 'day';
    const dw   = _dateWhere('d.extractedAt', from, to);

    // Group by document first to avoid inflating counts from multiple ExtractionResult runs
    const rows = await mg().runQuery(`
      MATCH (d:Document)
      WHERE d.uploadedAt IS NOT NULL AND d.extractedAt IS NOT NULL ${dw}
      OPTIONAL MATCH (d)-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
      WITH d,
           max(COALESCE(r.entitiesExtracted, 0)) AS entities,
           max(COALESCE(r.relationsFound,    0)) AS relations,
           max(COALESCE(r.vectorsIndexed,    0)) AS vectors,
           avg(COALESCE(r.durationMs,        0)) AS dur
      RETURN d.extractedAt AS ts, entities, relations, vectors, dur
      ORDER BY ts
    `);

    const buckets = {};
    for (const r of rows) {
      if (!r.ts) continue;
      const key  = gran === 'hour' ? String(r.ts).slice(0, 13) : String(r.ts).slice(0, 10);
      const date = gran === 'hour' ? key + ':00' : key;
      if (!buckets[key]) buckets[key] = { date, documents: 0, entities: 0, relations: 0, vectors: 0, totalDur: 0 };
      buckets[key].documents++;
      buckets[key].entities  += _n(r.entities);
      buckets[key].relations += _n(r.relations);
      buckets[key].vectors   += _n(r.vectors);
      buckets[key].totalDur  += _n(r.dur);
    }

    ok(res, Object.values(buckets)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(b => ({
        date:        b.date,
        documents:   b.documents,
        entities:    b.entities,
        relations:   b.relations,
        vectors:     b.vectors,
        avgDuration: b.documents > 0 ? Math.round(b.totalDur / b.documents) : 0,
      }))
    );
  } catch (e) { fail(res, e.message); }
});

// ─── GET /entities?from=&to=&limit= ──────────────────────────────────────────
// Entity type distribution, top ES entities, KQS histogram
router.get('/entities', async (req, res) => {
  try {
    const from  = _validDate(req.query.from);
    const to    = _validDate(req.query.to);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const dw    = _dateWhere('d.uploadedAt', from, to);

    const [typeRows, topRows, kqsRows, relTypeRows] = await Promise.all([
      // Entity mention type distribution (from documents in range)
      mg().runQuery(`
        MATCH (d:Document)-[:MENTIONS]->(em:EntityMention)
        WHERE d.uploadedAt IS NOT NULL ${dw}
        RETURN em.type AS type, count(em) AS cnt
        ORDER BY cnt DESC
        LIMIT 20
      `),
      // Top ESEntities by mention count
      mg().runQuery(`
        MATCH (es:ESEntity)
        RETURN es.name AS name, es.type AS type,
               COALESCE(es.mentionCount, 0) AS mentionCount
        ORDER BY mentionCount DESC
        LIMIT ${limit}
      `),
      // KQS score values for histogram
      mg().runQuery(`
        MATCH (d:Document)-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
        WHERE d.uploadedAt IS NOT NULL AND r.kqsScore IS NOT NULL ${dw}
        RETURN r.kqsScore AS score
      `),
      // Relation type breakdown
      mg().runQuery(`
        MATCH (d:Document)-[:MENTIONS]->(a:EntityMention)-[rel:RELATED_TO]->(b:EntityMention)
        WHERE d.uploadedAt IS NOT NULL ${dw}
        RETURN rel.type AS type, count(rel) AS cnt
        ORDER BY cnt DESC
        LIMIT 15
      `),
    ]);

    // Build KQS 10-bin histogram
    const kqsBuckets = Array.from({ length: 10 }, (_, i) => ({
      range: `${(i * 0.1).toFixed(1)}–${((i + 1) * 0.1).toFixed(1)}`,
      count: 0,
    }));
    for (const r of kqsRows) {
      const score = _f(r.score);
      const idx   = Math.min(Math.floor(score * 10), 9);
      kqsBuckets[idx].count++;
    }

    ok(res, {
      byType:           typeRows.map(r => ({ type: r.type || 'UNKNOWN', count: _n(r.cnt) })),
      topEntities:      topRows.map(r => ({ name: r.name, type: r.type, mentionCount: _n(r.mentionCount) })),
      kqsDistribution:  kqsBuckets,
      relationTypes:    relTypeRows.map(r => ({ type: r.type || 'UNKNOWN', count: _n(r.cnt) })),
    });
  } catch (e) { fail(res, e.message); }
});

// ─── GET /namespaces ──────────────────────────────────────────────────────────
// Per-namespace document counts, entity counts, vector counts
router.get('/namespaces', async (req, res) => {
  try {
    const rows = await mg().runQuery(`
      MATCH (d:Document) WHERE d.uploadedAt IS NOT NULL
      OPTIONAL MATCH (d)-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
      RETURN d.namespace AS ns, d.status AS status,
             count(d) AS cnt,
             COALESCE(sum(r.entitiesExtracted), 0) AS entities,
             COALESCE(sum(r.vectorsIndexed), 0)    AS vectors
    `);

    const byNs = {};
    for (const r of rows) {
      const ns = r.ns || 'DEFAULT';
      if (!byNs[ns]) byNs[ns] = { namespace: ns, total: 0, byStatus: {}, entities: 0, vectors: 0 };
      const cnt = _n(r.cnt);
      byNs[ns].total += cnt;
      byNs[ns].byStatus[r.status || 'UNKNOWN'] = (byNs[ns].byStatus[r.status || 'UNKNOWN'] || 0) + cnt;
      byNs[ns].entities += _n(r.entities);
      byNs[ns].vectors  += _n(r.vectors);
    }

    ok(res, Object.values(byNs).sort((a, b) => b.total - a.total));
  } catch (e) { fail(res, e.message); }
});

// ─── GET /documents?from=&to=&status=&namespace=&limit=&offset= ──────────────
// Paginated document list with extraction metrics per document
router.get('/documents', async (req, res) => {
  try {
    const from      = _validDate(req.query.from);
    const to        = _validDate(req.query.to);
    const status    = (req.query.status    || '').replace(/['"]/g, '');
    const namespace = (req.query.namespace || '').replace(/['"]/g, '');
    const sortBy    = ['uploadedAt', 'extractedAt', 'entities', 'kqs'].includes(req.query.sortBy)
      ? req.query.sortBy : 'uploadedAt';
    const sortDir   = req.query.sortDir === 'asc' ? 'ASC' : 'DESC';
    const limit     = Math.min(parseInt(req.query.limit)  || 50, 200);
    const offset    = Math.max(parseInt(req.query.offset) || 0,  0);

    const conds = ['d.uploadedAt IS NOT NULL'];
    if (status)    conds.push(`d.status = '${status}'`);
    if (namespace) conds.push(`d.namespace = '${namespace}'`);
    if (from)      conds.push(`d.uploadedAt >= '${from}'`);
    if (to)        conds.push(`d.uploadedAt <= '${to}'`);

    const sortExpr = sortBy === 'entities' ? 'entities'
                   : sortBy === 'kqs'       ? 'kqs'
                   : `d.${sortBy}`;

    // Aggregate per-document to handle multiple ExtractionResult nodes from re-runs
    const rows = await mg().runQuery(`
      MATCH (d:Document) WHERE ${conds.join(' AND ')}
      OPTIONAL MATCH (d)-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
      WITH d,
           max(COALESCE(r.entitiesExtracted, 0))      AS entities,
           max(COALESCE(r.relationsFound,    0))       AS relations,
           max(COALESCE(r.vectorsIndexed,    0))       AS vectors,
           max(COALESCE(r.kqsScore, d.kqsScore, 0.0)) AS kqs,
           max(COALESCE(r.durationMs, 0))              AS durationMs
      RETURN d.id AS id, d.originalname AS name, d.status AS status,
             d.documentType AS docType, d.namespace AS ns,
             d.uploadedAt AS uploadedAt, d.extractedAt AS extractedAt,
             entities, relations, vectors, kqs, durationMs
      ORDER BY ${sortExpr} ${sortDir}
      SKIP ${offset} LIMIT ${limit}
    `);

    // Total count for pagination
    const countRows = await mg().runQuery(`
      MATCH (d:Document) WHERE ${conds.join(' AND ')}
      RETURN count(d) AS total
    `);

    ok(res, {
      total: _n(countRows[0]?.total),
      items: rows.map(r => ({
        id:          r.id,
        name:        r.name,
        status:      r.status,
        docType:     r.docType,
        namespace:   r.ns,
        uploadedAt:  r.uploadedAt,
        extractedAt: r.extractedAt,
        entities:    _n(r.entities),
        relations:   _n(r.relations),
        vectors:     _n(r.vectors),
        kqs:         parseFloat((_f(r.kqs)).toFixed(3)),
        durationMs:  _n(r.durationMs),
      })),
    });
  } catch (e) { fail(res, e.message); }
});

// ─── GET /pipeline-performance ────────────────────────────────────────────────
// Extraction result aggregates (avg step times, error rates) over time
router.get('/performance', async (req, res) => {
  try {
    const from = _validDate(req.query.from);
    const to   = _validDate(req.query.to);
    const dw   = _dateWhere('r.completedAt', from, to);

    const rows = await mg().runQuery(`
      MATCH (d:Document)-[:HAS_EXTRACTION_RESULT]->(r:ExtractionResult)
      WHERE d.uploadedAt IS NOT NULL ${dw}
      RETURN
        avg(r.durationMs)        AS avgDuration,
        min(r.durationMs)        AS minDuration,
        max(r.durationMs)        AS maxDuration,
        avg(r.entitiesExtracted) AS avgEntities,
        avg(r.relationsFound)    AS avgRelations,
        avg(r.vectorsIndexed)    AS avgVectors,
        avg(r.kqsScore)          AS avgKqs,
        sum(r.gapsDetected)      AS totalGaps,
        sum(r.errorCount)        AS totalErrors,
        count(r)                 AS total
    `);

    const r = rows[0] || {};
    ok(res, {
      avgDurationMs:   Math.round(_f(r.avgDuration)),
      minDurationMs:   Math.round(_f(r.minDuration)),
      maxDurationMs:   Math.round(_f(r.maxDuration)),
      avgEntities:     parseFloat(_f(r.avgEntities).toFixed(1)),
      avgRelations:    parseFloat(_f(r.avgRelations).toFixed(1)),
      avgVectors:      parseFloat(_f(r.avgVectors).toFixed(1)),
      avgKqs:          parseFloat(_f(r.avgKqs).toFixed(3)),
      totalGaps:       _n(r.totalGaps),
      totalErrors:     _n(r.totalErrors),
      total:           _n(r.total),
    });
  } catch (e) { fail(res, e.message); }
});

// ─── GET /step-timing?from=&to=&bucketMs= ─────────────────────────────────────
// Time-series step durations for efficiency charts.
// Buckets ExtractionResult rows by `bucketMs` (ms per bucket).
// from/to are ISO strings; bucketMs is integer milliseconds.
router.get('/step-timing', async (req, res) => {
  try {
    const from     = _validDate(req.query.from);
    const to       = _validDate(req.query.to);
    const bucketMs = Math.max(1000, parseInt(req.query.bucketMs) || 3600000);

    const conds = ['r.completedAt IS NOT NULL'];
    if (from) conds.push(`r.completedAt >= '${from}'`);
    if (to)   conds.push(`r.completedAt <= '${to}'`);

    const rows = await mg().runQuery(`
      MATCH (r:ExtractionResult)
      WHERE ${conds.join(' AND ')}
      RETURN r.completedAt     AS ts,
             r.durationMs      AS total,
             r.stepLoadMs      AS stepLoad,
             r.stepChunkMs     AS stepChunk,
             r.stepEntitiesMs  AS stepEntities,
             r.stepRelationsMs AS stepRelations,
             r.stepEmbedMs     AS stepEmbed,
             r.stepGraphMs     AS stepGraph,
             r.entitiesExtracted AS entities,
             r.vectorsIndexed    AS vectors
      ORDER BY ts
    `, {});

    // Bucket in application code — Memgraph lacks epoch arithmetic
    const buckets = new Map();
    let hasStepData = false;

    for (const r of rows) {
      if (!r.ts) continue;
      const epochMs  = new Date(String(r.ts)).getTime();
      if (isNaN(epochMs)) continue;
      const bKey = Math.floor(epochMs / bucketMs) * bucketMs;

      if (!buckets.has(bKey)) {
        buckets.set(bKey, {
          ts: bKey, count: 0,
          total: 0, stepLoad: 0, stepChunk: 0,
          stepEntities: 0, stepRelations: 0, stepEmbed: 0, stepGraph: 0,
          cLoad: 0, cChunk: 0, cEntities: 0, cRelations: 0, cEmbed: 0, cGraph: 0,
          entities: 0, vectors: 0,
        });
      }
      const b = buckets.get(bKey);
      b.count++;
      b.total    += _n(r.total);
      b.entities += _n(r.entities);
      b.vectors  += _n(r.vectors);

      if (r.stepLoad      != null) { b.stepLoad      += _n(r.stepLoad);      b.cLoad++;      hasStepData = true; }
      if (r.stepChunk     != null) { b.stepChunk     += _n(r.stepChunk);     b.cChunk++;     hasStepData = true; }
      if (r.stepEntities  != null) { b.stepEntities  += _n(r.stepEntities);  b.cEntities++;  hasStepData = true; }
      if (r.stepRelations != null) { b.stepRelations += _n(r.stepRelations); b.cRelations++; hasStepData = true; }
      if (r.stepEmbed     != null) { b.stepEmbed     += _n(r.stepEmbed);     b.cEmbed++;     hasStepData = true; }
      if (r.stepGraph     != null) { b.stepGraph     += _n(r.stepGraph);     b.cGraph++;     hasStepData = true; }
    }

    const points = [...buckets.values()]
      .sort((a, b) => a.ts - b.ts)
      .map(b => ({
        ts:           new Date(b.ts).toISOString(),
        count:        b.count,
        avgTotal:     b.count > 0 ? Math.round(b.total / b.count) : null,
        avgLoad:      b.cLoad      > 0 ? Math.round(b.stepLoad      / b.cLoad)      : null,
        avgChunk:     b.cChunk     > 0 ? Math.round(b.stepChunk     / b.cChunk)     : null,
        avgEntities:  b.cEntities  > 0 ? Math.round(b.stepEntities  / b.cEntities)  : null,
        avgRelations: b.cRelations > 0 ? Math.round(b.stepRelations / b.cRelations) : null,
        avgEmbed:     b.cEmbed     > 0 ? Math.round(b.stepEmbed     / b.cEmbed)     : null,
        avgGraph:     b.cGraph     > 0 ? Math.round(b.stepGraph     / b.cGraph)     : null,
        entities:     b.entities,
        vectors:      b.vectors,
      }));

    ok(res, { points, hasStepData, bucketMs });
  } catch (e) { fail(res, e.message); }
});

module.exports = router;
