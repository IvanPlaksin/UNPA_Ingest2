const { BaseTool } = require('../primitives/BaseTool.js');

/**
 * Level 3 Pattern — Transform semantic analysis into ER graph.
 */
class MSSQLERExtractionTool extends BaseTool {
  getDefinition() {
    return {
      id: 'data.mssql_er_extraction',
      name: 'MSSQL ER Extraction',
      version: '1.0.0',
      level: 3,
      category: 'data',
      description: 'Transform semantic analysis results into versioned ER graph in knowledge base.',
      composedOf: [
        'graph.create_node',
        'graph.create_edge',
        'vector.embed',
        'vector.store',
      ],
      inputSchema: {
        type: 'object',
        required: ['analysisResult'],
        properties: {
          analysisResult: { type: 'object', description: 'Output from MSSQLSemanticAnalyzer.analyzeDatabase()' },
          containerLabel: { type: 'string', description: 'Graph container label' },
          qdrantCollection: { type: 'string', description: 'Qdrant collection name' },
        },
      },
      outputSchema: {
        type: 'object',
        properties: {
          extractionCycleId: { type: 'string' },
          nodesCreated: { type: 'number' },
          edgesCreated: { type: 'number' },
          vectorsStored: { type: 'number' },
        },
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 300000, maxMemoryMb: 200 },
    };
  }

  async execute(args) {
    this.validateArgs(args, ['analysisResult']);

    const { MSSQLGraphGenerator } = require('../../../services/connectors');
    const memgraphService = require('../../../services/memgraph.service');
    const qdrantService = require('../../../services/qdrant.service');

    const generator = new MSSQLGraphGenerator(memgraphService, qdrantService);
    const result = await generator.generateERGraph(args.analysisResult, {
      containerLabel: args.containerLabel || 'CoreKnowledge',
      qdrantCollection: args.qdrantCollection || 'default',
    });

    return this.success(result);
  }
}

module.exports = { MSSQLERExtractionTool };
