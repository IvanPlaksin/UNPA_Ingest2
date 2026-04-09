/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH WALKER
 * Traverses execution graph, handles branching, parallel execution
 * Domain-agnostic: only knows about graph structure
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { EventEmitter } = require('events');
const { pluginRegistry } = require('../registry/plugin-registry');

// ────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Create an error result
 */
function createErrorResult(code, message, recoverable = false) {
  return {
    success: false,
    output: null,
    metadata: {},
    errors: [{ code, message, recoverable }],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH WALKER CLASS
// ────────────────────────────────────────────────────────────────────────────

class GraphWalker extends EventEmitter {
  constructor(graph) {
    super();
    this.graph = graph;
    this.nodeMap = new Map(graph.nodes.map(n => [n.id, n]));
    this.edgesBySource = this.buildEdgeMap();
  }

  buildEdgeMap() {
    const map = new Map();
    for (const edge of this.graph.edges) {
      const existing = map.get(edge.sourceNodeId) || [];
      existing.push(edge);
      // Sort by priority (lower = higher priority)
      map.set(edge.sourceNodeId, existing.sort((a, b) => a.priority - b.priority));
    }
    return map;
  }

  /**
   * Walk the graph starting from entry node
   */
  async walk(context) {
    return this.executeNode(this.graph.entryNodeId, context);
  }

  /**
   * Execute a single node and continue to next nodes
   */
  async executeNode(nodeId, context) {
    const node = this.nodeMap.get(nodeId);
    if (!node) {
      return createErrorResult('NODE_NOT_FOUND', `Node not found: ${nodeId}`);
    }

    // Get executor from registry
    const executor = pluginRegistry.getExecutor(node.executorType);
    if (!executor) {
      return createErrorResult(
        'EXECUTOR_NOT_FOUND',
        `No executor registered for type: ${node.executorType}`
      );
    }

    // Emit start event
    this.emit('node:start', { nodeId, node });

    const startTime = Date.now();
    let result;
    let retryCount = 0;

    try {
      // Execute with timeout and retry logic
      result = await this.executeWithRetry(node, context);
      retryCount = result.metadata.retryCount || 0;
    } catch (error) {
      // Handle unrecoverable error
      result = createErrorResult(
        'EXECUTION_ERROR',
        error instanceof Error ? error.message : String(error),
        false
      );

      this.emit('node:error', { nodeId, error });

      // Try fallback node if defined
      if (node.fallbackNodeId) {
        this.emit('fallback:triggered', {
          originalNodeId: nodeId,
          fallbackNodeId: node.fallbackNodeId,
        });
        return this.executeNode(node.fallbackNodeId, context);
      }
    }

    const duration = Date.now() - startTime;

    // Store output in context
    context.nodeOutputs.set(nodeId, result.output);

    // Add execution metadata
    result.metadata = {
      ...result.metadata,
      nodeId,
      duration,
      retryCount,
    };

    // Emit complete event
    this.emit('node:complete', { nodeId, result, duration });

    // Check quality threshold
    if (node.qualityThreshold !== undefined && result.qualityScore !== undefined) {
      if (result.qualityScore < node.qualityThreshold) {
        result.success = false;
        result.errors.push({
          code: 'QUALITY_THRESHOLD_NOT_MET',
          message: `Quality ${result.qualityScore.toFixed(2)} < threshold ${node.qualityThreshold}`,
          recoverable: false,
        });
      }
    }

    // If this is an exit node, return result
    if (this.graph.exitNodeIds.includes(nodeId)) {
      return result;
    }

    // Find and execute next nodes
    return this.executeNextNodes(nodeId, result, context);
  }

  /**
   * Execute node with timeout and retry logic
   */
  async executeWithRetry(node, context) {
    const executor = pluginRegistry.getExecutor(node.executorType);
    const { maxRetries, backoffMs, backoffMultiplier, retryableErrors } = node.retryPolicy || {
      maxRetries: 3,
      backoffMs: 1000,
      backoffMultiplier: 2,
      retryableErrors: [],
    };

    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        // Execute with timeout
        const result = await this.executeWithTimeout(
          executor.execute(node.parameters, context),
          node.timeout || 30000
        );

        if (result.success) {
          result.metadata = result.metadata || {};
          result.metadata.retryCount = attempt;
          return result;
        }

        // Check if error is retryable
        const hasRetryableError = result.errors && result.errors.some(e =>
          e.recoverable || (retryableErrors && retryableErrors.includes(e.code))
        );

        if (!hasRetryableError || attempt >= maxRetries) {
          result.metadata = result.metadata || {};
          result.metadata.retryCount = attempt;
          return result;
        }

        lastError = new Error(result.errors[0]?.message || 'Unknown error');
      } catch (error) {
        lastError = error;

        // Check if should retry
        if (attempt >= maxRetries) {
          throw error;
        }
      }

      // Emit retry event
      this.emit('node:retry', {
        nodeId: node.id,
        attempt: attempt + 1,
        maxRetries,
        error: lastError,
      });

      // Wait before retry with exponential backoff
      const waitTime = backoffMs * Math.pow(backoffMultiplier, attempt);
      await this.sleep(waitTime);

      attempt++;
    }

    // Should not reach here, but handle just in case
    throw lastError || new Error('Max retries exceeded');
  }

  /**
   * Execute with timeout
   */
  async executeWithTimeout(promise, timeoutMs) {
    const timeout = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Execution timeout after ${timeoutMs}ms`)), timeoutMs);
    });
    return Promise.race([promise, timeout]);
  }

  /**
   * Execute next nodes based on edge conditions
   */
  async executeNextNodes(sourceNodeId, sourceResult, context) {
    const outgoingEdges = this.edgesBySource.get(sourceNodeId) || [];

    if (outgoingEdges.length === 0) {
      return sourceResult;
    }

    // Evaluate conditions and select edges
    const selectedEdges = await this.selectEdges(outgoingEdges, sourceResult, context);

    this.emit('branch:selected', { sourceNodeId, selectedEdges });

    if (selectedEdges.length === 0) {
      return sourceResult;
    }

    if (selectedEdges.length === 1) {
      // Sequential execution
      const edge = selectedEdges[0];
      const nextInput = await this.applyDataMapping(
        sourceResult.output,
        edge.dataMapping,
        context
      );
      const nextContext = { ...context, input: nextInput };
      return this.executeNode(edge.targetNodeId, nextContext);
    }

    // Parallel execution
    return this.executeParallel(selectedEdges, sourceResult, context);
  }

  /**
   * Select edges based on conditions
   */
  async selectEdges(edges, nodeResult, context) {
    const selected = [];

    for (const edge of edges) {
      if (!edge.condition) {
        // No condition = always selected
        selected.push(edge);
        continue;
      }

      const evaluator = pluginRegistry.getCondition(edge.condition.type);
      if (!evaluator) {
        console.warn(`[GraphWalker] No condition evaluator for type: ${edge.condition.type}`);
        continue;
      }

      try {
        const result = await evaluator.evaluate(edge.condition, nodeResult, context);
        if (result) {
          selected.push(edge);
        }
      } catch (error) {
        console.error(
          `[GraphWalker] Error evaluating condition ${edge.condition.type}:`,
          error
        );
      }
    }

    return selected;
  }

  /**
   * Execute multiple branches in parallel
   */
  async executeParallel(edges, sourceResult, context) {
    const nodeIds = edges.map(e => e.targetNodeId);
    this.emit('parallel:start', { nodeIds });

    const results = new Map();

    const promises = edges.map(async (edge) => {
      const nextInput = await this.applyDataMapping(
        sourceResult.output,
        edge.dataMapping,
        context
      );

      // Create branch context with copied nodeOutputs
      const branchContext = {
        ...context,
        input: nextInput,
        nodeOutputs: new Map(context.nodeOutputs),
      };

      const result = await this.executeNode(edge.targetNodeId, branchContext);
      results.set(edge.targetNodeId, result);

      // Merge branch outputs back to main context
      for (const [key, value] of branchContext.nodeOutputs) {
        context.nodeOutputs.set(key, value);
      }

      return result;
    });

    await Promise.all(promises);

    this.emit('parallel:complete', { results });

    // Merge parallel results
    return this.mergeParallelResults(results);
  }

  /**
   * Merge results from parallel branches
   */
  mergeParallelResults(results) {
    const outputs = [];
    const allErrors = [];
    let allSuccess = true;
    let totalQuality = 0;
    let qualityCount = 0;

    for (const [, result] of results) {
      outputs.push(result.output);
      allErrors.push(...(result.errors || []));
      if (!result.success) allSuccess = false;
      if (result.qualityScore !== undefined) {
        totalQuality += result.qualityScore;
        qualityCount++;
      }
    }

    return {
      success: allSuccess,
      output: outputs,
      metadata: { parallelResults: results.size },
      qualityScore: qualityCount > 0 ? totalQuality / qualityCount : undefined,
      errors: allErrors,
    };
  }

  /**
   * Apply data mapping to transform output for next node
   */
  async applyDataMapping(output, mappings, context) {
    if (!mappings || mappings.length === 0) {
      return output;
    }

    const result = {};

    for (const mapping of mappings) {
      let value = this.getValueByPath(output, mapping.sourceField);

      // Apply transformer if specified
      if (mapping.transformer) {
        const transformer = pluginRegistry.getTransformer(mapping.transformer.type);
        if (transformer) {
          try {
            value = await transformer.transform(value, mapping.transformer.config, context);
          } catch (error) {
            console.error(
              `[GraphWalker] Error applying transformer ${mapping.transformer.type}:`,
              error
            );
          }
        }
      }

      this.setValueByPath(result, mapping.targetField, value);
    }

    return result;
  }

  /**
   * Get value by dot-notation path
   */
  getValueByPath(obj, path) {
    if (!path || path === '$') return obj;

    const parts = path.split('.');
    let value = obj;

    for (const part of parts) {
      if (value && typeof value === 'object') {
        // Handle array index
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, key, index] = arrayMatch;
          value = value[key];
          if (Array.isArray(value)) {
            value = value[parseInt(index)];
          }
        } else {
          value = value[part];
        }
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set value by dot-notation path
   */
  setValueByPath(obj, path, value) {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get graph being walked
   */
  getGraph() {
    return this.graph;
  }

  /**
   * Get node by ID
   */
  getNode(nodeId) {
    return this.nodeMap.get(nodeId);
  }

  /**
   * Get outgoing edges for a node
   */
  getOutgoingEdges(nodeId) {
    return this.edgesBySource.get(nodeId) || [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// FACTORY FUNCTION
// ────────────────────────────────────────────────────────────────────────────

function createGraphWalker(graph) {
  return new GraphWalker(graph);
}

module.exports = {
  GraphWalker,
  createGraphWalker,
  createErrorResult,
};
