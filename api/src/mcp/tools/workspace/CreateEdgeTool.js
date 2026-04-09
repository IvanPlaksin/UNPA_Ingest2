const { BaseTool } = require('../primitives/BaseTool');

class CreateEdgeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.create_edge',
      name: 'Create Draft Relationship',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Create a relationship between draft knowledge objects or between a draft and a KBReference.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'sourceId', 'targetId', 'edgeType'],
        properties: {
          workspaceId: { type: 'string' },
          sourceId: { type: 'string', description: 'Source DraftNode ID' },
          targetId: { type: 'string', description: 'Target DraftNode or KBReference ID' },
          edgeType: { type: 'string', description: 'Relationship type: RELATES_TO, DEPENDS_ON, GOVERNS, IMPLEMENTS, DERIVED_FROM, CONFLICTS_WITH, etc.' },
          confidence: { type: 'number', default: 0.8, description: '0-1 confidence score' },
          properties: { type: 'object', description: 'Additional edge properties' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'sourceId', 'targetId', 'edgeType']);
    const draftService = require('../../../services/workspace/draft.service');
    const edge = await draftService.createEdge(args.workspaceId, {
      sourceId: args.sourceId,
      targetId: args.targetId,
      edgeType: args.edgeType,
      confidence: args.confidence || 0.8,
      properties: args.properties || {}
    });
    return this.success(edge);
  }
}

module.exports = { CreateEdgeTool };
