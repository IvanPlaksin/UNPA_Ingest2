const { v4: uuidv4 } = require('uuid');
const memgraph = require('../memgraph.service');
const backlogService = require('./backlog.service');

const MAX_DEPTH = 3;

class TaskHierarchyService {
  async splitTask(parentBacklogId, subtasks, splitInfo, context = {}) {
    const { splitBy = 'system' } = context;
    const parent = await backlogService.getById(parentBacklogId);
    if (!parent) throw new Error(`Parent not found: ${parentBacklogId}`);
    const parentLevel = parent.level || 1;
    if (parentLevel >= MAX_DEPTH) throw new Error(`Max depth (${MAX_DEPTH}) reached`);
    if (!splitInfo.rationale || splitInfo.rationale.length < 20) throw new Error('Split rationale must be at least 20 chars');
    if (!subtasks || subtasks.length < 2) throw new Error('At least 2 subtasks required');

    // Update parent
    await memgraph.runQuery(`
      MATCH (p:BackLogItem {backlogId: $id})
      SET p.childCount = $cnt, p.updatedAt = $now
    `, { id: parentBacklogId, cnt: subtasks.length, now: new Date().toISOString() });

    const created = [];
    for (let i = 0; i < subtasks.length; i++) {
      const sub = await this.createSubtask(parentBacklogId, {
        ...subtasks[i], priority: subtasks[i].priority || parent.priority, tags: subtasks[i].tags || parent.tags
      }, { order: i + 1, createdBy: splitBy });
      created.push(sub);
    }
    return { parent: await backlogService.getById(parentBacklogId), subtasks: created, splitInfo };
  }

  async createSubtask(parentBacklogId, data, context = {}) {
    const { order = 1, createdBy = 'system' } = context;
    const parent = await backlogService.getById(parentBacklogId);
    if (!parent) throw new Error(`Parent not found: ${parentBacklogId}`);
    const parentLevel = parent.level || 1;
    if (parentLevel >= MAX_DEPTH) throw new Error(`Max depth (${MAX_DEPTH}) reached`);

    const subtask = await backlogService.create({ ...data, parentId: parentBacklogId, level: parentLevel + 1 }, { createdBy });

    await memgraph.runQuery(`
      MATCH (p:BackLogItem {backlogId: $pid})
      MATCH (c:BackLogItem {backlogId: $cid})
      CREATE (p)-[:HAS_SUBTASK {order: $order, createdAt: $now, createdBy: $by}]->(c)
    `, { pid: parentBacklogId, cid: subtask.backlogId, order, now: new Date().toISOString(), by: createdBy });

    return subtask;
  }

  async getChildren(backlogId) {
    const r = await memgraph.runQuery(`
      MATCH (p:BackLogItem {backlogId: $id})-[rel:HAS_SUBTASK]->(c:BackLogItem)
      RETURN c, rel.order as ord ORDER BY rel.order
    `, { id: backlogId });
    return r.map(row => {
      const props = row.c?.properties || row.c || {};
      return { ...props, _order: row.ord };
    });
  }

  async getTaskWithHierarchy(backlogId) {
    const task = await backlogService.getById(backlogId);
    if (!task) return null;
    const children = await this.getChildren(backlogId);
    return { ...task, children };
  }

  /**
   * Split task within an execution cycle — records motivation in agent memory,
   * auto-approves subtasks, sets up dependencies between them.
   */
  async splitTaskInCycle(backlogId, cycleId, subtasks, rationale, context = {}) {
    const { splitBy = 'system', dependencyChain = false } = context;

    // 1. Split task (creates subtasks with HAS_SUBTASK)
    const result = await this.splitTask(backlogId, subtasks, {
      rationale,
      decompositionStrategy: context.decompositionStrategy || 'BY_COMPONENT'
    }, { splitBy });

    // 2. Auto-approve all subtasks (skip PROPOSED gate)
    for (const sub of result.subtasks) {
      try {
        await backlogService._transition(sub.backlogId, 'APPROVED', { approvedBy: 'system:auto-split' });
      } catch { /* may already be approved */ }
    }

    // 3. Create DEPENDS_ON chain if requested (subtask N depends on N-1)
    if (dependencyChain && result.subtasks.length > 1) {
      for (let i = 1; i < result.subtasks.length; i++) {
        await memgraph.runQuery(`
          MATCH (a:BackLogItem {backlogId: $aid})
          MATCH (b:BackLogItem {backlogId: $bid})
          MERGE (a)-[:DEPENDS_ON]->(b)
        `, { aid: result.subtasks[i].backlogId, bid: result.subtasks[i - 1].backlogId });
      }
    }

    // 4. Record split decision in agent memory
    if (cycleId) {
      const agentMemory = require('./agent-memory.service');
      await agentMemory.addEntry(cycleId, {
        entryType: 'DECISION',
        content: `Split task ${backlogId} into ${result.subtasks.length} subtasks: ${result.subtasks.map(s => s.backlogId).join(', ')}`,
        reasoning: rationale,
        metadata: {
          action: 'SPLIT_TASK',
          subtaskIds: result.subtasks.map(s => s.backlogId),
          dependencyChain
        }
      });
    }

    return {
      parent: result.parent,
      subtasks: result.subtasks,
      memoryRecorded: !!cycleId
    };
  }

  /**
   * Check and propagate parent status when child completes
   */
  async checkParentCompletion(childBacklogId) {
    // Find parent
    const parentResult = await memgraph.runQuery(`
      MATCH (p:BackLogItem)-[:HAS_SUBTASK]->(c:BackLogItem {backlogId: $cid})
      RETURN p.backlogId as parentId
    `, { cid: childBacklogId });

    if (!parentResult.length) return null;
    const parentId = parentResult[0].parentId;

    const { canComplete, blockers } = await this.canCompleteParent(parentId);
    if (canComplete) {
      // All children DONE → move parent to REVIEW
      try {
        await backlogService._transition(parentId, 'REVIEW', {
          implementationNotes: 'All subtasks completed, auto-submitted for review'
        });
        return { parentId, transitioned: 'REVIEW' };
      } catch { /* parent may not be in valid state */ }
    }

    return { parentId, transitioned: null, remainingBlockers: blockers.length };
  }

  async canCompleteParent(backlogId) {
    const children = await this.getChildren(backlogId);
    if (!children.length) return { canComplete: true, blockers: [] };
    const incomplete = children.filter(c => c.status !== 'DONE');
    return { canComplete: incomplete.length === 0, blockers: incomplete.map(c => ({ backlogId: c.backlogId, title: c.title, status: c.status })) };
  }
}

module.exports = new TaskHierarchyService();
