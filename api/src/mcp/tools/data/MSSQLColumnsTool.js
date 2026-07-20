const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLColumnsTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_columns',
      name: 'MSSQL Get Columns',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Get detailed column info: types, nullability, defaults, PK/FK markers.',
      inputSchema: {
        type: 'object',
        required: ['schemaName', 'tableName'],
        properties: {
          schemaName: { type: 'string' },
          tableName: { type: 'string' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          columns: { type: 'array' },
          count: { type: 'number' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 10 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['schemaName', 'tableName']);
    const conn = await this.requireConnection();
    const columns = await conn.getColumns(args.schemaName, args.tableName);
    return this.success({ columns, count: columns.length });
  }
}

module.exports = { MSSQLColumnsTool };
