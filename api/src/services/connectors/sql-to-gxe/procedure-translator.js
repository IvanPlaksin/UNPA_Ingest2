/**
 * SQL Stored Procedure → GXE Graph Translator
 *
 * Takes a complete T-SQL stored procedure, parses it to AST,
 * and generates a fully connected GXE-executable graph.
 *
 * Flow:
 * 1. Parse procedure using node-sql-parser (T-SQL dialect)
 * 2. Extract parameters → INPUT nodes
 * 3. Walk AST body → map each statement to GXE node
 * 4. Build control flow edges (sequential, branching, loops)
 * 5. Track data flow (variable assignments → usages)
 * 6. Return GXE-compatible graph structure
 */

const { Parser } = require('node-sql-parser');
const { v4: uuidv4 } = require('uuid');
const { SqlToGxeNodeMapper, BehavioralNodeType } = require('./node-mapper');

// Parser instance for T-SQL
const parser = new Parser();
const PARSER_OPTIONS = { database: 'transactsql' };

/**
 * Translation result structure
 */
class TranslationResult {
  constructor() {
    this.success = false;
    this.procedureName = null;
    this.procedureSchema = 'dbo';
    this.nodes = [];
    this.edges = [];
    this.inputSchema = {};
    this.outputSchema = {};
    this.errors = [];
    this.warnings = [];
    this.metadata = {
      sqlComplexity: 0,
      nodeCount: 0,
      edgeCount: 0,
      hasTransactions: false,
      hasErrorHandling: false,
      hasLoops: false,
      hasCursors: false,
      calledProcedures: [],
      referencedTables: [],
      referencedVariables: [],
    };
    this.confidence = 1.0;
    this.originalSql = null;
  }

  addNode(node) {
    this.nodes.push(node);
    this.metadata.nodeCount = this.nodes.length;
  }

  addEdge(edge) {
    this.edges.push(edge);
    this.metadata.edgeCount = this.edges.length;
  }

  addError(message, location = null) {
    this.errors.push({ message, location });
    this.confidence = Math.max(0, this.confidence - 0.1);
  }

  addWarning(message, location = null) {
    this.warnings.push({ message, location });
    this.confidence = Math.max(0, this.confidence - 0.02);
  }

  toGxeGraph() {
    return {
      id: uuidv4(),
      name: this.procedureName,
      schema: this.procedureSchema,
      nodes: this.nodes,
      edges: this.edges,
      inputSchema: this.inputSchema,
      outputSchema: this.outputSchema,
      metadata: this.metadata,
      confidence: this.confidence,
    };
  }
}

/**
 * Main translator class.
 * Orchestrates full procedure → GXE graph conversion.
 */
class SqlProcedureTranslator {
  constructor(options = {}) {
    this.nodeMapper = new SqlToGxeNodeMapper(options);
    this.options = {
      includeOriginalSql: options.includeOriginalSql !== false,
      calculateComplexity: options.calculateComplexity !== false,
      maxNodes: options.maxNodes || 500,
      ...options,
    };
  }

  /**
   * Translate SQL stored procedure to GXE graph.
   *
   * @param {string} sql - Complete CREATE PROCEDURE statement
   * @returns {TranslationResult}
   */
  translate(sql) {
    const result = new TranslationResult();
    result.originalSql = sql;

    try {
      // 1. Parse SQL
      const ast = this._parseSQL(sql, result);
      if (!ast) return result;

      // 2. Extract procedure metadata
      this._extractProcedureMetadata(ast, result);

      // 3. Extract parameters → INPUT nodes
      this._processParameters(ast, result);

      // 4. Process procedure body
      const bodyStatements = this._extractBody(ast);
      this._processStatements(bodyStatements, result, { depth: 0 });

      // 5. Build edges
      this._buildControlFlowEdges(result);
      this._buildDataFlowEdges(result);

      // 6. Add OUTPUT node if needed
      this._processOutputs(result);

      // 7. Calculate complexity
      if (this.options.calculateComplexity) {
        this._calculateComplexity(result);
      }

      // 8. Validate result
      this._validateGraph(result);

      // Post-process: extract referenced tables from SQL if AST missed them
      if (sql && result.metadata.referencedTables.length === 0) {
        const sqlTables = this._extractTablesFromSql(sql);
        for (const t of sqlTables) {
          if (!result.metadata.referencedTables.includes(t)) {
            result.metadata.referencedTables.push(t);
          }
        }
      }

      result.success = result.errors.length === 0;
    } catch (error) {
      result.addError(`Translation failed: ${error.message}`);
      result.success = false;
    }

    return result;
  }

