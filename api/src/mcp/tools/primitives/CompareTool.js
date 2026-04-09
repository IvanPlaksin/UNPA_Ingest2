const { BaseTool, CommonSchemas } = require('./BaseTool.js');

class CompareTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.compare',
      name: 'Compare Values',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Compare two values with specified operator',
      inputSchema: {
        type: 'object',
        required: ['left', 'op', 'right'],
        properties: {
          left: CommonSchemas.anyValue,
          op: CommonSchemas.comparator,
          right: CommonSchemas.anyValue
        }
      },
      outputSchema: { type: 'boolean' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 10, maxMemoryMb: 1 }
    };
  }

  async execute(args, context) {
    const { left, op, right } = args;
    let result;
    switch (op) {
      case 'eq': result = left === right; break;
      case 'ne': result = left !== right; break;
      case 'gt': result = left > right; break;
      case 'gte': result = left >= right; break;
      case 'lt': result = left < right; break;
      case 'lte': result = left <= right; break;
      case 'in': result = Array.isArray(right) && right.includes(left); break;
      case 'contains': result = String(left).includes(String(right)); break;
      case 'startsWith': result = String(left).startsWith(String(right)); break;
      case 'endsWith': result = String(left).endsWith(String(right)); break;
      default: this.error('INVALID_OPERATOR', `Unknown operator: ${op}`);
    }
    return this.success(result);
  }
}

module.exports = { CompareTool };
