const BaseTool = require('../primitives/BaseTool').BaseTool;

class FindDecisionTool extends BaseTool {
  getDefinition() {
    return {
      id: 'dialogue.find_decision',
      name: 'Find Architecture Decision',
      version: '1.0.0',
      level: 2,
      category: 'dialogue',
      toolNamespace: 'DIALOGUE',
      description: 'Find architecture decisions (ADRs) about a specific topic. Returns decisions with context, rationale, and alternatives from conversation history.',
      inputSchema: {
        type: 'object',
        required: ['topic'],
        properties: {
          topic: { type: 'string', description: 'Topic or technology to search for (e.g. "RuntimeEngine", "entity resolution")' },
          category: {
            type: 'string',
            enum: ['architecture', 'technology', 'pattern', 'convention', 'rejection'],
            description: 'Filter by decision category',
          },
          limit: { type: 'number', default: 5 },
        },
      },
      outputSchema: { type: 'object', properties: { decisions: { type: 'array' }, count: { type: 'number' } } },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['topic']);
    const searchService = _getSearchService();
    let decisions = await searchService.traceDecisionProvenance(args.topic, (args.limit || 5) * 2);

    if (args.category) {
      decisions = decisions.filter(d => d.category === args.category);
    }
    decisions = decisions.slice(0, args.limit || 5);

    return this.success({ decisions, count: decisions.length });
  }
}

module.exports = { FindDecisionTool };
