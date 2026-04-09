/**
 * Graph Quality Metrics Service
 *
 * Measures and evaluates the quality of generated execution graphs.
 * Used for comparing original vs enhanced pipeline performance.
 *
 * Part of GXE Enhancement pipeline Phase 0.
 */

// Weights for composite scores
const STRUCTURAL_WEIGHTS = {
  dagValidity: 0.20,
  connectivity: 0.15,
  toolIdHitRate: 0.20,
  entryExitCorrectness: 0.15,
  edgeIntegrity: 0.15,
  selfLoopFree: 0.05,
  noDuplicateEdges: 0.05,
  autoFixCount: 0.05
};

const SEMANTIC_WEIGHTS = {
  nodeCoverage: 0.30,
  toolRelevance: 0.35,
  parallelismMatch: 0.15,
  depthEfficiency: 0.20
};

/**
 * Score to grade mapping
 */
const GRADE_THRESHOLDS = [
  { min: 0.95, grade: 'A+' },
  { min: 0.90, grade: 'A' },
  { min: 0.85, grade: 'A-' },
  { min: 0.80, grade: 'B+' },
  { min: 0.75, grade: 'B' },
  { min: 0.70, grade: 'B-' },
  { min: 0.65, grade: 'C+' },
  { min: 0.60, grade: 'C' },
  { min: 0.55, grade: 'C-' },
  { min: 0.50, grade: 'D' },
  { min: 0.00, grade: 'F' }
];

class GraphQualityMetrics {
  /**
   * @param {Object} graphValidator - Optional GraphValidator instance for re-validation
   */
  constructor(graphValidator = null) {
    this.validator = graphValidator;
  }

  /**
   * Compute structural metrics from validation result
   * @param {Object} graphData - { nodes: [], edges: [] }
   * @param {Object} validationResult - Result from GraphValidator.validate()
   * @param {number} autoFixCount - Number of issues fixed by autoFix (optional)
   * @returns {Object} Structural metrics
   */
  computeStructural(graphData, validationResult, autoFixCount = 0) {
    const { nodes = [], edges = [] } = graphData || {};
    const { errors = [], warnings = [], stats = {} } = validationResult || {};

    // Core structural checks
    const dagValidity = stats.isDAG ? 1 : 0;
    const connectivity = stats.isConnected ? 1 : 0;
    const entryExitCorrectness = stats.hasStandardIO ? 1 : 0;

    // Tool ID hit rate - percentage of nodes with valid tool IDs
    const toolIdHitRate = this._calcToolIdHitRate(nodes, errors, warnings);

    // Edge integrity - percentage of valid edges
    const edgeIntegrity = this._calcEdgeIntegrity(edges, errors);

    // Self-loop free
    const selfLoopFree = !errors.some(e => e.code === 'SELF_LOOPS') ? 1 : 0;

    // No duplicate edges
    const noDuplicateEdges = !warnings.some(w => w.code === 'DUPLICATE_EDGES') ? 1 : 0;

    // AutoFix penalty - more fixes = lower quality
    const autoFixPenalty = Math.max(0, 1 - (autoFixCount * 0.1));

    // Calculate composite score
    const metrics = {
      dagValidity,
      connectivity,
      toolIdHitRate,
      entryExitCorrectness,
      edgeIntegrity,
      selfLoopFree,
      noDuplicateEdges,
      autoFixCount,
      autoFixPenalty
    };

    metrics.compositeScore = this._weightedAvg(metrics, STRUCTURAL_WEIGHTS);

    return metrics;
  }

  /**
   * Compute semantic metrics by comparing with expected properties
   * @param {Object} graphData - { nodes: [], edges: [] }
   * @param {Object} expectedProperties - Expected graph properties from test corpus
   * @returns {Object} Semantic metrics
   */
  computeSemantic(graphData, expectedProperties) {
    const { nodes = [], edges = [] } = graphData || {};

    if (!expectedProperties) {
      return {
        nodeCoverage: 0.5,
        toolRelevance: 0.5,
        parallelismMatch: 0.5,
        depthEfficiency: 0.5,
        compositeScore: 0.5,
        skipped: true,
        reason: 'No expected properties provided'
      };
    }

    // Node coverage - within expected node count range
    const nodeCoverage = this._calcNodeCoverage(nodes, expectedProperties);

    // Tool relevance - required domains are present
    const toolRelevance = this._calcToolRelevance(nodes, expectedProperties);

    // Parallelism match - if expected, check for parallel patterns
    const parallelismMatch = this._calcParallelismMatch(nodes, edges, expectedProperties);

    // Depth efficiency - graph depth within expected range
    const depthEfficiency = this._calcDepthEfficiency(nodes, edges, expectedProperties);

    const metrics = {
      nodeCoverage,
      toolRelevance,
      parallelismMatch,
      depthEfficiency
    };

    metrics.compositeScore = this._weightedAvg(metrics, SEMANTIC_WEIGHTS);

    return metrics;
  }

