const { BaseTool } = require('./BaseTool.js');
const { v4: uuidv4, v7: uuidv7 } = require('uuid');
const { nanoid } = require('nanoid');

class GenerateIdTool extends BaseTool {
  getDefinition() {
    return {
      id: 'primitive.generate_id',
      name: 'Generate ID',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Generate unique identifier',
      inputSchema: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['uuid', 'uuidv7', 'nanoid', 'timestamp'], default: 'uuid' },
          prefix: { type: 'string', description: 'Optional prefix' },
          length: { type: 'integer', description: 'For nanoid: custom length' }
        }
      },
      outputSchema: { type: 'string' },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 10, maxMemoryMb: 1 }
    };
  }

  async execute(args, context) {
    let id;
    switch (args.type || 'uuid') {
      case 'uuid': id = uuidv4(); break;
      case 'uuidv7': id = uuidv7(); break;
      case 'nanoid': id = nanoid(args.length || 21); break;
      case 'timestamp': id = `${Date.now()}-${nanoid(8)}`; break;
      default: id = uuidv4();
    }
    return this.success(args.prefix ? `${args.prefix}${id}` : id);
  }
}

module.exports = { GenerateIdTool };
