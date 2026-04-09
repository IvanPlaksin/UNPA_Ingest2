'use strict';

/**
 * FlowDesk REST API Controller
 * Provides classification, routing, and service catalog endpoints.
 */

const path = require('path');
// Ensure .env is loaded for Memgraph/Qdrant/TEI config
require('dotenv').config({ path: path.join(__dirname, '../..', '.env') });

const routing = require('../services/flowdesk/graph-routing');
const search = require('../services/flowdesk/semantic-search');
const { keywordClassify } = require('../services/flowdesk/keyword-filter');

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
    const { text, userId } = req.body;
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

    // Step 2: Route
    const routingResult = await routing.resolveServiceHandler(userId, serviceCode);

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
    const r = await fetch('http://localhost:6333/collections/flowdesk_services');
    const data = await r.json();
    status.qdrant = data.status === 'ok' ? 'ok' : 'error';
    status.qdrant_points = data.result?.points_count;
  } catch { status.qdrant = 'error'; }

  // Check TEI
  try {
    const r = await fetch('http://localhost:8081/info');
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
    const workflowRunner = require('../services/flowdesk/workflow-runner');
    if (!workflowRunner.executorMap?.size) workflowRunner.init();

    const { serviceCode, userId, justification, additionalData } = req.body;
    if (!serviceCode) return res.status(400).json({ error: 'serviceCode is required' });
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // Get graph ID from Memgraph
    const routingResult = await routing.resolveServiceHandler(userId, serviceCode);

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
    const workflowRunner = require('../services/flowdesk/workflow-runner');
    const { id } = req.params;

    // Check workflow
    const wf = workflowRunner.getWorkflow(id);
    if (wf) return res.json(wf);

    // Check service request store
    const createSR = require('../services/flowdesk/executors/create-service-request');
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
    // Try RuntimeEngine-based chat first, fallback to dialog-session
    let runtimeChat;
    try {
      runtimeChat = require('../services/flowdesk/runtime-chat');
    } catch (err) {
      console.warn('[FlowDesk] runtime-chat not available, using dialog-session fallback');
    }

    const { sessionId, userId, message, graphVersion, graphId } = req.body;
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
      const dialogManager = require('../services/flowdesk/dialog-session');
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
    const dialogManager = require('../services/flowdesk/dialog-session');
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
    const neo4j = require('neo4j-driver');
    const { MEMGRAPH_CONFIG } = require('../services/flowdesk/import-config');
    const driver = neo4j.driver(MEMGRAPH_CONFIG.uri, neo4j.auth.basic(MEMGRAPH_CONFIG.user, MEMGRAPH_CONFIG.password), { disableLosslessIntegers: true });
    const session = driver.session({ defaultAccessMode: neo4j.session.READ });

    try {
      const r = await session.run(`
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
    } finally {
      await session.close();
      await driver.close();
    }
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
    const { ManageTicketExecutor } = require('../core/aopeg/plugins/flowdesk/executors/manage-ticket.executor');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../services/memgraph.service');

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
    const { ManageTicketExecutor } = require('../core/aopeg/plugins/flowdesk/executors/manage-ticket.executor');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../services/memgraph.service');

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
    const { ManageTicketExecutor } = require('../core/aopeg/plugins/flowdesk/executors/manage-ticket.executor');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../services/memgraph.service');

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
    const { ManageTicketExecutor } = require('../core/aopeg/plugins/flowdesk/executors/manage-ticket.executor');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../services/memgraph.service');

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
    const { ManageTicketExecutor } = require('../core/aopeg/plugins/flowdesk/executors/manage-ticket.executor');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../services/memgraph.service');

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
    const { ManageTicketExecutor } = require('../core/aopeg/plugins/flowdesk/executors/manage-ticket.executor');
    const executor = new ManageTicketExecutor();
    const memgraph = require('../services/memgraph.service');

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
    const { CheckSLAExecutor } = require('../core/aopeg/plugins/flowdesk/executors/check-sla.executor');
    const executor = new CheckSLAExecutor();
    const memgraph = require('../services/memgraph.service');

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
    const { CheckSLAExecutor } = require('../core/aopeg/plugins/flowdesk/executors/check-sla.executor');
    const executor = new CheckSLAExecutor();
    const memgraph = require('../services/memgraph.service');

    const result = await executor.execute(
      { operation: 'getBreached' },
      { executionContext: { memgraph } }
    );

    res.json({ success: true, data: result.output });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = {
  classify, route, getUserContext, getServices, getServiceByCode, health,
  createRequest, getRequest, chat, getChatSession, getGraphVersions,
  createTicket, listTickets, getTicket, updateTicket, escalateTicket, closeTicket,
  checkSLA, getBreachedTickets
};
