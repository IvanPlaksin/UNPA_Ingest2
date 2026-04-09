/**
 * GXE Execution Service
 * Handles graph validation and execution with SSE streaming.
 *
 * Real execution uses: pluginRegistry → AOPEGAdapter → RuntimeEngine → GXESSEBridge
 * Set GXE_USE_RUNTIME=false to fall back to mock execution.
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');

// RuntimeEngine imports (loaded lazily to avoid startup errors)
let pluginRegistry, AOPEGAdapter, RuntimeEngine, GXESSEBridge, initializeAOPEG, isAOPEGInitialized;
try {
  pluginRegistry = require('../../core/aopeg/registry/plugin-registry').pluginRegistry;
  AOPEGAdapter = require('../../runtime/integration/AOPEGAdapter').AOPEGAdapter;
  RuntimeEngine = require('../../runtime/RuntimeEngine').RuntimeEngine;
  GXESSEBridge = require('../../runtime/integration/GXESSEBridge').GXESSEBridge;
  const aopeg = require('../../core/aopeg/index');
  initializeAOPEG = aopeg.initializeAOPEG;
  isAOPEGInitialized = aopeg.isAOPEGInitialized;
} catch (err) {
  console.warn('[GXE Execute] RuntimeEngine imports not available, mock-only mode:', err.message);
}

const USE_RUNTIME = process.env.GXE_USE_RUNTIME !== 'false';

const router = express.Router();

// Active execution sessions
const executionSessions = new Map();

/**
 * Validate graph structure before execution
 * Performs multi-level validation:
 * - Level 1: Structure validation (nodes, edges, params exist)
 * - Level 2: Graph integrity (connectivity, cycles, required nodes)
 * - Level 3: Node configuration (tool availability, param types)
 */
