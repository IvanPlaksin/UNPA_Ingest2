/**
 * ExecutionCycle Service — manages iteration cycles for BackLog task execution.
 *
 * Each cycle: PLANNING → [AWAITING_APPROVAL] → EXECUTING → REVIEW → COMPLETED/REJECTED
 * Modes: AUTONOMOUS (auto-approve plan, auto-return on reject)
 *        PLANNING (user approves plan, user clicks return on reject)
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

const PHASES = ['PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'REVIEW', 'AWAITING_RETURN', 'COMPLETED', 'REJECTED'];

const PHASE_TRANSITIONS = {
  AUTONOMOUS: {
    PLANNING: ['EXECUTING'],                  // auto-approve skips AWAITING_APPROVAL
    EXECUTING: ['REVIEW'],
    REVIEW: ['COMPLETED', 'PLANNING'],        // PLANNING = auto-return (new cycle)
  },
  PLANNING: {
    PLANNING: ['AWAITING_APPROVAL'],
    AWAITING_APPROVAL: ['EXECUTING', 'PLANNING'], // PLANNING = plan rejected, redo
    EXECUTING: ['REVIEW'],
    REVIEW: ['COMPLETED', 'AWAITING_RETURN'],
    AWAITING_RETURN: ['PLANNING'],            // user clicks return → new cycle
  }
};

class ExecutionCycleService extends EventEmitter {
  constructor() { super(); }

  /**
   * Start a new execution cycle for a BackLog task
   */
  async startCycle(backlogId, { mode = 'PLANNING', executedBy = 'system' } = {}) {
    if (!['AUTONOMOUS', 'PLANNING'].includes(mode)) {
      throw new Error(`Invalid mode: ${mode}. Must be AUTONOMOUS or PLANNING`);
    }

    // Validate task exists
    const taskCheck = await mg().runQuery(
      'MATCH (b:BackLogItem {backlogId: $backlogId}) RETURN b.backlogId as id',
      { backlogId }
    );
    if (!taskCheck.length) {
      throw new Error(`BackLog task not found: ${backlogId}`);
    }

    // Determine iteration number
    const existing = await this.getCycles(backlogId);
    const iteration = existing.length + 1;

    const id = uuidv4();
    const now = new Date().toISOString();

    const cycle = {
      id,
      backlogId,
      iteration,
      mode,
      phase: 'PLANNING',
      executedBy,
      startedAt: now,
      completedAt: '',
      summary: ''
    };

    await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})
      CREATE (c:ExecutionCycle $props)
      CREATE (b)-[:HAS_CYCLE]->(c)
      ${iteration > 1 ? `
        WITH c
        MATCH (prev:ExecutionCycle {backlogId: $backlogId, iteration: $prevIter})
        CREATE (c)-[:PREVIOUS_CYCLE]->(prev)
      ` : ''}
      RETURN c
    `, { backlogId, props: cycle, prevIter: iteration - 1 });

    this.emit('change', { event: 'cycle_started', data: { backlogId, iteration, mode } });
    return cycle;
  }

  /**
   * Get all cycles for a task (ordered by iteration)
   */
  async getCycles(backlogId) {
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_CYCLE]->(c:ExecutionCycle)
      OPTIONAL MATCH (c)-[:HAS_MEMORY]->(m:AgentMemoryEntry)
      OPTIONAL MATCH (c)-[:HAS_PLAN]->(p:PlanRecord)
      OPTIONAL MATCH (c)-[:HAS_REVIEW]->(r:ReviewRecord)
      RETURN c,
             count(DISTINCT m) as memoryCount,
             p.status as planStatus,
             r.verdict as reviewVerdict
      ORDER BY c.iteration
    `, { backlogId });

    return result.map(row => ({
      ...this._parse(row.c),
      memoryCount: row.memoryCount || 0,
      planStatus: row.planStatus || null,
      reviewVerdict: row.reviewVerdict || null
    }));
  }

  /**
   * Get a specific cycle
   */
  async getCycle(cycleId) {
    const result = await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})
      RETURN c
    `, { cycleId });
    if (!result.length) return null;
    return this._parse(result[0].c);
  }

  /**
   * Get current (latest) cycle for a task
   */
  async getCurrentCycle(backlogId) {
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_CYCLE]->(c:ExecutionCycle)
      RETURN c
      ORDER BY c.iteration DESC
      LIMIT 1
    `, { backlogId });
    if (!result.length) return null;
    return this._parse(result[0].c);
  }

  /**
   * Transition cycle phase
   */
  async transitionPhase(cycleId, newPhase, extra = {}) {
    const cycle = await this.getCycle(cycleId);
    if (!cycle) throw new Error(`Cycle not found: ${cycleId}`);

    const allowed = PHASE_TRANSITIONS[cycle.mode]?.[cycle.phase] || [];
    if (!allowed.includes(newPhase)) {
      throw new Error(`Invalid transition: ${cycle.phase} → ${newPhase} (mode: ${cycle.mode}). Allowed: ${allowed.join(', ')}`);
    }

    const setParts = ['c.phase = $newPhase', 'c.updatedAt = $now'];
    const params = { cycleId, newPhase, now: new Date().toISOString() };

    if (newPhase === 'COMPLETED') {
      setParts.push('c.completedAt = $now');
    }
    for (const [k, v] of Object.entries(extra)) {
      setParts.push(`c.${k} = $${k}`);
      params[k] = v;
    }

    await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})
      SET ${setParts.join(', ')}
      RETURN c
    `, params);

    this.emit('change', { event: 'phase_changed', data: { cycleId, backlogId: cycle.backlogId, phase: newPhase } });

    return { ...cycle, phase: newPhase };
  }

  /**
   * Get full cycle detail (with memory, plan, review)
   */
  async getFullCycleDetail(cycleId) {
    const [cycle, memResult, planResult, reviewResult] = await Promise.all([
      this.getCycle(cycleId),
      mg().runQuery(`
        MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_MEMORY]->(m:AgentMemoryEntry)
        RETURN m ORDER BY m.sequence
      `, { cycleId }),
      mg().runQuery(`
        MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_PLAN]->(p:PlanRecord)
        RETURN p
      `, { cycleId }),
      mg().runQuery(`
        MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_REVIEW]->(r:ReviewRecord)
        RETURN r
      `, { cycleId })
    ]);

    return {
      cycle,
      memory: memResult.map(r => this._parse(r.m)),
      plan: planResult.length ? this._parse(planResult[0].p) : null,
      review: reviewResult.length ? this._parse(reviewResult[0].r) : null
    };
  }

  _parse(node) {
    if (!node) return null;
    const props = node.properties || node;
    const item = { ...props };
    for (const f of ['steps', 'strengths', 'weaknesses', 'recommendations']) {
      if (typeof item[f] === 'string') {
        try { item[f] = JSON.parse(item[f]); } catch { /* keep */ }
      }
    }
    return item;
  }
}

module.exports = new ExecutionCycleService();
