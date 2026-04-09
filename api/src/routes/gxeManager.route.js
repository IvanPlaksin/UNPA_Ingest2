/**
 * GXE Manager Routes
 *
 * REST API + SSE endpoints for GxeManager execution orchestrator.
 * Mounted at /api/v1/gxe-manager
 */

const express = require('express');
const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// LAZY INIT — GxeManagerService is created once on first request
// ═══════════════════════════════════════════════════════════════════════════

let _manager = null;
let _triggerEngine = null;
let _concurrencyGovernor = null;
let _transactionCoordinator = null;
let _initPromise = null;

async function getManager() {
  if (_manager) return _manager;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const { GxeManagerService, ExecutionRegistry, TriggerEngine, ConcurrencyGovernor, TransactionCoordinator } = require('../gxe-manager');
    const redisService = require('../services/redis.service');
    const { graphCatalogService } = require('../services/graphCatalog.service');

    // RuntimeEngine constructor
    const { RuntimeEngine } = require('../runtime/RuntimeEngine');

    // MCP registry (pluginRegistry)
    let mcpRegistry;
    try {
      const { pluginRegistry } = require('../core/aopeg/registry/plugin-registry');
      mcpRegistry = pluginRegistry;
    } catch (e) {
      // Fallback: minimal registry
      mcpRegistry = { getTool: () => null };
    }

    const redisClient = redisService.getClient();
    const registry = new ExecutionRegistry(redisClient);

    let memgraphService = null;
    try {
      memgraphService = require('../services/memgraph.service');
    } catch (e) {
      console.warn('[GxeManager Route] Memgraph not available');
    }

    // ConcurrencyGovernor
    _concurrencyGovernor = new ConcurrencyGovernor(registry, redisClient);

    const manager = new GxeManagerService({
      registry,
      mcpRegistry,
      RuntimeEngine,
      graphCatalog: graphCatalogService,
      memgraphService
    });

    await manager.start();
    _manager = manager;

    // TriggerEngine (depends on manager)
    _triggerEngine = new TriggerEngine({
      gxeManager: manager,
      queueManager: null, // QueueManager optional for now
      memgraphService
    });
    await _triggerEngine.initialize();

    // TransactionCoordinator (SAGA)
    if (redisClient && memgraphService) {
      _transactionCoordinator = new TransactionCoordinator(
        manager,
        registry,
        redisClient,
        memgraphService
      );
    }

    return manager;
  })();

  return _initPromise;
}

function getTriggerEngine() { return _triggerEngine; }
function getConcurrencyGovernor() { return _concurrencyGovernor; }
function getTransactionCoordinator() { return _transactionCoordinator; }

// ═══════════════════════════════════════════════════════════════════════════
// REST ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /executions — Launch a new graph execution
 * Body: { graphId, inputPayload?, priority?, triggerType?, timeoutSeconds?, metadata? }
 */
