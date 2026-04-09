const express = require('express');
const router = express.Router();
const sourceRef = require('../services/backlog/source-reference.service');
const execRecord = require('../services/backlog/execution-record.service');
const hierarchy = require('../services/backlog/task-hierarchy.service');
const actionLog = require('../services/backlog/action-log.service');
const resolution = require('../services/backlog/resolution.service');
const backlogService = require('../services/backlog/backlog.service');

// Sources
router.post('/items/:backlogId/sources', async (req, res) => {
  try {
    const s = await sourceRef.addSource(req.params.backlogId, req.body, { addedBy: req.headers['x-agent-id'] || 'user' });
    res.status(201).json({ success: true, data: s });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.post('/items/:backlogId/sources/mcp-tool', async (req, res) => {
  try {
    const { toolName, toolInput, toolOutput, relevance } = req.body;
    const s = await sourceRef.addMCPToolSource(req.params.backlogId, toolName, toolInput, toolOutput, relevance, { addedBy: req.headers['x-agent-id'] });
    res.status(201).json({ success: true, data: s });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.post('/items/:backlogId/sources/codex', async (req, res) => {
  try {
    const { codexId, relevance } = req.body;
    const s = await sourceRef.addCodexSource(req.params.backlogId, codexId, relevance, { addedBy: req.headers['x-agent-id'] });
    res.status(201).json({ success: true, data: s });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.get('/items/:backlogId/sources', async (req, res) => {
  try { res.json({ success: true, data: await sourceRef.getSourcesForTask(req.params.backlogId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Execution Records
router.post('/items/:backlogId/execution/start', async (req, res) => {
  try {
    const r = await execRecord.startExecution(req.params.backlogId, req.body.executedBy || req.headers['x-agent-id']);
    res.status(201).json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.post('/items/:backlogId/execution/decision', async (req, res) => {
  try {
    const r = await execRecord.addDecision(req.params.backlogId, { ...req.body, decidedBy: req.headers['x-agent-id'] });
    res.status(201).json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.post('/items/:backlogId/execution/impact', async (req, res) => {
  try {
    const r = await execRecord.addImpactAssessment(req.params.backlogId, req.body);
    res.status(201).json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.post('/items/:backlogId/execution/complete', async (req, res) => {
  try {
    const r = await execRecord.completeExecution(req.params.backlogId, req.body.summary, req.body.status);
    res.json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.get('/items/:backlogId/execution', async (req, res) => {
  try { res.json({ success: true, data: await execRecord.getFullExecutionRecord(req.params.backlogId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Hierarchy
router.post('/items/:backlogId/split', async (req, res) => {
  try {
    const { subtasks, rationale, decompositionStrategy } = req.body;
    const r = await hierarchy.splitTask(req.params.backlogId, subtasks, { rationale, decompositionStrategy }, { splitBy: req.headers['x-agent-id'] });
    res.status(201).json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.post('/items/:backlogId/subtasks', async (req, res) => {
  try {
    const r = await hierarchy.createSubtask(req.params.backlogId, req.body, { createdBy: req.headers['x-agent-id'] });
    res.status(201).json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.get('/items/:backlogId/hierarchy', async (req, res) => {
  try { res.json({ success: true, data: await hierarchy.getTaskWithHierarchy(req.params.backlogId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.get('/items/:backlogId/children', async (req, res) => {
  try { res.json({ success: true, data: await hierarchy.getChildren(req.params.backlogId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});
router.get('/items/:backlogId/can-complete', async (req, res) => {
  try { res.json({ success: true, data: await hierarchy.canCompleteParent(req.params.backlogId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// File changes tracking
router.post('/items/:backlogId/execution/file-change', async (req, res) => {
  try {
    const { changeType, filePath } = req.body;
    const r = await execRecord.recordFileChange(req.params.backlogId, changeType, filePath);
    res.json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Graph changes tracking
router.post('/items/:backlogId/execution/graph-change', async (req, res) => {
  try {
    const r = await execRecord.recordGraphChange(req.params.backlogId, req.body);
    res.status(201).json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// Tool usage tracking
router.post('/items/:backlogId/execution/tool-usage', async (req, res) => {
  try {
    const { toolName, input, output } = req.body;
    const r = await execRecord.recordToolUsage(req.params.backlogId, toolName, input, output);
    res.json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ── Action Log (CODEX-RULE-BA-060) ──────────────────────────────────────
router.post('/items/:backlogId/action-log', async (req, res) => {
  try {
    const entry = await actionLog.addEntry(req.params.backlogId, req.body, { agentId: req.headers['x-agent-id'] || req.body.agentId || 'user' });
    res.status(201).json({ success: true, data: entry });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.get('/items/:backlogId/action-log', async (req, res) => {
  try { res.json({ success: true, data: await actionLog.getEntries(req.params.backlogId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Resolution (CODEX-RULE-BA-061) ──────────────────────────────────────
router.post('/items/:backlogId/resolution', async (req, res) => {
  try {
    const r = await resolution.saveResolution(req.params.backlogId, req.body, { agentId: req.headers['x-agent-id'] || req.body.resolvedBy || 'user' });
    res.status(r.created ? 201 : 200).json({ success: true, data: r });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});
router.get('/items/:backlogId/resolution', async (req, res) => {
  try { res.json({ success: true, data: await resolution.getResolution(req.params.backlogId) }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ── Return to Proposed (CODEX-RULE-BA-063) ──────────────────────────────
router.post('/items/:backlogId/return-to-proposed', async (req, res) => {
  try {
    const item = await backlogService.returnToProposed(req.params.backlogId, req.body.reason);
    res.json({ success: true, data: item });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

module.exports = router;
