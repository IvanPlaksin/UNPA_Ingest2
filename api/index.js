const fs = require('fs');
const path = require('path');
// Enable TypeScript imports for AOPEG plugin .ts files
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
// Disable SSL verification for on-premise ADO
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
const mssqlRoutes = require('./src/routes/mssql.route');
const anomalyTasksRoutes = require('./src/routes/anomaly-tasks.route');
const advisorRoutes = require('./src/routes/advisor.route');
const graphStatusRoutes = require('./src/routes/graph-status.route');

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
app.use('/api/v1/mssql', mssqlRoutes);
app.use('/api/v1/anomaly-tasks', anomalyTasksRoutes);
app.use('/api/v1/advisor', advisorRoutes);
app.use('/api/v1/graph-status', graphStatusRoutes);

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

    await connectToAdo();
    logger.info('Connected to Azure DevOps');

    // Initialize storage layer (Graph + Vector)
    await initializeStorage().catch(err => {
      logger.warn('Storage initialization warning', { error: err.message });
    });

    // Initialize background job queues
    if (envConfig.features.enableJobQueue) {
      await jobQueueService.initialize().catch(err => {
        logger.warn('Job queue initialization warning', { error: err.message });
      });
    }

    const server = http.createServer(app);

    // Initialize WebSocket
    if (envConfig.features.enableWebSocket) {
      websocketService.initialize(server);
      queryStreamHandler.initialize();
      logger.info('WebSocket initialized');
    }

    // Graceful shutdown — close all services holding the event loop open
    createShutdownHandler(server, [
      () => websocketService.close?.(),
      () => jobQueueService.close?.(),
      () => memgraphService.close?.(),
      () => destroyRedis(),
      () => stopSessionCleanup(),
      () => getTensorService()?.stopCleanup?.(),
      () => getQueryCache()?.shutdown?.(),
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
