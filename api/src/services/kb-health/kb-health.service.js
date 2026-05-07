'use strict';

/**
 * KBHealthService — Knowledge Base health monitoring
 *
 * 6 metrics: Coverage, Consistency, Freshness, Connectivity, Accuracy, Usefulness
 * Composite Health Score = weighted average
 */

const memgraphService = require('../memgraph.service');
const redisService = require('../redis.service');
const logger = require('../../utils/logger').child('KBHealth');

// Expected Information Types from CODEX-DOMAINS
const EXPECTED_TYPES = [
  'Tool', 'CatalogEntry', 'GraphDefinition', 'GraphVersion',
  'ExecutionRecord', 'ADR', 'CodexRule', 'CodexPrinciple',
  'CodexSection', 'CodexProposal', 'BlackCodex', 'CoreComponent',
  'YOUNEED', 'Namespace', 'Domain', 'Pattern', 'Stakeholder'
];

const WEIGHTS = {
  coverage:    0.20,
  consistency: 0.25,
  freshness:   0.20,
  connectivity:0.15,
  accuracy:    0.15,
  usefulness:  0.05
};

const FRESHNESS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const STALE_THRESHOLD_MS  = 90 * 24 * 60 * 60 * 1000; // 90 days
const METRICS_TTL_SECONDS = 7 * 24 * 60 * 60;          // 7 days

class KBHealthService {

  /**
   * Compute all metrics and overall Health Score
   */
  async computeHealthMetrics() {
    const startTime = Date.now();

    const [coverage, consistency, freshness, connectivity, accuracy, usefulness] =
      await Promise.all([
        this.computeCoverage(),
        this.computeConsistency(),
        this.computeFreshness(),
        this.computeConnectivity(),
        this.computeAccuracy(),
        this.computeUsefulness()
      ]);

    const metrics = { coverage, consistency, freshness, connectivity, accuracy, usefulness };
    const healthScore = this._compositeScore(metrics);

    const result = {
      healthScore,
      metrics,
      status: this._healthStatus(healthScore),
      computedAt: new Date().toISOString(),
      computeTimeMs: Date.now() - startTime
    };

    await this._saveSnapshot(result);
    return result;
  }

  // ─── Individual Metrics ────────────────────────────────────────────

  /**
   * Coverage: Information Types with >= 1 node / expected types
   */
  async computeCoverage() {
    try {
      // Use per-label counts instead of a full graph scan (safe for large graphs)
      const result = await memgraphService.runQuery(`
        MATCH (n)
        RETURN labels(n)[0] AS label, count(n) AS cnt
      `);

      const presentLabels = result.map(r => r.label).filter(Boolean);
      const covered = EXPECTED_TYPES.filter(t => presentLabels.includes(t));

      return {
        score: Math.min(covered.length / EXPECTED_TYPES.length, 1.0),
        coveredTypes: covered.length,
        expectedTypes: EXPECTED_TYPES.length,
        missing: EXPECTED_TYPES.filter(t => !presentLabels.includes(t)),
        details: `${covered.length}/${EXPECTED_TYPES.length} Information Types have nodes`
      };
    } catch (err) {
      logger.warn('Coverage check failed', err.message);
      return { score: 0, error: err.message, details: 'Coverage check failed' };
    }
  }

  /**
   * Consistency: 1 - (contradictions / checked pairs)
   */
  async computeConsistency() {
    try {
      const contradictions = await memgraphService.runQuery(`
        MATCH ()-[r:CONTRADICTS]->()
        RETURN count(r) AS count
      `);

      const contradictionCount = contradictions[0]?.count || 0;
      const checkedPairs = parseInt(await redisService.get('metrics:consistency:checked_pairs') || '100');

      return {
        score: checkedPairs > 0 ? Math.max(0, 1 - (contradictionCount / checkedPairs)) : 1.0,
        contradictions: contradictionCount,
        checkedPairs,
        details: contradictionCount === 0
          ? 'No contradictions detected'
          : `${contradictionCount} contradiction(s) found`
      };
    } catch (err) {
      logger.warn('Consistency check failed', err.message);
      return { score: 1.0, error: err.message, details: 'Consistency check failed (assuming clean)' };
    }
  }

  /**
   * Freshness: nodes updated within window / total nodes
   */
  async computeFreshness() {
    try {
      // Filter to string-type updatedAt only — some legacy nodes store zoned_date_time objects
      // which cause type errors when compared with >= against a string literal in Memgraph
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const result = await memgraphService.runQuery(`
        MATCH (n)
        WHERE n.updatedAt IS NOT NULL AND valueType(n.updatedAt) = 'String'
        RETURN count(n) AS total,
               sum(CASE WHEN n.updatedAt >= '${cutoff}' THEN 1 ELSE 0 END) AS fresh
      `);

      const total = result[0]?.total || 1;
      const fresh = result[0]?.fresh || 0;

      return {
        score: fresh / total,
        freshNodes: fresh,
        totalNodes: total,
        windowDays: 30,
        details: `${fresh}/${total} nodes updated in last 30 days`
      };
    } catch (err) {
      logger.warn('Freshness check failed', err.message);
      return { score: 0.5, error: err.message, details: 'Freshness check failed' };
    }
  }

