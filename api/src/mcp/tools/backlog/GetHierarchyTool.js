const BaseTool = require('../primitives/BaseTool').BaseTool;

class GetHierarchyTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.get_hierarchy',
      name: 'Get Task Hierarchy',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Get the full hierarchy of a BackLog task including children and completion status. Optionally include execution records and source references.',
      inputSchema: {
        type: 'object',
        required: ['backlogId'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog item ID (e.g. BACKLOG-0001)' },
          includeExecution: { type: 'boolean', description: 'Include execution records (default: false)' },
          includeSources: { type: 'boolean', description: 'Include source references (default: false)' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          task: { type: 'object' },
          children: { type: 'array' },
          canComplete: { type: 'object' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ']
    };
  }

  async execute(args) {
    this.validateArgs(args, ['backlogId']);
    const { backlogId, includeExecution, includeSources } = args;

    const hierarchy = require('../../../services/backlog/task-hierarchy.service');
    const taskData = await hierarchy.getTaskWithHierarchy(backlogId);
    if (!taskData) return this.error('NOT_FOUND', `Task not found: ${backlogId}`);

    const canComplete = await hierarchy.canCompleteParent(backlogId);

    const response = {
      task: {
        backlogId: taskData.backlogId, title: taskData.title,
        status: taskData.status, priority: taskData.priority,
        level: taskData.level || 1, parentId: taskData.parentId,
        childCount: taskData.childCount || 0
      },
      children: (taskData.children || []).map(c => ({
        backlogId: c.backlogId, title: c.title,
        status: c.status, priority: c.priority, _order: c._order
      })),
      canComplete
    };

    if (includeExecution) {
      const execRecord = require('../../../services/backlog/execution-record.service');
      response.execution = await execRecord.getFullExecutionRecord(backlogId);
    }

    if (includeSources) {
      const sourceRef = require('../../../services/backlog/source-reference.service');
      response.sources = await sourceRef.getSourcesForTask(backlogId);
    }

    return this.success(response);
  }
}

module.exports = { GetHierarchyTool };
