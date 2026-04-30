'use strict';

/**
 * CaMeL-Protected Chat Service
 *
 * Wraps the FlowDesk RuntimeEngine chat with CaMeL security pattern:
 * 1. QUARANTINE — first user message parsed by QuarantinedNLU (no tool access)
 * 2. CONTROL   — RuntimeController validates intent, selects graph, sanitizes entities
 * 3. PRIVILEGED — GXE RuntimeEngine executes the appropriate dialog graph
 *
 * Graphs are loaded from the Memgraph knowledge-base catalog (all namespaces).
 * Static JSON fallback used only when catalog is unavailable.
 */

const path = require('path');
const { QuarantinedNLUService } = require('./quarantined-nlu.service');
const { RuntimeController } = require('./runtime-controller.service');

// Static JSON fallback — used when catalog lookup fails
const LAPTOP_GRAPH_FALLBACK = require(path.join(__dirname, '../../../..', 'Artefacts/fd-portal/laptop-provisioning-graph.json'));

// ── Session store ─────────────────────────────────────────────────────────
// sessionId → { phase, state, history, intentObject, graphKey }
const sessions = new Map();

let _nlu = null;
let _controller = null;
let _mcpRegistry = null;
let _initPromise = null;

function nlu() { if (!_nlu) _nlu = new QuarantinedNLUService(); return _nlu; }
function controller() { if (!_controller) _controller = new RuntimeController(); return _controller; }

async function ensureRuntime() {
  if (_mcpRegistry) return _mcpRegistry;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const aopegModule = require('../../core/aopeg/index');
    if (!aopegModule.isAOPEGInitialized()) {
      await aopegModule.initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
    }
    const { AOPEGAdapter } = require('../../runtime/integration');
    const adapter = new AOPEGAdapter(aopegModule.pluginRegistry);
    _mcpRegistry = adapter.createMcpCompatibleRegistry();
    return _mcpRegistry;
  })();
  return _initPromise;
}

/**
 * Load graph from Memgraph catalog (any namespace).
 * Falls back to static JSON if catalog lookup fails.
 * Returns nodes in RuntimeEngine-compatible format.
 */
