/**
 * Advisor Controller — NEXUS Advisor API.
 *
 * Endpoints:
 *   GET  /insights  — get insights for a namespace
 *   POST /insights/refresh — force refresh insights (bypass cache)
 *   GET  /health    — health check
 */

const InsightsEngine = require('../services/advisor/insights-engine');
const { CoherenceEvaluator } = require('../services/graph/coherence-evaluator');

const engine = new InsightsEngine();
const coherenceEvaluator = new CoherenceEvaluator();

// Lazy-loaded agent for /assistant endpoint
let _agentModule = null;
async function _getAgent() {
  if (!_agentModule) {
    const { getGraphBuilderAgent } = require('../services/ai/graph-builder-agent.service');
    try {
      const aopeg = require('../core/aopeg/index.js');
      if (!aopeg.isAOPEGInitialized()) {
        await aopeg.initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
      }
      const executorRegistry = aopeg.pluginRegistry || null;
      _agentModule = getGraphBuilderAgent({ executorRegistry });
    } catch (e) {
      console.warn('[Advisor] Could not load executor registry:', e.message);
      _agentModule = getGraphBuilderAgent({});
    }
  }
  return _agentModule;
}

/**
 * GET /api/v1/advisor/insights?namespace=GXE
 */
exports.getInsights = async (req, res) => {
  try {
    const { namespace = 'GXE' } = req.query;
    const forceRefresh = req.query.refresh === 'true';

    const result = await engine.generateInsights(namespace, { forceRefresh });
    res.json(result);
  } catch (error) {
    console.error('[AdvisorController] getInsights error:', error);
    res.status(500).json({
      error: 'Failed to generate insights',
      message: error.message,
    });
  }
};

/**
 * POST /api/v1/advisor/insights/refresh
 */
exports.refreshInsights = async (req, res) => {
  try {
    const { namespace = 'GXE' } = req.body;

    await engine.invalidateCache(namespace);
    const result = await engine.generateInsights(namespace, { forceRefresh: true });
    res.json(result);
  } catch (error) {
    console.error('[AdvisorController] refreshInsights error:', error);
    res.status(500).json({
      error: 'Failed to refresh insights',
      message: error.message,
    });
  }
};

/**
 * POST /api/v1/advisor/evaluate-clusters
 * Evaluate coherence of selected cluster candidates.
 * Body: { namespace, clusters: [{ id, nodeIds, name }], useLlm? }
 */
exports.evaluateClusters = async (req, res) => {
  try {
    const { namespace = 'GXE', clusters = [], useLlm = true } = req.body;

    if (!clusters.length) {
      return res.status(400).json({ error: 'No clusters provided' });
    }

    const candidates = clusters.map(c => ({
      nodes: c.nodeIds || [],
      strategy: c.strategy || 'manual',
      id: c.id,
      name: c.name,
    }));

    const evaluated = await coherenceEvaluator.evaluateClusters(
      candidates, namespace, { useLlm }
    );

    const results = evaluated.map((ev, i) => ({
      id: clusters[i]?.id || `cluster-${i}`,
      name: ev.suggestedName || clusters[i]?.name || `Cluster ${i + 1}`,
      coherenceScore: ev.coherenceScore || 0,
      sharedPurpose: ev.sharedPurpose || '',
      reasoning: ev.reasoning || '',
      evaluationMethod: ev.evaluationMethod || 'heuristic',
      nodeCount: candidates[i].nodes.length,
      metrics: {
        density: ev.density || 0,
        isolation: ev.isolation || 0,
        internalEdges: ev.internalEdges || 0,
        externalEdges: ev.externalEdges || 0,
      },
    }));

    res.json({
      evaluations: results,
      namespace,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[AdvisorController] evaluateClusters error:', error);
    res.status(500).json({
      error: 'Failed to evaluate clusters',
      message: error.message,
    });
  }
};

// Per-namespace session cache: namespace → sessionId (UUID from agent)
const _advisorSessions = new Map();

/**
 * POST /api/v1/advisor/assistant
 * GXE Assistant — chat with graph context + backlog tools.
 * Body: { namespace, message, context: { selectedNodes, graphStats, mode } }
 */
exports.assistant = async (req, res) => {
  try {
    const { namespace = 'GXE', message, context = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const agent = await _getAgent();

    // Reuse or create session for this namespace
    let sessionId = _advisorSessions.get(namespace);
    let session = sessionId ? agent.getSessionState(sessionId) : null;
    // getSessionState returns { error: 'Session not found' } if missing
    if (session?.error) session = null;

    if (!session) {
      const result = await agent.startSession({
        userId: 'advisor-assistant',
        userName: 'GXE Advisor',
        modelId: 'claude-haiku-4-5-20251001',
      });
      sessionId = result.sessionId;
      _advisorSessions.set(namespace, sessionId);
    }

    // Build context-enriched message
    const enrichedMessage = _buildEnrichedMessage(message, context);
    const response = await agent.chat(sessionId, enrichedMessage);

    res.json({
      response: response.content || 'I could not process that request.',
      actions: _extractActions(response),
      toolCalls: response.toolCalls || [],
    });
  } catch (error) {
    console.error('[Advisor] assistant error:', error);
    // Session may have been evicted — clear cache and retry once
    if (error.message?.includes('not found')) {
      _advisorSessions.delete(req.body?.namespace || 'GXE');
    }
    res.status(500).json({
      error: 'Assistant processing failed',
      message: error.message,
    });
  }
};

function _buildEnrichedMessage(message, context) {
  const parts = [message];
  if (context.selectedNodes?.length) {
    parts.push(`\n[Context: ${context.selectedNodes.length} nodes selected: ${context.selectedNodes.map(n => n.id || n).join(', ')}]`);
  }
  if (context.graphStats) {
    parts.push(`\n[Graph stats: ${JSON.stringify(context.graphStats)}]`);
  }
  return parts.join('');
}

function _extractActions(response) {
  const actions = [];
  if (response.toolCalls?.length) {
    for (const tc of response.toolCalls) {
      if (tc.name?.startsWith('backlog_')) {
        actions.push({ type: 'backlog', tool: tc.name, result: tc.result });
      }
    }
  }
  return actions;
}

/**
 * GET /api/v1/advisor/health
 */
exports.healthCheck = (_req, res) => {
  res.json({
    status: 'ok',
    service: 'nexus-advisor',
    timestamp: new Date().toISOString(),
  });
};
