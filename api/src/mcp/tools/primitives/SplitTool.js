const { BaseTool } = require('./BaseTool.js');

class SplitTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.split',
      name: 'Split Data',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Split string or array',
      inputSchema: {
        type: 'object',
        required: ['data'],
        properties: {
          data: { description: 'String or array to split' },
          delimiter: { type: 'string', description: 'For strings: split delimiter' },
          chunkSize: { type: 'integer', description: 'For arrays: chunk size' }
        }
      },
      outputSchema: { type: 'array' },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 50, maxMemoryMb: 10 }
    };
  }

  async execute(args, context) {
    const { data, delimiter, chunkSize } = args;

    if (typeof data === 'string') {
      return this.success(data.split(delimiter || ''));
    }

    if (Array.isArray(data) && chunkSize) {
      const chunks = [];
      for (let i = 0; i < data.length; i += chunkSize) {
        chunks.push(data.slice(i, i + chunkSize));
      }
      return this.success(chunks);
    }

    return this.success([data]);
  }
}

module.exports = { SplitTool };
