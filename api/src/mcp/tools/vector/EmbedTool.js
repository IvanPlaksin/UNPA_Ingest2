const { BaseTool } = require('../primitives/BaseTool.js');

class EmbedTool extends BaseTool {
  getDefinition() {
    return {
      id: 'vector.embed',
      name: 'Generate Embeddings',
      version: '1.0.0',
      level: 2,
      category: 'vector',
      description: 'Generate vector embeddings for text using configured embedding provider',
      inputSchema: {
        type: 'object',
        required: ['text'],
        properties: {
          text: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } }
            ],
            description: 'Text or array of texts to embed'
          },
          model: { type: 'string', description: 'Embedding model name (provider-specific)' },
          provider: {
            type: 'string',
            enum: ['openai', 'ollama', 'local', 'service', 'mock'],
            default: 'mock',
            description: 'Embedding provider (service uses ServiceConnector/TEI)'
          },
          dimensions: { type: 'integer', description: 'Output dimensions (if supported)' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          embeddings: {
            type: 'array',
            items: { type: 'array', items: { type: 'number' } }
          },
          model: { type: 'string' },
          dimensions: { type: 'integer' },
          tokenCount: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 30000, maxMemoryMb: 100 }
    };
  }

  async execute(args, context, server) {
    const { text, model, provider = 'mock', dimensions } = args;
    const texts = Array.isArray(text) ? text : [text];

    // Get embedding provider from server config or use mock
    const embedProvider = server?.config?.embedding?.provider || provider;

    let embeddings;
    let actualModel;
    let actualDimensions;

    switch (embedProvider) {
      case 'openai':
        ({ embeddings, model: actualModel, dimensions: actualDimensions } =
          await this.embedWithOpenAI(texts, model || 'text-embedding-3-small', dimensions, server?.config?.embedding));
        break;
      case 'ollama':
        ({ embeddings, model: actualModel, dimensions: actualDimensions } =
          await this.embedWithOllama(texts, model || 'nomic-embed-text', server?.config?.embedding));
        break;
      case 'service':
        ({ embeddings, model: actualModel, dimensions: actualDimensions } =
          await this.embedWithService(texts, server));
        break;
      case 'mock':
      default:
        ({ embeddings, model: actualModel, dimensions: actualDimensions } =
          this.mockEmbed(texts, dimensions || 384));
        break;
    }

    return this.success({
      embeddings,
      model: actualModel,
      dimensions: actualDimensions,
      tokenCount: texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0)
    });
  }

  mockEmbed(texts, dimensions = 384) {
    // Generate deterministic mock embeddings based on text hash
    const embeddings = texts.map(text => {
      const embedding = [];
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash = hash & hash;
      }

      for (let i = 0; i < dimensions; i++) {
        // Use hash to seed pseudo-random values
        const seed = (hash * (i + 1)) % 2147483647;
        embedding.push(((seed % 1000) / 1000) - 0.5);
      }

      // Normalize
      const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
      return embedding.map(v => v / norm);
    });

    return { embeddings, model: 'mock', dimensions };
  }

  async embedWithOpenAI(texts, model, dimensions, config) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        input: texts,
        model,
        ...(dimensions && { dimensions })
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const embeddings = data.data.map(d => d.embedding);

    return {
      embeddings,
      model,
      dimensions: embeddings[0]?.length || 0
    };
  }

  async embedWithOllama(texts, model, config) {
    const baseUrl = config?.baseUrl || process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

    const embeddings = [];
    for (const text of texts) {
      const response = await fetch(`${baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${await response.text()}`);
      }

      const data = await response.json();
      embeddings.push(data.embedding);
    }

    return {
      embeddings,
      model,
      dimensions: embeddings[0]?.length || 0
    };
  }

  async embedWithService(texts, server) {
    const connector = server?.serviceConnector;
    if (!connector || !connector.hasProvider('embedding')) {
      throw new Error('ServiceConnector embedding provider not available');
    }

    const embeddings = await connector.embed(texts);

    return {
      embeddings: Array.isArray(embeddings[0]) ? embeddings : [embeddings],
      model: 'tei',
      dimensions: embeddings[0]?.length || embeddings.length || 0
    };
  }
}

module.exports = { EmbedTool };
