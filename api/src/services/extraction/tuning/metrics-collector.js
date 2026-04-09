/**
 * @fileoverview Metrics Collector for Pipeline Evaluation
 * @module services/extraction/tuning/metrics-collector
 * @version 1.0.0
 *
 * Collects and aggregates metrics from pipeline runs for tuning evaluation.
 */

'use strict';

/**
 * Metrics types
 */
const METRIC_TYPES = {
  ENTITY_COVERAGE: 'entityCoverage',
  RELATIONSHIP_QUALITY: 'relationshipQuality',
  PRECISION: 'precision',
  RECALL: 'recall',
  F1_SCORE: 'f1_score',
  PROCESSING_TIME: 'processingTime',
  CONFIDENCE_DISTRIBUTION: 'confidenceDistribution'
};

/**
 * Metrics Collector
 * @class
 */
class MetricsCollector {
  constructor() {
    this.metrics = new Map();
    this.runHistory = [];
    this.maxHistorySize = 1000;
  }

  /**
   * Record metrics from a pipeline run
   * @param {string} runId - Run identifier
   * @param {Object} result - Pipeline result
   * @param {Object} groundTruth - Expected results (optional)
   * @returns {Object} Computed metrics
   */
  record(runId, result, groundTruth = null) {
    const metrics = this.computeMetrics(result, groundTruth);

    const entry = {
      runId,
      timestamp: new Date().toISOString(),
      metrics,
      result: this._summarizeResult(result)
    };

    this.runHistory.push(entry);

    // Trim history if needed
    if (this.runHistory.length > this.maxHistorySize) {
      this.runHistory.shift();
    }

    // Update aggregate metrics
    this._updateAggregates(metrics);

    return metrics;
  }

  /**
   * Compute metrics from pipeline result
   * @param {Object} result - Pipeline result
   * @param {Object} groundTruth - Expected results
   * @returns {Object} Computed metrics
   */
  computeMetrics(result, groundTruth = null) {
    const metrics = {};

    // Entity metrics
    if (result.entities) {
      metrics.entityCount = result.entities.length;
      metrics.entityConfidenceStats = this._computeConfidenceStats(result.entities);

      if (groundTruth?.entities) {
        const entityMetrics = this._computePrecisionRecall(
          result.entities,
          groundTruth.entities,
          e => e.normalizedForm || e.name.toLowerCase()
        );
        metrics.entityPrecision = entityMetrics.precision;
        metrics.entityRecall = entityMetrics.recall;
        metrics.entityF1 = entityMetrics.f1;
        metrics.entityCoverage = entityMetrics.recall;
      }
    }

    // Relationship metrics
    if (result.relationships) {
      metrics.relationshipCount = result.relationships.length;
      metrics.relationshipConfidenceStats = this._computeConfidenceStats(result.relationships);

      if (groundTruth?.relationships) {
        const relMetrics = this._computePrecisionRecall(
          result.relationships,
          groundTruth.relationships,
          r => `${r.source}|${r.target}|${r.type}`
        );
        metrics.relationshipPrecision = relMetrics.precision;
        metrics.relationshipRecall = relMetrics.recall;
        metrics.relationshipF1 = relMetrics.f1;
        metrics.relationshipQuality = relMetrics.f1;
      }
    }

    // Timing metrics
    if (result.timing) {
      metrics.processingTime = result.timing.total || 0;
      metrics.timingBreakdown = result.timing;
    }

    // Graph metrics
    if (result.graph) {
      metrics.nodeCount = result.graph.nodes?.length || 0;
      metrics.edgeCount = result.graph.edges?.length || 0;
      metrics.graphDensity = this._computeGraphDensity(result.graph);
    }

    // Source distribution
    if (result.entities) {
      metrics.sourceDistribution = this._computeSourceDistribution(result.entities);
    }

    // Type distribution
    if (result.entities) {
      metrics.typeDistribution = this._computeTypeDistribution(result.entities);
    }

    // Overall scores
    metrics.precision = (metrics.entityPrecision || 0) * 0.6 + (metrics.relationshipPrecision || 0) * 0.4;
    metrics.recall = (metrics.entityRecall || 0) * 0.6 + (metrics.relationshipRecall || 0) * 0.4;
    metrics.f1_score = metrics.precision + metrics.recall > 0
      ? 2 * (metrics.precision * metrics.recall) / (metrics.precision + metrics.recall)
      : 0;

    return metrics;
  }

