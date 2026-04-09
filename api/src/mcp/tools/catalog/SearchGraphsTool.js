const { BaseTool } = require('../primitives/BaseTool.js');

let _catalogService = null;
function getCatalog() {
  if (!_catalogService) {
    _catalogService = require('../../../services/graphCatalog.service.js').graphCatalogService;
  }
  return _catalogService;
}

class SearchGraphsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.search_graphs',
      name: 'Search Graph Catalog',
      version: '1.0.0',
      level: 2,
      category: 'catalog',
      description: 'Search graph catalog by keyword, type, namespace, and tags. Returns compact summaries.',
      inputSchema: {
        type: 'object',
        properties: {
          search:    { type: 'string', description: 'Keyword search in graph name/description' },
          type:      { type: 'string', enum: ['atomic', 'tool', 'business', 'composite', 'template'], description: 'Filter by graph type' },
          namespace: { type: 'string', description: 'Filter by namespace' },
          tags:      { type: 'array', items: { type: 'string' }, description: 'Filter by tags (any match)' },
          rootOnly:  { type: 'boolean', default: false, description: 'Only return root graphs (exclude sub-graphs)' },
          limit:     { type: 'integer', default: 10, description: 'Max results to return' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          graphs: { type: 'array', items: { type: 'object' } },
          total:  { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 20 }
    };
  }

  async execute(args) {
    const { search, type, namespace, tags, rootOnly = false, limit = 10 } = args;

    const catalog = getCatalog();
    const result = await catalog.listGraphs({
      search, type, namespace, tags, rootOnly,
      page: 1, limit: Math.min(limit, 50)
    });

    const graphs = (result.data || []).map(g => {
      let nodeCount = 0, edgeCount = 0;
      try {
        if (g.definition) {
          const nodes = typeof g.definition.nodes === 'string' ? JSON.parse(g.definition.nodes) : g.definition.nodes;
          const edges = typeof g.definition.edges === 'string' ? JSON.parse(g.definition.edges) : g.definition.edges;
          nodeCount = Array.isArray(nodes) ? nodes.length : 0;
          edgeCount = Array.isArray(edges) ? edges.length : 0;
        }
      } catch {}
      return {
        id: g.id,
        name: g.name,
        type: g.type,
        namespace: g.namespace,
        description: (g.description || '').slice(0, 200),
        tags: g.tags || [],
        version: g.version || '1.0.0',
        nodeCount,
        edgeCount,
        parentGraphId: g.parentGraphId || null,
      };
    });

    return this.success({ graphs, total: result.pagination?.total || graphs.length });
  }
}

module.exports = { SearchGraphsTool };
