'use strict';

/**
 * Metacognition API Routes
 *
 * POST /api/v1/metacognition/detect             — Run detection
 * GET  /api/v1/metacognition/detect/issues      — Immediate structural scan
 * GET  /api/v1/metacognition/proposals          — List proposals
 * POST /api/v1/metacognition/proposals/:id/approve
 * POST /api/v1/metacognition/proposals/:id/reject
 * POST /api/v1/metacognition/proposals/:id/execute
 * GET  /api/v1/metacognition/stats              — Stats
 */

const express = require('express');
const router = express.Router();
const { getMetacognitionService } = require('../services/metacognition/metacognition.service');

/**
 * POST /detect
 * Run full detection cycle and create proposals
 */
router.post('/detect', async (_req, res) => {
  try {
    const svc = getMetacognitionService();
    const issues = await svc.detectStructuralIssues();
    const proposals = await svc.createProposalsFromIssues(issues);
    res.json({
      success: true,
      data: { issuesFound: issues.length, proposalsCreated: proposals.length, proposals }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /detect/issues
 * Quick structural scan without creating proposals
 */
router.get('/detect/issues', async (_req, res) => {
  try {
    const svc = getMetacognitionService();
    const issues = await svc.detectStructuralIssues();
    const prioritized = svc.evaluateAndPrioritize(issues);
    res.json({ success: true, data: prioritized, count: prioritized.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /proposals
 * List proposals with optional status filter
 */
router.get('/proposals', async (req, res) => {
  try {
    const { status } = req.query;
    const svc = getMetacognitionService();
    const proposals = await svc.getProposals(status ? { status } : {});
    res.json({ success: true, data: proposals, count: proposals.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /proposals/:id/approve
 */
router.post('/proposals/:id/approve', async (req, res) => {
  try {
    const { approver = 'api_user' } = req.body;
    const svc = getMetacognitionService();
    const proposal = await svc.approveProposal(req.params.id, approver);
    res.json({ success: true, data: proposal });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false, error: error.message
    });
  }
});

/**
 * POST /proposals/:id/reject
 */
router.post('/proposals/:id/reject', async (req, res) => {
  try {
    const { rejector = 'api_user', reason = '' } = req.body;
    const svc = getMetacognitionService();
    const proposal = await svc.rejectProposal(req.params.id, rejector, reason);
    res.json({ success: true, data: proposal });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false, error: error.message
    });
  }
});

/**
 * POST /proposals/:id/execute
 */
router.post('/proposals/:id/execute', async (req, res) => {
  try {
    const svc = getMetacognitionService();
    const proposal = await svc.executeProposal(req.params.id);
    res.json({ success: true, data: proposal });
  } catch (error) {
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false, error: error.message
    });
  }
});

/**
 * GET /stats
 */
router.get('/stats', async (_req, res) => {
  try {
    const svc = getMetacognitionService();
    const stats = await svc.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
