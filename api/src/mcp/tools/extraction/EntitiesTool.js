const { BaseTool } = require('../primitives/BaseTool.js');

class EntitiesTool extends BaseTool {
  getDefinition() {
    return {
      id: 'extraction.entities',
      name: 'Extract Entities',
      version: '1.0.0',
      level: 2,
      category: 'extraction',
      description: 'Extract named entities from text (emails, urls, dates, etc.)',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to extract entities from' },
          types: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['email', 'url', 'phone', 'date', 'time', 'money', 'percentage', 'ip', 'hashtag', 'mention']
            },
            default: ['email', 'url', 'phone', 'date'],
            description: 'Entity types to extract'
          },
          deduplicate: { type: 'boolean', default: true, description: 'Remove duplicates' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          entities: {
            type: 'object',
            additionalProperties: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  value: { type: 'string' },
                  index: { type: 'integer' }
                }
              }
            }
          },
          totalCount: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 500, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const { text, types = ['email', 'url', 'phone', 'date'], deduplicate = true } = args;

    if (!text) {
      return this.success({ entities: {}, totalCount: 0 });
    }

    const entities = {};
    let totalCount = 0;

    for (const type of types) {
      const pattern = this.PATTERNS[type];
      if (!pattern) continue;

      const regex = new RegExp(pattern, 'gi');
      const matches = [];
      let match;

      while ((match = regex.exec(text)) !== null) {
        matches.push({
          value: match[0],
          index: match.index
        });
      }

      if (deduplicate) {
        const seen = new Set();
        entities[type] = matches.filter(m => {
          const key = m.value.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      } else {
        entities[type] = matches;
      }

      totalCount += entities[type].length;
    }

    return this.success({ entities, totalCount });
  }

  get PATTERNS() {
    return {
      email: /[\w.-]+@[\w.-]+\.\w{2,}/,
      url: /https?:\/\/[^\s<>\"{}|\\^`\[\]]+/,
      phone: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/,
      date: /\b(?:\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4})\b/,
      time: /\b(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?(?:\s*[AP]M)?\b/,
      money: /\$[\d,]+(?:\.\d{2})?|\b\d+(?:,\d{3})*(?:\.\d{2})?\s*(?:USD|EUR|GBP|dollars?|euros?)\b/,
      percentage: /\b\d+(?:\.\d+)?%/,
      ip: /\b(?:\d{1,3}\.){3}\d{1,3}\b/,
      hashtag: /#\w+/,
      mention: /@\w+/
    };
  }
}

module.exports = { EntitiesTool };
