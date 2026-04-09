const { BaseTool } = require('./BaseTool.js');

class DelayTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.delay',
      name: 'Delay Execution',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Pause execution for specified duration',
      inputSchema: {
        type: 'object',
        required: ['ms'],
        properties: {
          ms: { type: 'integer', minimum: 0, maximum: 60000, description: 'Milliseconds to wait' }
        }
      },
      outputSchema: { type: 'boolean' },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 1 }
    };
  }

  async execute(args, context) {
    await new Promise(resolve => setTimeout(resolve, args.ms));
    return this.success(true);
  }
}

module.exports = { DelayTool };
