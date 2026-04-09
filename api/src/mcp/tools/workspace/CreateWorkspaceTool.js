const { BaseTool } = require('../primitives/BaseTool');

class CreateWorkspaceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.create',
      name: 'Create WorkSpace',
      version: '1.0.0',
      level: 2,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Create a new isolated WorkSpace for knowledge extraction. WorkSpace is a sandbox that can read Global KB but cannot write to it directly.',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Display name for the workspace (min 3 chars)' },
          description: { type: 'string', description: 'Optional description of workspace purpose' },
          domain: { type: 'string', description: 'Knowledge domain hint: HR, FINANCE, IT, LEGAL, etc.' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          workspaceId: { type: 'string' },
          namespace: { type: 'string' },
          status: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['name']);
    const ws = require('../../../services/workspace/workspace.service');
    const userId = context?.agentId || context?.userId || 'agent:mcp';
    const workspace = await ws.create({
      name: args.name,
      description: args.description || '',
      domain: args.domain || '',
      tags: args.tags || [],
      createdBy: userId
    });
    return this.success({
      workspaceId: workspace.id,
      namespace: workspace.namespace,
      status: workspace.status,
      name: workspace.name
    });
  }
}

module.exports = { CreateWorkspaceTool };
