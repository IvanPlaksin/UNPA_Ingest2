const BaseTool = require('../primitives/BaseTool').BaseTool;

class AddDecisionTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.add_decision',
      name: 'Record Execution Decision',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Record a decision made during task execution. MUST include rationale explaining WHY this decision was made. Can document alternatives considered.',
      inputSchema: {
        type: 'object',
        required: ['backlogId', 'decision', 'rationale'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog item ID (e.g. BACKLOG-0001)' },
          decision: { type: 'string', description: 'What was decided (clear, specific statement)' },
          rationale: { type: 'string', description: 'WHY this decision was made (min 10 chars)' },
          confidenceLevel: {
            type: 'string',
            enum: ['HIGH', 'MEDIUM', 'LOW'],
            description: 'Confidence in this decision (default: MEDIUM)'
          },
          alternativesConsidered: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                option: { type: 'string', description: 'Alternative option considered' },
                pros: { type: 'array', items: { type: 'string' } },
                cons: { type: 'array', items: { type: 'string' } },
                rejectionReason: { type: 'string', description: 'Why this was not chosen' }
              }
            },
            description: 'Other options considered but rejected'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          decisionLog: { type: 'object' },
          message: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['backlogId', 'decision', 'rationale']);
    const { backlogId, decision, rationale, confidenceLevel, alternativesConsidered } = args;

    if (!rationale || rationale.length < 10) {
      return this.error('VALIDATION', 'rationale must be at least 10 characters');
    }

    const execRecord = require('../../../services/backlog/execution-record.service');
    const decidedBy = context?.agentId || context?.get?.('agentId') || 'agent:mcp';

    const decisionLog = await execRecord.addDecision(backlogId, {
      decision,
      rationale,
      confidenceLevel: confidenceLevel || 'MEDIUM',
      alternativesConsidered: alternativesConsidered || [],
      decidedBy
    });

    return this.success({ message: `Decision recorded for ${backlogId}`, decisionLog });
  }
}

module.exports = { AddDecisionTool };
