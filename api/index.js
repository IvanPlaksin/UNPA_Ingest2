const fs = require('fs');
const path = require('path');
// Enable TypeScript imports for AOPEG plugin .ts files
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
// Load env vars from api/.env
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

// Ensure Artefacts directory exists (sandboxed filesystem for GXE execution)
fs.mkdirSync(path.resolve(__dirname, 'Artefacts'), { recursive: true });

const express = require('express');
const cors = require('cors');
const http = require('http');

// ═══════════════════════════════════════════════════════════════════
// Configuration & Middleware
// ═══════════════════════════════════════════════════════════════════
const envConfig = require('./src/config/environment');
const logger = require('./src/utils/logger').child('Server');
const { createRequestLogger } = require('./src/middleware/request-logger');
const { createSecurityMiddleware } = require('./src/middleware/security');
const { errorHandler, notFoundHandler, createShutdownHandler } = require('./src/middleware/error-handler');

// ═══════════════════════════════════════════════════════════════════
// Services
// ═══════════════════════════════════════════════════════════════════
const { connectToAdo } = require('./src/services/ado.service');
const { initializeStorage } = require('./src/services/initialization');
const { websocketService, queryStreamHandler } = require('./src/services/websocket');
const { jobQueueService } = require('./src/services/jobs');
const memgraphService = require('./src/services/memgraph.service');
const { destroy: destroyRedis } = require('./src/services/redis.service');
const { stopCleanup: stopSessionCleanup } = require('./src/services/sessionStore');
const { getTensorService } = require('./src/services/tensor.service');
const { getQueryCache } = require('./src/core/aopeg/utils/query-cache');
const { getStartupManager } = require('./src/services/startup/StartupManager');

// ═══════════════════════════════════════════════════════════════════
// Routes
// ═══════════════════════════════════════════════════════════════════
const chatRoutes = require('./src/routes/chat.route');
const knowledgeRoutes = require('./src/routes/knowledge.route');
const healthRoutes = require('./src/routes/health.route');
const rabbitholeRoutes = require('./src/routes/rabbithole.route');
const tfvcRoutes = require('./src/routes/tfvc.route');
const nexusRoutes = require('./src/routes/nexus.route');
const pipelineLabRoutes = require('./src/routes/pipelineLab.route');
const pipelineAnalysisRoutes = require('./src/routes/pipelineAnalysis.route');
const namespaceRoutes = require('./src/routes/namespace.route');
const tuningRoutes = require('./src/routes/tuning.route');
const incrementalKGRoutes = require('./src/routes/incrementalKG.route');
const aopegRoutes = require('./src/routes/aopeg.route');
const aiAgentRoutes = require('./src/routes/ai-agent.route');
const graphTypesRoutes = require('./src/routes/graph-types.route');
const ainfraRoutes = require('./src/routes/ainfra.route');
const immutableGraphRoutes = require('./src/routes/immutableGraph.route');
const gxeRoutes = require('./src/routes/gxe.route');
const graphCatalogRoutes = require('./src/routes/graphCatalog.route');
const tensorRoutes = require('./src/routes/tensor.route');
const runtimeRoutes = require('./src/routes/runtime.route');
const queryRoutes = require('./src/routes/query.route');
const patternRoutes = require('./src/routes/pattern.routes');
const graphRagRoutes = require('./src/routes/graph.routes');
const systemHealthRoutes = require('./src/routes/system-health.routes');
const openapiRoutes = require('./src/routes/openapi.routes');
const jobsRoutes = require('./src/routes/jobs.routes');
const ingestionRoutes = require('./src/routes/ingestion.routes');
const connectorsRoutes = require('./src/routes/connectors.routes');
const visualizationRoutes = require('./src/routes/visualization.routes');
const dashboardRoutes = require('./src/routes/dashboard.routes');
const exportRoutes = require('./src/routes/export.routes');
const reportRoutes = require('./src/routes/report.routes');
const subgraphRoutes = require('./src/routes/subgraph.route');
const domainRoutes = require('./src/routes/domain.route');
const datasourceRoutes = require('./src/routes/datasource.route');
require('./src/datasource'); // Register all DataSource executors (SQL, KB, API, FILE, COMPOSITE)
const mssqlRoutes = require('./src/routes/mssql.route');
const anomalyTasksRoutes = require('./src/routes/anomaly-tasks.route');
const advisorRoutes = require('./src/routes/advisor.route');
const graphStatusRoutes = require('./src/routes/graph-status.route');
const toolCatalogRoutes = require('./src/routes/toolCatalog.route');
const gxeManagerRoutes = require('./src/routes/gxeManager.route');
const approvalRoutes = require('./src/routes/approval.route');
const assistantRoutes = require('./src/routes/assistant.route');
const flowdeskRoutes = require('./src/instances/flowdesk/routes/flowdesk.route');
const flowdeskConfigRoutes = require('./src/instances/flowdesk/routes/flowdesk-config.route');
const codexRoutes = require('./src/routes/codex.route');
const backlogRoutes = require('./src/routes/backlog.route');
const backlogExecutionRoutes = require('./src/routes/backlog-execution.route');
const notificationsRoutes = require('./src/routes/notifications.route');
const monitorRoutes = require('./src/routes/monitor.route');
const kbHealthRoutes = require('./src/routes/kb-health.route');
const metacognitionRoutes = require('./src/routes/metacognition.route');
const workspaceRoutes = require('./src/routes/workspace.routes');
const dialogueRoutes = require('./src/routes/dialogue.route');
const sigillumRoutes = require('./src/routes/sigillum.route');
const tier0Routes = require('./src/routes/tier0.route');
const tier1Routes = require('./src/routes/tier1.route');
const kqsRoutes               = require('./src/routes/kqs.route');
const triangleRoutes          = require('./src/routes/triangle.route');
const documentProcessingRoutes  = require('./src/routes/document-processing.route');
const batchExtractionRoutes      = require('./src/routes/batch-extraction.route');
const sourceCatalogRoutes        = require('./src/routes/source-catalog.route');
const documentIndexRoutes        = require('./src/routes/document-index.route');
const entityStoreRoutes          = require('./src/routes/entity-store.route');
const dateTypeRegistryRoutes     = require('./src/routes/date-type-registry.route');
const esSyncRoutes               = require('./src/routes/es-sync.route');
const entityDedupRoutes          = require('./src/routes/entity-dedup.route');
const esIngestionAgentRoutes     = require('./src/routes/es-ingestion-agent.route');
const vectorsRoutes              = require('./src/routes/vectors.route');
const knowledgeMapRoutes         = require('./src/routes/knowledge-map.route');
const triangleExplorerRoutes    = require('./src/routes/triangle-explorer.route');
const gapManagerRoutes          = require('./src/routes/gap-manager.route');
const knowledgeHealthRoutes     = require('./src/routes/knowledge-health.route');
const { initFormRoutes } = require('./src/routes/structural-form.route');
const { initStructuralRoutes } = require('./src/routes/structural.route');
const llmAccessControlRoutes = require('./src/routes/llm-access-control.route');
const investigationRoutes = require('./src/routes/investigation.route');

