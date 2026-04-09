const { BaseTool } = require('../primitives/BaseTool.js');
const crypto = require('crypto');

class HashTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.hash',
      name: 'Hash Text',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Generate hash of text for deduplication and content identification',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to hash' },
          algorithm: {
            type: 'string',
            enum: ['md5', 'sha1', 'sha256', 'sha512'],
            default: 'sha256',
            description: 'Hash algorithm'
          },
          encoding: {
            type: 'string',
            enum: ['hex', 'base64'],
            default: 'hex',
            description: 'Output encoding'
          },
          normalize: { type: 'boolean', default: true, description: 'Normalize text before hashing' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          hash: { type: 'string' },
          algorithm: { type: 'string' },
          inputLength: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 5 }
    };
  }

  async execute(args, context) {
    const { text, algorithm = 'sha256', encoding = 'hex', normalize = true } = args;

    let input = text || '';

    if (normalize) {
      input = input.toLowerCase().replace(/\s+/g, ' ').trim();
    }

    const hash = crypto.createHash(algorithm).update(input).digest(encoding);

    return this.success({
      hash,
      algorithm,
      inputLength: input.length
    });
  }
}

module.exports = { HashTool };
