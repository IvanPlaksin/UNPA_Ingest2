const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLSchemasTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_schemas',
      name: 'MSSQL Get Schemas',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'List all user schemas with table/view/procedure counts. Excludes system schemas.',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          schemas: { type: 'array' },
          count: { type: 'number' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 10 },
    };
  }

  async execute() {
    const conn = await this.requireConnection();
    const schemas = await conn.getSchemas();
    return this.success({ schemas, count: schemas.length });
  }
}

module.exports = { MSSQLSchemasTool };
