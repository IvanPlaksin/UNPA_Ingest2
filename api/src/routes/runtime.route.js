/**
 * GXE Runtime Routes
 *
 * Express routes for the GXE Runtime Environment.
 * Connects RuntimeEngine to real AOPEG executors.
 *
 * Endpoints:
 *   POST /api/v1/runtime/execute           - Start DAG execution
 *   GET  /api/v1/runtime/execute/:id/stream - SSE stream for updates
 *   POST /api/v1/runtime/execute-stream    - Start + SSE combined
 *   POST /api/v1/runtime/execute/:id/cancel - Cancel execution
 *   POST /api/v1/runtime/execute/:id/pause  - Pause execution
 *   POST /api/v1/runtime/execute/:id/resume - Resume execution
 *   GET  /api/v1/runtime/execute/:id/status - Get status
 *   GET  /api/v1/runtime/executions/active  - List active executions
 *   GET  /api/v1/runtime/health             - Health check
 *   GET  /api/v1/runtime/executors          - List available executors
 *
 * @module routes/runtime.route
 */

const express = require('express');
const router = express.Router();
const { randomUUID } = require('node:crypto');

// Runtime components
const { RuntimeEngine, DEFAULT_CONFIG } = require('../runtime');
const { RuntimeSSEStreamer } = require('../runtime/observability');
const { AOPEGAdapter } = require('../runtime/integration');

// ═══════════════════════════════════════════════════════════════════════════
// AOPEG INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════

let aopegAdapter = null;
let mcpRegistry = null;
let pluginRegistry = null;
let initializationPromise = null;

/**
 * Lazy initialization of AOPEG adapter
 */
async function ensureInitialized() {
  if (mcpRegistry) return;

  if (!initializationPromise) {
    initializationPromise = initializeAOPEGBridge();
  }

  await initializationPromise;
}

/**
 * Initialize AOPEG bridge
 */
async function initializeAOPEGBridge() {
  try {
    // Try to load AOPEG plugin registry
    const aopegModule = require('../core/aopeg/index');

    // Ensure AOPEG is initialized
    if (!aopegModule.isAOPEGInitialized()) {
      console.log('[Runtime] Initializing AOPEG...');
      await aopegModule.initializeAOPEG({
        loadPlugins: true,
        loadDomainPlugins: true
      });
    }

    // Get plugin registry
    pluginRegistry = aopegModule.pluginRegistry;

    // Create AOPEG adapter
    aopegAdapter = new AOPEGAdapter(pluginRegistry);

    // Create MCP-compatible registry from AOPEG executors
    mcpRegistry = aopegAdapter.createMcpCompatibleRegistry();

    console.log('[Runtime] AOPEG bridge initialized');
    console.log('[Runtime] Available executors:', aopegAdapter.listExecutors().length);

  } catch (error) {
    console.warn('[Runtime] AOPEG not available, using mock registry:', error.message);

    // Create mock registry for testing without AOPEG
    mcpRegistry = createMockRegistry();
  }
}

/**
 * Create mock registry for testing
 */