  /**
   * Translate from pre-parsed AST (for integration with existing mssql.ast-parser).
   *
   * @param {Object|Array} ast - Pre-parsed AST statements
   * @param {Object} procedureInfo - { name, schema, sql }
   * @returns {TranslationResult}
   */
  translateFromAst(ast, procedureInfo = {}) {
    const result = new TranslationResult();
    result.procedureName = procedureInfo.name || 'unknown';
    result.procedureSchema = procedureInfo.schema || 'dbo';
    result.originalSql = procedureInfo.sql || null;

    try {
      const statements = Array.isArray(ast) ? ast : [ast];
      this._processStatements(statements, result, { depth: 0 });

      this._buildControlFlowEdges(result);
      this._buildDataFlowEdges(result);
      this._processOutputs(result);

      if (this.options.calculateComplexity) {
        this._calculateComplexity(result);
      }

      this._validateGraph(result);

      // Post-process: extract referenced tables from SQL if AST missed them
      if (procedureInfo.sql && result.metadata.referencedTables.length === 0) {
        const sqlTables = this._extractTablesFromSql(procedureInfo.sql);
        for (const t of sqlTables) {
          if (!result.metadata.referencedTables.includes(t)) {
            result.metadata.referencedTables.push(t);
          }
        }
      }

      result.success = result.errors.length === 0;
    } catch (error) {
      result.addError(`Translation failed: ${error.message}`);
      result.success = false;
    }

    return result;
  }

  /**
   * Extract table names from raw SQL using regex patterns.
   * Fallback for when AST parsing doesn't populate entity data.
   */
  _extractTablesFromSql(sql) {
    const tables = new Set();
    const cleaned = sql
      .replace(/--[^\n]*/g, '')            // remove single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, '');   // remove block comments

    // FROM <table>, JOIN <table>
    const fromPattern = /(?:FROM|JOIN)\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?/gi;
    let m;
    while ((m = fromPattern.exec(cleaned)) !== null) {
      const t = m[1];
      if (!this._isSqlKeyword(t)) tables.add(t);
    }

    // INSERT INTO <table>
    const insertPattern = /INSERT\s+(?:INTO\s+)?(?:\[?dbo\]?\.)?\[?(\w+)\]?/gi;
    while ((m = insertPattern.exec(cleaned)) !== null) {
      const t = m[1];
      if (!this._isSqlKeyword(t)) tables.add(t);
    }

    // UPDATE <table>
    const updatePattern = /UPDATE\s+(?:\[?dbo\]?\.)?\[?(\w+)\]?/gi;
    while ((m = updatePattern.exec(cleaned)) !== null) {
      const t = m[1];
      if (!this._isSqlKeyword(t)) tables.add(t);
    }

    // DELETE FROM <table>
    const deletePattern = /DELETE\s+(?:FROM\s+)?(?:\[?dbo\]?\.)?\[?(\w+)\]?/gi;
    while ((m = deletePattern.exec(cleaned)) !== null) {
      const t = m[1];
      if (!this._isSqlKeyword(t)) tables.add(t);
    }

    // Filter out SQL pseudo-tables
    tables.delete('inserted');
    tables.delete('deleted');
    tables.delete('INSERTED');
    tables.delete('DELETED');

    return [...tables];
  }

