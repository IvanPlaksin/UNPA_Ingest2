/**
 * Dashboard Service
 * Aggregates metrics and analytics for the dashboard UI
 *
 * Features:
 *   - Overview metrics (graph, queries, extraction, patterns)
 *   - Graph metrics (type distributions, hubs, density)
 *   - Query analytics (intent/mode distribution, cache)
 *   - Extraction analytics (entities, relations, ingestion)
 *   - Top entities and relations
 *   - Activity log
 *   - Time-series metric recording
 *   - System status (memory, uptime, component health)
 *
 * All data sources are injectable for testability.
 *
 * @module services/visualization/dashboard.service
 */

class DashboardService {
  constructor(options = {}) {
    this.options = options;

    // Track which data sources were explicitly provided (even as null)
    this._explicit = new Set(Object.keys(options));

    // Injectable data sources (lazy-loaded or mocked)
    this._graphCache = options.graphCache || null;
    this._queryEngine = options.queryEngine || null;
    this._extractor = options.extractor || null;
    this._patternLibrary = options.patternLibrary || null;
    this._jobQueue = options.jobQueue || null;
    this._ingestionPipeline = options.ingestionPipeline || null;
    this._sourceManager = options.sourceManager || null;

    // Time-series data (in-memory, capped)
    this.timeSeries = {
      queries: [],
      extractions: [],
      ingestions: [],
      errors: []
    };

    this.maxTimeSeriesPoints = options.maxTimeSeriesPoints || 1440;
    this.activityLog = [];
    this.maxActivityLog = options.maxActivityLog || 100;

    this._metricsInterval = null;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DATA SOURCE GETTERS (lazy-load from real services if not injected)
  // ═══════════════════════════════════════════════════════════════════════

  get graphCache() {
    if (!this._graphCache && !this._explicit.has('graphCache')) {
      try {
        const { graphVizService } = require('./graph-viz.service');
        this._graphCache = graphVizService.graphCache;
      } catch { this._graphCache = { nodes: new Map(), edges: new Map(), adjacency: new Map() }; }
    }
    return this._graphCache || { nodes: new Map(), edges: new Map(), adjacency: new Map() };
  }

  get queryEngine() {
    if (!this._queryEngine && !this._explicit.has('queryEngine')) {
      try { this._queryEngine = require('../retrieval/query-engine'); } catch { this._queryEngine = null; }
    }
    return this._queryEngine;
  }

  get extractor() {
    if (!this._extractor && !this._explicit.has('extractor')) {
      try { this._extractor = require('../extraction'); } catch { this._extractor = null; }
    }
    return this._extractor;
  }

  get patternLibrary() {
    if (!this._patternLibrary && !this._explicit.has('patternLibrary')) {
      try { this._patternLibrary = require('../patterns'); } catch { this._patternLibrary = null; }
    }
    return this._patternLibrary;
  }

  get jobQueue() {
    if (!this._jobQueue && !this._explicit.has('jobQueue')) {
      try { const { jobQueueService } = require('../jobs'); this._jobQueue = jobQueueService; } catch { this._jobQueue = null; }
    }
    return this._jobQueue;
  }

  get ingestionPipeline() {
    if (!this._ingestionPipeline && !this._explicit.has('ingestionPipeline')) {
      try { const { ingestionPipeline } = require('../ingestion'); this._ingestionPipeline = ingestionPipeline; } catch { this._ingestionPipeline = null; }
    }
    return this._ingestionPipeline;
  }

  get sourceManager() {
    if (!this._sourceManager && !this._explicit.has('sourceManager')) {
      try { const { sourceManager } = require('../connectors'); this._sourceManager = sourceManager; } catch { this._sourceManager = null; }
    }
    return this._sourceManager;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Overview — high-level summary of all metrics
   */
  getOverview() {
    const graphStats = this._getGraphStats();
    const queryStats = this._safeGetStats(this.queryEngine, 'getStats', {});
    const extractionStats = this._safeGetStats(this.extractor, 'getStats', {});
    const patternStats = this._safeGetStats(this.patternLibrary, 'getStats', {});

    return {
      graph: {
        nodes: graphStats.nodes,
        edges: graphStats.edges,
        nodeTypes: graphStats.nodeTypes,
        edgeTypes: graphStats.edgeTypes
      },
      queries: {
        total: queryStats.totalQueries || 0,
        successful: queryStats.successfulQueries || 0,
        successRate: this._calcRate(queryStats.successfulQueries, queryStats.totalQueries),
        avgResponseTime: Math.round(queryStats.avgQueryTime || 0),
        cacheHitRate: queryStats.cache?.hitRate || '0%'
      },
      extraction: {
        total: extractionStats.totalExtractions || 0,
        entities: extractionStats.nodesAdded || 0,
        relations: extractionStats.edgesAdded || 0,
        patternsLearned: extractionStats.patternsLearned || 0
      },
      patterns: {
        entityPatterns: patternStats.entityPatterns || 0,
        relationPatterns: patternStats.relationPatterns || 0,
        subgraphPatterns: patternStats.subgraphPatterns || 0,
        total: patternStats.total || 0
      },
      health: this._getHealthStatus(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Detailed graph metrics — distributions, hubs, density
   */
  getGraphMetrics() {
    const nodes = [...this.graphCache.nodes.entries()];
    const edges = [...this.graphCache.edges.values()];

    const nodeTypeDistribution = {};
    for (const [, node] of nodes) {
      const type = node.type || 'Unknown';
      nodeTypeDistribution[type] = (nodeTypeDistribution[type] || 0) + 1;
    }

    const edgeTypeDistribution = {};
    for (const edge of edges) {
      const type = edge.type || edge.relation || 'RELATED_TO';
      edgeTypeDistribution[type] = (edgeTypeDistribution[type] || 0) + 1;
    }

    // Degree distribution
    const degrees = new Map();
    for (const [nodeId] of nodes) degrees.set(nodeId, 0);
    for (const edge of edges) {
      const source = edge.source || edge.from;
      const target = edge.target || edge.to;
      degrees.set(source, (degrees.get(source) || 0) + 1);
      degrees.set(target, (degrees.get(target) || 0) + 1);
    }

    const degreeValues = [...degrees.values()];
    const avgDegree = degreeValues.length > 0
      ? degreeValues.reduce((a, b) => a + b, 0) / degreeValues.length
      : 0;
    const maxDegree = degreeValues.length > 0 ? Math.max(...degreeValues) : 0;

    const hubs = [...degrees.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, degree]) => {
        const node = this.graphCache.nodes.get(id);
        return { id, name: node?.name || id, type: node?.type || 'Unknown', degree };
      });

    return {
      summary: {
        totalNodes: nodes.length,
        totalEdges: edges.length,
        avgDegree: Math.round(avgDegree * 100) / 100,
        maxDegree,
        density: this._calcDensity(nodes.length, edges.length)
      },
      nodeTypeDistribution: this._formatDistribution(nodeTypeDistribution),
      edgeTypeDistribution: this._formatDistribution(edgeTypeDistribution),
      hubs,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Query analytics
   */
  getQueryAnalytics() {
    const stats = this._safeGetStats(this.queryEngine, 'getStats', {});

    return {
      summary: {
        totalQueries: stats.totalQueries || 0,
        successfulQueries: stats.successfulQueries || 0,
        failedQueries: stats.failedQueries || 0,
        successRate: this._calcRate(stats.successfulQueries, stats.totalQueries),
        avgResponseTime: Math.round(stats.avgQueryTime || 0),
        cacheHits: stats.cacheHits || 0,
        cacheMisses: stats.cacheMisses || 0,
        cacheHitRate: this._calcRate(stats.cacheHits, (stats.cacheHits || 0) + (stats.cacheMisses || 0))
      },
      intentDistribution: this._formatDistribution(stats.byIntent || {}),
      modeDistribution: this._formatDistribution(stats.byMode || {}),
      cache: {
        size: stats.cache?.size || 0,
        maxSize: stats.cache?.maxSize || 100,
        hitRate: stats.cache?.hitRate || '0%'
      },
      timeSeries: this._getTimeSeries('queries'),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Extraction analytics
   */
  getExtractionAnalytics() {
    const stats = this._safeGetStats(this.extractor, 'getStats', {});
    const ingestionStats = this._safeGetStats(this.ingestionPipeline, 'getStats', {});

    return {
      summary: {
        totalExtractions: stats.totalExtractions || 0,
        entitiesExtracted: stats.nodesAdded || 0,
        relationsExtracted: stats.edgesAdded || 0,
        patternsLearned: stats.patternsLearned || 0,
        avgEntitiesPerExtraction: this._calcRate(stats.nodesAdded, stats.totalExtractions)
      },
      ingestion: {
        totalIngested: ingestionStats.totalIngested || 0,
        totalChunks: ingestionStats.totalChunks || 0,
        totalEntities: ingestionStats.totalEntities || 0,
        totalRelations: ingestionStats.totalRelations || 0,
        byFormat: ingestionStats.byFormat || {},
        errors: ingestionStats.errors || 0
      },
      timeSeries: this._getTimeSeries('extractions'),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Top entities by connection count
   */
  getTopEntities(options = {}) {
    const limit = options.limit || 20;
    const sortBy = options.sortBy || 'connections';

    const nodes = [...this.graphCache.nodes.entries()];
    const edges = [...this.graphCache.edges.values()];

    const connections = new Map();
    for (const edge of edges) {
      const source = edge.source || edge.from;
      const target = edge.target || edge.to;
      connections.set(source, (connections.get(source) || 0) + 1);
      connections.set(target, (connections.get(target) || 0) + 1);
    }

    let sorted;
    if (sortBy === 'connections') {
      sorted = nodes.sort((a, b) => (connections.get(b[0]) || 0) - (connections.get(a[0]) || 0));
    } else {
      sorted = nodes.sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0]));
    }

    return {
      entities: sorted.slice(0, limit).map(([id, node]) => ({
        id,
        name: node.name || id,
        type: node.type || 'Unknown',
        connections: connections.get(id) || 0,
        attributes: Object.keys(node.attributes || {}).length
      })),
      sortBy,
      total: nodes.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Top relations by frequency
   */
  getTopRelations(options = {}) {
    const limit = options.limit || 20;
    const edges = [...this.graphCache.edges.values()];

    const relationCounts = {};
    for (const edge of edges) {
      const type = edge.type || edge.relation || 'RELATED_TO';
      if (!relationCounts[type]) relationCounts[type] = { count: 0, examples: [] };
      relationCounts[type].count++;
      if (relationCounts[type].examples.length < 3) {
        relationCounts[type].examples.push({
          source: edge.source || edge.from,
          target: edge.target || edge.to
        });
      }
    }

    const sorted = Object.entries(relationCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit);

    return {
      relations: sorted.map(([type, data]) => ({
        type,
        count: data.count,
        percentage: this._calcRate(data.count, edges.length),
        examples: data.examples
      })),
      total: edges.length,
      uniqueTypes: Object.keys(relationCounts).length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Recent activity
   */
  getRecentActivity(options = {}) {
    const limit = options.limit || 50;
    let activities = [...this.activityLog];
    if (options.type) {
      activities = activities.filter(a => a.type === options.type);
    }
    return {
      activities: activities.slice(0, limit),
      total: activities.length,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * System status
   */
  getSystemStatus() {
    const memUsage = process.memoryUsage();

    return {
      uptime: process.uptime(),
      memory: {
        heapUsed: this._formatBytes(memUsage.heapUsed),
        heapTotal: this._formatBytes(memUsage.heapTotal),
        rss: this._formatBytes(memUsage.rss),
        external: this._formatBytes(memUsage.external),
        heapUsedPercent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)
      },
      components: {
        graph: this.graphCache.nodes.size > 0 ? 'healthy' : 'empty',
        query: this.queryEngine ? 'healthy' : 'unavailable',
        extraction: this.extractor ? 'healthy' : 'unavailable',
        patterns: this.patternLibrary ? 'healthy' : 'unavailable',
        jobs: this.jobQueue?.initialized ? 'healthy' : 'unavailable',
        connectors: this.sourceManager?.connectors?.size || 0
      },
      timestamp: new Date().toISOString()
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // ACTIVITY & TIME-SERIES
  // ═══════════════════════════════════════════════════════════════════════

  logActivity(type, data) {
    const activity = {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      data,
      timestamp: new Date().toISOString()
    };
    this.activityLog.unshift(activity);
    if (this.activityLog.length > this.maxActivityLog) {
      this.activityLog = this.activityLog.slice(0, this.maxActivityLog);
    }
    return activity;
  }

  recordMetric(series, data) {
    if (!this.timeSeries[series]) return;
    this.timeSeries[series].push({ timestamp: new Date().toISOString(), ...data });
    if (this.timeSeries[series].length > this.maxTimeSeriesPoints) {
      this.timeSeries[series] = this.timeSeries[series].slice(-this.maxTimeSeriesPoints);
    }
  }

  startMetricsCollection(intervalMs = 60000) {
    if (this._metricsInterval) return;
    this._metricsInterval = setInterval(() => {
      const qs = this._safeGetStats(this.queryEngine, 'getStats', {});
      const es = this._safeGetStats(this.extractor, 'getStats', {});
      this.recordMetric('queries', { count: qs.totalQueries || 0, avgTime: qs.avgQueryTime || 0 });
      this.recordMetric('extractions', { entities: es.nodesAdded || 0, relations: es.edgesAdded || 0 });
    }, intervalMs);
  }

  stop() {
    if (this._metricsInterval) {
      clearInterval(this._metricsInterval);
      this._metricsInterval = null;
    }
  }

  getStats() {
    return {
      timeSeriesPoints: Object.fromEntries(
        Object.entries(this.timeSeries).map(([k, v]) => [k, v.length])
      ),
      activityLogSize: this.activityLog.length
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _getGraphStats() {
    const nodeTypes = new Set();
    const edgeTypes = new Set();
    for (const node of this.graphCache.nodes.values()) nodeTypes.add(node.type || 'Unknown');
    for (const edge of this.graphCache.edges.values()) edgeTypes.add(edge.type || edge.relation || 'RELATED_TO');
    return {
      nodes: this.graphCache.nodes.size,
      edges: this.graphCache.edges.size,
      nodeTypes: nodeTypes.size,
      edgeTypes: edgeTypes.size
    };
  }

  _getHealthStatus() {
    const graphOk = this.graphCache.nodes instanceof Map;
    const queryOk = !!this.queryEngine;
    const patternsOk = !!this.patternLibrary;
    if (graphOk && queryOk && patternsOk) return 'healthy';
    if (graphOk || queryOk || patternsOk) return 'degraded';
    return 'unhealthy';
  }

  _getTimeSeries(series) {
    return (this.timeSeries[series] || []).slice(-60);
  }

  _safeGetStats(service, method, defaultVal) {
    if (!service || typeof service[method] !== 'function') return defaultVal;
    try { return service[method](); } catch { return defaultVal; }
  }

  _calcRate(value, total) {
    if (!total || total === 0) return '0%';
    return `${Math.round(((value || 0) / total) * 100)}%`;
  }

  _calcDensity(nodes, edges) {
    if (nodes < 2) return 0;
    const maxEdges = (nodes * (nodes - 1)) / 2;
    return Math.round((edges / maxEdges) * 10000) / 10000;
  }

  _formatDistribution(obj) {
    const total = Object.values(obj).reduce((a, b) => a + b, 0);
    return Object.entries(obj)
      .map(([name, count]) => ({ name, count, percentage: total > 0 ? Math.round((count / total) * 100) : 0 }))
      .sort((a, b) => b.count - a.count);
  }

  _formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

const dashboardService = new DashboardService();

module.exports = {
  DashboardService,
  dashboardService
};
