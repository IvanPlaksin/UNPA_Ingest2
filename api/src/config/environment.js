/**
 * Environment Configuration Loader
 *
 * Loads environment-specific settings and merges with defaults.
 * Priority: ENV vars > environment file > defaults
 *
 * Usage:
 *   const envConfig = require('./config/environment');
 *   console.log(envConfig.server.port);
 */

const path = require('path');

const NODE_ENV = process.env.NODE_ENV || 'development';

// Load environment-specific config
let envConfig;
try {
  envConfig = require(`./environments/${NODE_ENV}`);
} catch {
  envConfig = require('./environments/development');
}

// Default configuration
const defaults = {
  env: NODE_ENV,
  server: {
    port: parseInt(process.env.PORT) || 3010,
    host: process.env.HOST || '0.0.0.0',
    apiPrefix: '/api/v1',
    trustProxy: false,
    shutdownTimeoutMs: 10000
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'pretty',
    includeTimestamp: true,
    includeRequestId: true,
    logRequests: true,
    excludeHealthChecks: true
  },
  security: {
    cors: {
      origins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*'],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true
    },
    rateLimit: {
      enabled: process.env.RATE_LIMIT_ENABLED === 'true',
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
      max: parseInt(process.env.RATE_LIMIT_MAX) || 200
    },
    helmet: {
      enabled: process.env.HELMET_ENABLED === 'true'
    },
    apiKey: {
      enabled: process.env.API_KEY_ENABLED === 'true',
      key: process.env.API_KEY || null,
      headerName: 'x-api-key'
    }
  },
  features: {
    enableWebSocket: process.env.ENABLE_WEBSOCKET !== 'false',
    enableJobQueue: process.env.ENABLE_JOB_QUEUE !== 'false',
    enableMetrics: process.env.ENABLE_METRICS !== 'false',
    enableSwagger: process.env.ENABLE_SWAGGER !== 'false'
  },
  errorHandler: {
    includeStack: NODE_ENV !== 'production',
    includeDetails: NODE_ENV !== 'production'
  }
};

/**
 * Deep merge objects (target overrides source)
 */
function deepMerge(source, target) {
  const result = { ...source };
  for (const key of Object.keys(target)) {
    if (target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
        && source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(source[key], target[key]);
    } else {
      result[key] = target[key];
    }
  }
  return result;
}

// Merge: defaults < envConfig
const config = deepMerge(defaults, envConfig);

// Override with explicit env vars (highest priority)
if (process.env.PORT) config.server.port = parseInt(process.env.PORT);
if (process.env.HOST) config.server.host = process.env.HOST;
if (process.env.LOG_LEVEL) config.logging.level = process.env.LOG_LEVEL;

module.exports = config;