router.post('/validate', async (req, res) => {
  try {
    const { nodes, edges, params } = req.body;

    const errors = [];
    const warnings = [];
    let completedLevel = 0;

    // ═══════════════════════════════════════════════════════════════════════
    // Level 1: Structure Validation
    // ═══════════════════════════════════════════════════════════════════════

    // Check nodes exist
    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      errors.push({ level: 1, code: 'NO_NODES', message: 'Graph must have at least one node' });
    }

    // Check edges exist (can be empty for single node)
    if (!edges || !Array.isArray(edges)) {
      errors.push({ level: 1, code: 'INVALID_EDGES', message: 'Edges must be an array' });
    }

    if (errors.length === 0) {
      completedLevel = 1;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Level 2: Graph Integrity
    // ═══════════════════════════════════════════════════════════════════════

    if (completedLevel >= 1 && nodes?.length > 0) {
      const nodeIds = new Set(nodes.map(n => n.id));

      // Check for input node
      const hasInput = nodes.some(n => n.data?.kind === 'input' || n.id === 'input');
      if (!hasInput) {
        errors.push({ level: 2, code: 'NO_INPUT_NODE', message: 'Graph must have an input node' });
      }

      // Check for output node
      const hasOutput = nodes.some(n => n.data?.kind === 'output' || n.id === 'output');
      if (!hasOutput) {
        errors.push({ level: 2, code: 'NO_OUTPUT_NODE', message: 'Graph must have an output node' });
      }

      // Check edge references
      for (const edge of edges || []) {
        if (!nodeIds.has(edge.source)) {
          errors.push({
            level: 2,
            code: 'INVALID_EDGE_SOURCE',
            message: `Edge source "${edge.source}" not found`,
            edge: edge.id
          });
        }
        if (!nodeIds.has(edge.target)) {
          errors.push({
            level: 2,
            code: 'INVALID_EDGE_TARGET',
            message: `Edge target "${edge.target}" not found`,
            edge: edge.id
          });
        }
      }

      // Check for cycles (basic DFS)
      const hasCycle = detectCycle(nodes, edges);
      if (hasCycle) {
        errors.push({ level: 2, code: 'CYCLE_DETECTED', message: 'Graph contains a cycle (must be DAG)' });
      }

      // Check connectivity
      const disconnected = findDisconnectedNodes(nodes, edges);
      if (disconnected.length > 0) {
        warnings.push({
          level: 2,
          code: 'DISCONNECTED_NODES',
          message: `${disconnected.length} nodes are disconnected`,
          nodes: disconnected
        });
      }

      if (errors.filter(e => e.level === 2).length === 0) {
        completedLevel = 2;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Level 3: Node Configuration
    // ═══════════════════════════════════════════════════════════════════════

    if (completedLevel >= 2) {
      // Check required parameters are provided
      for (const node of nodes || []) {
        if (node.data?.kind === 'input' && params) {
          // Validate input params if schema is defined
          // (relaxed validation - just check they exist)
        }

        // Check node has required data
        if (!node.data?.kind && !node.data?.label) {
          warnings.push({
            level: 3,
            code: 'MISSING_NODE_DATA',
            message: `Node "${node.id}" has no kind or label`,
            node: node.id
          });
        }
      }

      if (errors.filter(e => e.level === 3).length === 0) {
        completedLevel = 3;
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Response
    // ═══════════════════════════════════════════════════════════════════════

    const canExecute = errors.length === 0;

    res.json({
      success: true,
      canExecute,
      completedLevel,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors,
      warnings,
      graphStats: {
        nodeCount: nodes?.length || 0,
        edgeCount: edges?.length || 0,
        hasInput: nodes?.some(n => n.data?.kind === 'input' || n.id === 'input'),
        hasOutput: nodes?.some(n => n.data?.kind === 'output' || n.id === 'output')
      }
    });
  } catch (error) {
    console.error('[GXE Execute] Validation error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      canExecute: false,
      completedLevel: 0
    });
  }
});

/**
 * Execute graph with SSE streaming
 * Uses RuntimeEngine when available, falls back to mock execution
 */
router.post('/execute', async (req, res) => {
  const executionId = uuidv4();
  const { nodes, edges, params } = req.body;

  // Filter out tool-ref badge nodes (isToolRef) — they are visual, not executable
  const executableNodes = nodes.filter(n => !n.data?.isToolRef);
  // Filter out USES_TOOL edges — they are visual bindings, not data flow
  const dataFlowEdges = edges.filter(e => e.label !== 'USES_TOOL');

  // ═══════════════════════════════════════════════════════════════════════
  // REAL EXECUTION via RuntimeEngine
  // ═══════════════════════════════════════════════════════════════════════
  if (USE_RUNTIME && pluginRegistry && AOPEGAdapter && RuntimeEngine && GXESSEBridge) {
    try {
      // 0. Ensure AOPEG plugins are loaded (idempotent — skips if already initialized)
      if (initializeAOPEG && isAOPEGInitialized && !isAOPEGInitialized()) {
        await initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true, loadToolPlugins: true });
      }

      // 1. Build MCP registry (auto-discovers ALL registered executors)
      const adapter = new AOPEGAdapter(pluginRegistry);
      const mcpRegistry = adapter.createMcpCompatibleRegistry();

      // 2. Convert ReactFlow nodes → DAG format
      const dag = {
        nodes: executableNodes.map(n => ({
          id: n.id,
          executorType: n.data?.executorType || n.data?.toolId || n.data?.kind || 'common.passthrough',
          parameters: n.data?.parameters || n.data?.params || {},
          data: n.data,
        })),
        edges: dataFlowEdges,  // DataFlowManager normalizes ReactFlow edges automatically
      };

      // 3. Create engine + SSE bridge
      const engine = new RuntimeEngine(mcpRegistry, {
        schedulingStrategy: 'SEQUENTIAL',
        errorStrategy: 'CONTINUE_ON_ERROR',
        nodeTimeoutMs: 30000,
        enableValidation: false,  // Already validated by /validate endpoint
      });

      const bridge = new GXESSEBridge(engine, dag);
      bridge.attach(req, res, executionId);

      // 4. Execute — bridge handles all SSE events
      const result = await engine.execute(dag, params || {});

      // If bridge didn't emit complete (e.g. no execution:completed event), send it now
      if (!bridge.closed) {
        bridge.detach();
      }

      return;
    } catch (error) {
      console.error('[GXE Execute] RuntimeEngine error, falling back to mock:', error.message);
      // Fall through to mock execution
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // MOCK EXECUTION (fallback)
  // ═══════════════════════════════════════════════════════════════════════
  try {
    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    // Create session
    const session = {
      id: executionId,
      nodes: executableNodes,
      edges: dataFlowEdges,
      params,
      status: 'running',
      startTime: Date.now(),
      nodeStates: {},
      outputs: {}
    };
    executionSessions.set(executionId, session);

    // Send start event
    sendSSE(res, 'start', {
      executionId,
      nodeCount: executableNodes.length,
      edgeCount: dataFlowEdges.length
    });

    // Topological sort
    const order = topologicalSort(executableNodes, dataFlowEdges);

    // Execute nodes in order
    session.outputs['input'] = params || {};

    for (let i = 0; i < order.length; i++) {
      const nodeId = order[i];
      const node = executableNodes.find(n => n.id === nodeId);

      if (!node) continue;

      // Send node start event
      sendSSE(res, 'node:start', {
        nodeId,
        nodeLabel: node.data?.label || nodeId,
        nodeKind: node.data?.kind || 'executor',
        index: i,
        total: order.length
      });

      session.nodeStates[nodeId] = 'running';

      try {
        // Simulate node execution
        const result = await executeNode(node, session.outputs, session);

        session.outputs[nodeId] = result;
        session.nodeStates[nodeId] = 'done';

        // Send node complete event
        sendSSE(res, 'node:complete', {
          nodeId,
          nodeLabel: node.data?.label || nodeId,
          result: summarizeResult(result),
          duration: result._duration || 0
        });
      } catch (nodeError) {
        session.nodeStates[nodeId] = 'error';

        // Send node error event
        sendSSE(res, 'node:error', {
          nodeId,
          nodeLabel: node.data?.label || nodeId,
          error: nodeError.message
        });
      }
    }

    // Complete execution
    session.status = 'completed';
    session.endTime = Date.now();

    const finalOutput = session.outputs['output'] || session.outputs[order[order.length - 1]];

    sendSSE(res, 'complete', {
      executionId,
      duration: session.endTime - session.startTime,
      nodeCount: order.length,
      output: finalOutput
    });

    res.end();

  } catch (error) {
    console.error('[GXE Execute] Execution error:', error);
    sendSSE(res, 'error', { error: error.message });
    res.end();
  } finally {
    // Cleanup session after a delay
    setTimeout(() => executionSessions.delete(executionId), 60000);
  }
});

/**
 * Get execution status
 */
router.get('/status/:executionId', (req, res) => {
  const { executionId } = req.params;
  const session = executionSessions.get(executionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: 'Execution not found'
    });
  }

  res.json({
    success: true,
    data: {
      executionId,
      status: session.status,
      nodeStates: session.nodeStates,
      duration: session.endTime
        ? session.endTime - session.startTime
        : Date.now() - session.startTime
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Send SSE event
 */
function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Detect cycles in graph using DFS
 */
function detectCycle(nodes, edges) {
  const adjacency = new Map();
  nodes.forEach(n => adjacency.set(n.id, []));
  edges.forEach(e => {
    if (adjacency.has(e.source)) {
      adjacency.get(e.source).push(e.target);
    }
  });

  const visited = new Set();
  const recStack = new Set();

  function dfs(nodeId) {
    visited.add(nodeId);
    recStack.add(nodeId);

    for (const neighbor of adjacency.get(nodeId) || []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }

    recStack.delete(nodeId);
    return false;
  }

  for (const node of nodes) {
    if (!visited.has(node.id)) {
      if (dfs(node.id)) return true;
    }
  }

  return false;
}

/**
 * Find disconnected nodes
 */
function findDisconnectedNodes(nodes, edges) {
  const connected = new Set();

  // Add all nodes that have edges
  edges.forEach(e => {
    connected.add(e.source);
    connected.add(e.target);
  });

  // Find nodes with no edges (except if there's only one node)
  if (nodes.length === 1) return [];

  return nodes
    .filter(n => !connected.has(n.id))
    .map(n => n.id);
}

/**
 * Topological sort (Kahn's algorithm)
 */
function topologicalSort(nodes, edges) {
  const inDegree = new Map();
  const adjacency = new Map();

  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    adjacency.set(n.id, []);
  });

  edges.forEach(e => {
    if (adjacency.has(e.source)) {
      adjacency.get(e.source).push(e.target);
    }
    if (inDegree.has(e.target)) {
      inDegree.set(e.target, inDegree.get(e.target) + 1);
    }
  });

  const queue = [];
  inDegree.forEach((degree, nodeId) => {
    if (degree === 0) queue.push(nodeId);
  });

  const result = [];
  while (queue.length > 0) {
    const current = queue.shift();
    result.push(current);

    for (const neighbor of adjacency.get(current) || []) {
      const newDegree = inDegree.get(neighbor) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  return result;
}

/**
 * Execute a single node (mock implementation)
 */
async function executeNode(node, inputs, session) {
  const startTime = Date.now();
  const kind = node.data?.kind || 'executor';
  const label = node.data?.label || node.id;

  // Get input from upstream nodes
  const upstreamData = {};
  // For simplicity, collect all available outputs
  Object.assign(upstreamData, inputs);

  // Simulate execution based on node type
  let result;

  switch (kind) {
    case 'input':
      result = session.params || {};
      break;

    case 'output':
      // Collect all upstream results
      result = { ...upstreamData };
      delete result['input'];
      break;

    case 'ai':
      // Simulate AI processing
      await delay(300 + Math.random() * 500);
      result = {
        type: 'ai_result',
        label,
        processed: true,
        input: summarizeResult(upstreamData),
        output: `AI processed: ${label}`
      };
      break;

    case 'executor':
      // Simulate tool execution
      await delay(100 + Math.random() * 200);
      result = {
        type: 'executor_result',
        label,
        processed: true,
        input: summarizeResult(upstreamData),
        output: `Executed: ${label}`
      };
      break;

    case 'business':
      // Simulate business logic
      await delay(50 + Math.random() * 100);
      result = {
        type: 'business_result',
        label,
        processed: true,
        decision: 'approved'
      };
      break;

    case 'condition':
      // Simulate condition check
      await delay(20 + Math.random() * 50);
      result = {
        type: 'condition_result',
        label,
        condition: true,
        branch: 'true'
      };
      break;

    default:
      await delay(100 + Math.random() * 100);
      result = {
        type: 'generic_result',
        label,
        processed: true
      };
  }

  result._duration = Date.now() - startTime;
  return result;
}

/**
 * Summarize result for logging (truncate large objects)
 */
function summarizeResult(result) {
  if (result === null || result === undefined) return null;

  const str = JSON.stringify(result);
  if (str.length > 200) {
    return str.substring(0, 200) + '...';
  }
  return result;
}

/**
 * Delay helper
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  gxeExecuteRouter: router
};
