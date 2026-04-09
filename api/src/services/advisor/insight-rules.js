/**
 * Insight Rules Configuration
 *
 * Each rule defines:
 * - id: unique identifier
 * - type: 'opportunity' | 'warning' | 'suggestion'
 * - category: 'structural' | 'clustering' | 'gnn'
 * - check(metrics, clusterData, gnnData): returns insight object or null
 */

const INSIGHT_RULES = [
  // ═══════════════════════════════════════════════════════════════════════════
  // STRUCTURAL INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'hub_concentration',
    type: 'warning',
    category: 'structural',
    check: (metrics) => {
      const { maxDegreeNode, maxDegree, totalEdges } = metrics;
      const ratio = totalEdges > 0 ? maxDegree / (totalEdges * 2) : 0;

      if (ratio > 0.25) {
        return {
          severity: ratio > 0.4 ? 'high' : 'medium',
          title: 'Hub Overload Detected',
          description: `Node "${maxDegreeNode}" has ${Math.round(ratio * 100)}% of all connections, creating a potential single point of failure.`,
          evidence: {
            metric: 'max_degree_ratio',
            value: ratio,
            threshold: 0.25,
            affectedNodes: [maxDegreeNode],
          },
          suggestedAction: {
            type: 'review',
            title: 'Review hub architecture',
            description: 'Consider splitting this node or adding intermediate nodes to distribute connections.',
          },
        };
      }
      return null;
    },
  },

  {
    id: 'bridge_fragility',
    type: 'warning',
    category: 'structural',
    check: (metrics) => {
      const { bridgeCount, totalEdges, bridges } = metrics;
      const ratio = totalEdges > 0 ? bridgeCount / totalEdges : 0;

      if (ratio > 0.15 && bridgeCount > 3) {
        return {
          severity: ratio > 0.25 ? 'high' : 'medium',
          title: 'High Bridge Fragility',
          description: `${bridgeCount} edges (${Math.round(ratio * 100)}%) are bridges. Removing any would disconnect parts of the graph.`,
          evidence: {
            metric: 'bridge_ratio',
            value: ratio,
            threshold: 0.15,
            affectedNodes: bridges?.slice(0, 5).map(b => b.source) || [],
          },
          suggestedAction: {
            type: 'review',
            title: 'Add redundant connections',
            description: 'Consider adding alternative paths between critical components.',
          },
        };
      }
      return null;
    },
  },

  {
    id: 'orphan_nodes',
    type: 'warning',
    category: 'structural',
    check: (metrics) => {
      const { orphanNodes, nodeCount } = metrics;
      const orphanCount = orphanNodes?.length || 0;

      if (orphanCount > 0) {
        const ratio = orphanCount / nodeCount;
        return {
          severity: ratio > 0.1 ? 'high' : orphanCount > 3 ? 'medium' : 'low',
          title: 'Orphan Nodes Found',
          description: `${orphanCount} node${orphanCount > 1 ? 's have' : ' has'} no connections and may be incomplete or stale.`,
          evidence: {
            metric: 'orphan_count',
            value: orphanCount,
            threshold: 0,
            affectedNodes: orphanNodes?.slice(0, 10) || [],
          },
          suggestedAction: {
            type: 'review',
            title: 'Review orphan nodes',
            description: 'Connect these nodes to the graph or remove if no longer relevant.',
          },
        };
      }
      return null;
    },
  },

  {
    id: 'low_density',
    type: 'suggestion',
    category: 'structural',
    check: (metrics) => {
      const { density, nodeCount } = metrics;

      if (nodeCount > 10 && density < 0.02) {
        return {
          severity: 'low',
          title: 'Sparse Graph Structure',
          description: `Graph density is ${(density * 100).toFixed(2)}%, which is relatively sparse. This might indicate missing relationships.`,
          evidence: {
            metric: 'density',
            value: density,
            threshold: 0.02,
            affectedNodes: [],
          },
          suggestedAction: {
            type: 'analyze',
            title: 'Run link prediction',
            description: 'Use GNN to discover potential missing connections.',
          },
        };
      }
      return null;
    },
  },

  {
    id: 'multiple_components',
    type: 'warning',
    category: 'structural',
    check: (metrics) => {
      const { componentCount, components } = metrics;

      if (componentCount > 1) {
        return {
          severity: componentCount > 3 ? 'high' : 'medium',
          title: 'Disconnected Components',
          description: `Graph has ${componentCount} separate components that are not connected to each other.`,
          evidence: {
            metric: 'component_count',
            value: componentCount,
            threshold: 1,
            affectedNodes: components?.slice(1).flat().slice(0, 10) || [],
          },
          suggestedAction: {
            type: 'review',
            title: 'Review graph connectivity',
            description: 'Consider if these components should be connected or if they represent separate domains.',
          },
        };
      }
      return null;
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLUSTERING INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: 'consolidation_candidate',
    type: 'opportunity',
    category: 'clustering',
    check: (_metrics, clusterData) => {
      if (!clusterData?.clusters) return null;

      const goodCandidates = clusterData.clusters.filter(c =>
        c.coherence > 0.7 &&
        c.size >= 5 &&
        c.isolation > 0.6
      );

      if (goodCandidates.length > 0) {
        const best = goodCandidates[0];
        return {
          severity: best.coherence > 0.85 ? 'high' : 'medium',
          title: 'Consolidation Opportunity',
          description: `Cluster "${best.name || 'Unnamed'}" (${best.size} nodes) has high coherence (${Math.round(best.coherence * 100)}%) and could be consolidated.`,
          evidence: {
            metric: 'cluster_coherence',
            value: best.coherence,
            threshold: 0.7,
            affectedNodes: best.nodeIds?.slice(0, 10) || [],
          },
          suggestedAction: {
            type: 'consolidate',
            title: 'Consolidate cluster',
            description: 'Extract this cluster as a SubGraph to simplify the graph structure.',
            params: { clusterId: best.id, nodeIds: best.nodeIds },
          },
        };
      }
      return null;
    },
  },

  {
    id: 'many_clusters',
    type: 'suggestion',
    category: 'clustering',
    check: (_metrics, clusterData) => {
      if (!clusterData?.clusters) return null;
      const count = clusterData.clusters.length;

      if (count > 8) {
        return {
          severity: count > 15 ? 'high' : 'medium',
          title: 'High Cluster Count',
          description: `Detected ${count} communities. The graph may benefit from hierarchical structuring.`,
          evidence: {
            metric: 'cluster_count',
            value: count,
            threshold: 8,
            affectedNodes: [],
          },
          suggestedAction: {
            type: 'analyze',
            title: 'Review community structure',
            description: 'Consider grouping related communities or creating a hierarchy.',
          },
        };
      }
      return null;
    },
  },
];

/**
 * Run all rules and collect insights.
 */
const evaluateRules = (metrics, clusterData = null, gnnData = null) => {
  const insights = [];

  for (const rule of INSIGHT_RULES) {
    try {
      const result = rule.check(metrics, clusterData, gnnData);
      if (result) {
        insights.push({
          id: `${rule.id}-${Date.now()}`,
          ruleId: rule.id,
          type: rule.type,
          category: rule.category,
          ...result,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`Error evaluating rule ${rule.id}:`, error);
    }
  }

  return insights;
};

/**
 * Sort insights by severity then type.
 */
const sortInsights = (insights) => {
  const severityOrder = { high: 0, medium: 1, low: 2 };
  const typeOrder = { warning: 0, opportunity: 1, suggestion: 2 };

  return insights.sort((a, b) => {
    const sd = (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3);
    if (sd !== 0) return sd;
    return (typeOrder[a.type] ?? 3) - (typeOrder[b.type] ?? 3);
  });
};

module.exports = { INSIGHT_RULES, evaluateRules, sortInsights };
