const { BaseTool } = require('../primitives/BaseTool.js');
const jmespath = require('jmespath');

class JsonPathTool extends BaseTool {
  getDefinition() {
    return {
      id: 'extraction.json_path',
      name: 'JSON Path Extract',
      version: '1.0.0',
      level: 2,
      category: 'extraction',
      description: 'Extract data from JSON using JMESPath expressions',
      inputSchema: {
        type: 'object',
        required: ['data', 'expression'],
        properties: {
          data: { description: 'JSON data to query' },
          expression: { type: 'string', description: 'JMESPath expression' },
          multiple: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                expression: { type: 'string' }
              }
            },
            description: 'Multiple named extractions'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          result: { description: 'Extracted data' },
          results: { type: 'object', description: 'Named results when using multiple' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 200, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const { data, expression, multiple } = args;

    if (data === undefined || data === null) {
      return this.success({ result: null });
    }

    try {
      // Multiple extractions
      if (multiple && Array.isArray(multiple)) {
        const results = {};
        for (const { name, expression: expr } of multiple) {
          results[name] = jmespath.search(data, expr);
        }
        return this.success({ results });
      }

      // Single extraction
      if (expression) {
        const result = jmespath.search(data, expression);
        return this.success({ result });
      }

      return this.success({ result: data });
    } catch (error) {
      return this.error('INVALID_EXPRESSION', `JMESPath error: ${error.message}`);
    }
  }
}

module.exports = { JsonPathTool };