  _isSqlKeyword(word) {
    const keywords = new Set([
      'SELECT', 'FROM', 'WHERE', 'SET', 'VALUES', 'INTO',
      'TABLE', 'INDEX', 'VIEW', 'PROCEDURE', 'FUNCTION',
      'BEGIN', 'END', 'IF', 'ELSE', 'WHILE', 'RETURN',
      'DECLARE', 'EXEC', 'EXECUTE', 'OUTPUT', 'AS',
      'inserted', 'deleted', 'INSERTED', 'DELETED',
    ]);
    return keywords.has(word) || keywords.has(word.toUpperCase());
  }

  // ============================================================
  // PARSING
  // ============================================================

  _parseSQL(sql, result) {
    try {
      const cleanedSql = this._cleanSql(sql);
      return parser.astify(cleanedSql, PARSER_OPTIONS);
    } catch (parseError) {
      result.addError(`SQL parsing failed: ${parseError.message}`);

      // Try fallback regex-based extraction
      const fallbackAst = this._fallbackParse(sql, result);
      if (fallbackAst) {
        result.addWarning('Used fallback parser, some details may be missing');
        return fallbackAst;
      }

      return null;
    }
  }

  _cleanSql(sql) {
    return sql
      // Remove GO statements (batch separator, not T-SQL)
      .replace(/^\s*GO\s*$/gim, '')
      // Remove SET NOCOUNT / SET ANSI_NULLS etc.
      .replace(/SET\s+(NOCOUNT|ANSI_NULLS|QUOTED_IDENTIFIER)\s+(ON|OFF)\s*;?/gi, '')
      // Normalize whitespace (preserve newlines for readability)
      .replace(/[ \t]+/g, ' ')
      .trim();
  }

  /**
   * Regex-based fallback when node-sql-parser fails on complex T-SQL.
   * Extracts procedure name, parameters, and body statements.
   */
  _fallbackParse(sql, result) {
    // Extract procedure name
    const procMatch = sql.match(
      /CREATE\s+(?:OR\s+ALTER\s+)?PROC(?:EDURE)?\s+(\[?[\w.]+\]?(?:\.\[?[\w]+\]?)?)/i
    );
    if (procMatch) {
      const fullName = procMatch[1].replace(/[\[\]]/g, '');
      const parts = fullName.split('.');
      if (parts.length > 1) {
        result.procedureSchema = parts[0];
        result.procedureName = parts[1];
      } else {
        result.procedureName = parts[0];
      }
    }

    // Extract parameters (between procedure name and AS)
    const paramBlock = sql.match(
      /PROC(?:EDURE)?\s+[\w\[\].]+\s*((?:@[\w]+\s+[\w()]+(?:\s*=\s*[^,@]+)?(?:\s+OUTPUT)?\s*,?\s*)*)\s*AS\b/is
    );
    if (paramBlock && paramBlock[1]) {
      const paramRegex = /@(\w+)\s+([\w()]+)(?:\s*=\s*([^,@]+?))?(?:\s+(OUTPUT))?(?:\s*,|\s*$)/gi;
      let match;
      while ((match = paramRegex.exec(paramBlock[1])) !== null) {
        const paramName = `@${match[1]}`;
        const dataType = match[2].trim();
        const defaultValue = match[3]?.trim();
        const isOutput = !!match[4];

        result.inputSchema[paramName] = dataType;
        if (isOutput) result.outputSchema[paramName] = dataType;

        result.addNode(
          this.nodeMapper.createInputNode(
            {
              name: paramName,
              dataType,
              defaultValue,
              hasDefault: defaultValue !== undefined,
            },
            { nodeIndex: result.nodes.length, depth: 0 }
          )
        );
      }
    }

    // Extract body (everything after AS BEGIN...END or just AS)
    const bodyMatch = sql.match(/\bAS\b\s*(?:BEGIN\s*)?([\s\S]*?)(?:\s*END\s*$|\s*$)/i);
    if (!bodyMatch) return null;

    const body = bodyMatch[1];
    const statements = this._splitBodyStatements(body);

    return statements.length > 0 ? statements : null;
  }

