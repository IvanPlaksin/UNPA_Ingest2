const BaseTool = require('../primitives/BaseTool').BaseTool;

class ListTasksTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.list_tasks',
      name: 'List BackLog Tasks',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'List BackLog tasks with optional filters by status, priority, taskType, assignedTo.',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['PROPOSED', 'APPROVED', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'DONE', 'REJECTED', 'CANCELLED'] },
          priority: { type: 'string', enum: ['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW'] },
          taskType: { type: 'string', enum: ['IMPLEMENT', 'REFACTOR', 'FIX', 'DOCUMENT', 'TEST'] },
          assignedTo: { type: 'string' },
          limit: { type: 'number', default: 20 }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          items: { type: 'array' },
          count: { type: 'number' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    const backlogService = require('../../../services/backlog/backlog.service');
    const items = await backlogService.list(args);
    return this.success({ items, count: items.length });
  }
}

module.exports = { ListTasksTool };