// ═══════════════════════════════════════════════════════════════════
// App Setup
// ═══════════════════════════════════════════════════════════════════
const app = express();
const port = envConfig.server.port;
const security = createSecurityMiddleware(envConfig);

// Trust proxy (for load balancers)
if (envConfig.server.trustProxy) {
  app.set('trust proxy', 1);
}

// ═══════════════════════════════════════════════════════════════════
// Pre-route Middleware
// ═══════════════════════════════════════════════════════════════════
app.use(security.securityHeaders);
app.use(security.rateLimit);
app.use(createRequestLogger(envConfig));
app.use(cors({
  origin: envConfig.security.cors.origins.includes('*') ? true : envConfig.security.cors.origins,
  methods: envConfig.security.cors.methods,
  credentials: envConfig.security.cors.credentials
}));
app.use(express.json({ limit: '10mb' }));
app.use(security.sanitizer);
app.use(security.apiKeyValidator);

// PH-005: HTTP endpoint metrics collection
const { metricsMiddleware } = require('./src/middleware/metrics.middleware');
app.use(metricsMiddleware);

// ═══════════════════════════════════════════════════════════════════
// Error handling for uncaught exceptions
// ═══════════════════════════════════════════════════════════════════
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection', { reason: String(reason) });
});

// ═══════════════════════════════════════════════════════════════════
// Health check (before API prefix)
// ═══════════════════════════════════════════════════════════════════
app.get('/health', (_req, res) => res.json({ status: 'OK', env: envConfig.env }));
app.get('/test', (_req, res) => res.send('TEST OK'));

