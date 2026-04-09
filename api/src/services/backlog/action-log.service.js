/**
 * ActionLog Service — Records agent actions and motivations on BackLog tasks.
 *
 * Each entry is stored as an ActionLogEntry node linked to BackLogItem
 * via HAS_ACTION_LOG relationship. Provides a chronological audit trail
 * of all work performed on a task (CODEX-RULE-BA-060).
 */
'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

const CATEGORIES = ['ANALYSIS', 'IMPLEMENTATION', 'TESTING', 'DECISION', 'COMMUNICATION', 'ERROR', 'NOTE'];

class ActionLogService {
  /**
   * Add an action log entry to a task.
   * @param {string} backlogId - e.g. BACKLOG-0001
   * @param {object} entry - { action, motivation, category, metadata? }
   * @param {object} ctx - { agentId }
   */
  async addEntry(backlogId, entry, ctx = {}) {
    const { action, motivation, category, metadata } = entry;
    if (!action || action.length < 5) throw new Error('action is required (min 5 chars)');
    if (!motivation || motivation.length < 5) throw new Error('motivation is required (min 5 chars)');
    if (category && !CATEGORIES.includes(category)) {
      throw new Error(`Invalid category: ${category}. Valid: ${CATEGORIES.join(', ')}`);
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    // Get next sequence number for this task
    const seqResult = await mg().runQuery(
      `MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_ACTION_LOG]->(a:ActionLogEntry)
       RETURN count(a) AS cnt`,
      { backlogId }
    );
    const sequence = (seqResult[0]?.cnt ?? 0) + 1;

    await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})
      CREATE (e:ActionLogEntry {
        id: $id, nodeType: 'ActionLogEntry',
        backlogId: $backlogId, sequence: $sequence,
        action: $action, motivation: $motivation,
        category: $category, metadata: $metadata,
        agentId: $agentId, timestamp: $now
      })
      CREATE (b)-[:HAS_ACTION_LOG {addedAt: $now}]->(e)
      RETURN e
    `, {
      backlogId, id, sequence,
      action, motivation,
      category: category || 'NOTE',
      metadata: metadata ? JSON.stringify(metadata) : '{}',
      agentId: ctx.agentId || 'unknown',
      now
    });

    return { id, backlogId, sequence, action, motivation, category: category || 'NOTE', agentId: ctx.agentId, timestamp: now };
  }

  /**
   * Get all action log entries for a task, ordered chronologically.
   */
  async getEntries(backlogId) {
    const rows = await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_ACTION_LOG]->(e:ActionLogEntry)
      RETURN e ORDER BY e.sequence ASC
    `, { backlogId });

    return rows.map(r => {
      const e = r.e.properties || r.e;
      let metadata = e.metadata;
      if (typeof metadata === 'string') {
        try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
      }
      return { ...e, metadata };
    });
  }
}

module.exports = new ActionLogService();
