/**
 * Runtime Routes
 *
 * Express router setup for GXE RuntimeEngine execution endpoints.
 * Provides REST API and SSE streaming for graph execution.
 *
 * Part of GXE Runtime Environment P1.
 *
 * @module runtime/integration/runtimeRoutes
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * INTEGRATION INSTRUCTIONS:
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * In gxe.route.js, add:
 *
 *   const { createRuntimeRoutes } = require('../runtime/integration/runtimeRoutes');
 *
 *   // After getting mcpRegistry (from getMcpServer or similar):
 *   createRuntimeRoutes(router, mcpRegistry, pluginRegistry);
 *
 * This will mount the following endpoints:
 *   POST /api/gxe/v2/execute           - Start execution, returns executionId
 *   GET  /api/gxe/v2/execute/:id/stream - SSE stream for execution updates
 *   POST /api/gxe/v2/execute-stream    - Start execution + SSE in one request
 *   POST /api/gxe/v2/execute/:id/cancel - Cancel execution
 *   POST /api/gxe/v2/execute/:id/pause  - Pause execution
 *   POST /api/gxe/v2/execute/:id/resume - Resume execution
 *   GET  /api/gxe/v2/execute/:id/status - Get execution status
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { randomUUID } = require('node:crypto');
const { RuntimeEngine } = require('../RuntimeEngine');
const { RuntimeSSEStreamer } = require('../observability/RuntimeSSEStreamer');

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE EXECUTIONS STORE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Map of executionId → { engine, startTime, status }
 * @type {Map<string, Object>}
 */
const activeExecutions = new Map();

/**
 * Cleanup completed executions after TTL
 */
const EXECUTION_TTL_MS = 5 * 60 * 1000; // 5 minutes

