/**
 * ExpressionSandbox
 *
 * Secure JavaScript expression evaluator for conditional branching and loops.
 * Uses Node.js vm module to isolate execution without access to fs/network/process.
 *
 * Part of GXE Runtime Environment P2.
 *
 * @module runtime/safety/ExpressionSandbox
 */

const vm = require('node:vm');
const crypto = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  timeoutMs: 1000,           // Max execution time
  maxOutputSize: 1048576,    // 1MB max output size
  maxDepth: 100              // Max object depth for deepFreeze
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deep freeze an object to prevent mutation
 * @param {any} obj
 * @param {number} depth - Current depth
 * @param {number} maxDepth - Maximum depth
 * @returns {any} Frozen object
 */
function deepFreeze(obj, depth = 0, maxDepth = 100) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (depth > maxDepth) {
    return obj; // Don't recurse too deep
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => {
      obj[i] = deepFreeze(item, depth + 1, maxDepth);
    });
    return Object.freeze(obj);
  }

  // Handle objects
  const keys = Object.keys(obj);
  for (const key of keys) {
    obj[key] = deepFreeze(obj[key], depth + 1, maxDepth);
  }

  return Object.freeze(obj);
}

/**
 * Get nested value by dot-notation path
 * @param {any} obj
 * @param {string} path - Dot-notation path (e.g., "a.b.c")
 * @param {any} defaultValue
 * @returns {any}
 */
function getByPath(obj, path, defaultValue = undefined) {
  if (!path || typeof path !== 'string') return defaultValue;
  if (obj === null || obj === undefined) return defaultValue;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return defaultValue;
    }

    // Handle array index notation: items[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key];
      if (!Array.isArray(current)) return defaultValue;
      current = current[parseInt(index, 10)];
    } else {
      current = current[part];
    }
  }

  return current !== undefined ? current : defaultValue;
}

/**
 * Check if path exists in object
 * @param {any} obj
 * @param {string} path
 * @returns {boolean}
 */
function hasPath(obj, path) {
  if (!path || typeof path !== 'string') return false;
  if (obj === null || obj === undefined) return false;

  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return false;
    }
    if (typeof current !== 'object') {
      return false;
    }

    // Handle array index notation
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      if (!(key in current)) return false;
      current = current[key];
      if (!Array.isArray(current)) return false;
      const idx = parseInt(index, 10);
      if (idx < 0 || idx >= current.length) return false;
      current = current[idx];
    } else {
      if (!(part in current)) return false;
      current = current[part];
    }
  }

  return true;
}

/**
 * Get length of value (array, string, object keys)
 * @param {any} val
 * @returns {number}
 */
function getLength(val) {
  if (val === null || val === undefined) return 0;
  if (Array.isArray(val)) return val.length;
  if (typeof val === 'string') return val.length;
  if (typeof val === 'object') return Object.keys(val).length;
  return 0;
}

/**
 * Test if string matches regex pattern
 * @param {string} str
 * @param {string} pattern
 * @returns {boolean}
 */
