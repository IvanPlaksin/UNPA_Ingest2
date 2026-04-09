const { BaseTool } = require('../primitives/BaseTool.js');

class SummarizeTool extends BaseTool {
  getDefinition() {
    return {
      id: 'ai.summarize',
      name: 'AI Summarize',
      version: '1.0.0',
      level: 2,
      category: 'ai',
      description: 'Summarize text using LLM with various styles',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', description: 'Text to summarize' },
          style: {
            type: 'string',
            enum: ['brief', 'detailed', 'bullets', 'key_points', 'executive', 'technical'],
            default: 'brief',
            description: 'Summary style'
          },
          maxLength: { type: 'integer', description: 'Maximum summary length in words' },
          language: { type: 'string', default: 'en', description: 'Output language' },
          focus: { type: 'string', description: 'Specific aspect to focus on' },
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
          summary: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          wordCount: { type: 'integer' },
          compressionRatio: { type: 'number' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const {
      text,
      style = 'brief',
      maxLength,
      language = 'en',
      focus,
      provider = 'mock',
      model
    } = args;

    if (!text || text.trim().length === 0) {
      return this.success({ summary: '', keyPoints: [], wordCount: 0, compressionRatio: 1 });
    }

    const prompt = this.buildPrompt(text, style, maxLength, language, focus);

    // Use ai.complete tool if available
    const completeTool = server?.registry?.getTool('ai.complete');
    if (completeTool) {
      const result = await completeTool.execute({
        prompt,
        systemPrompt: 'You are a professional summarizer. Be concise and accurate.',
        provider,
        model,
        maxTokens: maxLength ? maxLength * 2 : 500,
        temperature: 0.3
      }, context, server);

      if (result.data?.text) {
        const summary = result.data.text;
        const keyPoints = this.extractKeyPoints(summary, style);
        const wordCount = summary.split(/\s+/).length;
        const originalWordCount = text.split(/\s+/).length;

        return this.success({
          summary,
          keyPoints,
          wordCount,
          compressionRatio: originalWordCount / wordCount
        });
      }
    }

    // Fallback: extractive summary
    return this.success(this.extractiveSummary(text, style, maxLength));
  }

  buildPrompt(text, style, maxLength, language, focus) {
    let instruction;

    switch (style) {
      case 'brief':
        instruction = 'Provide a brief 2-3 sentence summary.';
        break;
      case 'detailed':
        instruction = 'Provide a detailed summary covering all main points.';
        break;
      case 'bullets':
        instruction = 'Summarize as a bullet point list of key points.';
        break;
      case 'key_points':
        instruction = 'Extract and list the 5 most important points.';
        break;
      case 'executive':
        instruction = 'Write an executive summary suitable for business stakeholders.';
        break;
      case 'technical':
        instruction = 'Provide a technical summary focusing on methods and findings.';
        break;
      default:
        instruction = 'Summarize the following text.';
    }

    if (maxLength) {
      instruction += ` Keep it under ${maxLength} words.`;
    }

    if (focus) {
      instruction += ` Focus specifically on: ${focus}.`;
    }

    if (language !== 'en') {
      instruction += ` Write the summary in ${language}.`;
    }

    return `${instruction}\n\nText to summarize:\n${text}`;
  }

  extractKeyPoints(summary, style) {
    if (style === 'bullets' || style === 'key_points') {
      // Extract bullet points
      const bullets = summary.match(/^[-•*]\s*.+$/gm) || [];
      return bullets.map(b => b.replace(/^[-•*]\s*/, '').trim());
    }

    // Extract sentences as key points
    const sentences = summary.match(/[^.!?]+[.!?]+/g) || [];
    return sentences.slice(0, 3).map(s => s.trim());
  }

  extractiveSummary(text, style, maxLength) {
    // Simple extractive summarization
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const words = text.toLowerCase().split(/\s+/);

    // Word frequency
    const freq = new Map();
    words.forEach(w => {
      if (w.length > 3) {
        freq.set(w, (freq.get(w) || 0) + 1);
      }
    });

    // Score sentences
    const scored = sentences.map((sentence, index) => {
      const sentenceWords = sentence.toLowerCase().split(/\s+/);
      const score = sentenceWords.reduce((sum, w) => sum + (freq.get(w) || 0), 0) / sentenceWords.length;
      return { sentence: sentence.trim(), score, index };
    });

    // Sort by score and take top sentences
    const numSentences = style === 'brief' ? 2 : style === 'detailed' ? 5 : 3;
    const topSentences = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, numSentences)
      .sort((a, b) => a.index - b.index);

    let summary = topSentences.map(s => s.sentence).join(' ');

    // Trim to max length if specified
    if (maxLength) {
      const summaryWords = summary.split(/\s+/);
      if (summaryWords.length > maxLength) {
        summary = summaryWords.slice(0, maxLength).join(' ') + '...';
      }
    }

    const wordCount = summary.split(/\s+/).length;
    const originalWordCount = text.split(/\s+/).length;

    return {
      summary,
      keyPoints: topSentences.map(s => s.sentence),
      wordCount,
      compressionRatio: originalWordCount / wordCount
    };
  }
}

module.exports = { SummarizeTool };
