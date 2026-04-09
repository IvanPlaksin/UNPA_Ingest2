const { BaseTool } = require('./BaseTool.js');

class CheckpointTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.checkpoint',
      name: 'Create Checkpoint',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Create execution state checkpoint for potential rollback',
      inputSchema: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Checkpoint identifier' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: { checkpointId: { type: 'string' } }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 50, maxMemoryMb: 50 }
    };
  }

  async execute(args, context) {
    const checkpointId = context.createCheckpoint(args.name);
    return this.success({ checkpointId, name: args.name });
  }
}

module.exports = { CheckpointTool };
