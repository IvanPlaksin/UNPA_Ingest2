/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PREDICATE EXPRESSION LEXER
 * Tokenizes CEL-inspired predicate expressions for form validation
 * and display condition evaluation.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// TOKEN TYPES
// ────────────────────────────────────────────────────────────────────────────

const TokenType = {
  // Literals
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  NULL: 'NULL',
  UNDEFINED: 'UNDEFINED',

  // Identifiers
  IDENTIFIER: 'IDENTIFIER',

  // Operators
  EQ: 'EQ',           // ==
  NEQ: 'NEQ',         // !=
  GT: 'GT',           // >
  GTE: 'GTE',         // >=
  LT: 'LT',          // <
  LTE: 'LTE',         // <=
  AND: 'AND',         // &&
  OR: 'OR',           // ||
  NOT: 'NOT',         // !
  PLUS: 'PLUS',       // +
  MINUS: 'MINUS',     // -
  MULTIPLY: 'MULTIPLY', // *
  DIVIDE: 'DIVIDE',   // /
  MODULO: 'MODULO',   // %

  // Keywords
  IN: 'IN',           // in
  NOT_IN: 'NOT_IN',   // not in

  // Delimiters
  LPAREN: 'LPAREN',   // (
  RPAREN: 'RPAREN',   // )
  LBRACKET: 'LBRACKET', // [
  RBRACKET: 'RBRACKET', // ]
  COMMA: 'COMMA',     // ,
  DOT: 'DOT',         // .

  // End
  EOF: 'EOF',
};

// ────────────────────────────────────────────────────────────────────────────
// TOKEN CLASS
// ────────────────────────────────────────────────────────────────────────────