// ═══════════════════════════════════════════════════════════════════
// API Routes
// ═══════════════════════════════════════════════════════════════════
app.use('/api/v1/health/kb', kbHealthRoutes);
app.use('/api/v1/health', healthRoutes);
app.get('/api/v1/health-test', (_req, res) => res.json({ status: 'inline-ok' }));
app.use('/api/v1/rabbithole', rabbitholeRoutes);
app.use('/api/v1/tfvc', tfvcRoutes);
app.use('/api/v1/nexus', nexusRoutes);
app.use('/api/v1/knowledge', knowledgeRoutes);
app.use('/api/v1/pipeline-lab', pipelineLabRoutes);
app.use('/api/v1/pipeline-lab/analysis', pipelineAnalysisRoutes);
app.use('/api/v1/namespaces', namespaceRoutes);
app.use('/api/v1/tuning', tuningRoutes);
app.use('/api/v1/incremental-kg', incrementalKGRoutes);
app.use('/api/v1/aopeg', aopegRoutes);
app.use('/api/v1/ai-agent', aiAgentRoutes);
app.use('/api/v1/graph-types', graphTypesRoutes);
app.use('/api/v1/ainfra', ainfraRoutes);
app.use('/api/v1/graph', immutableGraphRoutes);
app.use('/api/v1/gxe', gxeRoutes);
app.use('/api/v1/gxe-manager', gxeManagerRoutes);
app.use('/api/v1/graph-catalog', graphCatalogRoutes);
app.use('/api/v1/tensors', tensorRoutes);
app.use('/api/v1/runtime', runtimeRoutes);
app.use('/api/v1/query', queryRoutes);
app.use('/api/v1/patterns', patternRoutes);
app.use('/api/v1/graph-rag', graphRagRoutes);
app.use('/api/v1/system', systemHealthRoutes);
app.use('/api/v1/docs', openapiRoutes);
app.use('/api/v1/jobs', jobsRoutes);
app.use('/api/v1/ingestion', ingestionRoutes);
app.use('/api/v1/connectors', connectorsRoutes);
app.use('/api/v1/visualization', visualizationRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/export', exportRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/subgraph', subgraphRoutes);
app.use('/api/v1/domains', domainRoutes);
app.use('/api/v1/datasources', datasourceRoutes);
app.use('/api/v1/mssql', mssqlRoutes);
app.use('/api/v1/anomaly-tasks', anomalyTasksRoutes);
app.use('/api/v1/advisor', advisorRoutes);
app.use('/api/v1/graph-status', graphStatusRoutes);
app.use('/api/v1/tool-catalog', toolCatalogRoutes);
app.use('/api/v1/approval', approvalRoutes);
app.use('/api/v1/assistant', assistantRoutes);
app.use('/api/v1/flowdesk/config', flowdeskConfigRoutes);
app.use('/api/v1/flowdesk', flowdeskRoutes);
app.use('/api/v1/codex', codexRoutes);
app.use('/api/v1/backlog', backlogRoutes);
app.use('/api/v1/backlog', backlogExecutionRoutes);
app.use('/api/v1', notificationsRoutes);
app.use('/api/v1/monitor', monitorRoutes);

// Initialize notification event handlers
try {
  const { setupBacklogEventHandlers } = require('./src/services/notifications/backlog-events');
  setupBacklogEventHandlers();
} catch (err) { console.warn('[Notifications] Event setup failed:', err.message); }
try {
  const decayWorker = require('./src/workers/confidence-decay.worker');
  decayWorker.initialize().catch(() => {});
} catch (err) { console.warn('[DecayWorker] Init skipped:', err.message); }
app.use('/api/v1/metrics', require('./src/routes/metrics.route'));
app.use('/api/v1/metacognition', metacognitionRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);
app.use('/api/v1/dialogue', dialogueRoutes);
app.use('/api/v1/sigillum', sigillumRoutes);
app.use('/api/v1/tier0', tier0Routes);
app.use('/api/v1/tier1', tier1Routes);
app.use('/api/v1/kqs',       kqsRoutes);
app.use('/api/v1/triangle',  triangleRoutes);
app.use('/api/v1/documents', documentProcessingRoutes);
app.use('/api/v1/extraction/batch', batchExtractionRoutes);
app.use('/api/v1/source-catalog', sourceCatalogRoutes);
app.use('/api/v1/document-index', documentIndexRoutes);
app.use('/api/v1/entity-store',         entityStoreRoutes);
app.use('/api/v1/date-types',           dateTypeRegistryRoutes);
app.use('/api/v1/es-sync',              esSyncRoutes);
app.use('/api/v1/entity-dedup',         entityDedupRoutes);
app.use('/api/v1/es-ingestion-agent',   esIngestionAgentRoutes);
app.use('/api/v1/vectors',        vectorsRoutes);
app.use('/api/v1/knowledge-map',  knowledgeMapRoutes);
const pipelineManagerRoutes = require('./src/routes/pipeline-manager.route');
app.use('/api/v1/pipeline', pipelineManagerRoutes);
const pipelineStatsRoutes = require('./src/routes/pipeline-stats.route');
app.use('/api/v1/pipeline-stats', pipelineStatsRoutes);
const extractionMethodRoutes = require('./src/routes/extraction.route');
app.use('/api/extraction', extractionMethodRoutes);
app.use('/api/v1/explorer',          triangleExplorerRoutes);
app.use('/api/v1/gaps',             gapManagerRoutes);
app.use('/api/v1/knowledge-health', knowledgeHealthRoutes);
app.use('/api/v1/llm-access', llmAccessControlRoutes);
app.use('/api/v1/investigation', investigationRoutes);
const _mg = require('./src/services/memgraph.service');
app.use('/api/v1/forms', initFormRoutes(_mg));
const { getFormService } = require('./src/routes/structural-form.route');
app.use('/api/v1/structural', initStructuralRoutes(_mg, getFormService()));

