const { BaseTool } = require('../primitives/BaseTool');

class KBGetNeighborsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.kb_get_neighbors',
      name: 'Get KB Node Neighbors',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Get neighboring nodes of a KB node (1-hop graph traversal, read-only). Creates KBReferences for discovered neighbors.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'entityId'],
        properties: {
          workspaceId: { type: 'string' },
          entityId: { type: 'string', description: 'KB node entityId to traverse from' },
          direction: { type: 'string', enum: ['in', 'out', 'both'], default: 'both' },
          limit: { type: 'number', default: 20 }
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
      const neighbors = await proxy.getNeighbors(args.entityId, {
        direction: args.direction || 'both',
        limit: Math.min(args.limit || 20, 50)
      });
      return this.success({ neighbors, count: neighbors.length });
    } finally {
      await proxy.close();
    }
  }
}

module.exports = { KBGetNeighborsTool };