  /**
   * Split procedure body into individual statement objects for mapping.
   */
  _splitBodyStatements(body) {
    const statements = [];

    // Split by semicolons but respect BEGIN...END blocks
    const rawParts = this._splitRespectingBlocks(body);

    for (const part of rawParts) {
      const trimmed = part.trim();
      if (!trimmed || /^\s*--/.test(trimmed)) continue;

      const stmtType = this._detectStatementType(trimmed);
      if (stmtType) {
        statements.push({ type: stmtType, _sql: trimmed, _fallback: true });
      }
    }

    return statements;
  }

  /**
   * Split SQL body by semicolons, respecting BEGIN...END nesting.
   */
  _splitRespectingBlocks(body) {
    const parts = [];
    let current = '';
    let depth = 0;

    // Simple tokenizer that tracks BEGIN/END depth
    const tokens = body.split(/\b/);
    for (const token of tokens) {
      const upper = token.trim().toUpperCase();
      if (upper === 'BEGIN') depth++;
      if (upper === 'END') depth = Math.max(0, depth - 1);

      if (token === ';' && depth === 0) {
        parts.push(current);
        current = '';
      } else {
        current += token;
      }
    }
    if (current.trim()) parts.push(current);

    return parts;
  }

  _detectStatementType(sql) {
    const normalized = sql.replace(/--[^\n]*/g, '').trim();
    const patterns = [
      [/^SELECT\b/i, 'select'],
      [/^INSERT\b/i, 'insert'],
      [/^UPDATE\b/i, 'update'],
      [/^DELETE\b/i, 'delete'],
      [/^MERGE\b/i, 'merge'],
      [/^TRUNCATE\b/i, 'truncate'],
      [/^IF\b/i, 'if'],
      [/^WHILE\b/i, 'while'],
      [/^EXEC(?:UTE)?\b/i, 'exec'],
      [/^SET\s+@/i, 'set'],
      [/^DECLARE\b/i, 'declare'],
      [/^RAISERROR\b/i, 'raiserror'],
      [/^THROW\b/i, 'throw'],
      [/^BEGIN\s+TRAN/i, 'begin'],
      [/^COMMIT\b/i, 'commit'],
      [/^ROLLBACK\b/i, 'rollback'],
      [/^SAVE\s+TRAN/i, 'save'],
      [/^DECLARE\s+.*\s+CURSOR\b/i, 'cursor'],
    ];

    for (const [pattern, type] of patterns) {
      if (pattern.test(normalized)) return type;
    }
    return null;
  }

  // ============================================================
  // METADATA EXTRACTION
  // ============================================================

  _extractProcedureMetadata(ast, result) {
    if (!ast) return;

    const procAst = Array.isArray(ast) ? ast[0] : ast;

    if (procAst.type === 'create' && procAst.keyword === 'procedure') {
      const name = procAst.name;
      if (typeof name === 'string') {
        result.procedureName = name;
      } else if (name) {
        result.procedureName = name.name || name.value || 'unknown';
        result.procedureSchema = name.schema || 'dbo';
      }
    }
  }

  _extractBody(ast) {
    if (!ast) return [];

    if (Array.isArray(ast)) {
      const procAst = ast[0];
      if (procAst?.type === 'create' && procAst?.keyword === 'procedure') {
        return procAst.body || [];
      }
      return ast;
    }

    if (ast.type === 'create' && ast.keyword === 'procedure') {
      return ast.body || [];
    }

    return [ast];
  }

  // ============================================================
  // PARAMETER PROCESSING
  // ============================================================

