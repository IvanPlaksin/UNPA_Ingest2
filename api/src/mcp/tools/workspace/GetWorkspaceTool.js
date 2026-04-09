const { BaseTool } = require('../primitives/BaseTool');

class GetWorkspaceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.get',
      name: 'Get WorkSpace',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Get WorkSpace details including status and statistics.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string', description: 'WorkSpace ID (UUID)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId']);
    const ws = require('../../../services/workspace/workspace.service');
    const workspace = await ws.get(args.workspaceId);
    if (!workspace) this.error('NOT_FOUND', `WorkSpace not found: ${args.workspaceId}`);
    const stats = await ws.getStats(args.workspaceId);
    return this.success({ ...workspace, stats });
  }
}

module.exports = { GetWorkspaceTool };
