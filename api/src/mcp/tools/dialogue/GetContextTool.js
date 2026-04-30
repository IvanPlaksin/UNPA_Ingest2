const BaseTool = require('../primitives/BaseTool').BaseTool;

class GetContextTool extends BaseTool {
  getDefinition() {
    return {
      id: 'dialogue.get_context',
      name: 'Get Dialogue Context',
      version: '1.0.0',
      level: 2,
      category: 'dialogue',
      toolNamespace: 'DIALOGUE',
      description: 'Get a summary of all prior discussions about a topic BEFORE starting new work. Use this to avoid re-discussing already-decided topics and to understand historical context.',
      inputSchema: {
        type: 'object',
        required: ['topic'],
        properties: {
          topic: { type: 'string', description: 'Current work topic or task ID to get prior context for' },
          maxResults: { type: 'number', default: 5 },
        },
      },
      outputSchema: { type: 'object', properties: { context: { type: 'object' } } },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['topic']);
    const searchService = _getSearchService();
    const limit = args.maxResults || 5;

    const [searchResults, decisions] = await Promise.all([
      searchService.search(args.topic, { limit, expandGraph: true }),
      searchService.traceDecisionProvenance(args.topic, limit),
    ]);

    return this.success({
      context: {
        topic: args.topic,
        relevantSessions: searchResults.map(r => ({
          sessionId: r.payload?.sessionId,
          score: Math.round(r.finalScore * 1000) / 1000,
          hasDecisions: (r.context?.decisions?.length || 0) > 0,
        })),
        existingDecisions: decisions.map(d => ({
          title: d.title,
          category: d.category,
          confidence: d.confidence,
          decision: d.decision?.slice(0, 200),
        })),
        summary: decisions.length > 0
          ? `Found ${decisions.length} prior decision(s) about "${args.topic}". Review before proceeding.`
          : `No prior decisions found about "${args.topic}". This may be a new topic.`,
      },
    });
  }
}

module.exports = { GetContextTool };
