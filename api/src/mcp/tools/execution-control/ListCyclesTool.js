const { BaseTool } = require('../primitives/BaseTool');

class ListCyclesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'cycle.list',
      name: 'List Execution Cycles',
      version: '1.0.0',
      level: 1,
      category: 'execution-control',
      description: 'List all execution cycles (iterations) for a BackLog task. Shows iteration number, mode, phase, memory count, plan status, and review verdict.',
      inputSchema: {
        type: 'object',
        required: ['backlogId'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog task ID (e.g., BACKLOG-0001)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['backlogId']);
    const cycleService = require('../../../services/backlog/execution-cycle.service');
    const cycles = await cycleService.getCycles(args.backlogId);
    return this.success(cycles);
  }
}

module.exports = { ListCyclesTool };
