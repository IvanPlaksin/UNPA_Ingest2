/**
 * Task 10.4: Production Configuration Tests
 *
 * Tests:
 *   1. Environment Config Loader (10) — loading, merging, defaults, env overrides
 *   2. Development Config (5) — dev-specific settings
 *   3. Production Config (5) — prod-specific settings
 *   4. Test Config (5) — test-specific settings
 *   5. Logger Utility (12) — levels, formats, child loggers, output
 *   6. Error Handler (15) — error types, formatting, stack, not-found, async
 *   7. Security Middleware (14) — rate limiting, headers, API key, sanitization
 *   8. Request Logger (8) — request ID, timing, exclusions
 *   9. Middleware Integration (6) — middleware chain in index.js
 *  10. Graceful Shutdown (4) — shutdown handler creation
 */

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    passed++;
    console.log(`  \u2713 ${testName}`);
  } else {
    failed++;
    console.log(`  \u2717 FAIL: ${testName}`);
  }
}

function section(name) {
  console.log(`\n--- ${name} ---`);
}

// ═══════════════════════════════════════════════════════════════════
// 1. Environment Config Loader
// ═══════════════════════════════════════════════════════════════════
section('1. Environment Config Loader');

const envConfig = require('../../src/config/environment');

assert(typeof envConfig === 'object', 'Config is an object');
assert(envConfig.env != null, 'Config has env field');
assert(typeof envConfig.server === 'object', 'Config has server section');
assert(typeof envConfig.logging === 'object', 'Config has logging section');
assert(typeof envConfig.security === 'object', 'Config has security section');
assert(typeof envConfig.features === 'object', 'Config has features section');
assert(typeof envConfig.errorHandler === 'object', 'Config has errorHandler section');
assert(typeof envConfig.server.port === 'number', 'Port is a number');
assert(envConfig.server.port > 0 && envConfig.server.port < 65536, 'Port is valid range');
assert(typeof envConfig.server.host === 'string', 'Host is a string');

// ═══════════════════════════════════════════════════════════════════
// 2. Development Config
// ═══════════════════════════════════════════════════════════════════
section('2. Development Config');

const devConfig = require('../../src/config/environments/development');
assert(devConfig.server.port === 3010, 'Dev port is 3010');
assert(devConfig.logging.level === 'debug', 'Dev log level is debug');
assert(devConfig.logging.format === 'pretty', 'Dev log format is pretty');
assert(devConfig.security.rateLimit.enabled === false, 'Dev rate limiting disabled');
assert(devConfig.errorHandler.includeStack === true, 'Dev includes stack traces');

// ═══════════════════════════════════════════════════════════════════
// 3. Production Config
// ═══════════════════════════════════════════════════════════════════
section('3. Production Config');

const prodConfig = require('../../src/config/environments/production');
assert(prodConfig.logging.level === 'info', 'Prod log level is info');
assert(prodConfig.logging.format === 'json', 'Prod log format is json');
assert(prodConfig.security.rateLimit.enabled === true, 'Prod rate limiting enabled');
assert(prodConfig.security.helmet.enabled === true, 'Prod helmet enabled');
assert(prodConfig.errorHandler.includeStack === false, 'Prod hides stack traces');

// ═══════════════════════════════════════════════════════════════════
// 4. Test Config
// ═══════════════════════════════════════════════════════════════════
section('4. Test Config');

const testConfig = require('../../src/config/environments/test');
assert(testConfig.server.port === 3099, 'Test port is 3099');
assert(testConfig.logging.level === 'warn', 'Test log level is warn');
assert(testConfig.logging.logRequests === false, 'Test request logging disabled');
assert(testConfig.features.enableWebSocket === false, 'Test WebSocket disabled');
assert(testConfig.features.enableJobQueue === false, 'Test job queue disabled');

// ═══════════════════════════════════════════════════════════════════
// 5. Logger Utility
// ═══════════════════════════════════════════════════════════════════
section('5. Logger Utility');

const logger = require('../../src/utils/logger');

assert(typeof logger === 'object', 'Logger is an object');
assert(typeof logger.debug === 'function', 'Logger has debug method');
assert(typeof logger.info === 'function', 'Logger has info method');
assert(typeof logger.warn === 'function', 'Logger has warn method');
assert(typeof logger.error === 'function', 'Logger has error method');
assert(typeof logger.child === 'function', 'Logger has child method');

