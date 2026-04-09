const { BaseTool } = require('./BaseTool.js');

class LogTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.log',
      name: 'Log Message',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Log message to execution context',
      inputSchema: {
        type: 'object',
        required: ['message'],
        properties: {
          level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
          message: { type: 'string' },
          data: { description: 'Additional data to log' }
        }
      },
      outputSchema: { type: 'boolean' },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 10, maxMemoryMb: 1 }
    };
  }

  async execute(args, context) {
    const entry = {
      timestamp: Date.now(),
      level: args.level || 'info',
      message: args.message,
      data: args.data,
      executionId: context.executionId
    };

    // Store in context
    const logs = context.get('_logs') || [];
    logs.push(entry);
    context.set('_logs', logs);

    // Console output
    console[entry.level](`[${entry.level.toUpperCase()}] ${entry.message}`, entry.data || '');

    return this.success(true);
  }
}

module.exports = { LogTool };
