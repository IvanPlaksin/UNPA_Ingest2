/**
 * Request Logger Middleware
 *
 * Structured request logging with:
 * - Request ID generation
 * - Response timing
 * - Method, path, status, duration
 * - Configurable exclusions (health checks)
 *
 * Usage:
 *   const { createRequestLogger } = require('./middleware/request-logger');
 *   app.use(createRequestLogger(config));
 */

const logger = require('../utils/logger').child('HTTP');

let requestCounter = 0;

/**
 * Generate unique request ID
 */
function generateRequestId() {
  requestCounter = (requestCounter + 1) % 1000000;
  const ts = Date.now().toString(36);
  const cnt = requestCounter.toString(36).padStart(4, '0');
  return `req-${ts}-${cnt}`;
}

/**
 * Check if path should be excluded from logging
 */
function shouldExclude(path, excludePatterns) {
  for (const pattern of excludePatterns) {
    if (typeof pattern === 'string' && path.includes(pattern)) return true;
    if (pattern instanceof RegExp && pattern.test(path)) return true;
  }
  return false;
}

/**
 * Create request logger middleware
 */
function createRequestLogger(config = {}) {
  const logConfig = config.logging || {};
  const enabled = logConfig.logRequests !== false;
  const excludeHealthChecks = logConfig.excludeHealthChecks !== false;

  const excludePatterns = [];
  if (excludeHealthChecks) {
    excludePatterns.push('/health', '/live', '/ready', '/favicon.ico');
  }

  return function requestLoggerMiddleware(req, res, next) {
    // Assign request ID
    req.requestId = req.headers['x-request-id'] || generateRequestId();
    res.setHeader('X-Request-Id', req.requestId);

    if (!enabled || shouldExclude(req.path, excludePatterns)) {
      return next();
    }

    const startTime = process.hrtime.bigint();

    // Log on response finish
    const originalEnd = res.end;
    res.end = function(...args) {
      const duration = Number(process.hrtime.bigint() - startTime) / 1e6; // ms

      const logData = {
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration.toFixed(1)}ms`,
        contentLength: res.getHeader('content-length') || 0,
        userAgent: req.headers['user-agent']?.substring(0, 100) || '-'
      };

      if (res.statusCode >= 500) {
        logger.error(`${req.method} ${req.path} ${res.statusCode}`, logData);
      } else if (res.statusCode >= 400) {
        logger.warn(`${req.method} ${req.path} ${res.statusCode}`, logData);
      } else {
        logger.info(`${req.method} ${req.path} ${res.statusCode}`, logData);
      }

      originalEnd.apply(res, args);
    };

    next();
  };
}

module.exports = { createRequestLogger, generateRequestId };
