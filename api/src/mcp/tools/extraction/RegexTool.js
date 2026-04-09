const { BaseTool } = require('../primitives/BaseTool.js');

class RegexTool extends BaseTool {
  getDefinition() {
    return {
      id: 'extraction.regex',
      name: 'Regex Extract',
      version: '1.0.0',
      level: 2,
      category: 'extraction',
      description: 'Extract data from text using regular expressions',
      inputSchema: {
        type: 'object',
        required: ['text', 'pattern'],
        properties: {
          text: { type: 'string', description: 'Text to extract from' },
          pattern: { type: 'string', description: 'Regular expression pattern' },
          flags: { type: 'string', default: 'g', description: 'Regex flags (g, i, m, s, u)' },
          groups: { type: 'boolean', default: true, description: 'Return capture groups' },
          limit: { type: 'integer', description: 'Maximum matches to return' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          matches: { type: 'array' },
          count: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 500, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const { text, pattern, flags = 'g', groups = true, limit } = args;

    if (!text || !pattern) {
      return this.success({ matches: [], count: 0 });
    }

    try {
      const regex = new RegExp(pattern, flags);
      const matches = [];
      let match;
      let count = 0;

      if (flags.includes('g')) {
        while ((match = regex.exec(text)) !== null) {
          if (limit && count >= limit) break;

          if (groups && match.length > 1) {
            matches.push({
              full: match[0],
              groups: match.slice(1),
              index: match.index,
              namedGroups: match.groups || {}
            });
          } else {
            matches.push({
              match: match[0],
              index: match.index
            });
          }
          count++;
        }
      } else {
        match = regex.exec(text);
        if (match) {
          if (groups && match.length > 1) {
            matches.push({
              full: match[0],
              groups: match.slice(1),
              index: match.index,
              namedGroups: match.groups || {}
            });
          } else {
            matches.push({
              match: match[0],
              index: match.index
            });
          }
          count = 1;
        }
      }

      return this.success({ matches, count });
    } catch (error) {
      return this.error('INVALID_REGEX', `Invalid regex pattern: ${error.message}`);
    }
  }
}

module.exports = { RegexTool };
