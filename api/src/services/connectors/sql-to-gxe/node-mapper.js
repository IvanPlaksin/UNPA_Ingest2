/**
 * SQL AST -> GXE Node Mapper
 *
 * Converts SQL AST nodes (from node-sql-parser or manual parsing)
 * to GXE-compatible BehavioralNode objects.
 *
 * Each SQL construct maps to a specific BehavioralNodeType:
 *   SELECT        -> READ
 *   INSERT/UPDATE -> WRITE
 *   IF/CASE       -> DECISION
 *   SET/DECLARE   -> CALCULATION
 *   WHILE/CURSOR  -> LOOP
 *   EXEC          -> SUBPROCESS
 *   RAISERROR     -> ERROR
 *   BEGIN TRAN    -> TRANSACTION
 */

const { v4: uuidv4 } = require('uuid');

// BehavioralNodeType enum (mirror from multi-domain.types.ts)
const BehavioralNodeType = {
  READ: 'READ',
  WRITE: 'WRITE',
  DECISION: 'DECISION',
  CALCULATION: 'CALCULATION',
  LOOP: 'LOOP',
  SUBPROCESS: 'SUBPROCESS',
  ERROR: 'ERROR',
  TRANSACTION: 'TRANSACTION',
  INPUT: 'INPUT',
  OUTPUT: 'OUTPUT',
};

// SQL statement type -> GXE node type mapping
const SQL_TO_GXE_TYPE = {
  // Read operations
  select: BehavioralNodeType.READ,

  // Write operations
  insert: BehavioralNodeType.WRITE,
  update: BehavioralNodeType.WRITE,
  delete: BehavioralNodeType.WRITE,
  merge: BehavioralNodeType.WRITE,
  truncate: BehavioralNodeType.WRITE,

  // Control flow
  if: BehavioralNodeType.DECISION,
  case: BehavioralNodeType.DECISION,

  // Loops
  while: BehavioralNodeType.LOOP,
  cursor: BehavioralNodeType.LOOP,

  // Subprocess
  exec: BehavioralNodeType.SUBPROCESS,
  execute: BehavioralNodeType.SUBPROCESS,
  call: BehavioralNodeType.SUBPROCESS,

  // Transactions
  begin: BehavioralNodeType.TRANSACTION,
  commit: BehavioralNodeType.TRANSACTION,
  rollback: BehavioralNodeType.TRANSACTION,
  save: BehavioralNodeType.TRANSACTION, // SAVE TRANSACTION

  // Errors
  raiserror: BehavioralNodeType.ERROR,
  throw: BehavioralNodeType.ERROR,

  // Variables (calculations)
  set: BehavioralNodeType.CALCULATION,
  declare: BehavioralNodeType.CALCULATION,
};

// Write operation subtypes
const WRITE_SUBTYPES = {
  insert: 'INSERT',
  update: 'UPDATE',
  delete: 'DELETE',
  merge: 'MERGE',
  truncate: 'TRUNCATE',
};

// Transaction subtypes
const TRANSACTION_SUBTYPES = {
  begin: 'BEGIN',
  commit: 'COMMIT',
  rollback: 'ROLLBACK',
  save: 'SAVEPOINT',
};

/**
 * Main mapper class.
 * Converts individual SQL AST nodes to GXE-compatible graph nodes.
 */
class SqlToGxeNodeMapper {
  constructor(options = {}) {
    this.nodeIdPrefix = options.nodeIdPrefix || 'gxe';
    this.includePosition = options.includePosition !== false;
    this.positionSpacing = options.positionSpacing || { x: 250, y: 150 };
  }

