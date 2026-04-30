const BaseTool = require('../primitives/BaseTool').BaseTool;

class SearchDialogueTool extends BaseTool {
  getDefinition() {
    return {
      id: 'dialogue.search',
      name: 'Search Dialogue History',
      version: '1.0.0',
      level: 2,
      category: 'dialogue',
      toolNamespace: 'DIALOGUE',
      description: 'Search across all development dialogue history (Claude Code + Claude.ai sessions). Returns relevant sessions and segments with semantic matching and graph-expanded context.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Search query in natural language' },
          limit: { type: 'number', default: 10, description: 'Max results to return' },
          filters: {
            type: 'object',
            properties: {
              platform: { type: 'string', enum: ['claude_ai', 'claude_code'] },
              startDate: { type: 'string', description: 'ISO-8601 date filter' },
              endDate: { type: 'string', description: 'ISO-8601 date filter' },
            },
          },
          expandGraph: { type: 'boolean', default: true, description: 'Include decisions/chains context' },
        },
      },
      outputSchema: { type: 'object', properties: { results: { type: 'array' }, count: { type: 'number' } } },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['query']);
    const searchService = _getSearchService();
    const results = await searchService.search(args.query, {
      filters: args.filters,
      limit: args.limit || 10,
      expandGraph: args.expandGraph !== false,
    });

    return this.success({
      results: results.map(r => ({
        sessionId: r.payload?.sessionId,
        nodeType: r.nodeType,
        vectorScore: Math.round(r.score * 1000) / 1000,
        finalScore: Math.round(r.finalScore * 1000) / 1000,
        decisions: r.context?.decisions?.length || 0,
        chains: r.context?.chainedSessions?.length || 0,
      })),
      count: results.length,
    });
  }
}

module.exports = { SearchDialogueTool };
