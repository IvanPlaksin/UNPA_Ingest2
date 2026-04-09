const BaseTool = require('../primitives/BaseTool').BaseTool;

class GetTaskTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.get_task',
      name: 'Get BackLog Task',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Get a specific BackLog task by its backlogId (e.g. BACKLOG-0001). Returns full details including related Codex rules and dependencies.',
      inputSchema: {
        type: 'object',
        required: ['backlogId'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog item ID (e.g. BACKLOG-0001)' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          item: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    this.validateArgs(args, ['backlogId']);
    const backlogService = require('../../../services/backlog/backlog.service');
    const item = await backlogService.getById(args.backlogId);
    if (!item) this.error('NOT_FOUND', `BackLog item not found: ${args.backlogId}`);
    return this.success({ item });
  }
}

module.exports = { GetTaskTool };