async function loadGraph(graphKey) {
  try {
    const mg = require('../../services/memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (c:CatalogEntry {graphKey: $key})-[:DEFINES]->(g:GraphDefinition)
       RETURN c.entryId AS entryId, c.name AS name, c.namespace AS namespace,
              g.nodes AS nodes, g.edges AS edges, g.graphType AS graphType
       LIMIT 1`,
      { key: graphKey }
    );
    if (rows.length > 0) {
      const nodes = typeof rows[0].nodes === 'string' ? JSON.parse(rows[0].nodes) : rows[0].nodes;
      const edges = typeof rows[0].edges === 'string' ? JSON.parse(rows[0].edges) : rows[0].edges;
      console.log(`[CaMeL] Graph loaded from catalog: ${graphKey} (${nodes.length} nodes, ns=${rows[0].namespace}, entryId=${rows[0].entryId})`);
      return { nodes, edges };
    }
    console.warn(`[CaMeL] Graph not found in catalog: ${graphKey} — falling back to static JSON`);
  } catch (err) {
    console.warn(`[CaMeL] Catalog lookup failed for ${graphKey}: ${err.message} — falling back to static JSON`);
  }

  // Static JSON fallback — only for laptop-provisioning (legacy)
  if (graphKey === 'laptop-provisioning') {
    return {
      nodes: LAPTOP_GRAPH_FALLBACK.nodes.map(n => ({
        ...n,
        data: { tool: n.tool, executorId: n.tool, label: n.label, kind: n.kind },
        parameters: n.parameters || {},
      })),
      edges: LAPTOP_GRAPH_FALLBACK.edges,
    };
  }
  throw new Error(`Graph not found: ${graphKey}`);
}

/**
 * Process a single chat turn through the CaMeL-protected pipeline.
 *
 * @param {string} sessionId
 * @param {string} userId
 * @param {string} rawMessage — raw user input (UNTRUSTED)
 * @returns {Promise<ChatResponse>}
 */
async function processMessage(sessionId, userId, rawMessage) {
  const registry = await ensureRuntime();
  const { RuntimeEngine } = require('../../runtime');

  let session = sessions.get(sessionId);
  const isNewSession = !session;

  // ── Phase 1: QUARANTINE (new session only) ─────────────────────────────
  if (isNewSession) {
    const history = [];
    const intentObject = await nlu().parseIntent(rawMessage, history);
    const routing = await controller().process(intentObject, { sessionId, userId });

    if (routing.action === 'clarify' || routing.action === 'unsupported') {
      return {
        phase: 'clarify',
        response: routing.message,
        choices: null,
        isComplete: false,
        sessionId,
      };
    }

    // ── Phase 2: CONTROL — create validated session ──────────────────────
    session = {
      phase: 'active',
      graphKey: routing.graphKey,
      intentObject,
      state: {
        userId: routing.parameters.userId,
        sessionId: routing.parameters.sessionId,
        intent: routing.parameters.intent,
        for_self: routing.parameters.for_self,
        use_case: routing.parameters.use_case,
        budget: routing.parameters.budget,
        item_type: routing.parameters.item_type,
        urgency: routing.parameters.urgency,
        serviceCode: routing.parameters.serviceCode,
        domain: routing.parameters.domain,
      },
      history: [],
    };
    sessions.set(sessionId, session);
    console.log(`[CaMeL] Session created: ${sessionId} | intent=${intentObject.intent} | graph=${routing.graphKey}`);
  }

  // ── Phase 3: PRIVILEGED — execute graph with accumulated state ─────────
  console.log(`[PRIVILEGED] Received params: ${Object.keys(session.state).filter(k => k !== 'userId' && k !== 'sessionId').join(', ')} (rawMessage NOT passed to executor)`);
  session.state.userInput = rawMessage;
  session.history.push({ role: 'user', content: rawMessage, ts: new Date().toISOString() });

  const dag = await loadGraph(session.graphKey);

  // Inject accumulated state into every executor node
  for (const node of dag.nodes) {
    if (!node.parameters) node.parameters = {};
    node.parameters = { ...session.state, ...node.parameters };
  }

  const engine = new RuntimeEngine(registry, {
    graphTimeoutMs: 30000,
    nodeTimeoutMs: 15000,
    enableValidation: false,
  });

  const executionId = `camel-${sessionId}-${Date.now()}`;
  const result = await engine.execute(dag, session.state, { executionId });

  // Accumulate outputs from completed nodes into session state
  for (const [, nr] of Object.entries(result.nodeResults || {})) {
    if (nr.status === 'SUCCEEDED' && nr.output) {
      const out = nr.output;
      if (out.accumulated_state) Object.assign(session.state, out.accumulated_state);
      if (out.recommendation) session.state.recommendation = out.recommendation;
      if (out.requirements) session.state.requirements = out.requirements;
      if (out.requestId) session.state.requestId = out.requestId;
      // workflow.set_variable: capture named variable into session state (e.g. final_message)
      if (out.name && out.value !== undefined) session.state[out.name] = out.value;
    }
  }
  // Accumulate dialog state from waiting nodes (accumulated_state persists Q&A progress)
  for (const [, waitCtx] of Object.entries(result.waitingNodes || {})) {
    if (waitCtx && waitCtx.accumulated_state) {
      Object.assign(session.state, waitCtx.accumulated_state);
    }
  }

  // Clear per-turn fields
  delete session.state.userInput;

  // Build response
  const response = buildResponse(session, result);
  if (response.isComplete) {
    sessions.delete(sessionId);
  }
  return response;
}

function buildResponse(session, result) {
  const nodeResults = result?.nodeResults || {};
  const waitingNodes = result?.waitingNodes || {};

  // Find first waiting node
  const waitingNodeIds = Object.keys(waitingNodes);
  if (waitingNodeIds.length > 0) {
    const firstWaiting = waitingNodes[waitingNodeIds[0]];
    return {
      phase: 'active',
      response: firstWaiting.prompt || firstWaiting.expected_inputs?.[0] || 'Please respond:',
      choices: firstWaiting.choices || null,
      resume_token: firstWaiting.resume_token,
      accumulated_state: firstWaiting.accumulated_state || null,
      isComplete: false,
      sessionId: session.state.sessionId,
      engineStatus: result.status,
    };
  }

  // No waiting → find last successful output
  const outputs = Object.values(nodeResults)
    .filter(nr => nr.status === 'SUCCEEDED' && nr.output);

  const lastOutput = outputs[outputs.length - 1];
  // Check output fields, then session.state.final_message (set by workflow.set_variable in cancel path)
  const msg = lastOutput?.output?.message
    || lastOutput?.output?.response
    || session.state?.final_message;

  return {
    phase: 'complete',
    response: msg || 'Your request has been processed.',
    recommendation: session.state.recommendation || null,
    requirements: session.state.requirements || null,
    requestId: session.state.requestId || null,
    isComplete: true,
    sessionId: session.state.sessionId,
    engineStatus: result.status,
  };
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

/**
 * List all graphs accessible through CaMeL (have graphKey set).
 * @param {{ namespace?: string, type?: string }} filter
 */
async function listGraphs(filter = {}) {
  const mg = require('../../services/memgraph.service');
  const { namespace, type } = filter;
  let query = `MATCH (c:CatalogEntry) WHERE c.graphKey IS NOT NULL`;
  const params = {};
  if (namespace) { query += ' AND c.namespace = $ns'; params.ns = namespace; }
  if (type) { query += ' AND c.type = $type'; params.type = type; }
  query += ' RETURN c.entryId AS entryId, c.name AS name, c.namespace AS namespace, c.graphKey AS graphKey, c.type AS type ORDER BY c.namespace, c.name';
  return mg.runQuery(query, params);
}

module.exports = { processMessage, getSession, listGraphs };
