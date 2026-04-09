const { BaseTool } = require('../primitives/BaseTool');

class KBSearchTool extends BaseTool {
  getDefinition() {
    return {
      id: 'workspace.kb_search',
      name: 'Search Global Knowledge Base (Read-Only)',
      version: '1.0.0',
      level: 1,
      category: 'workspace',
      namespace: 'WORKSPACE',
      description: 'Search Global KB from within WorkSpace (read-only access). Returns lightweight KBReference stubs. All reads are audited.',
      inputSchema: {
        type: 'object',
        required: ['workspaceId', 'query'],
        properties: {
          workspaceId: { type: 'string' },
          query: { type: 'string', description: 'Natural language search query' },
          namespace: { type: 'string', enum: ['core', 'project', 'meta', 'common', 'Codex'], description: 'Filter by KB namespace' },
          type: { type: 'string', description: 'Filter by node type' },
          limit: { type: 'number', default: 10 }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: []
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['workspaceId', 'query']);
    const { createReadOnlyProxy } = require('../../../services/workspace');
    const tei = require('../../../services/tei.service');
    const userId = context?.userId || context?.agentId || 'agent:mcp';

    const embedding = await tei.getEmbedding(args.query);
    const proxy = createReadOnlyProxy(args.workspaceId, userId);
    try {
      const results = await proxy.searchSimilar(embedding, {
        namespace: args.namespace,
        type: args.type,
        limit: Math.min(args.limit || 10, 20),
        threshold: 0.6
      });
      return this.success({ results, count: results.length });
    } finally {
      await proxy.close();
    }
  }
}

module.exports = { KBSearchTool };