// Child logger
const childLogger = logger.child('TestModule');
assert(childLogger.module === 'TestModule', 'Child logger has module name');
assert(typeof childLogger.info === 'function', 'Child logger has info method');

// Child with context
const contextLogger = logger.child({ requestId: 'test-123' });
assert(contextLogger.context.requestId === 'test-123', 'Context logger has requestId');

// Logger levels
assert(logger.level != null, 'Logger has a level');
assert(['debug', 'info', 'warn', 'error'].includes(logger.level), 'Logger level is valid');

// Format
assert(logger.format != null, 'Logger has a format');
assert(['json', 'pretty'].includes(logger.format), 'Logger format is valid');

// ═══════════════════════════════════════════════════════════════════
// 6. Error Handler
// ═══════════════════════════════════════════════════════════════════
section('6. Error Handler');

const {
  errorHandler: errHandler,
  notFoundHandler: notFound,
  asyncHandler,
  createShutdownHandler,
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError
} = require('../../src/middleware/error-handler');

// Error classes
assert(typeof AppError === 'function', 'AppError class exists');
assert(typeof ValidationError === 'function', 'ValidationError class exists');
assert(typeof NotFoundError === 'function', 'NotFoundError class exists');
assert(typeof ConflictError === 'function', 'ConflictError class exists');
assert(typeof RateLimitError === 'function', 'RateLimitError class exists');

// Error instances
const appErr = new AppError('test', 500, 'TEST_ERR');
assert(appErr.statusCode === 500, 'AppError has statusCode');
assert(appErr.code === 'TEST_ERR', 'AppError has code');
assert(appErr.isOperational === true, 'AppError is operational');
assert(appErr.message === 'test', 'AppError has message');

const valErr = new ValidationError('invalid', { field: 'name' });
assert(valErr.statusCode === 400, 'ValidationError is 400');
assert(valErr.details.field === 'name', 'ValidationError has details');

const notFoundErr = new NotFoundError('User');
assert(notFoundErr.statusCode === 404, 'NotFoundError is 404');
assert(notFoundErr.message.includes('User'), 'NotFoundError includes resource name');

const conflictErr = new ConflictError('duplicate');
assert(conflictErr.statusCode === 409, 'ConflictError is 409');

const rateErr = new RateLimitError();
assert(rateErr.statusCode === 429, 'RateLimitError is 429');

// Middleware functions
assert(typeof errHandler === 'function', 'errorHandler is a function');
assert(typeof notFound === 'function', 'notFoundHandler is a function');
assert(typeof asyncHandler === 'function', 'asyncHandler is a function');

// ═══════════════════════════════════════════════════════════════════
// 7. Security Middleware
// ═══════════════════════════════════════════════════════════════════
section('7. Security Middleware');

const {
  createSecurityMiddleware,
  createRateLimiter,
  createSecurityHeaders,
  createApiKeyValidator,
  createSanitizer
} = require('../../src/middleware/security');

assert(typeof createSecurityMiddleware === 'function', 'createSecurityMiddleware exists');
assert(typeof createRateLimiter === 'function', 'createRateLimiter exists');
assert(typeof createSecurityHeaders === 'function', 'createSecurityHeaders exists');
assert(typeof createApiKeyValidator === 'function', 'createApiKeyValidator exists');
assert(typeof createSanitizer === 'function', 'createSanitizer exists');

// Create middleware bundle
const secMiddleware = createSecurityMiddleware({
  security: {
    rateLimit: { enabled: true, max: 5, windowMs: 1000 },
    helmet: { enabled: true },
    apiKey: { enabled: false }
  }
});

assert(typeof secMiddleware.rateLimit === 'function', 'rateLimit middleware created');
assert(typeof secMiddleware.securityHeaders === 'function', 'securityHeaders middleware created');
assert(typeof secMiddleware.apiKeyValidator === 'function', 'apiKeyValidator middleware created');
assert(typeof secMiddleware.sanitizer === 'function', 'sanitizer middleware created');

