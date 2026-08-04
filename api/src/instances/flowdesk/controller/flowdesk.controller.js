'use strict';

/**
 * FlowDesk REST API Controller
 * Provides classification, routing, and service catalog endpoints.
 */

const path = require('path');
// Ensure .env is loaded for Memgraph/Qdrant/TEI config
require('dotenv').config({ path: path.join(__dirname, '../..', '.env') });

const routing = require('../services/graph-routing.js');
const search = require('../services/semantic-search.js');
const { keywordClassify } = require('../services/keyword-filter.js');
const directory = require('../services/directory');
const { typeahead, UnknownDirectoryTypeError } = require('../services/directory/directory-typeahead');
const { DirectoryUnavailableError } = require('../services/directory/adapter.interface');

let initialized = false;

async function ensureInit() {
  if (initialized) return;
  try {
    await routing.init();
    await search.init();
    initialized = true;
  } catch (err) {
    console.error('[FlowDesk] Init error:', err.message);
    throw err;
  }
}

/**
 * POST /api/v1/flowdesk/classify
 * Classify user text into a service using semantic search.
 */
async function classify(req, res) {
  try {
    await ensureInit();
    const { text, lang, domain } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });

    // L1: Keyword filter (<1ms)
    const t0 = Date.now();
    const kwMatch = keywordClassify(text);
    const kwTime = Date.now() - t0;

    if (kwMatch) {
      return res.json({
        top_match: {
          service_code: kwMatch.service_code,
          service_name: kwMatch.service_code, // will be enriched by route
          score: kwMatch.confidence,
          matched_utterance: kwMatch.matched_pattern,
          lang: 'keyword',
        },
        alternatives: [],
        confidence: 'high',
        confidence_score: kwMatch.confidence,
        method: 'keyword',
        latency_ms: kwTime,
      });
    }

    // L2: Semantic search
    const t1 = Date.now();
    const result = await search.classifyUserIntent(text, {
      lang_filter: lang,
      domain_filter: domain,
    });
    result.method = 'semantic';
    result.latency_ms = Date.now() - t1;

    res.json(result);
  } catch (err) {
    console.error('[FlowDesk] classify error:', err.message);
    res.status(500).json({ error: 'Classification failed', detail: err.message });
  }
}

/**
 * POST /api/v1/flowdesk/route
 * Full routing: classify intent → resolve handler → return with user context.
 */
