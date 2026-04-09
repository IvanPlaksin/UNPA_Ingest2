const { BaseTool } = require('./BaseTool.js');

class WaitSignalTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.wait_signal',
      name: 'Wait for Signal',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Wait for event/signal',
      inputSchema: {
        type: 'object',
        required: ['signal'],
        properties: {
          signal: { type: 'string', description: 'Signal name to wait for' },
          timeout: { type: 'integer', default: 30000, description: 'Timeout in ms' }
        }
      },
      outputSchema: { description: 'Signal payload' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 1 }
    };
  }

  async execute(args, context) {
    const payload = await context.waitForSignal(args.signal, args.timeout || 30000);
    return this.success(payload);
  }
}

module.exports = { WaitSignalTool };