class Token {
  constructor(type, value, position) {
    this.type = type;
    this.value = value;
    this.position = position;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// LEXER
// ────────────────────────────────────────────────────────────────────────────

class Lexer {
  constructor(input) {
    this.input = input;
    this.pos = 0;
    this.tokens = [];
  }

  tokenize() {
    while (this.pos < this.input.length) {
      this._skipWhitespace();
      if (this.pos >= this.input.length) break;

      const ch = this.input[this.pos];

      // String literals
      if (ch === "'" || ch === '"') {
        this.tokens.push(this._readString());
        continue;
      }

      // Numbers
      if (this._isDigit(ch) || (ch === '-' && this._isDigit(this._peek(1)))) {
        this.tokens.push(this._readNumber());
        continue;
      }

      // Identifiers and keywords
      if (this._isIdentStart(ch)) {
        this.tokens.push(this._readIdentifier());
        continue;
      }

      // Two-char operators
      const twoChar = this.input.slice(this.pos, this.pos + 2);
      if (twoChar === '==') { this.tokens.push(new Token(TokenType.EQ, '==', this.pos)); this.pos += 2; continue; }
      if (twoChar === '!=') { this.tokens.push(new Token(TokenType.NEQ, '!=', this.pos)); this.pos += 2; continue; }
      if (twoChar === '>=') { this.tokens.push(new Token(TokenType.GTE, '>=', this.pos)); this.pos += 2; continue; }
      if (twoChar === '<=') { this.tokens.push(new Token(TokenType.LTE, '<=', this.pos)); this.pos += 2; continue; }
      if (twoChar === '&&') { this.tokens.push(new Token(TokenType.AND, '&&', this.pos)); this.pos += 2; continue; }
      if (twoChar === '||') { this.tokens.push(new Token(TokenType.OR, '||', this.pos)); this.pos += 2; continue; }

      // Single-char operators and delimiters
      switch (ch) {
        case '>': this.tokens.push(new Token(TokenType.GT, '>', this.pos)); this.pos++; continue;
        case '<': this.tokens.push(new Token(TokenType.LT, '<', this.pos)); this.pos++; continue;
        case '!': this.tokens.push(new Token(TokenType.NOT, '!', this.pos)); this.pos++; continue;
        case '+': this.tokens.push(new Token(TokenType.PLUS, '+', this.pos)); this.pos++; continue;
        case '-': this.tokens.push(new Token(TokenType.MINUS, '-', this.pos)); this.pos++; continue;
        case '*': this.tokens.push(new Token(TokenType.MULTIPLY, '*', this.pos)); this.pos++; continue;
        case '/': this.tokens.push(new Token(TokenType.DIVIDE, '/', this.pos)); this.pos++; continue;
        case '%': this.tokens.push(new Token(TokenType.MODULO, '%', this.pos)); this.pos++; continue;
        case '(': this.tokens.push(new Token(TokenType.LPAREN, '(', this.pos)); this.pos++; continue;
        case ')': this.tokens.push(new Token(TokenType.RPAREN, ')', this.pos)); this.pos++; continue;
        case '[': this.tokens.push(new Token(TokenType.LBRACKET, '[', this.pos)); this.pos++; continue;
        case ']': this.tokens.push(new Token(TokenType.RBRACKET, ']', this.pos)); this.pos++; continue;
        case ',': this.tokens.push(new Token(TokenType.COMMA, ',', this.pos)); this.pos++; continue;
        case '.': this.tokens.push(new Token(TokenType.DOT, '.', this.pos)); this.pos++; continue;
        default:
          throw this._error(`Unexpected character: '${ch}'`);
      }
    }

    this.tokens.push(new Token(TokenType.EOF, null, this.pos));
    return this.tokens;
  }

  _readString() {
    const quote = this.input[this.pos];
    const start = this.pos;
    this.pos++; // skip opening quote
    let value = '';

    while (this.pos < this.input.length && this.input[this.pos] !== quote) {
      if (this.input[this.pos] === '\\') {
        this.pos++;
        if (this.pos >= this.input.length) throw this._error('Unterminated string escape');
        const escaped = this.input[this.pos];
        switch (escaped) {
          case 'n': value += '\n'; break;
          case 't': value += '\t'; break;
          case '\\': value += '\\'; break;
          case "'": value += "'"; break;
          case '"': value += '"'; break;
          default: value += escaped;
        }
      } else {
        value += this.input[this.pos];
      }
      this.pos++;
    }

    if (this.pos >= this.input.length) throw this._error('Unterminated string', start);
    this.pos++; // skip closing quote
    return new Token(TokenType.STRING, value, start);
  }

  _readNumber() {
    const start = this.pos;
    let numStr = '';

    if (this.input[this.pos] === '-') {
      numStr += '-';
      this.pos++;
    }

    while (this.pos < this.input.length && this._isDigit(this.input[this.pos])) {
      numStr += this.input[this.pos];
      this.pos++;
    }

    if (this.pos < this.input.length && this.input[this.pos] === '.') {
      numStr += '.';
      this.pos++;
      while (this.pos < this.input.length && this._isDigit(this.input[this.pos])) {
        numStr += this.input[this.pos];
        this.pos++;
      }
    }

    return new Token(TokenType.NUMBER, parseFloat(numStr), start);
  }

  _readIdentifier() {
    const start = this.pos;
    let name = '';

    while (this.pos < this.input.length && this._isIdentChar(this.input[this.pos])) {
      name += this.input[this.pos];
      this.pos++;
    }

    // Keywords
    switch (name) {
      case 'true': return new Token(TokenType.BOOLEAN, true, start);
      case 'false': return new Token(TokenType.BOOLEAN, false, start);
      case 'null': return new Token(TokenType.NULL, null, start);
      case 'undefined': return new Token(TokenType.UNDEFINED, undefined, start);
      case 'in': return new Token(TokenType.IN, 'in', start);
      case 'not': {
        // Check for "not in"
        const saved = this.pos;
        this._skipWhitespace();
        if (this.pos < this.input.length && this.input.slice(this.pos, this.pos + 2) === 'in'
            && !this._isIdentChar(this.input[this.pos + 2] || '')) {
          this.pos += 2;
          return new Token(TokenType.NOT_IN, 'not in', start);
        }
        this.pos = saved;
        return new Token(TokenType.IDENTIFIER, name, start);
      }
      default:
        return new Token(TokenType.IDENTIFIER, name, start);
    }
  }

  _skipWhitespace() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  _peek(offset = 0) {
    return this.input[this.pos + offset] || '';
  }

  _isDigit(ch) { return ch >= '0' && ch <= '9'; }
  _isIdentStart(ch) { return /[a-zA-Z_$]/.test(ch); }
  _isIdentChar(ch) { return /[a-zA-Z0-9_$]/.test(ch); }

  _error(message, position) {
    const pos = position !== undefined ? position : this.pos;
    return new SyntaxError(`Lexer error at position ${pos}: ${message}`);
  }
}

module.exports = { Lexer, Token, TokenType };
