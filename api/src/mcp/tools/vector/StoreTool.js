const { BaseTool } = require('../primitives/BaseTool.js');
const { v4: uuidv4 } = require('uuid');

class StoreTool extends BaseTool {
  getDefinition() {
    return {
      id: 'vector.store',
      name: 'Store Vectors',
      version: '1.0.0',
      level: 2,
      category: 'vector',
      description: 'Store vectors with metadata in a vector store (Qdrant)',
      inputSchema: {
        type: 'object',
        required: ['collection', 'points'],
        properties: {
          collection: { type: 'string', description: 'Collection name' },
          points: {
            type: 'array',
            items: {
              type: 'object',
              required: ['vector'],
              properties: {
                id: { type: 'string', description: 'Point ID (auto-generated if not provided)' },
                vector: { type: 'array', items: { type: 'number' } },
                payload: { type: 'object', description: 'Metadata to store with vector' }
              }
            },
            description: 'Points to store'
          },
          createCollection: { type: 'boolean', default: true, description: 'Create collection if not exists' },
          vectorSize: { type: 'integer', description: 'Vector dimensions (required for new collection)' }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          stored: { type: 'integer' },
          ids: { type: 'array', items: { type: 'string' } },
          collection: { type: 'string' }
        }
      },
      safetyLevel: 'AUTO',
      sideEffects: ['WRITE', 'EXTERNAL_CALL'],
      resourceEstimate: { maxDurationMs: 10000, maxMemoryMb: 100 }
    };
  }

  async execute(args, context, server) {
    const { collection, points, createCollection = true, vectorSize } = args;

    const qdrantUrl = server?.config?.qdrant?.url || process.env.QDRANT_URL || 'http://localhost:6333';

    try {
      // Check if collection exists
      if (createCollection) {
        const collectionExists = await this.checkCollection(qdrantUrl, collection);
        if (!collectionExists) {
          const size = vectorSize || points[0]?.vector?.length;
          if (!size) {
            throw new Error('vectorSize required for creating new collection');
          }
          await this.createCollection(qdrantUrl, collection, size);
        }
      }

      // Prepare points with IDs
      const preparedPoints = points.map(p => ({
        id: p.id || uuidv4(),
        vector: p.vector,
        payload: p.payload || {}
      }));

      // Upsert points
      const response = await fetch(`${qdrantUrl}/collections/${collection}/points?wait=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: preparedPoints })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Qdrant store error: ${error}`);
      }

      return this.success({
        stored: preparedPoints.length,
        ids: preparedPoints.map(p => String(p.id)),
        collection
      });
    } catch (error) {
      if (error.message.includes('ECONNREFUSED')) {
        return this.error('CONNECTION_ERROR', 'Vector store not available');
      }
      throw error;
    }
  }

  async checkCollection(qdrantUrl, collection) {
    try {
      const response = await fetch(`${qdrantUrl}/collections/${collection}`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async createCollection(qdrantUrl, collection, vectorSize) {
    const response = await fetch(`${qdrantUrl}/collections/${collection}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: {
          size: vectorSize,
          distance: 'Cosine'
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create collection: ${error}`);
    }
  }
}

module.exports = { StoreTool };
