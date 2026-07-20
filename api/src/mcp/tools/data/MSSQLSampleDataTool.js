const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLSampleDataTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_sample_data',
      name: 'MSSQL Sample Data',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Sample rows from a table with statistics and distinct values for enum detection.',
      inputSchema: {
        type: 'object',
        required: ['schemaName', 'tableName'],
        properties: {
          schemaName: { type: 'string' },
          tableName: { type: 'string' },
          sampleSize: { type: 'number', description: 'Number of rows to sample (default 50, max 100)' },
          includeDistinctValues: { type: 'boolean', description: 'Include distinct values (default true)' },
          includeStatistics: { type: 'boolean', description: 'Include column statistics (default true)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          sample: { type: 'object' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 100 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['schemaName', 'tableName']);
    const conn = await this.requireConnection();
    const sample = await conn.sampleData(args.schemaName, args.tableName, {
      sampleSize: Math.min(args.sampleSize || 50, 100),
      includeDistinctValues: args.includeDistinctValues !== false,
      includeStatistics: args.includeStatistics !== false,
    });
    return this.success({ sample });
  }
}

module.exports = { MSSQLSampleDataTool };
