/**
 * ExecutionContext
 *
 * Stores cross-node outputs, global variables, and the original input
 * for the duration of a single AOPEG RuntimeEngine execution.
 * Provides expression and template contexts for downstream consumers.
 *
 * Node IDs are stored under both their original form (e.g. `G0-N02`)
 * and an underscore-normalized form (e.g. `G0_N02`) so that expression
 * languages that disallow hyphens in identifiers can reference outputs
 * without additional escaping.
 *
 * @module runtime/execution/ExecutionContext
 */

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Normalize a node ID for use in expressions (replace hyphens with underscores).
 * @param {string} id
 * @returns {string}
 */
function normalizeId(id) {
  return id.replace(/-/g, '_');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUTION CONTEXT CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Holds runtime state shared across nodes during a single execution run.
 */
class ExecutionContext {
  /**
   * @param {*} initialInput - The original input data passed to execute()
   */
  constructor(initialInput) {
    /** @type {*} Original input data */
    this.initialInput = initialInput;

    /**
     * Node outputs keyed by node ID.
     * Each output is stored twice: under the original ID and the
     * underscore-normalized ID (if they differ).
     * @type {Object<string, *>}
     */
    this.nodeOutputs = {};

    /**
     * Global variables set by set_variable executors.
     * @type {Object<string, *>}
     */
    this.variables = {};

    /**
     * Shared state Map for cross-node resource sharing (e.g., SQL connection pools).
     * Persists across all nodes in a single execution run.
     * @type {Map<string, *>}
     */
    this.sharedState = new Map();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NODE OUTPUTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Store output for a node under both original and normalized IDs.
   *
   * @param {string} nodeId - Original node ID (e.g. `G0-N02`)
   * @param {*} output - The output data produced by the node
   */
  setNodeOutput(nodeId, output) {
    this.nodeOutputs[nodeId] = output;

    const normalized = normalizeId(nodeId);
    if (normalized !== nodeId) {
      this.nodeOutputs[normalized] = output;
    }
  }

  /**
   * Retrieve the output of a previously executed node.
   * Accepts either the original or underscore-normalized form.
   *
   * @param {string} nodeId
   * @returns {*} The stored output, or undefined if not yet available
   */
  getNodeOutput(nodeId) {
    return this.nodeOutputs[nodeId];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL VARIABLES
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set a global variable (typically from a set_variable executor).
   *
   * @param {string} name
   * @param {*} value
   */
  setVariable(name, value) {
    this.variables[name] = value;
  }

  /**
   * Get a global variable by name.
   *
   * @param {string} name
   * @returns {*}
   */
  getVariable(name) {
    return this.variables[name];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTEXT ACCESSORS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Build a flat object suitable for expression evaluation.
   * Keys are underscore-normalized node IDs so they are valid identifiers
   * in most expression languages.
   *
   * Shape:
   * ```
   * {
   *   input: <initialInput>,
   *   <G0_N01>: <output>,
   *   <G0_N02>: <output>,
   *   ...variables
   * }
   * ```
   *
   * @returns {Object}
   */
  getExpressionContext() {
    const ctx = { input: this.initialInput };

    // Only include underscore-normalized keys (deduplicated)
    for (const [key, value] of Object.entries(this.nodeOutputs)) {
      const normalized = normalizeId(key);
      ctx[normalized] = value;
    }

    // Variables are merged at top level
    Object.assign(ctx, this.variables);

    return ctx;
  }

  /**
   * Build a structured object for template rendering.
   * Keeps original node IDs and separates concerns into named sections.
   *
   * Shape:
   * ```
   * {
   *   input: <initialInput>,
   *   nodeOutputs: { <originalId>: <output>, ... },
   *   variables: { ... }
   * }
   * ```
   *
   * @returns {{ input: *, nodeOutputs: Object<string, *>, variables: Object<string, *> }}
   */
  getTemplateContext() {
    // Filter to original (non-normalized) keys only
    const outputs = {};
    for (const [key, value] of Object.entries(this.nodeOutputs)) {
      // Keep the key if it matches its own normalized form OR contains a hyphen
      // (i.e. skip pure duplicates that were added for expression compat)
      if (key.includes('-') || normalizeId(key) === key) {
        outputs[key] = value;
      }
    }

    return {
      input: this.initialInput,
      nodeOutputs: outputs,
      variables: { ...this.variables }
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { ExecutionContext };
