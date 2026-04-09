/**
 * Structured Logger Utility
 *
 * Provides consistent logging with:
 * - Log levels: debug, info, warn, error
 * - JSON or pretty format
 * - Timestamps
 * - Context (request ID, module name)
 *
 * Usage:
 *   const logger = require('./utils/logger');
 *   logger.info('Server started', { port: 3010 });
 *   logger.error('Failed to connect', { error: err.message });
 *
 *   const childLogger = logger.child('MyModule');
 *   childLogger.info('Module initialized');
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LEVEL_COLORS = { debug: '\x1b[36m', info: '\x1b[32m', warn: '\x1b[33m', error: '\x1b[31m' };
const RESET = '\x1b[0m';

class Logger {
  constructor(options = {}) {
    this.level = options.level || process.env.LOG_LEVEL || 'info';
    this.format = options.format || process.env.LOG_FORMAT || 'pretty';
    this.includeTimestamp = options.includeTimestamp !== false;
    this.module = options.module || null;
    this.context = options.context || {};
  }

  /**
   * Create a child logger with additional context
   */
  child(moduleOrContext) {
    const opts = {
      level: this.level,
      format: this.format,
      includeTimestamp: this.includeTimestamp,
      context: { ...this.context }
    };
    if (typeof moduleOrContext === 'string') {
      opts.module = moduleOrContext;
    } else if (typeof moduleOrContext === 'object') {
      Object.assign(opts.context, moduleOrContext);
    }
    return new Logger(opts);
  }

  debug(message, data) { this._log('debug', message, data); }
  info(message, data) { this._log('info', message, data); }
  warn(message, data) { this._log('warn', message, data); }
  error(message, data) { this._log('error', message, data); }

  _log(level, message, data) {
    if (LEVELS[level] < LEVELS[this.level]) return;

    const safeData = data && typeof data === 'object' ? this._redact(data) : (data != null ? { data } : {});

    const entry = {
      level,
      message,
      ...(this.module && { module: this.module }),
      ...(this.includeTimestamp && { timestamp: new Date().toISOString() }),
      ...this.context,
      ...safeData
    };

    const output = this.format === 'json' ? this._formatJson(entry) : this._formatPretty(entry);
    const stream = level === 'error' ? process.stderr : process.stdout;
    stream.write(output + '\n');
  }

  _formatJson(entry) {
    return JSON.stringify(entry);
  }

  _formatPretty(entry) {
    const color = LEVEL_COLORS[entry.level] || '';
    const parts = [];

    if (entry.timestamp) parts.push(`${entry.timestamp}`);
    parts.push(`${color}${entry.level.toUpperCase().padEnd(5)}${RESET}`);
    if (entry.module) parts.push(`[${entry.module}]`);
    parts.push(entry.message);

    // Add extra data
    const extra = { ...entry };
    delete extra.level; delete extra.message; delete extra.timestamp; delete extra.module;
    if (Object.keys(extra).length > 0) {
      parts.push(JSON.stringify(extra));
    }

    return parts.join(' ');
  }

  /**
   * Log with automatic redaction of sensitive fields.
   */
  _redact(data) {
    if (!data || typeof data !== 'object') return data;
    const SENSITIVE = /password|secret|token|apiKey|authorization|cookie|credential/i;
    const redacted = {};
    for (const [key, value] of Object.entries(data)) {
      if (SENSITIVE.test(key)) {
        redacted[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        redacted[key] = this._redact(value);
      } else {
        redacted[key] = value;
      }
    }
    return redacted;
  }

  /**
   * Log with request context (requestId, userId, workspaceId).
   */
  withRequest(req) {
    return this.child({
      requestId: req?.requestId || req?.headers?.['x-request-id'] || undefined,
      userId: req?.user?.id || req?.headers?.['x-user-id'] || undefined,
      workspaceId: req?.params?.id || req?.body?.workspaceId || undefined
    });
  }
}

// Singleton instance
const logger = new Logger();

// Domain-specific child loggers (PH-005)
logger.workspace = logger.child('Workspace');
logger.catalog = logger.child('Catalog');
logger.agent = logger.child('Agent');
logger.security = logger.child('Security');
logger.extraction = logger.child('Extraction');
logger.promotion = logger.child('Promotion');

module.exports = logger;
