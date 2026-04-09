'use strict';

/**
 * FlowDesk Runtime Chat — executes dialog graphs through GXE RuntimeEngine.
 *
 * Replaces dialog-session.js with native RuntimeEngine execution.
 * Uses pause/resume for multi-turn conversations.
 */

const { graphCatalogService } = require('../graphCatalog.service');

// Lazy-load Codex loader for governance rules
let _codexRulesCache = null;
let _codexCacheTime = 0;
const CODEX_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getFlowDeskCodexRules() {
  if (_codexRulesCache && (Date.now() - _codexCacheTime < CODEX_CACHE_TTL)) {
    return _codexRulesCache;
  }
  try {
    const codexLoader = require('../codex/codex-loader.service');
    const result = await codexLoader.loadForFlowDesk();
    _codexRulesCache = result;
    _codexCacheTime = Date.now();
    console.log(`[FlowDesk RT] Codex rules loaded: ${result.metadata?.counts?.rules || 0} rules`);
    return result;
  } catch (err) {
    console.warn(`[FlowDesk RT] Codex rules unavailable: ${err.message}`);
    return null;
  }
}

// Session store: accumulated state across turns
const sessions = new Map(); // sessionId → { state, history, userContext }

let _mcpRegistry = null;
let _initPromise = null;

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
    console.log('[FlowDesk Runtime] Initialized, executors:', adapter.listExecutors().length);
    return _mcpRegistry;
  })();

  return _initPromise;
}

/**
 * Convert GXE visual graph format to AOPEG DAG format for RuntimeEngine.
 *
 * GXE visual format: kind=input/executor/condition/output, no tool/executorId
 * AOPEG DAG format: tool=workflow.start/end/condition, executorId for executors
 *
 * Mapping:
 * - kind=input → workflow.start
 * - kind=output → workflow.end
 * - kind=condition → workflow.condition
 * - kind=executor → infer executorId from label/description or use ai.generate fallback
 */
function convertGxeToAopegDag(nodes, edges) {
  // Map executor labels to known AOPEG executor IDs
  const LABEL_TO_EXECUTOR = {
    'intent classification': 'flowdesk.classify_intent',
    'classify intent': 'flowdesk.classify_intent',
    'check user location': 'flowdesk.check_location',
    'check location': 'flowdesk.check_location',
    'search location': 'flowdesk.search_location',
    'ask beneficiary': 'flowdesk.ask_beneficiary',
    'find beneficiary': 'flowdesk.find_user',
    'find user': 'flowdesk.find_user',
    'confirm request': 'flowdesk.confirm_request',
    'confirmation': 'flowdesk.confirm_request',
    'create service request': 'flowdesk.create_service_request',
    'request approval': 'flowdesk.request_approval',
    'create work order': 'flowdesk.create_work_order',
    'assign handler': 'flowdesk.assign_handler',
    'send confirmation': 'flowdesk.send_notification',
    'send notification': 'flowdesk.send_notification',
    'human escalation': 'flowdesk.spawn_process',
    'spawn process': 'flowdesk.spawn_process',
    'service configuration': 'workflow.set_variable',
  };

  const convertedNodes = nodes.map(n => {
    const d = n.data || {};
    const kind = d.kind || d.type || 'executor';
    const label = (d.label || n.label || '').toLowerCase().trim();

    // Already has tool/executorId/executorType — pass through or promote
    const existingTool = d.tool || d.executorId || d.executorType || d.toolRef;
    if (existingTool) {
      return {
        ...n,
        data: { ...d, tool: existingTool, executorId: existingTool }
      };
    }

    let tool = null;
    if (kind === 'input' || kind === 'start') {
      tool = 'workflow.start';
    } else if (kind === 'output' || kind === 'end') {
      tool = 'workflow.end';
    } else if (kind === 'condition') {
      tool = 'workflow.condition';
    } else if (kind === 'executor') {
      // Try to match by label
      tool = LABEL_TO_EXECUTOR[label] || null;
      if (!tool) {
        // Fuzzy match
        for (const [key, val] of Object.entries(LABEL_TO_EXECUTOR)) {
          if (label.includes(key) || key.includes(label)) { tool = val; break; }
        }
      }
      if (!tool) tool = 'ai.generate'; // fallback
    }

    return {
      ...n,
      data: {
        ...d,
        tool,
        executorId: tool,
      }
    };
  });

  return { nodes: convertedNodes, edges };
}

/**
 * Load dialog graph from GraphCatalog as DAG for RuntimeEngine.
 * @param {number|null} versionNumber - specific version to load, null = latest (currentVersion)
 */
