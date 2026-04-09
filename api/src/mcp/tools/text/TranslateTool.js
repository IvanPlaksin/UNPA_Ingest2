const { BaseTool } = require('../primitives/BaseTool.js');

class TranslateTool extends BaseTool {
  getDefinition() {
    return {
      id: 'text.translate',
      name: 'Translate Text',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'Translate text between languages using LLM service',
      inputSchema: {
        type: 'object',
        required: ['text', 'targetLanguage'],
        properties: {
          text: { type: 'string', description: 'Text to translate' },
          targetLanguage: { type: 'string', description: 'Target language code (e.g., "en", "ru", "de")' },
          sourceLanguage: { type: 'string', description: 'Source language code (auto-detect if not specified)' },
          options: {
            type: 'object',
            properties: {
              preserveFormatting: { type: 'boolean', default: true },
              style: { type: 'string', enum: ['formal', 'informal', 'technical'], default: 'formal' }
            }
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          translatedText: { type: 'string' },
          sourceLanguage: { type: 'string' },
          targetLanguage: { type: 'string' },
          metadata: {
            type: 'object',
            properties: {
              wordCount: { type: 'integer' },
              characterCount: { type: 'integer' }
            }
          }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context) {
    const { text, targetLanguage, sourceLanguage, options = {} } = args;
    const { preserveFormatting = true, style = 'formal' } = options;

    // Get LLM service from context
    const llmService = context?.services?.llm || context?.llm;

    if (!llmService) {
      // Fallback: return original text with warning
      return this.success({
        translatedText: text,
        sourceLanguage: sourceLanguage || 'und',
        targetLanguage,
        metadata: {
          wordCount: text.split(/\s+/).length,
          characterCount: text.length,
          warning: 'LLM service not available, returning original text'
        }
      });
    }

    const styleInstructions = {
      formal: 'Use formal, professional language.',
      informal: 'Use casual, conversational language.',
      technical: 'Preserve technical terminology and precision.'
    };

    const prompt = `Translate the following text to ${this.getLanguageName(targetLanguage)}.
${sourceLanguage ? `Source language: ${this.getLanguageName(sourceLanguage)}` : 'Detect source language automatically.'}
${styleInstructions[style] || ''}
${preserveFormatting ? 'Preserve the original formatting (paragraphs, lists, etc.).' : ''}

Text to translate:
---
${text}
---

Provide ONLY the translation, no explanations or notes.`;

    try {
      const response = await llmService.complete(prompt, { maxTokens: text.length * 2 });
      const translatedText = response.text || response.content || response;

      return this.success({
        translatedText: typeof translatedText === 'string' ? translatedText.trim() : text,
        sourceLanguage: sourceLanguage || 'auto',
        targetLanguage,
        metadata: {
          wordCount: text.split(/\s+/).length,
          characterCount: text.length
        }
      });
    } catch (error) {
      return this.success({
        translatedText: text,
        sourceLanguage: sourceLanguage || 'und',
        targetLanguage,
        metadata: {
          wordCount: text.split(/\s+/).length,
          characterCount: text.length,
          error: error.message
        }
      });
    }
  }

  getLanguageName(code) {
    const languages = {
      en: 'English',
      ru: 'Russian',
      uk: 'Ukrainian',
      de: 'German',
      fr: 'French',
      es: 'Spanish',
      it: 'Italian',
      pt: 'Portuguese',
      zh: 'Chinese',
      ja: 'Japanese',
      ko: 'Korean',
      ar: 'Arabic',
      hi: 'Hindi',
      pl: 'Polish',
      nl: 'Dutch',
      sv: 'Swedish',
      tr: 'Turkish'
    };
    return languages[code] || code;
  }
}

module.exports = { TranslateTool };
