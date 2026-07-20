'use strict';

/**
 * tref expression parser + evaluator (IP-0b).
 *
 * Replaces the single-comparison dialect of IP-0a with a real grammar, so that
 * Altiora FormRule conditions — which routinely carry several checks joined by
 * AND/OR and use twelve operators — can be expressed as tref strings at all.
 *
 * Recursive descent over a hand-written tokenizer. No `eval`, no `Function`:
 * conditions are authored by Altiora administrators, i.e. outside our trust
 * boundary, and must never become executable code in this process.
 *
 * Grammar:
 *   tref       = or_expr
 *   or_expr    = and_expr { '||' and_expr }
 *   and_expr   = unary   { '&&' unary }
 *   unary      = '!' unary | primary
 *   primary    = '(' tref ')' | comparison | postfix
 *   comparison = path cmp_op value
 *   postfix    = path 'is' [ 'not' ] 'empty'
 *   cmp_op     = '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'startsWith' | 'in'
 *   path       = identifier { '.' identifier }
 *   value      = string | number | boolean | array
 *   array      = '[' [ value { ',' value } ] ']'
 *
 * Two deliberate departures from the ratified sketch, both forced by evidence:
 *
 *   1. `path` is a general dotted path, not `'slots.' identifier`. The golden
 *      fixture `schema-snapshot.hardware.json` carries
 *      "service.approvalRequired == true", and zero fixture migration is a hard
 *      requirement — a slots-only path would reject a ratified fixture.
 *
 *   2. Evaluation is total: it never throws. Parsing is where errors belong, and
 *      the linter runs the parser at compile time. eval runs mid-turn against
 *      whatever the user just typed, so an unfilled or oddly-typed slot must
 *      resolve to a verdict (false), not a 500. An absent path is a normal state
 *      — the slot simply is not filled yet.
 *
 * @module instances/flowdesk/contracts/tref-parser
 */

/** A tref string that is not valid in the grammar. */
class TrefParseError extends Error {
  constructor(message, { tref, position = null, expected = null, found = null } = {}) {
    super(message);
    this.name = 'TrefParseError';
    this.tref = tref;
    this.position = position;
    this.expected = expected;
    this.found = found;
    // Kept for continuity with IP-0a, whose errors carried `condition`/`reason`.
    this.condition = tref;
    this.reason = message;
  }
}

// ── tokenizer ───────────────────────────────────────────────────────────────

const PUNCT = { '(': 'LPAREN', ')': 'RPAREN', '[': 'LBRACKET', ']': 'RBRACKET', ',': 'COMMA' };
// Longest-first: '!=' must win over '!', '>=' over '>'.
const SYMBOLS = ['&&', '||', '==', '!=', '>=', '<=', '!', '>', '<'];
const KEYWORDS = new Set(['contains', 'startsWith', 'in', 'is', 'not', 'empty', 'true', 'false']);

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

/**
 * @returns {Array<{type: string, value: *, pos: number}>}
 * @throws {TrefParseError}
 */
function tokenize(tref) {
  const src = String(tref);
  const tokens = [];
  let i = 0;

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) { i += 1; continue; }

    if (PUNCT[ch]) { tokens.push({ type: PUNCT[ch], value: ch, pos: i }); i += 1; continue; }

    const sym = SYMBOLS.find((s) => src.startsWith(s, i));
    if (sym) { tokens.push({ type: 'SYMBOL', value: sym, pos: i }); i += sym.length; continue; }

    if (ch === "'" || ch === '"') {
      const end = src.indexOf(ch, i + 1);
      if (end === -1) {
        throw new TrefParseError(`unterminated string literal starting at position ${i}`, {
          tref, position: i, expected: `closing ${ch}`, found: 'end of input',
        });
      }
      tokens.push({ type: 'STRING', value: src.slice(i + 1, end), pos: i });
      i = end + 1;
      continue;
    }

    if (DIGIT.test(ch) || (ch === '-' && DIGIT.test(src[i + 1] || ''))) {
      const start = i;
      if (ch === '-') i += 1;
      while (i < src.length && DIGIT.test(src[i])) i += 1;
      if (src[i] === '.' && DIGIT.test(src[i + 1] || '')) {
        i += 1;
        while (i < src.length && DIGIT.test(src[i])) i += 1;
      }
      tokens.push({ type: 'NUMBER', value: Number(src.slice(start, i)), pos: start });
      continue;
    }

    if (IDENT_START.test(ch)) {
      const start = i;
      while (i < src.length && (IDENT_CHAR.test(src[i]) || (src[i] === '.' && IDENT_START.test(src[i + 1] || '')))) {
        i += 1;
      }
      const word = src.slice(start, i);
      tokens.push({ type: KEYWORDS.has(word) ? 'KEYWORD' : 'PATH', value: word, pos: start });
      continue;
    }

    throw new TrefParseError(`unexpected character ${JSON.stringify(ch)} at position ${i}`, {
      tref, position: i, expected: 'a path, literal, operator or parenthesis', found: ch,
    });
  }

  tokens.push({ type: 'EOF', value: null, pos: src.length });
  return tokens;
}