  _processParameters(ast, result) {
    const procAst = Array.isArray(ast) ? ast[0] : ast;
    if (!procAst?.parameters) return;

    for (let i = 0; i < procAst.parameters.length; i++) {
      const param = procAst.parameters[i];
      const paramName = param.name || `@param${i}`;
      const dataType = param.type || 'nvarchar';

      const inputNode = this.nodeMapper.createInputNode(
        {
          name: paramName,
          dataType,
          defaultValue: param.default,
          hasDefault: param.default !== undefined,
        },
        { nodeIndex: i, depth: 0 }
      );

      result.addNode(inputNode);
      result.inputSchema[paramName] = dataType;

      if (param.output) {
        result.outputSchema[paramName] = dataType;
      }
    }
  }

  // ============================================================
  // STATEMENT PROCESSING
  // ============================================================

  /**
   * Process a list of AST statements, mapping each to GXE nodes.
   * Handles nested structures (IF/WHILE bodies) recursively.
   */
  _processStatements(statements, result, context = {}) {
    if (!statements) return;

    if (!Array.isArray(statements)) {
      this._processStatement(statements, result, context);
      return;
    }

    const depth = context.depth || 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      if (!stmt) continue;

      if (result.nodes.length >= this.options.maxNodes) {
        result.addWarning(`Max nodes limit (${this.options.maxNodes}) reached, truncating`);
        break;
      }

      this._processStatement(stmt, result, {
        ...context,
        nodeIndex: result.nodes.length,
        depth,
      });
    }
  }

  _processStatement(stmt, result, context) {
    if (!stmt || !stmt.type) return;

    // Attempt SQL reconstruction for reference
    if (this.options.includeOriginalSql && !stmt._sql) {
      try {
        stmt._sql = parser.sqlify(stmt, PARSER_OPTIONS);
      } catch {
        // Reconstruction not critical
      }
    }

    // Map to GXE node
    const gxeNode = this.nodeMapper.mapNode(stmt, context);

    if (gxeNode) {
      // Tag node with parent and branch info for edge building
      gxeNode._parentId = context.parentId || null;
      gxeNode._branch = context.branch || null;
      gxeNode._depth = context.depth || 0;
      gxeNode._isLoopBody = context.isLoop || false;

      result.addNode(gxeNode);

      this._updateMetadata(gxeNode, stmt, result);
      this._processNestedStatements(stmt, gxeNode, result, context);
    } else {
      result.addWarning(`Could not map statement type: ${stmt.type}`);
    }
  }

  /**
   * Process nested blocks inside IF/WHILE/TRY-CATCH statements.
   */
  _processNestedStatements(stmt, parentNode, result, context) {
    const nextDepth = (context.depth || 0) + 1;
    const stmtType = stmt.type?.toLowerCase();

    // IF: process then/else blocks
    if (stmtType === 'if') {
      if (stmt.then) {
        const thenStmts = Array.isArray(stmt.then) ? stmt.then : [stmt.then];
        this._processStatements(thenStmts, result, {
          depth: nextDepth,
          parentId: parentNode.id,
          branch: 'true',
        });
      }
      if (stmt.else) {
        const elseStmts = Array.isArray(stmt.else) ? stmt.else : [stmt.else];
        this._processStatements(elseStmts, result, {
          depth: nextDepth,
          parentId: parentNode.id,
          branch: 'false',
        });
      }
    }

    // WHILE: process body
    if (stmtType === 'while' && stmt.body) {
      const bodyStmts = Array.isArray(stmt.body) ? stmt.body : [stmt.body];
      this._processStatements(bodyStmts, result, {
        depth: nextDepth,
        parentId: parentNode.id,
        isLoop: true,
      });
    }

    // TRY/CATCH blocks
    if (stmt.try) {
      this._processStatements(
        Array.isArray(stmt.try) ? stmt.try : [stmt.try],
        result,
        { depth: nextDepth, parentId: parentNode.id, branch: 'try' }
      );
    }
    if (stmt.catch) {
      this._processStatements(
        Array.isArray(stmt.catch) ? stmt.catch : [stmt.catch],
        result,
        { depth: nextDepth, parentId: parentNode.id, branch: 'catch' }
      );
    }
  }

  _updateMetadata(gxeNode, stmt, result) {
    if (gxeNode.type === BehavioralNodeType.TRANSACTION) {
      result.metadata.hasTransactions = true;
    }
    if (gxeNode.type === BehavioralNodeType.ERROR) {
      result.metadata.hasErrorHandling = true;
    }
    if (gxeNode.type === BehavioralNodeType.LOOP) {
      result.metadata.hasLoops = true;
      if (gxeNode.data?.loopType === 'CURSOR') {
        result.metadata.hasCursors = true;
      }
    }
    if (gxeNode.type === BehavioralNodeType.SUBPROCESS) {
      const procName = gxeNode.data?.procedureName;
      if (procName && !result.metadata.calledProcedures.includes(procName)) {
        result.metadata.calledProcedures.push(procName);
      }
    }

    // Track referenced tables (exclude SQL pseudo-tables)
    const pseudoTables = new Set(['inserted', 'deleted', 'INSERTED', 'DELETED']);
    const tables = [];
    if (gxeNode.data?.entity) tables.push(gxeNode.data.entity);
    if (gxeNode.data?.entities) tables.push(...gxeNode.data.entities);
    for (const t of tables) {
      if (t && !pseudoTables.has(t) && !result.metadata.referencedTables.includes(t)) {
        result.metadata.referencedTables.push(t);
      }
    }

    // Track referenced variables
    if (gxeNode.data?.variable) {
      const v = gxeNode.data.variable;
      if (!result.metadata.referencedVariables.includes(v)) {
        result.metadata.referencedVariables.push(v);
      }
    }
  }

  // ============================================================
  // EDGE BUILDING — Control Flow
  // ============================================================

  /**
   * Build control flow edges based on node ordering,
   * parent-child relationships, and branch metadata.
   */
  _buildControlFlowEdges(result) {
    const nodes = result.nodes;
    if (nodes.length < 2) return;

    const inputNodes = nodes.filter(n => n.type === BehavioralNodeType.INPUT);
    const outputNodes = nodes.filter(n => n.type === BehavioralNodeType.OUTPUT);
    const bodyNodes = nodes.filter(
      n => n.type !== BehavioralNodeType.INPUT && n.type !== BehavioralNodeType.OUTPUT
    );

    // Connect all INPUT nodes to first body node
    if (inputNodes.length > 0 && bodyNodes.length > 0) {
      for (const inp of inputNodes) {
        result.addEdge({
          id: `cf_${inp.id}_${bodyNodes[0].id}`,
          source: inp.id,
          target: bodyNodes[0].id,
          type: 'default',
          label: '',
        });
      }
    }

    // Build sequential + branch + loop edges for body
    this._buildBodyEdges(bodyNodes, result);

    // Connect last body node to OUTPUT nodes
    if (outputNodes.length > 0 && bodyNodes.length > 0) {
      const lastBody = bodyNodes[bodyNodes.length - 1];
      for (const out of outputNodes) {
        result.addEdge({
          id: `cf_${lastBody.id}_${out.id}`,
          source: lastBody.id,
          target: out.id,
          type: 'default',
          label: '',
        });
      }
    }
  }

  /**
   * Build edges between body nodes using _parentId/_branch metadata
   * to correctly wire branching and loop structures.
   */
  _buildBodyEdges(bodyNodes, result) {
    if (bodyNodes.length < 2) return;

    // Group nodes by parentId to identify branch structures
    const childrenOf = new Map(); // parentId -> { branch -> [nodeIds] }

    for (const node of bodyNodes) {
      if (node._parentId) {
        if (!childrenOf.has(node._parentId)) {
          childrenOf.set(node._parentId, new Map());
        }
        const branches = childrenOf.get(node._parentId);
        const branch = node._branch || 'default';
        if (!branches.has(branch)) branches.set(branch, []);
        branches.get(branch).push(node);
      }
    }

    // Top-level nodes (no parent) — connect sequentially
    const topLevel = bodyNodes.filter(n => !n._parentId);

    for (let i = 0; i < topLevel.length - 1; i++) {
      const current = topLevel[i];
      const next = topLevel[i + 1];

      // DECISION nodes get branch edges instead
      if (current.type === BehavioralNodeType.DECISION && childrenOf.has(current.id)) {
        this._buildBranchEdges(current, childrenOf.get(current.id), next, result);
        continue;
      }

      // LOOP nodes get body + exit edges
      if (current.type === BehavioralNodeType.LOOP && childrenOf.has(current.id)) {
        this._buildLoopEdges(current, childrenOf.get(current.id), next, result);
        continue;
      }

      // Sequential edge
      result.addEdge({
        id: `cf_${current.id}_${next.id}`,
        source: current.id,
        target: next.id,
        type: 'default',
        label: '',
      });
    }

    // Wire sequential edges within each branch group
    for (const [, branches] of childrenOf) {
      for (const [, branchNodes] of branches) {
        for (let i = 0; i < branchNodes.length - 1; i++) {
          result.addEdge({
            id: `cf_${branchNodes[i].id}_${branchNodes[i + 1].id}`,
            source: branchNodes[i].id,
            target: branchNodes[i + 1].id,
            type: 'default',
            label: '',
          });
        }
      }
    }
  }

  /**
   * Build edges from a DECISION node to its branch entry nodes,
   * and from branch exit nodes to the merge point.
   */
  _buildBranchEdges(decisionNode, branches, mergeTarget, result) {
    for (const [branchLabel, branchNodes] of branches) {
      if (branchNodes.length === 0) continue;

      const entry = branchNodes[0];
      const exit = branchNodes[branchNodes.length - 1];

      // Decision → branch entry
      result.addEdge({
        id: `cf_${decisionNode.id}_${entry.id}_${branchLabel}`,
        source: decisionNode.id,
        sourceHandle: branchLabel,
        target: entry.id,
        type: branchLabel === 'true' ? 'success' : 'failure',
        label: branchLabel === 'true' ? 'Yes' : branchLabel === 'false' ? 'No' : branchLabel,
      });

      // Branch exit → merge point
      if (mergeTarget) {
        result.addEdge({
          id: `cf_${exit.id}_${mergeTarget.id}_merge`,
          source: exit.id,
          target: mergeTarget.id,
          type: 'default',
          label: '',
        });
      }
    }
  }

  /**
   * Build edges for LOOP node: entry into body and back-edge + exit.
   */
  _buildLoopEdges(loopNode, branches, exitTarget, result) {
    // Find body nodes (any branch under this loop)
    const bodyNodes = [];
    for (const [, nodes] of branches) {
      bodyNodes.push(...nodes);
    }

    if (bodyNodes.length > 0) {
      // Loop → first body node
      result.addEdge({
        id: `cf_${loopNode.id}_${bodyNodes[0].id}_body`,
        source: loopNode.id,
        sourceHandle: 'body',
        target: bodyNodes[0].id,
        type: 'loop',
        label: 'Loop',
      });

      // Back-edge: last body node → loop node (for re-evaluation)
      const lastBody = bodyNodes[bodyNodes.length - 1];
      result.addEdge({
        id: `cf_${lastBody.id}_${loopNode.id}_back`,
        source: lastBody.id,
        target: loopNode.id,
        type: 'back-edge',
        label: 'Repeat',
        data: { isBackEdge: true },
      });
    }

    // Loop exit → next node
    if (exitTarget) {
      result.addEdge({
        id: `cf_${loopNode.id}_${exitTarget.id}_exit`,
        source: loopNode.id,
        sourceHandle: 'exit',
        target: exitTarget.id,
        type: 'default',
        label: 'Exit',
      });
    }
  }

  // ============================================================
  // EDGE BUILDING — Data Flow
  // ============================================================

  /**
   * Track variable definitions (SET @x = ..., DECLARE @x) and usages
   * (nodes whose inputs reference @x), then create data flow edges.
   */
  _buildDataFlowEdges(result) {
    // Build variable definition map: variable name → defining node id
    const varDefs = new Map();

    for (const node of result.nodes) {
      // CALCULATION nodes define variables
      if (node.data?.variable && node.data.variable.startsWith('@')) {
        varDefs.set(node.data.variable, node.id);
      }

      // OUTPUT ports that are @variables
      if (node.outputs) {
        for (const out of node.outputs) {
          if (out.id && out.id.startsWith('@')) {
            varDefs.set(out.id, node.id);
          }
        }
      }

      // INPUT nodes expose parameter variables
      if (node.type === BehavioralNodeType.INPUT && node.data?.parameterName) {
        varDefs.set(node.data.parameterName, node.id);
      }
    }

    // Find usages and create data flow edges
    for (const node of result.nodes) {
      if (!node.inputs) continue;

      for (const input of node.inputs) {
        if (input.id && varDefs.has(input.id)) {
          const defNodeId = varDefs.get(input.id);
          if (defNodeId === node.id) continue; // Skip self-ref

          // Avoid duplicate edges
          const edgeId = `df_${defNodeId}_${node.id}_${input.id}`;
          if (result.edges.some(e => e.id === edgeId)) continue;

          result.addEdge({
            id: edgeId,
            source: defNodeId,
            sourceHandle: input.id,
            target: node.id,
            targetHandle: input.id,
            type: 'dataflow',
            label: input.id,
            data: { isDataFlow: true },
          });
        }
      }
    }
  }

  // ============================================================
  // OUTPUT PROCESSING
  // ============================================================

  _processOutputs(result) {
    if (Object.keys(result.outputSchema).length === 0) return;

    const outputs = Object.entries(result.outputSchema).map(([name, type]) => ({
      name,
      dataType: type,
    }));

    const outputNode = this.nodeMapper.createOutputNode(outputs, {
      nodeIndex: result.nodes.length,
      depth: 0,
    });

    result.addNode(outputNode);
  }

  // ============================================================
  // COMPLEXITY CALCULATION
  // ============================================================

  /**
   * Cyclomatic-style complexity score:
   *   Base 1 + each DECISION +1, LOOP +2, ERROR +1, SUBPROCESS +1
   */
  _calculateComplexity(result) {
    let complexity = 1;

    for (const node of result.nodes) {
      switch (node.type) {
        case BehavioralNodeType.DECISION:
          complexity += 1;
          break;
        case BehavioralNodeType.LOOP:
          complexity += 2;
          break;
        case BehavioralNodeType.ERROR:
          complexity += 1;
          break;
        case BehavioralNodeType.SUBPROCESS:
          complexity += 1;
          break;
      }
    }

    result.metadata.sqlComplexity = complexity;
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  _validateGraph(result) {
    const connectedNodes = new Set();

    for (const edge of result.edges) {
      connectedNodes.add(edge.source);
      connectedNodes.add(edge.target);
    }

    // All non-INPUT nodes should be connected if graph has >1 body node
    const bodyNodes = result.nodes.filter(n => n.type !== BehavioralNodeType.INPUT);

    if (bodyNodes.length > 1) {
      for (const node of bodyNodes) {
        if (!connectedNodes.has(node.id)) {
          result.addWarning(`Node ${node.id} (${node.data?.label}) is not connected`);
        }
      }
    }

    if (result.nodes.length === 0) {
      result.addError('Graph has no nodes');
    }

    // Check for duplicate edge ids
    const edgeIds = new Set();
    for (const edge of result.edges) {
      if (edgeIds.has(edge.id)) {
        result.addWarning(`Duplicate edge id: ${edge.id}`);
      }
      edgeIds.add(edge.id);
    }
  }
}

module.exports = {
  SqlProcedureTranslator,
  TranslationResult,
};
