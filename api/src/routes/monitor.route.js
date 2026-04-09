/**
 * Monitor Routes — Aggregated analytics for BackLog Monitor view.
 */

'use strict';

const express = require('express');
const router = express.Router();

// ============================================================
// DASHBOARD (aggregated)
// ============================================================

router.get('/dashboard', async (req, res) => {
  try {
    const backlogService = require('../services/backlog/backlog.service');
    const tokenTracker = require('../services/backlog/token-tracker.service');
    const notificationService = require('../services/notifications/notification.service');
    const sessionManager = require('../services/agents/session-manager.service');
    const metricsService = require('../services/observability/metrics.service');

    const [stats, tokenStats, notifications, sessions, observability] = await Promise.all([
      backlogService.getStats().catch(() => ({})),
      tokenTracker.getHistoricalStats().catch(() => ({ tasks: [], byEffort: {} })),
      Promise.resolve(notificationService.getMetrics()),
      Promise.resolve(sessionManager.getStatus()),
      Promise.resolve(metricsService.getSummary())
    ]);

    res.json({
      success: true,
      data: {
        backlog: stats,
        tokens: tokenStats,
        notifications,
        sessions,
        observability,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// TOKEN ECONOMICS (V1)
// ============================================================

router.get('/token-economics', async (req, res) => {
  try {
    const tokenTracker = require('../services/backlog/token-tracker.service');
    const complexityEstimator = require('../services/backlog/complexity-estimator');
    const circuitBreaker = require('../services/backlog/circuit-breaker.service');

    const stats = await tokenTracker.getHistoricalStats();

    // Aggregate by model
    const mg = require('../services/memgraph.service');
    const byModel = await mg.runQuery(`
      MATCH (t:TokenUsage)
      RETURN t.model as model,
             sum(t.totalTokens) as totalTokens,
             sum(t.estimatedCost) as totalCost,
             count(t) as callCount
      ORDER BY totalTokens DESC
    `).catch(() => []);

    // Token timeseries (last 24h, hourly buckets)
    const timeseries = await mg.runQuery(`
      MATCH (t:TokenUsage)
      WHERE t.timestamp > $since
      RETURN t.timestamp as ts, t.totalTokens as tokens, t.model as model, t.estimatedCost as cost
      ORDER BY t.timestamp
    `, { since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() }).catch(() => []);

    res.json({
      success: true,
      data: {
        byEffort: stats.byEffort,
        byModel: byModel.map(r => ({ model: r.model, totalTokens: r.totalTokens, totalCost: r.totalCost, callCount: r.callCount })),
        timeseries: timeseries.map(r => ({ timestamp: r.ts, tokens: r.tokens, model: r.model, cost: r.cost })),
        limits: circuitBreaker.getLimits(),
        totalTasks: stats.totalTasks
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// EXECUTION PIPELINE (V2)
// ============================================================

router.get('/execution-pipeline', async (req, res) => {
  try {
    const mg = require('../services/memgraph.service');

    // Status funnel
    const funnel = await mg.runQuery(`
      MATCH (b:BackLogItem)
      RETURN b.status as status, count(b) as count
    `);

    // Iteration distribution
    const iterations = await mg.runQuery(`
      MATCH (b:BackLogItem)-[:HAS_CYCLE]->(c:ExecutionCycle)
      WITH b.backlogId as taskId, max(c.iteration) as maxIter
      RETURN maxIter as iterations, count(taskId) as taskCount
      ORDER BY maxIter
    `).catch(() => []);

    // Review verdicts
    const verdicts = await mg.runQuery(`
      MATCH (r:ReviewRecord)
      RETURN r.verdict as verdict, count(r) as count
    `).catch(() => []);

    // Mode distribution
    const modes = await mg.runQuery(`
      MATCH (c:ExecutionCycle)
      RETURN c.mode as mode, c.phase as phase, count(c) as count
    `).catch(() => []);

    res.json({
      success: true,
      data: {
        funnel: funnel.map(r => ({ status: r.status, count: r.count })),
        iterations: iterations.map(r => ({ iterations: r.iterations, taskCount: r.taskCount })),
        verdicts: verdicts.map(r => ({ verdict: r.verdict, count: r.count })),
        modes: modes.map(r => ({ mode: r.mode, phase: r.phase, count: r.count }))
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// AGENT PERFORMANCE (V3)
// ============================================================

router.get('/agent-performance', async (req, res) => {
  try {
    const metricsService = require('../services/observability/metrics.service');
    const mg = require('../services/memgraph.service');

    const summary = metricsService.getSummary();

    // Memory entry types distribution
    const memoryTypes = await mg.runQuery(`
      MATCH (m:AgentMemoryEntry)
      RETURN m.entryType as entryType, count(m) as count
      ORDER BY count DESC
    `).catch(() => []);

    // Decision quality
    const decisionStats = await mg.runQuery(`
      MATCH (m:AgentMemoryEntry {entryType: 'DECISION'})
      RETURN count(m) as total,
             sum(CASE WHEN size(m.reasoning) > 10 THEN 1 ELSE 0 END) as withReasoning
    `).catch(() => [{ total: 0, withReasoning: 0 }]);

    res.json({
      success: true,
      data: {
        toolCalls: summary.agents,
        codex: summary.codex,
        memoryTypes: memoryTypes.map(r => ({ type: r.entryType, count: r.count })),
        decisionQuality: {
          total: decisionStats[0]?.total || 0,
          withReasoning: decisionStats[0]?.withReasoning || 0,
          rate: decisionStats[0]?.total > 0 ? Math.round((decisionStats[0].withReasoning / decisionStats[0].total) * 100) : 0
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// AI ANALYSIS (V7)
// ============================================================

router.post('/ai-analyze', async (req, res) => {
  try {
    const { prompt: userPrompt, preset } = req.body;

    // Gather context
    const backlogService = require('../services/backlog/backlog.service');
    const tokenTracker = require('../services/backlog/token-tracker.service');
    const notificationService = require('../services/notifications/notification.service');
    const sessionManager = require('../services/agents/session-manager.service');

    const [stats, tokenStats, notifications, sessions] = await Promise.all([
      backlogService.getStats().catch(() => ({})),
      tokenTracker.getHistoricalStats().catch(() => ({})),
      Promise.resolve(notificationService.getMetrics()),
      Promise.resolve(sessionManager.getStatus())
    ]);

    const presets = {
      bottlenecks: 'Analyze the current BackLog data and identify bottlenecks. Where are tasks stuck? What phases take longest? Which tasks are blocked?',
      token_optimization: 'Analyze token usage across tasks and models. Which tasks consume disproportionate tokens? Recommend model switches for cost optimization.',
      review_patterns: 'Analyze review patterns. What is the approval/rejection ratio? What are common rejection reasons? How can we improve first-pass review success?',
      predict_completion: 'Based on current velocity (tasks completed per day, average iteration count), predict when the remaining PROPOSED/APPROVED tasks will be completed.',
      efficiency_report: 'Generate a comprehensive efficiency report. Compare actual token usage vs complexity estimates. Identify over-estimated and under-estimated tasks.'
    };

    const question = preset ? presets[preset] : userPrompt;
    if (!question) return res.status(400).json({ success: false, error: 'Provide prompt or preset' });

    const context = `## BackLog Statistics
${JSON.stringify(stats, null, 2)}

## Token Usage
${JSON.stringify(tokenStats, null, 2)}

## Notifications
${JSON.stringify(notifications, null, 2)}

## Sessions
${JSON.stringify(sessions, null, 2)}`;

    // Try AI analysis
    let analysis;
    try {
      const { AnthropicAgentService } = require('../services/ai/anthropic-agent.service');
      const agent = new AnthropicAgentService();
      const result = await agent.chat({
        systemPrompt: `You are the BackLog Analytics Agent. Analyze the provided metrics and answer the user's question. Be specific, reference exact numbers. Output in English. Format with markdown headers and bullet points.`,
        message: `${question}\n\n---\nContext:\n${context}`
      });
      analysis = result?.response || result;
    } catch (aiErr) {
      analysis = `AI analysis unavailable: ${aiErr.message}\n\nRaw context:\n${context}`;
    }

    res.json({ success: true, data: { analysis, preset: preset || null, context: stats } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
