const { BaseTool } = require('./BaseTool.js');

class AggregateTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.aggregate',
      name: 'Aggregate Array',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Perform aggregation on array (sum, avg, min, max, count)',
      inputSchema: {
        type: 'object',
        required: ['data', 'op'],
        properties: {
          data: { type: 'array', items: { type: 'number' } },
          op: { type: 'string', enum: ['sum', 'avg', 'min', 'max', 'count'] },
          field: { type: 'string', description: 'Field to aggregate (for object arrays)' }
        }
      },
      outputSchema: { type: 'number' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 50, maxMemoryMb: 10 }
    };
  }

  async execute(args, context) {
    let { data, op, field } = args;
    if (field) data = data.map(item => item[field]);
    const nums = data.filter(n => typeof n === 'number');

    let result;
    switch (op) {
      case 'sum': result = nums.reduce((a, b) => a + b, 0); break;
      case 'avg': result = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; break;
      case 'min': result = Math.min(...nums); break;
      case 'max': result = Math.max(...nums); break;
      case 'count': result = data.length; break;
      default: this.error('INVALID_OP', `Unknown operation: ${op}`);
    }
    return this.success(result);
  }
}

module.exports = { AggregateTool };
