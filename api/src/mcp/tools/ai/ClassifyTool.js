const { BaseTool } = require('../primitives/BaseTool.js');

class ClassifyTool extends BaseTool {
  getDefinition() {
    return {
      id: 'ai.classify',
      name: 'AI Classify',
      version: '1.0.0',
      level: 2,
      category: 'ai',
      description: 'Classify text into predefined or dynamic categories using LLM',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to classify' },
          categories: {
            type: 'array',
            items: { type: 'string' },
            description: 'Predefined categories (if not provided, LLM will suggest)'
          },
          multiLabel: { type: 'boolean', default: false, description: 'Allow multiple categories' },
          includeConfidence: { type: 'boolean', default: true, description: 'Include confidence scores' },
          includeReasoning: { type: 'boolean', default: false, description: 'Include classification reasoning' },
          provider: {
            type: 'string',
            enum: ['openai', 'anthropic', 'ollama', 'mock'],
            default: 'mock'
          },
          model: { type: 'string' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          categories: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number' },
          confidences: { type: 'object' },
          reasoning: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 30 }
    };
  }

  async execute(args, context, server) {
    const {
      text,
      categories,
      multiLabel = false,
      includeConfidence = true,
      includeReasoning = false,
      provider = 'mock',
      model
    } = args;

    if (!text || text.trim().length === 0) {
      return this.success({ category: 'unknown', confidence: 0 });
    }

    const prompt = this.buildPrompt(text, categories, multiLabel, includeReasoning);

    // Use ai.complete tool
    const completeTool = server?.registry?.getTool('ai.complete');
    if (completeTool && provider !== 'mock') {
      const result = await completeTool.execute({
        prompt,
        systemPrompt: 'You are a text classifier. Respond only in JSON format.',
        provider,
        model,
        maxTokens: 200,
        temperature: 0.1
      }, context, server);

      if (result.data?.text) {
        try {
          const parsed = this.parseResponse(result.data.text, categories, multiLabel);
          return this.success(parsed);
        } catch (e) {
          // Fall through to mock
        }
      }
    }

    // Mock classification
    return this.success(this.mockClassify(text, categories, multiLabel, includeConfidence));
  }

  buildPrompt(text, categories, multiLabel, includeReasoning) {
    let prompt = 'Classify the following text';

    if (categories && categories.length > 0) {
      prompt += ` into one of these categories: ${categories.join(', ')}.`;
    } else {
      prompt += ' and suggest appropriate categories.';
    }

    if (multiLabel) {
      prompt += ' You may assign multiple categories if applicable.';
    }

    prompt += '\n\nRespond in JSON format:';
    prompt += '\n{"category": "main_category", "confidence": 0.95';
    if (multiLabel) {
      prompt += ', "categories": ["cat1", "cat2"], "confidences": {"cat1": 0.9, "cat2": 0.7}';
    }
    if (includeReasoning) {
      prompt += ', "reasoning": "brief explanation"';
    }
    prompt += '}';

    prompt += `\n\nText to classify:\n${text}`;

    return prompt;
  }

  parseResponse(response, categories, multiLabel) {
    // Try to extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        category: parsed.category || parsed.categories?.[0] || 'unknown',
        ...(multiLabel && { categories: parsed.categories || [parsed.category] }),
        confidence: parsed.confidence || 0.5,
        ...(parsed.confidences && { confidences: parsed.confidences }),
        ...(parsed.reasoning && { reasoning: parsed.reasoning })
      };
    }
    throw new Error('Could not parse JSON response');
  }

  mockClassify(text, categories, multiLabel, includeConfidence) {
    const textLower = text.toLowerCase();

    // Default categories if none provided
    const cats = categories && categories.length > 0 ? categories : [
      'general', 'question', 'statement', 'request', 'opinion', 'fact'
    ];

    // Simple keyword-based classification
    const scores = {};
    const keywords = {
      question: ['?', 'what', 'how', 'why', 'when', 'where', 'who', 'which'],
      request: ['please', 'could', 'would', 'can you', 'help', 'need'],
      opinion: ['think', 'believe', 'feel', 'opinion', 'seems', 'appears'],
      fact: ['is', 'are', 'was', 'were', 'data', 'according', 'study', 'research'],
      technical: ['code', 'function', 'api', 'error', 'bug', 'system', 'database'],
      business: ['revenue', 'cost', 'profit', 'market', 'customer', 'sales']
    };

    for (const cat of cats) {
      const catKeywords = keywords[cat.toLowerCase()] || [];
      const matches = catKeywords.filter(kw => textLower.includes(kw)).length;
      scores[cat] = Math.min(0.9, 0.3 + (matches * 0.15));
    }

    // Find top category
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const topCategory = sorted[0]?.[0] || cats[0];
    const topConfidence = sorted[0]?.[1] || 0.5;

    const result = {
      category: topCategory
    };

    if (includeConfidence) {
      result.confidence = topConfidence;
    }

    if (multiLabel) {
      result.categories = sorted.filter(([_, score]) => score > 0.4).map(([cat]) => cat);
      result.confidences = Object.fromEntries(sorted.filter(([_, score]) => score > 0.3));
    }

    return result;
  }
}

module.exports = { ClassifyTool };
