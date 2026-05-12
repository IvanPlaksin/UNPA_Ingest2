/**
 * KB Runtime Bridge
 *
 * Bridges KB-stored graphs with FlowDesk RuntimeEngine execution.
 * Provides high-level functions for chat, classification, SLA, routing
 * using generated GXE graphs from Graph Catalog.
 *
 * This module can be used alongside or as replacement for
 * the existing runtime-chat.js file-based approach.
 *
 * @module services/flowdesk/kb-runtime-bridge
 */

'use strict';

const graphLoader = require('./graph-loader-kb.service.js');

const LOG_PREFIX = '[KBRuntimeBridge]';

// Lazy RuntimeEngine
let _runtime = null;
function getRuntime() {
  if (!_runtime) {
    const { RuntimeEngine } = require('../../../runtime/RuntimeEngine');
    const { createMcpCompatibleRegistry } = require('../../../runtime/integration/AOPEGAdapter');
    _runtime = new RuntimeEngine(createMcpCompatibleRegistry());
  }
  return _runtime;
}

// ═══════════════════════════════════════════════════════════════
// HIGH-LEVEL EXECUTION
// ═══════════════════════════════════════════════════════════════

/**
 * Execute a named graph with input
 * @param {string} graphName - e.g. 'flowdesk.classify.pipeline'
 * @param {Object} input - Input data
 * @param {Object} [options] - Execution options
 * @returns {Promise<Object>} Execution result
 */
async function executeNamedGraph(graphName, input, options = {}) {
  const loadResult = await graphLoader.loadGraph(graphName, { useCache: true, convertToDag: true });

  if (!loadResult.success) {
    throw new Error(`Graph not found: ${graphName} (${loadResult.error})`);
  }

  // Resolve subgraphs if any
  let dag = loadResult.dag;
  const hasSubgraphs = dag.nodes.some(n => n.type === 'subgraph' && n.config?.graphId);
  if (hasSubgraphs) {
    dag = await graphLoader.resolveSubgraphs(dag);
  }

  console.log(`${LOG_PREFIX} Executing ${graphName} (source=${loadResult.source}, ${dag.nodes.length} nodes)`);

  const runtime = getRuntime();
  const result = await runtime.execute(
    { nodes: dag.nodes, edges: dag.edges },
    input,
    {
      executionId: options.executionId || `${graphName}-${Date.now()}`,
      nodeTimeoutMs: options.nodeTimeoutMs || 30000,
      ...options
    }
  );

  return result;
}

/**
 * Classify a request using the generated classification pipeline
 * @param {string} message - User message
 * @param {Object} [context] - Additional context
 * @returns {Promise<{serviceId, confidence, method}>}
 */
async function classifyRequest(message, context = {}) {
  try {
    const result = await executeNamedGraph('flowdesk.classify.pipeline', { message, context });
    return result?.classification || { serviceId: null, confidence: 0, method: 'FAILED' };
  } catch (err) {
    console.error(`${LOG_PREFIX} Classification failed: ${err.message}`);
    return { serviceId: null, confidence: 0, method: 'ERROR', error: err.message };
  }
}

/**
 * Get SLA for a priority level
 * @param {string} priority - CRITICAL/HIGH/MEDIUM/LOW
 * @returns {Promise<{responseTime, resolutionTime}>}
 */
async function getSLA(priority) {
  try {
    const result = await executeNamedGraph('flowdesk.sla.decision', { 'ticket.priority': priority });
    return result?.sla || { responseTime: '24h', resolutionTime: '72h' };
  } catch (err) {
    console.warn(`${LOG_PREFIX} SLA lookup failed, using defaults: ${err.message}`);
    return { responseTime: '24h', resolutionTime: '72h' };
  }
}

/**
 * Route request to queue
 * @param {string} domainPrefix - e.g. 'IT-HW'
 * @returns {Promise<{assignedQueue}>}
 */
async function routeToQueue(domainPrefix) {
  try {
    const result = await executeNamedGraph('flowdesk.route.queue', { 'request.domainPrefix': domainPrefix });
    return result?.routing || { assignedQueue: 'general-support' };
  } catch (err) {
    console.warn(`${LOG_PREFIX} Routing failed, using default: ${err.message}`);
    return { assignedQueue: 'general-support', routingMethod: 'DEFAULT' };
  }
}

/**
 * Check SLA escalation
 * @param {number} slaPercentUsed - 0-100
 * @param {string} priority - ticket priority
 * @returns {Promise<{escalationAction}>}
 */
async function checkSLAEscalation(slaPercentUsed, priority) {
  try {
    const result = await executeNamedGraph('flowdesk.sla.escalation', {
      'ticket.slaPercentUsed': slaPercentUsed,
      'ticket.priority': priority
    });
    return result || { escalationAction: 'NONE' };
  } catch (err) {
    return { escalationAction: 'NONE', error: err.message };
  }
}

/**
 * Run intake dialog graph for a chat session
 * @param {string} graphName - Dialog graph name or null for default
 * @param {Object} input - { userMessage, userId, sessionId, ...state }
 * @returns {Promise<Object>} Dialog result
 */
async function runDialogGraph(graphName, input) {
  const name = graphName || 'flowdesk.intake.enhanced';
  return executeNamedGraph(name, input);
}

/**
 * Get graph for a specific service
 * Tries service-specific, then generic enhanced, then file fallback
 */
async function getGraphForService(serviceId, dialogType = 'intake') {
  const serviceName = `flowdesk.${dialogType}.${serviceId.toLowerCase().replace(/-/g, '_')}`;
  let result = await graphLoader.loadGraph(serviceName, { useCache: true });
  if (result.success) return result;

  const genericName = `flowdesk.${dialogType}.enhanced`;
  result = await graphLoader.loadGraph(genericName, { useCache: true });
  if (result.success) return result;

  // Last resort — original file
  return graphLoader.loadGraphFromFile(`flowdesk.${dialogType}.generic`);
}

// ═══════════════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize bridge — preload graphs + start hot-reload
 */
async function initialize() {
  try {
    // Preload common graphs
    await graphLoader.preloadGraphs();

    // Start hot-reload
    const hotReload = require('./graph-hot-reload.service.js');
    await hotReload.init();

    console.log(`${LOG_PREFIX} Initialized`);
  } catch (err) {
    console.warn(`${LOG_PREFIX} Init partial: ${err.message}`);
  }
}

module.exports = {
  executeNamedGraph,
  classifyRequest,
  getSLA,
  routeToQueue,
  checkSLAEscalation,
  runDialogGraph,
  getGraphForService,
  initialize,
  // Re-export loader for direct access
  graphLoader
};
