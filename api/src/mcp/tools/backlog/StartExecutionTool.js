const BaseTool = require('../primitives/BaseTool').BaseTool;

class StartExecutionTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.start_execution',
      name: 'Start Task Execution',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Start execution tracking for a BackLog task. Creates an ExecutionRecord to store decisions, file changes, and acceptance criteria. Call before beginning work.',
      inputSchema: {
        type: 'object',
        required: ['backlogId'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog item ID (e.g. BACKLOG-0001)' },
          executedBy: { type: 'string', description: 'ID of agent or user executing the task' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          executionRecord: { type: 'object' },
          message: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['backlogId']);
    const execRecord = require('../../../services/backlog/execution-record.service');
    const executor = args.executedBy || context?.agentId || context?.get?.('agentId') || 'agent:mcp';
    const record = await execRecord.startExecution(args.backlogId, executor);
    return this.success({ message: `Execution started for ${args.backlogId}`, executionRecord: record });
  }
}

module.exports = { StartExecutionTool };
