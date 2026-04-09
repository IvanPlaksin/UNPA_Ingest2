const { BaseTool } = require('../primitives/BaseTool');
const { executeCodexTool } = require('../../../services/codex/codex-tools');

class ProposeChangeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'codex.propose_change',
      name: 'Propose Codex Change',
      version: '1.0.0',
      level: 3,
      category: 'meta',
      toolNamespace: 'CODEX',
      description: 'Propose a new rule or change to existing Codex rule. Creates a CodexProposal for human review.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Proposal title' },
          description: { type: 'string', description: 'Detailed description and rationale' },
          change_type: { type: 'string', enum: ['NEW_RULE', 'MODIFY_RULE', 'DEPRECATE_RULE', 'NEW_PATTERN', 'NEW_ANTIPATTERN'] },
          target_rule_id: { type: 'string', description: 'Target rule ID for modifications (optional)' }
        },
        required: ['title', 'description', 'change_type']
      },
      outputSchema: {
        type: 'object',
        properties: {
          proposalId: { type: 'string' },
          status: { type: 'string' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE']
    };
  }

  async execute(args) {
    const result = await executeCodexTool('codex_propose_change', args);
    return this.success(JSON.parse(result));
  }
}

module.exports = { ProposeChangeTool };
