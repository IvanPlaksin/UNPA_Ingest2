/**
 * Metrics Collection Middleware (PH-005)
 *
 * Automatically records request duration and status for tracked endpoints.
 * Uses the existing observability/metrics.service.js singleton.
 *
 * Usage:
 *   app.use(metricsMiddleware);  // global
 *   router.post('/path', metricsMiddleware, handler);  // per-route
 */

'use strict';

const metrics = require('../services/observability/metrics.service');

/**
 * Map of route patterns → metric names for detailed tracking.
 * Express normalizes req.route.path after matching, so we use that.
 */
const TRACKED_PATTERNS = {
  'POST /api/v1/graph-catalog/assistant/chat':          'catalog_assistant_chat',
  'POST /api/v1/graph-catalog/patterns/analyze':        'catalog_pattern_analyze',
  'POST /api/v1/graph-catalog/patterns/match':          'catalog_pattern_match',
  'POST /api/v1/graph-catalog/patterns/execute-replacement': 'catalog_pattern_replace',
  'POST /api/v1/workspaces/:id/agent/message':          'workspace_agent_message',
  'POST /api/v1/workspaces/:id/validate':               'workspace_validate',
  'POST /api/v1/workspaces/:id/promotion/execute':      'workspace_promote',
  'POST /api/v1/workspaces/:id/contradictions/detect':   'workspace_contradictions',
  'GET /api/v1/workspaces/:id/analysis/report':         'workspace_analysis',
  'POST /api/v1/workspaces/:id/sources/:sourceId/extract': 'workspace_extract',
  'POST /api/v1/workspaces/:id/structural-import':      'workspace_structural_import'
};

/**
 * Derive a metric-friendly route key from the request.
 * Uses req.route.path (set by Express router) to match parameterized routes.
 */
function getMetricName(req) {
  const routePath = req.route?.path;
  if (!routePath) return null;

  // Build the full mount path (baseUrl + route path)
  const fullPath = `${req.baseUrl}${routePath}`;
  const key = `${req.method} ${fullPath}`;

  return TRACKED_PATTERNS[key] || null;
}

/**
 * Express middleware that records request metrics.
 */
function metricsMiddleware(req, res, next) {
  const startTime = Date.now();

  res.on('finish', () => {
    const metricName = getMetricName(req);
    if (!metricName) return;

    const duration = Date.now() - startTime;
    const success = res.statusCode < 400;

    // Record duration
    metrics.recordValue(`http.${metricName}.duration`, duration);

    // Increment counters
    metrics.increment(`http.${metricName}.total`);
    metrics.increment(`http.${metricName}.${success ? 'success' : 'error'}`);

    // Record ranked by status code
    metrics.recordRanked(`http.status_codes`, String(res.statusCode));

    // Track slow requests (>5s)
    if (duration > 5000) {
      metrics.increment('http.slow_requests');
      metrics.recordRanked('http.slow_endpoints', metricName);
    }
  });

  next();
}

module.exports = { metricsMiddleware, TRACKED_PATTERNS, getMetricName };
