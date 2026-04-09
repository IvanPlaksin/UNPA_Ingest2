/**
 * Plan Service — manages execution plans within cycles.
 *
 * Plan is MANDATORY in both AUTONOMOUS and PLANNING modes.
 * AUTONOMOUS: plan auto-approved → execute immediately
 * PLANNING: plan awaits user approval via UI
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const cycleService = require('./execution-cycle.service');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

class PlanService {

  /**
   * Submit a plan for a cycle
   */
  async submitPlan(cycleId, { steps, rationale, estimatedEffort } = {}) {
    const cycle = await cycleService.getCycle(cycleId);
    if (!cycle) throw new Error(`Cycle not found: ${cycleId}`);
    if (cycle.phase !== 'PLANNING') throw new Error(`Cannot submit plan in phase: ${cycle.phase}`);

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      throw new Error('Plan must have at least one step');
    }

    const id = uuidv4();
    const plan = {
      id,
      cycleId,
      steps: JSON.stringify(steps),
      rationale: rationale || '',
      estimatedEffort: estimatedEffort || '',
      status: 'DRAFT',
      submittedAt: new Date().toISOString(),
      submittedBy: cycle.executedBy,
      approvedBy: '',
      approvedAt: '',
      rejectionReason: ''
    };

    await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})
      CREATE (p:PlanRecord $props)
      CREATE (c)-[:HAS_PLAN]->(p)
      RETURN p
    `, { cycleId, props: plan });

    // Mode-dependent behavior
    if (cycle.mode === 'AUTONOMOUS') {
      // Auto-approve and transition to EXECUTING
      await this.approvePlan(cycleId, 'system:auto-approve');
    } else {
      // Transition to AWAITING_APPROVAL
      await cycleService.transitionPhase(cycleId, 'AWAITING_APPROVAL');
    }

    return { ...plan, steps };
  }

  /**
   * Approve a plan (user action in PLANNING mode, auto in AUTONOMOUS)
   */
  async approvePlan(cycleId, approvedBy = 'user') {
    const now = new Date().toISOString();

    await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_PLAN]->(p:PlanRecord)
      SET p.status = 'APPROVED', p.approvedBy = $approvedBy, p.approvedAt = $now
      RETURN p
    `, { cycleId, approvedBy, now });

    // Transition cycle to EXECUTING
    await cycleService.transitionPhase(cycleId, 'EXECUTING');

    return { approved: true, approvedBy };
  }

  /**
   * Reject a plan (user action — back to PLANNING phase)
   */
  async rejectPlan(cycleId, reason, rejectedBy = 'user') {
    const now = new Date().toISOString();

    await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_PLAN]->(p:PlanRecord)
      SET p.status = 'REJECTED', p.rejectionReason = $reason, p.approvedBy = $rejectedBy, p.approvedAt = $now
      RETURN p
    `, { cycleId, reason, rejectedBy, now });

    // Back to PLANNING
    await cycleService.transitionPhase(cycleId, 'PLANNING');

    return { rejected: true, reason };
  }

  /**
   * Get plan for a cycle
   */
  async getPlan(cycleId) {
    const result = await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_PLAN]->(p:PlanRecord)
      RETURN p
    `, { cycleId });

    if (!result.length) return null;
    const props = result[0].p?.properties || result[0].p;
    if (typeof props.steps === 'string') {
      try { props.steps = JSON.parse(props.steps); } catch { /* keep */ }
    }
    return props;
  }
}

module.exports = new PlanService();
