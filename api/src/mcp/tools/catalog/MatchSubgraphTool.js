const { BaseTool } = require('../primitives/BaseTool');

class MatchSubgraphTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.match_subgraph',
      name: 'Match Subgraph Against Catalog',
      version: '1.0.0',
      level: 3,
      category: 'catalog',
      namespace: 'CATALOG',
      description: 'Find catalog entries similar to a given subgraph structure. Uses structural + semantic + topology scoring.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'subgraphId'],
        properties: {
          workspaceId: { type: 'string', description: 'WorkSpace ID — needed to re-extract the subgraph from the live graph' },
          subgraphId: { type: 'string', description: 'Subgraph ID (from analyze_patterns result)' },
          threshold: { type: 'number', description: 'Minimum similarity (0..1, default 0.55)' },
          limit: { type: 'number', description: 'Max results (default 5)' }
        }
      },
      outputSchema: { type: 'object' },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args) {
    this.validateArgs(args, ['workspaceId', 'subgraphId']);
    const patternMatcher = require('../../../services/catalog/pattern-matcher.service');

    // Re-extract to find the target subgraph
    const subgraphs = await patternMatcher.extractSubgraphs(args.workspaceId);
    const target = subgraphs.find(sg => sg.id === args.subgraphId);
    if (!target) this.error('NOT_FOUND', `Subgraph ${args.subgraphId} not found`);

    const matches = await patternMatcher.findMatches(target, {
      threshold: args.threshold,
      limit: args.limit
    });
    return this.success({ subgraph: { id: target.id, nodeCount: target.nodes.length, rootNode: target.rootNode }, matches });
  }
}

module.exports = { MatchSubgraphTool };
