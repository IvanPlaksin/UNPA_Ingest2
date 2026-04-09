const { BaseTool } = require('../primitives/BaseTool.js');
const Ajv = require('ajv');

class ValidateToolTool extends BaseTool {
  constructor() {
    super();
    this.ajv = new Ajv({ allErrors: true, strict: false });
  }

  getDefinition() {
    return {
      id: 'meta.validate_tool',
      name: 'Validate Tool Definition',
      version: '1.0.0',
      level: 4,
      category: 'meta',
      description: 'Validate tool definitions against schema and best practices',
      inputSchema: {
        type: 'object',
        required: ['definition'],
        properties: {
          definition: { type: 'object', description: 'Tool definition to validate' },
          strict: { type: 'boolean', default: false, description: 'Enable strict validation' },
          checkBestPractices: { type: 'boolean', default: true, description: 'Check best practices' },
          testInputs: {
            type: 'array',
            items: { type: 'object' },
            description: 'Test inputs to validate against schema'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          valid: { type: 'boolean' },
          errors: { type: 'array' },
          warnings: { type: 'array' },
          suggestions: { type: 'array' },
          schemaValidation: { type: 'object' },
          testResults: { type: 'array' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 1000, maxMemoryMb: 20 }
    };
  }

  async execute(args, context, server) {
    const { definition, strict = false, checkBestPractices = true, testInputs = [] } = args;

    const errors = [];
    const warnings = [];
    const suggestions = [];

    // Required fields validation
    const requiredFields = ['id', 'name', 'description'];
    for (const field of requiredFields) {
      if (!definition[field]) {
        errors.push({ field, message: `Missing required field: ${field}` });
      }
    }

    // ID format validation
    if (definition.id && !definition.id.match(/^[a-z]+\.[a-z_]+$/)) {
      errors.push({
        field: 'id',
        message: 'ID must match pattern: category.tool_name (lowercase, underscores allowed)'
      });
    }

    // Level validation
    if (definition.level !== undefined) {
      if (![1, 2, 3, 4].includes(definition.level)) {
        errors.push({ field: 'level', message: 'Level must be 1, 2, 3, or 4' });
      }
    }

    // Safety level validation
    const validSafetyLevels = ['AUTO', 'REQUIRES_APPROVAL', 'GOD_MODE'];
    if (definition.safetyLevel && !validSafetyLevels.includes(definition.safetyLevel)) {
      errors.push({
        field: 'safetyLevel',
        message: `Invalid safetyLevel. Must be one of: ${validSafetyLevels.join(', ')}`
      });
    }

    // Side effects validation
    const validSideEffects = ['READ', 'WRITE', 'DELETE', 'EXTERNAL_CALL'];
    if (definition.sideEffects) {
      for (const effect of definition.sideEffects) {
        if (!validSideEffects.includes(effect)) {
          warnings.push({
            field: 'sideEffects',
            message: `Unknown side effect: ${effect}`
          });
        }
      }
    }

    // Input schema validation
    let schemaValidation = { valid: true, errors: [] };
    if (definition.inputSchema) {
      try {
        this.ajv.compile(definition.inputSchema);
      } catch (error) {
        schemaValidation = {
          valid: false,
          errors: [{ message: `Invalid inputSchema: ${error.message}` }]
        };
        errors.push({
          field: 'inputSchema',
          message: `Invalid JSON Schema: ${error.message}`
        });
      }
    }

    // Best practices checks
    if (checkBestPractices) {
      this.checkBestPractices(definition, warnings, suggestions, strict);
    }

    // Test inputs against schema
    const testResults = [];
    if (testInputs.length > 0 && definition.inputSchema && schemaValidation.valid) {
      const validate = this.ajv.compile(definition.inputSchema);
      for (let i = 0; i < testInputs.length; i++) {
        const valid = validate(testInputs[i]);
        testResults.push({
          index: i,
          input: testInputs[i],
          valid,
          errors: valid ? [] : validate.errors?.map(e => e.message) || []
        });
      }
    }

    return this.success({
      valid: errors.length === 0,
      errors,
      warnings,
      suggestions,
      schemaValidation,
      testResults
    });
  }

  checkBestPractices(definition, warnings, suggestions, strict) {
    // Description length
    if (definition.description && definition.description.length < 20) {
      warnings.push({
        field: 'description',
        message: 'Description is too short. Consider providing more detail.'
      });
    }

    // Input schema presence
    if (!definition.inputSchema) {
      suggestions.push({
        field: 'inputSchema',
        message: 'Consider adding inputSchema for better documentation and validation'
      });
    } else {
      // Check for property descriptions
      const props = definition.inputSchema.properties || {};
      const propsWithoutDesc = Object.entries(props)
        .filter(([, v]) => !v.description)
        .map(([k]) => k);

      if (propsWithoutDesc.length > 0) {
        suggestions.push({
          field: 'inputSchema.properties',
          message: `Add descriptions to properties: ${propsWithoutDesc.join(', ')}`
        });
      }
    }

    // Output schema presence
    if (!definition.outputSchema) {
      suggestions.push({
        field: 'outputSchema',
        message: 'Consider adding outputSchema for better documentation'
      });
    }

    // Resource estimate
    if (!definition.resourceEstimate) {
      suggestions.push({
        field: 'resourceEstimate',
        message: 'Consider adding resourceEstimate for better resource management'
      });
    }

    // Side effects for tools that might need them
    const toolId = definition.id || '';
    if (!definition.sideEffects || definition.sideEffects.length === 0) {
      if (toolId.includes('write') || toolId.includes('create') || toolId.includes('delete')) {
        warnings.push({
          field: 'sideEffects',
          message: 'Tool name suggests side effects but none declared'
        });
      }
    }

    // Safety level for potentially dangerous tools
    if (definition.safetyLevel === 'AUTO') {
      if (definition.sideEffects?.includes('DELETE') || definition.sideEffects?.includes('WRITE')) {
        if (strict) {
          warnings.push({
            field: 'safetyLevel',
            message: 'Tools with WRITE/DELETE side effects should consider REQUIRES_APPROVAL'
          });
        }
      }
    }

    // Version format
    if (definition.version && !definition.version.match(/^\d+\.\d+\.\d+$/)) {
      warnings.push({
        field: 'version',
        message: 'Version should follow semver format: X.Y.Z'
      });
    }
  }
}

module.exports = { ValidateToolTool };