  /**
   * Get aggregate metrics over all runs
   * @returns {Object} Aggregate metrics
   */
  getAggregates() {
    if (this.runHistory.length === 0) {
      return null;
    }

    const metrics = {};

    for (const key of Object.keys(METRIC_TYPES)) {
      const metricName = METRIC_TYPES[key];
      const values = this.runHistory
        .map(r => r.metrics[metricName])
        .filter(v => v !== undefined && v !== null && !isNaN(v));

      if (values.length > 0) {
        metrics[metricName] = {
          mean: values.reduce((a, b) => a + b, 0) / values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          std: this._computeStd(values),
          count: values.length
        };
      }
    }

    return metrics;
  }

  /**
   * Get metrics trend over time
   * @param {string} metricName - Metric to track
   * @param {number} windowSize - Rolling window size
   * @returns {Array} Trend data
   */
  getTrend(metricName, windowSize = 10) {
    const values = this.runHistory
      .map(r => ({
        timestamp: r.timestamp,
        value: r.metrics[metricName]
      }))
      .filter(v => v.value !== undefined);

    if (values.length < windowSize) {
      return values;
    }

    // Compute rolling average
    const trend = [];
    for (let i = windowSize - 1; i < values.length; i++) {
      const window = values.slice(i - windowSize + 1, i + 1);
      const avg = window.reduce((sum, v) => sum + v.value, 0) / windowSize;
      trend.push({
        timestamp: values[i].timestamp,
        value: values[i].value,
        rollingAvg: avg
      });
    }

    return trend;
  }

  /**
   * Compare two pipeline runs
   * @param {string} runId1 - First run ID
   * @param {string} runId2 - Second run ID
   * @returns {Object} Comparison results
   */
  compare(runId1, runId2) {
    const run1 = this.runHistory.find(r => r.runId === runId1);
    const run2 = this.runHistory.find(r => r.runId === runId2);

    if (!run1 || !run2) {
      throw new Error('One or both runs not found');
    }

    const comparison = {
      runs: [runId1, runId2],
      differences: {}
    };

    const allKeys = new Set([
      ...Object.keys(run1.metrics),
      ...Object.keys(run2.metrics)
    ]);

    for (const key of allKeys) {
      const val1 = run1.metrics[key];
      const val2 = run2.metrics[key];

      if (typeof val1 === 'number' && typeof val2 === 'number') {
        comparison.differences[key] = {
          run1: val1,
          run2: val2,
          diff: val2 - val1,
          percentChange: val1 !== 0 ? ((val2 - val1) / val1 * 100).toFixed(2) + '%' : 'N/A'
        };
      }
    }

    return comparison;
  }

  /**
   * Get best performing run
   * @param {string} metricName - Metric to optimize
   * @param {boolean} minimize - Whether to minimize
   * @returns {Object} Best run
   */
  getBestRun(metricName = 'f1_score', minimize = false) {
    if (this.runHistory.length === 0) {
      return null;
    }

    return this.runHistory.reduce((best, current) => {
      const bestVal = best.metrics[metricName] || (minimize ? Infinity : -Infinity);
      const currentVal = current.metrics[metricName] || (minimize ? Infinity : -Infinity);

      if (minimize) {
        return currentVal < bestVal ? current : best;
      }
      return currentVal > bestVal ? current : best;
    });
  }

  /**
   * Clear all recorded metrics
   */
  clear() {
    this.metrics.clear();
    this.runHistory = [];
  }

