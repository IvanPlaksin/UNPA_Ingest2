/**
 * SQL AST Parse Executor
 *
 * Parses SQL procedure text into AST using node-sql-parser.
 * Falls back to regex-based extraction on parse failure.
 */

const { BaseExecutor } = require('../../plugin-base');

class SqlAstParseExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'sql.ast_parse';
    this.displayName = 'SQL AST Parse';
    this.description = 'Parse SQL stored procedure to AST';
    this.domain = 'sql-extraction';

    this.parameterSchema = {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'SQL procedure text' },
        procedureName: { type: 'string', description: 'Procedure name' },
        procedureSchema: { type: 'string', default: 'dbo' },
      },
      required: ['sql', 'procedureName'],
    };
  }

  async execute(parameters, context) {
    const sql = this.getRequiredParam(parameters, 'sql');
    const procedureName = this.getRequiredParam(parameters, 'procedureName');
    const procedureSchema = this.getParam(parameters, 'procedureSchema', 'dbo');

    try {
      const { Parser } = require('node-sql-parser');
      const parser = new Parser();

      let ast = null;
      let parseSuccess = false;
      let parseError = null;

      // Attempt AST parse
      try {
        // Strip CREATE PROCEDURE wrapper for body parsing
        const bodyMatch = sql.match(/\bAS\b\s*(BEGIN\b[\s\S]*END\b|[\s\S]+)$/im);
        const body = bodyMatch ? bodyMatch[1] : sql;

        ast = parser.astify(body, { database: 'transactsql' });
        parseSuccess = true;
      } catch (e) {
        parseError = e.message;
      }

      // Extract parameters from procedure definition
      const paramPattern = /@(\w+)\s+(\w+(?:\([^)]*\))?)/gi;
      const params = [];
      let m;
      while ((m = paramPattern.exec(sql)) !== null) {
        params.push({ name: m[1], dataType: m[2] });
      }

      return this.success(
        {
          ast,
          parseSuccess,
          parseError,
          procedureName,
          procedureSchema,
          parameters: params,
          sql,
        },
        { parseSuccess, paramCount: params.length },
        parseSuccess ? 1.0 : 0.5,
      );
    } catch (error) {
      return this.error('SQL_AST_ERROR', `AST parsing failed: ${error.message}`, true);
    }
  }
}

module.exports = { SqlAstParseExecutor };