  /**
   * Map a single SQL AST node to a GXE node.
   *
   * @param {Object} astNode - SQL AST node
   * @param {Object} context - { nodeIndex, depth, parentId }
   * @returns {Object|null} GXE node or null if not mappable
   */
  mapNode(astNode, context = {}) {
    if (!astNode || !astNode.type) return null;

    const nodeType = astNode.type.toLowerCase();
    const gxeType = SQL_TO_GXE_TYPE[nodeType];

    if (!gxeType) {
      // Unrecognized SQL type — skip with warning
      return null;
    }

    switch (gxeType) {
      case BehavioralNodeType.READ:        return this._mapReadNode(astNode, context);
      case BehavioralNodeType.WRITE:       return this._mapWriteNode(astNode, context);
      case BehavioralNodeType.DECISION:    return this._mapDecisionNode(astNode, context);
      case BehavioralNodeType.CALCULATION: return this._mapCalculationNode(astNode, context);
      case BehavioralNodeType.LOOP:        return this._mapLoopNode(astNode, context);
      case BehavioralNodeType.SUBPROCESS:  return this._mapSubprocessNode(astNode, context);
      case BehavioralNodeType.ERROR:       return this._mapErrorNode(astNode, context);
      case BehavioralNodeType.TRANSACTION: return this._mapTransactionNode(astNode, context);
      default: return null;
    }
  }

  // ════════════════════════════════════════════════════════════
  // SPECIFIC MAPPERS
  // ════════════════════════════════════════════════════════════

  /** SELECT -> READ node */
  _mapReadNode(astNode, context) {
    const tables = this._extractTables(astNode);
    const columns = this._extractColumns(astNode);
    const conditions = this._extractConditions(astNode);
    const variables = this._extractTargetVariables(astNode);

    return {
      id: this._generateId('read'),
      type: BehavioralNodeType.READ,
      data: {
        label: `Read from ${tables.join(', ') || 'query'}`,
        entity: tables[0] || null,
        entities: tables,
        columns,
        filter: conditions,
        outputVariables: variables,
        sqlType: 'SELECT',
        _sql: astNode._sql || null,
      },
      position: this._calculatePosition(context),
      inputs: this._buildInputPorts(this._extractConditionVariables(conditions)),
      outputs: this._buildOutputPorts(variables, columns),
    };
  }

  /** INSERT/UPDATE/DELETE/MERGE -> WRITE node */
  _mapWriteNode(astNode, context) {
    const nodeType = astNode.type.toLowerCase();
    const table = this._extractTargetTable(astNode);
    const columns = this._extractWriteColumns(astNode);
    const conditions = this._extractConditions(astNode);
    const values = this._extractValues(astNode);

    return {
      id: this._generateId('write'),
      type: BehavioralNodeType.WRITE,
      data: {
        label: `${WRITE_SUBTYPES[nodeType]} ${table || 'table'}`,
        entity: table,
        operation: WRITE_SUBTYPES[nodeType],
        columns,
        values,
        filter: conditions,
        sqlType: nodeType.toUpperCase(),
        _sql: astNode._sql || null,
      },
      position: this._calculatePosition(context),
      inputs: this._buildInputPorts([...columns, ...this._extractConditionVariables(conditions)]),
      outputs: [{ id: 'affected', name: 'Affected Rows', type: 'number' }],
    };
  }

  /** IF/CASE -> DECISION node */
  _mapDecisionNode(astNode, context) {
    const nodeType = astNode.type.toLowerCase();
    const condition = this._extractConditionExpression(astNode);
    const branches = this._extractBranches(astNode);

    return {
      id: this._generateId('decision'),
      type: BehavioralNodeType.DECISION,
      data: {
        label: nodeType === 'if' ? 'IF Condition' : 'CASE Switch',
        conditionType: nodeType.toUpperCase(),
        condition,
        expression: this._conditionToString(condition),
        branches: branches.length,
        branchLabels: branches.map(b => b.label),
        _sql: astNode._sql || null,
      },
      position: this._calculatePosition(context),
      inputs: this._buildInputPorts(this._extractConditionVariables(condition)),
      outputs: branches.map((b, i) => ({
        id: b.id || `branch_${i}`,
        name: b.label,
        type: 'flow',
      })),
    };
  }

  /** SET/DECLARE -> CALCULATION node */
  _mapCalculationNode(astNode, context) {
    const nodeType = astNode.type.toLowerCase();
    const variable = this._extractVariableName(astNode);
    const expression = this._extractExpression(astNode);
    const dataType = this._extractDataType(astNode);

    return {
      id: this._generateId('calc'),
      type: BehavioralNodeType.CALCULATION,
      data: {
        label: nodeType === 'declare'
          ? `Declare ${variable}`
          : `Set ${variable}`,
        calculationType: nodeType.toUpperCase(),
        variable,
        expression: this._expressionToString(expression),
        dataType,
        _sql: astNode._sql || null,
      },
      position: this._calculatePosition(context),
      inputs: this._buildInputPorts(this._extractExpressionVariables(expression)),
      outputs: [{ id: variable || 'out', name: variable || 'result', type: dataType || 'any' }],
    };
  }

