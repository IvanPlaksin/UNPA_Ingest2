const { BaseTool } = require('../primitives/BaseTool');

class KBGetNodeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.kb_get_node',
      name: 'Get KB Node Reference',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Get a specific KB node as KBReference stub (read-only). Creates a tracked reference in the workspace.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'entityId'],
        properties: {
          workspaceId: { type: 'string' },
          entityId: { type: 'string', description: 'KB node entityId' },
          full: { type: 'boolean', default: false, description: 'If true, returns full node properties (flagged in audit)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'entityId']);
    const { createReadOnlyProxy } = require('../../../services/workspace');
    const userId = context?.userId || context?.agentId || 'agent:mcp';

    const proxy = createReadOnlyProxy(args.workspaceId, userId);
    try {
      const result = args.full
        ? await proxy.getNodeFull(args.entityId)
        : await proxy.getNodeStub(args.entityId);
      if (!result) this.error('NOT_FOUND', `KB node not found: ${args.entityId}`);
      return this.success(result);
    } finally {
      await proxy.close();
    }
  }
}

module.exports = { KBGetNodeTool };
