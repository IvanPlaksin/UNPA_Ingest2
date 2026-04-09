const { BaseTool } = require('./BaseTool.js');

class EmitEventTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.emit_event',
      name: 'Emit Event',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Emit event/signal for async coordination',
      inputSchema: {
        type: 'object',
        required: ['event'],
        properties: {
          event: { type: 'string', description: 'Event name' },
          payload: { description: 'Event payload' }
        }
      },
      outputSchema: { type: 'boolean' },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 10, maxMemoryMb: 1 }
    };
  }

  async execute(args, context) {
    context.emitSignal(args.event, args.payload);
    return this.success(true);
  }
}

module.exports = { EmitEventTool };
