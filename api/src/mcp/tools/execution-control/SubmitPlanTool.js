const { BaseTool } = require('../primitives/BaseTool');

class SubmitPlanTool extends BaseTool {
  getDefinition() {
    return {
      id: 'cycle.submit_plan',
      name: 'Submit Execution Plan',
      version: '1.0.0',
      level: 2,
      category: 'execution-control',
      description: 'Submit an execution plan for the current cycle. Plan is MANDATORY in both modes. In AUTONOMOUS mode plan is auto-approved. In PLANNING mode it awaits user approval.',
      inputSchema: {
        type: 'object',
        required: ['cycleId', 'steps'],
        properties: {
          cycleId: { type: 'string', description: 'Execution cycle ID' },
          steps: { type: 'array', items: { type: 'object', properties: { order: { type: 'number' }, description: { type: 'string' }, estimatedEffort: { type: 'string' } } }, description: 'Plan steps (min 1)' },
          rationale: { type: 'string', description: 'Why this approach was chosen' },
          estimatedEffort: { type: 'string', description: 'Overall effort estimate' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['cycleId', 'steps']);
    const planService = require('../../../services/backlog/plan.service');
    const plan = await planService.submitPlan(args.cycleId, args);
    return this.success(plan);
  }
}

module.exports = { SubmitPlanTool };