  /**
   * Export metrics data
   * @returns {Object} Exportable data
   */
  export() {
    return {
      history: this.runHistory,
      aggregates: this.getAggregates(),
      exportedAt: new Date().toISOString()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Compute precision, recall, F1
   * @private
   */
  _computePrecisionRecall(predicted, actual, keyFn) {
    const predictedKeys = new Set(predicted.map(keyFn));
    const actualKeys = new Set(actual.map(keyFn));

    let truePositives = 0;
    for (const key of predictedKeys) {
      if (actualKeys.has(key)) {
        truePositives++;
      }
    }

    const precision = predictedKeys.size > 0 ? truePositives / predictedKeys.size : 0;
    const recall = actualKeys.size > 0 ? truePositives / actualKeys.size : 0;
    const f1 = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

    return { precision, recall, f1, truePositives, falsePositives: predictedKeys.size - truePositives, falseNegatives: actualKeys.size - truePositives };
  }

  /**
   * Compute confidence statistics
   * @private
   */
  _computeConfidenceStats(items) {
    if (!items || items.length === 0) {
      return { mean: 0, min: 0, max: 0, std: 0 };
    }

    const confidences = items.map(i => i.confidence || 0);
    const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    return {
      mean,
      min: Math.min(...confidences),
      max: Math.max(...confidences),
      std: this._computeStd(confidences),
      distribution: this._computeHistogram(confidences, [0.5, 0.6, 0.7, 0.8, 0.9, 1.0])
    };
  }

  /**
   * Compute standard deviation
   * @private
   */
  _computeStd(values) {
    if (values.length < 2) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Compute histogram
   * @private
   */
  _computeHistogram(values, bins) {
    const histogram = {};
    for (let i = 0; i < bins.length; i++) {
      const label = i === 0 ? `<${bins[0]}` : `${bins[i - 1]}-${bins[i]}`;
      histogram[label] = 0;
    }

    for (const value of values) {
      for (let i = 0; i < bins.length; i++) {
        if (value <= bins[i]) {
          const label = i === 0 ? `<${bins[0]}` : `${bins[i - 1]}-${bins[i]}`;
          histogram[label]++;
          break;
        }
      }
    }

    return histogram;
  }

  /**
   * Compute graph density
   * @private
   */
  _computeGraphDensity(graph) {
    const n = graph.nodes?.length || 0;
    const e = graph.edges?.length || 0;

    if (n < 2) return 0;
    return (2 * e) / (n * (n - 1));
  }

  /**
   * Compute source distribution
   * @private
   */
  _computeSourceDistribution(entities) {
    const dist = {};
    for (const entity of entities) {
      const source = entity.source || 'unknown';
      dist[source] = (dist[source] || 0) + 1;
    }
    return dist;
  }

  /**
   * Compute type distribution
   * @private
   */
  _computeTypeDistribution(entities) {
    const dist = {};
    for (const entity of entities) {
      const type = entity.type || 'UNKNOWN';
      dist[type] = (dist[type] || 0) + 1;
    }
    return dist;
  }

  /**
   * Summarize result for storage
   * @private
   */
  _summarizeResult(result) {
    return {
      entityCount: result.entities?.length || 0,
      relationshipCount: result.relationships?.length || 0,
      hasGraph: !!result.graph,
      processingTime: result.timing?.total
    };
  }

  /**
   * Update aggregate metrics
   * @private
   */
  _updateAggregates(metrics) {
    for (const [key, value] of Object.entries(metrics)) {
      if (typeof value === 'number') {
        if (!this.metrics.has(key)) {
          this.metrics.set(key, { sum: 0, count: 0, values: [] });
        }
        const agg = this.metrics.get(key);
        agg.sum += value;
        agg.count++;
        agg.values.push(value);

        // Keep last 100 values for trend analysis
        if (agg.values.length > 100) {
          agg.values.shift();
        }
      }
    }
  }
}

// Singleton instance
let collectorInstance = null;

/**
 * Get metrics collector instance
 * @returns {MetricsCollector}
 */
function getMetricsCollector() {
  if (!collectorInstance) {
    collectorInstance = new MetricsCollector();
  }
  return collectorInstance;
}

module.exports = {
  MetricsCollector,
  getMetricsCollector,
  METRIC_TYPES
};
