/**
 * Global Error Handler Middleware
 *
 * Catches all unhandled errors and returns consistent JSON responses.
 * Configured via environment settings (stack traces, details).
 *
 * Usage:
 *   const { errorHandler, notFoundHandler } = require('./middleware/error-handler');
 *   // ... register all routes ...
 *   app.use(notFoundHandler);
 *   app.use(errorHandler);
 */

const logger = require('../utils/logger').child('ErrorHandler');

/**
 * Custom application errors
 */
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class ValidationError extends AppError {
  constructor(message, details) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

class ConflictError extends AppError {
  constructor(message) {
    super(message, 409, 'CONFLICT');
  }
}

class RateLimitError extends AppError {
  constructor() {
    super('Too many requests', 429, 'RATE_LIMIT_EXCEEDED');
  }
}

/**
 * Not Found handler — catches unmatched routes
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      statusCode: 404
    }
  });
}

/**
 * Global error handler middleware
 */
function errorHandler(err, req, res, _next) {
  // Default values
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'An unexpected error occurred';

  // Specific error type handling
  if (err.name === 'SyntaxError' && err.status === 400) {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Invalid JSON in request body';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body too large';
  } else if (err.name === 'MulterError') {
    statusCode = 400;
    code = 'FILE_UPLOAD_ERROR';
    message = err.message;
  }

  // Log error
  const logData = {
    statusCode,
    code,
    method: req.method,
    path: req.path,
    requestId: req.requestId
  };

  if (statusCode >= 500) {
    logger.error(message, { ...logData, stack: err.stack });
  } else {
    logger.warn(message, logData);
  }

  // Build response
  const config = getConfig();
  const response = {
    success: false,
    error: {
      code,
      message: statusCode >= 500 && !config.includeDetails ? 'Internal server error' : message,
      statusCode
    }
  };

  if (config.includeDetails && err.details) {
    response.error.details = err.details;
  }

  if (config.includeStack && err.stack) {
    response.error.stack = err.stack.split('\n').slice(0, 5);
  }

  res.status(statusCode).json(response);
}

/**
 * Get error handler config from environment
 */
function getConfig() {
  try {
    const envConfig = require('../config/environment');
    return envConfig.errorHandler || { includeStack: true, includeDetails: true };
  } catch {
    return {
      includeStack: process.env.NODE_ENV !== 'production',
      includeDetails: process.env.NODE_ENV !== 'production'
    };
  }
}

/**
 * Async route wrapper — catches async errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Graceful shutdown handler
 */
function createShutdownHandler(server, cleanup = []) {
  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Run cleanup functions
    for (const fn of cleanup) {
      try {
        await fn();
      } catch (err) {
        logger.error('Cleanup error', { error: err.message });
      }
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return shutdown;
}

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  createShutdownHandler,
  AppError,
  ValidationError,
  NotFoundError,
  ConflictError,
  RateLimitError
};
