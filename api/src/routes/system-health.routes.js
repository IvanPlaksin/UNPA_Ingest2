/**
 * System Health & Status API Routes
 * Enhanced health checks for the knowledge extraction pipeline components
 *
 * Endpoints:
 *   GET  /api/v1/system/health         - Basic health check
 *   GET  /api/v1/system/live           - Liveness probe
 *   GET  /api/v1/system/ready          - Readiness probe
 *   GET  /api/v1/system/status         - Comprehensive system status
 *   GET  /api/v1/system/stats          - Aggregated component stats
 *   POST /api/v1/system/reset-stats    - Reset all statistics
 *
 * @module routes/system-health.routes
 */

const express = require('express');
const router = express.Router();
const { queryEngine } = require('../services/query');
const { patternLibrary } = require('../services/patterns');
const { gnnRAGService } = require('../services/gnn');
const { gnnEnhancedExtractor } = require('../services/extraction');

const startTime = Date.now();

// ═══════════════════════════════════════════════════════════════════════════
// HEALTH PROBES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /health
 * Basic health check for load balancers
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /live
 * Liveness probe (is the service running?)
 */
router.get('/live', (req, res) => {
  res.json({
    status: 'alive',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /ready
 * Readiness probe (is the service ready to accept requests?)
 */
router.get('/ready', (req, res) => {
  const checks = {
    queryEngine: false,
    patternLibrary: false,
    graphService: false
  };

  try {
    checks.queryEngine = typeof queryEngine.query === 'function';
    checks.patternLibrary = patternLibrary.entityPatterns instanceof Map;
    checks.graphService = gnnRAGService.graphCache.nodes instanceof Map;

    const allReady = Object.values(checks).every(v => v);

    if (allReady) {
      res.json({ status: 'ready', checks, timestamp: new Date().toISOString() });
    } else {
      res.status(503).json({ status: 'not_ready', checks, timestamp: new Date().toISOString() });
    }
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: error.message,
      checks,
      timestamp: new Date().toISOString()
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE STATUS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /status
 * Comprehensive system status
 */
router.get('/status', (req, res) => {
  try {
    const status = {
      service: {
        name: 'ProjectAdvisor API',
        version: process.env.API_VERSION || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        uptime: Math.floor((Date.now() - startTime) / 1000),
        uptimeFormatted: formatUptime(Date.now() - startTime)
      },
      components: {
        queryEngine: getQueryEngineStatus(),
        patternLibrary: getPatternLibraryStatus(),
        graphService: getGraphServiceStatus(),
        extraction: getExtractionStatus()
      },
      memory: getMemoryStatus(),
      timestamp: new Date().toISOString()
    };

    const componentStatuses = Object.values(status.components).map(c => c.status);
    status.overall = componentStatuses.every(s => s === 'healthy') ? 'healthy' :
                     componentStatuses.some(s => s === 'healthy') ? 'degraded' : 'unhealthy';

    res.json(status);
  } catch (error) {
    console.error('[SystemHealth] Status error:', error.message);
    res.status(500).json({
      overall: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /stats
 * Aggregated statistics from all components
 */
router.get('/stats', (req, res) => {
  try {
    const stats = {
      query: queryEngine.getStats(),
      patterns: patternLibrary.getStats(),
      graph: gnnRAGService.getStats(),
      extraction: gnnEnhancedExtractor.getStats(),
      timestamp: new Date().toISOString()
    };
    res.json({ success: true, stats });
  } catch (error) {
    console.error('[SystemHealth] Stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /reset-stats
 * Reset all statistics (requires confirmation)
 * Body: { confirm: true }
 */
router.post('/reset-stats', (req, res) => {
  try {
    if (!req.body.confirm) {
      return res.status(400).json({ success: false, error: 'Must confirm with { confirm: true }' });
    }

    queryEngine.resetStats();
    gnnEnhancedExtractor.resetStats();

    res.json({ success: true, message: 'Statistics reset' });
  } catch (error) {
    console.error('[SystemHealth] Reset stats error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getQueryEngineStatus() {
  try {
    const stats = queryEngine.getStats();
    return {
      status: 'healthy',
      totalQueries: stats.totalQueries || 0,
      successRate: stats.totalQueries > 0
        ? ((stats.successfulQueries / stats.totalQueries) * 100).toFixed(1) + '%'
        : 'N/A',
      cacheSize: stats.cache?.size || 0,
      cacheHitRate: stats.cache?.hitRate || 'N/A'
    };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

function getPatternLibraryStatus() {
  try {
    const stats = patternLibrary.getStats();
    return {
      status: 'healthy',
      entityPatterns: stats.entityPatterns || 0,
      relationPatterns: stats.relationPatterns || 0,
      subgraphPatterns: stats.subgraphPatterns || 0,
      totalPatterns: stats.total || 0
    };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

function getGraphServiceStatus() {
  try {
    const stats = gnnRAGService.getStats();
    return {
      status: 'healthy',
      nodes: stats.graphSize?.nodes || 0,
      edges: stats.graphSize?.edges || 0,
      cacheSize: stats.cacheSize || 0,
      totalQueries: stats.totalQueries || 0
    };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

function getExtractionStatus() {
  try {
    const stats = gnnEnhancedExtractor.getStats();
    return {
      status: 'healthy',
      totalExtractions: stats.totalExtractions || 0,
      nodesAdded: stats.nodesAdded || 0,
      edgesAdded: stats.edgesAdded || 0,
      patternsLearned: stats.patternsLearned || 0
    };
  } catch (error) {
    return { status: 'unhealthy', error: error.message };
  }
}

function getMemoryStatus() {
  const used = process.memoryUsage();
  return {
    heapUsed: formatBytes(used.heapUsed),
    heapTotal: formatBytes(used.heapTotal),
    rss: formatBytes(used.rss),
    external: formatBytes(used.external)
  };
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}

module.exports = router;
module.exports.startTime = startTime;
