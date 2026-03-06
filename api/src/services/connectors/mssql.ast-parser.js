/**
 * MssqlAstParser
 *
 * Parses SQL Server stored procedures, views, and triggers into AST
 * and extracts structured business logic.
 *
 * Uses node-sql-parser with transactsql dialect.
 *
 * Extracted artifacts:
 *   - Business rules (WHERE conditions, CASE expressions, IF branches)
 *   - Calculations (SET with arithmetic, computed columns)
 *   - Dependencies (reads/writes/calls)
 *   - Control flow (branches, loops, transactions, error handling)
 *   - Complexity metrics (cyclomatic complexity)
 */

const { Parser } = require('node-sql-parser');

class MssqlAstParser {
  constructor() {
    this.parser = new Parser();
    this.parserOptions = { database: 'transactsql' };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Parse SQL into AST.
   * @param {string} sql
   * @returns {{ success: boolean, ast?: object, statements?: object[], error?: string, partialAst?: object[] }}
   */
  parse(sql) {
    const cleaned = this._cleanSql(sql);
    try {
      const ast = this.parser.astify(cleaned, this.parserOptions);
      const statements = Array.isArray(ast) ? ast : [ast];
      return { success: true, ast, statements };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        partialAst: this._attemptPartialParse(cleaned),
      };
    }
  }