async function loadDialogDAG(versionNumber = null, graphId = null) {
  const neo4j = require('neo4j-driver');
  const { MEMGRAPH_CONFIG } = require('./import-config');
  const driver = neo4j.driver(MEMGRAPH_CONFIG.uri, neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password), { disableLosslessIntegers: true });
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });

  try {
    let query;
    const params = {};

    if (graphId) {
      // Load by specific graph ID — use currentVersion from CatalogEntry
      query = `
        MATCH (c:CatalogEntry)-[:DEFINES]->(g:GraphDefinition)
        WHERE c.entryId = $graphId OR c.id = $graphId
        RETURN g.nodes AS nodes, g.edges AS edges, c.currentVersion AS version
        ORDER BY size(g.nodes) DESC
        LIMIT 1
      `;
      params.graphId = graphId;
    } else if (versionNumber) {
      // Load specific version
      query = `
        MATCH (c:CatalogEntry {namespace: 'FLOWDESK', type: 'dialog'})-[:DEFINES]->(g:GraphDefinition)
        RETURN g.nodes AS nodes, g.edges AS edges, $ver AS version
        ORDER BY size(g.nodes) DESC
        LIMIT 1
      `;
      params.ver = versionNumber;
    } else {
      // Load latest — use currentVersion from CatalogEntry
      query = `
        MATCH (c:CatalogEntry {namespace: 'FLOWDESK', type: 'dialog'})-[:DEFINES]->(g:GraphDefinition)
        RETURN g.nodes AS nodes, g.edges AS edges, c.currentVersion AS version
        ORDER BY size(g.nodes) DESC
        LIMIT 1
      `;
    }

    const result = await session.run(query, params);

    if (result.records.length === 0) throw new Error(`Intake Dialog graph${versionNumber ? ' v' + versionNumber : ''} not found in Memgraph`);

    let nodes = JSON.parse(result.records[0].get('nodes'));
    let edges = JSON.parse(result.records[0].get('edges'));
    const version = result.records[0].get('version');

    // Normalize all nodes: ensure every node has data.tool and data.executorId
    // Some nodes may have tool/executorId, others only executorType/toolRef
    nodes = nodes.map(n => {
      const d = n.data || {};
      if (d.tool && d.executorId) return n; // fully resolved
      const resolved = d.tool || d.executorId || d.executorType || d.toolRef;
      if (resolved) {
        return { ...n, data: { ...d, tool: resolved, executorId: resolved } };
      }
      return n; // will be handled by convertGxeToAopegDag
    });

    // Convert remaining nodes that still lack tool/executorId
    const hasUnresolved = nodes.some(n => !(n.data?.tool) && !(n.data?.executorId));
    if (hasUnresolved) {
      console.log(`[FlowDesk RT] Converting unresolved GXE nodes → AOPEG DAG`);
      ({ nodes, edges } = convertGxeToAopegDag(nodes, edges));
    }

    console.log(`[FlowDesk RT] Loaded graph v${version} (${nodes.length} nodes, ${edges.length} edges)`);
    return { nodes, edges, version };
  } finally {
    await session.close();
    await driver.close();
  }
}

/**
 * Process a chat message through RuntimeEngine.
 *
 * Each turn = fresh execution with accumulated state as input.
 * Executors check: have data? → pass through. Need input? → WAIT_FOR_INPUT.
 * This avoids the need for engine keep-alive or checkpoint management.
 */
