const { BaseTool } = require('../primitives/BaseTool');

class PreviewReplacementTool extends BaseTool {
  getDefinition() {
    return {
      id: 'catalog.preview_replacement',
      name: 'Preview Pattern Replacement',
      version: '1.0.0',
      level: 3,
      category: 'catalog',
      namespace: 'CATALOG',
      description: 'Preview what would change if a workspace subgraph is replaced with a catalog entry. Dry-run — no mutations.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'subgraphId', 'catalogEntryId'],
        properties: {
          workspaceId: { type: 'string', description: 'WorkSpace ID' },
          subgraphId: { type: 'string', description: 'Subgraph ID (from analyze_patterns)' },
          catalogEntryId: { type: 'string', description: 'Catalog entry ID to replace with' }
        }
      },
      outputSchema: { type: 'object' },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args) {
    this.validateArgs(args, ['workspaceId', 'subgraphId', 'catalogEntryId']);
    const patternMatcher = require('../../../services/catalog/pattern-matcher.service');
    const result = await patternMatcher.previewReplacement(args.workspaceId, args.subgraphId, args.catalogEntryId);
    return this.success(result);
  }
}

module.exports = { PreviewReplacementTool };
