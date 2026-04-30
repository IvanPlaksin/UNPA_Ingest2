/**
 * BackLog Service — manages BackLogItem nodes in CORE namespace.
 *
 * AI agents create tasks (PROPOSED), humans approve, agents/humans execute.
 * Follows Codex rules CODEX-RULE-BL-001..004.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
const { VALID_TRANSITIONS, TASK_TYPES, TARGET_TYPES } = require('../../validation/backlog-schemas');

let _memgraph = null;
function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}

class BackLogService extends EventEmitter {
  constructor() {
    super();
  }

  // ============================================================
  // CREATE
  // ============================================================

  async create(data, context = {}) {
    const { createdBy = 'system' } = context;

    // Validate required fields (CODEX-RULE-BL-001)
    if (!data.title || data.title.length < 10) throw new Error('Title must be at least 10 characters');
    if (!data.taskType || !TASK_TYPES.includes(data.taskType)) throw new Error(`Invalid taskType. Must be one of: ${TASK_TYPES.join(', ')}`);
    if (!data.targetType || !TARGET_TYPES.includes(data.targetType)) throw new Error(`Invalid targetType. Must be one of: ${TARGET_TYPES.join(', ')}`);
    if (!data.description || data.description.length < 20) throw new Error('Description must be at least 20 characters');
    const criteria = Array.isArray(data.acceptanceCriteria) ? data.acceptanceCriteria : [];
    if (criteria.length === 0) throw new Error('At least one acceptance criterion required (CODEX-RULE-BL-001)');

    const id = uuidv4();
    const backlogId = await this._generateId();
    const now = new Date().toISOString();

    // Agent-created tasks start as PROPOSED (CODEX-RULE-BL-002)
    const isAgent = createdBy.startsWith('agent:') || createdBy.startsWith('agent-');
    const status = isAgent ? 'PROPOSED' : (data.status || 'APPROVED');

    const props = {
      id,
      backlogId,
      namespace: data.namespace || this._inferNamespace(data),
      nodeType: 'BackLogItem',
      title: data.title,
      description: data.description,
      taskType: data.taskType,
      targetType: data.targetType,
      targetPath: data.targetPath || '',
      acceptanceCriteria: JSON.stringify(criteria),
      status,
      priority: data.priority || 'P2_MEDIUM',
      effort: data.effort || 'M',
      createdBy,
      createdAt: now,
      updatedAt: now,
      assignedTo: data.assignedTo || '',
      sourceContext: data.sourceContext || '',
      relatedCodexRules: JSON.stringify(data.relatedCodexRules || []),
      addressesBlackCodex: JSON.stringify(data.addressesBlackCodex || []),
      dependencies: JSON.stringify(data.dependencies || []),
      tags: JSON.stringify(data.tags || []),
      implementationNotes: '',
      implementedFiles: '[]',
      pullRequestUrl: ''
    };

    const result = await mg().runQuery('CREATE (b:BackLogItem $props) RETURN b', { props });
    const created = result[0]?.b?.properties || props;

    // Create IMPLEMENTS relationships to CodexRules
    if (data.relatedCodexRules?.length) {
      for (const ruleId of data.relatedCodexRules) {
        await mg().runQuery(`
          MATCH (b:BackLogItem {backlogId: $bid})
          MATCH (r:CodexRule {codexId: $rid})
          MERGE (b)-[:IMPLEMENTS]->(r)
        `, { bid: backlogId, rid: ruleId }).catch(() => {});
      }
    }

    // Create ADDRESSES relationships to BlackCodex
    if (data.addressesBlackCodex?.length) {
      for (const entryId of data.addressesBlackCodex) {
        await mg().runQuery(`
          MATCH (b:BackLogItem {backlogId: $bid})
          MATCH (bc:BlackCodexEntry {codexId: $eid})
          MERGE (b)-[:ADDRESSES]->(bc)
        `, { bid: backlogId, eid: entryId }).catch(() => {});
      }
    }

    const deserialized = this._deserialize(created);
    this.emit('change', { event: 'task_created', data: deserialized });
    return deserialized;
  }

  // ============================================================
  // READ
  // ============================================================

  async getById(backlogId) {
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})
      OPTIONAL MATCH (b)-[:IMPLEMENTS]->(r:CodexRule)
      OPTIONAL MATCH (b)-[:ADDRESSES]->(bc:BlackCodexEntry)
      OPTIONAL MATCH (b)-[:DEPENDS_ON]->(dep:BackLogItem)
      RETURN b,
             collect(DISTINCT r.codexId) as codexRules,
             collect(DISTINCT bc.codexId) as blackCodexEntries,
             collect(DISTINCT dep.backlogId) as deps
    `, { backlogId });

    if (!result.length) return null;
    const row = result[0];
    const item = this._deserialize(row.b?.properties || row.b);
    item.relatedCodexRules = row.codexRules || [];
    item.addressesBlackCodex = row.blackCodexEntries || [];
    item.dependencies = row.deps || [];
    return item;
  }

  async list(filters = {}) {
    const { status, priority, taskType, assignedTo, createdBy, namespace, limit = 50 } = filters;

    let where = [];
    const params = {};

    // Filter by namespace if specified, otherwise return all BackLogItems
    if (namespace) { where.push('b.namespace = $namespace'); params.namespace = namespace; }

    if (status) { where.push('b.status = $status'); params.status = status; }
    if (priority) { where.push('b.priority = $priority'); params.priority = priority; }
    if (taskType) { where.push('b.taskType = $taskType'); params.taskType = taskType; }
    if (assignedTo) { where.push('b.assignedTo = $assignedTo'); params.assignedTo = assignedTo; }
    if (createdBy) { where.push('b.createdBy = $createdBy'); params.createdBy = createdBy; }

    const safeLimit = Math.floor(Number(limit)) || 50;
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const query = `
      MATCH (b:BackLogItem)
      ${whereClause}
      RETURN b
      ORDER BY
        CASE b.priority
          WHEN 'P0_CRITICAL' THEN 0
          WHEN 'P1_HIGH' THEN 1
          WHEN 'P2_MEDIUM' THEN 2
          ELSE 3
        END,
        b.createdAt DESC
      LIMIT ${safeLimit}
    `;

    const result = await mg().runQuery(query, params);
    return result.map(r => this._deserialize(r.b?.properties || r.b));
  }

  // ============================================================
  // STATE TRANSITIONS
  // ============================================================

  async approve(backlogId, approvedBy) {
    return this._transition(backlogId, 'APPROVED', { approvedBy });
  }

  async reject(backlogId, rejectedBy, reason) {
    if (!reason) throw new Error('Rejection reason required');
    return this._transition(backlogId, 'REJECTED', { rejectedBy, rejectionReason: reason });
  }

  async start(backlogId, assignedTo) {
    return this._transition(backlogId, 'IN_PROGRESS', { assignedTo: assignedTo || '' });
  }

  async block(backlogId, blockedBy, reason) {
    return this._transition(backlogId, 'BLOCKED', { blockedBy: blockedBy || '', blockReason: reason || '' });
  }

  async unblock(backlogId) {
    return this._transition(backlogId, 'IN_PROGRESS', {});
  }

  async submitForReview(backlogId, implementationNotes, implementedFiles) {
    return this._transition(backlogId, 'REVIEW', {
      implementationNotes: implementationNotes || '',
      implementedFiles: JSON.stringify(implementedFiles || [])
    });
  }

  async complete(backlogId, verifiedBy, implementationNotes, implementedFiles) {
    const extra = {
      verifiedBy: verifiedBy || 'system',
      completedAt: new Date().toISOString()
    };
    if (implementationNotes) extra.implementationNotes = implementationNotes;
    if (implementedFiles) extra.implementedFiles = JSON.stringify(implementedFiles);
    return this._transition(backlogId, 'DONE', extra);
  }

  async cancel(backlogId, cancelledBy, reason) {
    return this._transition(backlogId, 'CANCELLED', { cancelledBy: cancelledBy || '', cancelReason: reason || '' });
  }

  async returnToProposed(backlogId, reason) {
    return this._transition(backlogId, 'PROPOSED', {
      returnReason: reason || '',
      assignedTo: ''
    });
  }

  async _transition(backlogId, newStatus, extra = {}) {
    const current = await this.getById(backlogId);
    if (!current) throw new Error(`BackLogItem not found: ${backlogId}`);

    const valid = VALID_TRANSITIONS[current.status] || [];
    if (!valid.includes(newStatus)) {
      throw new Error(`Invalid transition: ${current.status} -> ${newStatus}. Valid: ${valid.join(', ')}`);
    }

    const setParts = [`b.status = $newStatus`, `b.updatedAt = $now`];
    const params = { backlogId, newStatus, now: new Date().toISOString() };

    for (const [k, v] of Object.entries(extra)) {
      setParts.push(`b.${k} = $${k}`);
      params[k] = v;
    }

    const result = await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})
      SET ${setParts.join(', ')}
      RETURN b
    `, params);

    const updated = this._deserialize(result[0]?.b?.properties || result[0]?.b);
    this.emit('change', { event: 'task_updated', data: { ...updated, previousStatus: current.status } });
    return updated;
  }

  // ============================================================
  // DEPENDENCIES (CODEX-RULE-BL-003: acyclic)
  // ============================================================

  async addDependency(backlogId, dependsOnId) {
    if (backlogId === dependsOnId) throw new Error('Cannot depend on self');

    // Check cycle (CODEX-RULE-BL-003)
    const cycleCheck = await mg().runQuery(`
      MATCH path = (start:BackLogItem {backlogId: $to})-[:DEPENDS_ON*]->(end:BackLogItem {backlogId: $from})
      RETURN count(path) as cycleCount
    `, { from: backlogId, to: dependsOnId });

    if (cycleCheck[0]?.cycleCount > 0) {
      throw new Error('Adding this dependency would create a cycle (CODEX-RULE-BL-003)');
    }

    await mg().runQuery(`
      MATCH (a:BackLogItem {backlogId: $backlogId})
      MATCH (b:BackLogItem {backlogId: $dependsOnId})
      MERGE (a)-[:DEPENDS_ON]->(b)
    `, { backlogId, dependsOnId });
  }

  // ============================================================
  // STATISTICS
  // ============================================================

  async getStats(namespace) {
    const whereClause = namespace ? `WHERE b.namespace = '${namespace}'` : '';
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem)
      ${whereClause}
      RETURN b.status as status, b.priority as priority, count(*) as count
    `);

    const byStatus = {};
    const byPriority = {};

    for (const row of result) {
      const count = typeof row.count === 'number' ? row.count : 1;
      byStatus[row.status] = (byStatus[row.status] || 0) + count;
      byPriority[row.priority] = (byPriority[row.priority] || 0) + count;
    }

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const openCount = (byStatus.PROPOSED || 0) + (byStatus.APPROVED || 0) +
                      (byStatus.IN_PROGRESS || 0) + (byStatus.BLOCKED || 0) + (byStatus.REVIEW || 0);

    return { total, openCount, byStatus, byPriority };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  async _generateId() {
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem)
      WHERE b.backlogId STARTS WITH 'BACKLOG-'
      RETURN b.backlogId as id
      ORDER BY b.backlogId DESC
      LIMIT 1
    `);

    if (!result.length) return 'BACKLOG-0001';
    const lastNum = parseInt(result[0].id.split('-')[1], 10);
    return `BACKLOG-${String(lastNum + 1).padStart(4, '0')}`;
  }

  _inferNamespace(data) {
    const tags = Array.isArray(data.tags) ? data.tags : [];
    const path = (data.targetPath || '').toLowerCase();
    const title = (data.title || '').toLowerCase();
    const all = [...tags.map(t => t.toLowerCase()), path, title].join(' ');

    if (all.includes('flowdesk')) return 'FLOWDESK';
    if (all.includes('gxe') || all.includes('graph-builder')) return 'GXE';
    if (all.includes('codex')) return 'CODEX';
    return 'CORE';
  }

  _deserialize(node) {
    if (!node) return null;
    const item = { ...node };
    const jsonFields = ['acceptanceCriteria', 'relatedCodexRules', 'addressesBlackCodex', 'dependencies', 'tags', 'implementedFiles'];
    for (const f of jsonFields) {
      if (typeof item[f] === 'string') {
        try { item[f] = JSON.parse(item[f]); } catch { /* keep string */ }
      }
    }
    return item;
  }
}

module.exports = new BackLogService();
