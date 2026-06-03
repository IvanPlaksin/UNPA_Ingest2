'use strict';
/**
 * GapDetectionService
 *
 * Automated detection of completeness gaps in the Knowledge Triangle:
 *   - Processes without normative coverage (no GOVERNS from L0-L2)
 *   - Processes without operational documentation (no OPERATIONALIZES from L3)
 *   - Processes without empirical validation (no REVEALS_GAP_IN from L4)
 *   - Stale open gaps (unaddressed beyond threshold days)
 *   - Namespace-level completeness statistics
 */

const { v4: uuidv4 } = require('uuid');
const { knowledgeTriangleService } = require('./knowledge-triangle.service');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }
let _neo4j = null;
function neo4j() { if (!_neo4j) _neo4j = require('neo4j-driver'); return _neo4j; }

// Stale gap threshold: gaps OPEN beyond this many days need escalation
const STALE_GAP_DAYS_DEFAULT  = 90;
const REVIEW_GAP_DAYS_DEFAULT = 180;

class GapDetectionService {

  // ─── Detection queries ────────────────────────────────────────────────────

  /**
   * Find KnowledgeNode processes without normative coverage (no GOVERNS from L0-L2).
   */
  async findProcessesWithoutNormative({ namespace, limit = 50 } = {}) {
    // COLLECT approach for Memgraph compatibility (NOT pattern and EXISTS() unsupported)
    let cypher = `MATCH (proc:KnowledgeNode)
                  OPTIONAL MATCH (norm:KnowledgeNode)-[:GOVERNS]->(proc)
                  WITH proc, collect(norm) AS norms
                  WHERE size(norms) = 0`;
    if (namespace) cypher += ` AND proc.namespace = $ns`;
    cypher += ` RETURN proc.id as id, proc.content as content,
                       proc.epistemicLayer as epistemicLayer,
                       proc.documentType as documentType
                LIMIT $limit`;
    return mg().runQuery(cypher, { ns: namespace || null, limit: neo4j().int(limit) });
  }

  /**
   * Find KnowledgeNode processes without operational documentation (no OPERATIONALIZES from L3).
   */
  async findProcessesWithoutOperational({ namespace, limit = 50 } = {}) {
    let cypher = `MATCH (proc:KnowledgeNode)
                  OPTIONAL MATCH (op:KnowledgeNode)-[:OPERATIONALIZES]->(proc)
                  WITH proc, collect(op) AS ops
                  WHERE size(ops) = 0`;
    if (namespace) cypher += ` AND proc.namespace = $ns`;
    cypher += ` RETURN proc.id as id, proc.content as content,
                       proc.epistemicLayer as epistemicLayer,
                       proc.documentType as documentType
                LIMIT $limit`;
    return mg().runQuery(cypher, { ns: namespace || null, limit: neo4j().int(limit) });
  }

  /**
   * Find KnowledgeNode processes without empirical validation (no REVEALS_GAP_IN chain from L4).
   * Note: Absence of L4 findings may mean "good compliance" or "not yet audited" — context-dependent.
   */
  async findProcessesWithoutEmpirical({ namespace, layer, limit = 50 } = {}) {
    let cypher = `MATCH (proc:KnowledgeNode)
                  OPTIONAL MATCH (gap:Gap)-[:AFFECTS]->(proc)
                  WITH proc, collect(gap) AS gaps`;
    const conditions = ['size(gaps) = 0'];
    if (namespace) conditions.push('proc.namespace = $ns');
    if (layer)     conditions.push('proc.epistemicLayer = $layer');
    cypher += ` WHERE ${conditions.join(' AND ')}`;
    cypher += ` RETURN proc.id as id, proc.content as content,
                       proc.epistemicLayer as epistemicLayer,
                       proc.documentType as documentType
                LIMIT $limit`;
    return mg().runQuery(cypher, { ns: namespace || null, layer: layer || null, limit: neo4j().int(limit) });
  }

  /**
   * Find open gaps that have not been addressed beyond a threshold number of days.
   * @param {number} daysOld - gaps open for more than this many days
   */
  async findStaleGaps({ daysOld = STALE_GAP_DAYS_DEFAULT, severity, limit = 50 } = {}) {
    const cutoff = new Date(Date.now() - daysOld * 86400000).toISOString();
    let cypher = `MATCH (gap:Gap)
                  WHERE gap.status IN ['OPEN', 'ACKNOWLEDGED']
                    AND gap.identifiedAt < $cutoff`;
    if (severity) cypher += ` AND gap.severity = $severity`;
    cypher += ` RETURN gap.id as id, gap.gapType as gapType, gap.severity as severity,
                       gap.status as status, gap.title as title,
                       gap.identifiedAt as identifiedAt, gap.affectedProcess as affectedProcess,
                       gap.identifiedBy as identifiedBy
                ORDER BY gap.identifiedAt ASC
                LIMIT $limit`;
    return mg().runQuery(cypher, {
      cutoff,
      severity: severity || null,
      limit: neo4j().int(limit)
    });
  }

  /**
   * Find gaps that require management review (open beyond reviewThresholdDays).
   */
  async findGapsRequiringReview({ daysOld = REVIEW_GAP_DAYS_DEFAULT, limit = 50 } = {}) {
    return this.findStaleGaps({ daysOld, limit });
  }

