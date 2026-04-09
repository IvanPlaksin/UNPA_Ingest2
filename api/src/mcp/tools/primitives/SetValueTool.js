const { BaseTool, CommonSchemas } = require('./BaseTool.js');

class SetValueTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.set_value',
      name: 'Set Value',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Set value in execution context by path',
      inputSchema: {
        type: 'object',
        required: ['path', 'value'],
        properties: {
          path: CommonSchemas.path,
          value: CommonSchemas.anyValue
        }
      },
      outputSchema: { type: 'boolean' },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE'],
      resourceEstimate: { maxDurationMs: 10, maxMemoryMb: 1 }
    };
  }

  async execute(args, context) {
    context.set(args.path, args.value);
    return this.success(true);
  }
}

module.exports = { SetValueTool };
