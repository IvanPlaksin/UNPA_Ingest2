const BaseTool = require('../primitives/BaseTool').BaseTool;

class SplitTaskTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.split_task',
      name: 'Split Task into Subtasks',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Split a BackLog task into subtasks. MUST provide rationale (min 20 chars) explaining why decomposition is needed. At least 2 subtasks required. Max depth 3 levels.',
      inputSchema: {
        type: 'object',
        required: ['backlogId', 'subtasks', 'rationale', 'decompositionStrategy'],
        properties: {
          backlogId: { type: 'string', description: 'Parent BackLog item ID to split' },
          rationale: { type: 'string', description: 'WHY this task needs to be split (min 20 chars)' },
          decompositionStrategy: {
            type: 'string',
            enum: ['BY_COMPONENT', 'BY_PHASE', 'BY_COMPLEXITY', 'BY_DEPENDENCY', 'BY_SKILL'],
            description: 'Strategy used for decomposition'
          },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'description', 'taskType', 'targetType', 'acceptanceCriteria'],
              properties: {
                title: { type: 'string', description: 'Subtask title (min 10 chars)' },
                description: { type: 'string', description: 'Subtask description (min 20 chars)' },
                taskType: { type: 'string', enum: ['IMPLEMENT', 'REFACTOR', 'FIX', 'DOCUMENT', 'TEST'] },
                targetType: { type: 'string', enum: ['EXECUTOR', 'SERVICE', 'COMPONENT', 'GRAPH', 'API', 'UI', 'CONFIG'] },
                targetPath: { type: 'string' },
                acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                priority: { type: 'string', enum: ['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW'] },
                effort: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] }
              }
            },
            description: 'At least 2 subtasks required'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          parent: { type: 'object' },
          subtasks: { type: 'array' },
          subtaskCount: { type: 'integer' },
          message: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['backlogId', 'subtasks', 'rationale', 'decompositionStrategy']);
    const { backlogId, subtasks, rationale, decompositionStrategy } = args;

    if (!rationale || rationale.length < 20) {
      return this.error('VALIDATION', 'rationale must be at least 20 characters');
    }
    if (!subtasks || subtasks.length < 2) {
      return this.error('VALIDATION', 'At least 2 subtasks required for split');
    }

    const hierarchy = require('../../../services/backlog/task-hierarchy.service');
    const splitBy = context?.agentId || context?.get?.('agentId') || 'agent:mcp';

    const result = await hierarchy.splitTask(
      backlogId, subtasks,
      { rationale, decompositionStrategy },
      { splitBy }
    );

    return this.success({
      message: `Task ${backlogId} split into ${result.subtasks.length} subtasks`,
      parent: result.parent,
      subtasks: result.subtasks.map(s => ({
        backlogId: s.backlogId, title: s.title, status: s.status, level: s.level
      })),
      subtaskCount: result.subtasks.length
    });
  }
}

module.exports = { SplitTaskTool };
