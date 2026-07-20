const { BaseTool } = require('../primitives/BaseTool.js');

/**
 * Level 3 Pattern — Deep analysis of stored procedures and triggers.
 */
class MSSQLBusinessLogicTool extends BaseTool {
  getDefinition() {
    return {
      id: 'data.mssql_business_logic',
      name: 'MSSQL Business Logic Discovery',
      version: '1.0.0',
      level: 3,
      category: 'data',
      description: 'Deep analysis of stored procedures and triggers to extract business rules.',
      composedOf: [
        'data.mssql_get_procedures',
        'data.mssql_get_dependencies',
        'ai.extract',
        'graph.create_node',
        'graph.create_edge',
      ],
      inputSchema: {
        type: 'object',
        properties: {
          schema: { type: 'string', description: 'Filter by schema' },
          includeTriggers: { type: 'boolean', description: 'Include triggers (default true)' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          procedures: { type: 'array' },
          businessRules: { type: 'array' },
          count: { type: 'number' },
        },
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 120000, maxMemoryMb: 100, apiCalls: 50 },
    };
  }

  async execute(args) {
    const { MSSQLSemanticAnalyzer } = require('../../../services/connectors');
    const { getConnector } = require('./BaseMSSQLTool.js');

    const conn = getConnector();
    const connected = await conn.isConnected();
    if (!connected) {
      this.error('NOT_CONNECTED', 'Not connected to MS SQL Server. Use data.mssql_connect first.');
    }

    const analyzer = new MSSQLSemanticAnalyzer();
    const procedures = await conn.getProcedures({
      schema: args.schema,
      includeTriggers: args.includeTriggers !== false,
      includeDefinition: true,
    });

    // Analyze each procedure
    const analyzed = [];
    for (const proc of procedures) {
      try {
        const analysis = await analyzer.analyzeProcedure(proc);
        analyzed.push({ ...proc, analysis });
      } catch (err) {
        analyzed.push({ ...proc, analysis: null, error: err.message });
      }
    }

    return this.success({
      procedures: analyzed,
      businessRules: analyzed
        .filter(p => p.analysis?.businessRules?.length > 0)
        .flatMap(p => p.analysis.businessRules),
      count: analyzed.length,
    });
  }
}

module.exports = { MSSQLBusinessLogicTool };
