/**
 * Development environment configuration
 */
module.exports = {
  server: {
    port: 3010,
    host: '0.0.0.0',
    trustProxy: false
  },
  logging: {
    level: 'debug',
    format: 'pretty',
    includeTimestamp: true,
    includeRequestId: true,
    logRequests: true,
    excludeHealthChecks: false
  },
  security: {
    cors: {
      origins: ['*'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true
    },
    rateLimit: {
      enabled: false,
      windowMs: 60000,
      max: 1000
    },
    helmet: {
      enabled: false
    }
  },
  features: {
    enableWebSocket: true,
    enableJobQueue: true,
    enableMetrics: true,
    enableSwagger: true
  },
  errorHandler: {
    includeStack: true,
    includeDetails: true
  }
};
