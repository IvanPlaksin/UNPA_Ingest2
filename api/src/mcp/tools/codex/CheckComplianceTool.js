const { BaseTool } = require('../primitives/BaseTool');
const { executeCodexTool } = require('../../../services/codex/codex-tools');

class CheckComplianceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'codex.check_compliance',
      name: 'Check Codex Compliance',
      version: '1.0.0',
      level: 2,
      category: 'meta',
      toolNamespace: 'CODEX',
      description: 'Check if a graph or operation complies with Codex rules. Returns violations and suggestions.',
      inputSchema: {
        type: 'object',
        properties: {
          scope: { type: 'string', description: 'Scope to check: flowdesk, gxe, etc.', default: 'gxe' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          compliant: { type: 'boolean' },
          violations: { type: 'array' },
          suggestions: { type: 'array' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    const result = await executeCodexTool('codex_check_compliance', args);
    return this.success(JSON.parse(result));
  }
}

module.exports = { CheckComplianceTool };