async function processMessage(sessionId, userId, message, graphVersion = null, graphId = null) {
  const registry = await ensureRuntime();
  const { RuntimeEngine } = require('../../runtime');

  // Get or create session with accumulated state
  let session = sessions.get(sessionId);
  if (!session) {
    const routing = require('./graph-routing');
    await routing.init();
    let userContext = null;
    try { userContext = await routing.getUserContext(userId); } catch {}

    // Load Codex governance rules for FlowDesk
    const codexRules = await getFlowDeskCodexRules();

    session = {
      userContext,
      codexRules, // Codex governance rules for this session
      // Accumulated data from all turns — passed as input to every execution
      state: {
        userId,
        sessionId,
        dutyStation: userContext?.location?.dutyStation || null,
        country: userContext?.location?.country || null,
      },
      history: [],
    };
    sessions.set(sessionId, session);
  }

  // Record user message
  session.history.push({ role: 'user', content: message, ts: new Date().toISOString() });

  // Merge new message into state — the latest userInput
  session.state.userInput = message;
  // Also set as searchTerm (for D4-ASK-LOC) and as generic answer
  session.state.searchTerm = message;

  // Execute entire graph with accumulated state injected into all nodes
  // Load specific version or latest
  const versionToLoad = graphVersion || session.state._graphVersion || null;
  const graphIdToLoad = graphId || session.state._graphId || null;
  const dagRaw = await loadDialogDAG(versionToLoad, graphIdToLoad);
  if (graphVersion) session.state._graphVersion = graphVersion;
  if (graphId) session.state._graphId = graphId; // remember for subsequent turns

  // Filter out tref (tool reference) nodes and USES_TOOL edges — they are visual only
  const dag = {
    nodes: dagRaw.nodes.filter(n => !n.data?.isToolRef),
    edges: dagRaw.edges.filter(e => e.label !== 'USES_TOOL'),
  };

  // Inject accumulated state as parameters on EVERY executor node
  for (const node of dag.nodes) {
    if (!node.data) node.data = {};
    if (!node.data.config) node.data.config = {};
    node.parameters = { ...session.state, ...(node.parameters || {}), ...(node.data.config || {}) };
  }

  const engine = new RuntimeEngine(registry, {
    graphTimeoutMs: 30000,
    nodeTimeoutMs: 15000,
    enableValidation: false,
  });

  const executionId = `flowdesk-${sessionId}-${Date.now()}`;

  // Pass Codex rules as globalVariables so executors can access governance context
  const execOptions = { executionId };
  if (session.codexRules?.metadata?.counts?.rules > 0) {
    execOptions.globalVariables = {
      codexRulesLoaded: true,
      codexRuleCount: session.codexRules.metadata.counts.rules,
      codexScopes: session.codexRules.metadata.scopes,
    };
  }

  const result = await engine.execute(dag, session.state, execOptions);

  // Register execution with GxeManager for real-time monitoring
  try {
    const bridge = require('./gxe-manager-bridge');
    await bridge.registerExecution(executionId, 'flowdesk.dialog.intake', { userId, message, sessionId }, {
      turn: session.history.length,
      graphName: 'Intake Dialog',
    });
    await bridge.updateExecution(executionId, result, result.nodeResults || {});
  } catch (err) {
    console.warn('[FlowDesk RT] GxeManager bridge:', err.message);
  }

  // Debug logging
  console.log('[FlowDesk RT] status:', result.status, 'waiting:', result.waitingNodes ? Object.keys(result.waitingNodes) : 'null');
  for (const [k, v] of Object.entries(result.nodeResults || {})) {
    if (v.status !== 'SKIPPED' && v.status !== 'CANCELLED') {
      let info = `${k}: ${v.status}`;
      if (v.output?.response) info += ` resp="${v.output.response.slice(0, 50)}"`;
      if (v.output?.branch) info += ` branch=${v.output.branch}`;
      if (v.error) info += ` ERR=${JSON.stringify(v.details || v.error).slice(0, 120)}`;
      console.log(`[FlowDesk RT]   ${info}`);
    }
  }

  // Extract outputs and accumulate state from completed nodes
  const nodeResults = result.nodeResults || {};
  for (const [nodeId, nr] of Object.entries(nodeResults)) {
    if (nr.status === 'SUCCEEDED' && nr.output) {
      // Accumulate key state from executor outputs
      if (nr.output.service_code) session.state.service_code = nr.output.service_code;
      if (nr.output.service_name) session.state.service_name = nr.output.service_name;
      // Only update location if: (a) no location yet, or (b) new location has id (from search), or (c) current location has no id (from profile)
      if (nr.output.location) {
        const hasSearchedLocation = session.state.location && session.state.location.id;
        const newHasId = nr.output.location.id;
        if (!hasSearchedLocation || newHasId) {
          session.state.location = nr.output.location;
        }
      }
      if (nr.output.beneficiary_type) session.state.beneficiary_type = nr.output.beneficiary_type;
      if (nr.output.beneficiary) session.state.beneficiary = nr.output.beneficiary;
      if (nr.output.confirmed) session.state.confirmed = true;
      if (nr.output.beneficiaryLocationConfirmed) session.state.beneficiaryLocationConfirmed = true;
      if (nr.output.specificationConfirmed) session.state.specificationConfirmed = true;
      if (nr.output.requestConfirmed) session.state.requestConfirmed = true;
      if (nr.output.different_location) session.state.different_location = nr.output.different_location;
      // Persist confirmField-specific values for re-execution pass-through
      // Each confirm node uses unique confirmField, so values don't cross-contaminate
      if (nr.output.beneficiaryLocationConfirmed !== undefined) session.state.beneficiaryLocationConfirmed = nr.output.beneficiaryLocationConfirmed;
      if (nr.output.specificationConfirmed !== undefined) session.state.specificationConfirmed = nr.output.specificationConfirmed;
      if (nr.output.requestId) session.state.requestId = nr.output.requestId;
      if (nr.output.workOrderId) session.state.workOrderId = nr.output.workOrderId;
    }
  }

  // Clear transient fields so next turn starts clean
  delete session.state.userInput;
  delete session.state.searchTerm;

  return buildResponse(session, result, dag);
}

/**
 * Build chat response from RuntimeEngine execution result.
 */
