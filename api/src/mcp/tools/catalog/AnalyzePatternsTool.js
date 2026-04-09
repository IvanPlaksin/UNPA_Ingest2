const { BaseTool } = require('../primitives/BaseTool');

class AnalyzePatternsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.analyze_patterns',
      name: 'Analyze Workspace Patterns',
      version: '1.0.0',
      level: 3,
      category: 'catalog',
      namespace: 'CATALOG',
      description: 'Analyze a workspace graph to find subgraph patterns that match existing catalog entries. Returns matched patterns with similarity scores and replacement suggestions.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', description: 'WorkSpace ID (UUID)' },
          threshold: { type: 'number', description: 'Minimum similarity score (0..1, default 0.55)' },
          minNodes: { type: 'number', description: 'Minimum subgraph size (default 2)' },
          maxNodes: { type: 'number', description: 'Maximum subgraph size (default 50)' },
          matchLimit: { type: 'number', description: 'Max matches per subgraph (default 5)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args) {
    this.validateArgs(args, ['workspaceId']);
    const patternMatcher = require('../../../services/catalog/pattern-matcher.service');
    const result = await patternMatcher.analyzeWorkspacePatterns(args.workspaceId, {
      threshold: args.threshold,
      minNodes: args.minNodes,
      maxNodes: args.maxNodes,
      matchLimit: args.matchLimit
    });
    return this.success(result);
  }
}

module.exports = { AnalyzePatternsTool };
