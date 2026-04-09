const { BaseTool } = require('../primitives/BaseTool');
const { executeCodexTool } = require('../../../services/codex/codex-tools');

class GetRuleTool extends BaseTool {
  getDefinition() {
    return {
      id: 'codex.get_rule',
      name: 'Get Codex Rule',
      version: '1.0.0',
      level: 1,
      category: 'meta',
      toolNamespace: 'CODEX',
      description: 'Get a specific Codex rule by ID (e.g., CODEX-RULE-032). Returns full details with rationale, examples, and anti-patterns.',
      inputSchema: {
        type: 'object',
        properties: {
          rule_id: { type: 'string', description: 'Codex rule ID (e.g., CODEX-RULE-032)' }
        },
        required: ['rule_id']
      },
      outputSchema: {
        type: 'object',
        properties: {
          rule: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    const result = await executeCodexTool('codex_get_rule', args);
    return this.success(JSON.parse(result));
  }
}

module.exports = { GetRuleTool };