function buildResponse(session, result, dag) {
  // RuntimeEngine returns nodeResults: { nodeId: { status, output, error, durationMs, ... } }
  const nodeResults = result?.nodeResults || {};
  const outputs = nodeResults; // Each entry has .output field
  const waitingNodes = result?.waitingNodes || [];

  // Extract response, choices, and state from node outputs
  let response = null;
  let choices = null;
  let spawnResult = null;
  const state = {};

  // Check waitContext for prompt/choices (from WAIT_FOR_INPUT)
  // waitingNodes is an object { nodeId: { prompt, choices, ... } }
  const waitingNodesObj = result?.waitingNodes || {};
  const waitNodeIds = Object.keys(waitingNodesObj);
  if (result?.status === 'WAITING_FOR_INPUT' && waitNodeIds.length > 0) {
    const waitCtx = waitingNodesObj[waitNodeIds[0]];
    if (waitCtx) {
      response = waitCtx.response || waitCtx.prompt;
      choices = waitCtx.choices;
    }
  }

  // Collect responses from ALL succeeded node results
  const allResponses = [];

  for (const [nodeId, nodeResult] of Object.entries(outputs)) {
    if (nodeResult?.status !== 'SUCCEEDED') continue;
    const data = nodeResult?.output;
    if (!data) continue;

    if (data.response) allResponses.push(data.response);
    if (data.choices && !choices) choices = data.choices;
    if (data.condition) state.lastCondition = data.condition;
    if (data.service_code) state.intent = data.service_code;
    if (data.service_name) state.service_name = data.service_name;
    if (data.location) state.location = data.location?.name || data.location;
    if (data.beneficiary_type) state.beneficiary = data.beneficiary_type;
    if (data.confirmed) state.confirmed = true;
    if (data.requestId) { spawnResult = data; state.requestId = data.requestId; }
    if (data.workOrderId) state.workOrderId = data.workOrderId;
  }

  // Combine all responses — deduplicate to prevent repeated text
  if (allResponses.length > 0) {
    // Use unique responses only, preserve order
    const unique = [...new Set(allResponses)];
    if (!response) {
      response = unique.join('\n\n');
    } else if (!unique.includes(response)) {
      // Prepend executor responses before wait prompt (if different)
      response = unique.join('\n\n') + '\n\n' + response;
    }
    // else: response already in allResponses, no duplication needed
  }

  // Merge extracted state with session accumulated state
  const fullState = { ...(session?.state || {}), ...state };

  return {
    response: response || 'Processing...',
    choices,
    state: {
      intent: fullState.service_code || fullState.intent,
      service_name: fullState.service_name,
      location: typeof fullState.location === 'object' ? fullState.location?.name : fullState.location,
      beneficiary: fullState.beneficiary_type || fullState.beneficiary,
      confirmed: fullState.confirmed || false,
      requestId: fullState.requestId,
      workOrderId: fullState.workOrderId,
    },
    currentNode: waitNodeIds[0] || (result?.status === 'COMPLETED' ? 'WF-END' : null),
    executionLog: Object.entries(nodeResults)
      .filter(([, nr]) => nr.status === 'SUCCEEDED' || nr.status === 'FAILED' || nr.status === 'WAITING_INPUT')
      .map(([nodeId, nr]) => {
        // Find node metadata from DAG
        const dagNode = dag.nodes.find(n => n.id === nodeId) || {};
        const nodeData = dagNode.data || {};
        return {
          node: nodeId,
          label: nodeData.label || nodeId,
          kind: nodeData.kind || nodeData.type || 'executor',
          tool: nodeData.tool || nodeData.executorId || null,
          executor: nr.output?.method || nr.output?.branch || nodeId,
          status: nr.status === 'SUCCEEDED' ? 'success' : nr.status === 'WAITING_INPUT' ? 'waiting' : 'error',
          elapsed_ms: nr.durationMs,
          condition: nr.output?.branch,
          // Input state at the time of execution (node parameters)
          inputState: dagNode.parameters ? Object.fromEntries(
            Object.entries(dagNode.parameters).filter(([k]) => !k.startsWith('_') && k !== 'sessionId')
          ) : null,
          // Output from executor
          output: nr.output ? (typeof nr.output === 'object' ? nr.output : { value: nr.output }) : null,
          waitForInput: nodeData.waitForInput || false,
          // Include full error details for failed nodes
          ...(nr.status === 'FAILED' ? {
            error: nr.error || 'UNKNOWN',
            errorDetails: nr.details || null,
            errorReason: nr.reason || null,
          } : {}),
        };
      }),
    spawnResult,
    isComplete: result?.status === 'COMPLETED',
    engineStatus: result?.status,
    codex: session?.codexRules ? {
      loaded: true,
      rules: session.codexRules.metadata?.counts?.rules || 0,
      scopes: session.codexRules.metadata?.scopes || [],
    } : { loaded: false },
  };
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function endSession(sessionId) {
  sessions.delete(sessionId);
}

module.exports = { processMessage, getSession, endSession };