  /**
   * Compute performance metrics from LLM call metadata
   * @param {Object} llmMetadata - Metadata from LLM call
   * @returns {Object} Performance metrics
   */
  computePerformance(llmMetadata) {
    const {
      duration = 0,
      usage = {},
      model = 'unknown',
      toolsProvided = 0,
      toolsTotal = 0,
      enhanced = false,
      stopReason = null
    } = llmMetadata || {};

    return {
      generationTimeMs: duration,
      tokensInput: usage.input_tokens || 0,
      tokensOutput: usage.output_tokens || 0,
      tokensTotal: (usage.input_tokens || 0) + (usage.output_tokens || 0),
      toolsProvided,
      toolsTotal,
      toolFilterRatio: toolsTotal > 0 ? toolsProvided / toolsTotal : 1,
      modelUsed: model,
      enhanced,
      stopReason
    };
  }

  /**
   * Compute all metrics
   * @param {Object} graphData - Generated graph
   * @param {Object} validationResult - Validation result
   * @param {Object} expectedProperties - Expected properties (optional)
   * @param {Object} llmMetadata - LLM call metadata
   * @param {number} autoFixCount - Number of auto-fixes applied
   * @returns {Object} Complete metrics object
   */
  computeAll(graphData, validationResult, expectedProperties, llmMetadata, autoFixCount = 0) {
    const structural = this.computeStructural(graphData, validationResult, autoFixCount);
    const semantic = this.computeSemantic(graphData, expectedProperties);
    const performance = this.computePerformance(llmMetadata);

    // Overall score: structural 40%, semantic 60%
    const overallScore = structural.compositeScore * 0.4 + semantic.compositeScore * 0.6;

    return {
      structural,
      semantic,
      performance,
      overall: {
        score: overallScore,
        grade: this._scoreToGrade(overallScore),
        timestamp: new Date().toISOString(),
        pipelineType: llmMetadata?.enhanced ? 'enhanced' : 'original',
        nodeCount: graphData?.nodes?.length || 0,
        edgeCount: graphData?.edges?.length || 0
      }
    };
  }

