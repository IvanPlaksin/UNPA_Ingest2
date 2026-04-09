/**
 * BackLog Execution Routes — Agent execution cycles, memory, plans, reviews.
 */

'use strict';

const express = require('express');
const router = express.Router();
const cycleService = require('../services/backlog/execution-cycle.service');
const memoryService = require('../services/backlog/agent-memory.service');
const planService = require('../services/backlog/plan.service');
const reviewService = require('../services/backlog/review.service');

const agentId = (req) => req.headers['x-agent-id'] || req.body?.executedBy || 'anonymous';

// ============================================================
// CYCLES
// ============================================================

// Start new execution cycle
router.post('/items/:backlogId/cycles', async (req, res) => {
  try {
    const { mode } = req.body;
    const cycle = await cycleService.startCycle(req.params.backlogId, {
      mode: mode || 'PLANNING',
      executedBy: agentId(req)
    });
    res.status(201).json({ success: true, data: cycle });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// List all cycles for a task
router.get('/items/:backlogId/cycles', async (req, res) => {
  try {
    const cycles = await cycleService.getCycles(req.params.backlogId);
    res.json({ success: true, data: cycles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current (latest) cycle
router.get('/items/:backlogId/current-cycle', async (req, res) => {
  try {
    const cycle = await cycleService.getCurrentCycle(req.params.backlogId);
    res.json({ success: true, data: cycle });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get full cycle detail (memory + plan + review)
router.get('/cycles/:cycleId', async (req, res) => {
  try {
    const detail = await cycleService.getFullCycleDetail(req.params.cycleId);
    res.json({ success: true, data: detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transition cycle phase
router.post('/cycles/:cycleId/transition', async (req, res) => {
  try {
    const { phase } = req.body;
    const result = await cycleService.transitionPhase(req.params.cycleId, phase);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
// AGENT MEMORY
// ============================================================

// Add memory entry
router.post('/cycles/:cycleId/memory', async (req, res) => {
  try {
    const entry = await memoryService.addEntry(req.params.cycleId, req.body);
    res.status(201).json({ success: true, data: entry });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get memory entries for a cycle
router.get('/cycles/:cycleId/memory', async (req, res) => {
  try {
    const entries = await memoryService.getEntries(req.params.cycleId);
    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get full memory history across all cycles
router.get('/items/:backlogId/memory-history', async (req, res) => {
  try {
    const history = await memoryService.getFullHistory(req.params.backlogId);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PLANS
// ============================================================

// Submit plan
router.post('/cycles/:cycleId/plan', async (req, res) => {
  try {
    const plan = await planService.submitPlan(req.params.cycleId, req.body);
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Approve plan (user action)
router.post('/cycles/:cycleId/plan/approve', async (req, res) => {
  try {
    const result = await planService.approvePlan(req.params.cycleId, agentId(req));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Reject plan (user action)
router.post('/cycles/:cycleId/plan/reject', async (req, res) => {
  try {
    const { reason } = req.body;
    const result = await planService.rejectPlan(req.params.cycleId, reason, agentId(req));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get plan
router.get('/cycles/:cycleId/plan', async (req, res) => {
  try {
    const plan = await planService.getPlan(req.params.cycleId);
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// REVIEWS
// ============================================================

// Submit review
router.post('/cycles/:cycleId/review', async (req, res) => {
  try {
    const review = await reviewService.submitReview(
      req.params.cycleId,
      req.body,
      agentId(req)
    );
    res.status(201).json({ success: true, data: review });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Return to work (user action in PLANNING mode)
router.post('/cycles/:cycleId/return', async (req, res) => {
  try {
    const result = await reviewService.returnToWork(req.params.cycleId, agentId(req));
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Get review
router.get('/cycles/:cycleId/review', async (req, res) => {
  try {
    const review = await reviewService.getReview(req.params.cycleId);
    res.json({ success: true, data: review });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// AI-POWERED REVIEW
// ============================================================

// Trigger AI reviewer agent for a cycle
router.post('/cycles/:cycleId/ai-review', async (req, res) => {
  try {
    const { buildReviewContext } = require('../prompts/reviewer-agent.prompt');
    const cycleService = require('../services/backlog/execution-cycle.service');

    const cycle = await cycleService.getCycle(req.params.cycleId);
    if (!cycle) return res.status(404).json({ success: false, error: 'Cycle not found' });
    if (cycle.phase !== 'REVIEW') {
      return res.status(400).json({ success: false, error: `Cycle must be in REVIEW phase, currently: ${cycle.phase}` });
    }

    const reviewPrompt = await buildReviewContext(cycle.backlogId, req.params.cycleId);

    // Call AI via AnthropicAgentService
    let aiResponse;
    try {
      const { AnthropicAgentService } = require('../services/ai/anthropic-agent.service');
      const agent = new AnthropicAgentService();
      aiResponse = await agent.chat({
        systemPrompt: reviewPrompt,
        message: 'Review this execution cycle. Analyze the plan, decisions, and context. Provide your verdict using the cycle.submit_review tool.',
        tools: [
          {
            name: 'cycle_submit_review',
            description: 'Submit review verdict',
            input_schema: {
              type: 'object',
              required: ['cycleId', 'verdict'],
              properties: {
                cycleId: { type: 'string' },
                verdict: { type: 'string', enum: ['APPROVED', 'REJECTED', 'NEEDS_REVISION'] },
                strengths: { type: 'array', items: { type: 'string' } },
                weaknesses: { type: 'array', items: { type: 'string' } },
                recommendations: { type: 'array', items: { type: 'string' } },
                summary: { type: 'string' }
              }
            }
          }
        ]
      });
    } catch (aiErr) {
      // If AI fails, return the prompt for manual review
      return res.json({ success: true, data: { mode: 'manual', prompt: reviewPrompt, error: aiErr.message } });
    }

    // Extract tool call from AI response
    const toolCall = aiResponse?.toolCalls?.find(tc => tc.tool === 'cycle_submit_review');
    if (toolCall) {
      const review = await reviewService.submitReview(
        req.params.cycleId,
        toolCall.args,
        'agent:ai-reviewer'
      );
      return res.json({ success: true, data: { mode: 'ai', review, aiResponse: aiResponse.response } });
    }

    // No tool call — return AI response as text
    res.json({ success: true, data: { mode: 'text', analysis: aiResponse?.response || aiResponse, prompt: reviewPrompt } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
