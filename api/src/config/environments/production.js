/**
 * Production environment configuration
 */
module.exports = {
  server: {
    port: parseInt(process.env.PORT) || 3010,
    host: '0.0.0.0',
    trustProxy: true
  },
  logging: {
    level: 'info',
    format: 'json',
    includeTimestamp: true,
    includeRequestId: true,
    logRequests: true,
    excludeHealthChecks: true
  },
  security: {
    cors: {
      origins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      credentials: true
    },
    rateLimit: {
      enabled: true,
      windowMs: 60000,
      max: 200
    },
    helmet: {
      enabled: true
    }
  },
  features: {
    enableWebSocket: true,
    enableJobQueue: true,
    enableMetrics: true,
    enableSwagger: process.env.ENABLE_SWAGGER !== 'false'
  },
  errorHandler: {
    includeStack: false,
    includeDetails: false
  }
};
