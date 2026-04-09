const { BaseTool } = require('../primitives/BaseTool.js');

class SearchTool extends BaseTool {
  getDefinition() {
    return {
      id: 'vector.search',
      name: 'Vector Search',
      version: '1.0.0',
      level: 2,
      category: 'vector',
      description: 'Search for similar vectors in a vector store (Qdrant)',
      inputSchema: {
        type: 'object',
        required: ['collection', 'vector'],
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          vector: { type: 'array', items: { type: 'number' }, description: 'Query vector' },
          limit: { type: 'integer', default: 10, description: 'Maximum results' },
          scoreThreshold: { type: 'number', description: 'Minimum similarity score' },
          filter: { type: 'object', description: 'Metadata filter' },
          withPayload: { type: 'boolean', default: true, description: 'Include payload in results' },
          withVector: { type: 'boolean', default: false, description: 'Include vectors in results' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          results: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                score: { type: 'number' },
                payload: { type: 'object' },
                vector: { type: 'array', items: { type: 'number' } }
              }
            }
          },
          count: { type: 'integer' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 5000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const {
      collection,
      vector,
      limit = 10,
      scoreThreshold,
      filter,
      withPayload = true,
      withVector = false
    } = args;

    const qdrantUrl = server?.config?.qdrant?.url || process.env.QDRANT_URL || 'http://localhost:6333';

    try {
      const searchBody = {
        vector,
        limit,
        with_payload: withPayload,
        with_vector: withVector
      };

      if (scoreThreshold !== undefined) {
        searchBody.score_threshold = scoreThreshold;
      }

      if (filter) {
        searchBody.filter = this.buildQdrantFilter(filter);
      }

      const response = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchBody)
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Qdrant search error: ${error}`);
      }

      const data = await response.json();
      const results = (data.result || []).map(r => ({
        id: String(r.id),
        score: r.score,
        ...(withPayload && { payload: r.payload }),
        ...(withVector && { vector: r.vector })
      }));

      return this.success({ results, count: results.length });
    } catch (error) {
      // If Qdrant is not available, return empty results
      if (error.message.includes('ECONNREFUSED')) {
        return this.success({ results: [], count: 0, warning: 'Vector store not available' });
      }
      throw error;
    }
  }

  buildQdrantFilter(filter) {
    // Convert simple filter object to Qdrant filter format
    // { field: value } -> { must: [{ key: field, match: { value } }] }
    const conditions = [];

    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null) {
        // Complex filter: { $gt, $lt, $in, etc. }
        if ('$gt' in value) {
          conditions.push({ key, range: { gt: value.$gt } });
        } else if ('$gte' in value) {
          conditions.push({ key, range: { gte: value.$gte } });
        } else if ('$lt' in value) {
          conditions.push({ key, range: { lt: value.$lt } });
        } else if ('$lte' in value) {
          conditions.push({ key, range: { lte: value.$lte } });
        } else if ('$in' in value) {
          conditions.push({ key, match: { any: value.$in } });
        } else if ('$ne' in value) {
          // Not equal - use must_not
          return { must_not: [{ key, match: { value: value.$ne } }] };
        }
      } else {
        // Simple equality
        conditions.push({ key, match: { value } });
      }
    }

    return conditions.length > 0 ? { must: conditions } : {};
  }
}

module.exports = { SearchTool };
