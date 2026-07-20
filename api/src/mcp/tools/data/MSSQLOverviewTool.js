const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLOverviewTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_overview',
      name: 'MSSQL Get Overview',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Full database overview: schemas, tables, row counts in one call.',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          connectionInfo: { type: 'object' },
          overview: { type: 'array' },
          totals: { type: 'object' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 15000, maxMemoryMb: 30 },
    };
  }

  async execute() {
    const conn = await this.requireConnection();

    const [schemas, tables, rowCounts] = await Promise.all([
      conn.getSchemas(),
      conn.getTables({ includeViews: true, includeRowCounts: false }),
      conn.getRowCounts(),
    ]);

    const overview = schemas.map(schema => ({
      ...schema,
      tables: tables.filter(t => t.schema_name === schema.schema_name),
      rowCounts: rowCounts.filter(r => r.schema_name === schema.schema_name),
    }));

    return this.success({
      connectionInfo: conn.getConnectionInfo(),
      overview,
      totals: {
        schemas: schemas.length,
        tables: tables.filter(t => t.table_type === 'TABLE').length,
        views: tables.filter(t => t.table_type === 'VIEW').length,
        totalRows: rowCounts.reduce((sum, r) => sum + (r.row_count || 0), 0),
      },
    });
  }
}

module.exports = { MSSQLOverviewTool };
