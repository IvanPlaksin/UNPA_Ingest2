const { BaseTool } = require('../primitives/BaseTool');

class AddMemoryTool extends BaseTool {
  getDefinition() {
    return {
      id: 'cycle.add_memory',
      name: 'Add Agent Memory Entry',
      version: '1.0.0',
      level: 2,
      category: 'execution-control',
      description: 'Record a decision, finding, step, or error in the agent memory for the current cycle. This serves as the execution log and reasoning trail.',
      inputSchema: {
        type: 'object',
        required: ['cycleId', 'entryType', 'content'],
        properties: {
          cycleId: { type: 'string', description: 'Execution cycle ID' },
          entryType: { type: 'string', enum: ['DECISION', 'FINDING', 'STEP', 'ERROR', 'NOTE'], description: 'Type of memory entry' },
          content: { type: 'string', description: 'What happened or was decided (min 5 chars)' },
          reasoning: { type: 'string', description: 'Why this decision was made or what led to this finding' },
          metadata: { type: 'object', description: 'Optional structured metadata (files changed, tools used, etc.)' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE']
    };
  }

  async execute(args, context) {
    this.validateArgs(args, ['cycleId', 'entryType', 'content']);
    const memoryService = require('../../../services/backlog/agent-memory.service');
    const entry = await memoryService.addEntry(args.cycleId, args);
    return this.success(entry);
  }
}

module.exports = { AddMemoryTool };
