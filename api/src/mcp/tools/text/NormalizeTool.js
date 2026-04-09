const { BaseTool } = require('../primitives/BaseTool.js');

class NormalizeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.normalize',
      name: 'Normalize Text',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Normalize text with various transformations',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to normalize' },
          operations: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'trim', 'lowercase', 'uppercase', 'titlecase',
                'removeExtraSpaces', 'removeNewlines', 'removePunctuation',
                'removeNumbers', 'removeUrls', 'removeEmails', 'removeHtml',
                'normalizeUnicode', 'stripAccents'
              ]
            },
            default: ['trim', 'removeExtraSpaces'],
            description: 'List of normalization operations to apply'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          changes: { type: 'integer', description: 'Number of characters changed' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 10 }
    };
  }

  async execute(args, context) {
    const { text, operations = ['trim', 'removeExtraSpaces'] } = args;

    if (!text) {
      return this.success({ text: '', changes: 0 });
    }

    const originalLength = text.length;
    let result = text;

    for (const op of operations) {
      result = this.applyOperation(result, op);
    }

    return this.success({
      text: result,
      changes: Math.abs(originalLength - result.length)
    });
  }

  applyOperation(text, operation) {
    switch (operation) {
      case 'trim':
        return text.trim();
      case 'lowercase':
        return text.toLowerCase();
      case 'uppercase':
        return text.toUpperCase();
      case 'titlecase':
        return text.replace(/\b\w/g, c => c.toUpperCase());
      case 'removeExtraSpaces':
        return text.replace(/\s+/g, ' ');
      case 'removeNewlines':
        return text.replace(/[\r\n]+/g, ' ');
      case 'removePunctuation':
        return text.replace(/[^\w\s]/g, '');
      case 'removeNumbers':
        return text.replace(/\d+/g, '');
      case 'removeUrls':
        return text.replace(/https?:\/\/[^\s]+/g, '');
      case 'removeEmails':
        return text.replace(/[\w.-]+@[\w.-]+\.\w+/g, '');
      case 'removeHtml':
        return text.replace(/<[^>]*>/g, '');
      case 'normalizeUnicode':
        return text.normalize('NFC');
      case 'stripAccents':
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      default:
        return text;
    }
  }
}

module.exports = { NormalizeTool };