  /**
   * Full procedure analysis: AST + rule extraction + dependency + control flow + complexity.
   * @param {string} sql
   * @returns {ProcedureAnalysis}
   */
  analyzeProcedure(sql) {
    const parseResult = this.parse(sql);

    if (!parseResult.success) {
      return {
        parsed: false,
        error: parseResult.error,
        partialStatements: parseResult.partialAst?.filter(p => p.success).length || 0,
        fallback: this._regexFallback(sql),
      };
    }

    const ast = parseResult.ast;

    return {
      parsed: true,
      businessRules: this.extractBusinessRules(ast),
      calculations: this.extractCalculations(ast),
      dependencies: this.extractDependencies(ast),
      controlFlow: this.extractControlFlow(ast),
      complexity: this.calculateComplexity(ast),
      statementCount: parseResult.statements.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Business Rules Extraction
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Extract business rules from WHERE, CASE, IF, CHECK patterns.
   */
  extractBusinessRules(ast) {
    const rules = [];

    // WHERE conditions → validation / filter rules
    const wheres = this._findAll(ast, n => n && n.where);
    for (const node of wheres) {
      rules.push(...this._parseWhere(node.where));
    }

    // CASE expressions → decision logic
    const cases = this._findAll(ast, n => n && n.type === 'case');
    for (const caseNode of cases) {
      rules.push(...this._parseCase(caseNode));
    }

    // IF-like conditions (from binary_expr at statement level)
    const ifs = this._findAll(ast, n => n && n.type === 'if');
    for (const ifNode of ifs) {
      rules.push({
        type: 'conditional_branch',
        condition: this._toText(ifNode.condition),
        hasElse: !!ifNode.else,
      });
    }

    return rules;
  }

  _parseWhere(where) {
    const rules = [];

    const walk = (node, logic) => {
      if (!node) return;
      if (node.type === 'binary_expr') {
        if (node.operator === 'AND' || node.operator === 'OR') {
          walk(node.left, node.operator);
          walk(node.right, node.operator);
        } else {
          rules.push({
            type: 'filter_condition',
            left: this._toText(node.left),
            operator: node.operator,
            right: this._toText(node.right),
            logic: logic || 'AND',
          });
        }
      } else if (node.type === 'unary_expr') {
        rules.push({
          type: 'filter_condition',
          expression: this._toText(node),
          operator: node.operator,
          logic: logic || 'AND',
        });
      }
    };

    walk(where, null);
    return rules;
  }

  _parseCase(caseNode) {
    const rules = [];
    for (const arg of caseNode.args || []) {
      if (arg.type === 'when') {
        rules.push({
          type: 'case_when',
          condition: this._toText(arg.cond),
          result: this._toText(arg.result),
        });
      } else if (arg.type === 'else') {
        rules.push({
          type: 'case_else',
          result: this._toText(arg.result),
        });
      }
    }
    return rules;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Calculations Extraction
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Extract formulas from SET assignments and computed SELECT columns.
   */
  extractCalculations(ast) {
    const calcs = [];
    const arithmeticOps = new Set(['+', '-', '*', '/', '%']);

    // SET @var = expression
    const assigns = this._findAll(ast, n => n && n.keyword === 'set' && n.type === 'assign');
    for (const a of assigns) {
      if (this._hasOp(a.value, arithmeticOps)) {
        calcs.push({
          type: 'assignment',
          target: this._toText(a.left),
          formula: this._toText(a.value),
          inputs: this._extractInputs(a.value),
        });
      }
    }

    // SELECT computed columns
    const selects = this._findAll(ast, n => n && n.type === 'select');
    for (const sel of selects) {
      for (const col of sel.columns || []) {
        if (col === '*') continue;
        if (col.expr && this._hasOp(col.expr, arithmeticOps)) {
          calcs.push({
            type: 'computed_column',
            alias: col.as || null,
            formula: this._toText(col.expr),
            inputs: this._extractInputs(col.expr),
          });
        }
      }
    }

    return calcs;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Dependencies Extraction
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Extract table reads, writes, and procedure calls.
   */
  extractDependencies(ast) {
    const reads = new Set();
    const writes = new Set();
    const calls = new Set();

    const statements = Array.isArray(ast) ? ast : [ast];

    for (const stmt of statements) {
      this._extractDepsFromStatement(stmt, reads, writes, calls);
    }

    return {
      reads: [...reads],
      writes: [...writes],
      calls: [...calls],
    };
  }

  _extractDepsFromStatement(node, reads, writes, calls) {
    if (!node || typeof node !== 'object') return;

    // SELECT → reads
    if (node.type === 'select') {
      this._extractTables(node.from, reads);
      // JOINs
      if (node.from) {
        for (const f of Array.isArray(node.from) ? node.from : [node.from]) {
          if (f.join) this._extractTables([f], reads);
        }
      }
    }

    // INSERT → writes (+ reads from SELECT sub)
    if (node.type === 'insert') {
      const tbl = this._tableName(node.table);
      if (tbl) writes.add(tbl);
      if (node.values) {
        // INSERT INTO ... SELECT → reads from subquery
        this._extractDepsFromStatement(node.values, reads, writes, calls);
      }
    }

    // UPDATE → writes (+ reads from FROM/JOIN)
    if (node.type === 'update') {
      const tbl = this._tableName(node.table);
      if (tbl) writes.add(tbl);
      this._extractTables(node.from, reads);
    }

    // DELETE → writes
    if (node.type === 'delete') {
      const tbl = this._tableName(node.table);
      if (tbl) writes.add(tbl);
    }

    // EXEC / CALL → calls
    if (node.type === 'call') {
      const name = node.expr?.column || node.name || '';
      if (name) calls.add(name);
    }

    // Recurse into arrays and objects
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (key === 'from' || key === 'table') continue; // already handled
      if (Array.isArray(v)) {
        v.forEach(item => this._extractDepsFromStatement(item, reads, writes, calls));
      } else if (typeof v === 'object' && v !== null) {
        this._extractDepsFromStatement(v, reads, writes, calls);
      }
    }
  }

  _extractTables(from, set) {
    if (!from) return;
    const items = Array.isArray(from) ? from : [from];
    for (const f of items) {
      if (!f) continue;
      const tbl = this._tableName(f);
      if (tbl) set.add(tbl);
      // Joined tables
      if (f.join) {
        const joinTbl = this._tableName(f);
        if (joinTbl) set.add(joinTbl);
      }
    }
  }

  _tableName(node) {
    if (!node) return null;
    if (typeof node === 'string') return node;
    const db = node.db || node.schema;
    const table = node.table || node.name;
    if (!table) return null;
    return db ? `${db}.${table}` : table;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Control Flow Extraction
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Extract control flow: branches, loops, transactions, error handling.
   */
  extractControlFlow(ast) {
    const flow = {
      branches: [],
      loops: [],
      transactions: [],
      errorHandling: [],
    };

    // IF branches
    const ifs = this._findAll(ast, n => n && n.type === 'if');
    for (const ifNode of ifs) {
      flow.branches.push({
        condition: this._toText(ifNode.condition),
        hasThen: !!ifNode.then,
        hasElse: !!ifNode.else,
      });
    }

    // WHILE loops
    const whiles = this._findAll(ast, n => n && n.type === 'while');
    for (const w of whiles) {
      flow.loops.push({ condition: this._toText(w.condition) });
    }

    // TRY/CATCH
    const tryCatch = this._findAll(ast, n => n && (n.type === 'try' || n.type === 'begin_try'));
    flow.errorHandling = tryCatch.map(() => ({ hasCatch: true }));

    return flow;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Complexity Calculation
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Cyclomatic complexity approximation.
   */
  calculateComplexity(ast) {
    let cc = 1; // base path

    cc += this._findAll(ast, n => n && n.type === 'if').length;
    cc += this._findAll(ast, n => n && n.type === 'case').length;
    cc += this._findAll(ast, n => n && n.type === 'while').length;
    cc += this._findAll(ast, n =>
      n && n.type === 'binary_expr' && (n.operator === 'AND' || n.operator === 'OR'),
    ).length;

    return {
      cyclomatic: cc,
      level: cc <= 5 ? 'low' : cc <= 15 ? 'medium' : 'high',
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Clean SQL before parsing — strip CREATE PROCEDURE wrapper, comments, etc.
   */
  _cleanSql(sql) {
    if (!sql) return '';

    // Strip ALTER/CREATE PROCEDURE header — keep only the body
    let cleaned = sql;

    // Remove single-line comments
    cleaned = cleaned.replace(/--[^\n]*/g, '');

    // Try to extract body after AS keyword
    const asMatch = cleaned.match(/\bAS\s*\n([\s\S]+)/i);
    if (asMatch) {
      cleaned = asMatch[1];
    }

    // Remove SET ANSI_NULLS, SET QUOTED_IDENTIFIER etc.
    cleaned = cleaned.replace(/^\s*SET\s+(ANSI_NULLS|QUOTED_IDENTIFIER|NOCOUNT)\s+(ON|OFF)\s*;?\s*/gim, '');

    // Remove BEGIN/END wrapper at top level (keep inner)
    cleaned = cleaned.trim();
    if (/^BEGIN\s/i.test(cleaned) && /\sEND\s*$/i.test(cleaned)) {
      cleaned = cleaned.replace(/^BEGIN\s+/i, '').replace(/\s+END\s*$/i, '');
    }

    return cleaned.trim();
  }

  /**
   * Recursive node finder.
   */
  _findAll(ast, predicate) {
    const results = [];
    const visited = new WeakSet();

    const walk = (node) => {
      if (!node || typeof node !== 'object' || visited.has(node)) return;
      if (typeof node === 'object' && node !== null) {
        try { visited.add(node); } catch (_) {}
      }

      if (predicate(node)) results.push(node);

      for (const key of Object.keys(node)) {
        const v = node[key];
        if (Array.isArray(v)) v.forEach(walk);
        else if (typeof v === 'object' && v !== null) walk(v);
      }
    };

    if (Array.isArray(ast)) ast.forEach(walk);
    else walk(ast);
    return results;
  }

  /**
   * Check if expression tree contains specific operators.
   */
  _hasOp(expr, opSet) {
    if (!expr || typeof expr !== 'object') return false;
    if (expr.type === 'binary_expr' && opSet.has(expr.operator)) return true;
    return Object.values(expr).some(v =>
      Array.isArray(v) ? v.some(i => this._hasOp(i, opSet)) : this._hasOp(v, opSet),
    );
  }

  /**
   * Extract column/variable references from expression.
   */
  _extractInputs(expr) {
    const inputs = new Set();

    const walk = (node) => {
      if (!node || typeof node !== 'object') return;
      if (node.type === 'column_ref') {
        inputs.add(node.table ? `${node.table}.${node.column}` : node.column);
      }
      if (node.type === 'var') {
        inputs.add(node.name || node.prefix);
      }
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(walk);
        else if (typeof v === 'object') walk(v);
      }
    };

    walk(expr);
    return [...inputs];
  }

  /**
   * AST node → readable text.
   */
  _toText(node) {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number') return String(node);
    if (node.type === 'column_ref') {
      return node.table ? `${node.table}.${node.column}` : (node.column || '');
    }
    if (node.type === 'number') return String(node.value);
    if (node.type === 'single_quote_string' || node.type === 'string') return `'${node.value}'`;
    if (node.type === 'var') return node.name || `@${node.prefix}`;
    if (node.type === 'null') return 'NULL';
    if (node.type === 'bool') return String(node.value);
    if (node.type === 'binary_expr') {
      return `${this._toText(node.left)} ${node.operator} ${this._toText(node.right)}`;
    }
    if (node.type === 'unary_expr') {
      return `${node.operator} ${this._toText(node.expr)}`;
    }
    if (node.type === 'function') {
      const args = (node.args?.value || []).map(a => this._toText(a)).join(', ');
      return `${node.name}(${args})`;
    }

    // Fallback: try sqlify
    try {
      return this.parser.sqlify(node, this.parserOptions);
    } catch (_) {
      return '[complex_expr]';
    }
  }

  /**
   * Attempt to parse individual statements when full parse fails.
   */
  _attemptPartialParse(sql) {
    const parts = sql.split(/;\s*(?=\n|$)/);
    const results = [];

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.length < 5) continue;
      try {
        const ast = this.parser.astify(trimmed, this.parserOptions);
        results.push({ success: true, ast, sql: trimmed.slice(0, 80) });
      } catch (e) {
        results.push({ success: false, error: e.message, sql: trimmed.slice(0, 80) });
      }
    }

    return results;
  }

  /**
   * Regex-based fallback when AST parsing completely fails.
   */
  _regexFallback(sql) {
    const analysis = {
      tablesReferenced: [],
      proceduresCalled: [],
      hasTransaction: false,
      hasTryCatch: false,
      hasLoop: false,
      hasCursor: false,
      estimatedComplexity: 'unknown',
    };

    // Table references
    const tableRx = /(?:FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s+\[?(\w+)\]?\.\[?(\w+)\]?/gi;
    let m;
    const tables = new Set();
    while ((m = tableRx.exec(sql)) !== null) {
      tables.add(`${m[1]}.${m[2]}`);
    }
    analysis.tablesReferenced = [...tables];

    // Procedure calls
    const execRx = /EXEC(?:UTE)?\s+\[?(\w+)\]?(?:\.\[?(\w+)\]?)?/gi;
    const procs = new Set();
    while ((m = execRx.exec(sql)) !== null) {
      procs.add(m[2] || m[1]);
    }
    analysis.proceduresCalled = [...procs];

    // Patterns
    analysis.hasTransaction = /BEGIN\s+TRAN/i.test(sql);
    analysis.hasTryCatch = /BEGIN\s+TRY/i.test(sql);
    analysis.hasLoop = /WHILE\s+/i.test(sql);
    analysis.hasCursor = /DECLARE\s+\w+\s+CURSOR/i.test(sql);

    // Complexity estimate
    const ifCount = (sql.match(/\bIF\b/gi) || []).length;
    const caseCount = (sql.match(/\bCASE\b/gi) || []).length;
    const whileCount = (sql.match(/\bWHILE\b/gi) || []).length;
    const total = ifCount + caseCount + whileCount;
    analysis.estimatedComplexity = total <= 3 ? 'low' : total <= 10 ? 'medium' : 'high';

    return analysis;
  }
}

module.exports = { MssqlAstParser };
