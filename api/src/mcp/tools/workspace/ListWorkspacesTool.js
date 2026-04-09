const { BaseTool } = require('../primitives/BaseTool');

class ListWorkspacesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.list',
      name: 'List WorkSpaces',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'List available WorkSpaces with optional filters by status and domain.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['CREATED', 'PROFILING', 'READY', 'EXTRACTING', 'PAUSED', 'REVIEW', 'PROMOTED', 'ARCHIVED'] },
          domain: { type: 'string', description: 'Filter by domain' },
          limit: { type: 'number', default: 20, description: 'Max results (1-50)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    const ws = require('../../../services/workspace/workspace.service');
    const userId = context?.userId || context?.agentId;
    return this.success(await ws.list({
      userId,
      status: args.status,
      domain: args.domain,
      limit: Math.min(args.limit || 20, 50)
    }));
  }
}

module.exports = { ListWorkspacesTool };
