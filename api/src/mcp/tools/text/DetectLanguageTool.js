const { BaseTool } = require('../primitives/BaseTool.js');

class DetectLanguageTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.detect_language',
      name: 'Detect Language',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Detect the language of input text using character patterns and common words',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to analyze' },
          options: {
            type: 'object',
            properties: {
              minConfidence: { type: 'number', default: 0.5, description: 'Minimum confidence threshold' },
              returnAll: { type: 'boolean', default: false, description: 'Return all detected languages' }
            }
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          language: { type: 'string', description: 'ISO 639-1 language code' },
          confidence: { type: 'number', description: 'Detection confidence 0-1' },
          alternatives: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                language: { type: 'string' },
                confidence: { type: 'number' }
              }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 100, maxMemoryMb: 5 }
    };
  }

  async execute(args, context) {
    const { text, options = {} } = args;
    const { minConfidence = 0.5, returnAll = false } = options;

    if (!text || text.trim().length === 0) {
      return this.success({ language: 'und', confidence: 0, alternatives: [] });
    }

    const scores = this.detectLanguages(text);
    const sorted = Object.entries(scores)
      .map(([lang, score]) => ({ language: lang, confidence: score }))
      .sort((a, b) => b.confidence - a.confidence);

    const best = sorted[0] || { language: 'und', confidence: 0 };

    if (best.confidence < minConfidence) {
      return this.success({
        language: 'und',
        confidence: best.confidence,
        alternatives: returnAll ? sorted.slice(0, 5) : []
      });
    }

    return this.success({
      language: best.language,
      confidence: best.confidence,
      alternatives: returnAll ? sorted.slice(1, 5) : []
    });
  }

  detectLanguages(text) {
    const scores = {};
    const cleanText = text.toLowerCase();

    // Character-based detection
    const cyrillicRatio = (cleanText.match(/[\u0400-\u04FF]/g) || []).length / cleanText.length;
    const latinRatio = (cleanText.match(/[a-z]/g) || []).length / cleanText.length;
    const cjkRatio = (cleanText.match(/[\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF]/g) || []).length / cleanText.length;
    const arabicRatio = (cleanText.match(/[\u0600-\u06FF]/g) || []).length / cleanText.length;

    // Cyrillic languages
    if (cyrillicRatio > 0.3) {
      const ruPatterns = ['что', 'это', 'как', 'для', 'или', 'при', 'был', 'его', 'она', 'они', 'все', 'так', 'мне'];
      const ukPatterns = ['що', 'це', 'як', 'для', 'або', 'при', 'був', 'його', 'вона', 'вони', 'все', 'так', 'мені', 'і'];

      const ruScore = this.countPatterns(cleanText, ruPatterns) / ruPatterns.length;
      const ukScore = this.countPatterns(cleanText, ukPatterns) / ukPatterns.length;

      scores['ru'] = cyrillicRatio * 0.5 + ruScore * 0.5;
      scores['uk'] = cyrillicRatio * 0.5 + ukScore * 0.5;
    }

    // Latin languages
    if (latinRatio > 0.3) {
      const enPatterns = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'with', 'have', 'this', 'will', 'your', 'from'];
      const dePatterns = ['der', 'die', 'und', 'das', 'ist', 'ein', 'eine', 'für', 'mit', 'auf', 'sich', 'nicht', 'sind', 'auch', 'werden'];
      const frPatterns = ['les', 'des', 'une', 'pour', 'que', 'qui', 'dans', 'est', 'pas', 'sur', 'sont', 'avec', 'plus', 'tout', 'cette'];
      const esPatterns = ['los', 'las', 'una', 'para', 'que', 'con', 'por', 'como', 'pero', 'más', 'este', 'todo', 'esta', 'son', 'entre'];

      scores['en'] = latinRatio * 0.3 + this.countPatterns(cleanText, enPatterns) / enPatterns.length * 0.7;
      scores['de'] = latinRatio * 0.3 + this.countPatterns(cleanText, dePatterns) / dePatterns.length * 0.7;
      scores['fr'] = latinRatio * 0.3 + this.countPatterns(cleanText, frPatterns) / frPatterns.length * 0.7;
      scores['es'] = latinRatio * 0.3 + this.countPatterns(cleanText, esPatterns) / esPatterns.length * 0.7;
    }

    // CJK
    if (cjkRatio > 0.1) {
      const hasHiragana = /[\u3040-\u309F]/.test(cleanText);
      const hasKatakana = /[\u30A0-\u30FF]/.test(cleanText);

      if (hasHiragana || hasKatakana) {
        scores['ja'] = cjkRatio;
      } else {
        scores['zh'] = cjkRatio;
      }
    }

    // Arabic
    if (arabicRatio > 0.3) {
      scores['ar'] = arabicRatio;
    }

    // Normalize scores
    const maxScore = Math.max(...Object.values(scores), 0.001);
    for (const lang of Object.keys(scores)) {
      scores[lang] = Math.min(scores[lang] / maxScore, 1);
    }

    return scores;
  }

  countPatterns(text, patterns) {
    let count = 0;
    const words = text.split(/\s+/);
    const wordSet = new Set(words);

    for (const pattern of patterns) {
      if (wordSet.has(pattern) || text.includes(` ${pattern} `)) {
        count++;
      }
    }
    return count;
  }
}

module.exports = { DetectLanguageTool };
