/**
 * AuditLogger
 *
 * Immutable audit trail for all operator actions on executions.
 * Stored in Redis list + optionally persisted to Memgraph.
 *
 * Actions: LAUNCH, PAUSE, RESUME, CANCEL, ROLLBACK, OVERRIDE_WAIT,
 *          INJECT_VARIABLE, TRIGGER_REGISTER, TRIGGER_ENABLE, TRIGGER_DISABLE
 *
 * @module gxe-manager/AuditLogger
 */

const LOG_TAG = '[AuditLogger]';

const AUDIT_KEY = 'gxe:audit-log';
const MAX_ENTRIES = 10000;

class AuditLogger {
  /**
   * @param {import('ioredis').Redis} redis
   * @param {Object} [memgraphService]
   */
  constructor(redis, memgraphService = null) {
    this.redis = redis;
    this.memgraphService = memgraphService;
  }

  /**
   * Log an audit entry
   * @param {Object} entry
   * @param {string} entry.action - Action type
   * @param {string} [entry.executionId]
   * @param {string} [entry.triggerId]
   * @param {string} [entry.operator] - Who performed the action
   * @param {string} [entry.source] - 'api' | 'signal' | 'system' | 'ui'
   * @param {Object} [entry.details] - Action-specific data
   * @param {Object} [entry.result] - Result of the action
   */
  async log(entry) {
    const record = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      action: entry.action,
      executionId: entry.executionId || null,
      triggerId: entry.triggerId || null,
      operator: entry.operator || 'system',
      source: entry.source || 'api',
      details: entry.details || {},
      result: entry.result || null,
      timestamp: Date.now(),
      iso: new Date().toISOString()
    };

    // Push to Redis list
    try {
      await this.redis.lpush(AUDIT_KEY, JSON.stringify(record));
      await this.redis.ltrim(AUDIT_KEY, 0, MAX_ENTRIES - 1);
    } catch (err) {
      console.error(`${LOG_TAG} Redis write failed:`, err.message);
    }

    // Persist critical actions to Memgraph
    if (this.memgraphService && this._isCritical(record.action)) {
      this._persistToMemgraph(record).catch(err =>
        console.error(`${LOG_TAG} Memgraph persist failed:`, err.message)
      );
    }

    return record;
  }

  /**
   * Query audit log
   * @param {Object} [filters]
   * @param {string} [filters.executionId]
   * @param {string} [filters.action]
   * @param {string} [filters.operator]
   * @param {number} [filters.since] - Epoch ms
   * @param {number} [filters.limit=100]
   * @returns {Promise<Object[]>}
   */
  async query(filters = {}) {
    const limit = filters.limit || 100;
    try {
      const entries = await this.redis.lrange(AUDIT_KEY, 0, limit * 2); // overfetch for filtering
      let records = entries.map(e => JSON.parse(e));

      if (filters.executionId) {
        records = records.filter(r => r.executionId === filters.executionId);
      }
      if (filters.action) {
        records = records.filter(r => r.action === filters.action);
      }
      if (filters.operator) {
        records = records.filter(r => r.operator === filters.operator);
      }
      if (filters.since) {
        records = records.filter(r => r.timestamp >= filters.since);
      }

      return records.slice(0, limit);
    } catch (err) {
      console.error(`${LOG_TAG} Query failed:`, err.message);
      return [];
    }
  }

  _isCritical(action) {
    return ['CANCEL', 'ROLLBACK', 'OVERRIDE_WAIT', 'INJECT_VARIABLE'].includes(action);
  }

  async _persistToMemgraph(record) {
    const session = this.memgraphService.driver
      ? this.memgraphService.driver.session()
      : this.memgraphService.getSession?.();
    if (!session) return;

    try {
      await session.run(`
        CREATE (a:AuditEntry:META {
          auditId: $id,
          action: $action,
          executionId: $executionId,
          operator: $operator,
          source: $source,
          details: $details,
          timestamp: $timestamp
        })
      `, {
        id: record.id,
        action: record.action,
        executionId: record.executionId || '',
        operator: record.operator,
        source: record.source,
        details: JSON.stringify(record.details),
        timestamp: record.timestamp
      });

      // AGE-compatible conditional relationship: separate query (FOREACH not supported in AGE)
      if (record.executionId) {
        await session.run(`
          MATCH (a:AuditEntry:META {auditId: $id})
          MATCH (e:ExecutionRecord:META {executionId: $executionId})
          MERGE (a)-[:AUDITS]->(e)
        `, { id: record.id, executionId: record.executionId });
      }
    } finally {
      await session.close();
    }
  }
}

module.exports = { AuditLogger };
