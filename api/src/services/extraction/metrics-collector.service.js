'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const now = () => new Date().toISOString();

/**
 * ExtractionMetricsCollector — per-run instance that instruments the unified pipeline.
 *
 * Usage:
 *   const collector = metricsCollectorService.start(ctx);
 *   // ... pipeline runs ...
 *   await collector.finalize(ctx);
 *
 * Creates an ExtractionMetrics node linked to the Document and Methodology.
 */
class ExtractionMetricsCollector {
  constructor(extractionJobId, documentId) {
    this.extractionJobId = extractionJobId;
    this.documentId      = documentId;
    this.startMs         = Date.now();

    this._phases     = {};  // phaseName → { startMs, durationMs }
    this._errors     = [];
    this._warnings   = [];
    this._entityConf = [];  // confidence values for avg calculation
  }

  recordPhaseStart(phase) {
    this._phases[phase] = { startMs: Date.now(), durationMs: null };
  }

  recordPhaseEnd(phase) {
    if (this._phases[phase]) {
      this._phases[phase].durationMs = Date.now() - this._phases[phase].startMs;
    }
  }

  recordEntity(entity) {
    if (entity?.confidence != null) {
      const c = typeof entity.confidence === 'number' ? entity.confidence : (entity.confidence?.low ?? 0.8);
      this._entityConf.push(c);
    }
  }

  recordError(msg) { this._errors.push(msg); }
  recordWarning(msg) { this._warnings.push(msg); }

  async finalize(ctx) {
    const totalMs = Date.now() - this.startMs;
    const avgConf = this._entityConf.length
      ? this._entityConf.reduce((s, v) => s + v, 0) / this._entityConf.length
      : null;

    const pp = ctx.postProcessResults || {};
    const kqsScore = pp.calculateKQS?.score ?? null;

    const metricsId = uuidv4();
    const ts = now();

    await mg().runQuery(
      `CREATE (m:ExtractionMetrics {
         id: $id, extractionJobId: $jobId,
         documentId: $docId, methodologyId: $methodId,
         documentType: $docType, epistemicLayer: $layer,

         totalDurationMs:  $totalMs,
         phase1DurationMs: $p1ms,
         phase2DurationMs: $p2ms,

         entitiesExtracted: $entities,
         relationsFound:    $relations,
         vectorsIndexed:    $vectors,
         chunksProcessed:   $chunks,

         avgConfidence:      $avgConf,
         kqsScore:           $kqs,
         triangleCompleteness: $triangle,

         errorCount:   $errors,
         warningCount: $warnings,

         extractedAt: $ts
       })`,
      {
        id:       metricsId,
        jobId:    this.extractionJobId,
        docId:    this.documentId,
        methodId: ctx.methodologyId || null,
        docType:  ctx.documentType  || null,
        layer:    ctx.epistemicLayer || null,

        totalMs,
        p1ms: this._phases['extract-entities']?.durationMs ?? null,
        p2ms: this._phases['extract-relations']?.durationMs ?? null,

        entities: ctx.stats.entitiesExtracted || 0,
        relations: ctx.stats.relationsFound   || 0,
        vectors:  ctx.stats.vectorsIndexed    || 0,
        chunks:   ctx.stats.chunksCount       || 0,

        avgConf,
        kqs:      kqsScore,
        triangle: _triangleScore(pp),

        errors:   this._errors.length,
        warnings: this._warnings.length,

        ts,
      }
    );

    // Link to Document
    await mg().runQuery(
      `MATCH (d:Document {id: $docId}), (m:ExtractionMetrics {id: $mId})
       MERGE (d)-[:HAS_METRICS]->(m)`,
      { docId: this.documentId, mId: metricsId }
    ).catch(() => {});

    // Link to Methodology
    if (ctx.methodologyId) {
      await mg().runQuery(
        `MATCH (m:ExtractionMetrics {id: $mId}), (meth:Methodology {id: $methId})
         MERGE (m)-[:USED_METHODOLOGY]->(meth)`,
        { mId: metricsId, methId: ctx.methodologyId }
      ).catch(() => {});
    }

    ctx.metricsId = metricsId;
    return metricsId;
  }
}

function _triangleScore(pp) {
  const edges = pp?.buildTriangle?.edges || {};
  const total = (edges.governs || 0) + (edges.operationalizes || 0) + (edges.revealsGapIn || 0);
  return total > 0 ? Math.min(1.0, total / 10) : null;
}

/**
 * Factory service — creates collectors and can query aggregate metrics.
 */
class MetricsCollectorService {
  start(ctx) {
    return new ExtractionMetricsCollector(ctx.extractionJobId, ctx.sourceId);
  }

  async getMetricsForDocument(documentId) {
    const rows = await mg().runQuery(
      `MATCH (d:Document {id: $docId})-[:HAS_METRICS]->(m:ExtractionMetrics)
       RETURN m ORDER BY m.extractedAt DESC LIMIT 10`,
      { docId: documentId }
    );
    return rows.map(r => r.m || r);
  }

  async getAggregateStats({ documentType = null, methodologyId = null, limit = 100 } = {}) {
    const conds = [];
    const p = {};
    if (documentType) { conds.push('m.documentType = $docType'); p.docType = documentType; }
    if (methodologyId){ conds.push('m.methodologyId = $methId'); p.methId = methodologyId; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rows = await mg().runQuery(
      `MATCH (m:ExtractionMetrics) ${where}
       RETURN m.documentType AS docType,
              m.methodologyId AS methodologyId,
              avg(m.kqsScore) AS avgKqs,
              avg(m.avgConfidence) AS avgConf,
              avg(m.totalDurationMs) AS avgDurationMs,
              count(m) AS sampleSize
       ORDER BY avgKqs DESC
       LIMIT $limit`,
      { ...p, limit }
    );
    return rows;
  }
}

const metricsCollectorService = new MetricsCollectorService();
module.exports = { metricsCollectorService, MetricsCollectorService, ExtractionMetricsCollector };
