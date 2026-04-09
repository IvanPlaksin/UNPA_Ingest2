/**
 * CodexValidationService — runs all registered checks and produces compliance reports
 */

const { CodexRuleRegistry } = require('./rule-registry');
const { CodexValidationEngine } = require('./validation-engine');

let _memgraph = null;
function getMemgraph() {
  if (!_memgraph) _memgraph = require('../../memgraph.service');
  return _memgraph;
}

class CodexValidationService {
  constructor() {
    this.registry = new CodexRuleRegistry();
    this.engine = null; // lazy init after memgraph connects
  }

  _getEngine() {
    if (!this.engine) {
      this.engine = new CodexValidationEngine(getMemgraph());
    }
    return this.engine;
  }

  /**
   * Run all checks against the KB
   */
  async validateAll(options = {}) {
    const { includeInfo = false, maxViolations = 500, scopes = null } = options;
    const startTime = Date.now();
    const engine = this._getEngine();
    const allViolations = [];
    const checkResults = [];

    let checks = this.registry.getAll();
    if (scopes) checks = checks.filter(c => scopes.includes(c.scope));
    if (!includeInfo) checks = checks.filter(c => c.severity !== 'info');

    for (const check of checks) {
      const result = await engine.executeCheck(check);
      checkResults.push({
        checkId: check.checkId,
        checkName: check.name,
        scope: check.scope,
        severity: check.severity,
        violations: result.violations?.length || 0,
        error: result.error || null
      });

      if (result.violations) {
        allViolations.push(...result.violations);
        if (allViolations.length >= maxViolations) break;
      }
    }

    const summary = this._aggregate(allViolations);
    const complianceScore = this._score(summary);

    const report = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      checksRun: checkResults.length,
      summary,
      violations: allViolations.slice(0, maxViolations),
      checkResults,
      complianceScore
    };

    await this._storeReport(report);
    return report;
  }

  /**
   * Get latest stored report
   */
  async getLatestReport() {
    const mg = getMemgraph();
    const result = await mg.runQuery(`
      MATCH (r:ValidationReport)
      RETURN r
      ORDER BY r.timestamp DESC
      LIMIT 1
    `);
    if (!result.length) return null;
    const r = result[0].r?.properties || result[0].r;
    return {
      ...r,
      summary: typeof r.summary === 'string' ? JSON.parse(r.summary) : r.summary,
      checkResults: typeof r.checkResults === 'string' ? JSON.parse(r.checkResults) : r.checkResults
    };
  }

  /**
   * Report history (for trend chart)
   */
  async getReportHistory(limit = 10) {
    const mg = getMemgraph();
    const results = await mg.runQuery(`
      MATCH (r:ValidationReport)
      RETURN r.timestamp as timestamp, r.complianceScore as score,
             r.totalViolations as violations, r.checksRun as checks
      ORDER BY r.timestamp DESC
      LIMIT ${Math.floor(Number(limit)) || 10}
    `);
    return results;
  }

  // ── Private ──────────────────────────────────────────────

  _aggregate(violations) {
    const bySeverity = { error: 0, warning: 0, info: 0 };
    const byCheck = {};
    const byLabel = {};

    for (const v of violations) {
      bySeverity[v.severity] = (bySeverity[v.severity] || 0) + 1;
      byCheck[v.checkName] = (byCheck[v.checkName] || 0) + 1;
      if (v.label) byLabel[v.label] = (byLabel[v.label] || 0) + 1;
    }

    return { total: violations.length, bySeverity, byCheck, byLabel };
  }

  _score(summary) {
    const penalty =
      (summary.bySeverity.error || 0) * 10 +
      (summary.bySeverity.warning || 0) * 2 +
      (summary.bySeverity.info || 0) * 0.5;
    return Math.max(0, Math.round((100 - penalty) * 100) / 100);
  }

  async _storeReport(report) {
    const mg = getMemgraph();
    try {
      await mg.runQuery(`
        CREATE (r:ValidationReport {
          timestamp: $ts,
          duration: $dur,
          checksRun: $checks,
          totalViolations: $total,
          complianceScore: $score,
          summary: $summary,
          checkResults: $cr
        })
      `, {
        ts: report.timestamp,
        dur: report.duration,
        checks: report.checksRun,
        total: report.summary.total,
        score: report.complianceScore,
        summary: JSON.stringify(report.summary),
        cr: JSON.stringify(report.checkResults)
      });

      // Keep only last 50
      await mg.runQuery(`
        MATCH (r:ValidationReport)
        WITH r ORDER BY r.timestamp DESC
        SKIP 50
        DETACH DELETE r
      `);
    } catch (err) {
      console.error('[CodexValidation] Failed to store report:', err.message);
    }
  }
}

module.exports = { CodexValidationService };
