const { BaseTool } = require('../primitives/BaseTool.js');

class SanitizeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.sanitize',
      name: 'Sanitize Text',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Clean and normalize text: remove HTML, fix encoding, normalize whitespace',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Raw text to sanitize' },
          options: {
            type: 'object',
            properties: {
              removeHtml: { type: 'boolean', default: true },
              normalizeWhitespace: { type: 'boolean', default: true },
              removeUrls: { type: 'boolean', default: false },
              removeEmails: { type: 'boolean', default: false },
              removePunctuation: { type: 'boolean', default: false },
              lowercase: { type: 'boolean', default: false },
              maxLength: { type: 'integer', description: 'Truncate to max length' }
            }
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          stats: {
            type: 'object',
            properties: {
              originalLength: { type: 'integer' },
              cleanedLength: { type: 'integer' },
              removedChars: { type: 'integer' }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 10 }
    };
  }

  async execute(args, context) {
    const { text, options = {} } = args;
    const originalLength = text.length;

    let cleaned = text;

    // Remove HTML tags
    if (options.removeHtml !== false) {
      cleaned = cleaned.replace(/<[^>]*>/g, ' ');
      cleaned = cleaned.replace(/&nbsp;/gi, ' ');
      cleaned = cleaned.replace(/&amp;/gi, '&');
      cleaned = cleaned.replace(/&lt;/gi, '<');
      cleaned = cleaned.replace(/&gt;/gi, '>');
      cleaned = cleaned.replace(/&quot;/gi, '"');
      cleaned = cleaned.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
    }

    // Remove URLs
    if (options.removeUrls) {
      cleaned = cleaned.replace(/https?:\/\/[^\s]+/gi, '');
    }

    // Remove emails
    if (options.removeEmails) {
      cleaned = cleaned.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');
    }

    // Remove punctuation
    if (options.removePunctuation) {
      cleaned = cleaned.replace(/[^\w\s\u0400-\u04FF]/g, ' ');
    }

    // Normalize whitespace
    if (options.normalizeWhitespace !== false) {
      cleaned = cleaned.replace(/[\r\n]+/g, '\n');
      cleaned = cleaned.replace(/[ \t]+/g, ' ');
      cleaned = cleaned.replace(/\n /g, '\n');
      cleaned = cleaned.replace(/ \n/g, '\n');
      cleaned = cleaned.trim();
    }

    // Lowercase
    if (options.lowercase) {
      cleaned = cleaned.toLowerCase();
    }

    // Truncate
    if (options.maxLength && cleaned.length > options.maxLength) {
      cleaned = cleaned.substring(0, options.maxLength);
      // Try to end at word boundary
      const lastSpace = cleaned.lastIndexOf(' ');
      if (lastSpace > options.maxLength * 0.8) {
        cleaned = cleaned.substring(0, lastSpace);
      }
    }

    return this.success({
      text: cleaned,
      stats: {
        originalLength,
        cleanedLength: cleaned.length,
        removedChars: originalLength - cleaned.length
      }
    });
  }
}

module.exports = { SanitizeTool };
