'use strict';

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

function _n(v) { return typeof v === 'object' ? (v?.low ?? 0) : (v || 0); }
function _f(v) { return typeof v === 'object' ? (v?.low ?? null) : (v ?? null); }

/**
 * MetricsAnalysisService — aggregation queries over ExtractionMetrics nodes.
 * Used by Rule Derivation Engine (P6) and admin dashboards.
 */
class MetricsAnalysisService {

  /** Average KQS grouped by documentType × methodologyId */
  async kqsByDocTypeAndMethodology({ minSamples = 3, limit = 50 } = {}) {
    const rows = await mg().runQuery(
      `MATCH (m:ExtractionMetrics)
       WHERE m.kqsScore IS NOT NULL AND m.documentType IS NOT NULL
       WITH m.documentType AS docType, m.methodologyId AS methodId,
            avg(m.kqsScore) AS avgKqs,
            avg(m.avgConfidence) AS avgConf,
            count(m) AS sampleSize
       WHERE sampleSize >= $min
       RETURN docType, methodId, avgKqs, avgConf, sampleSize
       ORDER BY avgKqs DESC
       LIMIT $limit`,
      { min: minSamples, limit }
    );
    return rows.map(r => ({
      documentType:  r.docType,
      methodologyId: r.methodId || null,
      avgKqs:        _f(r.avgKqs),
      avgConf:       _f(r.avgConf),
      sampleSize:    _n(r.sampleSize),
    }));
  }

  /** Confidence distribution by epistemicLayer */
  async confidenceByLayer({ limit = 20 } = {}) {
    const rows = await mg().runQuery(
      `MATCH (m:ExtractionMetrics)
       WHERE m.epistemicLayer IS NOT NULL AND m.avgConfidence IS NOT NULL
       WITH m.epistemicLayer AS layer,
            avg(m.avgConfidence)  AS avgConf,
            min(m.avgConfidence)  AS minConf,
            max(m.avgConfidence)  AS maxConf,
            count(m) AS sampleSize
       RETURN layer, avgConf, minConf, maxConf, sampleSize
       ORDER BY layer
       LIMIT $limit`,
      { limit }
    );
    return rows.map(r => ({
      layer:      r.layer,
      avgConf:    _f(r.avgConf),
      minConf:    _f(r.minConf),
      maxConf:    _f(r.maxConf),
      sampleSize: _n(r.sampleSize),
    }));
  }

  /** Extraction duration vs document size (chars) */
  async durationVsSize({ limit = 200 } = {}) {
    const rows = await mg().runQuery(
      `MATCH (d:Document)-[:HAS_METRICS]->(m:ExtractionMetrics)
       WHERE m.totalDurationMs IS NOT NULL
       RETURN d.fileSize AS fileSize,
              m.totalDurationMs AS durationMs,
              m.entitiesExtracted AS entities,
              m.methodologyId AS methodId,
              m.documentType AS docType
       LIMIT $limit`,
      { limit }
    );
    return rows.map(r => ({
      fileSize:   _n(r.fileSize),
      durationMs: _n(r.durationMs),
      entities:   _n(r.entities),
      methodologyId: r.methodId || null,
      documentType:  r.docType  || null,
    }));
  }

  /** Best methodology per documentType (ranked by avg KQS) */
  async bestMethodologyPerDocType({ minSamples = 3 } = {}) {
    const rows = await mg().runQuery(
      `MATCH (m:ExtractionMetrics)-[:USED_METHODOLOGY]->(meth:Methodology)
       WHERE m.kqsScore IS NOT NULL AND m.documentType IS NOT NULL
       WITH m.documentType AS docType, meth.id AS methId, meth.name AS methName,
            avg(m.kqsScore) AS avgKqs, count(m) AS sampleSize
       WHERE sampleSize >= $min
       WITH docType, collect({methId: methId, methName: methName, avgKqs: avgKqs, sampleSize: sampleSize}) AS candidates
       RETURN docType, candidates[0] AS best
       ORDER BY docType`,
      { min: minSamples }
    );
    return rows.map(r => ({
      documentType: r.docType,
      best: r.best || null,
    }));
  }

  /** Overall pipeline health summary */
  async healthSummary({ days = 30 } = {}) {
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const rows = await mg().runQuery(
      `MATCH (m:ExtractionMetrics)
       WHERE m.extractedAt > $since
       RETURN count(m) AS totalRuns,
              avg(m.kqsScore) AS avgKqs,
              avg(m.avgConfidence) AS avgConf,
              avg(m.totalDurationMs) AS avgDurationMs,
              sum(m.entitiesExtracted) AS totalEntities,
              sum(m.errorCount) AS totalErrors,
              sum(m.relationsFound) AS totalRelations`,
      { since }
    );
    const r = rows[0] || {};
    return {
      period:          `${days}d`,
      totalRuns:       _n(r.totalRuns),
      avgKqs:          _f(r.avgKqs),
      avgConf:         _f(r.avgConf),
      avgDurationMs:   _f(r.avgDurationMs),
      totalEntities:   _n(r.totalEntities),
      totalRelations:  _n(r.totalRelations),
      totalErrors:     _n(r.totalErrors),
    };
  }
}

const metricsAnalysisService = new MetricsAnalysisService();
module.exports = { metricsAnalysisService, MetricsAnalysisService };