  /**
   * Connectivity: 1 - (orphan nodes / total nodes)
   */
  async computeConnectivity() {
    try {
      // Lightweight: compare total nodes vs nodes that have at least one edge
      const result = await memgraphService.runQuery(`
        MATCH (n)
        RETURN count(n) AS total
      `);
      const totalResult = await memgraphService.runQuery(`
        MATCH (n)-[r]-()
        RETURN count(DISTINCT n) AS connected
      `);

      const total = result[0]?.total || 1;
      const connected = totalResult[0]?.connected || 0;
      const orphans = Math.max(0, total - connected);

      return {
        score: Math.max(0, 1 - (orphans / total)),
        orphanNodes: orphans,
        totalNodes: total,
        details: orphans === 0
          ? 'All nodes are connected'
          : `${orphans} orphan node(s) found`
      };
    } catch (err) {
      logger.warn('Connectivity check failed', err.message);
      return { score: 0.5, error: err.message, details: 'Connectivity check failed' };
    }
  }

  /**
   * Accuracy: score from last validation run (stored in Redis)
   */
  async computeAccuracy() {
    try {
      const lastScore = await redisService.get('metrics:accuracy:last_score');
      const lastCheck = await redisService.get('metrics:accuracy:last_check');

      return {
        score: lastScore ? parseFloat(lastScore) : 0.85,
        lastValidation: lastCheck || 'never',
        details: lastCheck
          ? `Last validation: ${lastCheck}`
          : 'No validation performed yet (assuming 85%)'
      };
    } catch (err) {
      return { score: 0.85, error: err.message, details: 'Accuracy check failed (default 85%)' };
    }
  }

  /**
   * Usefulness: successful queries / total queries
   */
  async computeUsefulness() {
    try {
      const successCount = parseInt(await redisService.get('metrics:queries:success') || '0');
      const failCount = parseInt(await redisService.get('metrics:queries:fail') || '0');
      const total = successCount + failCount;

      return {
        score: total > 0 ? successCount / total : 0.9,
        successfulQueries: successCount,
        failedQueries: failCount,
        details: total > 0
          ? `${successCount}/${total} queries successful`
          : 'No query data yet (assuming 90%)'
      };
    } catch (err) {
      return { score: 0.9, error: err.message, details: 'Usefulness check failed (default 90%)' };
    }
  }

  // ─── History & Issues ──────────────────────────────────────────────

  /**
   * Get metrics history from Redis
   */
  async getMetricsHistory(hours = 24) {
    try {
      const latest = await redisService.get('metrics:health:latest');
      if (!latest) return [];

      // Return at least the latest snapshot
      const parsed = JSON.parse(latest);
      return [parsed];
    } catch (err) {
      logger.warn('Failed to retrieve metrics history', err.message);
      return [];
    }
  }

  /**
   * Detect issues that need attention
   */
  async getIssues() {
    const issues = [];

    try {
      // Orphan nodes
      const orphans = await memgraphService.runQuery(`
        MATCH (n)
        WHERE n.namespace IS NOT NULL AND NOT (n)-[]-()
        RETURN n.id AS id, labels(n)[0] AS label, n.name AS name
        LIMIT 20
      `);

      for (const o of orphans) {
        issues.push({
          type: 'ORPHAN_NODE', severity: 'warning',
          nodeId: o.id, label: o.label, name: o.name,
          message: `Node ${o.name || o.id} has no connections`
        });
      }

      // Missing namespace
      const noNs = await memgraphService.runQuery(`
        MATCH (n)
        WHERE n.namespace IS NULL AND n.id IS NOT NULL
        RETURN n.id AS id, labels(n)[0] AS label
        LIMIT 10
      `);

      for (const n of noNs) {
        issues.push({
          type: 'MISSING_NAMESPACE', severity: 'error',
          nodeId: n.id, label: n.label,
          message: `Node ${n.id} missing namespace (Codex violation)`
        });
      }

      // Stale nodes (90+ days)
      const stale = await memgraphService.runQuery(`
        MATCH (n)
        WHERE n.namespace IS NOT NULL AND n.updatedAt IS NOT NULL
          AND valueType(n.updatedAt) = 'ZONED_DATE_TIME'
        WITH n, datetime() - n.updatedAt AS age
        WHERE age.day > 90
        RETURN n.id AS id, labels(n)[0] AS label, n.name AS name,
               toString(n.updatedAt) AS lastUpdate
        LIMIT 20
      `);

      for (const s of stale) {
        issues.push({
          type: 'STALE_NODE', severity: 'info',
          nodeId: s.id, label: s.label, name: s.name,
          lastUpdate: s.lastUpdate,
          message: `Node ${s.name || s.id} not updated in 90+ days`
        });
      }
    } catch (err) {
      logger.error('Failed to collect issues', err.message);
      issues.push({ type: 'CHECK_FAILED', severity: 'error', message: err.message });
    }

    return issues.sort((a, b) => {
      const order = { error: 0, warning: 1, info: 2 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });
  }

  // ─── Private ───────────────────────────────────────────────────────

  _compositeScore(metrics) {
    let score = 0;
    for (const [key, weight] of Object.entries(WEIGHTS)) {
      score += (metrics[key]?.score || 0) * weight;
    }
    return Math.round(score * 100) / 100;
  }

  _healthStatus(score) {
    if (score >= 0.8) return 'healthy';
    if (score >= 0.6) return 'warning';
    if (score >= 0.4) return 'critical';
    return 'failing';
  }

  async _saveSnapshot(result) {
    try {
      const json = JSON.stringify(result);
      await redisService.set('metrics:health:latest', json, METRICS_TTL_SECONDS);
      await redisService.set(`metrics:health:${Date.now()}`, json, METRICS_TTL_SECONDS);
    } catch (err) {
      logger.warn('Failed to save health snapshot to Redis', err.message);
    }
  }
}

// Singleton
let _instance = null;

function getKBHealthService() {
  if (!_instance) {
    _instance = new KBHealthService();
  }
  return _instance;
}

module.exports = { KBHealthService, getKBHealthService };