  /**
   * Compare two metric results (A/B testing)
   * @param {Object} originalMetrics - Metrics from original pipeline
   * @param {Object} enhancedMetrics - Metrics from enhanced pipeline
   * @returns {Object} Comparison result
   */
  compareResults(originalMetrics, enhancedMetrics) {
    const orig = originalMetrics || {};
    const enh = enhancedMetrics || {};

    return {
      structuralDelta: (enh.structural?.compositeScore || 0) - (orig.structural?.compositeScore || 0),
      semanticDelta: (enh.semantic?.compositeScore || 0) - (orig.semantic?.compositeScore || 0),
      overallDelta: (enh.overall?.score || 0) - (orig.overall?.score || 0),
      tokenReduction: orig.performance?.tokensInput > 0
        ? 1 - ((enh.performance?.tokensInput || 0) / orig.performance.tokensInput)
        : 0,
      timeDelta: (enh.performance?.generationTimeMs || 0) - (orig.performance?.generationTimeMs || 0),
      improved: (enh.overall?.score || 0) > (orig.overall?.score || 0),
      improvementPercent: orig.overall?.score > 0
        ? (((enh.overall?.score || 0) - orig.overall.score) / orig.overall.score) * 100
        : 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Calculate tool ID hit rate
   * @private
   */
  _calcToolIdHitRate(nodes, errors, warnings) {
    if (!nodes || nodes.length === 0) return 0;

    // Count nodes with unknown tool IDs from warnings
    const unknownToolWarning = warnings.find(w => w.code === 'UNKNOWN_TOOL_IDS');
    const unknownCount = unknownToolWarning?.tools?.length || 0;

    return 1 - (unknownCount / nodes.length);
  }

  /**
   * Calculate edge integrity
   * @private
   */
  _calcEdgeIntegrity(edges, errors) {
    if (!edges || edges.length === 0) return 1; // No edges = no issues

    // Count invalid edges from errors
    const invalidSources = errors.find(e => e.code === 'INVALID_EDGE_SOURCES');
    const invalidTargets = errors.find(e => e.code === 'INVALID_EDGE_TARGETS');

    const invalidCount = (invalidSources?.edges?.length || 0) + (invalidTargets?.edges?.length || 0);

    return 1 - (invalidCount / edges.length);
  }

  /**
   * Calculate node count coverage
   * Uses soft penalty for exceeding maxNodes (floor at 0.7)
   * @private
   */
  _calcNodeCoverage(nodes, expected) {
    const count = nodes.length;
    const { minNodes = 3, maxNodes = 15 } = expected;

    if (count >= minNodes && count <= maxNodes) {
      return 1.0;
    }

    // Penalty for being under minimum (linear)
    if (count < minNodes) {
      return Math.max(0, count / minNodes);
    }

    // Soft penalty for exceeding maximum (diminishing, floor at 0.7)
    // e.g., 12 nodes vs max 10 = 1.0 - 0.2*0.15 = 0.97
    // e.g., 20 nodes vs max 10 = 1.0 - 1.0*0.15 = 0.85
    if (count > maxNodes) {
      const overRatio = (count - maxNodes) / maxNodes;
      return Math.max(0.7, 1.0 - overRatio * 0.15);
    }

    return 0.5;
  }

  /**
   * Calculate tool relevance score
   * Uses toolId-based domain detection with fallback to label keywords
   * @private
   */
  _calcToolRelevance(nodes, expected) {
    const { requiredToolDomains = [] } = expected;
    if (requiredToolDomains.length === 0) return 1.0;

    // Map toolId prefix to expected domain names
    const domainMapping = {
      'text': 'text_processing',
      'ingestion': 'text_processing',
      'extraction': 'entity_extraction',
      'vector': 'vector_search',
      'graph': 'graph_ops',
      'ai': 'ai_generation',
      'control': 'flow_control',
      'primitive': 'data_flow',
      'process': 'text_processing',
      'input': 'text_processing',
      'output': 'ai_generation',
      'store': 'graph_ops',
      'search': 'vector_search'
    };

    // Extract present domains from toolIds
    const presentDomains = new Set();

    for (const node of nodes) {
      const toolId = node.data?.toolId || '';
      const label = (node.data?.label || '').toLowerCase();
      const kind = (node.data?.kind || '').toLowerCase();

      // Skip start/end/control nodes
      if (toolId === 'start' || toolId === 'end' || !toolId) {
        continue;
      }

      // Extract domain from toolId (e.g., "text.sanitize" → "text")
      const toolPrefix = toolId.split('.')[0];
      const mappedDomain = domainMapping[toolPrefix];

      if (mappedDomain) {
        presentDomains.add(mappedDomain);
      }

      // Fallback: label-based detection for nodes without proper toolId
      if (!mappedDomain) {
        if (label.includes('sanitiz') || label.includes('chunk') || label.includes('normaliz') || label.includes('parse')) {
          presentDomains.add('text_processing');
        }
        if (label.includes('extract') || label.includes('entit')) {
          presentDomains.add('entity_extraction');
        }
        if (label.includes('classif') || label.includes('categor') || label.includes('classify')) {
          presentDomains.add('classification');
        }
        if (label.includes('vector') || label.includes('embed') || label.includes('search') || label.includes('retriev')) {
          presentDomains.add('vector_search');
        }
        if (label.includes('graph') || label.includes('cypher') || label.includes('store') || label.includes('save')) {
          presentDomains.add('graph_ops');
        }
        if (kind === 'ai' || label.includes('generat') || label.includes('llm') || label.includes('ai ')) {
          presentDomains.add('ai_generation');
        }
      }
    }

    // Calculate coverage: how many required domains are present
    let matched = 0;
    for (const required of requiredToolDomains) {
      if (presentDomains.has(required)) {
        matched++;
      }
    }

    return matched / requiredToolDomains.length;
  }

  /**
   * Calculate parallelism match
   * @private
   */
  _calcParallelismMatch(nodes, edges, expected) {
    const { expectedParallel = false } = expected;

    // Detect parallel patterns: nodes with same source
    const hasParallel = this._hasParallelBranches(nodes, edges);

    if (expectedParallel && hasParallel) return 1.0;
    if (!expectedParallel && !hasParallel) return 1.0;
    if (expectedParallel && !hasParallel) return 0.3; // Missing expected parallelism
    if (!expectedParallel && hasParallel) return 0.7; // Extra parallelism (not necessarily bad)

    return 0.5;
  }

  /**
   * Check if graph has parallel branches
   * @private
   */
  _hasParallelBranches(nodes, edges) {
    if (!edges || edges.length < 2) return false;

    // Count outgoing edges per node
    const outDegree = new Map();
    for (const edge of edges) {
      const source = edge.source;
      outDegree.set(source, (outDegree.get(source) || 0) + 1);
    }

    // If any node has 2+ outgoing edges, we have potential parallelism
    for (const [nodeId, degree] of outDegree) {
      if (degree >= 2) {
        // Verify targets are distinct (not just multiple edges to same node)
        const targets = edges.filter(e => e.source === nodeId).map(e => e.target);
        const uniqueTargets = new Set(targets);
        if (uniqueTargets.size >= 2) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Calculate depth efficiency
   * @private
   */
  _calcDepthEfficiency(nodes, edges, expected) {
    const { expectedDepth = [3, 10] } = expected;
    const [minDepth, maxDepth] = expectedDepth;

    // Calculate actual depth using longest path
    const depth = this._calculateGraphDepth(nodes, edges);

    if (depth >= minDepth && depth <= maxDepth) {
      return 1.0;
    }

    if (depth < minDepth) {
      return Math.max(0.3, depth / minDepth);
    }

    if (depth > maxDepth) {
      return Math.max(0.5, maxDepth / depth);
    }

    return 0.5;
  }

  /**
   * Calculate graph depth (longest path)
   * @private
   */
  _calculateGraphDepth(nodes, edges) {
    if (!nodes || nodes.length === 0) return 0;
    if (!edges || edges.length === 0) return 1;

    // Build adjacency and find entry nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    const inDegree = new Map();
    const adjacency = new Map();

    for (const id of nodeIds) {
      inDegree.set(id, 0);
      adjacency.set(id, []);
    }

    for (const edge of edges) {
      const source = edge.source;
      const target = edge.target;
      if (adjacency.has(source) && nodeIds.has(target)) {
        adjacency.get(source).push(target);
        inDegree.set(target, inDegree.get(target) + 1);
      }
    }

    // BFS from entry nodes to find max depth
    const entryNodes = [...nodeIds].filter(id => inDegree.get(id) === 0);
    if (entryNodes.length === 0) {
      // If no entry nodes (cycle), use first node
      entryNodes.push(nodes[0].id);
    }

    const depth = new Map();
    const queue = entryNodes.map(id => ({ id, d: 1 }));

    while (queue.length > 0) {
      const { id, d } = queue.shift();

      if (!depth.has(id) || depth.get(id) < d) {
        depth.set(id, d);
      }

      for (const neighbor of adjacency.get(id) || []) {
        queue.push({ id: neighbor, d: d + 1 });
      }
    }

    return Math.max(...depth.values(), 1);
  }

  /**
   * Calculate weighted average
   * @private
   */
  _weightedAvg(metrics, weights) {
    let sum = 0;
    let weightSum = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (typeof metrics[key] === 'number' && !isNaN(metrics[key])) {
        sum += metrics[key] * weight;
        weightSum += weight;
      }
    }

    return weightSum > 0 ? sum / weightSum : 0;
  }

  /**
   * Convert score to letter grade
   * @private
   */
  _scoreToGrade(score) {
    for (const { min, grade } of GRADE_THRESHOLDS) {
      if (score >= min) return grade;
    }
    return 'F';
  }
}

/**
 * Create metrics instance
 * @param {Object} graphValidator - Optional validator instance
 * @returns {GraphQualityMetrics}
 */
function createGraphQualityMetrics(graphValidator = null) {
  return new GraphQualityMetrics(graphValidator);
}

module.exports = {
  GraphQualityMetrics,
  createGraphQualityMetrics,
  STRUCTURAL_WEIGHTS,
  SEMANTIC_WEIGHTS,
  GRADE_THRESHOLDS
};