function scheduleCleanup(executionId) {
  setTimeout(() => {
    const entry = activeExecutions.get(executionId);
    if (entry && (entry.status === 'COMPLETED' || entry.status === 'FAILED' || entry.status === 'CANCELLED')) {
      activeExecutions.delete(executionId);
    }
  }, EXECUTION_TTL_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create Runtime execution routes
 *
 * @param {Object} router - Express router
 * @param {Object} mcpRegistry - MCP tool registry
 * @param {Object} [pluginRegistry] - Optional AOPEG plugin registry for adapter
 * @returns {Object} Express router with routes added
 */
function createRuntimeRoutes(router, mcpRegistry, pluginRegistry = null) {

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v2/execute
  // Start execution, returns executionId immediately
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/v2/execute', async (req, res) => {
    try {
      const { dag, inputData, config } = req.body;

      if (!dag || !dag.nodes) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request: dag with nodes is required'
        });
      }

      const executionId = randomUUID();
      const engine = new RuntimeEngine(mcpRegistry, config);

      // Store execution entry
      activeExecutions.set(executionId, {
        engine,
        startTime: Date.now(),
        status: 'STARTING'
      });

      // Fire-and-forget execution
      engine.execute(dag, inputData || {}, { executionId })
        .then(result => {
          const entry = activeExecutions.get(executionId);
          if (entry) {
            entry.status = result.status;
            entry.result = result;
            scheduleCleanup(executionId);
          }
        })
        .catch(err => {
          const entry = activeExecutions.get(executionId);
          if (entry) {
            entry.status = 'FAILED';
            entry.error = err.message;
            scheduleCleanup(executionId);
          }
        });

      res.json({
        success: true,
        executionId,
        message: 'Execution started. Connect to SSE stream for updates.',
        streamUrl: `/api/gxe/v2/execute/${executionId}/stream`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v2/execute/:executionId/stream
  // SSE stream for execution updates
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/v2/execute/:executionId/stream', (req, res) => {
    const { executionId } = req.params;
    const entry = activeExecutions.get(executionId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found or already completed'
      });
    }

    const streamer = new RuntimeSSEStreamer(entry.engine);
    streamer.attach(req, res, executionId);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v2/execute-stream
  // Start execution + SSE in one request (convenience endpoint)
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/v2/execute-stream', async (req, res) => {
    try {
      const { dag, inputData, config } = req.body;

      if (!dag || !dag.nodes) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request: dag with nodes is required'
        });
      }

      const executionId = randomUUID();
      const engine = new RuntimeEngine(mcpRegistry, config);

      // Store execution entry
      activeExecutions.set(executionId, {
        engine,
        startTime: Date.now(),
        status: 'STARTING'
      });

      // Attach SSE streamer BEFORE starting execution
      const streamer = new RuntimeSSEStreamer(engine);
      streamer.attach(req, res, executionId);

      // Start execution (streamer already listening to events)
      engine.execute(dag, inputData || {}, { executionId })
        .then(result => {
          const entry = activeExecutions.get(executionId);
          if (entry) {
            entry.status = result.status;
            entry.result = result;
            scheduleCleanup(executionId);
          }
        })
        .catch(err => {
          const entry = activeExecutions.get(executionId);
          if (entry) {
            entry.status = 'FAILED';
            entry.error = err.message;
            scheduleCleanup(executionId);
          }
          // Streamer will handle execution:failed event
        });
    } catch (error) {
      // If SSE hasn't started yet, return JSON error
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v2/execute/:executionId/cancel
  // Cancel an active execution
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/v2/execute/:executionId/cancel', async (req, res) => {
    const { executionId } = req.params;
    const entry = activeExecutions.get(executionId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    try {
      await entry.engine.cancel();
      entry.status = 'CANCELLED';
      scheduleCleanup(executionId);

      res.json({
        success: true,
        message: 'Execution cancelled',
        state: entry.engine.getState()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v2/execute/:executionId/pause
  // Pause an active execution
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/v2/execute/:executionId/pause', async (req, res) => {
    const { executionId } = req.params;
    const entry = activeExecutions.get(executionId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    try {
      await entry.engine.pause();
      entry.status = 'PAUSED';

      res.json({
        success: true,
        message: 'Execution paused',
        state: entry.engine.getState()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v2/execute/:executionId/resume
  // Resume a paused execution
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/v2/execute/:executionId/resume', async (req, res) => {
    const { executionId } = req.params;
    const entry = activeExecutions.get(executionId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    try {
      await entry.engine.resume();
      entry.status = 'RUNNING';

      res.json({
        success: true,
        message: 'Execution resumed',
        state: entry.engine.getState()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v2/execute/:executionId/resume-input
  // Resume execution with user-provided input (for WAITING_INPUT state)
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/v2/execute/:executionId/resume-input', async (req, res) => {
    const { executionId } = req.params;
    const { resume_token, payload, nodeId } = req.body;
    const entry = activeExecutions.get(executionId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    if (!resume_token || !payload) {
      return res.status(400).json({
        success: false,
        error: 'resume_token and payload are required'
      });
    }

    try {
      await entry.engine.resumeExecution(executionId, {
        nodeId,
        resume_token,
        output: payload
      });
      entry.status = 'RUNNING';

      res.json({
        success: true,
        message: 'Execution resumed with input',
        state: entry.engine.getState()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v2/execute/:executionId/status
  // Get execution status without SSE
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/v2/execute/:executionId/status', (req, res) => {
    const { executionId } = req.params;
    const entry = activeExecutions.get(executionId);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found'
      });
    }

    const engine = entry.engine;

    res.json({
      success: true,
      executionId,
      status: entry.status,
      state: engine.getState(),
      progress: engine.getProgress?.() || null,
      startTime: entry.startTime,
      duration: Date.now() - entry.startTime,
      hasResult: !!entry.result,
      error: entry.error
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /v2/executions/active
  // List all active executions
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/v2/executions/active', (req, res) => {
    const active = [];

    for (const [executionId, entry] of activeExecutions) {
      active.push({
        executionId,
        status: entry.status,
        startTime: entry.startTime,
        duration: Date.now() - entry.startTime,
        state: entry.engine.getState()
      });
    }

    res.json({
      success: true,
      count: active.length,
      executions: active
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /v2/validation-advice
  // Get AI-powered fix recommendations for validation errors
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/v2/validation-advice', async (req, res) => {
    const { errors, warnings, graph, completedLevel } = req.body;

    if (!errors || !Array.isArray(errors) || errors.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No validation errors provided'
      });
    }

    try {
      const { structuredOutput } = require('../../services/ai/structured-output');

      // Build context
      const nodesSummary = (graph?.nodes || []).map(n => {
        const d = n.data || n;
        return `- ${n.id}: "${d.label || d.toolId || 'unknown'}" (toolId: ${d.toolId || 'not set'})`;
      }).join('\n');

      const edgesSummary = (graph?.edges || []).map(e =>
        `- ${e.source} → ${e.target} (sourceHandle: ${e.sourceHandle || 'default'}, targetHandle: ${e.targetHandle || 'default'})`
      ).join('\n');

      const errorsList = errors.map((e, i) =>
        `${i + 1}. [Level ${e.level || '?'}] ${e.message || e}`
      ).join('\n');

      const warningsList = (warnings || []).map((w, i) =>
        `${i + 1}. ${w.message || w}`
      ).join('\n');

      const prompt = `You are a GXE (Graph eXecution Engine) expert. Analyze these DAG validation errors and provide specific fix recommendations.

## Validation Level Reached: ${completedLevel || 'unknown'}/6
Levels: 1=Structural, 2=DAG (acyclicity), 3=Flow (connectivity), 4=Tool validity, 5=Type check, 6=Execution readiness

## Errors
${errorsList}

${warningsList ? `## Warnings\n${warningsList}` : ''}

## Graph Nodes
${nodesSummary || '(empty)'}

## Graph Edges
${edgesSummary || '(none)'}

For each error, provide:
1. A clear explanation of what went wrong
2. A specific actionable fix recommendation
3. Which node(s) or edge(s) are affected

Be concise and practical. Use the node IDs/labels from the graph context.`;

      const schema = {
        type: 'object',
        description: 'Validation fix recommendations',
        properties: {
          recommendations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                errorIndex: { type: 'number', description: 'Index of the error (0-based)' },
                explanation: { type: 'string', description: 'Clear explanation of what went wrong' },
                fix: { type: 'string', description: 'Specific actionable fix' },
                affectedNodes: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Node IDs affected'
                },
                severity: { type: 'string', enum: ['critical', 'warning', 'info'] }
              },
              required: ['errorIndex', 'explanation', 'fix']
            }
          },
          summary: { type: 'string', description: 'Brief overall summary of what needs to be fixed' }
        },
        required: ['recommendations', 'summary']
      };

      const result = await structuredOutput.generate(prompt, schema, {
        provider: 'anthropic',
        modelId: 'claude-haiku-4-5-20251001',
        temperature: 0.2,
        maxTokens: 2048
      });

      if (result.success) {
        res.json({
          success: true,
          advice: result.data,
          model: result.model,
          usage: result.usage
        });
      } else {
        // Fallback: return basic advice without AI
        res.json({
          success: true,
          advice: {
            recommendations: errors.map((e, i) => ({
              errorIndex: i,
              explanation: e.message || String(e),
              fix: getBasicFix(e),
              severity: 'critical'
            })),
            summary: `${errors.length} validation error(s) found at level ${completedLevel || '?'}. AI recommendations unavailable.`
          },
          fallback: true
        });
      }
    } catch (error) {
      // Fallback on any error
      res.json({
        success: true,
        advice: {
          recommendations: errors.map((e, i) => ({
            errorIndex: i,
            explanation: e.message || String(e),
            fix: getBasicFix(e),
            severity: 'critical'
          })),
          summary: `${errors.length} validation error(s). AI advice failed: ${error.message}`
        },
        fallback: true
      });
    }
  });

  return router;
}

/**
 * Basic fix recommendation without AI (fallback)
 */
function getBasicFix(error) {
  const msg = (error.message || String(error)).toLowerCase();
  if (msg.includes('cycle') || msg.includes('circular')) return 'Remove edges that create cycles to make the graph a proper DAG';
  if (msg.includes('isolated') || msg.includes('disconnected')) return 'Connect this node to the rest of the graph with appropriate edges';
  if (msg.includes('tool') && msg.includes('unknown')) return 'Set a valid toolId on this node (e.g. text.sanitize, extraction.entities, ai.generate)';
  if (msg.includes('type') && msg.includes('mismatch')) return 'Ensure the output port type matches the connected input port type';
  if (msg.includes('port') && msg.includes('missing')) return 'Check that the connected ports exist on both source and target nodes';
  if (msg.includes('empty') || msg.includes('no nodes')) return 'Add at least one node to the graph before executing';
  return 'Review the node configuration and connections to resolve this issue';
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  createRuntimeRoutes,
  activeExecutions // Exposed for testing
};
