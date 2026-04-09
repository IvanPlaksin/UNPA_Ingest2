const { BaseTool } = require('../primitives/BaseTool');

class UpdateDraftTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.update_draft',
      name: 'Update Draft Knowledge Object',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Update draft content, status, or metadata. Status changes follow FSM rules.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'draftId'],
        properties: {
          workspaceId: { type: 'string' },
          draftId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          content: { type: 'object', description: 'Updated structured content' },
          confidence: { type: 'number', description: '0-1 confidence score' },
          status: { type: 'string', enum: ['DRAFT', 'VALIDATED', 'READY_TO_PROMOTE', 'REJECTED'], description: 'New status (must be valid transition)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'draftId']);
    const draftService = require('../../../services/workspace/draft.service');
    const updates = {};
    for (const key of ['name', 'description', 'content', 'confidence', 'status']) {
      if (args[key] !== undefined) updates[key] = args[key];
    }
    const draft = await draftService.update(args.workspaceId, args.draftId, updates);
    return this.success({ draftId: draft.id, status: draft.status, contentHash: draft.contentHash });
  }
}

module.exports = { UpdateDraftTool };
