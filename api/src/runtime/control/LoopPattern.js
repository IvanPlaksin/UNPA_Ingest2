/**
 * LoopPattern
 *
 * Control flow component for iterative execution in graph-based workflows.
 * Supports various loop patterns: for-each, while, do-while, count-based.
 *
 * Features:
 * - For-each iteration over collections
 * - While loops with condition evaluation
 * - Do-while loops (execute at least once)
 * - Count-based loops with limits
 * - Break/continue support
 * - Iteration context (index, isFirst, isLast, etc.)
 *
 * Part of GXE Runtime Environment P2.
 *
 * @module runtime/control/LoopPattern
 */

const { ExpressionSandbox } = require('../safety/ExpressionSandbox');

// ═══════════════════════════════════════════════════════════════════════════
// TYPES AND CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loop type enumeration
 */
const LoopType = {
  FOR_EACH: 'for_each',
  WHILE: 'while',
  DO_WHILE: 'do_while',
  COUNT: 'count'
};

/**
 * Loop state
 */
const LoopState = {
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  ABORTED: 'aborted'
};

/**
 * Iteration context provided to loop body
 * @typedef {Object} IterationContext
 * @property {number} index - Current iteration index (0-based)
 * @property {number} iteration - Current iteration number (1-based)
 * @property {any} item - Current item (for FOR_EACH)
 * @property {any} key - Current key (for FOR_EACH with objects)
 * @property {boolean} isFirst - Whether this is the first iteration
 * @property {boolean} isLast - Whether this is the last iteration (known for FOR_EACH)
 * @property {number} total - Total count (known for FOR_EACH and COUNT)
 * @property {number} remaining - Remaining iterations (known for FOR_EACH and COUNT)
 */

/**
 * Loop result
 * @typedef {Object} LoopResult
 * @property {boolean} completed - Whether loop completed normally
 * @property {string} state - Final loop state
 * @property {number} iterations - Number of iterations executed
 * @property {Array<any>} results - Collected results from each iteration
 * @property {string|null} breakReason - Reason for break, if any
 * @property {number} durationMs - Total loop duration
 */

// ═══════════════════════════════════════════════════════════════════════════
// LOOP PATTERN CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Loop control flow for workflows
 */
