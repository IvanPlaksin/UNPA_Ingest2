const { BaseTool } = require('../primitives/BaseTool.js');

class TopicsTool extends BaseTool {
  getDefinition() {
    return {
      id: 'extraction.topics',
      name: 'Extract Topics',
      version: '1.0.0',
      level: 2,
      category: 'extraction',
      description: 'Extract main topics and themes from text',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to analyze' },
          options: {
            type: 'object',
            properties: {
              maxTopics: { type: 'integer', default: 5, description: 'Maximum topics to return' },
              minConfidence: { type: 'number', default: 0.3, description: 'Minimum confidence threshold' },
              useLLM: { type: 'boolean', default: false, description: 'Use LLM for topic extraction' }
            }
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          topics: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                confidence: { type: 'number' },
                keywords: { type: 'array', items: { type: 'string' } }
              }
            }
          },
          metadata: {
            type: 'object',
            properties: {
              totalWords: { type: 'integer' },
              uniqueWords: { type: 'integer' }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 3000, maxMemoryMb: 30 }
    };
  }

  async execute(args, context) {
    const { text, options = {} } = args;
    const { maxTopics = 5, minConfidence = 0.3, useLLM = false } = options;

    // Use LLM if available and requested
    if (useLLM && context?.services?.llm) {
      return this.extractWithLLM(text, maxTopics, context.services.llm);
    }

    // TF-IDF based topic extraction
    const words = this.tokenize(text);
    const stopwords = this.getStopwords();
    const filtered = words.filter(w => !stopwords.has(w.toLowerCase()) && w.length > 2);

    // Word frequency
    const freq = {};
    for (const word of filtered) {
      const normalized = word.toLowerCase();
      freq[normalized] = (freq[normalized] || 0) + 1;
    }

    // N-grams for multi-word topics
    const bigrams = this.extractNgrams(filtered, 2);
    const trigrams = this.extractNgrams(filtered, 3);

    // Combine single words and n-grams
    const candidates = { ...freq };
    for (const [ngram, count] of Object.entries(bigrams)) {
      if (count >= 2) {
        candidates[ngram] = count * 1.5; // Boost bigrams
      }
    }
    for (const [ngram, count] of Object.entries(trigrams)) {
      if (count >= 2) {
        candidates[ngram] = count * 2; // Boost trigrams more
      }
    }

    // Score and rank
    const maxFreq = Math.max(...Object.values(candidates));
    const topics = Object.entries(candidates)
      .map(([term, count]) => ({
        name: term,
        confidence: count / maxFreq,
        keywords: this.findRelatedKeywords(term, filtered)
      }))
      .filter(t => t.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxTopics);

    return this.success({
      topics,
      metadata: {
        totalWords: words.length,
        uniqueWords: Object.keys(freq).length
      }
    });
  }

  async extractWithLLM(text, maxTopics, llmService) {
    const prompt = `Extract the ${maxTopics} main topics from this text.
For each topic provide: name, confidence (0-1), and 3-5 related keywords.

Text:
${text.substring(0, 3000)}

Return JSON: {"topics": [{"name": "...", "confidence": 0.0-1.0, "keywords": [...]}]}`;

    try {
      const response = await llmService.complete(prompt, { maxTokens: 1000 });
      const content = response.text || response.content || response;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        return this.success({
          topics: result.topics || [],
          metadata: { method: 'llm' }
        });
      }
    } catch (e) {
      // Fallback
    }
    return this.success({ topics: [], metadata: { error: 'LLM extraction failed' } });
  }

  tokenize(text) {
    return text.match(/\b[\w\u0400-\u04FF]+\b/g) || [];
  }

  extractNgrams(words, n) {
    const ngrams = {};
    for (let i = 0; i <= words.length - n; i++) {
      const ngram = words.slice(i, i + n).join(' ').toLowerCase();
      ngrams[ngram] = (ngrams[ngram] || 0) + 1;
    }
    return ngrams;
  }

  findRelatedKeywords(topic, words) {
    const related = [];
    const topicWords = topic.toLowerCase().split(' ');
    const windowSize = 5;

    for (let i = 0; i < words.length; i++) {
      if (topicWords.includes(words[i].toLowerCase())) {
        // Get surrounding words
        const start = Math.max(0, i - windowSize);
        const end = Math.min(words.length, i + windowSize);
        for (let j = start; j < end; j++) {
          if (j !== i && !topicWords.includes(words[j].toLowerCase())) {
            related.push(words[j].toLowerCase());
          }
        }
      }
    }

    // Count and return top related
    const counts = {};
    for (const w of related) {
      counts[w] = (counts[w] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);
  }

  getStopwords() {
    return new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
      'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
      'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      // Russian stopwords
      'и', 'в', 'во', 'не', 'что', 'он', 'на', 'я', 'с', 'со', 'как', 'а', 'то',
      'все', 'она', 'так', 'его', 'но', 'да', 'ты', 'к', 'у', 'же', 'вы', 'за',
      'бы', 'по', 'только', 'её', 'мне', 'было', 'вот', 'от', 'меня', 'ещё',
      'нет', 'о', 'из', 'ему', 'теперь', 'когда', 'уже', 'вам', 'ни', 'быть', 'был'
    ]);
  }
}

module.exports = { TopicsTool };
