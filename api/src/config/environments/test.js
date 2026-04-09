/**
 * Test environment configuration
 */
module.exports = {
  server: {
    port: 3099,
    host: '127.0.0.1',
    trustProxy: false
  },
  logging: {
    level: 'warn',
    format: 'pretty',
    includeTimestamp: false,
    includeRequestId: false,
    logRequests: false,
    excludeHealthChecks: true
  },
  security: {
    cors: {
      origins: ['*'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: false
    },
    rateLimit: {
      enabled: false,
      windowMs: 60000,
      max: 10000
    },
    helmet: {
      enabled: false
    }
  },
  features: {
    enableWebSocket: false,
    enableJobQueue: false,
    enableMetrics: false,
    enableSwagger: true
  },
  errorHandler: {
    includeStack: true,
    includeDetails: true
  }
};