class LoopPattern {
  /**
   * @param {Object} config
   * @param {string} config.id - Node ID for this loop
   * @param {string} config.type - Loop type (for_each, while, do_while, count)
   * @param {string} [config.collection] - Expression to get collection (for FOR_EACH)
   * @param {string} [config.condition] - Condition expression (for WHILE/DO_WHILE)
   * @param {number} [config.count] - Iteration count (for COUNT)
   * @param {number} [config.maxIterations=1000] - Safety limit
   * @param {number} [config.timeoutMs=1000] - Expression evaluation timeout
   */
  constructor(config) {
    this._id = config.id;
    this._type = config.type || LoopType.FOR_EACH;
    this._collection = config.collection || 'data.items';
    this._condition = config.condition || 'true';
    this._count = config.count || 10;
    this._maxIterations = config.maxIterations || 1000;

    this._state = LoopState.IDLE;
    this._currentIndex = 0;
    this._results = [];
    this._shouldBreak = false;
    this._shouldContinue = false;
    this._breakReason = null;

    this._sandbox = new ExpressionSandbox({
      timeoutMs: config.timeoutMs || 1000
    });

    // Track iterations executed (for results)
    this._iterationsExecuted = 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE EXECUTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Execute the loop with a callback for each iteration
   * @param {Object} context - Execution context
   * @param {Function} bodyFn - Async function to execute for each iteration
   * @returns {Promise<LoopResult>}
   */
  async execute(context = {}, bodyFn) {
    const startTime = Date.now();
    this._reset();
    this._state = LoopState.RUNNING;

    try {
      switch (this._type) {
        case LoopType.FOR_EACH:
          await this._executeForEach(context, bodyFn);
          break;
        case LoopType.WHILE:
          await this._executeWhile(context, bodyFn);
          break;
        case LoopType.DO_WHILE:
          await this._executeDoWhile(context, bodyFn);
          break;
        case LoopType.COUNT:
          await this._executeCount(context, bodyFn);
          break;
        default:
          throw new Error(`Unknown loop type: ${this._type}`);
      }

      if (this._shouldBreak) {
        this._state = LoopState.ABORTED;
      } else {
        this._state = LoopState.COMPLETED;
      }
    } catch (error) {
      this._state = LoopState.ABORTED;
      this._breakReason = error.message;
    }

    return {
      completed: this._state === LoopState.COMPLETED,
      state: this._state,
      iterations: this._iterationsExecuted,
      results: this._results,
      breakReason: this._breakReason,
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Execute synchronous loop (no async body)
   * @param {Object} context
   * @param {Function} bodyFn - Sync function to execute for each iteration
   * @returns {LoopResult}
   */
  executeSync(context = {}, bodyFn) {
    const startTime = Date.now();
    this._reset();
    this._state = LoopState.RUNNING;

    try {
      switch (this._type) {
        case LoopType.FOR_EACH:
          this._executeForEachSync(context, bodyFn);
          break;
        case LoopType.WHILE:
          this._executeWhileSync(context, bodyFn);
          break;
        case LoopType.DO_WHILE:
          this._executeDoWhileSync(context, bodyFn);
          break;
        case LoopType.COUNT:
          this._executeCountSync(context, bodyFn);
          break;
        default:
          throw new Error(`Unknown loop type: ${this._type}`);
      }

      if (this._shouldBreak) {
        this._state = LoopState.ABORTED;
      } else {
        this._state = LoopState.COMPLETED;
      }
    } catch (error) {
      this._state = LoopState.ABORTED;
      this._breakReason = error.message;
    }

    return {
      completed: this._state === LoopState.COMPLETED,
      state: this._state,
      iterations: this._iterationsExecuted,
      results: this._results,
      breakReason: this._breakReason,
      durationMs: Date.now() - startTime
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOOP TYPE IMPLEMENTATIONS (ASYNC)
  // ═══════════════════════════════════════════════════════════════════════════

  async _executeForEach(context, bodyFn) {
    const collection = this._getCollection(context);
    const items = this._normalizeCollection(collection);
    const total = items.length;

    for (let i = 0; i < total && !this._shouldBreak; i++) {
      if (this._iterationsExecuted >= this._maxIterations) {
        this._breakReason = `Max iterations (${this._maxIterations}) exceeded`;
        break;
      }

      this._currentIndex = i;
      const iterCtx = this._createIterationContext(i, items[i].value, items[i].key, total);

      const result = await bodyFn(iterCtx, { ...context, iteration: iterCtx });
      this._results.push(result);
      this._iterationsExecuted++;
    }
  }

  async _executeWhile(context, bodyFn) {
    let i = 0;

    while (this._evaluateCondition(context, i) && !this._shouldBreak) {
      if (this._iterationsExecuted >= this._maxIterations) {
        this._breakReason = `Max iterations (${this._maxIterations}) exceeded`;
        break;
      }

      this._currentIndex = i;
      const iterCtx = this._createIterationContext(i, null, null, null);

      const result = await bodyFn(iterCtx, { ...context, iteration: iterCtx });
      this._results.push(result);
      this._iterationsExecuted++;
      i++;
    }
  }

  async _executeDoWhile(context, bodyFn) {
    let i = 0;

    do {
      if (this._iterationsExecuted >= this._maxIterations) {
        this._breakReason = `Max iterations (${this._maxIterations}) exceeded`;
        break;
      }

      this._currentIndex = i;
      const iterCtx = this._createIterationContext(i, null, null, null);

      const result = await bodyFn(iterCtx, { ...context, iteration: iterCtx });
      this._results.push(result);
      this._iterationsExecuted++;
      i++;
    } while (this._evaluateCondition(context, i) && !this._shouldBreak);
  }

  async _executeCount(context, bodyFn) {
    for (let i = 0; i < this._count && !this._shouldBreak; i++) {
      if (this._iterationsExecuted >= this._maxIterations) {
        this._breakReason = `Max iterations (${this._maxIterations}) exceeded`;
        break;
      }

      this._currentIndex = i;
      const iterCtx = this._createIterationContext(i, null, null, this._count);

      const result = await bodyFn(iterCtx, { ...context, iteration: iterCtx });
      this._results.push(result);
      this._iterationsExecuted++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOOP TYPE IMPLEMENTATIONS (SYNC)
  // ═══════════════════════════════════════════════════════════════════════════

  _executeForEachSync(context, bodyFn) {
    const collection = this._getCollection(context);
    const items = this._normalizeCollection(collection);
    const total = items.length;

    for (let i = 0; i < total && !this._shouldBreak; i++) {
      if (this._iterationsExecuted >= this._maxIterations) {
        this._breakReason = `Max iterations (${this._maxIterations}) exceeded`;
        break;
      }

      this._currentIndex = i;
      const iterCtx = this._createIterationContext(i, items[i].value, items[i].key, total);

      const result = bodyFn(iterCtx, { ...context, iteration: iterCtx });
      this._results.push(result);
      this._iterationsExecuted++;
    }
  }

  _executeWhileSync(context, bodyFn) {
    let i = 0;

    while (this._evaluateCondition(context, i) && !this._shouldBreak) {
      if (this._iterationsExecuted >= this._maxIterations) {
        this._breakReason = `Max iterations (${this._maxIterations}) exceeded`;
        break;
      }

      this._currentIndex = i;
      const iterCtx = this._createIterationContext(i, null, null, null);

      const result = bodyFn(iterCtx, { ...context, iteration: iterCtx });
      this._results.push(result);
      this._iterationsExecuted++;
      i++;
    }
  }

  _executeDoWhileSync(context, bodyFn) {
    let i = 0;

    do {
      if (this._iterationsExecuted >= this._maxIterations) {
        this._breakReason = `Max iterations (${this._maxIterations}) exceeded`;
        break;
      }

      this._currentIndex = i;
      const iterCtx = this._createIterationContext(i, null, null, null);

      const result = bodyFn(iterCtx, { ...context, iteration: iterCtx });
      this._results.push(result);
      this._iterationsExecuted++;
      i++;
    } while (this._evaluateCondition(context, i) && !this._shouldBreak);
  }

  _executeCountSync(context, bodyFn) {
    for (let i = 0; i < this._count && !this._shouldBreak; i++) {
      if (this._iterationsExecuted >= this._maxIterations) {
        this._breakReason = `Max iterations (${this._maxIterations}) exceeded`;
        break;
      }

      this._currentIndex = i;
      const iterCtx = this._createIterationContext(i, null, null, this._count);

      const result = bodyFn(iterCtx, { ...context, iteration: iterCtx });
      this._results.push(result);
      this._iterationsExecuted++;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROL METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Signal loop to break
   * @param {string} [reason]
   */
  break(reason) {
    this._shouldBreak = true;
    this._breakReason = reason || 'User break';
  }

  /**
   * Pause loop execution
   */
  pause() {
    if (this._state === LoopState.RUNNING) {
      this._state = LoopState.PAUSED;
    }
  }

  /**
   * Resume loop execution
   */
  resume() {
    if (this._state === LoopState.PAUSED) {
      this._state = LoopState.RUNNING;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate loop configuration
   * @returns {{valid: boolean, errors: string[]}}
   */
  validate() {
    const errors = [];

    if (this._type === LoopType.FOR_EACH) {
      const validation = this._sandbox.validate(this._collection);
      if (!validation.valid) {
        errors.push(`Invalid collection expression: ${validation.error}`);
      }
    }

    if (this._type === LoopType.WHILE || this._type === LoopType.DO_WHILE) {
      const validation = this._sandbox.validate(this._condition);
      if (!validation.valid) {
        errors.push(`Invalid condition expression: ${validation.error}`);
      }

      const safety = this._sandbox.checkSafety(this._condition);
      if (!safety.safe) {
        errors.push(`Unsafe condition: ${safety.warnings.join(', ')}`);
      }
    }

    if (this._type === LoopType.COUNT && (!Number.isInteger(this._count) || this._count < 0)) {
      errors.push('Count must be a non-negative integer');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SERIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Export to JSON
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this._id,
      type: this._type,
      collection: this._type === LoopType.FOR_EACH ? this._collection : undefined,
      condition: (this._type === LoopType.WHILE || this._type === LoopType.DO_WHILE) ? this._condition : undefined,
      count: this._type === LoopType.COUNT ? this._count : undefined,
      maxIterations: this._maxIterations,
      config: {
        timeoutMs: this._sandbox.config.timeoutMs
      }
    };
  }

  /**
   * Create from JSON
   * @param {Object} json
   * @returns {LoopPattern}
   */
  static fromJSON(json) {
    return new LoopPattern({
      id: json.id,
      type: json.type,
      collection: json.collection,
      condition: json.condition,
      count: json.count,
      maxIterations: json.maxIterations,
      timeoutMs: json.config?.timeoutMs
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  _reset() {
    this._state = LoopState.IDLE;
    this._currentIndex = 0;
    this._iterationsExecuted = 0;
    this._results = [];
    this._shouldBreak = false;
    this._breakReason = null;
  }

  _getCollection(context) {
    return this._sandbox.evaluate(this._collection, context);
  }

  _normalizeCollection(collection) {
    if (Array.isArray(collection)) {
      return collection.map((value, index) => ({ key: index, value }));
    }
    if (collection && typeof collection === 'object') {
      return Object.entries(collection).map(([key, value]) => ({ key, value }));
    }
    if (typeof collection === 'string') {
      return collection.split('').map((value, index) => ({ key: index, value }));
    }
    return [];
  }

  _evaluateCondition(context, currentIteration) {
    try {
      return this._sandbox.evaluateCondition(this._condition, {
        ...context,
        iteration: currentIteration
      });
    } catch (error) {
      // Condition evaluation error breaks the loop
      this._breakReason = `Condition error: ${error.message}`;
      return false;
    }
  }

  _createIterationContext(index, item, key, total) {
    return {
      index,
      iteration: index + 1,
      item,
      key,
      isFirst: index === 0,
      isLast: total !== null ? index === total - 1 : false,
      total: total,
      remaining: total !== null ? total - index - 1 : null
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  get id() { return this._id; }
  get type() { return this._type; }
  get state() { return this._state; }
  get currentIndex() { return this._currentIndex; }
  get results() { return [...this._results]; }
  get isRunning() { return this._state === LoopState.RUNNING; }
  get isPaused() { return this._state === LoopState.PAUSED; }
  get isCompleted() { return this._state === LoopState.COMPLETED; }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a for-each loop
 * @param {string} id
 * @param {string} collection - Expression to get iterable
 * @param {Object} [options]
 * @returns {LoopPattern}
 */
function createForEach(id, collection, options = {}) {
  return new LoopPattern({
    id,
    type: LoopType.FOR_EACH,
    collection,
    ...options
  });
}

/**
 * Create a while loop
 * @param {string} id
 * @param {string} condition - Condition expression
 * @param {Object} [options]
 * @returns {LoopPattern}
 */
function createWhile(id, condition, options = {}) {
  return new LoopPattern({
    id,
    type: LoopType.WHILE,
    condition,
    ...options
  });
}

/**
 * Create a do-while loop
 * @param {string} id
 * @param {string} condition - Condition expression
 * @param {Object} [options]
 * @returns {LoopPattern}
 */
function createDoWhile(id, condition, options = {}) {
  return new LoopPattern({
    id,
    type: LoopType.DO_WHILE,
    condition,
    ...options
  });
}

/**
 * Create a count-based loop
 * @param {string} id
 * @param {number} count - Number of iterations
 * @param {Object} [options]
 * @returns {LoopPattern}
 */
function createCountLoop(id, count, options = {}) {
  return new LoopPattern({
    id,
    type: LoopType.COUNT,
    count,
    ...options
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  LoopPattern,
  LoopType,
  LoopState,
  createForEach,
  createWhile,
  createDoWhile,
  createCountLoop
};
