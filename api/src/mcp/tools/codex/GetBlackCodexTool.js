const { BaseTool } = require('../primitives/BaseTool');
const { executeCodexTool } = require('../../../services/codex/codex-tools');

class GetBlackCodexTool extends BaseTool {
  getDefinition() {
    return {
      id: 'codex.get_blackcodex',
      name: 'Get BlackCodex',
      version: '1.0.0',
      level: 1,
      category: 'meta',
      toolNamespace: 'CODEX',
      description: 'Get BlackCodex entries — anti-patterns, failed approaches, and their resolutions. Use to avoid known mistakes.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: 'Filter anti-patterns by scope tag' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          entries: { type: 'array' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    const result = await executeCodexTool('codex_get_blackcodex', args);
    return this.success(JSON.parse(result));
  }
}

module.exports = { GetBlackCodexTool };
