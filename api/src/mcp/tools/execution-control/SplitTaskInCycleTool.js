const { BaseTool } = require('../primitives/BaseTool');

class SplitTaskInCycleTool extends BaseTool {
  getDefinition() {
    return {
      id: 'cycle.split_task',
      name: 'Split Task in Cycle',
      version: '1.0.0',
      level: 2,
      category: 'execution-control',
      description: 'Split a BackLog task into subtasks during an execution cycle. Records split motivation in agent memory. Subtasks are auto-approved and dependencies set up based on order. Per CODEX-RULE-TM-003, rationale is mandatory (min 20 chars).',
      inputSchema: {
        type: 'object',
        required: ['backlogId', 'cycleId', 'subtasks', 'rationale'],
        properties: {
          backlogId: { type: 'string', description: 'Parent task ID' },
          cycleId: { type: 'string', description: 'Current execution cycle ID' },
          subtasks: {
            type: 'array',
            items: {
              type: 'object',
              required: ['title', 'description', 'taskType', 'targetType', 'acceptanceCriteria'],
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                taskType: { type: 'string', enum: ['IMPLEMENT', 'REFACTOR', 'FIX', 'DOCUMENT', 'TEST'] },
                targetType: { type: 'string', enum: ['EXECUTOR', 'SERVICE', 'COMPONENT', 'GRAPH', 'API', 'UI', 'CONFIG'] },
                targetPath: { type: 'string' },
                acceptanceCriteria: { type: 'array', items: { type: 'string' } },
                priority: { type: 'string' },
                effort: { type: 'string' }
              }
            },
            description: 'Subtasks to create (min 2)'
          },
          rationale: { type: 'string', description: 'Why this task is being split (min 20 chars)' },
          dependencyChain: { type: 'boolean', default: false, description: 'If true, each subtask depends on the previous one (sequential execution)' },
          decompositionStrategy: { type: 'string', enum: ['BY_COMPONENT', 'BY_PHASE', 'BY_COMPLEXITY', 'BY_DEPENDENCY', 'BY_SKILL'], description: 'How the task was decomposed' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['backlogId', 'cycleId', 'subtasks', 'rationale']);
    const hierarchyService = require('../../../services/backlog/task-hierarchy.service');
    const agentId = context?.agentId || 'agent:mcp';
    const result = await hierarchyService.splitTaskInCycle(
      args.backlogId, args.cycleId, args.subtasks, args.rationale,
      { splitBy: agentId, dependencyChain: args.dependencyChain, decompositionStrategy: args.decompositionStrategy }
    );
    return this.success(result);
  }
}

module.exports = { SplitTaskInCycleTool };
