const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLRowCountsTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_row_counts',
      name: 'MSSQL Get Row Counts',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Quick row counts and space usage for all tables via sys.partitions.',
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'string', description: 'Filter by schema' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          rowCounts: { type: 'array' },
          count: { type: 'number' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 10 },
    };
  }

  async execute(args) {
    const conn = await this.requireConnection();
    const rowCounts = await conn.getRowCounts(args.schema);
    return this.success({ rowCounts, count: rowCounts.length });
  }
}

module.exports = { MSSQLRowCountsTool };
