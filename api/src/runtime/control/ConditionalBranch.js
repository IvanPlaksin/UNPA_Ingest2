/**
 * ConditionalBranch
 *
 * Control flow component for conditional branching in graph-based workflows.
 * Evaluates conditions using ExpressionSandbox and routes execution accordingly.
 *
 * Features:
 * - If/else branching
 * - Multiple condition branches (switch-like)
 * - Default fallback branch
 * - Short-circuit evaluation
 *
 * Part of GXE Runtime Environment P2.
 *
 * @module runtime/control/ConditionalBranch
 */

const { ExpressionSandbox } = require('../safety/ExpressionSandbox');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Branch evaluation result
 * @typedef {Object} BranchResult
 * @property {string|null} selectedBranch - ID of selected branch, null if none
 * @property {boolean} matched - Whether any condition matched
 * @property {Object} context - Evaluation context snapshot
 * @property {Array<{branchId: string, condition: string, result: boolean}>} evaluations - All branch evaluations
 */

/**
 * Branch definition
 * @typedef {Object} BranchDefinition
 * @property {string} id - Unique branch identifier
 * @property {string} condition - Expression to evaluate
 * @property {boolean} [isDefault] - Whether this is the default branch
 * @property {number} [priority] - Evaluation priority (lower = first)
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONDITIONAL BRANCH CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Conditional branching control for workflows
 */
