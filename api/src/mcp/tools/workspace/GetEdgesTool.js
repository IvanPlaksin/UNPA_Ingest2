const { BaseTool } = require('../primitives/BaseTool');

class GetEdgesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.get_edges',
      name: 'Get Draft Relationships',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Get relationships for a draft knowledge object.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'draftId'],
        properties: {
          workspaceId: { type: 'string' },
          draftId: { type: 'string' },
          direction: { type: 'string', enum: ['in', 'out', 'both'], default: 'both' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'draftId']);
    const draftService = require('../../../services/workspace/draft.service');
    const edges = await draftService.getEdges(args.workspaceId, args.draftId, {
      direction: args.direction || 'both'
    });
    return this.success({ edges, count: edges.length });
  }
}

module.exports = { GetEdgesTool };
