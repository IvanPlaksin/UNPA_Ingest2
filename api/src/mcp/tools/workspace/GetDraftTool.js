const { BaseTool } = require('../primitives/BaseTool');

class GetDraftTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.get_draft',
      name: 'Get Draft Knowledge Object',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Get a specific draft knowledge object by ID.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'draftId'],
        properties: {
          workspaceId: { type: 'string' },
          draftId: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'draftId']);
    const draftService = require('../../../services/workspace/draft.service');
    const draft = await draftService.get(args.workspaceId, args.draftId);
    if (!draft) this.error('NOT_FOUND', `Draft not found: ${args.draftId}`);
    return this.success(draft);
  }
}

module.exports = { GetDraftTool };
