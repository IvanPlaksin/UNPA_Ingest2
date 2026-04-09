const { BaseTool } = require('../primitives/BaseTool.js');

let _catalogService = null;
function getCatalog() {
  if (!_catalogService) {
    _catalogService = require('../../../services/graphCatalog.service.js').graphCatalogService;
  }
  return _catalogService;
}

class GetGraphTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.get_graph',
      name: 'Get Graph from Catalog',
      version: '1.0.0',
      level: 2,
      category: 'catalog',
      description: 'Retrieve full graph definition (nodes, edges, metadata) by catalog ID.',
      inputSchema: {
        type: 'object',
        required: ['graphId'],
        properties: {
          graphId:          { type: 'string', description: 'Graph catalog ID (UUID)' },
          includeSubGraphs: { type: 'boolean', default: false, description: 'Include linked sub-graphs' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          graph: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 30 }
    };
  }

  async execute(args) {
    this.validateArgs(args, ['graphId']);
    const { graphId, includeSubGraphs = false } = args;

    const catalog = getCatalog();
    const graph = await catalog.getGraphById(graphId, includeSubGraphs);

    if (!graph) {
      return this.error('NOT_FOUND', `Graph with ID "${graphId}" not found in catalog`);
    }

    // Parse JSON-serialized definition fields
    if (graph.definition) {
      try {
        if (typeof graph.definition.nodes === 'string') graph.definition.nodes = JSON.parse(graph.definition.nodes);
        if (typeof graph.definition.edges === 'string') graph.definition.edges = JSON.parse(graph.definition.edges);
        if (typeof graph.definition.requiredParams === 'string') graph.definition.requiredParams = JSON.parse(graph.definition.requiredParams);
      } catch {}
    }

    return this.success({ graph });
  }
}

module.exports = { GetGraphTool };