// Test rate limiter
const mockReq = { ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' } };
const headers = {};
const mockRes = {
  setHeader: (k, v) => { headers[k] = v; },
  status: function(s) { this._status = s; return this; },
  json: function(d) { this._json = d; return this; },
  _status: null, _json: null
};
let nextCalled = false;
const mockNext = () => { nextCalled = true; };

secMiddleware.rateLimit(mockReq, mockRes, mockNext);
assert(nextCalled, 'Rate limiter calls next() under limit');
assert(headers['X-RateLimit-Limit'] === 5, 'Rate limit header set');
assert(headers['X-RateLimit-Remaining'] === 4, 'Remaining count decremented');

// Test security headers
const headerRes = {
  _headers: {},
  setHeader: function(k, v) { this._headers[k] = v; },
  removeHeader: function(k) { delete this._headers[k]; }
};
let headersNextCalled = false;
secMiddleware.securityHeaders({}, headerRes, () => { headersNextCalled = true; });
assert(headersNextCalled, 'Security headers calls next()');
assert(headerRes._headers['X-Content-Type-Options'] === 'nosniff', 'X-Content-Type-Options set');
assert(headerRes._headers['X-Frame-Options'] === 'DENY', 'X-Frame-Options set');

// ═══════════════════════════════════════════════════════════════════
// 8. Request Logger
// ═══════════════════════════════════════════════════════════════════
section('8. Request Logger');

const { createRequestLogger, generateRequestId } = require('../../src/middleware/request-logger');

assert(typeof createRequestLogger === 'function', 'createRequestLogger exists');
assert(typeof generateRequestId === 'function', 'generateRequestId exists');

// Test request ID generation
const id1 = generateRequestId();
const id2 = generateRequestId();
assert(id1.startsWith('req-'), 'Request ID starts with req-');
assert(id1 !== id2, 'Request IDs are unique');
assert(id1.length > 10, 'Request ID has reasonable length');

// Test middleware creation
const reqLogger = createRequestLogger({ logging: { logRequests: true, excludeHealthChecks: true } });
assert(typeof reqLogger === 'function', 'Request logger middleware is a function');

// Test health check exclusion
const healthReq = { path: '/api/v1/health', headers: {} };
const healthRes = { setHeader: () => {}, end: () => {} };
let healthNextCalled = false;
reqLogger(healthReq, healthRes, () => { healthNextCalled = true; });
assert(healthNextCalled, 'Health check requests pass through');
assert(healthReq.requestId != null, 'Request ID assigned even to excluded requests');

// Test non-health request gets request ID
const normalReq = { path: '/api/v1/query', headers: {} };
const normalRes = { setHeader: () => {}, end: function(...args) {} };
let normalNextCalled = false;
reqLogger(normalReq, normalRes, () => { normalNextCalled = true; });
assert(normalNextCalled, 'Normal requests pass through');

// ═══════════════════════════════════════════════════════════════════
// 9. Middleware Integration
// ═══════════════════════════════════════════════════════════════════
section('9. Middleware Integration');

// Verify index.js structure (by reading the source)
const fs = require('fs');
const path = require('path');
const indexSource = fs.readFileSync(path.join(__dirname, '../../index.js'), 'utf-8');

assert(indexSource.includes("require('./src/config/environment')"), 'index.js loads environment config');
assert(indexSource.includes("require('./src/utils/logger')"), 'index.js uses logger');
assert(indexSource.includes("require('./src/middleware/request-logger')"), 'index.js uses request logger');
assert(indexSource.includes("require('./src/middleware/security')"), 'index.js uses security middleware');
assert(indexSource.includes("require('./src/middleware/error-handler')"), 'index.js uses error handler');
assert(indexSource.includes('notFoundHandler'), 'index.js registers notFoundHandler');

// ═══════════════════════════════════════════════════════════════════
// 10. Graceful Shutdown
// ═══════════════════════════════════════════════════════════════════
section('10. Graceful Shutdown');

assert(typeof createShutdownHandler === 'function', 'createShutdownHandler exists');

// Test with mock server
const mockServer = { close: (cb) => cb() };
const shutdown = createShutdownHandler(mockServer, []);
assert(typeof shutdown === 'function', 'Shutdown handler is a function');
assert(indexSource.includes('createShutdownHandler'), 'index.js uses shutdown handler');
assert(indexSource.includes('SIGTERM') || indexSource.includes('shutdown'), 'Shutdown signals handled');

// ═══════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════
console.log(`\n${'='.repeat(60)}`);
console.log(`Production Configuration Tests: ${passed} passed, ${failed} failed out of ${passed + failed}`);
console.log(`${'='.repeat(60)}`);

if (failed > 0) {
  console.log('\nSome tests failed!');
  process.exit(1);
} else {
  console.log('\nAll tests passed!');
}
