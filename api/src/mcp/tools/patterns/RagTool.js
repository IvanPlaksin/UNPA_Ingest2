const { BaseTool } = require('../primitives/BaseTool.js');

class RagTool extends BaseTool {
  getDefinition() {
    return {
      id: 'pattern.rag',
      name: 'RAG Pattern',
      version: '1.0.0',
      level: 3,
      category: 'pattern',
      description: 'Retrieval Augmented Generation - combines vector search with LLM for grounded responses',
      inputSchema: {
        type: 'object',
        required: ['query'],
        properties: {
          query: { type: 'string', description: 'User query' },
          collection: { type: 'string', description: 'Vector collection to search' },
          topK: { type: 'integer', default: 5, description: 'Number of documents to retrieve' },
          scoreThreshold: { type: 'number', default: 0.7, description: 'Minimum similarity score' },
          systemPrompt: { type: 'string', description: 'Custom system prompt' },
          includeContext: { type: 'boolean', default: true, description: 'Include retrieved context in response' },
          provider: { type: 'string', enum: ['openai', 'anthropic', 'ollama', 'mock'], default: 'mock' },
          model: { type: 'string' },
          embeddingProvider: { type: 'string', enum: ['openai', 'ollama', 'mock'], default: 'mock' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          answer: { type: 'string' },
          context: { type: 'array' },
          sources: { type: 'array' },
          confidence: { type: 'number' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 60000, maxMemoryMb: 100 }
    };
  }

  async execute(args, context, server) {
    const {
      query,
      collection = 'default',
      topK = 5,
      scoreThreshold = 0.7,
      systemPrompt,
      includeContext = true,
      provider = 'mock',
      model,
      embeddingProvider = 'mock'
    } = args;

    // Step 1: Generate embedding for query
    const embedTool = server?.registry?.getTool('vector.embed');
    let queryVector;

    if (embedTool) {
      const embedResult = await embedTool.execute({
        text: query,
        provider: embeddingProvider
      }, context, server);
      queryVector = embedResult.data?.embeddings?.[0];
    } else {
      // Mock embedding
      queryVector = this.mockEmbedding(query);
    }

    // Step 2: Search vector store
    const searchTool = server?.registry?.getTool('vector.search');
    let retrievedDocs = [];

    if (searchTool && queryVector) {
      const searchResult = await searchTool.execute({
        collection,
        vector: queryVector,
        limit: topK,
        scoreThreshold,
        withPayload: true
      }, context, server);
      retrievedDocs = searchResult.data?.results || [];
    }

    // Step 3: Build context from retrieved documents
    const contextTexts = retrievedDocs.map(doc => ({
      text: doc.payload?.text || doc.payload?.content || JSON.stringify(doc.payload),
      score: doc.score,
      source: doc.payload?.source || doc.payload?.title || doc.id
    }));

    // Step 4: Generate response with LLM
    const completeTool = server?.registry?.getTool('ai.complete');

    const ragSystemPrompt = systemPrompt || `You are a helpful assistant that answers questions based on the provided context.
If the context doesn't contain relevant information, say so.
Always cite your sources when possible.`;

    const contextBlock = contextTexts.length > 0
      ? `\n\nContext:\n${contextTexts.map((c, i) => `[${i + 1}] ${c.text}`).join('\n\n')}`
      : '\n\nNo relevant context found.';

    const fullPrompt = `${ragSystemPrompt}${contextBlock}\n\nQuestion: ${query}\n\nAnswer:`;

    let answer;
    if (completeTool) {
      const llmResult = await completeTool.execute({
        prompt: fullPrompt,
        provider,
        model,
        maxTokens: 1000,
        temperature: 0.3
      }, context, server);
      answer = llmResult.data?.text || 'Unable to generate response';
    } else {
      answer = this.mockAnswer(query, contextTexts);
    }

    // Calculate overall confidence
    const avgScore = contextTexts.length > 0
      ? contextTexts.reduce((sum, c) => sum + c.score, 0) / contextTexts.length
      : 0;

    return this.success({
      answer,
      ...(includeContext && { context: contextTexts }),
      sources: contextTexts.map(c => c.source),
      confidence: avgScore
    });
  }

  mockEmbedding(text) {
    const embedding = [];
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
    }
    for (let i = 0; i < 384; i++) {
      embedding.push(((hash * (i + 1)) % 1000) / 1000 - 0.5);
    }
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    return embedding.map(v => v / norm);
  }

  mockAnswer(query, contextTexts) {
    if (contextTexts.length === 0) {
      return `I couldn't find specific information about "${query}" in the knowledge base.`;
    }
    return `Based on the retrieved context, here's what I found about "${query}":\n\n` +
      contextTexts.slice(0, 3).map((c, i) => `${i + 1}. ${c.text.substring(0, 200)}...`).join('\n\n') +
      `\n\n[Sources: ${contextTexts.map(c => c.source).join(', ')}]`;
  }
}

module.exports = { RagTool };
