const { BaseTool } = require('../primitives/BaseTool');

class ListDraftsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.list_drafts',
      name: 'List Draft Knowledge Objects',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'List draft knowledge objects in a WorkSpace with optional filters.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string' },
          type: { type: 'string', description: 'Filter by draft type (entity, business_rule, etc.)' },
          status: { type: 'string', enum: ['DRAFT', 'VALIDATED', 'READY_TO_PROMOTE', 'PROMOTED', 'REJECTED', 'CONFLICT', 'MERGED'] },
          knowledgeFamily: { type: 'string', enum: ['STRUCTURAL', 'BEHAVIORAL', 'SEMANTIC', 'OPERATIONAL', 'CONTEXTUAL'] },
          sourceId: { type: 'string', description: 'Filter by source reference ID' },
          limit: { type: 'number', default: 50 },
          offset: { type: 'number', default: 0 }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId']);
    const draftService = require('../../../services/workspace/draft.service');
    return this.success(await draftService.list(args.workspaceId, {
      type: args.type,
      status: args.status,
      knowledgeFamily: args.knowledgeFamily,
      sourceId: args.sourceId,
      limit: Math.min(args.limit || 50, 100),
      offset: args.offset || 0
    }));
  }
}

module.exports = { ListDraftsTool };
