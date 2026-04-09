const { BaseTool } = require('../primitives/BaseTool.js');

class BatchEmbedTool extends BaseTool {
  getDefinition() {
    return {
      id: 'vector.batch_embed',
      name: 'Batch Embed and Store',
      version: '1.0.0',
      level: 2,
      category: 'vector',
      description: 'Embed multiple texts and store them in vector database with metadata',
      inputSchema: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'text'],
              properties: {
                id: { type: 'string', description: 'Unique identifier' },
                text: { type: 'string', description: 'Text to embed' },
                metadata: { type: 'object', description: 'Additional metadata' }
              }
            },
            description: 'Items to embed and store'
          },
          collection: { type: 'string', default: 'main', description: 'Collection name' },
          batchSize: { type: 'integer', default: 100, description: 'Items per batch' },
          provider: {
            type: 'string',
            enum: ['openai', 'ollama', 'service', 'mock'],
            default: 'mock'
          },
          model: { type: 'string', description: 'Embedding model' },
          upsert: { type: 'boolean', default: true, description: 'Update if exists' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          processed: { type: 'integer' },
          stored: { type: 'integer' },
          failed: { type: 'integer' },
          errors: { type: 'array', items: { type: 'object' } },
          dimensions: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 300000, maxMemoryMb: 500 }
    };
  }

  async execute(args, context, server) {
    const {
      items,
      collection = 'main',
      batchSize = 100,
      provider = 'mock',
      model,
      upsert = true
    } = args;

    let processed = 0;
    let stored = 0;
    let failed = 0;
    const errors = [];
    let dimensions = 0;

    // Process in batches
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      try {
        // Generate embeddings for batch
        const texts = batch.map(item => item.text);
        const embedResult = await this.embedBatch(texts, provider, model, server);

        dimensions = embedResult.dimensions;

        // Prepare points for storage
        const points = batch.map((item, idx) => ({
          id: item.id,
          vector: embedResult.embeddings[idx],
          payload: {
            text: item.text.substring(0, 1000), // Store truncated text
            ...item.metadata,
            embeddedAt: new Date().toISOString()
          }
        }));

        // Store in vector DB
        await this.storePoints(points, collection, upsert, server);

        stored += batch.length;
        processed += batch.length;

      } catch (error) {
        failed += batch.length;
        errors.push({
          batchStart: i,
          batchEnd: i + batch.length,
          error: error.message
        });
      }
    }

    return this.success({
      processed,
      stored,
      failed,
      errors: errors.length > 0 ? errors : undefined,
      dimensions
    });
  }

  async embedBatch(texts, provider, model, server) {
    const embedProvider = server?.config?.embedding?.provider || provider;

    switch (embedProvider) {
      case 'openai':
        return this.embedWithOpenAI(texts, model || 'text-embedding-3-small', server?.config?.embedding);
      case 'ollama':
        return this.embedWithOllama(texts, model || 'nomic-embed-text', server?.config?.embedding);
      case 'service':
        return this.embedWithService(texts, server);
      case 'mock':
      default:
        return this.mockEmbed(texts);
    }
  }

  mockEmbed(texts, dimensions = 384) {
    const embeddings = texts.map(text => {
      const embedding = [];
      let hash = 0;
      for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash) + text.charCodeAt(i);
        hash = hash & hash;
      }

      for (let i = 0; i < dimensions; i++) {
        const seed = (hash * (i + 1)) % 2147483647;
        embedding.push(((seed % 1000) / 1000) - 0.5);
      }

      const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
      return embedding.map(v => v / norm);
    });

    return { embeddings, dimensions };
  }

  async embedWithOpenAI(texts, model, config) {
    const apiKey = config?.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ input: texts, model })
    });

    if (!response.ok) throw new Error(`OpenAI API error: ${await response.text()}`);

    const data = await response.json();
    const embeddings = data.data.map(d => d.embedding);

    return { embeddings, dimensions: embeddings[0]?.length || 0 };
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

      if (!response.ok) throw new Error(`Ollama API error: ${await response.text()}`);

      const data = await response.json();
      embeddings.push(data.embedding);
    }

    return { embeddings, dimensions: embeddings[0]?.length || 0 };
  }

  async embedWithService(texts, server) {
    const connector = server?.serviceConnector;
    if (!connector || !connector.hasProvider('embedding')) {
      throw new Error('ServiceConnector embedding provider not available');
    }

    const embeddings = await connector.embed(texts);
    return {
      embeddings: Array.isArray(embeddings[0]) ? embeddings : [embeddings],
      dimensions: embeddings[0]?.length || embeddings.length || 0
    };
  }

  async storePoints(points, collection, upsert, server) {
    const vectorProvider = server?.config?.vector?.provider || 'mock';

    switch (vectorProvider) {
      case 'qdrant':
        return this.storeInQdrant(points, collection, upsert, server?.config?.vector);
      case 'service':
        return this.storeWithService(points, collection, upsert, server);
      case 'mock':
      default:
        return { stored: points.length };
    }
  }

  async storeInQdrant(points, collection, upsert, config) {
    const baseUrl = config?.baseUrl || process.env.QDRANT_URL || 'http://localhost:6333';

    // Ensure collection exists
    try {
      await fetch(`${baseUrl}/collections/${collection}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vectors: { size: points[0].vector.length, distance: 'Cosine' }
        })
      });
    } catch (e) {
      // Collection might already exist
    }

    const response = await fetch(`${baseUrl}/collections/${collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: points.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload
        }))
      })
    });

    if (!response.ok) throw new Error(`Qdrant store error: ${await response.text()}`);

    return { stored: points.length };
  }

  async storeWithService(points, collection, upsert, server) {
    const connector = server?.serviceConnector;
    if (!connector || !connector.hasProvider('vector')) {
      throw new Error('ServiceConnector vector provider not available');
    }

    await connector.vectorUpsert(collection, points);
    return { stored: points.length };
  }
}

module.exports = { BatchEmbedTool };
