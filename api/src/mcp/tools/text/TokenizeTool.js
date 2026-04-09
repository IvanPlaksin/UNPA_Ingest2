const { BaseTool } = require('../primitives/BaseTool.js');

class TokenizeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.tokenize',
      name: 'Tokenize Text',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Tokenize text into words, sentences, or custom patterns',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to tokenize' },
          mode: {
            type: 'string',
            enum: ['words', 'sentences', 'lines', 'paragraphs', 'custom'],
            default: 'words',
            description: 'Tokenization mode'
          },
          pattern: { type: 'string', description: 'Custom regex pattern for mode=custom' },
          lowercase: { type: 'boolean', default: false, description: 'Convert to lowercase' },
          removeStopwords: { type: 'boolean', default: false, description: 'Remove common stopwords' },
          minLength: { type: 'integer', default: 1, description: 'Minimum token length' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          tokens: { type: 'array', items: { type: 'string' } },
          count: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 500, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const { text, mode = 'words', pattern, lowercase = false, removeStopwords = false, minLength = 1 } = args;

    if (!text) {
      return this.success({ tokens: [], count: 0 });
    }

    let tokens = [];

    switch (mode) {
      case 'words':
        tokens = text.match(/\b[\w'-]+\b/g) || [];
        break;
      case 'sentences':
        tokens = text.match(/[^.!?]+[.!?]+/g) || [text];
        tokens = tokens.map(s => s.trim()).filter(s => s.length > 0);
        break;
      case 'lines':
        tokens = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        break;
      case 'paragraphs':
        tokens = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
        break;
      case 'custom':
        if (pattern) {
          const regex = new RegExp(pattern, 'g');
          tokens = text.match(regex) || [];
        }
        break;
    }

    // Apply transformations
    if (lowercase) {
      tokens = tokens.map(t => t.toLowerCase());
    }

    if (removeStopwords && mode === 'words') {
      tokens = tokens.filter(t => !this.STOPWORDS.has(t.toLowerCase()));
    }

    if (minLength > 1) {
      tokens = tokens.filter(t => t.length >= minLength);
    }

    return this.success({
      tokens,
      count: tokens.length
    });
  }

  get STOPWORDS() {
    return new Set([
      'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
      'used', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he',
      'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'when', 'where', 'why',
      'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
      'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than',
      'too', 'very', 'just', 'also'
    ]);
  }
}

module.exports = { TokenizeTool };