// ═══════════════════════════════════════════════════════════════════
// Post-route Middleware (error handling)
// ═══════════════════════════════════════════════════════════════════
app.use(notFoundHandler);
app.use(errorHandler);

// ═══════════════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════════════
async function startServer() {
  try {
    logger.info(`Starting UN ProjectAdvisor API [${envConfig.env}]...`);

    // Fire-and-forget background init — server must start immediately for ACA health probes
    connectToAdo()
      .then(() => logger.info('Connected to Azure DevOps'))
      .catch(err => logger.warn('Azure DevOps connection failed — continuing without ADO features', { error: err.message }));

    initializeStorage().catch(err => logger.warn('Storage initialization warning', { error: err.message }));

    if (envConfig.features.enableJobQueue) {
      jobQueueService.initialize().catch(err => logger.warn('Job queue initialization warning', { error: err.message }));
    }

    const startupManager = getStartupManager(logger);
    startupManager.initialize().catch(err => logger.warn('StartupManager initialization warning', { error: err.message }));

    try {
      const { auditAllWhitelists } = require('./src/middleware/whitelist-audit');
      const auditResult = auditAllWhitelists();
      if (!auditResult.allSafe) logger.error('Whitelist audit FAILED — check logs for violations');
    } catch (err) {
      logger.warn('Whitelist audit skipped', { error: err.message });
    }

    const server = http.createServer(app);

    // Initialize WebSocket
    if (envConfig.features.enableWebSocket) {
      websocketService.initialize(server);
      queryStreamHandler.initialize();
      logger.info('WebSocket initialized');
    }

    // Start dialogue file watcher (incremental processing of new Claude Code sessions)
    let dialogueWatcher = null;
    if (process.env.DIALOGUE_WATCHER_ENABLED !== 'false') {
      try {
        const { getWatcher } = require('./src/core/aopeg/plugins/dialogue/services/dialogue.watcher');
        dialogueWatcher = getWatcher();
        dialogueWatcher.start();
        logger.info('DialogueWatcher started');
      } catch (err) {
        logger.warn('DialogueWatcher start failed', { error: err.message });
      }
    }

    // Graceful shutdown — close all services holding the event loop open
    createShutdownHandler(server, [
      () => startupManager.shutdown(),
      () => websocketService.close?.(),
      () => jobQueueService.close?.(),
      () => memgraphService.close?.(),
      () => destroyRedis(),
      () => stopSessionCleanup(),
      () => getTensorService()?.stopCleanup?.(),
      () => getQueryCache()?.shutdown?.(),
      () => dialogueWatcher?.stop?.(),
      () => { try { require('./src/services/indexing/document-index.service').getDocumentIndexService().stop(); } catch {} },
    ]);

    server.listen(port, envConfig.server.host, () => {
      logger.info(`Server running on http://${envConfig.server.host}:${port}`);
      if (envConfig.features.enableWebSocket) {
        logger.info(`WebSocket available at ws://${envConfig.server.host}:${port}/ws`);
      }
      if (envConfig.features.enableSwagger) {
        logger.info(`Swagger UI: http://${envConfig.server.host}:${port}/api/v1/docs/swagger`);
      }
    });
  } catch (error) {
    logger.error('Critical Error during startup', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

startServer();
