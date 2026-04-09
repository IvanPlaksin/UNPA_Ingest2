const { BaseTool } = require('./BaseTool.js');
const jmespath = require('jmespath');

class TransformTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.transform',
      name: 'Transform Data',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Transform data using JMESPath expression',
      inputSchema: {
        type: 'object',
        required: ['data', 'expression'],
        properties: {
          data: { description: 'Input data' },
          expression: { type: 'string', description: 'JMESPath expression' }
        }
      },
      outputSchema: { description: 'Transformed data' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 10 }
    };
  }

  async execute(args, context) {
    const result = jmespath.search(args.data, args.expression);
    return this.success(result);
  }
}

module.exports = { TransformTool };