  /**
   * Aggregate gap statistics: count by status, severity, and age distribution.
   */
  async getGapStatistics({ namespace } = {}) {
    const [byStatus, bySeverity, openCount] = await Promise.all([
      mg().runQuery(
        `MATCH (gap:Gap) RETURN gap.status as status, count(gap) as count ORDER BY count DESC`,
        {}
      ),
      mg().runQuery(
        `MATCH (gap:Gap {status: 'OPEN'})
         RETURN gap.severity as severity, count(gap) as count ORDER BY count DESC`,
        {}
      ),
      mg().runQuery(
        `MATCH (gap:Gap {status: 'OPEN'})
         RETURN count(gap) as total,
                count(CASE WHEN gap.severity = 'HIGH'   THEN 1 END) as high,
                count(CASE WHEN gap.severity = 'MEDIUM' THEN 1 END) as medium,
                count(CASE WHEN gap.severity = 'LOW'    THEN 1 END) as low`,
        {}
      )
    ]);

    const oc = openCount[0] || { total: 0, high: 0, medium: 0, low: 0 };
    return {
      byStatus:   byStatus.map(r => ({ status: r.status, count: r.count })),
      bySeverity: bySeverity.map(r => ({ severity: r.severity, count: r.count })),
      openSummary: {
        total:  oc.total  || 0,
        high:   oc.high   || 0,
        medium: oc.medium || 0,
        low:    oc.low    || 0
      }
    };
  }

  /**
   * Calculate average completeness across all processes (or namespace).
   */
  async getNamespaceCompleteness({ namespace, sampleLimit = 100 } = {}) {
    let cypher = `MATCH (proc:KnowledgeNode)`;
    if (namespace) cypher += ` WHERE proc.namespace = $ns`;
    cypher += ` RETURN proc.id as id LIMIT $limit`;
    const procs = await mg().runQuery(cypher, {
      ns: namespace || null,
      limit: neo4j().int(sampleLimit)
    });

    if (!procs.length) return { processCount: 0, avgCompleteness: 0, distribution: {} };

    const results = await Promise.all(
      procs.map(r => knowledgeTriangleService.getTriangleCompleteness(r.id).catch(() => null))
    );
    const valid = results.filter(r => r !== null);
    const avgCompleteness = valid.length > 0
      ? valid.reduce((sum, r) => sum + r.completeness, 0) / valid.length
      : 0;

    const distribution = { full: 0, partial: 0, minimal: 0, none: 0 };
    for (const r of valid) {
      if (r.completeness >= 0.9)       distribution.full++;
      else if (r.completeness >= 0.5)  distribution.partial++;
      else if (r.completeness > 0)     distribution.minimal++;
      else                             distribution.none++;
    }

    return {
      processCount: valid.length,
      avgCompleteness: Math.round(avgCompleteness * 1000) / 1000,
      distribution,
      namespace: namespace || 'all'
    };
  }

  // ─── Full detection run ───────────────────────────────────────────────────

  /**
   * Run all gap detection checks and optionally persist a GapDetectionReport node.
   *
   * @param {Object} options
   * @param {string}  options.namespace
   * @param {number}  options.staleThresholdDays  (default: 90)
   * @param {number}  options.reviewThresholdDays (default: 180)
   * @param {boolean} options.persist             (default: false)
   * @returns {Object} Detection results
   */
  async runGapDetection({ namespace, staleThresholdDays, reviewThresholdDays, persist = false } = {}) {
    const staleDays  = staleThresholdDays  || STALE_GAP_DAYS_DEFAULT;
    const reviewDays = reviewThresholdDays || REVIEW_GAP_DAYS_DEFAULT;

    const [
      withoutNormative,
      withoutOperational,
      withoutEmpirical,
      staleGaps,
      gapsForReview,
      statistics
    ] = await Promise.all([
      this.findProcessesWithoutNormative({ namespace }),
      this.findProcessesWithoutOperational({ namespace }),
      this.findProcessesWithoutEmpirical({ namespace }),
      this.findStaleGaps({ daysOld: staleDays }),
      this.findGapsRequiringReview({ daysOld: reviewDays }),
      this.getGapStatistics({ namespace })
    ]);

    const report = {
      timestamp: new Date().toISOString(),
      namespace: namespace || 'all',
      processesWithoutNormative:   { count: withoutNormative.length,   items: withoutNormative },
      processesWithoutOperational: { count: withoutOperational.length, items: withoutOperational },
      processesWithoutEmpirical:   { count: withoutEmpirical.length,   items: withoutEmpirical },
      staleGaps:     { count: staleGaps.length,    threshold: `${staleDays} days`,  items: staleGaps },
      gapsForReview: { count: gapsForReview.length, threshold: `${reviewDays} days`, items: gapsForReview },
      statistics
    };

    if (persist) {
      await this._persistReport(report);
    }

    return report;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  async _persistReport(report) {
    const id  = uuidv4();
    const now = report.timestamp;
    await mg().runQuery(
      `CREATE (r:GapDetectionReport {
         id: $id,
         namespace: $ns,
         processesWithoutNormative:   $pNorm,
         processesWithoutOperational: $pOp,
         processesWithoutEmpirical:   $pEmp,
         staleGapsCount:   $sg,
         reviewGapsCount:  $rg,
         openGapsTotal:    $og,
         createdAt: $now
       }) RETURN r.id`,
      {
        id, now,
        ns:    report.namespace,
        pNorm: report.processesWithoutNormative.count,
        pOp:   report.processesWithoutOperational.count,
        pEmp:  report.processesWithoutEmpirical.count,
        sg:    report.staleGaps.count,
        rg:    report.gapsForReview.count,
        og:    report.statistics.openSummary.total
      }
    );
    return id;
  }
}

const gapDetectionService = new GapDetectionService();
module.exports = {
  gapDetectionService,
  GapDetectionService,
  STALE_GAP_DAYS_DEFAULT,
  REVIEW_GAP_DAYS_DEFAULT
};
