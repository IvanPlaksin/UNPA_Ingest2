/**
 * Security Middleware
 *
 * Provides:
 * - Rate limiting (in-memory, per-IP)
 * - Security headers (helmet-like)
 * - API key validation
 * - Request sanitization
 *
 * Usage:
 *   const { createSecurityMiddleware } = require('./middleware/security');
 *   const security = createSecurityMiddleware(config);
 *   app.use(security.rateLimit);
 *   app.use(security.securityHeaders);
 */

const logger = require('../utils/logger').child('Security');

/**
 * In-memory rate limiter (no external dependencies)
 */
function createRateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000;
  const max = options.max || 200;
  const enabled = options.enabled !== false;

  const store = new Map();

  // Cleanup old entries every windowMs
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (now - entry.start > windowMs) store.delete(key);
    }
  }, windowMs);

  if (cleanupInterval.unref) cleanupInterval.unref();

  return function rateLimitMiddleware(req, res, next) {
    if (!enabled) return next();

    const key = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    let entry = store.get(key);
    if (!entry || now - entry.start > windowMs) {
      entry = { count: 0, start: now };
      store.set(key, entry);
    }

    entry.count++;

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - entry.count));
    res.setHeader('X-RateLimit-Reset', new Date(entry.start + windowMs).toISOString());

    if (entry.count > max) {
      logger.warn('Rate limit exceeded', { ip: key, count: entry.count });
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please try again later.',
          statusCode: 429,
          retryAfter: Math.ceil((entry.start + windowMs - now) / 1000)
        }
      });
    }

    next();
  };
}

/**
 * Security headers middleware (helmet-like, zero dependencies)
 */
function createSecurityHeaders(options = {}) {
  const enabled = options.enabled !== false;

  return function securityHeadersMiddleware(req, res, next) {
    if (!enabled) return next();

    // Prevent MIME sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');

    // XSS protection
    res.setHeader('X-XSS-Protection', '0');

    // Don't send referrer on downgrade
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions policy
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Remove X-Powered-By
    res.removeHeader('X-Powered-By');

    // HSTS (only in production with HTTPS)
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  };
}

/**
 * API key validation middleware
 */
function createApiKeyValidator(options = {}) {
  const enabled = options.enabled === true;
  const apiKey = options.key;
  const headerName = options.headerName || 'x-api-key';

  return function apiKeyMiddleware(req, res, next) {
    if (!enabled || !apiKey) return next();

    // Skip for health checks and docs
    if (req.path.includes('/health') || req.path.includes('/docs') ||
        req.path.includes('/live') || req.path.includes('/ready')) {
      return next();
    }

    const providedKey = req.headers[headerName];
    if (!providedKey || providedKey !== apiKey) {
      logger.warn('Invalid API key', { ip: req.ip, path: req.path });
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or missing API key',
          statusCode: 401
        }
      });
    }

    next();
  };
}

/**
 * Request sanitization middleware
 */
function createSanitizer() {
  return function sanitizeMiddleware(req, _res, next) {
    // Trim string values in body
    if (req.body && typeof req.body === 'object') {
      trimStrings(req.body);
    }

    // Trim query params
    if (req.query) {
      for (const key of Object.keys(req.query)) {
        if (typeof req.query[key] === 'string') {
          req.query[key] = req.query[key].trim();
        }
      }
    }

    next();
  };
}

function trimStrings(obj) {
  for (const key of Object.keys(obj)) {
    if (typeof obj[key] === 'string') {
      obj[key] = obj[key].trim();
    } else if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      trimStrings(obj[key]);
    }
  }
}

/**
 * Create all security middleware from config
 */
function createSecurityMiddleware(config = {}) {
  const security = config.security || {};

  return {
    rateLimit: createRateLimiter(security.rateLimit),
    securityHeaders: createSecurityHeaders(security.helmet),
    apiKeyValidator: createApiKeyValidator(security.apiKey),
    sanitizer: createSanitizer()
  };
}

module.exports = {
  createSecurityMiddleware,
  createRateLimiter,
  createSecurityHeaders,
  createApiKeyValidator,
  createSanitizer
};
