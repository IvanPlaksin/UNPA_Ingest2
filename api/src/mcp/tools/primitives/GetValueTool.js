const { BaseTool, CommonSchemas } = require('./BaseTool.js');

class GetValueTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.get_value',
      name: 'Get Value',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Get value from execution context by path',
      inputSchema: {
        type: 'object',
        required: ['path'],
        properties: {
          path: CommonSchemas.path,
          defaultValue: CommonSchemas.anyValue
        }
      },
      outputSchema: { description: 'Retrieved value or default' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 10, maxMemoryMb: 1 }
    };
  }

  async execute(args, context) {
    const value = context.get(args.path);
    return this.success(value !== undefined ? value : args.defaultValue);
  }
}

module.exports = { GetValueTool };
