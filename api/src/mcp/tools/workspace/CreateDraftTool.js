const { BaseTool } = require('../primitives/BaseTool');

const VALID_TYPES = [
  'entity', 'relationship', 'business_rule', 'schema', 'workflow',
  'calculation', 'concept', 'policy', 'decision', 'requirement',
  'anomaly', 'api_contract'
];

class CreateDraftTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.create_draft',
      name: 'Create Draft Knowledge Object',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: `Create a draft knowledge object in WorkSpace. Types: ${VALID_TYPES.join(', ')}. Drafts are isolated and require promotion to enter Global KB.`,
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'type', 'name', 'content'],
        properties: {
          workspaceId: { type: 'string' },
          type: { type: 'string', enum: VALID_TYPES, description: 'Knowledge object type' },
          name: { type: 'string', description: 'Display name (min 1 char)' },
          description: { type: 'string', description: 'Optional description' },
          content: { type: 'object', description: 'Type-specific structured content (e.g., {condition, action} for business_rule)' },
          sourceId: { type: 'string', description: 'SourceReference ID this was extracted from' },
          confidence: { type: 'number', description: 'Extraction confidence 0-1 (default 0.8)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'type', 'name', 'content']);
    if (!VALID_TYPES.includes(args.type)) {
      this.error('INVALID_TYPE', `Invalid draft type: ${args.type}. Valid: ${VALID_TYPES.join(', ')}`);
    }
    const draftService = require('../../../services/workspace/draft.service');
    const agentId = context?.agentId || context?.userId || 'agent:mcp';
    const draft = await draftService.create(args.workspaceId, {
      type: args.type,
      name: args.name,
      description: args.description || '',
      content: args.content,
      sourceId: args.sourceId,
      confidence: args.confidence || 0.8,
      extractedBy: agentId
    });
    return this.success({
      draftId: draft.id,
      type: draft.type,
      name: draft.name,
      status: draft.status,
      contentHash: draft.contentHash
    });
  }
}

module.exports = { CreateDraftTool };
