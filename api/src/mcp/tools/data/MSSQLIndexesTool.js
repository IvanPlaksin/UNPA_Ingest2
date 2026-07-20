const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLIndexesTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_indexes',
      name: 'MSSQL Get Indexes',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Get indexes for a table including columns and type.',
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
          indexes: { type: 'array' },
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
    const indexes = await conn.getIndexes(args.schemaName, args.tableName);
    return this.success({ indexes, count: indexes.length });
  }
}

module.exports = { MSSQLIndexesTool };