  /** WHILE/CURSOR -> LOOP node */
  _mapLoopNode(astNode, context) {
    const nodeType = astNode.type.toLowerCase();
    const condition = this._extractConditionExpression(astNode);
    const cursorName = nodeType === 'cursor' ? this._extractCursorName(astNode) : null;

    return {
      id: this._generateId('loop'),
      type: BehavioralNodeType.LOOP,
      data: {
        label: nodeType === 'while' ? 'WHILE Loop' : `CURSOR ${cursorName}`,
        loopType: nodeType.toUpperCase(),
        condition: this._conditionToString(condition),
        cursorName,
        _sql: astNode._sql || null,
      },
      position: this._calculatePosition(context),
      inputs: this._buildInputPorts(this._extractConditionVariables(condition)),
      outputs: [
        { id: 'body', name: 'Loop Body', type: 'flow' },
        { id: 'exit', name: 'Exit', type: 'flow' },
      ],
    };
  }

  /** EXEC/EXECUTE -> SUBPROCESS node */
  _mapSubprocessNode(astNode, context) {
    const procedureName = this._extractProcedureName(astNode);
    const parameters = this._extractProcedureParameters(astNode);

    return {
      id: this._generateId('subprocess'),
      type: BehavioralNodeType.SUBPROCESS,
      data: {
        label: `Call ${procedureName}`,
        procedureName,
        procedureSchema: this._extractProcedureSchema(astNode),
        parameters: parameters.map(p => ({
          name: p.name,
          value: p.value,
          direction: p.direction || 'IN',
        })),
        _sql: astNode._sql || null,
      },
      position: this._calculatePosition(context),
      inputs: parameters
        .filter(p => p.direction !== 'OUT')
        .map(p => ({ id: p.name, name: p.name, type: 'any' })),
      outputs: parameters
        .filter(p => p.direction === 'OUT' || p.direction === 'INOUT')
        .map(p => ({ id: p.name, name: p.name, type: 'any' })),
    };
  }

  /** RAISERROR/THROW -> ERROR node */
  _mapErrorNode(astNode, context) {
    const errorInfo = this._extractErrorInfo(astNode);

    return {
      id: this._generateId('error'),
      type: BehavioralNodeType.ERROR,
      data: {
        label: `Error: ${(errorInfo.message || 'Raise Error').substring(0, 30)}`,
        errorType: astNode.type.toUpperCase(),
        errorCode: errorInfo.code,
        errorMessage: errorInfo.message,
        severity: errorInfo.severity,
        state: errorInfo.state,
        _sql: astNode._sql || null,
      },
      position: this._calculatePosition(context),
      inputs: this._buildInputPorts(errorInfo.variables || []),
      outputs: [],
    };
  }

  /** BEGIN/COMMIT/ROLLBACK -> TRANSACTION node */
  _mapTransactionNode(astNode, context) {
    const nodeType = astNode.type.toLowerCase();
    const transactionName = this._extractTransactionName(astNode);

    return {
      id: this._generateId('txn'),
      type: BehavioralNodeType.TRANSACTION,
      data: {
        label: `${TRANSACTION_SUBTYPES[nodeType] || nodeType.toUpperCase()} Transaction`,
        transactionType: TRANSACTION_SUBTYPES[nodeType] || nodeType.toUpperCase(),
        transactionName,
        _sql: astNode._sql || null,
      },
      position: this._calculatePosition(context),
      inputs: [],
      outputs: [{ id: 'next', name: 'Continue', type: 'flow' }],
    };
  }

  // ════════════════════════════════════════════════════════════
  // FACTORY METHODS — Create special nodes
  // ════════════════════════════════════════════════════════════

