const { BaseTool } = require('./BaseTool.js');
const jmespath = require('jmespath');

class MapTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.map',
      name: 'Map Array',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Map array elements using JMESPath transform',
      inputSchema: {
        type: 'object',
        required: ['data', 'transform'],
        properties: {
          data: { type: 'array' },
          transform: { type: 'string', description: 'JMESPath expression applied to each element' }
        }
      },
      outputSchema: { type: 'array' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const mapped = args.data.map(item => jmespath.search(item, args.transform));
    return this.success(mapped);
  }
}

module.exports = { MapTool };
