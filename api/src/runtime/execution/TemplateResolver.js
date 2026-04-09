/**
 * TemplateResolver
 *
 * Resolves `{{...}}` template expressions in node parameters before execution.
 * Supports deep path resolution including array indices, built-in variables,
 * and passthrough of non-string values for single-template strings.
 *
 * Context shape:
 *   {
 *     input: {},                         // Pipeline input data
 *     nodeOutputs: { 'G0-N02': {...} },  // Outputs from previously executed nodes
 *     variables: {}                      // User-defined / global variables
 *   }
 *
 * Resolution order for a path like `G0-N02.profile.name`:
 *   1. Built-in ($now, $date, $uuid)
 *   2. context.input   (if path starts with "input.")
 *   3. context.nodeOutputs  (if first segment matches a node ID)
 *   4. context.variables    (fallback)
 *
 * @module runtime/execution/TemplateResolver
 */

const { randomUUID } = require('node:crypto');

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Matches `{{path}}` tokens, including whitespace-trimmed paths.
 * Non-greedy — stops at the first `}}`.
 */
const TEMPLATE_RE = /\{\{([^}]+)\}\}/g;

/**
 * Matches a string that is ENTIRELY a single `{{path}}` with no surrounding text.
 * Used to decide whether to return the raw (non-string) resolved value.
 */
const SINGLE_TEMPLATE_RE = /^\{\{([^}]+)\}\}$/;

/**
 * Splits a dot-path while also extracting bracket indices.
 * e.g. "results[0].payload" -> ["results", "0", "payload"]
 */
const PATH_SEGMENT_RE = /([^.\[\]]+)/g;

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATE RESOLVER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class TemplateResolver {

  // ─────────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Recursively resolve all `{{path}}` templates in a value.
   *
   * @param {*} obj        - The value to resolve (string, array, plain object, or primitive).
   * @param {Object} context - Resolution context.
   * @param {Object} [context.input={}]        - Pipeline-level input data.
   * @param {Object} [context.nodeOutputs={}]  - Map of nodeId -> output data.
   * @param {Object} [context.variables={}]    - User / global variables.
   * @returns {*} The resolved value, same shape as input.
   */
  resolve(obj, context) {
    const ctx = {
      input: context?.input || {},
      nodeOutputs: context?.nodeOutputs || {},
      variables: context?.variables || {}
    };

    return this._resolveValue(obj, ctx);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECURSIVE RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Dispatch resolution based on value type.
   * @private
   */
  _resolveValue(value, ctx) {
    if (typeof value === 'string') {
      return this._resolveString(value, ctx);
    }

    if (Array.isArray(value)) {
      return value.map(item => this._resolveValue(item, ctx));
    }

    if (value !== null && typeof value === 'object') {
      return this._resolveObject(value, ctx);
    }

    // Primitives (number, boolean, null, undefined) pass through unchanged
    return value;
  }

  /**
   * Resolve templates in a plain object (shallow copy, deep resolve values).
   * @private
   */
  _resolveObject(obj, ctx) {
    const result = {};
    for (const key of Object.keys(obj)) {
      result[key] = this._resolveValue(obj[key], ctx);
    }
    return result;
  }

  /**
   * Resolve templates inside a string.
   *
   * - If the entire string is a single `{{path}}`, return the raw resolved
   *   value (preserving type: object, array, number, boolean, etc.).
   * - If the string mixes literals with templates, stringify resolved values.
   * - Unresolvable paths are left as their original `{{path}}` text.
   *
   * @private
   */
  _resolveString(str, ctx) {
    // Fast path: no templates at all
    if (!str.includes('{{')) {
      return str;
    }

    // Check for the single-template case: "{{path}}" with nothing else
    const singleMatch = SINGLE_TEMPLATE_RE.exec(str);
    if (singleMatch) {
      const path = singleMatch[1].trim();
      const resolved = this._resolvePath(path, ctx);
      // Return raw value (object, array, number, boolean) if resolution succeeded
      if (resolved !== undefined) {
        return resolved;
      }
      // Unresolvable — return original text
      return str;
    }

    // Mixed template: replace each {{path}} with its stringified value
    return str.replace(TEMPLATE_RE, (_match, rawPath) => {
      const path = rawPath.trim();
      const resolved = this._resolvePath(path, ctx);
      if (resolved === undefined) {
        return _match; // keep original {{path}} text
      }
      return this._stringify(resolved);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PATH RESOLUTION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resolve a single dot-path against the context.
   *
   * Resolution order:
   *   1. Built-in variables ($now, $date, $uuid)
   *   2. "input.*"          -> context.input
   *   3. "<nodeId>.*"       -> context.nodeOutputs[nodeId]
   *   4. "variable_name.*"  -> context.variables
   *
   * @param {string} path - e.g. "G0-N02.profile.full_name" or "$now"
   * @param {Object} ctx  - Normalised context
   * @returns {*} Resolved value, or `undefined` if not found
   * @private
   */
  _resolvePath(path, ctx) {
    // ── Built-in variables ──────────────────────────────────────────────
    if (path === '$now') {
      return new Date().toISOString();
    }
    if (path === '$date') {
      return new Date().toISOString().slice(0, 10);
    }
    if (path === '$uuid') {
      return randomUUID();
    }

    // ── Parse segments ──────────────────────────────────────────────────
    const segments = this._parseSegments(path);
    if (segments.length === 0) {
      return undefined;
    }

    const firstSegment = segments[0];
    const rest = segments.slice(1);

    // ── input.* ─────────────────────────────────────────────────────────
    if (firstSegment === 'input') {
      return this._navigate(ctx.input, rest);
    }

    // ── nodeOutputs (node ID as first segment) ──────────────────────────
    if (Object.prototype.hasOwnProperty.call(ctx.nodeOutputs, firstSegment)) {
      return this._navigate(ctx.nodeOutputs[firstSegment], rest);
    }

    // ── variables (single key or nested) ────────────────────────────────
    const varResult = this._navigate(ctx.variables, segments);
    if (varResult !== undefined) {
      return varResult;
    }

    return undefined;
  }

  /**
   * Parse a path string into segments, handling dots and bracket notation.
   *
   * Examples:
   *   "G0-N07.results[0].payload.graph_id"
   *     -> ["G0-N07", "results", "0", "payload", "graph_id"]
   *
   * @param {string} path
   * @returns {string[]}
   * @private
   */
  _parseSegments(path) {
    const segments = [];
    let match;
    PATH_SEGMENT_RE.lastIndex = 0;
    while ((match = PATH_SEGMENT_RE.exec(path)) !== null) {
      segments.push(match[1]);
    }
    return segments;
  }

  /**
   * Navigate an object tree by an array of string segments.
   * Numeric-looking segments index into arrays.
   *
   * @param {*} root      - Starting value
   * @param {string[]} segments - Path segments to walk
   * @returns {*} The value at the end of the path, or `undefined`
   * @private
   */
  _navigate(root, segments) {
    let current = root;

    for (const seg of segments) {
      if (current === null || current === undefined) {
        return undefined;
      }

      if (Array.isArray(current)) {
        const idx = Number(seg);
        if (Number.isInteger(idx) && idx >= 0 && idx < current.length) {
          current = current[idx];
          continue;
        }
      }

      if (typeof current === 'object') {
        if (Object.prototype.hasOwnProperty.call(current, seg)) {
          current = current[seg];
          continue;
        }
      }

      return undefined;
    }

    return current;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Convert a resolved value to a string for mixed-template interpolation.
   * @private
   */
  _stringify(value) {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = { TemplateResolver };