// ── parser ──────────────────────────────────────────────────────────────────

const CMP_SYMBOLS = new Set(['==', '!=', '>', '<', '>=', '<=']);
const CMP_KEYWORDS = new Set(['contains', 'startsWith', 'in']);
const NUMERIC_OPS = new Set(['>', '<', '>=', '<=']);

function describe(tok) {
  if (tok.type === 'EOF') return 'end of input';
  if (tok.type === 'STRING') return `string ${JSON.stringify(tok.value)}`;
  return JSON.stringify(String(tok.value));
}

function createParser(tref, tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function fail(expected, tok = peek()) {
    throw new TrefParseError(
      `expected ${expected} but found ${describe(tok)} at position ${tok.pos}`,
      { tref, position: tok.pos, expected, found: describe(tok) },
    );
  }

  function expect(type, value, expected) {
    const tok = peek();
    if (tok.type !== type || (value !== undefined && tok.value !== value)) fail(expected, tok);
    return next();
  }

  function parseOr() {
    let left = parseAnd();
    while (peek().type === 'SYMBOL' && peek().value === '||') {
      next();
      left = { type: 'logical', op: '||', left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd() {
    let left = parseUnary();
    while (peek().type === 'SYMBOL' && peek().value === '&&') {
      next();
      left = { type: 'logical', op: '&&', left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary() {
    if (peek().type === 'SYMBOL' && peek().value === '!') {
      next();
      return { type: 'not', operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parsePrimary() {
    if (peek().type === 'LPAREN') {
      next();
      const inner = parseOr();
      expect('RPAREN', undefined, "')'");
      return inner;
    }
    if (peek().type !== 'PATH') fail("a path (e.g. slots.fieldName)");
    const pathTok = next();
    const path = { type: 'path', segments: pathTok.value.split('.') };

    // postfix:  path 'is' ['not'] 'empty'
    if (peek().type === 'KEYWORD' && peek().value === 'is') {
      next();
      let negated = false;
      if (peek().type === 'KEYWORD' && peek().value === 'not') { next(); negated = true; }
      expect('KEYWORD', 'empty', "'empty'");
      return { type: 'postfix', path, op: negated ? 'is_not_empty' : 'is_empty' };
    }

    // comparison: path cmp_op value
    const opTok = peek();
    const isCmp = (opTok.type === 'SYMBOL' && CMP_SYMBOLS.has(opTok.value))
      || (opTok.type === 'KEYWORD' && CMP_KEYWORDS.has(opTok.value));
    if (!isCmp) fail('a comparison operator (==, !=, >, <, >=, <=, contains, startsWith, in) or \'is empty\'', opTok);
    next();
    const op = opTok.value;
    const value = parseValue(op);

    // Static type checks: a mismatch here is a schema defect, and catching it at
    // parse time means the linter reports it instead of the dialogue misbehaving.
    if (op === 'in' && !Array.isArray(value)) {
      fail("an array literal after 'in' (e.g. ['a','b'])", opTok);
    }
    if (op !== 'in' && Array.isArray(value)) {
      fail(`a scalar literal after '${op}' (arrays are only valid with 'in')`, opTok);
    }
    if (NUMERIC_OPS.has(op) && typeof value !== 'number') {
      fail(`a number after '${op}'`, opTok);
    }
    if ((op === 'contains' || op === 'startsWith') && typeof value !== 'string') {
      fail(`a string after '${op}'`, opTok);
    }

    return { type: 'comparison', left: path, op, right: value };
  }

  function parseValue() {
    const tok = peek();
    if (tok.type === 'STRING') { next(); return tok.value; }
    if (tok.type === 'NUMBER') { next(); return tok.value; }
    if (tok.type === 'KEYWORD' && (tok.value === 'true' || tok.value === 'false')) {
      next();
      return tok.value === 'true';
    }
    if (tok.type === 'LBRACKET') {
      next();
      const items = [];
      if (peek().type !== 'RBRACKET') {
        for (;;) {
          items.push(parseScalar());
          if (peek().type === 'COMMA') { next(); continue; }
          break;
        }
      }
      expect('RBRACKET', undefined, "']'");
      return items;
    }
    return fail('a literal (string, number, boolean or array)');
  }

  function parseScalar() {
    const tok = peek();
    if (tok.type === 'STRING' || tok.type === 'NUMBER') { next(); return tok.value; }
    if (tok.type === 'KEYWORD' && (tok.value === 'true' || tok.value === 'false')) {
      next();
      return tok.value === 'true';
    }
    return fail('a scalar literal inside the array');
  }

  const ast = parseOr();
  if (peek().type !== 'EOF') fail('end of input');
  return ast;
}

// ── memoized parse ──────────────────────────────────────────────────────────

// Conditions come from a bounded set (the published schemas), but the cache is
// capped anyway so a pathological schema cannot grow it without limit.
const MAX_CACHE = 500;
const astCache = new Map();

/**
 * Parse a tref string into an AST.
 * @param {string} tref
 * @returns {object} AST
 * @throws {TrefParseError}
 */
function parse(tref) {
  if (typeof tref !== 'string') {
    throw new TrefParseError(`expected a string condition, got ${typeof tref}`, { tref });
  }
  const cached = astCache.get(tref);
  if (cached) return cached;

  const ast = createParser(tref, tokenize(tref));

  if (astCache.size >= MAX_CACHE) astCache.clear();
  astCache.set(tref, ast);
  return ast;
}

// ── evaluation ──────────────────────────────────────────────────────────────

function resolvePath(ctx, segments) {
  return segments.reduce((o, k) => (o == null ? undefined : o[k]), ctx);
}

/**
 * Coerce a value to an array when it represents one, else null.
 * A checklist slot holds a JSON-array string (Altiora's own encoding), and
 * `contains` / `is empty` must see through that — matching how Altiora's rule
 * engine treats the same value.
 */
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function isEmpty(value) {
  if (value === undefined || value === null) return true;
  if (value === '') return true;
  const arr = asArray(value);
  if (arr) return arr.length === 0;
  return false;
}

function compare(op, lhs, rhs) {
  switch (op) {
    case '==': return lhs === rhs;
    case '!=': return lhs !== rhs;
    case '>': return typeof lhs === 'number' && lhs > rhs;
    case '<': return typeof lhs === 'number' && lhs < rhs;
    case '>=': return typeof lhs === 'number' && lhs >= rhs;
    case '<=': return typeof lhs === 'number' && lhs <= rhs;
    case 'contains': {
      const arr = asArray(lhs);
      if (arr) return arr.includes(rhs);
      return lhs === undefined || lhs === null ? false : String(lhs).includes(rhs);
    }
    case 'startsWith':
      return lhs === undefined || lhs === null ? false : String(lhs).startsWith(rhs);
    case 'in':
      return rhs.includes(lhs);
    default:
      // Unreachable: the parser admits no other operator.
      return false;
  }
}

/**
 * Evaluate an AST against a context. Total — never throws.
 * @param {object} ast
 * @param {object} ctx  e.g. { slots: {...}, service: {...} }
 * @returns {boolean}
 */
function evaluate(ast, ctx) {
  switch (ast.type) {
    case 'logical':
      return ast.op === '&&'
        ? evaluate(ast.left, ctx) && evaluate(ast.right, ctx)
        : evaluate(ast.left, ctx) || evaluate(ast.right, ctx);
    case 'not':
      return !evaluate(ast.operand, ctx);
    case 'comparison':
      return compare(ast.op, resolvePath(ctx, ast.left.segments), ast.right);
    case 'postfix': {
      const empty = isEmpty(resolvePath(ctx, ast.path.segments));
      return ast.op === 'is_empty' ? empty : !empty;
    }
    default:
      return false;
  }
}

/**
 * Validate a tref string without evaluating it.
 * @returns {{valid: true} | {valid: false, error: TrefParseError}}
 */
function validate(tref) {
  try {
    parse(tref);
    return { valid: true };
  } catch (err) {
    if (err instanceof TrefParseError) return { valid: false, error: err };
    throw err;
  }
}

/**
 * Parse and evaluate. An absent/empty condition means the slot always applies.
 * @throws {TrefParseError} when the condition is present but malformed
 */
function evalTref(tref, ctx) {
  if (!tref || !String(tref).trim()) return true;
  return evaluate(parse(tref), ctx);
}

module.exports = {
  parse,
  evaluate,
  evalTref,
  validate,
  isEmpty,
  TrefParseError,
  _internals: { tokenize, astCache },
};
