const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLTablesTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_tables',
      name: 'MSSQL Get Tables',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'List tables and views with column counts and optional row counts.',
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'string', description: 'Filter by schema name' },
          includeViews: { type: 'boolean', description: 'Include views (default true)' },
          includeRowCounts: { type: 'boolean', description: 'Include row counts (default false)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          tables: { type: 'array' },
          count: { type: 'number' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 10000, maxMemoryMb: 20 },
    };
  }

  async execute(args) {
    const conn = await this.requireConnection();
    const tables = await conn.getTables({
      schema: args.schema,
      includeViews: args.includeViews !== false,
      includeRowCounts: args.includeRowCounts === true,
    });
    return this.success({ tables, count: tables.length });
  }
}

module.exports = { MSSQLTablesTool };
