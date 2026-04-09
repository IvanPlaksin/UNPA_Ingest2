/**
 * Review Service — manages cross-review of task execution by a separate AI agent.
 *
 * Reviewer analyzes: plan, execution decisions, results.
 * Verdict: APPROVED → task DONE, REJECTED → return to work.
 * AUTONOMOUS: auto-return on reject. PLANNING: user clicks return.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const cycleService = require('./execution-cycle.service');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

class ReviewService {

  /**
   * Submit a review for a cycle
   */
  async submitReview(cycleId, { verdict, strengths, weaknesses, recommendations, summary } = {}, reviewedBy = 'agent:reviewer') {
    const cycle = await cycleService.getCycle(cycleId);
    if (!cycle) throw new Error(`Cycle not found: ${cycleId}`);
    if (cycle.phase !== 'REVIEW') throw new Error(`Cannot review in phase: ${cycle.phase}`);

    if (!['APPROVED', 'REJECTED', 'NEEDS_REVISION'].includes(verdict)) {
      throw new Error(`Invalid verdict: ${verdict}`);
    }

    const id = uuidv4();
    const review = {
      id,
      cycleId,
      backlogId: cycle.backlogId,
      verdict,
      strengths: JSON.stringify(strengths || []),
      weaknesses: JSON.stringify(weaknesses || []),
      recommendations: JSON.stringify(recommendations || []),
      summary: summary || '',
      reviewedBy,
      reviewedAt: new Date().toISOString()
    };

    await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})
      CREATE (r:ReviewRecord $props)
      CREATE (c)-[:HAS_REVIEW]->(r)
      RETURN r
    `, { cycleId, props: review });

    // Apply verdict
    if (verdict === 'APPROVED') {
      await cycleService.transitionPhase(cycleId, 'COMPLETED', { summary: summary || 'Review approved' });
    } else {
      // REJECTED or NEEDS_REVISION
      if (cycle.mode === 'AUTONOMOUS') {
        // Auto-return: create new cycle with recommendations
        await this._autoReturn(cycle, recommendations || []);
      } else {
        // PLANNING mode: wait for user to click return
        await cycleService.transitionPhase(cycleId, 'AWAITING_RETURN');
      }
    }

    cycleService.emit('change', { event: 'review_submitted', data: { cycleId, backlogId: cycle.backlogId, verdict } });

    return { ...review, strengths, weaknesses, recommendations };
  }

  /**
   * User clicks "Return to Work" button (PLANNING mode only)
   */
  async returnToWork(cycleId, userId = 'user') {
    const cycle = await cycleService.getCycle(cycleId);
    if (!cycle) throw new Error(`Cycle not found: ${cycleId}`);
    if (cycle.phase !== 'AWAITING_RETURN') throw new Error(`Cannot return in phase: ${cycle.phase}`);

    // Get review recommendations to carry forward
    const review = await this.getReview(cycleId);

    // Start new cycle
    const newCycle = await cycleService.startCycle(cycle.backlogId, {
      mode: cycle.mode,
      executedBy: cycle.executedBy
    });

    cycleService.emit('change', { event: 'returned_to_work', data: { backlogId: cycle.backlogId, newIteration: newCycle.iteration } });

    return { previousCycle: cycleId, newCycle, recommendations: review?.recommendations || [] };
  }

  /**
   * Get review for a cycle
   */
  async getReview(cycleId) {
    const result = await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_REVIEW]->(r:ReviewRecord)
      RETURN r
    `, { cycleId });

    if (!result.length) return null;
    const props = result[0].r?.properties || result[0].r;
    for (const f of ['strengths', 'weaknesses', 'recommendations']) {
      if (typeof props[f] === 'string') {
        try { props[f] = JSON.parse(props[f]); } catch { /* keep */ }
      }
    }
    return props;
  }

  /**
   * Auto-return for AUTONOMOUS mode
   */
  async _autoReturn(cycle, recommendations) {
    // Start new cycle automatically
    const newCycle = await cycleService.startCycle(cycle.backlogId, {
      mode: 'AUTONOMOUS',
      executedBy: cycle.executedBy
    });

    // Add recommendations as first memory entry of new cycle
    if (recommendations.length > 0) {
      const agentMemory = require('./agent-memory.service');
      await agentMemory.addEntry(newCycle.id, {
        entryType: 'NOTE',
        content: `Reviewer recommendations from iteration ${cycle.iteration}: ${recommendations.join('; ')}`,
        reasoning: 'Carried forward from previous review rejection'
      });
    }

    return newCycle;
  }
}

module.exports = new ReviewService();
