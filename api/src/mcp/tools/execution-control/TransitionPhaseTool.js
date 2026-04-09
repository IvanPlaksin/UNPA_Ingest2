const { BaseTool } = require('../primitives/BaseTool');

class TransitionPhaseTool extends BaseTool {
  getDefinition() {
    return {
      id: 'cycle.transition',
      name: 'Transition Cycle Phase',
      version: '1.0.0',
      level: 2,
      category: 'execution-control',
      description: 'Transition the execution cycle to the next phase. Valid transitions depend on mode (AUTONOMOUS/PLANNING) and current phase.',
      inputSchema: {
        type: 'object',
        required: ['cycleId', 'phase'],
        properties: {
          cycleId: { type: 'string', description: 'Execution cycle ID' },
          phase: { type: 'string', enum: ['PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'REVIEW', 'AWAITING_RETURN', 'COMPLETED'], description: 'Target phase' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['cycleId', 'phase']);
    const cycleService = require('../../../services/backlog/execution-cycle.service');
    const result = await cycleService.transitionPhase(args.cycleId, args.phase);
    return this.success(result);
  }
}

module.exports = { TransitionPhaseTool };