  /** Create INPUT node for a procedure parameter */
  createInputNode(param, context = {}) {
    return {
      id: this._generateId('input'),
      type: BehavioralNodeType.INPUT,
      data: {
        label: `Input: ${param.name}`,
        parameterName: param.name,
        dataType: param.dataType,
        defaultValue: param.defaultValue,
        isRequired: !param.hasDefault,
      },
      position: this._calculatePosition(context),
      inputs: [],
      outputs: [{ id: param.name, name: param.name, type: param.dataType || 'any' }],
    };
  }

  /** Create OUTPUT node for procedure return */
  createOutputNode(outputs, context = {}) {
    return {
      id: this._generateId('output'),
      type: BehavioralNodeType.OUTPUT,
      data: {
        label: 'Output',
        outputs: outputs.map(o => ({ name: o.name, dataType: o.dataType })),
      },
      position: this._calculatePosition(context),
      inputs: outputs.map(o => ({ id: o.name, name: o.name, type: o.dataType || 'any' })),
      outputs: [],
    };
  }

  // ════════════════════════════════════════════════════════════
  // EXTRACTION HELPERS
  // ════════════════════════════════════════════════════════════

  _generateId(prefix) {
    return `${this.nodeIdPrefix}_${prefix}_${uuidv4().substring(0, 8)}`;
  }

  _calculatePosition(context) {
    if (!this.includePosition) return undefined;
    const index = context.nodeIndex || 0;
    const depth = context.depth || 0;
    return {
      x: depth * this.positionSpacing.x + 100,
      y: index * this.positionSpacing.y + 100,
    };
  }

  _buildInputPorts(variables) {
    if (!variables || !Array.isArray(variables)) return [];
    return [...new Set(variables)].map(v => ({
      id: typeof v === 'string' ? v : v.name,
      name: typeof v === 'string' ? v : v.name,
      type: typeof v === 'object' ? v.type : 'any',
    }));
  }

  _buildOutputPorts(variables, columns = []) {
    const ports = [];
    if (variables && Array.isArray(variables)) {
      variables.forEach(v => {
        ports.push({
          id: typeof v === 'string' ? v : v.name,
          name: typeof v === 'string' ? v : v.name,
          type: typeof v === 'object' ? v.type : 'any',
        });
      });
    }
    if (ports.length === 0 && columns.length > 0) {
      ports.push({ id: 'result', name: 'Query Result', type: 'recordset' });
    }
    return ports;
  }

  // --- Table extraction ---

  _extractTables(astNode) {
    const tables = [];
    if (astNode.from) this._collectTables(astNode.from, tables);
    return tables;
  }

  _collectTables(from, tables) {
    if (Array.isArray(from)) {
      from.forEach(f => this._collectTables(f, tables));
    } else if (from && typeof from === 'object') {
      if (from.table) tables.push(from.table);
      if (from.expr) this._collectTables(from.expr, tables);
    }
  }

  _extractTargetTable(astNode) {
    if (astNode.table) {
      return Array.isArray(astNode.table) ? astNode.table[0]?.table : astNode.table;
    }
    return null;
  }

  // --- Column extraction ---

  _extractColumns(astNode) {
    if (!astNode.columns) return ['*'];
    if (astNode.columns === '*') return ['*'];
    return astNode.columns.map(col => {
      if (typeof col === 'string') return col;
      if (col.expr && col.expr.column) return col.expr.column;
      if (col.as) return col.as;
      return '*';
    });
  }

  _extractWriteColumns(astNode) {
    if (astNode.columns) {
      return astNode.columns.map(c => typeof c === 'string' ? c : c.column || c);
    }
    if (astNode.set) {
      return astNode.set.map(s => s.column || s);
    }
    return [];
  }

  // --- Condition extraction ---

  _extractConditions(astNode) {
    if (!astNode.where) return null;
    return this._conditionToObject(astNode.where);
  }

  _extractConditionExpression(astNode) {
    return astNode.condition || astNode.test || astNode.expr || null;
  }

  _extractBranches(astNode) {
    const branches = [];
    if (astNode.type?.toLowerCase() === 'if') {
      branches.push({ id: 'true', label: 'True' });
      branches.push({ id: 'false', label: 'False' });
    } else if (astNode.type?.toLowerCase() === 'case') {
      if (astNode.args) {
        astNode.args.forEach((arg, i) => {
          if (arg.type === 'when') {
            branches.push({ id: `when_${i}`, label: `When ${i + 1}` });
          }
        });
      }
      branches.push({ id: 'else', label: 'Else' });
    }
    return branches;
  }

