/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG CONTROLLER
 * REST API controller for AOPEG graph and execution management
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

// Lazy imports to avoid circular dependencies
let aopegModule = null;
let repositoryModule = null;
let memgraphService = null;
let patternLibraryInstance = null;

async function getAOPEG() {
  if (!aopegModule) {
    aopegModule = require('../core/aopeg/index.js');
  }
  return aopegModule;
}

async function getRepositories() {
  if (!repositoryModule) {
    repositoryModule = require('../core/aopeg/repository/index.js');
  }
  return repositoryModule;
}

async function getMemgraphService() {
  if (!memgraphService) {
    // memgraph.service exports a singleton instance, not a class
    memgraphService = require('../services/memgraph.service');
  }
  return memgraphService;
}

/**
 * Initialize PatternLibrary for feedback loop with Memgraph persistence
 */
async function getPatternLibrary() {
  if (!patternLibraryInstance) {
    try {
      const { PatternLibrary } = require('../runtime/learning');
      const memgraph = await getMemgraphService();

      patternLibraryInstance = new PatternLibrary({
        maxSize: 100,
        minSuccessRate: 0.7,
        memgraphService: memgraph
      });

      // Warm up cache from Memgraph on initialization
      await patternLibraryInstance.warmup();

      console.log('[AOPEG] PatternLibrary initialized with Memgraph persistence');
    } catch (err) {
      console.warn('[AOPEG] Failed to initialize PatternLibrary:', err.message);
      // Fallback to in-memory only
      try {
        const { PatternLibrary } = require('../runtime/learning');
        patternLibraryInstance = new PatternLibrary({
          maxSize: 100,
          minSuccessRate: 0.7
        });
        console.log('[AOPEG] PatternLibrary initialized (in-memory fallback)');
      } catch (e) {
        console.error('[AOPEG] PatternLibrary initialization failed completely');
      }
    }
  }
  return patternLibraryInstance;
}

// Active SSE connections for execution streaming
const activeConnections = new Map();

// ────────────────────────────────────────────────────────────────────────────
// GRAPH ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/aopeg/graphs
 * List all graphs with optional filtering
 */