async function route(req, res) {
  try {
    await ensureInit();
    const { text, userId: bodyUserId } = req.body;
    const userId = req.flowdeskUser?.userId || bodyUserId;
    if (!text) return res.status(400).json({ error: 'text is required' });
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // Step 1: L1 Keyword filter (<1ms)
    const t0 = Date.now();
    const kwMatch = keywordClassify(text);
    const kwTime = Date.now() - t0;

    let classificationMethod = 'semantic';
    let serviceCode = null;
    let classification = null;

    if (kwMatch) {
      classificationMethod = 'keyword';
      serviceCode = kwMatch.service_code;
      classification = {
        service_code: kwMatch.service_code,
        confidence: 'high',
        confidence_score: kwMatch.confidence,
        alternatives: [],
        method: 'keyword',
        latency_ms: kwTime,
      };
    } else {
      // Step 1b: L2 Semantic search
      const t1 = Date.now();
      const semanticResult = await search.classifyUserIntent(text);
      const semTime = Date.now() - t1;

      if (!semanticResult.top_match) {
        return res.json({
          classification: { service_code: null, confidence: 'unclassified', method: 'semantic', latency_ms: semTime },
          handler: null,
          userContext: null,
          message: 'Could not classify the request',
        });
      }

      serviceCode = semanticResult.top_match.service_code;
      classification = {
        service_code: semanticResult.top_match.service_code,
        service_name: semanticResult.top_match.service_name,
        confidence: semanticResult.confidence,
        confidence_score: semanticResult.confidence_score,
        alternatives: semanticResult.alternatives,
        method: 'semantic',
        latency_ms: semTime,
      };
    }

    // Step 2: Route — pass FlowDesk user context when available to skip Memgraph user lookup
    const routingResult = await routing.resolveServiceHandler(userId, serviceCode, req.flowdeskUser || null);

    if (!routingResult) {
      return res.json({
        classification,
        handler: null,
        userContext: null,
        message: 'Service classified but no handler found',
      });
    }

    // Enrich keyword classification with service name from routing
    if (classificationMethod === 'keyword') {
      classification.service_name = routingResult.service.name;
    }

    res.json({
      classification: {
        service_code: classification.service_code,
        service_name: classification.service_name,
        confidence: classification.confidence,
        confidence_score: classification.confidence_score,
        method: classification.method,
        latency_ms: classification.latency_ms,
        alternatives: (classification.alternatives || []).map(a => ({
          service_code: a.service_code,
          service_name: a.service_name,
          score: a.score,
        })),
      },
      handler: routingResult.handler,
      service: routingResult.service,
      userContext: routingResult.userContext,
    });
  } catch (err) {
    console.error('[FlowDesk] route error:', err.message);
    res.status(500).json({ error: 'Routing failed', detail: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/user/:userId/context
 */
async function getUserContext(req, res) {
  try {
    await ensureInit();
    const { userId } = req.params;
    const ctx = await routing.getUserContext(userId);
    if (!ctx) return res.status(404).json({ error: 'User not found' });
    res.json({ userId, ...ctx });
  } catch (err) {
    console.error('[FlowDesk] getUserContext error:', err.message);
    res.status(500).json({ error: 'Failed to get user context', detail: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/services?domain=IT&requestable=true
 */
async function getServices(req, res) {
  try {
    await ensureInit();
    const { domain } = req.query;
    if (!domain) {
      const domains = await routing.getServiceDomains();
      return res.json({ domains, count: domains.length });
    }
    const services = await routing.findServicesByDomain(domain.toUpperCase());
    res.json({ services, count: services.length, domain: domain.toUpperCase() });
  } catch (err) {
    console.error('[FlowDesk] getServices error:', err.message);
    res.status(500).json({ error: 'Failed to get services', detail: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/directory/:type?q=&limit=
 *
 * Directory typeahead (I-6) for autocomplete controls: `type` is `user`
 * (beneficiary/requester) or `location` (duty station). Runs under the active
 * DirectoryAdapter (mock or Altiora), so no direct backend knowledge lives here.
 * A too-short query returns an empty list, not an error, per typeahead convention.
 */
async function directoryTypeahead(req, res) {
  try {
    const { type } = req.params;
    const { q, limit } = req.query;
    const out = await typeahead(directory, type, q, { limit });
    res.json({ ...out, count: out.results.length });
  } catch (err) {
    if (err instanceof UnknownDirectoryTypeError || err.code === 'BAD_DIRECTORY_TYPE') {
      return res.status(400).json({ error: err.message, validTypes: ['user', 'location'] });
    }
    if (err instanceof DirectoryUnavailableError || err.code === 'DIRECTORY_UNAVAILABLE') {
      // Graceful degradation: the control shows "type it manually", not a hard error.
      return res.status(503).json({ error: 'Directory temporarily unavailable', detail: err.message, results: [] });
    }
    console.error('[FlowDesk] directoryTypeahead error:', err.message);
    res.status(500).json({ error: 'Directory lookup failed', detail: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/services/:code
 */
async function getServiceByCode(req, res) {
  try {
    await ensureInit();
    const { code } = req.params;

    // Search all domains to find the service
    const domains = ['IT', 'HR', 'FAC', 'FIN', 'SEC', 'COM', 'LOG', 'LEG'];
    for (const domain of domains) {
      if (code.startsWith(domain + '-') || code === domain) {
        const services = await routing.findServicesByDomain(domain);
        const service = services.find(s => s.code === code);
        if (service) return res.json(service);
      }
    }
    res.status(404).json({ error: 'Service not found', code });
  } catch (err) {
    console.error('[FlowDesk] getServiceByCode error:', err.message);
    res.status(500).json({ error: 'Failed to get service', detail: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/health
 */
async function health(_req, res) {
  const status = { qdrant: 'unknown', memgraph: 'unknown', tei: 'unknown' };

  // Check Qdrant
  try {
    const r = await fetch(`${process.env.QDRANT_URL || 'http://localhost:6333'}/collections/flowdesk_services`);
    const data = await r.json();
    status.qdrant = data.status === 'ok' ? 'ok' : 'error';
    status.qdrant_points = data.result?.points_count;
  } catch { status.qdrant = 'error'; }

  // Check TEI
  try {
    const r = await fetch(`${process.env.TEI_URL || 'http://localhost:8081'}/info`);
    const data = await r.json();
    status.tei = data.model_id ? 'ok' : 'error';
    status.tei_model = data.model_id;
  } catch { status.tei = 'error'; }

  // Check Memgraph
  try {
    await routing.init();
    status.memgraph = 'ok';
  } catch { status.memgraph = 'error'; }

  const allOk = status.qdrant === 'ok' && status.tei === 'ok' && status.memgraph === 'ok';
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'healthy' : 'degraded', ...status });
}

/**
 * POST /api/v1/flowdesk/request
 * Create a service request and spawn workflow.
 */
async function createRequest(req, res) {
  try {
    await ensureInit();
    const workflowRunner = require('../services/workflow-runner.js');
    if (!workflowRunner.executorMap?.size) workflowRunner.init();

    const { serviceCode, userId: bodyUserId, justification, additionalData } = req.body;
    const userId = req.flowdeskUser?.userId || bodyUserId;
    if (!serviceCode) return res.status(400).json({ error: 'serviceCode is required' });
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // Get graph ID from Memgraph — pass FlowDesk context to skip Memgraph user lookup
    const routingResult = await routing.resolveServiceHandler(userId, serviceCode, req.flowdeskUser || null);

    // Check for gxe_graph_id
    const graphId = routingResult?.service?.gxeGraphId;
    if (!graphId) {
      return res.status(400).json({ error: 'No workflow defined for this service', serviceCode });
    }

    // Spawn workflow
    const result = await workflowRunner.spawn(graphId, {
      userId,
      serviceCode,
      justification: justification || '',
      additionalData: additionalData || {},
      handler: routingResult.handler,
      userContext: routingResult.userContext,
    });

    res.json({
      requestId: result.result?.['N3-CREATE-SR']?.requestId || result.workflowId,
      workflowId: result.workflowId,
      status: result.status,
      service: routingResult.service,
      handler: routingResult.handler,
      history: result.history,
      error: result.error,
    });
  } catch (err) {
    console.error('[FlowDesk] createRequest error:', err.message);
    res.status(500).json({ error: 'Failed to create request', detail: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/request/:id
 * Get request/workflow status.
 */
async function getRequest(req, res) {
  try {
    const workflowRunner = require('../services/workflow-runner.js');
    const { id } = req.params;

    // Check workflow
    const wf = workflowRunner.getWorkflow(id);
    if (wf) return res.json(wf);

    // Check service request store
    const createSR = require('../services/executors/create-service-request.js');
    const sr = createSR.getRequest(id);
    if (sr) return res.json(sr);

    res.status(404).json({ error: 'Request not found', id });
  } catch (err) {
    console.error('[FlowDesk] getRequest error:', err.message);
    res.status(500).json({ error: 'Failed to get request', detail: err.message });
  }
}

/**
 * POST /api/v1/flowdesk/chat
 * Dialog-based endpoint — stateful conversation driven by dialog graphs.
 */
async function chat(req, res) {
  try {
    const { sessionId: sid0, userId: uid0, message: msg0, choice: choice0, controlAction: ctrlAction0, anchor: anchor0, formEvent: formEvent0, lang: lang0, userContext: bodyUserCtx } = req.body;
    // The acting identity: the proxy-injected user (trusted) ALWAYS wins; the
    // body-provided profile is the fallback for the standalone UI (no proxy). The
    // body value never carries a bearer token, so it cannot escalate privilege —
    // outbound Altiora calls without a forwarded token act as the service account.
    const actingUser = req.flowdeskUser || bodyUserCtx || null;
    const uid = actingUser?.userId || uid0;

    // Feature flag: FlowDesk Chat V2 (flow-as-data interpreter). Default off for
    // safe rollout; flag off = instant rollback to the legacy contour.
    if (String(process.env.FLOWDESK_CHAT_V2 || 'false') === 'true') {
      if (!sid0) return res.status(400).json({ error: 'sessionId is required' });
      if (!uid) return res.status(400).json({ error: 'userId is required' });
      // Phase 4: an anchor click is a valid zero-query turn (no message needed).
      if (anchor0 != null && (typeof anchor0 !== 'object' || typeof anchor0.id !== 'string' || !anchor0.id)) {
        return res.status(400).json({ error: 'anchor.id must be a non-empty string' });
      }
      // A formEvent (e.g. the form reporting a created request) is a valid zero-input
      // turn — the host signals it, there is nothing for the user to have typed.
      if (!msg0 && !choice0 && !ctrlAction0 && !anchor0 && !formEvent0) return res.status(400).json({ error: 'message, choice, controlAction, anchor, or formEvent is required' });
      try {
        const chatV2 = require('../interpreter/chat-v2.service.js');
        const result = await chatV2.processMessage(sid0, uid, msg0, actingUser, choice0 || null, lang0 || 'en', ctrlAction0 || null, anchor0 || null, formEvent0 || null);
        return res.json({ sessionId: sid0, ...result });
      } catch (v2Err) {
        console.error(`[FlowDesk v2] error: ${v2Err.message}`);
        return res.status(500).json({ error: 'Chat V2 failed', detail: v2Err.message });
      }
    }

    // Try RuntimeEngine-based chat first, fallback to dialog-session
    let runtimeChat;
    try {
      runtimeChat = require('../services/runtime-chat.js');
    } catch (err) {
      console.warn('[FlowDesk] runtime-chat not available, using dialog-session fallback');
    }

    const { sessionId, userId: bodyUserId, message, graphVersion, graphId } = req.body;
    const userId = req.flowdeskUser?.userId || bodyUserId;
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!message) return res.status(400).json({ error: 'message is required' });

    let result;
    if (runtimeChat) {
      console.log(`[FlowDesk] chat: sid=${sessionId} uid=${userId?.substring(0,8)} graphId=${graphId} graphVersion=${graphVersion}`);
      try {
        result = await runtimeChat.processMessage(sessionId, userId, message, graphVersion || null, graphId || null);
        console.log(`[FlowDesk] chat result: status=${result?.engineStatus} response=${(result?.response||'').substring(0,60)} currentNode=${result?.currentNode}`);
      } catch (rtErr) {
        console.error(`[FlowDesk] RuntimeEngine error: ${rtErr.message}\n${rtErr.stack?.split('\n').slice(0,3).join('\n')}`);
        throw rtErr;
      }
    } else {
      // Legacy fallback
      const dialogManager = require('../services/dialog-session.js');
      await dialogManager.getOrCreateSession(sessionId, userId);
      result = await dialogManager.processMessage(sessionId, message);
    }

    res.json({
      sessionId,
      response: result.response,
      state: result.state || {},
      currentNode: result.currentNode,
      executionLog: result.executionLog,
      choices: result.choices,
      spawnResult: result.spawnResult,
      isComplete: result.isComplete,
    });
  } catch (err) {
    console.error('[FlowDesk] chat error:', err.message);
    res.status(500).json({ error: 'Chat failed', detail: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/chat/:sessionId
 */
async function getChatSession(req, res) {
  try {
    const dialogManager = require('../services/dialog-session.js');
    const session = dialogManager.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/graph-versions
 * Returns all versions of the FlowDesk dialog graph.
 */
async function getGraphVersions(_req, res) {
  try {
    const { getGraphDB } = require('../../../services/storage/GraphDBPort');
    const graphDB = getGraphDB();

    const r = await graphDB.runQuery(`
      MATCH (c:CatalogEntry {namespace:'FLOWDESK', type:'dialog'})-[:DEFINES]->(g:GraphDefinition)-[:HAS_VERSION]->(v:GraphVersion)
      RETURN c.entryId AS entryId, c.name AS name, c.currentVersion AS currentVersion,
             v.versionNumber AS version, v.versionId AS versionId,
             v.createdAt AS createdAt, v.changelog AS changelog,
             g.nodeCount AS nodeCount, g.edgeCount AS edgeCount
      ORDER BY v.versionNumber DESC
    `);

    const versions = r.records.map(rec => ({
      entryId: rec.get('entryId'),
      name: rec.get('name'),
      version: rec.get('version'),
      versionId: rec.get('versionId'),
      isCurrent: rec.get('version') === rec.get('currentVersion'),
      nodeCount: rec.get('nodeCount'),
      edgeCount: rec.get('edgeCount'),
      createdAt: rec.get('createdAt'),
      changelog: rec.get('changelog'),
    }));

    res.json({ versions, currentVersion: r.records[0]?.get('currentVersion') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// Ticket Lifecycle — GXE executable graph endpoints
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/flowdesk/tickets
 * Create a ticket via the manage_ticket executor
 */
async function createTicket(req, res) {
  try {
    const { ManageTicketExecutor } = require('../aopeg/executors/manage-ticket.executor.js');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../../../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'create', ...req.body },
      { executionContext: { memgraph } }
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.errors?.[0]?.message || 'Create failed' });
    }
    res.status(201).json({ success: true, data: result.output });
  } catch (err) {
    console.error('[FlowDesk] createTicket error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/tickets
 * List tickets (optionally filtered by status/priority)
 */
async function listTickets(req, res) {
  try {
    const { ManageTicketExecutor } = require('../aopeg/executors/manage-ticket.executor.js');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../../../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'list', status: req.query.status || null },
      { executionContext: { memgraph } }
    );

    res.json({ success: true, data: result.output?.tickets || [], count: result.output?.count || 0 });
  } catch (err) {
    console.error('[FlowDesk] listTickets error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/tickets/:ticketId
 * Get a single ticket
 */
async function getTicket(req, res) {
  try {
    const { ManageTicketExecutor } = require('../aopeg/executors/manage-ticket.executor.js');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../../../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'get', ticketId: req.params.ticketId },
      { executionContext: { memgraph } }
    );

    if (!result.success) {
      return res.status(404).json({ success: false, error: result.errors?.[0]?.message || 'Not found' });
    }
    res.json({ success: true, data: result.output?.ticket });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * PATCH /api/v1/flowdesk/tickets/:ticketId
 * Update ticket fields
 */
async function updateTicket(req, res) {
  try {
    const { ManageTicketExecutor } = require('../aopeg/executors/manage-ticket.executor.js');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../../../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'update', ticketId: req.params.ticketId, ...req.body },
      { executionContext: { memgraph } }
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.errors?.[0]?.message });
    }
    res.json({ success: true, data: result.output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/flowdesk/tickets/:ticketId/escalate
 */
async function escalateTicket(req, res) {
  try {
    const { ManageTicketExecutor } = require('../aopeg/executors/manage-ticket.executor.js');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../../../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'escalate', ticketId: req.params.ticketId, reason: req.body.reason },
      { executionContext: { memgraph } }
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.errors?.[0]?.message });
    }
    res.json({ success: true, data: result.output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/flowdesk/tickets/:ticketId/close
 */
async function closeTicket(req, res) {
  try {
    const { ManageTicketExecutor } = require('../aopeg/executors/manage-ticket.executor.js');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../../../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'close', ticketId: req.params.ticketId, reason: req.body.reason },
      { executionContext: { memgraph } }
    );

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.errors?.[0]?.message });
    }
    res.json({ success: true, data: result.output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/flowdesk/sla/check
 * Run SLA check on all open tickets
 */
async function checkSLA(req, res) {
  try {
    const { CheckSLAExecutor } = require('../aopeg/executors/check-sla.executor.js');
    const executor = new CheckSLAExecutor();
    const memgraph = require('../../../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'checkAll', autoEscalate: req.body.autoEscalate !== false },
      { executionContext: { memgraph } }
    );

    res.json({ success: true, data: result.output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/sla/breached
 * Get all SLA-breached tickets
 */
async function getBreachedTickets(req, res) {
  try {
    const { CheckSLAExecutor } = require('../aopeg/executors/check-sla.executor.js');
    const executor = new CheckSLAExecutor();
    const memgraph = require('../../../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'getBreached' },
      { executionContext: { memgraph } }
    );

    res.json({ success: true, data: result.output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/v1/flowdesk/laptop/chat
 * CaMeL-protected laptop provisioning AI assistant.
 */
async function laptopChat(req, res) {
  try {
    const camelChat = require('../../../services/camel/camel-chat.service');
    const { sessionId, userId, message } = req.body;

    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }

    const result = await camelChat.processMessage(sessionId, userId, message);
    res.json({ sessionId, ...result });
  } catch (err) {
    console.error('[FlowDesk] laptopChat error:', err.message);
    res.status(500).json({ error: 'Laptop chat failed', detail: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// DraftSR (C2) — live draft service request (Redis + Memgraph)
// ═══════════════════════════════════════════════════════════════════

function draftSvc() {
  return require('../services/draft-sr.service.js').getDraftSRService();
}

/**
 * GET /api/v1/flowdesk/chat/:sessionId/stream — SSE node-progress (Chat V2).
 * Long-lived per-session channel. Emits turn:start / node:start / node:done /
 * turn:done as the interpreter runs; the final answer still comes on the POST.
 */
function streamChat(req, res) {
  const { sessionId } = req.params;
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
  });
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('connected', { sessionId, ts: Date.now() });

  const progressBus = require('../interpreter/progress-bus');
  const unsubscribe = progressBus.subscribe(sessionId, (ev) => {
    // ev.type is like 'node:start' | 'node:done' | 'turn:start' | 'turn:done'
    send(ev.type, ev);
  });

  const heartbeat = setInterval(() => { res.write(': heartbeat\n\n'); }, 15000);

  const cleanup = () => { clearInterval(heartbeat); unsubscribe(); };
  req.on('close', cleanup);
  req.on('error', cleanup);
}

/** POST /api/v1/flowdesk/draft  { sessionId, serviceId, schemaVersion, beneficiary? } */
async function createDraft(req, res) {
  try {
    const { sessionId, serviceId, schemaVersion, beneficiary } = req.body;
    if (!sessionId || !serviceId || !schemaVersion) {
      return res.status(400).json({ error: 'sessionId, serviceId and schemaVersion are required' });
    }
    const draft = await draftSvc().create(sessionId, serviceId, schemaVersion, beneficiary);
    res.status(201).json(draft);
  } catch (err) {
    console.error('[FlowDesk] createDraft error:', err.message);
    res.status(500).json({ error: 'Failed to create draft', detail: err.message });
  }
}

/** GET /api/v1/flowdesk/schema/:serviceId — compiled SchemaSnapshot (Chat V2 DraftPanel). */
async function getSchema(req, res) {
  try {
    const { compile } = require('../schema-graph/schema-compiler');
    const snap = await compile(req.params.serviceId);
    if (!snap) return res.status(404).json({ error: 'Schema not found', serviceId: req.params.serviceId });
    res.json(snap);
  } catch (err) {
    console.error('[FlowDesk] getSchema error:', err.message);
    res.status(500).json({ error: 'Failed to load schema', detail: err.message });
  }
}

/** GET /api/v1/flowdesk/draft/:sessionId */
async function getDraft(req, res) {
  try {
    const draft = await draftSvc().get(req.params.sessionId);
    if (!draft) return res.status(404).json({ error: 'Draft not found' });
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/** PATCH /api/v1/flowdesk/draft/:sessionId  { patches: [...] } */
async function patchDraft(req, res) {
  try {
    const patches = req.body?.patches;
    if (!Array.isArray(patches)) return res.status(400).json({ error: 'patches[] is required' });
    const draft = await draftSvc().patch(req.params.sessionId, patches);
    res.json(draft);
  } catch (err) {
    console.error('[FlowDesk] patchDraft error:', err.message);
    res.status(500).json({ error: 'Failed to patch draft', detail: err.message });
  }
}

/** POST /api/v1/flowdesk/draft/:sessionId/submit */
async function submitDraft(req, res) {
  const telemetry = require('../services/chat-telemetry.service');
  try {
    const result = await draftSvc().submit(req.params.sessionId);
    if (result.error) return res.status(409).json(result); // INCOMPLETE (missing/stale)
    // ADMIN P0: the REST submit path bypasses the chat loop — stamp the outcome here.
    telemetry.stampOutcome(req.params.sessionId, 'completed', { srNumber: result.srNumber, ticketId: result.ticketId });
    res.json(result);
  } catch (err) {
    console.error('[FlowDesk] submitDraft error:', err.message);
    telemetry.stampOutcome(req.params.sessionId, 'submit_failed', { error: err.message });
    res.status(500).json({ error: 'Failed to submit draft', detail: err.message });
  }
}

/** POST /api/v1/flowdesk/draft/:sessionId/escalate  { reason, transcriptRef } */
async function escalateDraft(req, res) {
  try {
    const { reason, transcriptRef } = req.body || {};
    const result = await draftSvc().escalate(req.params.sessionId, reason, transcriptRef);
    // ADMIN P0: REST escalate bypasses the chat loop — stamp the outcome here.
    require('../services/chat-telemetry.service')
      .stampOutcome(req.params.sessionId, 'escalated', { escalationId: result.escalationId });
    res.json(result);
  } catch (err) {
    console.error('[FlowDesk] escalateDraft error:', err.message);
    res.status(500).json({ error: 'Failed to escalate draft', detail: err.message });
  }
}

/**
 * GET /api/v1/flowdesk/laptop/session/:sessionId
 */
async function getLaptopSession(req, res) {
  try {
    const camelChat = require('../../../services/camel/camel-chat.service');
    const session = camelChat.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ state: session.state, history: session.history, graphKey: session.graphKey });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════
// DOC-1-002 — chat file upload
// ═══════════════════════════════════════════════════════════════════

/** Coarse guard only — Altiora owns the real per-extension limits. */
const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Multipart parsing for the upload route, with multer's own failures turned
 * into JSON.
 *
 * Left to itself, multer rejects an oversized file by calling `next(err)`, and
 * Express's default handler answers with an HTML error page and a 500 — to a
 * fetch() expecting JSON that is indistinguishable from the server falling
 * over, for the entirely ordinary case of a file that is too big. So the error
 * is caught here and given the status it deserves: 413 for size, 400 for the
 * rest.
 */
function uploadChatFileMiddleware(req, res, next) {
  const multer = require('multer');
  const parse = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_MAX_BYTES, files: 1 },
  }).single('file');

  parse(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: `File is too large. Maximum is ${Math.round(UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`,
        code: 'FILE_TOO_LARGE',
      });
    }
    return res.status(400).json({ error: `Upload could not be read: ${err.message}`, code: 'BAD_UPLOAD' });
  });
}

/**
 * POST /api/v1/flowdesk/chat/upload?sessionId=...  (multipart, field `file`)
 *
 * Stages a user's document in Altiora under `Chat/{sessionId}` and indexes it
 * against the conversation. Two deliberate properties:
 *
 * FAIL-CLOSED ON IDENTITY. The rest of the chat falls back to the service
 * account when reached outside Altiora's proxy; this route does not. A file
 * carries personal data, is written into an external system, and is stamped
 * with `UploadedBy` there — uploading it as "the service account" would put an
 * unattributable document into a UN ticketing system. No acting user, no
 * upload.
 *
 * THE UPLOAD IS THE AUTHORITY, NOT US. Extension allow-list, magic-number
 * check, unsafe-SVG and PDF-with-JavaScript rejection all live in Altiora and
 * run on this path. We do not pre-judge the file; we relay Altiora's verdict,
 * because a second copy of those rules here would be a copy that drifts.
 */
async function uploadChatFile(req, res) {
  const { sessionId } = req.query;
  const file = req.file;
  const user = req.flowdeskUser || {};

  if (!sessionId) return res.status(400).json({ error: 'sessionId query parameter is required', code: 'NO_SESSION' });
  if (!file) return res.status(400).json({ error: 'No file provided', code: 'NO_FILE' });

  // THE TOKEN COMES OFF THE REQUEST, NOT OUT OF THE ACTING-USER CONTEXT.
  //
  // Everywhere else in the chat, `getActingToken()` is the way to get it: the
  // middleware opens an AsyncLocalStorage scope and every downstream await
  // stays inside it. That breaks here, and silently. AsyncLocalStorage follows
  // async continuations, but an EventEmitter listener runs in the emitter's
  // context, not the one it was registered in — and multer parses the body off
  // the request stream's events. Measured: with multer in front of a handler,
  // `getActingToken()` returns null while the identical handler without it
  // returns the token. The route would have refused every upload with 401.
  //
  // `req.flowdeskUser` is a property of the request object and survives that
  // crossing, so it is the primary source; the context is kept as a fallback
  // for any caller that reaches this handler another way.
  const { getActingToken } = require('../services/acting-user.context');
  const actingToken = user.token || getActingToken();
  if (!actingToken) {
    return res.status(401).json({
      error: 'Sign-in is required before attaching a file.',
      code: 'NO_ACTING_USER',
    });
  }

  const { getAltioraClient, AltioraValidationError, AltioraAuthError, AltioraUnavailableError } =
    require('../services/altiora-client');
  const { getChatAttachmentsStore } = require('../services/chat-attachments.store');
  const { recordAction } = require('../services/chat-action-log.service');

  const audit = (status, extra) => recordAction({
    sessionId,
    userId: user.userId || null,
    userEmail: user.email || null,
    orgCode: (user.orgUnit && user.orgUnit.code) || null,
    actionType: 'UPLOAD_FILE',
    actionParams: { fileName: file.originalname, size: file.size, contentType: file.mimetype },
    targetLabel: 'Attachment',
    status,
    motivation: 'User attached a document to the chat so its contents can fill the request.',
    ...extra,
  }).catch(() => { /* audit must never break the upload */ });

  try {
    const uploaded = await getAltioraClient().uploadAttachment(actingToken, {
      kind: 'Chat',
      ownerId: sessionId,
      file: file.buffer,
      fileName: file.originalname,
      contentType: file.mimetype,
      notes: 'Attached via the AI assistant',
    });

    // Altiora serialises FileAttachment camelCase, but its own frontend reads
    // both spellings — so do we, rather than trusting one and storing undefined.
    const attachmentId = uploaded && (uploaded.attachmentId || uploaded.AttachmentId);
    if (!attachmentId) throw new Error('Altiora accepted the file but returned no attachment id');

    // `canExtract` comes from the store, which derives it from the types the
    // MODEL can read. Altiora's allow-list is wider (.docx, .xlsx, .svg), so
    // "uploaded successfully" and "the assistant can read it" are not the same
    // answer, and only one of them is ours to give.
    const record = await getChatAttachmentsStore().addAttachment(sessionId, {
      attachmentId,
      fileName: file.originalname,
      contentType: file.mimetype,
      size: file.size,
    });

    await audit('EXECUTED', { targetId: attachmentId, result: { canExtract: record.canExtract } });

    return res.json({
      attachmentId: record.attachmentId,
      fileName: record.fileName,
      size: record.size,
      contentType: record.contentType,
      canExtract: record.canExtract,
    });
  } catch (err) {
    await audit('FAILED', { error: err.message });

    // Altiora's own rejection is the useful message — "File content does not
    // match its extension", "Extension '.exe' is not allowed" — and it is meant
    // for the person who chose the file. Passing it through is the point of
    // having taken the validated route.
    if (err instanceof AltioraValidationError) {
      return res.status(400).json({ error: err.body?.message || err.message, code: 'REJECTED_BY_ALTIORA' });
    }
    if (err instanceof AltioraAuthError) {
      return res.status(401).json({ error: 'Your session has expired. Please reload and try again.', code: 'AUTH_FAILED' });
    }
    if (err instanceof AltioraUnavailableError) {
      return res.status(503).json({ error: 'The document service is unavailable. Please try again.', code: 'UPSTREAM_UNAVAILABLE' });
    }

    console.error('[FlowDesk] uploadChatFile error:', err.message);
    return res.status(500).json({ error: 'The file could not be attached.', code: 'INTERNAL_ERROR' });
  }
}

/**
 * POST /api/v1/flowdesk/chat/attachments/link?sessionId=...  { ticketId }
 *
 * Called once the wizard reports the ticket it created. Everything staged in
 * this conversation is copied onto that ticket — see attachment-link.service
 * for why this is a step of its own rather than a field in the hand-off.
 *
 * Answers 200 even when some files failed. The request is already submitted by
 * the time this runs, so the outcome is per-file news, not a verdict on the
 * call: the caller gets counts and a per-file status and can tell the user which
 * document did not make it, rather than being handed a failure for the whole
 * batch when four of five worked.
 */
async function linkSessionAttachments(req, res) {
  const { sessionId } = req.query;
  const { ticketId } = req.body || {};
  const user = req.flowdeskUser || {};

  if (!sessionId) return res.status(400).json({ error: 'sessionId query parameter is required', code: 'NO_SESSION' });
  if (ticketId === undefined || ticketId === null || ticketId === '') {
    return res.status(400).json({ error: 'ticketId is required', code: 'NO_TICKET' });
  }

  const { getActingToken } = require('../services/acting-user.context');
  const actingToken = user.token || getActingToken();
  if (!actingToken) {
    return res.status(401).json({ error: 'Sign-in is required before attaching files to a request.', code: 'NO_ACTING_USER' });
  }

  try {
    const { linkSessionAttachments: link } = require('../services/attachment-link.service');
    const out = await link(sessionId, ticketId, actingToken, {
      userId: user.userId || null,
      userEmail: user.email || null,
      orgCode: (user.orgUnit && user.orgUnit.code) || null,
    });
    return res.json(out);
  } catch (err) {
    console.error('[FlowDesk] linkSessionAttachments error:', err.message);
    return res.status(500).json({ error: 'The attached files could not be added to the request.', code: 'LINK_FAILED' });
  }
}

module.exports = {
  classify, route, getUserContext, getServices, getServiceByCode, health,
  createRequest, getRequest, chat, getChatSession, getGraphVersions,
  createTicket, listTickets, getTicket, updateTicket, escalateTicket, closeTicket,
  checkSLA, getBreachedTickets,
  laptopChat, getLaptopSession,
  createDraft, getDraft, patchDraft, submitDraft, escalateDraft, streamChat, getSchema,
  directoryTypeahead,
  uploadChatFile, uploadChatFileMiddleware, UPLOAD_MAX_BYTES,
  linkSessionAttachments,
};
