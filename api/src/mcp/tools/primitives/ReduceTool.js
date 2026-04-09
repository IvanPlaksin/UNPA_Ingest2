const { BaseTool } = require('./BaseTool.js');

class ReduceTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.reduce',
      name: 'Reduce Array',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Reduce array to single value',
      inputSchema: {
        type: 'object',
        required: ['data', 'reducer', 'initial'],
        properties: {
          data: { type: 'array' },
          reducer: { type: 'string', enum: ['sum', 'product', 'concat', 'merge', 'custom'] },
          initial: { description: 'Initial accumulator value' },
          customExpr: { type: 'string', description: 'For custom: expression with $acc and $item' }
        }
      },
      outputSchema: { description: 'Reduced value' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const { data, reducer, initial } = args;
    let result = initial;

    for (const item of data) {
      switch (reducer) {
        case 'sum': result = result + item; break;
        case 'product': result = result * item; break;
        case 'concat': result = Array.isArray(result) ? [...result, item] : result + item; break;
        case 'merge': result = { ...result, ...item }; break;
        default: this.error('INVALID_REDUCER', `Unknown reducer: ${reducer}`);
      }
    }
    return this.success(result);
  }
}

module.exports = { ReduceTool };
