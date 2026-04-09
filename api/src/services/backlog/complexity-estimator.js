/**
 * Complexity Estimator — AI-assisted task complexity scoring.
 *
 * Evaluates task complexity on a 1-10 scale based on:
 * - Acceptance criteria count and specificity
 * - Number of files/components affected
 * - Dependencies count
 * - Domain novelty
 * - Estimated effort
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

const EFFORT_SCORES = { XS: 1, S: 2, M: 4, L: 7, XL: 10 };

class ComplexityEstimator {

  /**
   * Estimate complexity based on task properties (rule-based)
   */
  estimate(task) {
    let score = 0;
    const factors = [];

    // 1. Effort size (0-3 points)
    const effortScore = Math.min((EFFORT_SCORES[task.effort] || 4) / 3.3, 3);
    score += effortScore;
    factors.push({ factor: 'effort', value: task.effort, points: Math.round(effortScore * 10) / 10 });

    // 2. Acceptance criteria count (0-2 points)
    const criteria = Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [];
    const criteriaScore = Math.min(criteria.length / 3, 2);
    score += criteriaScore;
    factors.push({ factor: 'acceptanceCriteria', value: criteria.length, points: Math.round(criteriaScore * 10) / 10 });

    // 3. Priority urgency (0-1.5 points)
    const priorityMap = { P0_CRITICAL: 1.5, P1_HIGH: 1.0, P2_MEDIUM: 0.5, P3_LOW: 0.2 };
    const priorityScore = priorityMap[task.priority] || 0.5;
    score += priorityScore;
    factors.push({ factor: 'priority', value: task.priority, points: priorityScore });

    // 4. Task type complexity (0-1.5 points)
    const typeMap = { IMPLEMENT: 1.5, REFACTOR: 1.2, FIX: 1.0, TEST: 0.8, DOCUMENT: 0.3 };
    const typeScore = typeMap[task.taskType] || 1.0;
    score += typeScore;
    factors.push({ factor: 'taskType', value: task.taskType, points: typeScore });

    // 5. Dependencies (0-2 points)
    const deps = Array.isArray(task.dependencies) ? task.dependencies.length : 0;
    const depScore = Math.min(deps * 0.5, 2);
    score += depScore;
    factors.push({ factor: 'dependencies', value: deps, points: depScore });

    // Normalize to 1-10
    const normalized = Math.max(1, Math.min(10, Math.round(score)));

    return {
      score: normalized,
      factors,
      rawScore: Math.round(score * 10) / 10,
      estimatedAt: new Date().toISOString()
    };
  }

  /**
   * Estimate and save to graph
   */
  async estimateAndSave(backlogId) {
    const backlogService = require('./backlog.service');
    const task = await backlogService.getById(backlogId);
    if (!task) throw new Error(`Task not found: ${backlogId}`);

    const complexity = this.estimate(task);
    const id = uuidv4();

    await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})
      OPTIONAL MATCH (b)-[old:HAS_COMPLEXITY]->(oldC:ComplexityScore)
      DETACH DELETE oldC
      WITH b
      CREATE (x:ComplexityScore {
        id: $id,
        score: $score,
        factors: $factors,
        rawScore: $rawScore,
        estimatedAt: $estimatedAt
      })
      CREATE (b)-[:HAS_COMPLEXITY]->(x)
      RETURN x
    `, {
      backlogId,
      id,
      score: complexity.score,
      factors: JSON.stringify(complexity.factors),
      rawScore: complexity.rawScore,
      estimatedAt: complexity.estimatedAt
    });

    return complexity;
  }

  /**
   * Get saved complexity for a task
   */
  async getComplexity(backlogId) {
    const result = await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_COMPLEXITY]->(x:ComplexityScore)
      RETURN x
    `, { backlogId });

    if (!result.length) return null;
    const props = result[0].x?.properties || result[0].x;
    if (typeof props.factors === 'string') {
      try { props.factors = JSON.parse(props.factors); } catch { /* keep */ }
    }
    return props;
  }

  /**
   * Estimate token budget based on complexity and model
   */
  estimateTokenBudget(complexityScore, model = 'default') {
    // Base budget per complexity point
    const BASE_TOKENS_PER_POINT = {
      'claude-sonnet-4-20250514': 2000,
      'claude-opus-4-20250514': 3000,
      'claude-haiku-4-20250514': 1500,
      'gpt-4o': 2500,
      'gpt-4o-mini': 2000,
      'llama3': 1500,
      'default': 2000
    };

    const base = BASE_TOKENS_PER_POINT[model] || BASE_TOKENS_PER_POINT.default;
    const budget = complexityScore * base;
    const warningThreshold = Math.round(budget * 0.8);
    const breakerThreshold = Math.round(budget * 1.5);

    return {
      estimatedBudget: budget,
      warningThreshold,
      breakerThreshold,
      model,
      complexityScore
    };
  }
}

module.exports = new ComplexityEstimator();