  _conditionToObject(condition) {
    if (!condition) return null;
    return {
      type: condition.type,
      operator: condition.operator,
      left: condition.left,
      right: condition.right,
    };
  }

  _conditionToString(condition) {
    if (!condition) return '';
    if (typeof condition === 'string') return condition;
    if (condition.operator) {
      const left = condition.left?.column || condition.left?.value || '?';
      const right = condition.right?.column || condition.right?.value || '?';
      return `${left} ${condition.operator} ${right}`;
    }
    return JSON.stringify(condition);
  }

  _extractConditionVariables(condition) {
    const variables = [];
    this._collectVariables(condition, variables);
    return [...new Set(variables)];
  }

  _collectVariables(node, variables) {
    if (!node) return;
    if (typeof node === 'string' && node.startsWith('@')) {
      variables.push(node);
    }
    if (node && typeof node === 'object') {
      if (node.column && typeof node.column === 'string' && node.column.startsWith('@')) {
        variables.push(node.column);
      }
      if (node.left) this._collectVariables(node.left, variables);
      if (node.right) this._collectVariables(node.right, variables);
      if (Array.isArray(node.args)) node.args.forEach(a => this._collectVariables(a, variables));
    }
  }

  // --- Variable/Expression extraction ---

  _extractVariableName(astNode) {
    if (astNode.name) return astNode.name;
    if (astNode.left && astNode.left.column) return astNode.left.column;
    return null;
  }

  _extractExpression(astNode) {
    return astNode.value || astNode.right || astNode.expr || null;
  }

  _extractDataType(astNode) {
    return astNode.dataType || astNode.keyword || null;
  }

  _expressionToString(expr) {
    if (!expr) return '';
    if (typeof expr === 'string') return expr;
    if (typeof expr === 'number') return String(expr);
    if (expr.column) return expr.column;
    if (expr.value !== undefined) return String(expr.value);
    return JSON.stringify(expr);
  }

  _extractExpressionVariables(expr) {
    const variables = [];
    this._collectVariables(expr, variables);
    return variables;
  }

  // --- Procedure extraction ---

  _extractProcedureName(astNode) {
    if (astNode.name) {
      return typeof astNode.name === 'string'
        ? astNode.name
        : astNode.name.value || astNode.name.name || 'unknown';
    }
    return 'unknown_procedure';
  }

  _extractProcedureSchema(astNode) {
    if (astNode.schema) return astNode.schema;
    if (astNode.name && typeof astNode.name === 'object') {
      return astNode.name.schema || 'dbo';
    }
    return 'dbo';
  }

  _extractProcedureParameters(astNode) {
    const params = astNode.parameters || astNode.args || [];
    if (!Array.isArray(params)) return [];
    return params.map((p, i) => ({
      name: p.name || p.column || `param_${i}`,
      value: p.value,
      direction: p.output ? 'OUT' : 'IN',
    }));
  }

  // --- Error extraction ---

  _extractErrorInfo(astNode) {
    return {
      code: astNode.number || astNode.errorNumber || null,
      message: astNode.message || astNode.msg_str || null,
      severity: astNode.severity || null,
      state: astNode.state || null,
      variables: this._extractExpressionVariables(astNode.message),
    };
  }

  // --- Other ---

  _extractValues(astNode) {
    if (!astNode.values) return [];
    return astNode.values;
  }

  _extractTargetVariables(astNode) {
    const variables = [];
    if (astNode.into) this._collectVariables(astNode.into, variables);
    return variables;
  }

  _extractCursorName(astNode) {
    return astNode.name || astNode.cursor || 'cursor';
  }

  _extractTransactionName(astNode) {
    return astNode.name || astNode.transactionName || null;
  }
}

module.exports = {
  SqlToGxeNodeMapper,
  BehavioralNodeType,
  SQL_TO_GXE_TYPE,
  WRITE_SUBTYPES,
  TRANSACTION_SUBTYPES,
};
