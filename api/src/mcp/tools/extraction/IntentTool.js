const { BaseTool } = require('../primitives/BaseTool.js');

class IntentTool extends BaseTool {
  getDefinition() {
    return {
      id: 'extraction.intent',
      name: 'Detect Intent',
      version: '1.0.0',
      level: 2,
      category: 'extraction',
      description: 'Detect user intent and action type from text',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to analyze' },
          options: {
            type: 'object',
            properties: {
              customIntents: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    patterns: { type: 'array', items: { type: 'string' } }
                  }
                },
                description: 'Custom intent definitions'
              },
              returnMultiple: { type: 'boolean', default: false },
              useLLM: { type: 'boolean', default: false }
            }
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          intent: { type: 'string' },
          confidence: { type: 'number' },
          entities: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string' },
                value: { type: 'string' }
              }
            }
          },
          alternatives: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                intent: { type: 'string' },
                confidence: { type: 'number' }
              }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: [],
      resourceEstimate: { maxDurationMs: 1000, maxMemoryMb: 10 }
    };
  }

  async execute(args, context) {
    const { text, options = {} } = args;
    const { customIntents = [], returnMultiple = false, useLLM = false } = options;

    if (useLLM && context?.services?.llm) {
      return this.detectWithLLM(text, customIntents, context.services.llm);
    }

    const normalizedText = text.toLowerCase().trim();

    // Built-in intent patterns
    const intents = [
      ...this.getBuiltInIntents(),
      ...customIntents.map(ci => ({
        name: ci.name,
        patterns: ci.patterns.map(p => new RegExp(p, 'i')),
        score: 0.8
      }))
    ];

    const matches = [];

    for (const intent of intents) {
      let maxScore = 0;

      for (const pattern of intent.patterns) {
        if (pattern.test(normalizedText)) {
          maxScore = Math.max(maxScore, intent.score || 0.7);
        }
      }

      if (maxScore > 0) {
        matches.push({
          intent: intent.name,
          confidence: maxScore
        });
      }
    }

    // Sort by confidence
    matches.sort((a, b) => b.confidence - a.confidence);

    // Extract entities
    const entities = this.extractEntities(text);

    if (matches.length === 0) {
      return this.success({
        intent: 'unknown',
        confidence: 0,
        entities,
        alternatives: []
      });
    }

    const result = {
      intent: matches[0].intent,
      confidence: matches[0].confidence,
      entities
    };

    if (returnMultiple) {
      result.alternatives = matches.slice(1, 4);
    }

    return this.success(result);
  }

  async detectWithLLM(text, customIntents, llmService) {
    const intentList = [
      'question', 'command', 'request', 'statement', 'greeting', 'farewell',
      'complaint', 'feedback', 'search', 'navigation',
      ...customIntents.map(ci => ci.name)
    ];

    const prompt = `Detect the intent of this text.
Available intents: ${intentList.join(', ')}

Text: "${text}"

Return JSON: {"intent": "...", "confidence": 0.0-1.0, "entities": [{"type": "...", "value": "..."}]}`;

    try {
      const response = await llmService.complete(prompt, { maxTokens: 500 });
      const content = response.text || response.content || response;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return this.success(JSON.parse(jsonMatch[0]));
      }
    } catch (e) {}

    return this.success({ intent: 'unknown', confidence: 0, entities: [] });
  }

  getBuiltInIntents() {
    return [
      {
        name: 'question',
        patterns: [
          /^(what|who|where|when|why|how|which|whose|whom|can|could|would|should|is|are|was|were|do|does|did|will|have|has)/i,
          /\?$/,
          /^(что|кто|где|когда|почему|как|какой|какая|чей|можно|могу)/i
        ],
        score: 0.8
      },
      {
        name: 'command',
        patterns: [
          /^(do|make|create|delete|remove|update|change|set|get|show|hide|open|close|start|stop|run|execute)/i,
          /^(сделай|создай|удали|измени|установи|покажи|открой|закрой|запусти|останови)/i
        ],
        score: 0.85
      },
      {
        name: 'request',
        patterns: [
          /^(please|could you|would you|can you|i need|i want|i would like)/i,
          /^(пожалуйста|не могли бы|можете ли|мне нужно|я хочу|хотел бы)/i
        ],
        score: 0.75
      },
      {
        name: 'greeting',
        patterns: [
          /^(hi|hello|hey|good morning|good afternoon|good evening|howdy)/i,
          /^(привет|здравствуй|добрый день|доброе утро|добрый вечер)/i
        ],
        score: 0.9
      },
      {
        name: 'farewell',
        patterns: [
          /^(bye|goodbye|see you|farewell|take care|good night)/i,
          /^(пока|до свидания|увидимся|прощай|спокойной ночи)/i
        ],
        score: 0.9
      },
      {
        name: 'feedback',
        patterns: [
          /^(i think|i believe|in my opinion|it seems|i feel)/i,
          /(great|awesome|terrible|bad|good|excellent|poor|amazing)/i,
          /^(я думаю|по-моему|мне кажется|считаю)/i
        ],
        score: 0.7
      },
      {
        name: 'search',
        patterns: [
          /^(find|search|look for|locate|where is|show me)/i,
          /^(найди|поиск|ищи|где находится|покажи)/i
        ],
        score: 0.85
      },
      {
        name: 'navigation',
        patterns: [
          /^(go to|navigate to|take me to|open|visit)/i,
          /^(перейти|открой|зайди|посети)/i
        ],
        score: 0.8
      },
      {
        name: 'confirmation',
        patterns: [
          /^(yes|yeah|yep|sure|ok|okay|correct|right|affirmative)/i,
          /^(да|ага|верно|правильно|хорошо|ок)/i
        ],
        score: 0.9
      },
      {
        name: 'denial',
        patterns: [
          /^(no|nope|nah|never|wrong|incorrect|negative)/i,
          /^(нет|неа|никогда|неверно|неправильно)/i
        ],
        score: 0.9
      }
    ];
  }

  extractEntities(text) {
    const entities = [];

    // Email
    const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
    for (const email of emails) {
      entities.push({ type: 'email', value: email });
    }

    // URL
    const urls = text.match(/https?:\/\/[^\s]+/g) || [];
    for (const url of urls) {
      entities.push({ type: 'url', value: url });
    }

    // Numbers
    const numbers = text.match(/\b\d+(?:\.\d+)?\b/g) || [];
    for (const num of numbers) {
      entities.push({ type: 'number', value: num });
    }

    // Dates (simple patterns)
    const dates = text.match(/\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g) || [];
    for (const date of dates) {
      entities.push({ type: 'date', value: date });
    }

    return entities;
  }
}

module.exports = { IntentTool };
