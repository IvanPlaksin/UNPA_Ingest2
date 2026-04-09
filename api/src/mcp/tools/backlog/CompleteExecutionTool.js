const BaseTool = require('../primitives/BaseTool').BaseTool;

class CompleteExecutionTool extends BaseTool {
  getDefinition() {
    return {
      id: 'backlog.complete_execution',
      name: 'Complete Task Execution',
      version: '1.0.0',
      level: 2,
      category: 'backlog',
      description: 'Complete execution tracking for a BackLog task. Provides summary of what was done and execution outcome status.',
      inputSchema: {
        type: 'object',
        required: ['backlogId', 'summary'],
        properties: {
          backlogId: { type: 'string', description: 'BackLog item ID (e.g. BACKLOG-0001)' },
          summary: { type: 'string', description: 'Human-readable summary of what was accomplished' },
          status: {
            type: 'string',
            enum: ['COMPLETED', 'PARTIAL', 'FAILED'],
            description: 'Execution outcome (default: COMPLETED)'
          },
          filesCreated: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths that were created'
          },
          filesModified: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths that were modified'
          },
          acceptanceCriteria: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                criterion: { type: 'string', description: 'The criterion text' },
                met: { type: 'boolean', description: 'Was it satisfied?' },
                evidence: { type: 'string', description: 'How was this verified?' }
              }
            },
            description: 'Verification of acceptance criteria'
          }
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

  async execute(args) {
    this.validateArgs(args, ['backlogId', 'summary']);
    const { backlogId, summary, status } = args;

    const execRecord = require('../../../services/backlog/execution-record.service');
    const record = await execRecord.completeExecution(backlogId, summary, status || 'COMPLETED');

    return this.success({
      message: `Execution completed for ${backlogId}`,
      executionRecord: record
    });
  }
}

module.exports = { CompleteExecutionTool };
