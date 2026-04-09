/**
 * ResourceLimiter
 *
 * Enforces safety limits on graph execution to prevent resource exhaustion.
 * Part of GXE Runtime Environment P1.
 *
 * @module runtime/safety/ResourceLimiter
 */

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT LIMITS
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_LIMITS = {
  nodeTimeoutMs: 60000,
  graphTimeoutMs: 300000,
  maxConcurrency: 10,
  maxNodes: 100,
  maxEdges: 500,
  maxDepth: 50,
  maxLoopIterations: 1000,
  maxTotalRetries: 50,
  maxLLMTokensPerGraph: 100000
};

// ═══════════════════════════════════════════════════════════════════════════
// DAG DEPTH CALCULATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the longest path (depth) in a DAG using topological order
 *
 * @param {Array<{id: string}>} nodes - Node list
 * @param {Array<{source: string, target: string}>} edges - Edge list
 * @returns {number} - Longest path length (0 for single node, -1 for invalid/cyclic)
 */
function computeDAGDepth(nodes, edges) {
  if (!nodes || nodes.length === 0) return 0;
  if (nodes.length === 1) return 0;

  // Build adjacency and in-degree maps
  const nodeIds = new Set(nodes.map(n => n.id));
  const inDegree = new Map();
  const predecessors = new Map();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    predecessors.set(id, []);
  }

  for (const edge of edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      predecessors.get(edge.target).push(edge.source);
    }
  }

  // Kahn's algorithm for topological order
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const topoOrder = [];
  const dist = new Map();

  while (queue.length > 0) {
    const node = queue.shift();
    topoOrder.push(node);

    // Distance is max of all predecessors + 1
    const preds = predecessors.get(node) || [];
    if (preds.length === 0) {
      dist.set(node, 0);
    } else {
      const maxPredDist = Math.max(...preds.map(p => dist.get(p) || 0));
      dist.set(node, maxPredDist + 1);
    }

    // Update in-degrees
    for (const edge of edges) {
      if (edge.source === node && nodeIds.has(edge.target)) {
        const newDeg = inDegree.get(edge.target) - 1;
        inDegree.set(edge.target, newDeg);
        if (newDeg === 0) queue.push(edge.target);
      }
    }
  }

  // Check for cycles
  if (topoOrder.length !== nodeIds.size) {
    return -1; // Cyclic graph
  }

  // Return maximum distance
  return Math.max(...dist.values());
}

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCE LIMITER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Enforces resource limits on graph execution
 */
