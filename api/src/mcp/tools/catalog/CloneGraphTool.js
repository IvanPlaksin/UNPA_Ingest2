const { BaseTool } = require('../primitives/BaseTool.js');

let _catalogService = null;
function getCatalog() {
  if (!_catalogService) {
    _catalogService = require('../../../services/graphCatalog.service.js').graphCatalogService;
  }
  return _catalogService;
}

class CloneGraphTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.clone_graph',
      name: 'Clone Graph from Catalog',
      version: '1.0.0',
      level: 3,
      category: 'catalog',
      description: 'Clone an existing catalog graph with optional overrides (name, namespace, tags, type).',
      inputSchema: {
        type: 'object',
        required: ['sourceGraphId'],
        properties: {
          sourceGraphId: { type: 'string', description: 'ID of the graph to clone' },
          name:          { type: 'string', description: 'New name (defaults to "Copy of {original}")' },
          description:   { type: 'string', description: 'New description' },
          namespace:     { type: 'string', description: 'Target namespace' },
          tags:          { type: 'array', items: { type: 'string' }, description: 'Tags override' },
          type:          { type: 'string', enum: ['atomic', 'tool', 'business', 'composite', 'template'] }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          graph: { type: 'object' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 10000, maxMemoryMb: 30 }
    };
  }

  async execute(args) {
    this.validateArgs(args, ['sourceGraphId']);
    const { sourceGraphId, ...overrides } = args;

    const catalog = getCatalog();
    const cloned = await catalog.cloneGraph(sourceGraphId, overrides);

    if (!cloned) {
      return this.error('CLONE_FAILED', `Failed to clone graph "${sourceGraphId}". Source may not exist.`);
    }

    return this.success({
      graph: {
        id: cloned.id,
        name: cloned.name,
        type: cloned.type,
        namespace: cloned.namespace,
        version: cloned.version,
        sourceGraphId,
      }
    });
  }
}

module.exports = { CloneGraphTool };
