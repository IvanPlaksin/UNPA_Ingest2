/**
 * Token Tracker Service — tracks token usage per execution cycle and task.
 *
 * Records input/output tokens, model, estimated cost.
 * Provides historical statistics for efficiency analysis.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

// Approximate cost per 1M tokens (USD)
const MODEL_COSTS = {
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-opus-4-20250514': { input: 15.0, output: 75.0 },
  'claude-haiku-4-20250514': { input: 0.25, output: 1.25 },
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  'llama3': { input: 0, output: 0 }, // local
  'default': { input: 3.0, output: 15.0 }
};

class TokenTrackerService extends EventEmitter {
  constructor() {
    super();
  }

  /**
   * Record token usage for a cycle
   */
  async recordUsage(cycleId, { inputTokens = 0, outputTokens = 0, model = 'default', phase = '', toolName = '' } = {}) {
    const id = uuidv4();
    const totalTokens = inputTokens + outputTokens;
    const costs = MODEL_COSTS[model] || MODEL_COSTS.default;
    const estimatedCost = ((inputTokens * costs.input) + (outputTokens * costs.output)) / 1_000_000;

    const usage = {
      id,
      cycleId,
      inputTokens,
      outputTokens,
      totalTokens,
      model,
      phase,
      toolName,
      estimatedCost: Math.round(estimatedCost * 1_000_000) / 1_000_000, // 6 decimal places
      timestamp: new Date().toISOString()
    };

    await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})
      CREATE (t:TokenUsage $props)
      CREATE (c)-[:HAS_TOKEN_USAGE]->(t)
      RETURN t
    `, { cycleId, props: usage });

    this.emit('usage', { cycleId, totalTokens, model });
    return usage;
  }

  /**
   * Get token usage summary for a cycle
   */
  async getCycleUsage(cycleId) {
    const result = await mg().runQuery(`
      MATCH (c:ExecutionCycle {id: $cycleId})-[:HAS_TOKEN_USAGE]->(t:TokenUsage)
      RETURN t ORDER BY t.timestamp
    `, { cycleId });

    const entries = result.map(r => r.t?.properties || r.t);
    const summary = {
      entries,
      totalInput: entries.reduce((s, e) => s + (e.inputTokens || 0), 0),
      totalOutput: entries.reduce((s, e) => s + (e.outputTokens || 0), 0),
      totalTokens: entries.reduce((s, e) => s + (e.totalTokens || 0), 0),
      totalCost: entries.reduce((s, e) => s + (e.estimatedCost || 0), 0),
      callCount: entries.length,
      models: [...new Set(entries.map(e => e.model).filter(Boolean))]
    };
    return summary;
  }

  /**
   * Get token usage for entire task (all cycles)
   */
  async getTaskUsage(backlogId) {
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_CYCLE]->(c:ExecutionCycle)-[:HAS_TOKEN_USAGE]->(t:TokenUsage)
      RETURN c.iteration as iteration, c.id as cycleId, t
      ORDER BY c.iteration, t.timestamp
    `, { backlogId });

    const byCycle = {};
    for (const row of result) {
      const iter = row.iteration;
      if (!byCycle[iter]) byCycle[iter] = { iteration: iter, cycleId: row.cycleId, entries: [], totalTokens: 0, totalCost: 0 };
      const entry = row.t?.properties || row.t;
      byCycle[iter].entries.push(entry);
      byCycle[iter].totalTokens += entry.totalTokens || 0;
      byCycle[iter].totalCost += entry.estimatedCost || 0;
    }

    const cycles = Object.values(byCycle);
    return {
      cycles,
      grandTotal: {
        tokens: cycles.reduce((s, c) => s + c.totalTokens, 0),
        cost: cycles.reduce((s, c) => s + c.totalCost, 0),
        callCount: result.length,
        iterations: cycles.length
      }
    };
  }

  /**
   * Get historical statistics across all tasks
   */
  async getHistoricalStats() {
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem)-[:HAS_CYCLE]->(c:ExecutionCycle)-[:HAS_TOKEN_USAGE]->(t:TokenUsage)
      RETURN b.backlogId as taskId, b.taskType as taskType, b.effort as effort,
             sum(t.totalTokens) as totalTokens, sum(t.estimatedCost) as totalCost,
             count(t) as callCount
      ORDER BY totalTokens DESC
    `);

    const stats = result.map(r => ({
      taskId: r.taskId,
      taskType: r.taskType,
      effort: r.effort,
      totalTokens: r.totalTokens || 0,
      totalCost: r.totalCost || 0,
      callCount: r.callCount || 0
    }));

    // Calculate averages by effort size
    const byEffort = {};
    for (const s of stats) {
      const key = s.effort || 'UNKNOWN';
      if (!byEffort[key]) byEffort[key] = { count: 0, totalTokens: 0, totalCost: 0 };
      byEffort[key].count++;
      byEffort[key].totalTokens += s.totalTokens;
      byEffort[key].totalCost += s.totalCost;
    }
    for (const key of Object.keys(byEffort)) {
      byEffort[key].avgTokens = Math.round(byEffort[key].totalTokens / byEffort[key].count);
      byEffort[key].avgCost = byEffort[key].totalCost / byEffort[key].count;
    }

    return { tasks: stats, byEffort, totalTasks: stats.length };
  }
}

module.exports = new TokenTrackerService();
