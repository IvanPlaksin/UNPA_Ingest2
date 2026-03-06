/**
 * MSSQL Import Controller
 *
 * SSE endpoints that stream import progress to the frontend.
 *   - streamImportAnalysis  — legacy pipeline (MssqlImportOrchestrator)
 *   - streamAgentImport     — new agentic pipeline (MssqlAgent, 9-phase spiral)
 */

const { MSSQLConnector } = require('../services/connectors/mssql.connector');
const MssqlImportOrchestrator = require('../services/connectors/mssql.import-orchestrator');
const { MssqlAgent } = require('../services/connectors/mssql.agent');
const { IngestionGraphService } = require('../services/ingestion/ingestion-graph.service');
const { MetaLearningRetriever } = require('../services/ingestion/meta-retriever.service');

const { getDomainService } = require('../services/domain');
let analyzer = null;

const getAnalyzer = () => {
  if (!analyzer) {
    const { MSSQLSemanticAnalyzer } = require('../services/connectors');
    const llmService = require('../services/llm.service');
    analyzer = new MSSQLSemanticAnalyzer(llmService);
  }
  return analyzer;
};

/**
 * GET /api/v1/mssql/import-analyze
 *
 * Query params:
 *  - domainId (required)
 *  - connectionName (required)
 *  - includeStructure (default: true)
 *  - includeEntities (default: true)
 *  - includeBusinessLogic (default: true)
 *  - sampleRows (default: 5)
 *  - schemas (comma-separated, optional)
 *  - server, port, database, user, password, encrypt, trustServerCertificate (optional — direct connection, bypasses CredentialStore)
 */
