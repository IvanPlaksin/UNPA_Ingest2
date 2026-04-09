/**
 * Insights Engine
 *
 * Orchestrates insight generation by:
 * 1. Collecting metrics from GraphAnalyzer
 * 2. Optionally collecting cluster data from CommunityDetector
 * 3. Running the rules engine
 * 4. Caching results via Redis
 */

const { GraphAnalyzer } = require('../graph/graph-analyzer');
const { CommunityDetector } = require('../graph/community-detector');
const redisService = require('../redis.service');
const { evaluateRules, sortInsights } = require('./insight-rules');

const CACHE_KEY_PREFIX = 'advisor:insights:';
const CACHE_TTL = 300; // 5 minutes

class InsightsEngine {
  constructor() {
    this.graphAnalyzer = new GraphAnalyzer();
    this.communityDetector = new CommunityDetector();
  }

  /**
   * Generate insights for a namespace.
   */
  async generateInsights(namespace, options = {}) {
    const { forceRefresh = false } = options;

    // Check cache
    if (!forceRefresh) {
      const cached = await this._getCached(namespace);
      if (cached) return cached;
    }

    // Step 1: Structural metrics
    const metrics = await this._collectStructuralMetrics(namespace);

    // Step 2: Cluster data (graceful)
    const clusterData = await this._collectClusterData(namespace);

    // Step 3: Rules engine
    const insights = evaluateRules(metrics, clusterData, null);
    const sorted = sortInsights(insights);

    const result = {
      insights: sorted,
      summary: this._generateSummary(sorted),
      metrics: {
        nodeCount: metrics.nodeCount,
        edgeCount: metrics.totalEdges,
        density: metrics.density,
      },
      generatedAt: new Date().toISOString(),
      namespace,
    };

    // Cache
    await this._cache(namespace, result);

    return result;
  }

  /**
   * Collect structural metrics via GraphAnalyzer.
   */
  async _collectStructuralMetrics(namespace) {
    const analysis = await this.graphAnalyzer.analyze(namespace);

    return {
      nodeCount: analysis.nodeCount || 0,
      totalEdges: analysis.edgeCount || 0,
      density: analysis.density || 0,
      maxDegreeNode: analysis.hubNodes?.[0]?.id || analysis.hubs?.[0]?.id || null,
      maxDegree: analysis.hubNodes?.[0]?.degree || analysis.hubs?.[0]?.degree || 0,
      bridgeCount: analysis.bridgeEdges?.length || analysis.bridges?.length || 0,
      bridges: analysis.bridgeEdges || analysis.bridges || [],
      orphanNodes: analysis.orphanNodes || [],
      componentCount: analysis.connectedComponents?.length || analysis.componentCount || 1,
      components: analysis.connectedComponents || analysis.components || [],
      clusteringCoefficient: analysis.avgClusteringCoefficient || 0,
    };
  }

  /**
   * Collect cluster data via CommunityDetector.
   */
  async _collectClusterData(namespace) {
    try {
      const result = await this.communityDetector.detect(namespace, {
        algorithm: 'auto',
        minClusterSize: 3,
      });

      return {
        clusters: result.clusters || [],
        modularity: result.modularity,
      };
    } catch (error) {
      console.warn('[InsightsEngine] Community detection unavailable:', error.message);
      return null;
    }
  }

  /**
   * Generate summary counts.
   */
  _generateSummary(insights) {
    return {
      total: insights.length,
      high: insights.filter(i => i.severity === 'high').length,
      medium: insights.filter(i => i.severity === 'medium').length,
      low: insights.filter(i => i.severity === 'low').length,
      byType: {
        warning: insights.filter(i => i.type === 'warning').length,
        opportunity: insights.filter(i => i.type === 'opportunity').length,
        suggestion: insights.filter(i => i.type === 'suggestion').length,
      },
      byCategory: {
        structural: insights.filter(i => i.category === 'structural').length,
        clustering: insights.filter(i => i.category === 'clustering').length,
        gnn: insights.filter(i => i.category === 'gnn').length,
      },
    };
  }

  // ── Cache helpers ──────────────────────────────────────────────────────

  async _getCached(namespace) {
    if (!redisService.isReady()) return null;
    try {
      const data = await redisService.get(`${CACHE_KEY_PREFIX}${namespace}`);
      if (data) {
        data.fromCache = true;
        data.cacheAge = Math.floor(
          (Date.now() - new Date(data.generatedAt).getTime()) / 1000,
        );
        return data;
      }
    } catch (e) {
      console.warn('[InsightsEngine] Cache read error:', e.message);
    }
    return null;
  }

  async _cache(namespace, result) {
    if (!redisService.isReady()) return;
    try {
      await redisService.set(
        `${CACHE_KEY_PREFIX}${namespace}`,
        result,
        CACHE_TTL,
      );
    } catch (e) {
      console.warn('[InsightsEngine] Cache write error:', e.message);
    }
  }

  async invalidateCache(namespace) {
    if (!redisService.isReady()) return;
    try {
      await redisService.del(`${CACHE_KEY_PREFIX}${namespace}`);
    } catch (e) {
      console.warn('[InsightsEngine] Cache invalidation error:', e.message);
    }
  }
}

module.exports = InsightsEngine;
