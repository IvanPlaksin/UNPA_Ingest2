const { BaseMSSQLTool } = require('./BaseMSSQLTool.js');

class MSSQLConstraintsTool extends BaseMSSQLTool {
  getDefinition() {
    return {
      id: 'data.mssql_get_constraints',
      name: 'MSSQL Get Constraints',
      version: '1.0.0',
      level: 2,
      category: 'data',
      description: 'Get all constraints: PK, FK, UNIQUE, CHECK for a table.',
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
          constraints: { type: 'array' },
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
    const constraints = await conn.getConstraints(args.schemaName, args.tableName);
    return this.success({ constraints, count: constraints.length });
  }
}

module.exports = { MSSQLConstraintsTool };