const streamImportAnalysis = async (req, res) => {
  const {
    domainId,
    connectionName,
    includeStructure,
    includeEntities,
    includeBusinessLogic,
    sampleRows,
    schemas,
    // Direct connection params (bypass CredentialStore)
    server: qServer,
    port: qPort,
    database: qDatabase,
    user: qUser,
    password: qPassword,
    encrypt: qEncrypt,
    trustServerCertificate: qTrust,
  } = req.query;

  // Either direct connection params OR domainId+connectionName required
  const hasDirect = qServer && qUser;
  if (!hasDirect && (!domainId || !connectionName)) {
    return res.status(400).json({
      success: false,
      error: 'Provide server+user (direct) or domainId+connectionName (saved source)',
    });
  }

  // ── SSE Headers ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // ── Heartbeat ──
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 15000);

  // ── SSE emit helper ──
  const emit = (event, data) => {
    try {
      const payload = JSON.stringify(data);
      // Truncate very large payloads for SSE
      const safe = payload.length > 50000 ? JSON.stringify({ ...data, _truncated: true, nodes: undefined, edges: undefined }) : payload;
      res.write(`event: ${event}\n`);
      res.write(`data: ${safe}\n\n`);
    } catch (err) {
      console.error('[MSSQL Import SSE] Write error:', err.message);
    }
  };

  let aborted = false;
  req.on('close', () => {
    aborted = true;
    clearInterval(heartbeat);
  });

  try {
    let connectionConfig;

    if (hasDirect) {
      // ── Direct connection params from query string ──
      emit('log', { level: 'info', message: `Connecting directly to ${qServer}:${qPort || 1433}/${qDatabase || 'master'}...` });
      connectionConfig = {
        server: qServer,
        port: parseInt(qPort) || 1433,
        database: qDatabase || 'master',
        username: qUser,
        password: qPassword || '',
        encryption: qEncrypt !== 'false',
        trustServerCertificate: qTrust !== 'false',
      };
    } else {
      // ── Resolve from saved data source + CredentialStore ──
      emit('log', { level: 'info', message: 'Resolving data source credentials...' });

      const service = getDomainService();
      const current = service.getCurrentDomain();
      if (!current || current.domainId !== domainId) {
        await service.switchDomain(domainId);
      }

      const { config, credentials } = await service.getDataSourceWithCredentials(connectionName);
      console.log('[MSSQL Import] credentials resolved:', credentials ? `user=${credentials.username}` : 'NULL');

      if (!config || config.sourceType !== 'MSSQL') {
        emit('error_event', { message: `Data source "${connectionName}" is not MSSQL or not found` });
        clearInterval(heartbeat);
        res.end();
        return;
      }

      // If CredentialStore failed, check if query params have fallback credentials
      const effectiveUser = credentials?.username || qUser;
      const effectivePass = credentials?.password || qPassword;

      if (!effectiveUser) {
        emit('error_event', { message: 'No credentials found. Re-save the connection or use direct connection mode.' });
        clearInterval(heartbeat);
        res.end();
        return;
      }

      connectionConfig = {
        server: config.connectionParams?.server,
        port: config.connectionParams?.port || 1433,
        database: config.connectionParams?.database,
        username: effectiveUser,
        password: effectivePass || '',
        domain: credentials?.domain,
        encryption: config.connectionParams?.encryption,
        trustServerCertificate: config.connectionParams?.trustServerCertificate,
      };
    }

    console.log('[MSSQL Import] Using connection:', connectionConfig.server, connectionConfig.username);

    // ── Create orchestrator ──
    const connector = new MSSQLConnector();
    const orchestrator = new MssqlImportOrchestrator({
      connector,
      analyzer: getAnalyzer(),
      emit: (event, data) => {
        if (!aborted) emit(event, data);
      },
    });

    // ── Run ──
    const options = {
      includeStructure: includeStructure !== 'false',
      includeEntities: includeEntities !== 'false',
      includeBusinessLogic: includeBusinessLogic !== 'false',
      sampleRows: parseInt(sampleRows) || 5,
      schemas: schemas ? schemas.split(',').map(s => s.trim()) : null,
    };

    await orchestrator.runFullImport(connectionConfig, options);

  } catch (error) {
    console.error('[MSSQL Import] Pipeline error:', error);
    if (!aborted) {
      emit('error_event', { message: error.message, fatal: true });
    }
  } finally {
    clearInterval(heartbeat);
    if (!aborted) {
      try { res.end(); } catch (_) {}
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// Agent-based Import (9-phase spiral extraction)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Resolve connection config from query params (direct or saved source).
 * Shared between legacy and agent endpoints.
 */
async function resolveConnectionConfig(req, emit) {
  const {
    domainId, connectionName,
    server: qServer, port: qPort, database: qDatabase,
    user: qUser, password: qPassword,
    encrypt: qEncrypt, trustServerCertificate: qTrust,
  } = req.query;

  const hasDirect = qServer && qUser;

  if (hasDirect) {
    emit('log', { level: 'info', message: `Connecting directly to ${qServer}:${qPort || 1433}/${qDatabase || 'master'}...` });
    return {
      server: qServer,
      port: parseInt(qPort) || 1433,
      database: qDatabase || 'master',
      username: qUser,
      password: qPassword || '',
      encryption: qEncrypt !== 'false',
      trustServerCertificate: qTrust !== 'false',
    };
  }

  if (!domainId || !connectionName) {
    throw new Error('Provide server+user (direct) or domainId+connectionName (saved source)');
  }

  emit('log', { level: 'info', message: 'Resolving data source credentials...' });

  const service = getDomainService();
  const current = service.getCurrentDomain();
  if (!current || current.domainId !== domainId) {
    await service.switchDomain(domainId);
  }

  const { config, credentials } = await service.getDataSourceWithCredentials(connectionName);

  if (!config || config.sourceType !== 'MSSQL') {
    throw new Error(`Data source "${connectionName}" is not MSSQL or not found`);
  }

  const effectiveUser = credentials?.username || qUser;
  const effectivePass = credentials?.password || qPassword;

  if (!effectiveUser) {
    throw new Error('No credentials found. Re-save the connection or use direct connection mode.');
  }

  return {
    server: config.connectionParams?.server,
    port: config.connectionParams?.port || 1433,
    database: config.connectionParams?.database,
    username: effectiveUser,
    password: effectivePass || '',
    domain: credentials?.domain,
    encryption: config.connectionParams?.encryption,
    trustServerCertificate: config.connectionParams?.trustServerCertificate,
  };
}

/**
 * GET /api/v1/mssql/agent-import
 *
 * SSE endpoint for the agentic 9-phase extraction pipeline.
 * Streams granular events: phase_start, phase_progress, entity_discovered, etc.
 *
 * Query params: same as import-analyze + enableMetaLearning (default: true)
 */
const streamAgentImport = async (req, res) => {
  const {
    includeStructure,
    includeEntities,
    includeBusinessLogic,
    enableMetaLearning,
    schemas,
  } = req.query;

  // ── SSE Headers ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  // ── Heartbeat ──
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (_) {}
  }, 15000);

  // ── SSE emit helper ──
  const emit = (event, data) => {
    try {
      const payload = JSON.stringify(data);
      const safe = payload.length > 50000
        ? JSON.stringify({ ...data, _truncated: true, nodes: undefined, edges: undefined, _originalSize: payload.length })
        : payload;
      res.write(`event: ${event}\n`);
      res.write(`data: ${safe}\n\n`);
    } catch (err) {
      console.error('[Agent Import SSE] Write error:', err.message);
    }
  };

  let aborted = false;
  req.on('close', () => { aborted = true; clearInterval(heartbeat); });

  try {
    const connectionConfig = await resolveConnectionConfig(req, emit);
    console.log('[Agent Import] Using connection:', connectionConfig.server, connectionConfig.username);

    // ── Initialize services ──
    const connector = new MSSQLConnector();

    let llmService;
    try {
      llmService = require('../services/llm.service');
      if (typeof llmService === 'function') llmService = new llmService();
    } catch (e) {
      console.warn('[Agent Import] LLM service not available:', e.message);
      llmService = { chat: async () => ({ content: '{}' }) };
    }

    let memgraphService = null;
    try {
      memgraphService = require('../services/memgraph.service');
    } catch (e) {
      console.warn('[Agent Import] Memgraph service not available:', e.message);
    }

    const ingestionGraph = memgraphService ? new IngestionGraphService(memgraphService) : null;
    const metaRetriever = memgraphService ? new MetaLearningRetriever(memgraphService) : null;

    // ── Create agent ──
    const agent = new MssqlAgent({
      connector,
      llmService,
      emit: (event, data) => { if (!aborted) emit(event, data); },
      metaRetriever,
      ingestionGraph,
    });

    // ── Run ──
    const options = {
      schemas: schemas ? schemas.split(',').map(s => s.trim()) : null,
      analyzeProcedures: includeBusinessLogic !== 'false',
      skipMetaConsultation: enableMetaLearning === 'false',
    };

    const result = await agent.run(connectionConfig, options);

    // ── Final event ──
    if (!aborted) {
      emit('agent_complete', {
        sessionId: result.session?.id,
        summary: result.summary || {},
        graphs: result.graphs
          ? Object.entries(result.graphs).map(([type, g]) => ({
              type,
              nodeCount: g.nodes?.length || 0,
              edgeCount: g.edges?.length || 0,
            }))
          : [],
        qualityScore: result.qualityScore || 0,
        duration: result.duration || 0,
      });
    }
  } catch (error) {
    console.error('[Agent Import] Pipeline error:', error);
    if (!aborted) {
      emit('agent_error', {
        message: error.message,
        phase: error.phase || 'unknown',
        recoverable: false,
      });
    }
  } finally {
    clearInterval(heartbeat);
    if (!aborted) {
      try { res.end(); } catch (_) {}
    }
  }
};

module.exports = { streamImportAnalysis, streamAgentImport };