exports.listGraphs = async (req, res) => {
  try {
    const { domain, status, limit = 100, offset = 0 } = req.query;

    const { getGraphRepository } = await getRepositories();
    const mg = await getMemgraphService();
    const graphRepo = getGraphRepository(mg);

    const graphs = await graphRepo.list(domain, status, Number(limit), Number(offset));

    res.json({
      success: true,
      data: graphs,
      count: graphs.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('[AOPEG] Error listing graphs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/graphs/:graphId
 * Get a specific graph with all nodes and edges
 */
exports.getGraph = async (req, res) => {
  try {
    const { graphId } = req.params;

    const { getGraphRepository } = await getRepositories();
    const mg = await getMemgraphService();
    const graphRepo = getGraphRepository(mg);

    const graph = await graphRepo.get(graphId);

    if (!graph) {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
      });
    }

    res.json({
      success: true,
      data: graph,
    });
  } catch (error) {
    console.error('[AOPEG] Error getting graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/aopeg/graphs
 * Create a new graph
 */
exports.createGraph = async (req, res) => {
  try {
    const { name, description, domain, nodes = [], edges = [], defaultParameters = {}, metadata = {} } = req.body;

    if (!name || !domain) {
      return res.status(400).json({
        success: false,
        error: 'Name and domain are required',
      });
    }

    // Validate nodes have required fields
    for (const node of nodes) {
      if (!node.id || !node.name || !node.executorType) {
        return res.status(400).json({
          success: false,
          error: 'Each node must have id, name, and executorType',
        });
      }
    }

    // Validate edges reference existing nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    for (const edge of edges) {
      if (!nodeIds.has(edge.sourceNodeId) || !nodeIds.has(edge.targetNodeId)) {
        return res.status(400).json({
          success: false,
          error: `Edge references non-existent node: ${edge.sourceNodeId} -> ${edge.targetNodeId}`,
        });
      }
    }

    const graph = {
      id: uuidv4(),
      name,
      description,
      domain,
      version: '1.0.0',
      status: 'DRAFT',
      nodes: nodes.map(n => ({
        ...n,
        id: n.id || uuidv4(),
        parameters: n.parameters || {},
      })),
      edges: edges.map(e => ({
        ...e,
        id: e.id || uuidv4(),
      })),
      entryNodeId: nodes[0]?.id || null,
      defaultParameters,
      metadata,
    };

    const { getGraphRepository } = await getRepositories();
    const mg = await getMemgraphService();
    const graphRepo = getGraphRepository(mg);

    await graphRepo.save(graph);

    res.status(201).json({
      success: true,
      data: graph,
      message: 'Graph created successfully',
    });
  } catch (error) {
    console.error('[AOPEG] Error creating graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * PUT /api/v1/aopeg/graphs/:graphId
 * Update an existing graph
 */
exports.updateGraph = async (req, res) => {
  try {
    const { graphId } = req.params;
    const updates = req.body;

    const { getGraphRepository } = await getRepositories();
    const mg = await getMemgraphService();
    const graphRepo = getGraphRepository(mg);

    const existing = await graphRepo.get(graphId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
      });
    }

    // Merge updates
    const updatedGraph = {
      ...existing,
      ...updates,
      id: graphId, // Prevent ID change
      version: incrementVersion(existing.version),
    };

    await graphRepo.save(updatedGraph);

    res.json({
      success: true,
      data: updatedGraph,
      message: 'Graph updated successfully',
    });
  } catch (error) {
    console.error('[AOPEG] Error updating graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * DELETE /api/v1/aopeg/graphs/:graphId
 * Delete a graph
 */
exports.deleteGraph = async (req, res) => {
  try {
    const { graphId } = req.params;

    const { getGraphRepository } = await getRepositories();
    const mg = await getMemgraphService();
    const graphRepo = getGraphRepository(mg);

    const existing = await graphRepo.get(graphId);

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
      });
    }

    await graphRepo.delete(graphId);

    res.json({
      success: true,
      message: 'Graph deleted successfully',
    });
  } catch (error) {
    console.error('[AOPEG] Error deleting graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/aopeg/graphs/:graphId/activate
 * Activate a graph (change status from DRAFT to ACTIVE)
 */
exports.activateGraph = async (req, res) => {
  try {
    const { graphId } = req.params;

    const { getGraphRepository } = await getRepositories();
    const { pluginRegistry } = await getAOPEG();
    const mg = await getMemgraphService();
    const graphRepo = getGraphRepository(mg);

    const graph = await graphRepo.get(graphId);

    if (!graph) {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
      });
    }

    // Validate all executors are registered
    const executorTypes = graph.nodes.map(n => n.executorType);
    const validation = pluginRegistry.validateGraphExecutors(executorTypes);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: `Missing executors: ${validation.missingExecutors.join(', ')}`,
        missingExecutors: validation.missingExecutors,
      });
    }

    graph.status = 'ACTIVE';
    await graphRepo.save(graph);

    res.json({
      success: true,
      data: graph,
      message: 'Graph activated successfully',
    });
  } catch (error) {
    console.error('[AOPEG] Error activating graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/aopeg/graphs/:graphId/validate
 * Validate a graph without activating it
 */
exports.validateGraph = async (req, res) => {
  try {
    const { graphId } = req.params;

    const { getGraphRepository } = await getRepositories();
    const { pluginRegistry } = await getAOPEG();
    const mg = await getMemgraphService();
    const graphRepo = getGraphRepository(mg);

    const graph = await graphRepo.get(graphId);

    if (!graph) {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
      });
    }

    const errors = [];
    const warnings = [];

    // Check entry node exists
    if (!graph.entryNodeId) {
      errors.push('No entry node specified');
    } else if (!graph.nodes.find(n => n.id === graph.entryNodeId)) {
      errors.push(`Entry node ${graph.entryNodeId} not found in nodes`);
    }

    // Check all executors are registered
    const executorTypes = graph.nodes.map(n => n.executorType);
    const validation = pluginRegistry.validateGraphExecutors(executorTypes);

    if (!validation.valid) {
      errors.push(`Missing executors: ${validation.missingExecutors.join(', ')}`);
    }

    // Check edges reference valid nodes
    const nodeIds = new Set(graph.nodes.map(n => n.id));
    for (const edge of graph.edges) {
      if (!nodeIds.has(edge.sourceNodeId)) {
        errors.push(`Edge source node not found: ${edge.sourceNodeId}`);
      }
      if (!nodeIds.has(edge.targetNodeId)) {
        errors.push(`Edge target node not found: ${edge.targetNodeId}`);
      }
    }

    // Check for orphan nodes (no incoming or outgoing edges, except entry)
    const connectedNodes = new Set();
    for (const edge of graph.edges) {
      connectedNodes.add(edge.sourceNodeId);
      connectedNodes.add(edge.targetNodeId);
    }
    connectedNodes.add(graph.entryNodeId);

    for (const node of graph.nodes) {
      if (!connectedNodes.has(node.id)) {
        warnings.push(`Orphan node detected: ${node.name} (${node.id})`);
      }
    }

    res.json({
      success: true,
      valid: errors.length === 0,
      errors,
      warnings,
    });
  } catch (error) {
    console.error('[AOPEG] Error validating graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// EXECUTION ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/aopeg/execute/:graphId
 * Execute a graph with given input
 */
exports.executeGraph = async (req, res) => {
  try {
    const { graphId } = req.params;
    const { input, variables = {}, metadata = {}, async = false, timeout } = req.body;

    const { getOrchestrator, initializeAOPEG, isAOPEGInitialized } = await getAOPEG();
    const { getGraphRepository, getExecutionRepository } = await getRepositories();
    const mg = await getMemgraphService();

    // Ensure AOPEG is initialized
    if (!isAOPEGInitialized()) {
      await initializeAOPEG();
    }

    const graphRepo = getGraphRepository(mg);
    const execRepo = getExecutionRepository(mg);

    const graph = await graphRepo.get(graphId);

    if (!graph) {
      return res.status(404).json({
        success: false,
        error: 'Graph not found',
      });
    }

    if (graph.status !== 'ACTIVE') {
      return res.status(400).json({
        success: false,
        error: `Graph is not active (status: ${graph.status})`,
      });
    }

    // Get orchestrator with repositories
    const orchestrator = getOrchestrator();
    orchestrator.setGraphStore(graphRepo);
    orchestrator.setExecutionStore(execRepo);

    // Execute
    const execution = await orchestrator.execute(graph, input, {
      variables,
      metadata,
      async: async,
      timeout: timeout ? Number(timeout) : undefined,
    });

    // Record successful execution to PatternLibrary for feedback loop
    if (execution.status === 'COMPLETED') {
      try {
        const patternLibrary = await getPatternLibrary();
        if (patternLibrary) {
          const result = await patternLibrary.recordExecution(
            {
              executionId: execution.id,
              status: execution.status,
              dag: graph,
              metrics: {
                totalDurationMs: execution.totalDuration,
                nodesSucceeded: execution.pathTaken?.length || graph.nodes.length,
                nodesFailed: 0,
                nodesSkipped: 0,
                retriesTotal: 0
              },
              nodeResults: {}
            },
            {
              taskCategory: graph.domain || 'general',
              taskDescription: graph.description || graph.name,
              userId: metadata?.userId || 'system'
            }
          );
          console.log(`[AOPEG] Recorded pattern ${result.patternId} (new: ${result.isNewPattern}, rate: ${result.successRate?.toFixed(2) || 'N/A'})`);
        }
      } catch (err) {
        console.warn('[AOPEG] Failed to record pattern:', err.message);
      }
    }

    res.json({
      success: true,
      data: {
        executionId: execution.id,
        status: execution.status,
        output: execution.output,
        pathTaken: execution.pathTaken,
        duration: execution.totalDuration,
        qualityScore: execution.finalQualityScore,
        error: execution.error,
      },
      message: async ? 'Execution started in background' : 'Execution completed',
    });
  } catch (error) {
    console.error('[AOPEG] Error executing graph:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/executions
 * List executions with optional filtering
 */
exports.listExecutions = async (req, res) => {
  try {
    const { graphId, status, limit = 100, offset = 0 } = req.query;

    const { getExecutionRepository } = await getRepositories();
    const mg = await getMemgraphService();
    const execRepo = getExecutionRepository(mg);

    let executions;
    if (status) {
      executions = await execRepo.listByStatus(status, graphId, Number(limit), Number(offset));
    } else {
      executions = await execRepo.list(graphId, Number(limit), Number(offset));
    }

    res.json({
      success: true,
      data: executions,
      count: executions.length,
      limit: Number(limit),
      offset: Number(offset),
    });
  } catch (error) {
    console.error('[AOPEG] Error listing executions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/executions/:executionId
 * Get a specific execution with node execution details
 */
exports.getExecution = async (req, res) => {
  try {
    const { executionId } = req.params;

    const { getExecutionRepository } = await getRepositories();
    const mg = await getMemgraphService();
    const execRepo = getExecutionRepository(mg);

    const execution = await execRepo.get(executionId);

    if (!execution) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found',
      });
    }

    res.json({
      success: true,
      data: execution,
    });
  } catch (error) {
    console.error('[AOPEG] Error getting execution:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/aopeg/executions/:executionId/cancel
 * Cancel a running execution
 */
exports.cancelExecution = async (req, res) => {
  try {
    const { executionId } = req.params;

    const { getOrchestrator } = await getAOPEG();
    const orchestrator = getOrchestrator();

    const cancelled = await orchestrator.cancel(executionId);

    if (!cancelled) {
      return res.status(404).json({
        success: false,
        error: 'Execution not found or not running',
      });
    }

    res.json({
      success: true,
      message: 'Execution cancelled',
    });
  } catch (error) {
    console.error('[AOPEG] Error cancelling execution:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/executions/active
 * Get list of active executions
 */
exports.getActiveExecutions = async (req, res) => {
  try {
    const { getOrchestrator } = await getAOPEG();
    const orchestrator = getOrchestrator();

    const active = orchestrator.getActiveExecutions();

    res.json({
      success: true,
      data: active,
      count: active.length,
    });
  } catch (error) {
    console.error('[AOPEG] Error getting active executions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// SSE STREAMING
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/aopeg/stream/:executionId
 * SSE stream for live execution updates
 */
exports.streamExecution = async (req, res) => {
  const { executionId } = req.params;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');

  req.setTimeout(0);

  const sendEvent = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send connection event
  sendEvent('connected', { executionId });

  // Store connection
  if (!activeConnections.has(executionId)) {
    activeConnections.set(executionId, new Set());
  }
  activeConnections.get(executionId).add(res);

  // Handle disconnect
  req.on('close', () => {
    const connections = activeConnections.get(executionId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        activeConnections.delete(executionId);
      }
    }
  });

  // Get orchestrator and subscribe to events
  try {
    const { getOrchestrator } = await getAOPEG();
    const orchestrator = getOrchestrator();

    // Event handlers
    const onNodeStarted = (data) => {
      if (data.executionId === executionId) {
        sendEvent('node:started', data);
      }
    };

    const onNodeCompleted = (data) => {
      if (data.executionId === executionId) {
        sendEvent('node:completed', data);
      }
    };

    const onNodeFailed = (data) => {
      if (data.executionId === executionId) {
        sendEvent('node:failed', data);
      }
    };

    const onNodeRetry = (data) => {
      if (data.executionId === executionId) {
        sendEvent('node:retry', data);
      }
    };

    const onCompleted = (data) => {
      if (data.execution.id === executionId) {
        sendEvent('execution:completed', {
          executionId,
          status: data.execution.status,
          output: data.execution.output,
          duration: data.execution.totalDuration,
          qualityScore: data.execution.finalQualityScore,
        });
        cleanup();
      }
    };

    const onFailed = (data) => {
      if (data.executionId === executionId) {
        sendEvent('execution:failed', data);
        cleanup();
      }
    };

    const onCancelled = (data) => {
      if (data.executionId === executionId) {
        sendEvent('execution:cancelled', data);
        cleanup();
      }
    };

    // Subscribe to events
    orchestrator.on('node:started', onNodeStarted);
    orchestrator.on('node:completed', onNodeCompleted);
    orchestrator.on('node:failed', onNodeFailed);
    orchestrator.on('node:retry', onNodeRetry);
    orchestrator.on('execution:completed', onCompleted);
    orchestrator.on('execution:failed', onFailed);
    orchestrator.on('execution:cancelled', onCancelled);

    // Cleanup function
    const cleanup = () => {
      orchestrator.off('node:started', onNodeStarted);
      orchestrator.off('node:completed', onNodeCompleted);
      orchestrator.off('node:failed', onNodeFailed);
      orchestrator.off('node:retry', onNodeRetry);
      orchestrator.off('execution:completed', onCompleted);
      orchestrator.off('execution:failed', onFailed);
      orchestrator.off('execution:cancelled', onCancelled);
    };

    // Cleanup on disconnect
    req.on('close', cleanup);

  } catch (error) {
    sendEvent('error', { message: error.message });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// REGISTRY & STATS ENDPOINTS
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/aopeg/registry/executors
 * List all registered executors
 */
exports.listExecutors = async (req, res) => {
  try {
    const { domain } = req.query;

    const { pluginRegistry, initializeAOPEG, isAOPEGInitialized } = await getAOPEG();

    // Ensure AOPEG is initialized before fetching executors
    if (!isAOPEGInitialized()) {
      await initializeAOPEG();
    }

    let executors;
    if (domain) {
      executors = pluginRegistry.getExecutorsByDomain(domain);
    } else {
      executors = pluginRegistry.getAllExecutors();
    }

    // Map to displayable format
    const data = executors.map(exec => ({
      type: exec.type,
      displayName: exec.displayName,
      description: exec.description,
      domain: exec.domain,
      parameterSchema: exec.parameterSchema,
    }));

    res.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error) {
    console.error('[AOPEG] Error listing executors:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/registry/conditions
 * List all registered conditions
 */
exports.listConditions = async (req, res) => {
  try {
    const { pluginRegistry, initializeAOPEG, isAOPEGInitialized } = await getAOPEG();

    // Ensure AOPEG is initialized
    if (!isAOPEGInitialized()) {
      await initializeAOPEG();
    }

    const conditions = Array.from(pluginRegistry.getConditionTypes());

    res.json({
      success: true,
      data: conditions,
      count: conditions.length,
    });
  } catch (error) {
    console.error('[AOPEG] Error listing conditions:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/registry/transformers
 * List all registered transformers
 */
exports.listTransformers = async (req, res) => {
  try {
    const { pluginRegistry, initializeAOPEG, isAOPEGInitialized } = await getAOPEG();

    // Ensure AOPEG is initialized
    if (!isAOPEGInitialized()) {
      await initializeAOPEG();
    }

    const transformers = Array.from(pluginRegistry.getTransformerTypes());

    res.json({
      success: true,
      data: transformers,
      count: transformers.length,
    });
  } catch (error) {
    console.error('[AOPEG] Error listing transformers:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/stats
 * Get AOPEG statistics
 */
exports.getStats = async (req, res) => {
  try {
    const { pluginRegistry, initializeAOPEG, isAOPEGInitialized } = await getAOPEG();
    const { getGraphRepository, getExecutionRepository } = await getRepositories();
    const mg = await getMemgraphService();

    // Ensure AOPEG is initialized
    if (!isAOPEGInitialized()) {
      await initializeAOPEG();
    }

    const graphRepo = getGraphRepository(mg);
    const execRepo = getExecutionRepository(mg);

    const [graphStats, registryStats, domainStats, executorUsage] = await Promise.all([
      graphRepo.getStats(),
      Promise.resolve(pluginRegistry.getStats()),
      graphRepo.getDomainStats(),
      graphRepo.getExecutorUsage(10),
    ]);

    res.json({
      success: true,
      data: {
        graphs: graphStats,
        registry: registryStats,
        domains: domainStats,
        topExecutors: executorUsage,
      },
    });
  } catch (error) {
    console.error('[AOPEG] Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/examples
 * Get example graphs
 */
exports.getExamples = async (req, res) => {
  try {
    const { getAllExampleGraphs } = await getAOPEG();

    const examples = getAllExampleGraphs();

    res.json({
      success: true,
      data: examples,
      count: examples.length,
    });
  } catch (error) {
    console.error('[AOPEG] Error getting examples:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/aopeg/examples/:exampleId/import
 * Import an example graph
 */
exports.importExample = async (req, res) => {
  try {
    const { exampleId } = req.params;
    const { name } = req.body;

    const { getExampleGraph } = await getAOPEG();
    const { getGraphRepository } = await getRepositories();
    const mg = await getMemgraphService();

    const example = getExampleGraph(exampleId);

    if (!example) {
      return res.status(404).json({
        success: false,
        error: 'Example not found',
      });
    }

    // Clone with new ID
    const graph = {
      ...example,
      id: uuidv4(),
      name: name || `${example.name} (Copy)`,
      status: 'DRAFT',
      nodes: example.nodes.map(n => ({ ...n, id: uuidv4() })),
      edges: example.edges.map(e => ({ ...e, id: uuidv4() })),
    };

    // Update entry node ID
    if (example.entryNodeId && example.nodes.length > 0) {
      const entryIndex = example.nodes.findIndex(n => n.id === example.entryNodeId);
      if (entryIndex >= 0) {
        graph.entryNodeId = graph.nodes[entryIndex].id;
      }
    }

    // Update edge references
    const oldToNewId = new Map();
    example.nodes.forEach((oldNode, i) => {
      oldToNewId.set(oldNode.id, graph.nodes[i].id);
    });

    for (const edge of graph.edges) {
      edge.sourceNodeId = oldToNewId.get(example.edges.find(e => e.id === edge.id)?.sourceNodeId) || edge.sourceNodeId;
      edge.targetNodeId = oldToNewId.get(example.edges.find(e => e.id === edge.id)?.targetNodeId) || edge.targetNodeId;
    }

    const graphRepo = getGraphRepository(mg);
    await graphRepo.save(graph);

    res.status(201).json({
      success: true,
      data: graph,
      message: 'Example imported successfully',
    });
  } catch (error) {
    console.error('[AOPEG] Error importing example:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

const { getCachedHealthCheck } = require('../services/redis.service');

// ────────────────────────────────────────────────────────────────────────────
// PATTERN LIBRARY ENDPOINTS (Feedback Loop)
// ────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/aopeg/patterns/stats
 * Get PatternLibrary statistics
 */
exports.getPatternStats = async (req, res) => {
  try {
    const patternLibrary = await getPatternLibrary();
    if (!patternLibrary) {
      return res.status(503).json({
        success: false,
        error: 'PatternLibrary not available',
      });
    }

    const stats = patternLibrary.getStats();

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[AOPEG] Error getting pattern stats:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/aopeg/patterns/:category
 * Get best pattern for a category
 */
exports.getPattern = async (req, res) => {
  try {
    const { category } = req.params;
    const patternLibrary = await getPatternLibrary();

    if (!patternLibrary) {
      return res.status(503).json({
        success: false,
        error: 'PatternLibrary not available',
      });
    }

    const pattern = await patternLibrary.getPattern(category);

    res.json({
      success: true,
      data: pattern,
      found: !!pattern,
    });
  } catch (error) {
    console.error('[AOPEG] Error getting pattern:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * POST /api/v1/aopeg/patterns/warmup
 * Warmup PatternLibrary cache
 */
exports.warmupPatterns = async (req, res) => {
  try {
    const { categories } = req.body;
    const patternLibrary = await getPatternLibrary();

    if (!patternLibrary) {
      return res.status(503).json({
        success: false,
        error: 'PatternLibrary not available',
      });
    }

    await patternLibrary.warmup(categories || ['ingestion', 'rag', 'general']);

    const stats = patternLibrary.getStats();

    res.json({
      success: true,
      message: 'Warmup completed',
      data: stats,
    });
  } catch (error) {
    console.error('[AOPEG] Error warming up patterns:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

/**
 * Compute health status for AOPEG
 * @returns {Promise<Object>} Health status
 */
async function computeAOPEGHealth() {
  const { isAOPEGInitialized, pluginRegistry } = await getAOPEG();
  const stats = pluginRegistry.getStats();

  return {
    service: 'aopeg',
    initialized: isAOPEGInitialized(),
    stats,
    timestamp: new Date().toISOString(),
  };
}

/**
 * GET /api/v1/aopeg/health
 * Health check (cached for 1 minute)
 */
exports.healthCheck = async (req, res) => {
  try {
    const { data, cached } = await getCachedHealthCheck('aopeg', computeAOPEGHealth);

    res.json({
      success: true,
      ...data,
      cached,
      cacheInfo: cached ? 'Result from Redis cache (TTL: 60s)' : 'Fresh result',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      service: 'aopeg',
      error: error.message,
      cached: false,
    });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

function incrementVersion(version) {
  const parts = version.split('.');
  const patch = parseInt(parts[2] || '0', 10) + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}
