const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLProceduresTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_procedures',
      name: 'MSSQL Get Procedures',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'List stored procedures and triggers with definitions.',
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'string' },
          includeTriggers: { type: 'boolean', description: 'Include triggers (default true)' },
          includeDefinition: { type: 'boolean', description: 'Include source code (default true)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          procedures: { type: 'array' },
          count: { type: 'number' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 15000, maxMemoryMb: 50 },
    };
  }

  async execute(args) {
    const conn = await this.requireConnection();
    const procedures = await conn.getProcedures({
      schema: args.schema,
      includeTriggers: args.includeTriggers !== false,
      includeDefinition: args.includeDefinition !== false,
    });
    return this.success({ procedures, count: procedures.length });
  }
}

module.exports = { MSSQLProceduresTool };
