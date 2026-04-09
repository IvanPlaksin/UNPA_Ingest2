const { BaseTool } = require('../primitives/BaseTool.js');

class ExtractKeywordsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.extract_keywords',
      name: 'Extract Keywords',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Extract keywords from text using TF-IDF-like scoring',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to extract keywords from' },
          maxKeywords: { type: 'integer', default: 10, description: 'Maximum keywords to return' },
          minWordLength: { type: 'integer', default: 3, description: 'Minimum word length' },
          includeScores: { type: 'boolean', default: false, description: 'Include relevance scores' },
          ngrams: { type: 'integer', default: 1, description: 'Include n-grams (1=unigrams, 2=bigrams, etc.)' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          keywords: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                keyword: { type: 'string' },
                score: { type: 'number' },
                count: { type: 'integer' }
              }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 500, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const { text, maxKeywords = 10, minWordLength = 3, includeScores = false, ngrams = 1 } = args;

    if (!text) {
      return this.success({ keywords: [] });
    }

    // Tokenize and clean
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= minWordLength && !this.STOPWORDS.has(w));

    // Count word frequencies
    const wordCounts = new Map();
    for (const word of words) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }

    // Generate n-grams if requested
    if (ngrams > 1) {
      for (let n = 2; n <= ngrams; n++) {
        for (let i = 0; i <= words.length - n; i++) {
          const ngram = words.slice(i, i + n).join(' ');
          wordCounts.set(ngram, (wordCounts.get(ngram) || 0) + 1);
        }
      }
    }

    // Calculate scores (frequency * length bonus)
    const scored = Array.from(wordCounts.entries()).map(([word, count]) => {
      const lengthBonus = Math.log(word.length + 1);
      const score = count * lengthBonus;
      return { keyword: word, score, count };
    });

    // Sort by score and limit
    scored.sort((a, b) => b.score - a.score);
    const topKeywords = scored.slice(0, maxKeywords);

    // Optionally remove scores
    if (!includeScores) {
      return this.success({
        keywords: topKeywords.map(k => ({ keyword: k.keyword, count: k.count }))
      });
    }

    return this.success({ keywords: topKeywords });
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
      'too', 'very', 'just', 'also', 'into', 'over', 'after', 'before', 'between',
      'under', 'again', 'further', 'then', 'once', 'here', 'there', 'about', 'above',
      'below', 'being', 'having', 'doing', 'during', 'while', 'until', 'against'
    ]);
  }
}

module.exports = { ExtractKeywordsTool };
