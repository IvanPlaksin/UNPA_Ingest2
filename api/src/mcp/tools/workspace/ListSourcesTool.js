const { BaseTool } = require('../primitives/BaseTool');

class ListSourcesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.list_sources',
      name: 'List WorkSpace Sources',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'List all source documents/references in a WorkSpace.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId'],
        properties: {
          workspaceId: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId']);
    const ws = require('../../../services/workspace/workspace.service');
    const sources = await ws.listSources(args.workspaceId);
    return this.success({ sources, count: sources.length });
  }
}

module.exports = { ListSourcesTool };
