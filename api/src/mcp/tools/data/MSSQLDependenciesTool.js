const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLDependenciesTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_dependencies',
      name: 'MSSQL Get Dependencies',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Get object dependencies: which objects reference other objects.',
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'string', description: 'Filter by schema' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          dependencies: { type: 'array' },
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
    const dependencies = await conn.getDependencies(args.schema);
    return this.success({ dependencies, count: dependencies.length });
  }
}

module.exports = { MSSQLDependenciesTool };