router.post('/executions', async (req, res) => {
  try {
    const manager = await getManager();
    const { graphId, inputPayload, ...options } = req.body;

    if (!graphId) {
      return res.status(400).json({ error: 'graphId is required' });
    }

    const record = await manager.launch(graphId, inputPayload || {}, options);
    res.status(201).json(record);
  } catch (err) {
    console.error('[GxeManager] POST /executions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /executions — List executions (with optional filters)
 * Query: status, graphId, limit, offset
 */
router.get('/executions', async (req, res) => {
  try {
    const manager = await getManager();
    const { status, graphId, limit, offset } = req.query;

    const filters = {};
    if (status) filters.status = status.split(',');
    if (graphId) filters.graphId = graphId;
    if (limit) filters.limit = parseInt(limit, 10);
    if (offset) filters.offset = parseInt(offset, 10);

    const records = await manager.listExecutions(filters);
    res.json({ executions: records, count: records.length });
  } catch (err) {
    console.error('[GxeManager] GET /executions error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /executions/:id — Get single execution
 */
router.get('/executions/:id', async (req, res) => {
  try {
    const manager = await getManager();
    const record = await manager.getExecution(req.params.id);
    if (!record) return res.status(404).json({ error: 'Execution not found' });
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /executions/:id/result — Get execution result
 */
router.get('/executions/:id/result', async (req, res) => {
  try {
    const manager = await getManager();
    const result = await manager.getExecutionResult(req.params.id);
    if (!result) return res.status(404).json({ error: 'Result not found' });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /executions/:id/pause
 */
router.post('/executions/:id/pause', async (req, res) => {
  try {
    const manager = await getManager();
    await manager.pause(req.params.id);
    res.json({ status: 'paused', executionId: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /executions/:id/resume
 * Body: { payload? } — optional signal data
 */
router.post('/executions/:id/resume', async (req, res) => {
  try {
    const manager = await getManager();
    await manager.resume(req.params.id, req.body.payload || {});
    res.json({ status: 'resumed', executionId: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /executions/:id/cancel
 * Body: { reason? }
 */
router.post('/executions/:id/cancel', async (req, res) => {
  try {
    const manager = await getManager();
    await manager.cancel(req.params.id, req.body.reason || 'api');
    res.json({ status: 'cancelled', executionId: req.params.id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /executions/:id/rollback
 * Body: { mode: 'RETRY_FAILED'|'SKIP_FAILED' }
 */
router.post('/executions/:id/rollback', async (req, res) => {
  try {
    const manager = await getManager();
    const result = await manager.rollback(req.params.id, {
      mode: req.body.mode || 'RETRY_FAILED'
    });
    res.json(result);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 :
      err.message.includes('Cannot rollback') ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /executions/:id/override-wait
 * Body: { nodeId, payload, reason (required, min 10 chars) }
 */
router.post('/executions/:id/override-wait', async (req, res) => {
  try {
    const manager = await getManager();
    const result = await manager.overrideAsyncWait(req.params.id, req.body);
    res.json(result);
  } catch (err) {
    const status = err.message.includes('not found') ? 404 :
      err.message.includes('not paused') ? 409 : 400;
    res.status(status).json({ error: err.message });
  }
});

/**
 * POST /executions/:id/inject-variable
 * Body: { key, value }
 */
router.post('/executions/:id/inject-variable', async (req, res) => {
  try {
    const manager = await getManager();
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'key is required' });
    const result = await manager.injectVariable(req.params.id, key, value);
    res.json(result);
  } catch (err) {
    res.status(err.message.includes('not found') ? 404 : 400).json({ error: err.message });
  }
});

/**
 * GET /audit — Query audit log
 * Query: executionId, action, operator, since, limit
 */
router.get('/audit', async (req, res) => {
  try {
    // Lazy-init AuditLogger not created here yet — use _auditLogger from route init
    // For now return from Redis directly
    const redisService = require('../services/redis.service');
    const { AuditLogger } = require('../gxe-manager');
    const logger = new AuditLogger(redisService.getClient());
    const entries = await logger.query({
      executionId: req.query.executionId,
      action: req.query.action,
      operator: req.query.operator,
      since: req.query.since ? parseInt(req.query.since, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : 100
    });
    res.json({ entries, count: entries.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /stats — Execution statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const manager = await getManager();
    const stats = await manager.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TRIGGER ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /triggers — List triggers (with optional filters)
 * Query: type, graphId, enabled
 */
router.get('/triggers', async (req, res) => {
  try {
    await getManager();
    const te = getTriggerEngine();
    const filters = {};
    if (req.query.type) filters.type = req.query.type;
    if (req.query.graphId) filters.graphId = req.query.graphId;
    if (req.query.enabled !== undefined) filters.enabled = req.query.enabled === 'true';

    const triggers = te.listTriggers(filters);
    res.json({ triggers, count: triggers.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /triggers — Register a new trigger
 */
router.post('/triggers', async (req, res) => {
  try {
    await getManager();
    const te = getTriggerEngine();
    const trigger = await te.registerTrigger(req.body);
    res.status(201).json(trigger);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /triggers/:triggerId
 */
router.get('/triggers/:triggerId', async (req, res) => {
  try {
    await getManager();
    const te = getTriggerEngine();
    const trigger = te.triggers.get(req.params.triggerId);
    if (!trigger) return res.status(404).json({ error: 'Trigger not found' });
    res.json(trigger);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /triggers/:triggerId
 */
router.delete('/triggers/:triggerId', async (req, res) => {
  try {
    await getManager();
    const te = getTriggerEngine();
    await te.unregisterTrigger(req.params.triggerId);
    res.status(204).send();
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /triggers/:triggerId/enable
 */
router.post('/triggers/:triggerId/enable', async (req, res) => {
  try {
    await getManager();
    const te = getTriggerEngine();
    await te.enableTrigger(req.params.triggerId);
    res.json({ enabled: true });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

/**
 * POST /triggers/:triggerId/disable
 */
router.post('/triggers/:triggerId/disable', async (req, res) => {
  try {
    await getManager();
    const te = getTriggerEngine();
    await te.disableTrigger(req.params.triggerId);
    res.json({ enabled: false });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /signals/:signalType — Send a signal (triggers SIGNAL-type triggers or resumes paused executions)
 * Body: { action?, payload?, executionId?, idempotencyKey?, source? }
 */
router.post('/signals/:signalType', async (req, res) => {
  try {
    await getManager();
    const te = getTriggerEngine();

    const signal = {
      signalType: req.params.signalType,
      action: req.body.action || 'START',
      executionId: req.body.executionId || null,
      payload: req.body.payload || {},
      idempotencyKey: req.body.idempotencyKey || `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      timestamp: Date.now(),
      source: req.body.source || 'api'
    };

    await te.handleIncomingSignal(signal);
    res.json({ success: true, signalType: signal.signalType, idempotencyKey: signal.idempotencyKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CAPACITY ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /capacity — Current system capacity report
 */
router.get('/capacity', async (req, res) => {
  try {
    await getManager();
    const gov = getConcurrencyGovernor();
    const report = await gov.getCapacityReport();
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION — Checkpoints & Variables
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /executions/:id/checkpoints — List checkpoints for an execution
 */
router.get('/executions/:id/checkpoints', async (req, res) => {
  try {
    const manager = await getManager();
    const checkpoints = await manager.getCheckpoints?.(req.params.id) || [];
    res.json(checkpoints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /executions/:id/variables — Get execution variables
 */
router.get('/executions/:id/variables', async (req, res) => {
  try {
    const manager = await getManager();
    const execution = await manager.getExecution(req.params.id);
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    res.json(execution.variables || execution.globalVariables || {});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// TRANSACTIONS (SAGA)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /transactions — Start a new SAGA transaction
 */
router.post('/transactions', async (req, res) => {
  try {
    await getManager();
    const tc = getTransactionCoordinator();
    if (!tc) return res.status(503).json({ error: 'TransactionCoordinator not available' });

    const sagaDefinition = req.body;
    if (!sagaDefinition.name) {
      return res.status(400).json({ error: 'Transaction name is required' });
    }
    if (!sagaDefinition.steps || !Array.isArray(sagaDefinition.steps) || sagaDefinition.steps.length === 0) {
      return res.status(400).json({ error: 'At least one step is required' });
    }
    for (const step of sagaDefinition.steps) {
      if (!step.graphId) {
        return res.status(400).json({ error: 'Each step must have a graphId' });
      }
    }

    const transaction = await tc.startTransaction(sagaDefinition);

    if (req.body.autoExecute !== false) {
      tc.executeTransaction(transaction.transactionId).catch(err => {
        console.error('Transaction execution error:', err);
      });
    }

    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /transactions — List SAGA transactions
 */
router.get('/transactions', async (req, res) => {
  try {
    await getManager();
    const tc = getTransactionCoordinator();
    if (!tc) return res.status(503).json({ error: 'TransactionCoordinator not available' });

    const transactions = await tc.listTransactions({
      status: req.query.status,
      name: req.query.name,
      limit: parseInt(req.query.limit) || 50
    });

    res.json({ transactions, count: transactions.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /transactions/:id — Get single transaction
 */
router.get('/transactions/:id', async (req, res) => {
  try {
    await getManager();
    const tc = getTransactionCoordinator();
    if (!tc) return res.status(503).json({ error: 'TransactionCoordinator not available' });

    const transaction = await tc.getTransaction(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /transactions/:id/execute
 */
router.post('/transactions/:id/execute', async (req, res) => {
  try {
    await getManager();
    const tc = getTransactionCoordinator();
    if (!tc) return res.status(503).json({ error: 'TransactionCoordinator not available' });

    await tc.executeTransaction(req.params.id);
    const transaction = await tc.getTransaction(req.params.id);
    res.json(transaction);
  } catch (error) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('already started') ? 409 : 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /transactions/:id/resume
 */
router.post('/transactions/:id/resume', async (req, res) => {
  try {
    await getManager();
    const tc = getTransactionCoordinator();
    if (!tc) return res.status(503).json({ error: 'TransactionCoordinator not available' });

    const transaction = await tc.resumeTransaction(req.params.id);
    res.json(transaction);
  } catch (error) {
    const status = error.message.includes('not found') ? 404 :
                   error.message.includes('not paused') ? 409 : 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /transactions/:id/cancel
 */
router.post('/transactions/:id/cancel', async (req, res) => {
  try {
    await getManager();
    const tc = getTransactionCoordinator();
    if (!tc) return res.status(503).json({ error: 'TransactionCoordinator not available' });

    const transaction = await tc.cancelTransaction(req.params.id, {
      runCompensation: req.body.runCompensation || false
    });
    res.json(transaction);
  } catch (error) {
    const status = error.message.includes('not found') ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
});

/**
 * POST /transactions/:id/compensate
 */
router.post('/transactions/:id/compensate', async (req, res) => {
  try {
    await getManager();
    const tc = getTransactionCoordinator();
    if (!tc) return res.status(503).json({ error: 'TransactionCoordinator not available' });

    const transaction = await tc.getTransaction(req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

    await tc._runCompensation(transaction);
    const updated = await tc.getTransaction(req.params.id);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// SSE ENDPOINT — Real-time execution events
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /stream — SSE stream of all GxeManager events
 */
router.get('/stream', async (req, res) => {
  try {
    const manager = await getManager();

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Send initial stats
    const stats = await manager.getStats();
    res.write(`event: stats\ndata: ${JSON.stringify(stats)}\n\n`);

    // Forward all manager events to SSE
    const events = [
      'execution.queued', 'execution.initializing', 'execution.started',
      'execution.paused', 'execution.resumed', 'execution.completed',
      'execution.failed', 'execution.cancelled', 'execution.runtimeState',
      'execution.nodeEvent'
    ];

    const handlers = {};
    for (const event of events) {
      handlers[event] = (data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };
      manager.on(event, handlers[event]);
    }

    // Heartbeat
    const heartbeat = setInterval(() => {
      res.write(`:heartbeat\n\n`);
    }, 15000);

    // Cleanup on disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      for (const [event, handler] of Object.entries(handlers)) {
        manager.off(event, handler);
      }
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
