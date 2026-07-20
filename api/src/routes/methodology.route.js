'use strict';

const express = require('express');
const router = express.Router();
const { getInvestigationMethodologyService } = require('../services/methodology/investigation-methodology.service');

// Lazy-initialized MCP registry (same pattern as camel-chat.service.js)
let _mcpRegistry = null;
async function ensureMcpRegistry() {
  if (_mcpRegistry) return _mcpRegistry;
  try {
    const aopegModule = require('../core/aopeg/index');
    if (!aopegModule.isAOPEGInitialized()) {
      console.log('[Methodology] Initializing AOPEG...');
      await aopegModule.initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true, loadToolPlugins: false });
      console.log('[Methodology] AOPEG initialized');
    }
    const { AOPEGAdapter } = require('../runtime/integration');
    const adapter = new AOPEGAdapter(aopegModule.pluginRegistry);
    _mcpRegistry = adapter.createMcpCompatibleRegistry();
    if (!_mcpRegistry) throw new Error('createMcpCompatibleRegistry() returned null');
    console.log('[Methodology] MCP registry created');
    return _mcpRegistry;
  } catch (e) {
    console.error('[Methodology] ensureMcpRegistry failed:', e.message);
    throw e;
  }
}

const ok  = (res, data)        => res.json({ success: true, data });
const err = (res, e, code=500) => res.status(code).json({ success: false, error: e.message });

// ── Investigation Methodologies ───────────────────────────────────────────────
// Prefix: /api/v1/methodology/investigation

// GET  /api/v1/methodology/investigation
router.get('/', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;
    ok(res, await getInvestigationMethodologyService().list({ status: status || null, limit: Number(limit), offset: Number(offset) }));
  } catch (e) { err(res, e); }
});

// POST /api/v1/methodology/investigation
router.post('/', async (req, res) => {
  try {
    const { name, userCase, description, parameterSchema, qualityRubric, graphId, version } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });
    ok(res, await getInvestigationMethodologyService().create({ name, userCase, description, parameterSchema, qualityRubric, graphId, version }));
  } catch (e) { err(res, e); }
});

// GET  /api/v1/methodology/investigation/:id
router.get('/:id', async (req, res) => {
  try {
    const m = await getInvestigationMethodologyService().getById(req.params.id);
    if (!m) return res.status(404).json({ success: false, error: 'Not found' });
    ok(res, m);
  } catch (e) { err(res, e); }
});

// PATCH /api/v1/methodology/investigation/:id
router.patch('/:id', async (req, res) => {
  try {
    ok(res, await getInvestigationMethodologyService().update(req.params.id, req.body));
  } catch (e) { err(res, e); }
});

// PATCH /api/v1/methodology/investigation/:id/status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });
    ok(res, await getInvestigationMethodologyService().setStatus(req.params.id, status));
  } catch (e) { err(res, e); }
});

// POST /api/v1/methodology/investigation/:id/execute
router.post('/:id/execute', async (req, res) => {
  try {
    const { parameters = {}, sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, error: 'sessionId is required' });

    const mcpRegistry = await ensureMcpRegistry();
    const { getInvestigationVersionService } = require('../services/investigation/investigation-version.service');
    const { getInvestigationArtifactService } = require('../services/investigation/investigation-artifact.service');

    const services = {
      mcpRegistry,
      investigationVersionService: getInvestigationVersionService(),
      investigationArtifactService: getInvestigationArtifactService(),
    };

    ok(res, await getInvestigationMethodologyService().execute(req.params.id, parameters, sessionId, services));
  } catch (e) { err(res, e); }
});

// POST /api/v1/methodology/investigation/:id/evaluate
router.post('/:id/evaluate', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, error: 'content is required' });
    ok(res, await getInvestigationMethodologyService().evaluateResult(content, req.params.id));
  } catch (e) { err(res, e); }
});

module.exports = router;
