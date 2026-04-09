const { BaseTool } = require('../primitives/BaseTool');

class SearchDraftsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.search_drafts',
      name: 'Search Draft Knowledge Objects',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Semantic search within workspace draft knowledge objects using natural language query.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'query'],
        properties: {
          workspaceId: { type: 'string' },
          query: { type: 'string', description: 'Natural language search query' },
          type: { type: 'string', description: 'Filter by draft type' },
          limit: { type: 'number', default: 10, description: 'Max results (1-20)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'query']);
    const draftService = require('../../../services/workspace/draft.service');
    const results = await draftService.searchByText(args.workspaceId, args.query, {
      type: args.type,
      limit: Math.min(args.limit || 10, 20)
    });
    return this.success({ results, count: results.length });
  }
}

module.exports = { SearchDraftsTool };
