const { BaseTool } = require('./BaseTool.js');
const { merge: deepMerge } = require('lodash');

class MergeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.merge',
      name: 'Merge Objects',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Merge multiple objects',
      inputSchema: {
        type: 'object',
        required: ['objects'],
        properties: {
          objects: { type: 'array', items: { type: 'object' } },
          strategy: { type: 'string', enum: ['shallow', 'deep'], default: 'deep' }
        }
      },
      outputSchema: { type: 'object' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 50, maxMemoryMb: 10 }
    };
  }

  async execute(args, context) {
    const { objects, strategy = 'deep' } = args;
    let result;
    if (strategy === 'shallow') {
      result = Object.assign({}, ...objects);
    } else {
      result = deepMerge({}, ...objects);
    }
    return this.success(result);
  }
}

module.exports = { MergeTool };
