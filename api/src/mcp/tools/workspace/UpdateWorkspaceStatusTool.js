const { BaseTool } = require('../primitives/BaseTool');

class UpdateWorkspaceStatusTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.update_status',
      name: 'Update WorkSpace Status',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Update WorkSpace lifecycle status. Follows state machine rules: CREATED→PROFILING→READY→EXTRACTING→REVIEW→PROMOTED→ARCHIVED',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'status'],
        properties: {
          workspaceId: { type: 'string' },
          status: { type: 'string', enum: ['PROFILING', 'READY', 'EXTRACTING', 'PAUSED', 'REVIEW', 'PROMOTED', 'ARCHIVED'] },
          reason: { type: 'string', description: 'Reason for status change' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'status']);
    const ws = require('../../../services/workspace/workspace.service');
    const updated = await ws.updateStatus(args.workspaceId, args.status, args.reason || '');
    return this.success({ workspaceId: updated.id, status: updated.status });
  }
}

module.exports = { UpdateWorkspaceStatusTool };
