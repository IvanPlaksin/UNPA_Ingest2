/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PREDICATE EXPRESSION PARSER
 * Recursive-descent parser producing an AST from tokens.
 *
 * Operator precedence (lowest to highest):
 *   1. ||
 *   2. &&
 *   3. ==, !=, >, <, >=, <=, in, not in
 *   4. +, -
 *   5. *, /, %
 *   6. ! (unary), - (unary)
 *   7. function calls, property access, array literals, grouping
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { TokenType } = require('./lexer');

// ────────────────────────────────────────────────────────────────────────────
// AST NODE TYPES
// ────────────────────────────────────────────────────────────────────────────

const NodeType = {
  LITERAL: 'Literal',
  IDENTIFIER: 'Identifier',
  MEMBER_EXPR: 'MemberExpression',
  CALL_EXPR: 'CallExpression',
  UNARY_EXPR: 'UnaryExpression',
  BINARY_EXPR: 'BinaryExpression',
  LOGICAL_EXPR: 'LogicalExpression',
  ARRAY_EXPR: 'ArrayExpression',
  METHOD_CALL: 'MethodCall',
};

// ────────────────────────────────────────────────────────────────────────────
// PARSER
// ────────────────────────────────────────────────────────────────────────────

class Parser {
  constructor(tokens, expression) {
    this.tokens = tokens;
    this.expression = expression;
    this.pos = 0;
  }

  parse() {
    const ast = this._parseOr();
    if (this._current().type !== TokenType.EOF) {
      throw this._error(`Unexpected token: ${this._current().value}`);
    }
    return ast;
  }

  // ── Precedence Level 1: || ──

  _parseOr() {
    let left = this._parseAnd();
    while (this._match(TokenType.OR)) {
      const right = this._parseAnd();
      left = { type: NodeType.LOGICAL_EXPR, operator: '||', left, right };
    }
    return left;
  }

  // ── Precedence Level 2: && ──

  _parseAnd() {
    let left = this._parseComparison();
    while (this._match(TokenType.AND)) {
      const right = this._parseComparison();
      left = { type: NodeType.LOGICAL_EXPR, operator: '&&', left, right };
    }
    return left;
  }

  // ── Precedence Level 3: ==, !=, >, <, >=, <=, in, not in ──

  _parseComparison() {
    let left = this._parseAdditive();

    const comparisonTokens = [
      TokenType.EQ, TokenType.NEQ, TokenType.GT, TokenType.GTE,
      TokenType.LT, TokenType.LTE, TokenType.IN, TokenType.NOT_IN,
    ];

    while (comparisonTokens.includes(this._current().type)) {
      const op = this._advance();
      const right = this._parseAdditive();
      left = { type: NodeType.BINARY_EXPR, operator: op.value, left, right };
    }

    return left;
  }

  // ── Precedence Level 4: +, - ──

  _parseAdditive() {
    let left = this._parseMultiplicative();
    while (this._current().type === TokenType.PLUS || this._current().type === TokenType.MINUS) {
      const op = this._advance();
      const right = this._parseMultiplicative();
      left = { type: NodeType.BINARY_EXPR, operator: op.value, left, right };
    }
    return left;
  }

  // ── Precedence Level 5: *, /, % ──

  _parseMultiplicative() {
    let left = this._parseUnary();
    while (this._current().type === TokenType.MULTIPLY ||
           this._current().type === TokenType.DIVIDE ||
           this._current().type === TokenType.MODULO) {
      const op = this._advance();
      const right = this._parseUnary();
      left = { type: NodeType.BINARY_EXPR, operator: op.value, left, right };
    }
    return left;
  }

  // ── Precedence Level 6: !, - (unary) ──

  _parseUnary() {
    if (this._current().type === TokenType.NOT) {
      this._advance();
      const operand = this._parseUnary();
      return { type: NodeType.UNARY_EXPR, operator: '!', operand };
    }
    if (this._current().type === TokenType.MINUS) {
      this._advance();
      const operand = this._parseUnary();
      return { type: NodeType.UNARY_EXPR, operator: '-', operand };
    }
    return this._parsePostfix();
  }

