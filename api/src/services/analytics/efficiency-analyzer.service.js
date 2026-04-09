/**
 * Efficiency Analyzer — AI-powered task execution efficiency analysis.
 *
 * Analyzes: token usage, complexity, decisions, review results, iterations.
 * Produces: efficiency score, recommendations (model switch, prompt changes).
 * Can create BackLog task with optimization suggestions.
 */

'use strict';

const tokenTracker = require('../backlog/token-tracker.service');
const complexityEstimator = require('../backlog/complexity-estimator');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

class EfficiencyAnalyzerService {

  /**
   * Analyze efficiency of a task execution
   */
  async analyzeTask(backlogId) {
    const backlogService = require('../backlog/backlog.service');
    const cycleService = require('../backlog/execution-cycle.service');

    const task = await backlogService.getById(backlogId);
    if (!task) throw new Error(`Task not found: ${backlogId}`);

    // Gather data
    const [tokenUsage, complexity, cycles] = await Promise.all([
      tokenTracker.getTaskUsage(backlogId).catch(() => ({ grandTotal: { tokens: 0, cost: 0, iterations: 0 } })),
      complexityEstimator.getComplexity(backlogId) || complexityEstimator.estimateAndSave(backlogId),
      cycleService.getCycles(backlogId)
    ]);

    // Get cycle details for analysis
    const cycleDetails = [];
    for (const cycle of cycles.slice(-3)) { // last 3 cycles
      try {
        const detail = await cycleService.getFullCycleDetail(cycle.id);
        cycleDetails.push(detail);
      } catch { /* skip */ }
    }

    // Calculate efficiency metrics
    const metrics = this._calculateMetrics(task, tokenUsage, complexity, cycles, cycleDetails);

    return {
      backlogId,
      task: { title: task.title, status: task.status, effort: task.effort, priority: task.priority },
      complexity,
      tokenUsage: tokenUsage.grandTotal,
      iterations: cycles.length,
      metrics,
      recommendations: this._generateRecommendations(metrics, task, cycles),
      analyzedAt: new Date().toISOString()
    };
  }

  _calculateMetrics(task, tokenUsage, complexity, cycles, cycleDetails) {
    const complexityScore = complexity?.score || 5;
    const totalTokens = tokenUsage.grandTotal?.tokens || 0;
    const iterationCount = cycles.length;

    // Tokens per complexity point
    const tokensPerComplexity = complexityScore > 0 ? Math.round(totalTokens / complexityScore) : 0;

    // Iteration efficiency (1 iteration = perfect, more = worse)
    const iterationEfficiency = iterationCount > 0 ? Math.round((1 / iterationCount) * 100) : 0;

    // Decision quality (ratio of decisions with reasoning)
    let decisionsWithReasoning = 0;
    let totalDecisions = 0;
    for (const detail of cycleDetails) {
      for (const m of detail.memory || []) {
        if (m.entryType === 'DECISION') {
          totalDecisions++;
          if (m.reasoning && m.reasoning.length > 10) decisionsWithReasoning++;
        }
      }
    }
    const decisionQuality = totalDecisions > 0 ? Math.round((decisionsWithReasoning / totalDecisions) * 100) : 100;

    // Review pass rate
    const reviews = cycleDetails.map(d => d.review).filter(Boolean);
    const approvedCount = reviews.filter(r => r.verdict === 'APPROVED').length;
    const reviewPassRate = reviews.length > 0 ? Math.round((approvedCount / reviews.length) * 100) : 0;

    // Overall efficiency score (0-100)
    const overallScore = Math.round(
      (iterationEfficiency * 0.3) +
      (decisionQuality * 0.3) +
      (reviewPassRate * 0.25) +
      (Math.max(0, 100 - (tokensPerComplexity / 100)) * 0.15)
    );

    return {
      overallScore: Math.max(0, Math.min(100, overallScore)),
      tokensPerComplexity,
      iterationEfficiency,
      decisionQuality,
      reviewPassRate,
      totalDecisions,
      decisionsWithReasoning,
      reviewCount: reviews.length
    };
  }

  _generateRecommendations(metrics, task, cycles) {
    const recs = [];

    if (metrics.iterationEfficiency < 50) {
      recs.push({
        type: 'PROCESS',
        priority: 'HIGH',
        title: 'Reduce iteration count',
        detail: `Task required ${cycles.length} iterations. Consider: more detailed acceptance criteria, better initial planning, or higher complexity model.`
      });
    }

    if (metrics.decisionQuality < 70) {
      recs.push({
        type: 'PROMPT',
        priority: 'MEDIUM',
        title: 'Improve decision documentation',
        detail: `Only ${metrics.decisionsWithReasoning}/${metrics.totalDecisions} decisions have reasoning. Update agent prompt to require reasoning for every DECISION entry (CODEX-RULE-EC-002).`
      });
    }

    if (metrics.tokensPerComplexity > 5000) {
      recs.push({
        type: 'MODEL',
        priority: 'MEDIUM',
        title: 'Consider model switch',
        detail: `Token usage per complexity point (${metrics.tokensPerComplexity}) is high. Consider using a smaller model for simpler subtasks or splitting into smaller tasks.`
      });
    }

    if (metrics.reviewPassRate < 50 && metrics.reviewCount > 1) {
      recs.push({
        type: 'QUALITY',
        priority: 'HIGH',
        title: 'Address review failures',
        detail: `Only ${metrics.reviewPassRate}% reviews passed. Analyze reviewer feedback for systematic issues.`
      });
    }

    if (recs.length === 0) {
      recs.push({
        type: 'POSITIVE',
        priority: 'LOW',
        title: 'Good efficiency',
        detail: `Task execution meets or exceeds expected efficiency metrics.`
      });
    }

    return recs;
  }

  /**
   * Create a BackLog task with optimization suggestions
   */
  async createOptimizationTask(backlogId, analysis, scope = 'THIS_TASK') {
    const backlogService = require('../backlog/backlog.service');
    const recs = analysis.recommendations.filter(r => r.priority !== 'LOW');
    if (recs.length === 0) return null;

    const title = scope === 'ALL_TASKS'
      ? `Optimize agent efficiency across all BackLog tasks`
      : `Optimize execution for ${backlogId}: ${recs[0].title}`;

    const description = [
      `Efficiency analysis for ${backlogId}:`,
      `- Overall Score: ${analysis.metrics.overallScore}/100`,
      `- Iterations: ${analysis.iterations}`,
      `- Token Usage: ${analysis.tokenUsage.tokens?.toLocaleString() || 0}`,
      `- Decision Quality: ${analysis.metrics.decisionQuality}%`,
      '',
      'Recommendations:',
      ...recs.map(r => `- [${r.type}/${r.priority}] ${r.title}: ${r.detail}`)
    ].join('\n');

    return backlogService.create({
      title,
      description,
      taskType: 'REFACTOR',
      targetType: 'CONFIG',
      acceptanceCriteria: recs.map(r => r.detail),
      priority: recs.some(r => r.priority === 'HIGH') ? 'P1_HIGH' : 'P2_MEDIUM',
      effort: 'S',
      tags: ['efficiency', 'optimization', 'auto-generated'],
      sourceContext: `Auto-generated from efficiency analysis of ${backlogId}`
    }, { createdBy: 'agent:efficiency-analyzer' });
  }
}

module.exports = new EfficiencyAnalyzerService();
