const { BaseTool } = require('../primitives/BaseTool.js');

class TemplateTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.template',
      name: 'Render Template',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Render text template with variable substitution',
      inputSchema: {
        type: 'object',
        required: ['template', 'variables'],
        properties: {
          template: { type: 'string', description: 'Template string with {{variable}} placeholders' },
          variables: { type: 'object', description: 'Key-value pairs for substitution' },
          strict: { type: 'boolean', default: false, description: 'Throw error on missing variables' },
          defaultValue: { type: 'string', default: '', description: 'Default value for missing variables' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          substitutions: { type: 'integer' },
          missing: { type: 'array', items: { type: 'string' } }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 5 }
    };
  }

  async execute(args, context) {
    const { template, variables, strict = false, defaultValue = '' } = args;

    if (!template) {
      return this.success({ text: '', substitutions: 0, missing: [] });
    }

    const missing = [];
    let substitutions = 0;

    // Find all placeholders {{variable}} or {{variable.nested.path}}
    const result = template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      const trimmedKey = key.trim();
      const value = this.getNestedValue(variables, trimmedKey);

      if (value !== undefined) {
        substitutions++;
        return String(value);
      } else {
        missing.push(trimmedKey);
        if (strict) {
          throw new Error(`Missing variable: ${trimmedKey}`);
        }
        return defaultValue;
      }
    });

    return this.success({
      text: result,
      substitutions,
      missing
    });
  }

  getNestedValue(obj, path) {
    if (!obj || !path) return undefined;

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }

    return current;
  }
}

module.exports = { TemplateTool };