function createMockRegistry() {
  return {
    hasTool: (name) => false,
    callTool: async (name, params) => ({
      success: false,
      error: `Mock registry: tool ${name} not available`
    }),
    listTools: () => []
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVE EXECUTIONS STORE
// ═══════════════════════════════════════════════════════════════════════════

const activeExecutions = new Map();
const EXECUTION_TTL_MS = 5 * 60 * 1000;

function scheduleCleanup(executionId) {
  setTimeout(() => {
    const entry = activeExecutions.get(executionId);
    // Don't clean up executions waiting for input
    if (entry && ['COMPLETED', 'FAILED', 'CANCELLED'].includes(entry.status)) {
      activeExecutions.delete(executionId);
    }
  }, EXECUTION_TTL_MS);
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Health check
 */
router.get('/health', async (req, res) => {
  await ensureInitialized();

  res.json({
    success: true,
    status: 'healthy',
    hasAOPEG: !!pluginRegistry,
    executorCount: aopegAdapter ? aopegAdapter.listExecutors().length : 0,
    activeExecutions: activeExecutions.size,
    timestamp: new Date().toISOString()
  });
});

/**
 * List available executors
 */
router.get('/executors', async (req, res) => {
  await ensureInitialized();

  const executors = aopegAdapter
    ? aopegAdapter.listExecutors()
    : [];

  res.json({
    success: true,
    count: executors.length,
    executors: executors.map(e => ({
      type: e.type,
      displayName: e.displayName,
      domain: e.domain,
      description: e.description
    }))
  });
});

/**
 * Start execution
 */
router.post('/execute', async (req, res) => {
  await ensureInitialized();

  try {
    const { dag, inputData, config } = req.body;

    if (!dag || !dag.nodes) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: dag with nodes is required'
      });
    }

    const executionId = randomUUID();
    const engine = new RuntimeEngine(mcpRegistry, {
      ...DEFAULT_CONFIG,
      ...config
    });

    activeExecutions.set(executionId, {
      engine,
      startTime: Date.now(),
      status: 'STARTING'
    });

    // Listen for WAITING_FOR_INPUT events (fires on each pause, including after resume)
    engine.on('execution:waitingForInput', (waitResult) => {
      const entry = activeExecutions.get(executionId);
      if (entry) {
        entry.status = 'WAITING_FOR_INPUT';
        entry.result = {
          ...entry.result,
          status: 'WAITING_FOR_INPUT',
          waitingNodes: waitResult.waitingNodes,
          nodeResults: waitResult.nodeResults,
          metrics: waitResult.metrics
        };
      }
    });

    // Listen for completion after resume cycles
    engine.on('execution:completed', (completionResult) => {
      const entry = activeExecutions.get(executionId);
      if (entry) {
        entry.status = completionResult?.status || 'COMPLETED';
        entry.result = { ...entry.result, ...completionResult, status: entry.status };
        scheduleCleanup(executionId);
      }
    });

    // Fire and forget
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
      streamUrl: `/api/v1/runtime/execute/${executionId}/stream`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * SSE stream for execution updates
 */
router.get('/execute/:executionId/stream', async (req, res) => {
  await ensureInitialized();

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

/**
 * Start execution + SSE combined
 */
router.post('/execute-stream', async (req, res) => {
  await ensureInitialized();

  try {
    const { dag, inputData, config } = req.body;

    if (!dag || !dag.nodes) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request: dag with nodes is required'
      });
    }

    const executionId = randomUUID();
    const engine = new RuntimeEngine(mcpRegistry, {
      ...DEFAULT_CONFIG,
      ...config
    });

    activeExecutions.set(executionId, {
      engine,
      startTime: Date.now(),
      status: 'STARTING'
    });

    // Attach SSE first
    const streamer = new RuntimeSSEStreamer(engine);
    streamer.attach(req, res, executionId);

    // Start execution
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
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
});

/**
 * Cancel execution
 */
router.post('/execute/:executionId/cancel', async (req, res) => {
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

/**
 * Pause execution
 */
router.post('/execute/:executionId/pause', async (req, res) => {
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

/**
 * Resume execution
 */
router.post('/execute/:executionId/resume', async (req, res) => {
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

/**
 * Resume execution with user input (for WAITING_FOR_INPUT state)
 */
router.post('/execute/:executionId/resume-input', async (req, res) => {
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
    const engine = entry.engine;
    const currentState = engine.getState();

    if (currentState !== 'WAITING') {
      return res.status(409).json({
        success: false,
        error: `Execution is not waiting for input (current state: ${currentState})`
      });
    }

    // Validate resume token against stored wait context
    const waitResult = entry.result;
    if (!waitResult || !waitResult.waitingNodes) {
      return res.status(409).json({
        success: false,
        error: 'No waiting nodes found in execution'
      });
    }

    // Find the node matching the resume token
    let targetNodeId = nodeId;
    let waitContext = null;

    for (const [nId, ctx] of Object.entries(waitResult.waitingNodes)) {
      if (ctx.resume_token === resume_token) {
        targetNodeId = targetNodeId || nId;
        waitContext = ctx;
        break;
      }
    }

    if (!waitContext) {
      return res.status(403).json({
        success: false,
        error: 'Invalid resume token'
      });
    }

    // Validate payload against expected_inputs (legacy array format only)
    // expected_inputs can be: string[] (field names) or object[] ({name, type, required})
    const validationErrors = [];
    if (Array.isArray(waitContext.expected_inputs)) {
      for (const input of waitContext.expected_inputs) {
        const fieldName = typeof input === 'string' ? input : input.name;
        const isRequired = typeof input === 'string' ? false : (input.required !== false);
        if (!fieldName) continue;
        const value = payload[fieldName];
        if (isRequired && value === undefined) {
          validationErrors.push(`Missing required field: ${fieldName}`);
        }
        if (value !== undefined && typeof input === 'object' && input.type === 'enum' && input.values) {
          if (!input.values.includes(value)) {
            validationErrors.push(`Invalid value for ${fieldName}: must be one of ${input.values.join(', ')}`);
          }
        }
      }
    }

    if (validationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payload',
        details: validationErrors
      });
    }

    // Listen for next WAITING or completion BEFORE resuming
    const nextState = new Promise((resolve) => {
      const timeout = setTimeout(() => resolve({ status: 'RUNNING' }), 10000);

      const onWaiting = (waitResult) => {
        clearTimeout(timeout);
        entry.status = 'WAITING_FOR_INPUT';
        entry.result = waitResult;
        engine.removeListener('execution:waitingForInput', onWaiting);
        engine.removeListener('execution:stateChange', onComplete);
        resolve({ status: 'WAITING_FOR_INPUT', waitingNodes: waitResult.waitingNodes });
      };

      const onComplete = (ev) => {
        if (ev.to === 'COMPLETED' || ev.to === 'FAILED') {
          clearTimeout(timeout);
          engine.removeListener('execution:waitingForInput', onWaiting);
          engine.removeListener('execution:stateChange', onComplete);
          resolve({ status: ev.to });
        }
      };

      engine.on('execution:waitingForInput', onWaiting);
      engine.on('execution:stateChange', onComplete);
    });

    // Resume execution
    await engine.resumeExecution(executionId, {
      nodeId: targetNodeId,
      output: payload
    });

    // Wait for next state (WAITING or completion)
    const nextResult = await nextState;
    entry.status = nextResult.status === 'WAITING_FOR_INPUT' ? 'WAITING_FOR_INPUT' : 'RUNNING';

    res.json({
      success: true,
      executionId,
      resumedNode: targetNodeId,
      status: nextResult.status || 'RUNNING',
      waitingNodes: nextResult.waitingNodes || null,
      message: 'Execution resumed with user input'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Resume execution with async signal (SignalOrchestrator-based).
 * Supports SINGLE/QUORUM/VOTE/FORCE resolution modes.
 * Token-based — does not require knowing the executionId.
 *
 * POST /api/v1/runtime/signal/resume
 * Body: { token: string, payload: object, actorId?: string, actorType?: string }
 */
router.post('/signal/resume', async (req, res) => {
  const { token, payload, actorId, actorType } = req.body;

  if (!token) {
    return res.status(400).json({ success: false, error: 'token is required' });
  }
  if (payload === undefined) {
    return res.status(400).json({ success: false, error: 'payload is required' });
  }

  try {
    const { SignalOrchestrator } = require('../runtime/signals');
    const { CheckpointManager } = require('../runtime/resilience/CheckpointManager');
    const redisService = require('../services/redis.service');

    const checkpoint = new CheckpointManager(redisService);
    const orchestrator = new SignalOrchestrator({ checkpointManager: checkpoint });

    const result = await orchestrator.resume(
      token,
      payload,
      actorId || req.user?.id || 'anonymous',
      actorType || 'HUMAN_USER'
    );

    const statusCodeMap = {
      RESOLVED: 200,
      VOTE_RECORDED: 202,
      ESCALATED: 202,
      INVALID_TOKEN: 403,
      NOT_FOUND: 404,
      ALREADY_RESOLVED: 409,
      VOTE_REJECTED: 409,
      FORCE_DENIED: 403,
    };

    res.status(statusCodeMap[result.status] || 200).json({
      success: result.status === 'RESOLVED' || result.status === 'VOTE_RECORDED',
      ...result,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get signal status for an execution.
 *
 * GET /api/v1/runtime/signal/:executionId/status
 */
router.get('/signal/:executionId/status', async (req, res) => {
  const { executionId } = req.params;

  try {
    const { SignalOrchestrator } = require('../runtime/signals');
    const { CheckpointManager } = require('../runtime/resilience/CheckpointManager');
    const redisService = require('../services/redis.service');

    const checkpoint = new CheckpointManager(redisService);
    const orchestrator = new SignalOrchestrator({ checkpointManager: checkpoint });

    const status = await orchestrator.getStatus(executionId);
    if (!status) {
      return res.status(404).json({ success: false, error: 'No signal found for execution' });
    }

    res.json({ success: true, ...status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get execution status
 */
router.get('/execute/:executionId/status', (req, res) => {
  const { executionId } = req.params;
  const entry = activeExecutions.get(executionId);

  if (!entry) {
    return res.status(404).json({
      success: false,
      error: 'Execution not found'
    });
  }

  // Include waitingNodes when in WAITING state for resume-input flow
  let waitingNodes = undefined;
  if (entry.result?.waitingNodes) {
    waitingNodes = entry.result.waitingNodes;
  }
  // Debug: log what entry.result looks like
  if (entry.status === 'WAITING_FOR_INPUT') {
    console.log('[RuntimeRoute:status] WAITING entry.result keys:', entry.result ? Object.keys(entry.result).join(',') : 'null');
    console.log('[RuntimeRoute:status] waitingNodes:', entry.result?.waitingNodes ? 'EXISTS' : 'MISSING');
  }

  res.json({
    success: true,
    executionId,
    status: entry.status,
    state: entry.engine.getState(),
    progress: entry.engine.getProgress?.() || null,
    startTime: entry.startTime,
    duration: Date.now() - entry.startTime,
    hasResult: !!entry.result,
    waitingNodes,
    error: entry.error
  });
});

/**
 * List active executions
 */
router.get('/executions/active', (req, res) => {
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

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION ADVICE (AI-powered fix recommendations)
// ═══════════════════════════════════════════════════════════════════════════

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

router.post('/validation-advice', async (req, res) => {
  const { errors, warnings, graph, completedLevel } = req.body;

  if (!errors || !Array.isArray(errors) || errors.length === 0) {
    return res.status(400).json({ success: false, error: 'No validation errors provided' });
  }

  try {
    const { structuredOutput } = require('../services/ai/structured-output');

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

    const prompt = `You are a GXE (Graph eXecution Engine) expert. Analyze these DAG validation errors and provide specific fix recommendations WITH concrete graph mutations that can be applied automatically.

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
4. **Concrete mutations** to fix the issue. Available mutation types:
   - "remove_edge": Remove an edge. Provide source and target node IDs.
   - "add_edge": Add an edge. Provide source and target node IDs.
   - "update_node": Update a node property. Provide nodeId and changes object (e.g. { "toolId": "text.sanitize" }).
   - "remove_node": Remove a node. Provide nodeId.

IMPORTANT: Only propose mutations you are confident will fix the error. Use exact node IDs from the graph. Each mutation must have a human-readable "description" field.

Be concise and practical. Use the node IDs/labels from the graph context.`;

    const schema = {
      type: 'object',
      description: 'Validation fix recommendations with executable mutations',
      properties: {
        recommendations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              errorIndex: { type: 'number', description: 'Index of the error (0-based)' },
              explanation: { type: 'string', description: 'Clear explanation of what went wrong' },
              fix: { type: 'string', description: 'Specific actionable fix' },
              affectedNodes: { type: 'array', items: { type: 'string' }, description: 'Node IDs affected' },
              severity: { type: 'string', enum: ['critical', 'warning', 'info'] }
            },
            required: ['errorIndex', 'explanation', 'fix']
          }
        },
        mutations: {
          type: 'array',
          description: 'Concrete graph mutations to fix the errors. Each mutation is an atomic operation.',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['remove_edge', 'add_edge', 'update_node', 'remove_node'], description: 'Type of graph mutation' },
              description: { type: 'string', description: 'Human-readable description of what this mutation does' },
              nodeId: { type: 'string', description: 'Target node ID (for update_node, remove_node)' },
              source: { type: 'string', description: 'Source node ID (for add_edge, remove_edge)' },
              target: { type: 'string', description: 'Target node ID (for add_edge, remove_edge)' },
              changes: { type: 'object', description: 'Properties to update (for update_node). Keys: toolId, label, kind, parameters' }
            },
            required: ['type', 'description']
          }
        },
        summary: { type: 'string', description: 'Brief overall summary of what needs to be fixed' }
      },
      required: ['recommendations', 'mutations', 'summary']
    };

    const result = await structuredOutput.generate(prompt, schema, {
      provider: 'anthropic',
      modelId: 'claude-haiku-4-5-20251001',
      temperature: 0.2,
      maxTokens: 2048
    });

    if (result.success) {
      res.json({ success: true, advice: result.data, model: result.model, usage: result.usage });
    } else {
      res.json({
        success: true,
        advice: {
          recommendations: errors.map((e, i) => ({
            errorIndex: i, explanation: e.message || String(e), fix: getBasicFix(e), severity: 'critical'
          })),
          summary: `${errors.length} validation error(s) found at level ${completedLevel || '?'}. AI recommendations unavailable.`
        },
        fallback: true
      });
    }
  } catch (error) {
    res.json({
      success: true,
      advice: {
        recommendations: errors.map((e, i) => ({
          errorIndex: i, explanation: e.message || String(e), fix: getBasicFix(e), severity: 'critical'
        })),
        summary: `${errors.length} validation error(s). AI advice failed: ${error.message}`
      },
      fallback: true
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = router;
