const express = require('express');
const router = express.Router();
const adoService = require('../services/ado.service');
const queueService = require('../services/queue.service');
const { getCachedHealthCheck } = require('../services/redis.service');

/**
 * Compute health status for all services
 * @returns {Promise<Object>} Health status object
 */
async function computeHealthStatus() {
    const status = {
        ado: 'unknown',
        redis: 'unknown',
        worker: 'unknown',
        vector_db: 'mocked', // Since vector.service.js is a stub
        timestamp: new Date().toISOString()
    };

    // Check ADO
    try {
        const adoHealth = await adoService.checkHealth();
        status.ado = adoHealth ? 'connected' : 'disconnected';
    } catch (e) {
        console.error("ADO check failed:", e.message);
        status.ado = 'error';
    }

    // Check Redis
    try {
        const redisHealth = await queueService.checkRedisHealth();
        status.redis = redisHealth ? 'connected' : 'disconnected';
    } catch (e) {
        console.error("Redis check failed:", e.message);
        status.redis = 'error';
    }

    // Check Worker
    try {
        const workerHealth = await queueService.checkWorkerHealth();
        status.worker = workerHealth ? 'active' : 'inactive';
    } catch (e) {
        console.error("Worker check failed:", e.message);
        status.worker = 'error';
    }

    return status;
}

/**
 * GET /health
 * Main health check endpoint - cached for 1 minute in Redis
 */
router.get('/', async (req, res) => {
    const { data, cached } = await getCachedHealthCheck('main', computeHealthStatus);

    // Add cache info to response
    res.json({
        ...data,
        cached,
        cacheInfo: cached ? 'Result from Redis cache (TTL: 60s)' : 'Fresh result'
    });
});

/**
 * GET /health/fresh
 * Force fresh health check (bypasses cache)
 */
router.get('/fresh', async (req, res) => {
    const status = await computeHealthStatus();
    res.json({
        ...status,
        cached: false,
        cacheInfo: 'Fresh result (cache bypassed)'
    });
});

/**
 * GET /health/embeddings
 * Check if embedding service (TEI / Ollama) is available
 */
router.get('/embeddings', async (req, res) => {
    const result = {
        available: false,
        provider: 'none',
        model: null,
        dimensions: null,
        url: null,
        timestamp: new Date().toISOString()
    };

    // 1. Try TEI (primary)
    try {
        const teiService = require('../services/tei.service');
        const healthy = await teiService.isHealthy();
        if (healthy) {
            const info = await teiService.getInfo();
            result.available = true;
            result.provider = 'tei';
            result.model = info.model_id || info.model || 'unknown';
            result.dimensions = info.max_input_length || null;
            result.url = teiService.getConfig().url;
            return res.json(result);
        }
    } catch (e) {
        // TEI not available
    }

    // 2. Try Ollama embeddings (fallback)
    try {
        const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
        const ollamaAxios = require('axios');
        const resp = await ollamaAxios.get(`${OLLAMA_URL}/api/tags`, { timeout: 3000 });
        const models = resp.data?.models || [];
        const embedModel = models.find(m =>
            m.name.includes('nomic-embed') || m.name.includes('embed') || m.name.includes('bge')
        );
        if (embedModel) {
            result.available = true;
            result.provider = 'ollama';
            result.model = embedModel.name;
            result.url = OLLAMA_URL;
            return res.json(result);
        }
    } catch (e) {
        // Ollama not available
    }

    res.json(result);
});

/**
 * GET /health/codex
 * CC-031: Codex compliance status + background jobs
 */
router.get('/codex', async (req, res) => {
    try {
        const memgraphService = require('../services/memgraph.service');
        const { getStartupManager } = require('../services/startup/StartupManager');

        let namespaceViolations = 0;
        try {
            const result = await memgraphService.executeQuery(
                'MATCH (n) WHERE n.namespace IS NULL RETURN count(n) as c'
            );
            namespaceViolations = result.records?.[0]?.get('c')?.low ?? 0;
        } catch (e) {
            namespaceViolations = -1;
        }

        let executionRecords = 0;
        try {
            const result = await memgraphService.executeQuery(
                'MATCH (e:ExecutionRecord) RETURN count(e) as c'
            );
            executionRecords = result.records?.[0]?.get('c')?.low ?? 0;
        } catch (e) {
            executionRecords = -1;
        }

        const startupManager = getStartupManager();

        res.json({
            codexVersion: '0.1.1',
            compliance: {
                namespaceViolations,
                executionRecords,
                strictValidation: process.env.CODEX_STRICT_VALIDATION === 'true'
            },
            backgroundServices: startupManager.getHealthStatus(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

/**
 * GET /health/circuits
 * PH-007: Circuit breaker states for all resilient DB wrappers
 */
router.get('/circuits', (_req, res) => {
  try {
    const { getAllStates } = require('../utils/circuit-breaker');
    const states = getAllStates();
    const allClosed = Object.values(states).every(s => s.state === 'CLOSED');

    res.status(allClosed ? 200 : 503).json({
      status: allClosed ? 'healthy' : 'degraded',
      circuits: states,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

module.exports = router;
