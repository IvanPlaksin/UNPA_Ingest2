const BaseTool = require('../primitives/BaseTool').BaseTool;

class CreateTaskTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.create_task',
      name: 'Create BackLog Task',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Create a new BackLog task for code modification. Agent-created tasks start as PROPOSED and require human approval.',
      inputSchema: {
        type: 'object',
        required: ['title', 'taskType', 'targetType', 'description', 'acceptanceCriteria'],
        properties: {
          title: { type: 'string', description: 'Task title (min 10 chars)' },
          taskType: { type: 'string', enum: ['IMPLEMENT', 'REFACTOR', 'FIX', 'DOCUMENT', 'TEST'] },
          targetType: { type: 'string', enum: ['EXECUTOR', 'SERVICE', 'COMPONENT', 'GRAPH', 'API', 'UI', 'CONFIG'] },
          targetPath: { type: 'string', description: 'File path or component name' },
          description: { type: 'string', description: 'Detailed task description (min 20 chars)' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' }, description: 'Verifiable acceptance criteria (min 1)' },
          priority: { type: 'string', enum: ['P0_CRITICAL', 'P1_HIGH', 'P2_MEDIUM', 'P3_LOW'], default: 'P2_MEDIUM' },
          effort: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'], default: 'M' },
          relatedCodexRules: { type: 'array', items: { type: 'string' }, description: 'Related Codex rule IDs' },
          addressesBlackCodex: { type: 'array', items: { type: 'string' }, description: 'BlackCodex entries this addresses' },
          tags: { type: 'array', items: { type: 'string' } },
          sourceContext: { type: 'string', description: 'What triggered this task creation' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          backlogId: { type: 'string' },
          status: { type: 'string' },
          title: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['title', 'taskType', 'targetType', 'description', 'acceptanceCriteria']);
    const backlogService = require('../../../services/backlog/backlog.service');
    const agentId = context?.agentId || context?.get?.('agentId') || 'agent:mcp';
    const item = await backlogService.create(args, { createdBy: `agent:${agentId}` });
    return this.success(item);
  }
}

module.exports = { CreateTaskTool };
