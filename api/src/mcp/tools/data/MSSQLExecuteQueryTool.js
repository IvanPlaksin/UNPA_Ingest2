const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLExecuteQueryTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_execute_query',
      name: 'MSSQL Execute Query',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Execute a read-only SELECT query. DML/DDL are blocked. Max 1000 rows.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'SELECT query to execute' },
          maxRows: { type: 'number', description: 'Max rows to return (default 1000)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          columns: { type: 'array' },
          rows: { type: 'array' },
          rowCount: { type: 'number' },
          truncated: { type: 'boolean' },
        },
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['READ', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 200 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['query']);
    const conn = await this.requireConnection();
    const result = await conn.executeReadOnlyQuery(args.query, args.maxRows);
    return this.success(result);
  }
}

module.exports = { MSSQLExecuteQueryTool };
