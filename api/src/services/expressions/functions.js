/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUILTIN FUNCTIONS FOR PREDICATE EVALUATOR
 * Safe, sandboxed functions available in predicate expressions.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BUILTIN_FUNCTIONS = {
  // ── String / Collection size ──
  size: (value) => {
    if (typeof value === 'string') return value.length;
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'object' && value !== null) return Object.keys(value).length;
    return 0;
  },

  // ── String operations ──
  lower: (str) => String(str).toLowerCase(),
  upper: (str) => String(str).toUpperCase(),
  trim: (str) => String(str).trim(),
  startsWith: (str, prefix) => String(str).startsWith(String(prefix)),
  endsWith: (str, suffix) => String(str).endsWith(String(suffix)),
  contains: (str, substr) => String(str).includes(String(substr)),

  // ── Regex matching ──
  matches: (value, pattern) => {
    if (typeof pattern !== 'string') throw new Error('matches() pattern must be a string');
    // Safety: limit pattern length to prevent catastrophic backtracking
    if (pattern.length > 200) throw new Error('matches() pattern too long (max 200 chars)');
    try {
      return new RegExp(pattern).test(String(value));
    } catch (e) {
      throw new Error(`matches() invalid regex: ${e.message}`);
    }
  },

  // ── Date / Time ──
  today: () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  },
  now: () => new Date(),

  // ── Duration parsing: "72h", "3d", "30m", "2w" ──
  duration: (str) => {
    if (typeof str !== 'string') throw new Error('duration() requires a string argument');
    const match = str.match(/^(\d+)(m|h|d|w)$/);
    if (!match) throw new Error(`Invalid duration format: "${str}" (expected: Nm, Nh, Nd, or Nw)`);
    const [, num, unit] = match;
    const multipliers = { m: 60000, h: 3600000, d: 86400000, w: 604800000 };
    return parseInt(num) * multipliers[unit];
  },

  // ── Object inspection ──
  has: (obj, key) => {
    if (obj === null || obj === undefined) return false;
    if (typeof obj !== 'object') return false;
    return key in obj;
  },

  // ── Type checks ──
  isNull: (value) => value === null || value === undefined,
  isNumber: (value) => typeof value === 'number' && !isNaN(value),
  isString: (value) => typeof value === 'string',
  isArray: (value) => Array.isArray(value),
  isBool: (value) => typeof value === 'boolean',

  // ── Math ──
  abs: (n) => Math.abs(n),
  floor: (n) => Math.floor(n),
  ceil: (n) => Math.ceil(n),
  round: (n) => Math.round(n),
  min: (...args) => Math.min(...args),
  max: (...args) => Math.max(...args),
};

module.exports = { BUILTIN_FUNCTIONS };
