class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.aggregates = new Map();
  }

  record(toolId, metrics) {
    if (!this.metrics.has(toolId)) {
      this.metrics.set(toolId, []);
    }
    const entry = {
      timestamp: Date.now(),
      ...metrics
    };
    this.metrics.get(toolId).push(entry);
    this.updateAggregates(toolId, entry);
  }

  updateAggregates(toolId, entry) {
    if (!this.aggregates.has(toolId)) {
      this.aggregates.set(toolId, {
        count: 0,
        successCount: 0,
        failureCount: 0,
        totalDuration: 0,
        minDuration: Infinity,
        maxDuration: 0
      });
    }
    const agg = this.aggregates.get(toolId);
    agg.count++;
    if (entry.success) agg.successCount++;
    else agg.failureCount++;
    if (entry.duration) {
      agg.totalDuration += entry.duration;
      agg.minDuration = Math.min(agg.minDuration, entry.duration);
      agg.maxDuration = Math.max(agg.maxDuration, entry.duration);
    }
  }

  getToolMetrics(toolId) {
    const agg = this.aggregates.get(toolId);
    if (!agg) return null;
    return {
      ...agg,
      avgDuration: agg.count > 0 ? agg.totalDuration / agg.count : 0,
      successRate: agg.count > 0 ? agg.successCount / agg.count : 0
    };
  }

  getAllMetrics() {
    const result = {};
    for (const [toolId] of this.aggregates) {
      result[toolId] = this.getToolMetrics(toolId);
    }
    return result;
  }

  getRecentEntries(toolId, limit = 100) {
    const entries = this.metrics.get(toolId) || [];
    return entries.slice(-limit);
  }

  clear(toolId = null) {
    if (toolId) {
      this.metrics.delete(toolId);
      this.aggregates.delete(toolId);
    } else {
      this.metrics.clear();
      this.aggregates.clear();
    }
  }
}

module.exports = { MetricsCollector };
