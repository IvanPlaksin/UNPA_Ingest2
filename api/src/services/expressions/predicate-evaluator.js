/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PREDICATE EVALUATOR
 * Lightweight, safe expression evaluator for form DisplayConditions
 * and ValidationRules. CEL-inspired syntax, no external dependencies.
 *
 * Security:
 *   - No eval(), no Function(), no vm
 *   - Only AST-based tree-walk evaluation
 *   - No access to globals — only passed context
 *   - Depth limit and timeout protection
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Lexer, TokenType } = require('./lexer');
const { Parser, NodeType } = require('./parser');
const { BUILTIN_FUNCTIONS } = require('./functions');

// ────────────────────────────────────────────────────────────────────────────
// ERROR CLASS
// ────────────────────────────────────────────────────────────────────────────

class PredicateError extends Error {
  constructor(message, { position, expression, type } = {}) {
    super(message);
    this.name = 'PredicateError';
    this.position = position;
    this.expression = expression;
    this.type = type || 'RUNTIME';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EVALUATOR
// ────────────────────────────────────────────────────────────────────────────

class PredicateEvaluator {
  /**
   * @param {object} options
   * @param {object} options.customFunctions - Additional functions
   * @param {number} options.maxDepth - Max AST evaluation depth (default: 50)
   * @param {number} options.timeout - Evaluation timeout in ms (default: 100)
   */
  constructor(options = {}) {
    this.functions = { ...BUILTIN_FUNCTIONS, ...(options.customFunctions || {}) };
    this.maxDepth = options.maxDepth || 50;
    this.timeout = options.timeout || 100;
  }

  /**
   * Evaluate a predicate expression against a context object.
   * @param {string} expression - The predicate expression
   * @param {object} context - Variable bindings
   * @returns {*} - Evaluation result (typically boolean)
   * @throws {PredicateError}
   */
  evaluate(expression, context = {}) {
    if (typeof expression !== 'string' || expression.trim() === '') {
      throw new PredicateError('Expression must be a non-empty string', {
        expression, type: 'SYNTAX',
      });
    }

    try {
      const ast = this._parse(expression);
      const startTime = Date.now();
      const result = this._eval(ast, context, 0, startTime);
      return result;
    } catch (e) {
      if (e instanceof PredicateError) throw e;
      throw new PredicateError(e.message, {
        expression,
        type: e instanceof SyntaxError ? 'SYNTAX' : 'RUNTIME',
      });
    }
  }

  /**
   * Validate expression syntax without evaluating.
   * @param {string} expression
   * @returns {{ valid: boolean, error?: string, variables?: string[], functions?: string[] }}
   */
  validate(expression) {
    try {
      const ast = this._parse(expression);
      const variables = new Set();
      const functions = new Set();
      this._collectRefs(ast, variables, functions);
      return {
        valid: true,
        variables: [...variables],
        functions: [...functions],
      };
    } catch (e) {
      return {
        valid: false,
        error: e.message,
      };
    }
  }

  /**
   * Extract all variable references from expression.
   * @param {string} expression
   * @returns {string[]}
   */
  extractVariables(expression) {
    const result = this.validate(expression);
    return result.valid ? result.variables : [];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Parse
  // ══════════════════════════════════════════════════════════════════════════

  _parse(expression) {
    const lexer = new Lexer(expression);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens, expression);
    return parser.parse();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Evaluate AST node
  // ══════════════════════════════════════════════════════════════════════════

  _eval(node, ctx, depth, startTime) {
    // Safety checks
    if (depth > this.maxDepth) {
      throw new PredicateError(`Maximum evaluation depth (${this.maxDepth}) exceeded`, { type: 'RUNTIME' });
    }
    if (Date.now() - startTime > this.timeout) {
      throw new PredicateError(`Evaluation timeout (${this.timeout}ms) exceeded`, { type: 'TIMEOUT' });
    }

    switch (node.type) {
      case NodeType.LITERAL:
        return node.value;

      case NodeType.IDENTIFIER:
        return this._resolveIdentifier(node.name, ctx);

      case NodeType.MEMBER_EXPR:
        return this._evalMember(node, ctx, depth, startTime);

      case NodeType.CALL_EXPR:
        return this._evalCall(node, ctx, depth, startTime);

      case NodeType.METHOD_CALL:
        return this._evalMethodCall(node, ctx, depth, startTime);

      case NodeType.UNARY_EXPR:
        return this._evalUnary(node, ctx, depth, startTime);

      case NodeType.BINARY_EXPR:
        return this._evalBinary(node, ctx, depth, startTime);

      case NodeType.LOGICAL_EXPR:
        return this._evalLogical(node, ctx, depth, startTime);

      case NodeType.ARRAY_EXPR:
        return node.elements.map(el => this._eval(el, ctx, depth + 1, startTime));

      default:
        throw new PredicateError(`Unknown AST node type: ${node.type}`, { type: 'RUNTIME' });
    }
  }

  _resolveIdentifier(name, ctx) {
    // Block dangerous globals
    const blocked = ['process', 'require', 'global', 'globalThis', '__dirname', '__filename',
                     'module', 'exports', 'Buffer', 'eval', 'Function', 'constructor'];
    if (blocked.includes(name)) {
      throw new PredicateError(`Access to '${name}' is not allowed`, { type: 'RUNTIME' });
    }

    if (name in ctx) return ctx[name];
    return undefined;
  }

  _evalMember(node, ctx, depth, startTime) {
    const obj = this._eval(node.object, ctx, depth + 1, startTime);
    if (obj === null || obj === undefined) return undefined;
    if (typeof obj !== 'object' && typeof obj !== 'string') return undefined;
    return obj[node.property];
  }

  _evalCall(node, ctx, depth, startTime) {
    const fn = this.functions[node.callee];
    if (!fn) {
      throw new PredicateError(`Unknown function: ${node.callee}()`, { type: 'RUNTIME' });
    }
    const args = node.arguments.map(arg => this._eval(arg, ctx, depth + 1, startTime));
    return fn(...args);
  }

  _evalMethodCall(node, ctx, depth, startTime) {
    const obj = this._eval(node.object, ctx, depth + 1, startTime);
    const args = node.arguments.map(arg => this._eval(arg, ctx, depth + 1, startTime));

    // Check if it's a builtin function used as method (e.g., value.matches(pattern))
    const fn = this.functions[node.method];
    if (fn) {
      return fn(obj, ...args);
    }

    // Try native method on object
    if (obj !== null && obj !== undefined && typeof obj[node.method] === 'function') {
      // Block dangerous native methods
      const blockedMethods = ['constructor', '__proto__', '__defineGetter__', '__defineSetter__',
                               'toString', 'valueOf', '__lookupGetter__', '__lookupSetter__'];
      if (blockedMethods.includes(node.method)) {
        throw new PredicateError(`Method '${node.method}' is not allowed`, { type: 'RUNTIME' });
      }
      return obj[node.method](...args);
    }

    throw new PredicateError(`Unknown method: ${node.method}()`, { type: 'RUNTIME' });
  }

  _evalUnary(node, ctx, depth, startTime) {
    const operand = this._eval(node.operand, ctx, depth + 1, startTime);
    switch (node.operator) {
      case '!': return !operand;
      case '-': return -operand;
      default:
        throw new PredicateError(`Unknown unary operator: ${node.operator}`, { type: 'RUNTIME' });
    }
  }

  _evalBinary(node, ctx, depth, startTime) {
    const left = this._eval(node.left, ctx, depth + 1, startTime);

    // Short-circuit for 'in' and 'not in' — right side must be array
    if (node.operator === 'in' || node.operator === 'not in') {
      const right = this._eval(node.right, ctx, depth + 1, startTime);
      if (!Array.isArray(right)) {
        throw new PredicateError(`Right side of '${node.operator}' must be an array`, { type: 'RUNTIME' });
      }
      const found = right.includes(left);
      return node.operator === 'in' ? found : !found;
    }

    const right = this._eval(node.right, ctx, depth + 1, startTime);

    switch (node.operator) {
      case '==': return left === right || (left == null && right == null);
      case '!=': return left !== right && !(left == null && right == null);
      case '>':  return this._compareValues(left, right) > 0;
      case '>=': return this._compareValues(left, right) >= 0;
      case '<':  return this._compareValues(left, right) < 0;
      case '<=': return this._compareValues(left, right) <= 0;
      case '+':  return this._add(left, right);
      case '-':  return left - right;
      case '*':  return left * right;
      case '/':
        if (right === 0) throw new PredicateError('Division by zero', { type: 'RUNTIME' });
        return left / right;
      case '%':
        if (right === 0) throw new PredicateError('Modulo by zero', { type: 'RUNTIME' });
        return left % right;
      default:
        throw new PredicateError(`Unknown operator: ${node.operator}`, { type: 'RUNTIME' });
    }
  }

  _evalLogical(node, ctx, depth, startTime) {
    const left = this._eval(node.left, ctx, depth + 1, startTime);
    // Short-circuit evaluation
    if (node.operator === '&&') return left ? this._eval(node.right, ctx, depth + 1, startTime) : left;
    if (node.operator === '||') return left ? left : this._eval(node.right, ctx, depth + 1, startTime);
    throw new PredicateError(`Unknown logical operator: ${node.operator}`, { type: 'RUNTIME' });
  }

  // ── Comparison helpers ──

  _compareValues(left, right) {
    // Date comparison
    if (left instanceof Date && right instanceof Date) {
      return left.getTime() - right.getTime();
    }
    // Date + duration (number in ms)
    if (left instanceof Date && typeof right === 'number') {
      return left.getTime() - right;
    }
    if (typeof left === 'number' && right instanceof Date) {
      return left - right.getTime();
    }
    // Numeric
    if (typeof left === 'number' && typeof right === 'number') {
      return left - right;
    }
    // String
    if (typeof left === 'string' && typeof right === 'string') {
      return left.localeCompare(right);
    }
    // Fallback
    return left > right ? 1 : left < right ? -1 : 0;
  }

  _add(left, right) {
    // Date + duration
    if (left instanceof Date && typeof right === 'number') {
      return new Date(left.getTime() + right);
    }
    if (typeof left === 'number' && right instanceof Date) {
      return new Date(left + right.getTime());
    }
    return left + right;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL: Collect references (for validate)
  // ══════════════════════════════════════════════════════════════════════════

  _collectRefs(node, variables, functions) {
    if (!node) return;

    switch (node.type) {
      case NodeType.IDENTIFIER:
        variables.add(node.name);
        break;
      case NodeType.MEMBER_EXPR:
        // Collect root identifier
        this._collectRefs(node.object, variables, functions);
        break;
      case NodeType.CALL_EXPR:
        functions.add(node.callee);
        node.arguments.forEach(a => this._collectRefs(a, variables, functions));
        break;
      case NodeType.METHOD_CALL:
        functions.add(node.method);
        this._collectRefs(node.object, variables, functions);
        node.arguments.forEach(a => this._collectRefs(a, variables, functions));
        break;
      case NodeType.UNARY_EXPR:
        this._collectRefs(node.operand, variables, functions);
        break;
      case NodeType.BINARY_EXPR:
      case NodeType.LOGICAL_EXPR:
        this._collectRefs(node.left, variables, functions);
        this._collectRefs(node.right, variables, functions);
        break;
      case NodeType.ARRAY_EXPR:
        node.elements.forEach(el => this._collectRefs(el, variables, functions));
        break;
      case NodeType.LITERAL:
        break;
    }
  }
}

module.exports = { PredicateEvaluator, PredicateError };
