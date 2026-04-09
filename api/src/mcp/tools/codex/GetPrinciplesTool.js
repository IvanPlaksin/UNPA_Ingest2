const { BaseTool } = require('../primitives/BaseTool');
const { executeCodexTool } = require('../../../services/codex/codex-tools');

class GetPrinciplesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'codex.get_principles',
      name: 'Get Codex Principles',
      version: '1.0.0',
      level: 1,
      category: 'meta',
      toolNamespace: 'CODEX',
      description: 'Get all 7 immutable Codex principles (M3 level). Use to ground decisions in fundamental principles.',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          principles: { type: 'array' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    const result = await executeCodexTool('codex_get_principles', args);
    return this.success(JSON.parse(result));
  }
}

module.exports = { GetPrinciplesTool };
