const { BaseTool } = require('../primitives/BaseTool.js');

/**
 * Level 3 Pattern — Full database ingestion pipeline.
 * Composes Level 2 MSSQL tools + graph + vector + AI tools.
 */
class MSSQLIngestTool extends BaseTool {
  getDefinition() {
    return {
      id: 'data.mssql_ingest',
      name: 'MSSQL Database Ingestion',
      version: '1.0.0',
      level: 3,
      category: 'data',
      description: 'Complete database ingestion: connect, analyze structure, semantic analysis, generate ER graph, vectorize.',
      composedOf: [
        'data.mssql_connect',
        'data.mssql_get_schemas',
        'data.mssql_get_tables',
        'data.mssql_get_columns',
        'data.mssql_get_constraints',
        'data.mssql_get_procedures',
        'data.mssql_get_dependencies',
        'data.mssql_sample_data',
        'ai.extract',
        'graph.create_node',
        'graph.create_edge',
        'vector.embed',
        'vector.store',
      ],
      inputSchema: {
        type: 'object',
        required: ['domainId', 'connectionName'],
        properties: {
          domainId: { type: 'string', description: 'Target domain ID' },
          connectionName: { type: 'string', description: 'Saved data source name' },
          schema: { type: 'string', description: 'Optional schema filter' },
          skipLLM: { type: 'boolean', description: 'Skip LLM analysis, use heuristics only' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          success: { type: 'boolean' },
          extractionCycleId: { type: 'string' },
          nodesCreated: { type: 'number' },
          edgesCreated: { type: 'number' },
          tablesAnalyzed: { type: 'number' },
          vectorsStored: { type: 'number' },
          elapsedMs: { type: 'number' },
        },
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['READ', 'WRITE', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 600000, maxMemoryMb: 500, apiCalls: 100 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['domainId', 'connectionName']);

    // Delegate to rabbithole service which orchestrates the full pipeline
    const { ingestFromMSSQL } = require('../../../services/rabbithole.service');

    const result = await ingestFromMSSQL(args, (phase, message, pct) => {
      // Log progress (could be captured by GXE execution context)
      if (phase !== 'error') {
        console.log(`[MCP MSSQL Ingest] ${phase}: ${message} (${pct}%)`);
      }
    });

    if (!result.success) {
      this.error('INGESTION_FAILED', result.error || 'Ingestion pipeline failed');
    }

    return this.success(result);
  }
}

module.exports = { MSSQLIngestTool };