class ResourceLimiter {
  /**
   * @param {Object} limits - Resource limits configuration
   */
  constructor(limits = {}) {
    this._limits = { ...DEFAULT_LIMITS, ...limits };

    // Runtime tracking
    this._tokenUsage = 0;
    this._totalRetries = 0;
    this._retryByNode = new Map();
    this._activeNodes = new Set();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAG VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate DAG against resource limits
   *
   * @param {Object} dag - { nodes: Node[], edges: Edge[] }
   * @returns {{ valid: boolean, violations: string[] }}
   */
  validateDAG(dag) {
    const violations = [];
    const nodes = dag.nodes || [];
    const edges = dag.edges || [];

    // Check node count
    if (nodes.length > this._limits.maxNodes) {
      violations.push(
        `Node count ${nodes.length} exceeds limit ${this._limits.maxNodes}`
      );
    }

    // Check edge count
    if (edges.length > this._limits.maxEdges) {
      violations.push(
        `Edge count ${edges.length} exceeds limit ${this._limits.maxEdges}`
      );
    }

    // Check depth (longest path)
    const depth = computeDAGDepth(nodes, edges);
    if (depth === -1) {
      violations.push('Graph contains cycles (not a valid DAG)');
    } else if (depth > this._limits.maxDepth) {
      violations.push(
        `Graph depth ${depth} exceeds limit ${this._limits.maxDepth}`
      );
    }

    return {
      valid: violations.length === 0,
      violations,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        depth: depth >= 0 ? depth : null
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXECUTION CHECKS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a node can be executed
   *
   * @param {string} nodeId - Node ID
   * @param {Object} currentMetrics - Current execution metrics
   * @param {number} [currentMetrics.activeConcurrency] - Current active node count
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkNodeExecution(nodeId, currentMetrics = {}) {
    const activeConcurrency = currentMetrics.activeConcurrency ?? this._activeNodes.size;

    // Check concurrency limit
    if (activeConcurrency >= this._limits.maxConcurrency) {
      return {
        allowed: false,
        reason: `Concurrency limit reached: ${activeConcurrency}/${this._limits.maxConcurrency}`
      };
    }

    // Check total retry budget
    if (this._totalRetries >= this._limits.maxTotalRetries) {
      return {
        allowed: false,
        reason: `Retry budget exhausted: ${this._totalRetries}/${this._limits.maxTotalRetries}`
      };
    }

    return { allowed: true };
  }

  /**
   * Mark node as active
   * @param {string} nodeId
   */
  markNodeActive(nodeId) {
    this._activeNodes.add(nodeId);
  }

  /**
   * Mark node as inactive
   * @param {string} nodeId
   */
  markNodeInactive(nodeId) {
    this._activeNodes.delete(nodeId);
  }

  /**
   * Get current active node count
   * @returns {number}
   */
  getActiveCount() {
    return this._activeNodes.size;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TOKEN TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Track LLM token usage
   * @param {number} tokens - Number of tokens used
   */
  trackTokenUsage(tokens) {
    this._tokenUsage += tokens;
  }

  /**
   * Get current token usage
   * @returns {number}
   */
  getTokenUsage() {
    return this._tokenUsage;
  }

  /**
   * Check if token budget is exceeded
   * @returns {boolean}
   */
  isTokenBudgetExceeded() {
    return this._tokenUsage >= this._limits.maxLLMTokensPerGraph;
  }

  /**
   * Get remaining token budget
   * @returns {number}
   */
  getRemainingTokenBudget() {
    return Math.max(0, this._limits.maxLLMTokensPerGraph - this._tokenUsage);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RETRY TRACKING
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Track a retry for a node
   * @param {string} nodeId
   */
  trackRetry(nodeId) {
    this._totalRetries++;
    const current = this._retryByNode.get(nodeId) || 0;
    this._retryByNode.set(nodeId, current + 1);
  }

  /**
   * Get total retry count
   * @returns {number}
   */
  getTotalRetries() {
    return this._totalRetries;
  }

  /**
   * Get retry count for a specific node
   * @param {string} nodeId
   * @returns {number}
   */
  getNodeRetries(nodeId) {
    return this._retryByNode.get(nodeId) || 0;
  }

  /**
   * Check if retry budget is exceeded
   * @returns {boolean}
   */
  isRetryBudgetExceeded() {
    return this._totalRetries >= this._limits.maxTotalRetries;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILIZATION REPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get utilization report
   * @returns {Object}
   */
  getUtilizationReport() {
    const concurrencyUtil = this._limits.maxConcurrency > 0
      ? (this._activeNodes.size / this._limits.maxConcurrency) * 100
      : 0;

    const retryUtil = this._limits.maxTotalRetries > 0
      ? (this._totalRetries / this._limits.maxTotalRetries) * 100
      : 0;

    const tokenUtil = this._limits.maxLLMTokensPerGraph > 0
      ? (this._tokenUsage / this._limits.maxLLMTokensPerGraph) * 100
      : 0;

    return {
      concurrency: {
        current: this._activeNodes.size,
        limit: this._limits.maxConcurrency,
        percentage: Math.round(concurrencyUtil * 10) / 10
      },
      retries: {
        current: this._totalRetries,
        limit: this._limits.maxTotalRetries,
        percentage: Math.round(retryUtil * 10) / 10
      },
      tokens: {
        current: this._tokenUsage,
        limit: this._limits.maxLLMTokensPerGraph,
        percentage: Math.round(tokenUtil * 10) / 10
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESET
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Reset all runtime tracking (for reuse between executions)
   */
  reset() {
    this._tokenUsage = 0;
    this._totalRetries = 0;
    this._retryByNode.clear();
    this._activeNodes.clear();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all limits
   * @returns {Object}
   */
  getLimits() {
    return { ...this._limits };
  }

  /**
   * Get a specific limit
   * @param {string} limitName
   * @returns {number|undefined}
   */
  getLimit(limitName) {
    return this._limits[limitName];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  ResourceLimiter,
  DEFAULT_LIMITS,
  computeDAGDepth
};
