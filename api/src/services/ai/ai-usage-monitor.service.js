/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI USAGE MONITOR SERVICE
 * Logging, rate limiting, quota tracking, and cost estimation for AI APIs
 *
 * Features:
 * - Request/response logging with tool calls
 * - Rate limiting per provider
 * - Token usage tracking
 * - Cost estimation
 * - Quota alerts
 * ═══════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ────────────────────────────────────────────────────────────────────────────
// CONFIGURATION
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  // Logging
  logDir: process.env.AI_LOG_DIR || path.join(process.cwd(), 'logs', 'ai'),
  logLevel: process.env.AI_LOG_LEVEL || 'info', // debug, info, warn, error
  logRetentionDays: 30,

  // Rate limits (requests per minute)
  rateLimits: {
    gemini: parseInt(process.env.GEMINI_RPM_LIMIT) || 60,
    anthropic: parseInt(process.env.ANTHROPIC_RPM_LIMIT) || 50,
    ollama: parseInt(process.env.OLLAMA_RPM_LIMIT) || 100,
  },

  // Token limits per day
  dailyTokenLimits: {
    gemini: parseInt(process.env.GEMINI_DAILY_TOKENS) || 1000000,
    anthropic: parseInt(process.env.ANTHROPIC_DAILY_TOKENS) || 500000,
    ollama: parseInt(process.env.OLLAMA_DAILY_TOKENS) || Infinity,
  },

  // Cost per 1K tokens (USD)
  tokenCosts: {
    gemini: {
      input: 0.00025,  // Gemini Pro pricing
      output: 0.0005,
    },
    anthropic: {
      // Claude 4.5 pricing
      'claude-opus-4-5-20251101': { input: 0.015, output: 0.075 },
      'claude-sonnet-4-5-20250929': { input: 0.003, output: 0.015 },
      'claude-haiku-4-5-20251001': { input: 0.0008, output: 0.004 },
      default: { input: 0.003, output: 0.015 },
    },
    ollama: {
      input: 0,
      output: 0,
    },
  },

  // Alert thresholds (percentage of daily limit)
  alertThresholds: {
    warning: 0.7,   // 70%
    critical: 0.9,  // 90%
  },

  // Budget limits (USD per day)
  dailyBudgetLimits: {
    gemini: parseFloat(process.env.GEMINI_DAILY_BUDGET) || 10,
    anthropic: parseFloat(process.env.ANTHROPIC_DAILY_BUDGET) || 20,
  },
};

// ────────────────────────────────────────────────────────────────────────────
// USAGE TRACKER
// ────────────────────────────────────────────────────────────────────────────

/**
 * Tracks API usage per provider
 */
class UsageTracker {
  constructor() {
    this.usage = new Map();
    this.resetDaily();
  }

  resetDaily() {
    const today = new Date().toISOString().split('T')[0];
    if (this.currentDate !== today) {
      this.currentDate = today;
      this.usage.clear();
    }
  }

  getProviderUsage(provider) {
    this.resetDaily();
    if (!this.usage.has(provider)) {
      this.usage.set(provider, {
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
        errors: 0,
        cost: 0,
        lastRequest: null,
        requestTimestamps: [],
      });
    }
    return this.usage.get(provider);
  }

  recordRequest(provider, data) {
    const usage = this.getProviderUsage(provider);
    usage.requests++;
    usage.inputTokens += data.inputTokens || 0;
    usage.outputTokens += data.outputTokens || 0;
    usage.totalTokens += (data.inputTokens || 0) + (data.outputTokens || 0);
    usage.toolCalls += data.toolCalls || 0;
    usage.cost += data.cost || 0;
    usage.lastRequest = new Date().toISOString();
    usage.requestTimestamps.push(Date.now());

    // Keep only last minute of timestamps for rate limiting
    const oneMinuteAgo = Date.now() - 60000;
    usage.requestTimestamps = usage.requestTimestamps.filter(ts => ts > oneMinuteAgo);
  }

  recordError(provider) {
    const usage = this.getProviderUsage(provider);
    usage.errors++;
  }

  getRequestsPerMinute(provider) {
    const usage = this.getProviderUsage(provider);
    const oneMinuteAgo = Date.now() - 60000;
    return usage.requestTimestamps.filter(ts => ts > oneMinuteAgo).length;
  }

