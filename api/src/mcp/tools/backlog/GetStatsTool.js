const BaseTool = require('../primitives/BaseTool').BaseTool;

class GetStatsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.get_stats',
      name: 'Get BackLog Statistics',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Get BackLog statistics: total tasks, open count, breakdown by status and priority.',
      inputSchema: { type: 'object', properties: {} },
      outputSchema: {
        type: 'object',
        properties: {
          total: { type: 'number' },
          openCount: { type: 'number' },
          byStatus: { type: 'object' },
          byPriority: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute() {
    const backlogService = require('../../../services/backlog/backlog.service');
    const stats = await backlogService.getStats();
    return this.success(stats);
  }
}

module.exports = { GetStatsTool };