function matchPattern(str, pattern) {
  if (typeof str !== 'string') return false;
  try {
    return new RegExp(pattern).test(str);
  } catch (e) {
    return false; // Invalid regex
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPRESSION SANDBOX CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Secure expression evaluator using Node.js vm
 */
class ExpressionSandbox {
  /**
   * @param {Object} config
   * @param {number} [config.timeoutMs=1000] - Execution timeout
   * @param {number} [config.maxOutputSize=1048576] - Max output size
   */
  constructor(config = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate a JavaScript expression in isolated context
   * @param {string} expression - JavaScript expression to evaluate
   * @param {Object} context - Context data available to expression
   * @returns {any} Evaluation result
   * @throws {Error} On timeout, syntax error, or security violation
   */
  evaluate(expression, context = {}) {
    if (typeof expression !== 'string') {
      throw new Error('Expression must be a string');
    }

    // Create sandbox with safe built-ins
    const sandbox = this._createSandbox(context);

    // Create VM context
    const vmContext = vm.createContext(sandbox, {
      codeGeneration: {
        strings: false,  // Disable eval() from strings
        wasm: false      // Disable WebAssembly
      }
    });

    try {
      // Prepend 'use strict' to ensure frozen object mutations throw
      // The expression is evaluated directly to preserve both expression and statement semantics
      const strictExpression = `'use strict';\n${expression}`;

      // Compile and run script
      const script = new vm.Script(strictExpression, {
        timeout: this._config.timeoutMs,
        filename: 'expression.js'
      });

      return script.runInContext(vmContext, {
        timeout: this._config.timeoutMs
      });
    } catch (error) {
      // Wrap VM errors with more context
      if (error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
        throw new Error(`Expression timeout after ${this._config.timeoutMs}ms: ${expression.substring(0, 50)}...`);
      }
      throw error;
    }
  }

  /**
   * Evaluate expression and cast result to boolean
   * @param {string} expression
   * @param {Object} context
   * @returns {boolean}
   */
  evaluateCondition(expression, context = {}) {
    const result = this.evaluate(expression, context);
    return Boolean(result);
  }

  /**
   * Evaluate template string with interpolation
   * @param {string} template - Template with ${} placeholders
   * @param {Object} context
   * @returns {string}
   */
  evaluateTemplate(template, context = {}) {
    if (typeof template !== 'string') {
      throw new Error('Template must be a string');
    }

    // Wrap template in backticks for evaluation
    const expression = '`' + template + '`';
    const result = this.evaluate(expression, context);

    // Ensure result is string
    return String(result);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VALIDATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Validate expression syntax without execution
   * @param {string} expression
   * @returns {{valid: boolean, error?: string}}
   */
  validate(expression) {
    if (typeof expression !== 'string') {
      return { valid: false, error: 'Expression must be a string' };
    }

    try {
      // Parse without running
      new vm.Script(expression, { filename: 'validation.js' });
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }

  /**
   * Check if expression contains potentially dangerous patterns
   * @param {string} expression
   * @returns {{safe: boolean, warnings: string[]}}
   */
  checkSafety(expression) {
    const warnings = [];

    // Check for dangerous patterns
    const dangerousPatterns = [
      { pattern: /\beval\b/, warning: 'Use of eval() is forbidden' },
      { pattern: /\bFunction\b/, warning: 'Direct Function constructor access is forbidden' },
      { pattern: /\brequire\b/, warning: 'Use of require() is forbidden' },
      { pattern: /\bimport\b/, warning: 'Use of import is forbidden' },
      { pattern: /\bprocess\b/, warning: 'Access to process is forbidden' },
      { pattern: /\bglobal\b/, warning: 'Access to global is forbidden' },
      { pattern: /\bsetTimeout\b|\bsetInterval\b/, warning: 'Async functions are forbidden' },
      { pattern: /__proto__|constructor\.constructor/, warning: 'Prototype chain manipulation is forbidden' }
    ];

    for (const { pattern, warning } of dangerousPatterns) {
      if (pattern.test(expression)) {
        warnings.push(warning);
      }
    }

    return { safe: warnings.length === 0, warnings };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SANDBOX CREATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create isolated sandbox with safe built-ins
   * @private
   */
  _createSandbox(context) {
    // Deep freeze context data to prevent mutation
    const frozenData = deepFreeze(context.data || {}, 0, this._config.maxDepth);
    const frozenInput = deepFreeze(context.input || {}, 0, this._config.maxDepth);
    const frozenOutput = deepFreeze(context.output || {}, 0, this._config.maxDepth);
    const frozenVariables = deepFreeze(context.variables || {}, 0, this._config.maxDepth);

    return {
      // Context data (read-only)
      data: frozenData,
      input: frozenInput,
      output: frozenOutput,
      variables: frozenVariables,
      iteration: context.iteration ?? 0,

      // Safe built-ins
      Math,
      JSON: {
        parse: JSON.parse,
        stringify: JSON.stringify
      },
      Array: {
        isArray: Array.isArray,
        from: Array.from
      },
      Object: {
        keys: Object.keys,
        values: Object.values,
        entries: Object.entries,
        fromEntries: Object.fromEntries,
        assign: (...args) => Object.assign({}, ...args) // Return new object
      },
      String,
      Number,
      Boolean,
      Date: {
        now: Date.now
      },
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      undefined,
      null: null,
      true: true,
      false: false,
      NaN,
      Infinity,

      // Utility functions for conditions
      $has: (obj, path) => hasPath(obj, path),
      $get: (obj, path, defaultVal) => getByPath(obj, path, defaultVal),
      $len: (val) => getLength(val),
      $type: (val) => typeof val,
      $match: (str, pattern) => matchPattern(str, pattern),
      $isEmpty: (val) => {
        if (val === null || val === undefined) return true;
        if (Array.isArray(val)) return val.length === 0;
        if (typeof val === 'string') return val.length === 0;
        if (typeof val === 'object') return Object.keys(val).length === 0;
        return false;
      },
      $includes: (arr, val) => Array.isArray(arr) && arr.includes(val),
      $some: (arr, pred) => Array.isArray(arr) && arr.some(pred),
      $every: (arr, pred) => Array.isArray(arr) && arr.every(pred),
      $min: (...args) => Math.min(...args.flat()),
      $max: (...args) => Math.max(...args.flat()),
      $sum: (arr) => Array.isArray(arr) ? arr.reduce((a, b) => a + b, 0) : 0,
      $avg: (arr) => {
        if (!Array.isArray(arr) || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GETTERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get current configuration
   * @returns {Object}
   */
  get config() {
    return { ...this._config };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  ExpressionSandbox,
  DEFAULT_CONFIG,
  // Export utilities for testing
  deepFreeze,
  getByPath,
  hasPath,
  getLength,
  matchPattern
};
