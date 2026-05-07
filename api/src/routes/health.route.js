const express = require('express');
const router = express.Router();
const adoService = require('../services/ado.service');
const queueService = require('../services/queue.service');
const { getCachedHealthCheck } = require('../services/redis.service');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const APP_VERSION = require('../../package.json').version;

/**
 * Compute health status for all services
 * @returns {Promise<Object>} Health status object
 */
async function computeHealthStatus() {
    const status = {
        ado: 'unknown',
        redis: 'unknown',
        worker: 'unknown',
        vector_db: 'unknown',
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

    // Check Qdrant
    try {
        const resp = await Promise.race([
            fetch(`${QDRANT_URL}/collections`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        status.vector_db = resp.ok ? 'connected' : 'error';
    } catch (e) {
        console.error("Qdrant check failed:", e.message);
        status.vector_db = 'error';
    }

    return status;
}

/**
 * GET /health/live
 * Kubernetes liveness probe — simple 200 if process is running
 */
router.get('/live', (_req, res) => {
    res.json({ status: 'alive', version: APP_VERSION, uptime: Math.floor(process.uptime()) });
});

/**
 * GET /health/ready
 * Kubernetes readiness probe — checks Memgraph, Qdrant, Redis connectivity
 */
router.get('/ready', async (_req, res) => {
    const services = {};
    let allOk = true;

    // Check Memgraph
    try {
        const memgraphService = require('../services/memgraph.service');
        await Promise.race([
            memgraphService.executeQuery('RETURN 1'),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        services.memgraph = 'ok';
    } catch (e) {
        services.memgraph = `error: ${e.message}`;
        allOk = false;
    }

    // Check Qdrant
    try {
        const resp = await Promise.race([
            fetch(`${QDRANT_URL}/collections`),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
        services.qdrant = resp.ok ? 'ok' : `error: HTTP ${resp.status}`;
        if (!resp.ok) allOk = false;
    } catch (e) {
        services.qdrant = `error: ${e.message}`;
        allOk = false;
    }

    // Check Redis — use main redis.service client (has retry strategy); 5s timeout survives ECONNRESET reconnect window
    try {
        const redisService = require('../services/redis.service');
        const client = redisService.getClient();
        const res = await Promise.race([
            client ? client.ping() : Promise.reject(new Error('no client')),
            new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
        ]);
        services.redis = res === 'PONG' ? 'ok' : 'error: unexpected response';
        if (services.redis !== 'ok') allOk = false;
    } catch (e) {
        services.redis = `error: ${e.message}`;
        allOk = false;
    }

    res.status(allOk ? 200 : 503).json({
        status: allOk ? 'ready' : 'not_ready',
        services,
        version: APP_VERSION,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

/**
 * GET /health
 * Main health check endpoint - cached for 1 minute in Redis
 */
router.get('/', async (req, res) => {
    const { data, cached } = await getCachedHealthCheck('main', computeHealthStatus);

    res.json({
        ...data,
        version: APP_VERSION,
        uptime: Math.floor(process.uptime()),
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

/**
 * GET /health/age-indexes
 * Diagnostic: reports namespace index state for the AGE backend.
 */
router.get('/age-indexes', async (_req, res) => {
  try {
    const memgraphService = require('../services/memgraph.service');
    const adapter = memgraphService._adapter;
    if (!adapter || typeof adapter._initPool !== 'function') {
      return res.json({ backend: process.env.GRAPH_DB_BACKEND, available: false });
    }
    const pool = adapter._initPool();
    const client = await pool.connect();
    try {
      const graphName = adapter._graphName || process.env.AGE_GRAPH_NAME || 'unpa';
      const [labels, indexes, validIndexes, sampleExpr] = await Promise.all([
        client.query(
          `SELECT count(*)::int AS n FROM ag_catalog.ag_label l
           WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
             AND l.kind = 'v' AND l.name NOT LIKE '_ag_label%'`,
          [graphName]
        ),
        client.query(
          `SELECT count(*)::int AS n FROM pg_indexes
           WHERE schemaname = $1 AND indexname LIKE 'idx\\_${graphName}\\_%\\_ns'`,
          [graphName]
        ),
        client.query(
          `SELECT count(*)::int AS n FROM pg_indexes pi
           JOIN pg_index idx ON idx.indexrelid = (
             SELECT oid FROM pg_class WHERE relname = pi.indexname
               AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
           )
           WHERE pi.schemaname = $1 AND pi.indexname LIKE 'idx\\_${graphName}\\_%\\_ns'
             AND idx.indisvalid = true`,
          [graphName]
        ),
        client.query(
          `SELECT l.name FROM ag_catalog.ag_label l
           WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
             AND l.kind = 'v' AND l.name NOT LIKE '_ag_label%' LIMIT 1`,
          [graphName]
        ),
      ]);
      const testLabel = sampleExpr.rows[0]?.name;
      let exprWorking = null;
      if (testLabel) {
        try {
          const r = await client.query(`SELECT (properties::text::jsonb->>'namespace') AS ns FROM "${graphName}"."${testLabel}" LIMIT 1`);
          exprWorking = { ok: true, sampleValue: r.rows[0]?.ns };
        } catch (e) {
          exprWorking = { ok: false, error: e.message };
        }
      }
      // Get all distinct namespace values across first few non-empty tables
      let sampleNamespaces = [];
      let explainPlan = null;
      const nsExpr = `(properties::text::jsonb->>'namespace')`;
      try {
        const allLabels = await client.query(
          `SELECT l.name FROM ag_catalog.ag_label l
           WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
             AND l.kind = 'v' AND l.name NOT LIKE '_ag_label%'`,
          [graphName]
        );
        for (const row of allLabels.rows.slice(0, 20)) {
          try {
            const r2 = await client.query(
              `SELECT DISTINCT ${nsExpr} AS ns FROM "${graphName}"."${row.name}" LIMIT 3`
            );
            if (r2.rows.some(r => r.ns)) {
              sampleNamespaces.push({ label: row.name, namespaces: r2.rows.map(r => r.ns) });
              if (sampleNamespaces.length >= 3) break;
            }
          } catch {}
        }
        // EXPLAIN one real query, and show actual stored index expression
        if (sampleNamespaces.length > 0) {
          await client.query("SET enable_seqscan = off");
          const firstLabel = sampleNamespaces[0].label;
          const expRes = await client.query(
            `EXPLAIN SELECT COUNT(*) FROM "${graphName}"."${firstLabel}" WHERE ${nsExpr} = 'GXE'`
          );
          explainPlan = expRes.rows.map(r => r['QUERY PLAN']).join('\n');
          // Show index definitions for this label's namespace index
          const safeName = firstLabel.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 40);
          const idxName = `idx_${graphName}_${safeName}_ns`.substring(0, 63);
          const idxDef = await client.query(
            `SELECT pg_get_indexdef(i.indexrelid) AS def, i.indisvalid, i.indexprs IS NOT NULL AS is_functional
             FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
             WHERE c.relname = $1 AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $2)`,
            [idxName, graphName]
          );
          explainPlan = {
            plan: expRes.rows.map(r => r['QUERY PLAN']).join('\n'),
            indexDef: idxDef.rows[0] || null,
            indexName: idxName,
          };
        }
      } catch (e) {
        sampleNamespaces = [{ error: e.message }];
      }

      res.json({
        graphName,
        vertexLabels: labels.rows[0].n,
        namespacIndexes: indexes.rows[0].n,
        validNamespacIndexes: validIndexes.rows[0].n,
        cachedExpr: adapter._nsExprCache,
        exprTestWorking: exprWorking,
        sampleNamespaces,
        explainPlan,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /health/edge-tables
 * List edge label tables in the AGE graph with their estimated row counts.
 * Used to verify whether any edges exist at all (pg_class.reltuples estimate).
 */
router.get('/edge-tables', async (_req, res) => {
  try {
    const memgraphService = require('../services/memgraph.service');
    const adapter = memgraphService._adapter;
    if (!adapter || typeof adapter._initPool !== 'function') {
      return res.json({ backend: process.env.GRAPH_DB_BACKEND, available: false });
    }
    const pool = adapter._initPool();
    const graphName = adapter._graphName || process.env.AGE_GRAPH_NAME || 'unpa';
    const client = await pool.connect();
    try {
      const result = await client.query(`
        SELECT l.name, c.reltuples::bigint AS est_rows, c.relpages
        FROM ag_catalog.ag_label l
        JOIN pg_class c ON c.relname = l.name
          AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
        WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
          AND l.kind = 'e' AND l.name NOT LIKE '_ag_label%'
        ORDER BY c.reltuples DESC
      `, [graphName]);
      res.json({
        graphName,
        edgeLabels: result.rows,
        totalEdgeTables: result.rows.length,
        tablesWithData: result.rows.filter(r => r.relpages > 0).length,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /health/count-ns?namespace=GXE
 * Time countNodesByNamespace directly for diagnostics.
 */
router.get('/count-ns', async (req, res) => {
  const namespace = req.query.namespace || 'GXE';
  try {
    const memgraphService = require('../services/memgraph.service');
    const t0 = Date.now();
    const count = await memgraphService.countNodesByNamespace(namespace);
    const ms = Date.now() - t0;
    res.json({ namespace, count, durationMs: ms });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * GET /health/count-edges?namespace=GXE
 * Bypasses JS cache — runs unpa_count_ns_edges directly for diagnostics.
 */
router.get('/count-edges', async (req, res) => {
  const namespace = req.query.namespace || 'GXE';
  try {
    const memgraphService = require('../services/memgraph.service');
    const adapter = memgraphService._adapter;
    if (!adapter || typeof adapter._initPool !== 'function') {
      return res.json({ backend: process.env.GRAPH_DB_BACKEND, available: false });
    }
    const pool = adapter._initPool();
    const graphName = adapter._graphName || process.env.AGE_GRAPH_NAME || 'unpa';
    const client = await pool.connect();
    try {
      await client.query("SET statement_timeout = '20000'");
      const t0 = Date.now();
      let result, error;
      try {
        const r = await client.query(
          `SELECT public.unpa_count_ns_edges($1, $2) AS n`,
          [graphName, namespace]
        );
        result = Number(r.rows[0]?.n) || 0;
      } catch (e) {
        error = e.message;
      }
      const ms = Date.now() - t0;

      // Also count vertex IDs for the namespace (to verify vertices exist)
      let vertexIdCount = null;
      let vertexIdError = null;
      try {
        const vr = await client.query(`
          SELECT count(*) AS n FROM (
            SELECT l.name FROM ag_catalog.ag_label l
            JOIN pg_class c ON c.relname = l.name
              AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
            WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
              AND l.kind = 'v' AND l.name NOT LIKE '_ag_label%'
              AND c.relpages > 0
          ) t
        `, [graphName]);
        vertexIdCount = Number(vr.rows[0]?.n) || 0;
      } catch (e) {
        vertexIdError = e.message;
      }

      // Sample a few actual graphid values from GXE vertices + edges
      let sampleVids = null, sampleEdgeIds = null;
      try {
        const sr = await client.query(`
          SELECT l.name FROM ag_catalog.ag_label l
          JOIN pg_class c ON c.relname = l.name
            AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
          WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
            AND l.kind = 'v' AND l.name NOT LIKE '_ag_label%'
            AND c.relpages > 0 LIMIT 1
        `, [graphName]);
        const vLabel = sr.rows[0]?.name;
        if (vLabel) {
          const vids = await client.query(
            `SELECT id::text AS id FROM "${graphName}"."${vLabel}" WHERE (properties::text::jsonb->>'namespace') = $1 LIMIT 3`,
            [namespace]
          );
          sampleVids = vids.rows.map(r => r.id);

          // Sample edge start_ids from the first edge table
          const er = await client.query(`
            SELECT l.name FROM ag_catalog.ag_label l
            JOIN pg_class c ON c.relname = l.name
              AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = $1)
            WHERE l.graph = (SELECT g.namespace FROM ag_catalog.ag_graph g WHERE g.name = $1)
              AND l.kind = 'e' AND l.name NOT LIKE '_ag_label%'
              AND c.relpages > 0 LIMIT 1
          `, [graphName]);
          const eLabel = er.rows[0]?.name;
          if (eLabel) {
            const eids = await client.query(
              `SELECT start_id::text AS start_id FROM "${graphName}"."${eLabel}" LIMIT 3`
            );
            sampleEdgeIds = { label: eLabel, startIds: eids.rows.map(r => r.start_id) };
          }
        }
      } catch (e) {
        sampleVids = { error: e.message };
      }

      res.json({
        namespace, graphName,
        edgeCount: result, error,
        durationMs: ms,
        nonEmptyVertexLabelCount: vertexIdCount, vertexIdError,
        sampleVids, sampleEdgeIds,
      });
    } finally {
      client.release();
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
