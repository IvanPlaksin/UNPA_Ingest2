const { BaseTool } = require('../primitives/BaseTool');

class GetCycleDetailTool extends BaseTool {
  getDefinition() {
    return {
      id: 'cycle.get_detail',
      name: 'Get Cycle Detail',
      version: '1.0.0',
      level: 1,
      category: 'execution-control',
      description: 'Get full execution cycle detail including agent memory entries, plan, and review. Use this to understand the current state and history of a cycle.',
      inputSchema: {
        type: 'object',
        required: ['cycleId'],
        properties: {
          cycleId: { type: 'string', description: 'Execution cycle ID' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['cycleId']);
    const cycleService = require('../../../services/backlog/execution-cycle.service');
    const detail = await cycleService.getFullCycleDetail(args.cycleId);
    return this.success(detail);
  }
}

module.exports = { GetCycleDetailTool };
