/**
 * Metrics Service — Observability for Codex, Agents, and BackLog.
 *
 * In-memory rolling window metrics with optional Redis persistence.
 * Singleton — import and use directly.
 */

class MetricsService {
  constructor() {
    this._counters = {};     // name → count
    this._histograms = {};   // name → [{ value, ts }]
    this._topK = {};         // name → { key → count }
    this._timeseries = {};   // name → [{ value, ts }]
    this._windowMs = 24 * 60 * 60 * 1000; // 24h rolling window
    this._startedAt = Date.now();

    // Periodic cleanup every 10 minutes
    this._cleanupInterval = setInterval(() => this._cleanup(), 10 * 60 * 1000);
  }

  // ============================================================
  // RECORDING
  // ============================================================

  /** Increment a counter */
  increment(name, amount = 1) {
    this._counters[name] = (this._counters[name] || 0) + amount;
    this._appendTimeseries(name, amount);
  }

  /** Record a value (e.g., duration, token count) */
  recordValue(name, value) {
    if (!this._histograms[name]) this._histograms[name] = [];
    this._histograms[name].push({ value, ts: Date.now() });
  }

  /** Record a ranked item (e.g., top rules, top tools) */
  recordRanked(name, key) {
    if (!this._topK[name]) this._topK[name] = {};
    this._topK[name][key] = (this._topK[name][key] || 0) + 1;
  }

  /** Convenience: record a Codex search */
  recordCodexSearch(scope, keywords) {
    this.increment('codex.search.count');
    if (scope) this.recordRanked('codex.search.by_scope', String(scope));
    if (keywords) this.recordRanked('codex.search.by_keyword', keywords.substring(0, 50));
  }

  /** Convenience: record a Codex rule access */
  recordCodexRuleAccess(codexId) {
    this.increment('codex.rule.access.count');
    this.recordRanked('codex.rule.access.by_id', codexId);
  }

  /** Convenience: record a tool call */
  recordToolCall(toolName, durationMs) {
    this.increment('agent.tool.calls.count');
    this.recordRanked('agent.tool.calls.by_name', toolName);
    if (durationMs != null) this.recordValue('agent.tool.calls.duration', durationMs);
  }

  /** Convenience: record prompt token usage */
  recordPromptTokens(agentType, tokenCount) {
    this.increment('agent.tokens.total', tokenCount);
    this.recordValue('agent.tokens.prompt', tokenCount);
    this.recordRanked('agent.tokens.by_type', agentType);
  }

  /** Convenience: record cache hit/miss */
  recordCacheResult(hit) {
    this.increment(hit ? 'codex.cache.hits' : 'codex.cache.misses');
  }

  /** Convenience: record agent session */
  recordSession(agentType, durationMs) {
    this.increment('agent.session.count');
    this.recordRanked('agent.session.by_type', agentType);
    if (durationMs != null) this.recordValue('agent.session.duration', durationMs);
  }

  // ============================================================
  // QUERYING
  // ============================================================

  /** Get counter value */
  getCounter(name) {
    return this._counters[name] || 0;
  }

  /** Get histogram stats (avg, min, max, p95, count) */
  getHistogramStats(name) {
    const data = (this._histograms[name] || [])
      .filter(d => Date.now() - d.ts < this._windowMs);
    if (!data.length) return { count: 0, avg: 0, min: 0, max: 0, p95: 0 };

    const values = data.map(d => d.value).sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      count: values.length,
      avg: Math.round(sum / values.length),
      min: values[0],
      max: values[values.length - 1],
      p95: values[Math.floor(values.length * 0.95)] || values[values.length - 1]
    };
  }

  /** Get top-K ranked items */
  getTopK(name, k = 10) {
    const map = this._topK[name] || {};
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([key, count]) => ({ key, count }));
  }

  /** Get timeseries (bucketed by hour) */
  getTimeseries(name, bucketMs = 60 * 60 * 1000) {
    const data = this._timeseries[name] || [];
    const now = Date.now();
    const cutoff = now - this._windowMs;
    const buckets = {};

    for (const { value, ts } of data) {
      if (ts < cutoff) continue;
      const bucketKey = Math.floor(ts / bucketMs) * bucketMs;
      buckets[bucketKey] = (buckets[bucketKey] || 0) + value;
    }

    return Object.entries(buckets)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([ts, value]) => ({
        time: new Date(Number(ts)).toISOString(),
        value
      }));
  }

  // ============================================================
  // AGGREGATED VIEWS
  // ============================================================

  /** Codex usage summary */
  getCodexMetrics() {
    return {
      searchCount: this.getCounter('codex.search.count'),
      ruleAccessCount: this.getCounter('codex.rule.access.count'),
      cacheHits: this.getCounter('codex.cache.hits'),
      cacheMisses: this.getCounter('codex.cache.misses'),
      cacheHitRate: this._hitRate('codex.cache.hits', 'codex.cache.misses'),
      topRules: this.getTopK('codex.rule.access.by_id', 10),
      topScopes: this.getTopK('codex.search.by_scope', 10),
      topKeywords: this.getTopK('codex.search.by_keyword', 10),
      searchTimeseries: this.getTimeseries('codex.search.count')
    };
  }

  /** Agent activity summary */
  getAgentMetrics() {
    return {
      totalToolCalls: this.getCounter('agent.tool.calls.count'),
      totalSessions: this.getCounter('agent.session.count'),
      totalTokens: this.getCounter('agent.tokens.total'),
      toolCallDuration: this.getHistogramStats('agent.tool.calls.duration'),
      promptTokens: this.getHistogramStats('agent.tokens.prompt'),
      sessionDuration: this.getHistogramStats('agent.session.duration'),
      topTools: this.getTopK('agent.tool.calls.by_name', 15),
      sessionsByType: this.getTopK('agent.session.by_type', 10),
      toolCallTimeseries: this.getTimeseries('agent.tool.calls.count')
    };
  }

  /** Full dashboard summary */
  getSummary() {
    const uptimeMs = Date.now() - this._startedAt;
    return {
      uptime: {
        ms: uptimeMs,
        hours: Math.round(uptimeMs / 3600000 * 10) / 10,
        since: new Date(this._startedAt).toISOString()
      },
      codex: this.getCodexMetrics(),
      agents: this.getAgentMetrics(),
      counters: { ...this._counters }
    };
  }

  /** Reset all metrics */
  reset() {
    this._counters = {};
    this._histograms = {};
    this._topK = {};
    this._timeseries = {};
    this._startedAt = Date.now();
  }

  // ============================================================
  // INTERNAL
  // ============================================================

  _appendTimeseries(name, value) {
    if (!this._timeseries[name]) this._timeseries[name] = [];
    this._timeseries[name].push({ value, ts: Date.now() });
  }

  _hitRate(hitKey, missKey) {
    const hits = this._counters[hitKey] || 0;
    const misses = this._counters[missKey] || 0;
    const total = hits + misses;
    return total === 0 ? 0 : Math.round((hits / total) * 100);
  }

  _cleanup() {
    const cutoff = Date.now() - this._windowMs;
    for (const name of Object.keys(this._histograms)) {
      this._histograms[name] = this._histograms[name].filter(d => d.ts >= cutoff);
    }
    for (const name of Object.keys(this._timeseries)) {
      this._timeseries[name] = this._timeseries[name].filter(d => d.ts >= cutoff);
    }
  }

  destroy() {
    if (this._cleanupInterval) clearInterval(this._cleanupInterval);
  }
}

module.exports = new MetricsService();
