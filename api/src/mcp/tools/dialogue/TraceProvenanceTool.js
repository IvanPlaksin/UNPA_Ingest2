const BaseTool = require('../primitives/BaseTool').BaseTool;

class TraceProvenanceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'dialogue.trace_provenance',
      name: 'Trace Decision Provenance',
      version: '1.0.0',
      level: 2,
      category: 'dialogue',
      toolNamespace: 'DIALOGUE',
      description: 'Trace the full conversation chain that led to a decision. Shows which session and segment the decision was made in, with linked Codex rules.',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'Decision topic or ID to trace (e.g. "MERGE vs CREATE", "authentication approach")' },
          limit: { type: 'number', default: 5 },
        },
      },
      outputSchema: { type: 'object', properties: { provenance: { type: 'array' }, count: { type: 'number' } } },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
    };
  }

  async execute(args) {
    this.validateArgs(args, ['query']);
    const searchService = _getSearchService();
    const results = await searchService.traceDecisionProvenance(args.query, args.limit || 5);

    return this.success({
      provenance: results.map(d => ({
        decisionId: d.decisionId,
        title: d.title,
        decision: d.decision,
        rationale: d.rationale,
        category: d.category,
        confidence: d.confidence,
        status: d.status,
        sessionId: d.provenance?.sessionId,
        sessionTitle: d.provenance?.sessionTitle,
        codexRules: d.codexRules,
      })),
      count: results.length,
    });
  }
}

module.exports = { TraceProvenanceTool };
