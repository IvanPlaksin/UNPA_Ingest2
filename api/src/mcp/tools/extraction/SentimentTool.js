const { BaseTool } = require('../primitives/BaseTool.js');

class SentimentTool extends BaseTool {
  getDefinition() {
    return {
      id: 'extraction.sentiment',
      name: 'Analyze Sentiment',
      version: '1.0.0',
      level: 2,
      category: 'extraction',
      description: 'Analyze sentiment/emotional tone of text',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to analyze' },
          options: {
            type: 'object',
            properties: {
              granularity: {
                type: 'string',
                enum: ['document', 'sentence'],
                default: 'document',
                description: 'Level of analysis'
              },
              useLLM: { type: 'boolean', default: false }
            }
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral', 'mixed'] },
          score: { type: 'number', description: '-1 (negative) to 1 (positive)' },
          confidence: { type: 'number' },
          emotions: {
            type: 'object',
            properties: {
              joy: { type: 'number' },
              sadness: { type: 'number' },
              anger: { type: 'number' },
              fear: { type: 'number' },
              surprise: { type: 'number' }
            }
          },
          sentences: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                sentiment: { type: 'string' },
                score: { type: 'number' }
              }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 2000, maxMemoryMb: 20 }
    };
  }

  async execute(args, context) {
    const { text, options = {} } = args;
    const { granularity = 'document', useLLM = false } = options;

    if (useLLM && context?.services?.llm) {
      return this.analyzeWithLLM(text, granularity, context.services.llm);
    }

    // Lexicon-based sentiment analysis
    const sentences = text.split(/[.!?]+/).filter(s => s.trim());

    const sentenceResults = sentences.map(sentence => {
      const result = this.analyzeSentence(sentence);
      return {
        text: sentence.trim().substring(0, 100),
        sentiment: result.sentiment,
        score: result.score
      };
    });

    // Aggregate document sentiment
    const scores = sentenceResults.map(s => s.score);
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

    const documentSentiment = this.scoreToSentiment(avgScore);
    const emotions = this.detectEmotions(text);

    const result = {
      sentiment: documentSentiment,
      score: Math.round(avgScore * 1000) / 1000,
      confidence: this.calculateConfidence(scores),
      emotions
    };

    if (granularity === 'sentence') {
      result.sentences = sentenceResults;
    }

    return this.success(result);
  }

  analyzeSentence(sentence) {
    const words = sentence.toLowerCase().match(/\b[\w\u0400-\u04FF]+\b/g) || [];
    let score = 0;
    let count = 0;

    const positive = this.getPositiveWords();
    const negative = this.getNegativeWords();
    const intensifiers = this.getIntensifiers();
    const negators = this.getNegators();

    let negation = false;
    let intensify = 1;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];

      if (negators.has(word)) {
        negation = true;
        continue;
      }

      if (intensifiers.has(word)) {
        intensify = 1.5;
        continue;
      }

      if (positive.has(word)) {
        score += (negation ? -1 : 1) * intensify;
        count++;
      } else if (negative.has(word)) {
        score += (negation ? 1 : -1) * intensify;
        count++;
      }

      negation = false;
      intensify = 1;
    }

    const normalizedScore = count > 0 ? score / count : 0;
    const clampedScore = Math.max(-1, Math.min(1, normalizedScore));

    return {
      score: clampedScore,
      sentiment: this.scoreToSentiment(clampedScore)
    };
  }

  scoreToSentiment(score) {
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  calculateConfidence(scores) {
    if (scores.length === 0) return 0;
    const variance = this.variance(scores);
    // Lower variance = higher confidence
    return Math.max(0, Math.min(1, 1 - Math.sqrt(variance)));
  }

  variance(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / arr.length;
  }

  detectEmotions(text) {
    const words = text.toLowerCase().match(/\b[\w\u0400-\u04FF]+\b/g) || [];
    const total = words.length || 1;

    const emotionLexicons = {
      joy: new Set(['happy', 'joy', 'love', 'wonderful', 'great', 'amazing', 'excellent', 'fantastic', 'beautiful', 'радость', 'счастье', 'любовь', 'прекрасно']),
      sadness: new Set(['sad', 'unhappy', 'depressed', 'miserable', 'sorry', 'grief', 'sorrow', 'грустно', 'печаль', 'тоска']),
      anger: new Set(['angry', 'furious', 'hate', 'annoyed', 'frustrated', 'mad', 'злость', 'гнев', 'ненависть']),
      fear: new Set(['afraid', 'scared', 'fear', 'worried', 'anxious', 'terrified', 'страх', 'боязнь', 'тревога']),
      surprise: new Set(['surprised', 'amazed', 'shocked', 'unexpected', 'astonished', 'удивление', 'шок'])
    };

    const emotions = {};
    for (const [emotion, lexicon] of Object.entries(emotionLexicons)) {
      const count = words.filter(w => lexicon.has(w)).length;
      emotions[emotion] = Math.round((count / total) * 100) / 100;
    }

    return emotions;
  }

  async analyzeWithLLM(text, granularity, llmService) {
    const prompt = `Analyze the sentiment of this text.
Return JSON with: sentiment (positive/negative/neutral/mixed), score (-1 to 1), confidence (0-1), emotions {joy, sadness, anger, fear, surprise as 0-1}
${granularity === 'sentence' ? 'Also analyze each sentence.' : ''}

Text: ${text.substring(0, 2000)}`;

    try {
      const response = await llmService.complete(prompt, { maxTokens: 1000 });
      const content = response.text || response.content || response;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return this.success(JSON.parse(jsonMatch[0]));
      }
    } catch (e) {}
    return this.success({ sentiment: 'neutral', score: 0, confidence: 0 });
  }

  getPositiveWords() {
    return new Set([
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
      'love', 'like', 'best', 'happy', 'glad', 'pleased', 'enjoy', 'beautiful',
      'perfect', 'brilliant', 'superb', 'outstanding', 'magnificent', 'delightful',
      'хорошо', 'отлично', 'прекрасно', 'замечательно', 'великолепно', 'люблю',
      'нравится', 'радость', 'счастье', 'успех', 'победа', 'красиво'
    ]);
  }

  getNegativeWords() {
    return new Set([
      'bad', 'terrible', 'awful', 'horrible', 'poor', 'worst', 'hate', 'dislike',
      'sad', 'angry', 'upset', 'disappointed', 'frustrated', 'annoyed', 'unhappy',
      'fail', 'failure', 'problem', 'issue', 'error', 'wrong', 'broken',
      'плохо', 'ужасно', 'отвратительно', 'ненавижу', 'грустно', 'злой',
      'разочарован', 'проблема', 'ошибка', 'неудача', 'провал'
    ]);
  }

  getIntensifiers() {
    return new Set(['very', 'really', 'extremely', 'absolutely', 'totally', 'completely', 'highly', 'очень', 'крайне', 'абсолютно']);
  }

  getNegators() {
    return new Set(['not', 'no', 'never', 'neither', 'nobody', 'nothing', 'не', 'нет', 'никогда', 'ни']);
  }
}

module.exports = { SentimentTool };
