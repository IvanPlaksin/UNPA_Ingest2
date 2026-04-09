const { BaseTool } = require('../primitives/BaseTool.js');

class ExtractTool extends BaseTool {
  getDefinition() {
    return {
      id: 'ai.extract',
      name: 'AI Extract',
      version: '1.0.0',
      level: 2,
      category: 'ai',
      description: 'Extract structured data from text using LLM',
      inputSchema: {
        type: 'object',
        required: ['text', 'schema'],
        properties: {
          text: { type: 'string', description: 'Text to extract from' },
          schema: {
            type: 'object',
            description: 'JSON Schema defining the structure to extract',
            properties: {
              type: { type: 'string' },
              properties: { type: 'object' },
              required: { type: 'array', items: { type: 'string' } }
            }
          },
          examples: {
            type: 'array',
            items: { type: 'object' },
            description: 'Few-shot examples for extraction'
          },
          strict: { type: 'boolean', default: false, description: 'Require all fields' },
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
          data: { type: 'object' },
          confidence: { type: 'number' },
          missingFields: { type: 'array', items: { type: 'string' } }
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
      schema,
      examples = [],
      strict = false,
      provider = 'mock',
      model
    } = args;

    if (!text || text.trim().length === 0) {
      return this.success({ data: {}, confidence: 0, missingFields: Object.keys(schema.properties || {}) });
    }

    const prompt = this.buildPrompt(text, schema, examples);

    // Use ai.complete tool
    const completeTool = server?.registry?.getTool('ai.complete');
    if (completeTool && provider !== 'mock') {
      const result = await completeTool.execute({
        prompt,
        systemPrompt: 'You are a data extraction system. Extract information exactly as specified and return valid JSON only.',
        provider,
        model,
        maxTokens: 500,
        temperature: 0.1
      }, context, server);

      if (result.data?.text) {
        try {
          const extracted = this.parseAndValidate(result.data.text, schema, strict);
          return this.success(extracted);
        } catch (e) {
          // Fall through to mock
        }
      }
    }

    // Mock extraction
    return this.success(this.mockExtract(text, schema, strict));
  }

  buildPrompt(text, schema, examples) {
    let prompt = 'Extract the following information from the text and return as JSON:\n\n';

    // Describe schema
    prompt += 'Fields to extract:\n';
    for (const [field, spec] of Object.entries(schema.properties || {})) {
      const required = (schema.required || []).includes(field) ? '(required)' : '(optional)';
      const description = spec.description || spec.type || 'any';
      prompt += `- ${field} ${required}: ${description}\n`;
    }

    // Add examples if provided
    if (examples.length > 0) {
      prompt += '\nExamples:\n';
      for (const example of examples) {
        prompt += `Input: ${example.input}\nOutput: ${JSON.stringify(example.output)}\n\n`;
      }
    }

    prompt += `\nText to extract from:\n${text}\n\nRespond with JSON only:`;

    return prompt;
  }

  parseAndValidate(response, schema, strict) {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const data = JSON.parse(jsonMatch[0]);

    // Check for missing required fields
    const required = schema.required || [];
    const missingFields = required.filter(field => data[field] === undefined || data[field] === null || data[field] === '');

    if (strict && missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Calculate confidence based on filled fields
    const totalFields = Object.keys(schema.properties || {}).length;
    const filledFields = Object.values(data).filter(v => v !== null && v !== undefined && v !== '').length;
    const confidence = totalFields > 0 ? filledFields / totalFields : 1;

    return { data, confidence, missingFields };
  }

  mockExtract(text, schema, strict) {
    const data = {};
    const missingFields = [];

    // Simple pattern-based extraction
    for (const [field, spec] of Object.entries(schema.properties || {})) {
      const extracted = this.extractField(text, field, spec);
      if (extracted !== null) {
        data[field] = extracted;
      } else if ((schema.required || []).includes(field)) {
        missingFields.push(field);
      }
    }

    const totalFields = Object.keys(schema.properties || {}).length;
    const filledFields = Object.keys(data).length;
    const confidence = totalFields > 0 ? filledFields / totalFields : 1;

    return { data, confidence, missingFields };
  }

  extractField(text, fieldName, spec) {
    const textLower = text.toLowerCase();
    const fieldLower = fieldName.toLowerCase();

    // Try to find patterns based on field name
    const patterns = {
      email: /[\w.-]+@[\w.-]+\.\w+/i,
      phone: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/,
      date: /\b(\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})\b/,
      url: /https?:\/\/[^\s]+/i,
      name: /(?:name|called|named)[\s:]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      price: /\$[\d,]+(?:\.\d{2})?/,
      number: /\b\d+(?:\.\d+)?\b/
    };

    // Check if field name matches common patterns
    for (const [patternName, regex] of Object.entries(patterns)) {
      if (fieldLower.includes(patternName)) {
        const match = text.match(regex);
        if (match) {
          return match[1] || match[0];
        }
      }
    }

    // Try to find value after field name mention
    const fieldPattern = new RegExp(`${fieldName}[:\\s]+([^,.\n]+)`, 'i');
    const fieldMatch = text.match(fieldPattern);
    if (fieldMatch) {
      return fieldMatch[1].trim();
    }

    // For array types, try to extract list items
    if (spec.type === 'array') {
      const items = text.match(/[-•*]\s*([^\n]+)/g);
      if (items) {
        return items.map(i => i.replace(/^[-•*]\s*/, '').trim());
      }
    }

    return null;
  }
}

module.exports = { ExtractTool };
