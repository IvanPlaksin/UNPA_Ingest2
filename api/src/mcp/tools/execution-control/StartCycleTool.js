const { BaseTool } = require('../primitives/BaseTool');

class StartCycleTool extends BaseTool {
  getDefinition() {
    return {
      id: 'cycle.start',
      name: 'Start Execution Cycle',
      version: '1.0.0',
      level: 2,
      category: 'execution-control',
      description: 'Start a new execution cycle for a BackLog task. AUTONOMOUS mode auto-approves plans and auto-returns on rejection. PLANNING mode requires user approval at each gate.',
      inputSchema: {
        type: 'object',
        required: ['backlogId'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog task ID (e.g., BACKLOG-0001)' },
          mode: { type: 'string', enum: ['AUTONOMOUS', 'PLANNING'], default: 'PLANNING', description: 'Execution mode' }
        }
      },
      outputSchema: { type: 'object', properties: { id: { type: 'string' }, iteration: { type: 'number' }, phase: { type: 'string' } } },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['backlogId']);
    const cycleService = require('../../../services/backlog/execution-cycle.service');
    const agentId = context?.agentId || 'agent:mcp';
    const cycle = await cycleService.startCycle(args.backlogId, { mode: args.mode || 'PLANNING', executedBy: agentId });
    return this.success(cycle);
  }
}

module.exports = { StartCycleTool };
