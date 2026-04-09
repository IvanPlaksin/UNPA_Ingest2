const { BaseTool } = require('./BaseTool.js');
const Ajv = require('ajv');

class ValidateTool extends BaseTool {
  constructor() {
    super();
    this.ajv = new Ajv({ allErrors: true });
  }

  getDefinition() {
    return {
      id: 'primitive.validate',
      name: 'Validate Data',
      version: '1.0.0',
      level: 1,
      category: 'primitive',
      description: 'Validate data against JSON Schema',
      inputSchema: {
        type: 'object',
        required: ['data', 'schema'],
        properties: {
          data: { description: 'Data to validate' },
          schema: { type: 'object', description: 'JSON Schema' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          errors: { type: 'array' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['READ'],
      resourceEstimate: { maxDurationMs: 50, maxMemoryMb: 5 }
    };
  }

  async execute(args, context) {
    const validate = this.ajv.compile(args.schema);
    const valid = validate(args.data);
    return this.success({
      valid,
      errors: valid ? [] : validate.errors
    });
  }
}

module.exports = { ValidateTool };