class ConditionalBranch {
  /**
   * @param {Object} config
   * @param {string} config.id - Node ID for this branch point
   * @param {Array<BranchDefinition>} config.branches - Branch definitions
   * @param {boolean} [config.shortCircuit=true] - Stop on first match
   * @param {number} [config.timeoutMs=1000] - Expression evaluation timeout
   */
  constructor(config) {
    this._id = config.id;
    this._branches = this._normalizeBranches(config.branches || []);
    this._shortCircuit = config.shortCircuit !== false;
    this._sandbox = new ExpressionSandbox({
      timeoutMs: config.timeoutMs || 1000
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate all branches and determine which one to take
   * @param {Object} context - Execution context with data, input, output, variables
   * @returns {BranchResult}
   */
  evaluate(context = {}) {
    const evaluations = [];
    let selectedBranch = null;
    let defaultBranch = null;

    // Sort branches by priority
    const sortedBranches = [...this._branches].sort((a, b) =>
      (a.priority ?? Infinity) - (b.priority ?? Infinity)
    );

    for (const branch of sortedBranches) {
      // Skip default branch in first pass
      if (branch.isDefault) {
        defaultBranch = branch.id;
        continue;
      }

      const evaluation = {
        branchId: branch.id,
        condition: branch.condition,
        result: false,
        error: null
      };

      try {
        evaluation.result = this._sandbox.evaluateCondition(branch.condition, context);
      } catch (error) {
        evaluation.error = error.message;
        evaluation.result = false;
      }

      evaluations.push(evaluation);

      // Short-circuit on first match
      if (evaluation.result && this._shortCircuit) {
        selectedBranch = branch.id;
        break;
      }

      // Track first match for non-short-circuit mode
      if (evaluation.result && !selectedBranch) {
        selectedBranch = branch.id;
      }
    }

    // Use default branch if no match found
    if (!selectedBranch && defaultBranch) {
      selectedBranch = defaultBranch;
      evaluations.push({
        branchId: defaultBranch,
        condition: 'default',
        result: true,
        error: null
      });
    }

    return {
      selectedBranch,
      matched: selectedBranch !== null,
      context: this._snapshotContext(context),
      evaluations
    };
  }

  /**
   * Evaluate and return all matching branches (no short-circuit)
   * @param {Object} context
   * @returns {{branches: string[], evaluations: Array}}
   */
  evaluateAll(context = {}) {
    const evaluations = [];
    const matchingBranches = [];
    let defaultBranch = null;

    for (const branch of this._branches) {
      if (branch.isDefault) {
        defaultBranch = branch.id;
        continue;
      }

      const evaluation = {
        branchId: branch.id,
        condition: branch.condition,
        result: false,
        error: null
      };

      try {
        evaluation.result = this._sandbox.evaluateCondition(branch.condition, context);
      } catch (error) {
        evaluation.error = error.message;
        evaluation.result = false;
      }

      evaluations.push(evaluation);

      if (evaluation.result) {
        matchingBranches.push(branch.id);
      }
    }

    // If no matches, include default branch
    if (matchingBranches.length === 0 && defaultBranch) {
      matchingBranches.push(defaultBranch);
      evaluations.push({
        branchId: defaultBranch,
        condition: 'default',
        result: true,
        error: null
      });
    }

    return {
      branches: matchingBranches,
      evaluations
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SIMPLE IF/ELSE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Simple if/else evaluation
   * @param {string} condition - Condition expression
   * @param {Object} context
   * @returns {{result: boolean, branch: 'if'|'else', error?: string}}
   */
  ifElse(condition, context = {}) {
    try {
      const result = this._sandbox.evaluateCondition(condition, context);
      return {
        result,
        branch: result ? 'if' : 'else',
        error: null
      };
    } catch (error) {
      return {
        result: false,
        branch: 'else',
        error: error.message
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate all branch conditions
   * @returns {{valid: boolean, errors: Array<{branchId: string, error: string}>}}
   */
  validate() {
    const errors = [];

    for (const branch of this._branches) {
      if (branch.isDefault) continue;

      const validation = this._sandbox.validate(branch.condition);
      if (!validation.valid) {
        errors.push({
          branchId: branch.id,
          error: validation.error
        });
      }

      const safety = this._sandbox.checkSafety(branch.condition);
      if (!safety.safe) {
        errors.push({
          branchId: branch.id,
          error: `Unsafe expression: ${safety.warnings.join(', ')}`
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // BRANCH MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Add a new branch
   * @param {BranchDefinition} branch
   */
  addBranch(branch) {
    const normalized = this._normalizeBranch(branch);
    this._branches.push(normalized);
  }

  /**
   * Remove a branch by ID
   * @param {string} branchId
   * @returns {boolean} Whether branch was removed
   */
  removeBranch(branchId) {
    const index = this._branches.findIndex(b => b.id === branchId);
    if (index >= 0) {
      this._branches.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Update a branch condition
   * @param {string} branchId
   * @param {string} newCondition
   * @returns {boolean} Whether branch was updated
   */
  updateCondition(branchId, newCondition) {
    const branch = this._branches.find(b => b.id === branchId);
    if (branch) {
      branch.condition = newCondition;
      return true;
    }
    return false;
  }

  /**
   * Get all branches
   * @returns {Array<BranchDefinition>}
   */
  getBranches() {
    return [...this._branches];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export to JSON-serializable format
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this._id,
      type: 'conditional_branch',
      branches: this._branches.map(b => ({
        id: b.id,
        condition: b.condition,
        isDefault: b.isDefault || false,
        priority: b.priority ?? null
      })),
      config: {
        shortCircuit: this._shortCircuit,
        timeoutMs: this._sandbox.config.timeoutMs
      }
    };
  }

  /**
   * Create from JSON
   * @param {Object} json
   * @returns {ConditionalBranch}
   */
  static fromJSON(json) {
    return new ConditionalBranch({
      id: json.id,
      branches: json.branches,
      shortCircuit: json.config?.shortCircuit,
      timeoutMs: json.config?.timeoutMs
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Normalize branch definitions
   * @private
   */
  _normalizeBranches(branches) {
    return branches.map(b => this._normalizeBranch(b));
  }

  /**
   * Normalize single branch definition
   * @private
   */
  _normalizeBranch(branch) {
    return {
      id: branch.id || `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      condition: branch.condition || 'true',
      isDefault: branch.isDefault || false,
      priority: branch.priority ?? null
    };
  }

  /**
   * Create context snapshot for debugging
   * @private
   */
  _snapshotContext(context) {
    return {
      hasData: !!context.data,
      hasInput: !!context.input,
      hasOutput: !!context.output,
      hasVariables: !!context.variables,
      iteration: context.iteration ?? 0
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  get id() {
    return this._id;
  }

  get branchCount() {
    return this._branches.length;
  }

  get shortCircuit() {
    return this._shortCircuit;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a simple if/else branch
 * @param {string} id
 * @param {string} condition
 * @returns {ConditionalBranch}
 */
function createIfElse(id, condition) {
  return new ConditionalBranch({
    id,
    branches: [
      { id: 'if', condition },
      { id: 'else', isDefault: true }
    ]
  });
}

/**
 * Create a switch-case style branch
 * @param {string} id
 * @param {string} expression - Expression to evaluate
 * @param {Array<{value: any, branchId: string}>} cases
 * @param {string} [defaultBranchId='default']
 * @returns {ConditionalBranch}
 */
function createSwitch(id, expression, cases, defaultBranchId = 'default') {
  const branches = cases.map((c, i) => ({
    id: c.branchId,
    condition: `(${expression}) === ${JSON.stringify(c.value)}`,
    priority: i
  }));

  branches.push({
    id: defaultBranchId,
    isDefault: true
  });

  return new ConditionalBranch({
    id,
    branches,
    shortCircuit: true
  });
}

/**
 * Create a range-based branch (useful for numeric thresholds)
 * @param {string} id
 * @param {string} expression - Expression to get numeric value
 * @param {Array<{min?: number, max?: number, branchId: string}>} ranges
 * @param {string} [defaultBranchId='default']
 * @returns {ConditionalBranch}
 */
function createRangeBranch(id, expression, ranges, defaultBranchId = 'default') {
  const branches = ranges.map((r, i) => {
    const conditions = [];
    if (r.min !== undefined) conditions.push(`(${expression}) >= ${r.min}`);
    if (r.max !== undefined) conditions.push(`(${expression}) < ${r.max}`);

    return {
      id: r.branchId,
      condition: conditions.length > 0 ? conditions.join(' && ') : 'true',
      priority: i
    };
  });

  branches.push({
    id: defaultBranchId,
    isDefault: true
  });

  return new ConditionalBranch({
    id,
    branches,
    shortCircuit: true
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  ConditionalBranch,
  createIfElse,
  createSwitch,
  createRangeBranch
};