  getAllUsage() {
    this.resetDaily();
    const result = {};
    for (const [provider, usage] of this.usage) {
      result[provider] = { ...usage };
    }
    return result;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AI USAGE MONITOR
// ────────────────────────────────────────────────────────────────────────────

class AIUsageMonitor extends EventEmitter {
  constructor(config = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tracker = new UsageTracker();
    this.logStream = null;
    this.currentLogFile = null;

    this._initLogDir();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ══════════════════════════════════════════════════════════════════════════

  _initLogDir() {
    try {
      if (!fs.existsSync(this.config.logDir)) {
        fs.mkdirSync(this.config.logDir, { recursive: true });
      }
    } catch (err) {
      console.error('[AIUsageMonitor] Failed to create log directory:', err.message);
    }
  }

  _getLogFilePath() {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.config.logDir, `ai-interactions-${date}.jsonl`);
  }

  _ensureLogStream() {
    const logFile = this._getLogFilePath();
    if (this.currentLogFile !== logFile) {
      if (this.logStream) {
        this.logStream.end();
      }
      this.currentLogFile = logFile;
      this.logStream = fs.createWriteStream(logFile, { flags: 'a' });
    }
    return this.logStream;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RATE LIMITING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Check if request is allowed under rate limits
   * @param {string} provider - Provider ID
   * @returns {{ allowed: boolean, waitMs?: number, reason?: string }}
   */
  checkRateLimit(provider) {
    const limit = this.config.rateLimits[provider] || 60;
    const currentRPM = this.tracker.getRequestsPerMinute(provider);

    if (currentRPM >= limit) {
      const oldestTimestamp = this.tracker.getProviderUsage(provider).requestTimestamps[0];
      const waitMs = oldestTimestamp ? (oldestTimestamp + 60000) - Date.now() : 1000;

      return {
        allowed: false,
        waitMs: Math.max(waitMs, 100),
        reason: `Rate limit exceeded: ${currentRPM}/${limit} RPM`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check if request is allowed under daily token limits
   * @param {string} provider - Provider ID
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkTokenLimit(provider) {
    const limit = this.config.dailyTokenLimits[provider] || Infinity;
    const usage = this.tracker.getProviderUsage(provider);

    if (usage.totalTokens >= limit) {
      return {
        allowed: false,
        reason: `Daily token limit exceeded: ${usage.totalTokens}/${limit}`,
      };
    }

    // Check alert thresholds
    const percentage = usage.totalTokens / limit;
    if (percentage >= this.config.alertThresholds.critical) {
      this.emit('alert', {
        level: 'critical',
        provider,
        message: `Token usage at ${(percentage * 100).toFixed(1)}% of daily limit`,
        usage: usage.totalTokens,
        limit,
      });
    } else if (percentage >= this.config.alertThresholds.warning) {
      this.emit('alert', {
        level: 'warning',
        provider,
        message: `Token usage at ${(percentage * 100).toFixed(1)}% of daily limit`,
        usage: usage.totalTokens,
        limit,
      });
    }

    return { allowed: true };
  }

  /**
   * Check if request is allowed under budget limits
   * @param {string} provider - Provider ID
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkBudgetLimit(provider) {
    const limit = this.config.dailyBudgetLimits[provider];
    if (!limit) return { allowed: true };

    const usage = this.tracker.getProviderUsage(provider);

    if (usage.cost >= limit) {
      return {
        allowed: false,
        reason: `Daily budget exceeded: $${usage.cost.toFixed(4)}/$${limit}`,
      };
    }

    // Check alert thresholds
    const percentage = usage.cost / limit;
    if (percentage >= this.config.alertThresholds.critical) {
      this.emit('alert', {
        level: 'critical',
        provider,
        message: `Budget usage at ${(percentage * 100).toFixed(1)}% ($${usage.cost.toFixed(4)}/$${limit})`,
        cost: usage.cost,
        limit,
      });
    } else if (percentage >= this.config.alertThresholds.warning) {
      this.emit('alert', {
        level: 'warning',
        provider,
        message: `Budget usage at ${(percentage * 100).toFixed(1)}% ($${usage.cost.toFixed(4)}/$${limit})`,
        cost: usage.cost,
        limit,
      });
    }

    return { allowed: true };
  }

  /**
   * Full pre-request check
   * @param {string} provider - Provider ID
   * @returns {{ allowed: boolean, waitMs?: number, reason?: string }}
   */
  canMakeRequest(provider) {
    // Check rate limit
    const rateCheck = this.checkRateLimit(provider);
    if (!rateCheck.allowed) return rateCheck;

    // Check token limit
    const tokenCheck = this.checkTokenLimit(provider);
    if (!tokenCheck.allowed) return tokenCheck;

    // Check budget limit
    const budgetCheck = this.checkBudgetLimit(provider);
    if (!budgetCheck.allowed) return budgetCheck;

    return { allowed: true };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // COST ESTIMATION
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Estimate cost for a request
   * @param {string} provider - Provider ID
   * @param {string} modelId - Model ID
   * @param {number} inputTokens - Input token count
   * @param {number} outputTokens - Output token count
   * @returns {number} Estimated cost in USD
   */
  estimateCost(provider, modelId, inputTokens, outputTokens) {
    const providerCosts = this.config.tokenCosts[provider];
    if (!providerCosts) return 0;

    let costs;
    if (provider === 'anthropic' && providerCosts[modelId]) {
      costs = providerCosts[modelId];
    } else if (providerCosts.input !== undefined) {
      costs = providerCosts;
    } else {
      costs = providerCosts.default || { input: 0, output: 0 };
    }

    const inputCost = (inputTokens / 1000) * costs.input;
    const outputCost = (outputTokens / 1000) * costs.output;

    return inputCost + outputCost;
  }

  /**
   * Estimate token count from text
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough estimation: ~4 characters per token for English
    // More accurate would require a tokenizer
    return Math.ceil(text.length / 4);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOGGING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Log an AI interaction
   * @param {Object} entry - Log entry
   */
  log(entry) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      ...entry,
    };

    // Console log based on level
    const level = entry.level || 'info';
    if (this._shouldLog(level)) {
      const prefix = `[AI:${entry.provider || 'unknown'}]`;
      if (level === 'error') {
        console.error(prefix, entry.event, entry.error || '');
      } else if (level === 'warn') {
        console.warn(prefix, entry.event, entry.message || '');
      } else if (level === 'debug') {
        console.log(prefix, entry.event, JSON.stringify(entry.data || {}).substring(0, 200));
      } else {
        console.log(prefix, entry.event, entry.message || '');
      }
    }

    // Write to log file
    try {
      const stream = this._ensureLogStream();
      stream.write(JSON.stringify(logEntry) + '\n');
    } catch (err) {
      console.error('[AIUsageMonitor] Failed to write log:', err.message);
    }

    this.emit('log', logEntry);
  }

  _shouldLog(level) {
    const levels = ['debug', 'info', 'warn', 'error'];
    const configLevel = levels.indexOf(this.config.logLevel);
    const entryLevel = levels.indexOf(level);
    return entryLevel >= configLevel;
  }

  /**
   * Log a request start
   */
  logRequestStart(data) {
    this.log({
      event: 'request_start',
      level: 'info',
      provider: data.provider,
      modelId: data.modelId,
      sessionId: data.sessionId,
      messageCount: data.messageCount,
      hasTools: data.hasTools,
      toolCount: data.toolCount,
      estimatedInputTokens: data.estimatedInputTokens,
    });
  }

  /**
   * Log a request completion
   */
  logRequestComplete(data) {
    // Calculate cost
    const cost = this.estimateCost(
      data.provider,
      data.modelId,
      data.inputTokens || 0,
      data.outputTokens || 0
    );

    // Record usage
    this.tracker.recordRequest(data.provider, {
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      toolCalls: data.toolCalls?.length || 0,
      cost,
    });

    this.log({
      event: 'request_complete',
      level: 'info',
      provider: data.provider,
      modelId: data.modelId,
      sessionId: data.sessionId,
      durationMs: data.durationMs,
      inputTokens: data.inputTokens,
      outputTokens: data.outputTokens,
      totalTokens: (data.inputTokens || 0) + (data.outputTokens || 0),
      toolCalls: data.toolCalls?.map(tc => tc.function?.name || tc.tool) || [],
      hasContent: !!data.content,
      cost: cost.toFixed(6),
    });

    // Check limits after request
    this.checkTokenLimit(data.provider);
    this.checkBudgetLimit(data.provider);
  }

  /**
   * Log a request error
   */
  logRequestError(data) {
    this.tracker.recordError(data.provider);

    this.log({
      event: 'request_error',
      level: 'error',
      provider: data.provider,
      modelId: data.modelId,
      sessionId: data.sessionId,
      error: data.error?.message || data.error,
      errorCode: data.error?.code,
      durationMs: data.durationMs,
    });
  }

  /**
   * Log a tool execution
   */
  logToolExecution(data) {
    this.log({
      event: 'tool_execution',
      level: 'debug',
      provider: data.provider,
      sessionId: data.sessionId,
      toolName: data.toolName,
      args: data.args,
      success: data.success,
      resultSummary: data.resultSummary,
      durationMs: data.durationMs,
    });
  }

  /**
   * Log rate limit hit
   */
  logRateLimitHit(data) {
    this.log({
      event: 'rate_limit_hit',
      level: 'warn',
      provider: data.provider,
      currentRPM: data.currentRPM,
      limit: data.limit,
      waitMs: data.waitMs,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // USAGE REPORTING
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Get current usage statistics
   * @returns {Object} Usage stats by provider
   */
  getUsageStats() {
    const allUsage = this.tracker.getAllUsage();
    const stats = {};

    for (const [provider, usage] of Object.entries(allUsage)) {
      const tokenLimit = this.config.dailyTokenLimits[provider] || Infinity;
      const budgetLimit = this.config.dailyBudgetLimits[provider] || null;

      stats[provider] = {
        requests: usage.requests,
        errors: usage.errors,
        errorRate: usage.requests > 0 ? (usage.errors / usage.requests * 100).toFixed(2) + '%' : '0%',
        tokens: {
          input: usage.inputTokens,
          output: usage.outputTokens,
          total: usage.totalTokens,
          limit: tokenLimit === Infinity ? 'unlimited' : tokenLimit,
          percentUsed: tokenLimit === Infinity ? 0 : ((usage.totalTokens / tokenLimit) * 100).toFixed(2),
        },
        cost: {
          total: '$' + usage.cost.toFixed(4),
          limit: budgetLimit ? '$' + budgetLimit : 'unlimited',
          percentUsed: budgetLimit ? ((usage.cost / budgetLimit) * 100).toFixed(2) : 0,
        },
        toolCalls: usage.toolCalls,
        lastRequest: usage.lastRequest,
        currentRPM: this.tracker.getRequestsPerMinute(provider),
        rpmLimit: this.config.rateLimits[provider],
      };
    }

    return {
      date: new Date().toISOString().split('T')[0],
      providers: stats,
    };
  }

  /**
   * Get usage summary for display
   */
  getUsageSummary() {
    const stats = this.getUsageStats();
    const lines = [];

    lines.push(`\n══════════════════════════════════════════════════════════════`);
    lines.push(`  AI API USAGE SUMMARY - ${stats.date}`);
    lines.push(`══════════════════════════════════════════════════════════════`);

    for (const [provider, data] of Object.entries(stats.providers)) {
      lines.push(`\n  ${provider.toUpperCase()}`);
      lines.push(`  ─────────────────────────────────────────────`);
      lines.push(`  Requests: ${data.requests} (${data.errorRate} errors)`);
      lines.push(`  Tokens: ${data.tokens.total} / ${data.tokens.limit} (${data.tokens.percentUsed}%)`);
      lines.push(`  Cost: ${data.cost.total} / ${data.cost.limit} (${data.cost.percentUsed}%)`);
      lines.push(`  Tool Calls: ${data.toolCalls}`);
      lines.push(`  Current RPM: ${data.currentRPM} / ${data.rpmLimit}`);
    }

    lines.push(`\n══════════════════════════════════════════════════════════════\n`);

    return lines.join('\n');
  }

  /**
   * Clean up old log files
   */
  async cleanupOldLogs() {
    const retentionMs = this.config.logRetentionDays * 24 * 60 * 60 * 1000;
    const cutoffDate = Date.now() - retentionMs;

    try {
      const files = fs.readdirSync(this.config.logDir);
      let cleaned = 0;

      for (const file of files) {
        if (!file.startsWith('ai-interactions-')) continue;

        const filePath = path.join(this.config.logDir, file);
        const stats = fs.statSync(filePath);

        if (stats.mtimeMs < cutoffDate) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      }

      if (cleaned > 0) {
        this.log({
          event: 'logs_cleanup',
          level: 'info',
          filesRemoved: cleaned,
        });
      }
    } catch (err) {
      console.error('[AIUsageMonitor] Failed to cleanup old logs:', err.message);
    }
  }

  /**
   * Close log stream
   */
  close() {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SINGLETON INSTANCE
// ────────────────────────────────────────────────────────────────────────────

let monitorInstance = null;

function getAIUsageMonitor(config = {}) {
  if (!monitorInstance) {
    monitorInstance = new AIUsageMonitor(config);
  }
  return monitorInstance;
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

module.exports = {
  AIUsageMonitor,
  UsageTracker,
  getAIUsageMonitor,
  DEFAULT_CONFIG,
};