  // ── Precedence Level 7: postfix — property access, method calls, function calls ──

  _parsePostfix() {
    let node = this._parsePrimary();

    while (true) {
      if (this._current().type === TokenType.DOT) {
        this._advance(); // skip dot
        const prop = this._expect(TokenType.IDENTIFIER, 'Expected property name after "."');

        // Check for method call: obj.method(args)
        if (this._current().type === TokenType.LPAREN) {
          this._advance(); // skip (
          const args = this._parseArgList();
          this._expect(TokenType.RPAREN, 'Expected ")" after method arguments');
          node = { type: NodeType.METHOD_CALL, object: node, method: prop.value, arguments: args };
        } else {
          node = { type: NodeType.MEMBER_EXPR, object: node, property: prop.value };
        }
      } else if (this._current().type === TokenType.LPAREN && node.type === NodeType.IDENTIFIER) {
        // Function call: func(args)
        this._advance(); // skip (
        const args = this._parseArgList();
        this._expect(TokenType.RPAREN, 'Expected ")" after function arguments');
        node = { type: NodeType.CALL_EXPR, callee: node.name, arguments: args };
      } else {
        break;
      }
    }

    return node;
  }

  // ── Primary expressions ──

  _parsePrimary() {
    const token = this._current();

    // Literals
    if (token.type === TokenType.NUMBER) {
      this._advance();
      return { type: NodeType.LITERAL, value: token.value };
    }
    if (token.type === TokenType.STRING) {
      this._advance();
      return { type: NodeType.LITERAL, value: token.value };
    }
    if (token.type === TokenType.BOOLEAN) {
      this._advance();
      return { type: NodeType.LITERAL, value: token.value };
    }
    if (token.type === TokenType.NULL) {
      this._advance();
      return { type: NodeType.LITERAL, value: null };
    }
    if (token.type === TokenType.UNDEFINED) {
      this._advance();
      return { type: NodeType.LITERAL, value: undefined };
    }

    // Identifiers
    if (token.type === TokenType.IDENTIFIER) {
      this._advance();
      return { type: NodeType.IDENTIFIER, name: token.value };
    }

    // Grouped expression: ( expr )
    if (token.type === TokenType.LPAREN) {
      this._advance();
      const expr = this._parseOr();
      this._expect(TokenType.RPAREN, 'Expected closing ")"');
      return expr;
    }

    // Array literal: [ expr, expr, ... ]
    if (token.type === TokenType.LBRACKET) {
      return this._parseArray();
    }

    throw this._error(`Unexpected token: ${token.type} (${JSON.stringify(token.value)})`);
  }

  // ── Array literal ──

  _parseArray() {
    this._expect(TokenType.LBRACKET, 'Expected "["');
    const elements = [];

    if (this._current().type !== TokenType.RBRACKET) {
      elements.push(this._parseOr());
      while (this._match(TokenType.COMMA)) {
        elements.push(this._parseOr());
      }
    }

    this._expect(TokenType.RBRACKET, 'Expected closing "]"');
    return { type: NodeType.ARRAY_EXPR, elements };
  }

  // ── Argument list for function/method calls ──

  _parseArgList() {
    const args = [];
    if (this._current().type !== TokenType.RPAREN) {
      args.push(this._parseOr());
      while (this._match(TokenType.COMMA)) {
        args.push(this._parseOr());
      }
    }
    return args;
  }

  // ── Helpers ──

  _current() {
    return this.tokens[this.pos] || { type: TokenType.EOF, value: null, position: this.expression.length };
  }

  _advance() {
    const token = this._current();
    this.pos++;
    return token;
  }

  _match(type) {
    if (this._current().type === type) {
      this._advance();
      return true;
    }
    return false;
  }

  _expect(type, message) {
    const token = this._current();
    if (token.type !== type) {
      throw this._error(message || `Expected ${type}, got ${token.type}`);
    }
    return this._advance();
  }

  _error(message) {
    const token = this._current();
    const pos = token.position || this.pos;
    return new SyntaxError(`Parse error at position ${pos}: ${message}`);
  }
}

module.exports = { Parser, NodeType };
