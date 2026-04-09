/**
 * Codex API Routes — Governance rules, proposals, validation
 */

const express = require('express');
const router = express.Router();

const { codexService, codexValidator, blackCodexService, codexLoader, consistencyRunner } = require('../services/codex');
const codexGovernance = require('../services/codex/codex-governance.service');
const { CodexValidationService } = require('../services/codex/validation');
const { ViolationToIssueService } = require('../services/codex/validation/violation-to-issue.service');
const codexValidation = new CodexValidationService();
const violationIssues = new ViolationToIssueService();

// ============================================================
// CODEX DOCUMENT HIERARCHY (seeded from docs/codex/)
// ============================================================

router.get('/hierarchy', async (req, res) => {
  try {
    const hierarchy = await codexService.getCodexHierarchy();
    const metadata = await codexService.getCodexMetadata();
    res.json({ success: true, data: { hierarchy, metadata } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
    }
    const results = await codexService.searchCodexDocuments(q);
    res.json({ success: true, data: results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/sections/:sectionId/rules', async (req, res) => {
  try {
    const rules = await codexService.getRulesBySection(req.params.sectionId);
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/adrs', async (req, res) => {
  try {
    const adrs = await codexService.getADRs();
    res.json({ success: true, data: adrs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/graph', async (req, res) => {
  try {
    const graphData = await codexService.getCodexGraphData();
    res.json({ success: true, data: graphData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/graph/expand/:nodeId', async (req, res) => {
  try {
    const data = await codexService.getGraphChildren(req.params.nodeId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/metadata', async (req, res) => {
  try {
    const metadata = await codexService.getCodexMetadata();
    res.json({ success: true, data: metadata });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// VALIDATION ENDPOINTS
// ============================================================

router.post('/validation/run', async (req, res) => {
  try {
    const { includeInfo, maxViolations, scopes } = req.body || {};
    const report = await codexValidation.validateAll({ includeInfo, maxViolations, scopes });
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/validation/report', async (req, res) => {
  try {
    const report = await codexValidation.getLatestReport();
    if (!report) {
      return res.json({ success: true, data: null, message: 'No validation reports yet. Run POST /validation/run first.' });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/validation/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const history = await codexValidation.getReportHistory(limit);
    res.json({ success: true, data: history });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/validation/score', async (req, res) => {
  try {
    const report = await codexValidation.getLatestReport();
    if (!report) {
      return res.json({ success: true, data: { score: null, message: 'No validation run yet' } });
    }
    res.json({ success: true, data: { score: report.complianceScore, timestamp: report.timestamp, violations: report.totalViolations } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// VALIDATION → ISSUES → PROPOSALS CYCLE
// ============================================================

router.post('/validation/sync-issues', async (req, res) => {
  try {
    // Run fresh validation to get violations (stored reports don't keep full violations array)
    const report = await codexValidation.validateAll({ includeInfo: true, maxViolations: 500 });
    if (!report || !report.violations || report.violations.length === 0) {
      return res.json({ success: true, data: { synced: 0, summary: { total: 0, errors: 0, warnings: 0, info: 0, autoFixable: 0 } } });
    }
    const result = await violationIssues.syncViolationsToIssues(report.violations);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/validation/issues', async (req, res) => {
  try {
    const { severity, autoFixable, type } = req.query;
    const issues = await violationIssues.getIssues({
      severity,
      autoFixable: autoFixable === 'true' ? true : autoFixable === 'false' ? false : undefined,
      type
    });
    const summary = await violationIssues.getSummary();
    res.json({ success: true, data: { issues, summary } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/validation/issues/:id/create-proposal', async (req, res) => {
  try {
    const proposal = await violationIssues.createProposalFromIssue(req.params.id);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Issue not found' });
    }
    res.json({ success: true, data: proposal });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/validation/auto-fix', async (req, res) => {
  try {
    const result = await violationIssues.createAutoFixProposals();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/validation/proposals', async (req, res) => {
  try {
    const proposals = await violationIssues.getProposals();
    res.json({ success: true, data: proposals });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// READ ENDPOINTS (governance rules)
// ============================================================

router.get('/principles', async (req, res) => {
  try {
    const principles = await codexService.getPrinciples();
    res.json({ success: true, data: principles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/rules', async (req, res) => {
  try {
    const rules = await codexService.getByType('CodexRule', {
      status: req.query.status || 'ACTIVE'
    });
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/rules/:principleId', async (req, res) => {
  try {
    const rules = await codexService.getRulesByPrinciple(req.params.principleId);
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/node/:codexId', async (req, res) => {
  try {
    const node = await codexService.getByCodexId(req.params.codexId);
    if (!node) {
      return res.status(404).json({ success: false, error: 'Node not found' });
    }
    res.json({ success: true, data: node });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/graph', async (req, res) => {
  try {
    const graph = await codexService.getCodexGraph();
    res.json({ success: true, data: graph });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/documentation', async (req, res) => {
  try {
    const doc = await codexService.generateDocumentation();
    if (req.query.format === 'markdown') {
      res.type('text/markdown').send(doc);
    } else {
      res.json({ success: true, data: { markdown: doc, length: doc.length } });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// VALIDATION ENDPOINTS
// ============================================================

router.get('/validate', async (req, res) => {
  try {
    const report = await codexValidator.validateCodex();
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/health', async (req, res) => {
  try {
    const health = await codexValidator.healthCheck();
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// PROPOSAL ENDPOINTS
// ============================================================

router.post('/proposals', async (req, res) => {
  try {
    const result = await codexGovernance.submitProposal(req.body, {
      agentId: req.body.agentId || req.headers['x-agent-id'] || 'unknown-agent'
    });
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/proposals', async (req, res) => {
  try {
    const proposals = await codexGovernance.getPendingProposals();
    res.json({ success: true, data: proposals });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/proposals/stats', async (req, res) => {
  try {
    const stats = await codexGovernance.getProposalStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/proposals/:codexId', async (req, res) => {
  try {
    const proposal = await codexGovernance.getProposal(req.params.codexId);
    if (!proposal) {
      return res.status(404).json({ success: false, error: 'Proposal not found' });
    }
    res.json({ success: true, data: proposal });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:codexId/review', async (req, res) => {
  try {
    const result = await codexGovernance.startReview(req.params.codexId, req.body.reviewerId || 'admin');
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:codexId/approve', async (req, res) => {
  try {
    const result = await codexGovernance.approveProposal(req.params.codexId, req.body.reviewerId || 'admin', req.body.notes);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:codexId/reject', async (req, res) => {
  try {
    if (!req.body.reason) {
      return res.status(400).json({ success: false, error: 'Rejection reason required' });
    }
    const result = await codexGovernance.rejectProposal(req.params.codexId, req.body.reviewerId || 'admin', req.body.reason);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/proposals/:codexId/apply', async (req, res) => {
  try {
    const result = await codexGovernance.applyProposal(req.params.codexId, { adminId: req.body.adminId || 'admin' });
    res.json({ success: true, data: result, codexVersion: result.codexVersion });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ============================================================
// BLACKCODEX ENDPOINTS
// ============================================================

router.get('/blackcodex', async (req, res) => {
  try {
    const entries = await blackCodexService.getAll();
    res.json({ success: true, data: entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/blackcodex/:codexId', async (req, res) => {
  try {
    const entry = await blackCodexService.getByCodexId(req.params.codexId);
    if (!entry) {
      return res.status(404).json({ success: false, error: 'Entry not found' });
    }
    await blackCodexService.recordReference(req.params.codexId);
    res.json({ success: true, data: entry });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// CONSISTENCY CHECK ENDPOINTS
// ============================================================

router.post('/consistency/run', async (req, res) => {
  try {
    const report = await consistencyRunner.run({
      verbose: false,
      stopOnError: req.body.stopOnError || false
    });
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/consistency/health', async (req, res) => {
  try {
    const health = await consistencyRunner.healthCheck();
    res.json({ success: true, data: health });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/consistency/check/:checkName', async (req, res) => {
  try {
    const result = await consistencyRunner.runCheck(req.params.checkName, req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/consistency/checks', async (req, res) => {
  try {
    const checks = consistencyRunner.getAvailableChecks();
    res.json({ success: true, data: checks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// LOADER ENDPOINTS (for agents)
// ============================================================

router.get('/load', async (req, res) => {
  try {
    const scopes = (req.query.scopes || '*').split(',').map(s => s.trim());
    const format = req.query.format || 'prompt';
    const includePrinciples = req.query.includePrinciples !== 'false';
    const includeAntiPatterns = req.query.includeAntiPatterns !== 'false';
    const result = await codexLoader.loadForScope(scopes, { format, includePrinciples, includeAntiPatterns });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/load/gxe-assistant', async (req, res) => {
  try {
    const result = await codexLoader.loadForGxeAssistant();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/load/flowdesk', async (req, res) => {
  try {
    const result = await codexLoader.loadForFlowDesk();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/load/extraction', async (req, res) => {
  try {
    const result = await codexLoader.loadForExtractionAgent();
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/rule/:codexId', async (req, res) => {
  try {
    const result = await codexLoader.getRule(req.params.codexId);
    if (!result) return res.status(404).json({ success: false, error: 'Rule not found' });
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/cache/clear', async (req, res) => {
  try {
    codexLoader.clearCache();
    res.json({ success: true, message: 'Cache cleared' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
