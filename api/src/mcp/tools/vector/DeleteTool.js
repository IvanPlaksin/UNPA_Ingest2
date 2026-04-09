const { BaseTool } = require('../primitives/BaseTool.js');

class DeleteTool extends BaseTool {
  getDefinition() {
    return {
      id: 'vector.delete',
      name: 'Delete Vectors',
      version: '1.0.0',
      level: 2,
      category: 'vector',
      description: 'Delete vectors from vector store by IDs or filter',
      inputSchema: {
        type: 'object',
        properties: {
          ids: {
            type: 'array',
            items: { type: 'string' },
            description: 'Vector IDs to delete'
          },
          filter: {
            type: 'object',
            description: 'Filter condition for bulk delete'
          },
          collection: { type: 'string', description: 'Collection name (default: main)' },
          provider: {
            type: 'string',
            enum: ['qdrant', 'pinecone', 'milvus', 'mock'],
            default: 'mock',
            description: 'Vector store provider'
          }
        }
      },
      outputSchema: {
        type: 'object',
        properties: {
          deleted: { type: 'integer', description: 'Number of vectors deleted' },
          ids: { type: 'array', items: { type: 'string' } },
          success: { type: 'boolean' }
        }
      },
      safetyLevel: 'REQUIRES_APPROVAL',
      sideEffects: ['WRITE', 'DELETE'],
      resourceEstimate: { maxDurationMs: 10000, maxMemoryMb: 50 }
    };
  }

  async execute(args, context, server) {
    const { ids = [], filter, collection = 'main', provider = 'mock' } = args;

    if (!ids.length && !filter) {
      this.error('INVALID_ARGS', 'Either ids or filter must be provided');
    }

    const vectorProvider = server?.config?.vector?.provider || provider;

    let deleted = 0;
    let deletedIds = [];

    switch (vectorProvider) {
      case 'qdrant':
        ({ deleted, ids: deletedIds } = await this.deleteFromQdrant(ids, filter, collection, server?.config?.vector));
        break;
      case 'pinecone':
        ({ deleted, ids: deletedIds } = await this.deleteFromPinecone(ids, filter, collection, server?.config?.vector));
        break;
      case 'service':
        ({ deleted, ids: deletedIds } = await this.deleteWithService(ids, filter, collection, server));
        break;
      case 'mock':
      default:
        ({ deleted, ids: deletedIds } = this.mockDelete(ids, filter));
        break;
    }

    return this.success({
      deleted,
      ids: deletedIds,
      success: true
    });
  }

  mockDelete(ids, filter) {
    // Mock delete - just return the count
    if (ids.length > 0) {
      return { deleted: ids.length, ids };
    }
    // For filter-based delete, simulate
    return { deleted: 0, ids: [] };
  }

  async deleteFromQdrant(ids, filter, collection, config) {
    const baseUrl = config?.baseUrl || process.env.QDRANT_URL || 'http://localhost:6333';

    let body;
    if (ids.length > 0) {
      body = { points: ids };
    } else if (filter) {
      body = { filter: this.convertToQdrantFilter(filter) };
    }

    const response = await fetch(`${baseUrl}/collections/${collection}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Qdrant delete error: ${await response.text()}`);
    }

    const result = await response.json();
    return {
      deleted: ids.length || result.result?.deleted || 0,
      ids
    };
  }

  async deleteFromPinecone(ids, filter, collection, config) {
    const apiKey = config?.apiKey || process.env.PINECONE_API_KEY;
    const environment = config?.environment || process.env.PINECONE_ENVIRONMENT;

    if (!apiKey || !environment) {
      throw new Error('Pinecone credentials not configured');
    }

    const host = `${collection}-${environment}.svc.pinecone.io`;

    const body = ids.length > 0 ? { ids } : { filter };

    const response = await fetch(`https://${host}/vectors/delete`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`Pinecone delete error: ${await response.text()}`);
    }

    return { deleted: ids.length, ids };
  }

  async deleteWithService(ids, filter, collection, server) {
    const connector = server?.serviceConnector;
    if (!connector || !connector.hasProvider('vector')) {
      throw new Error('ServiceConnector vector provider not available');
    }

    const result = await connector.vectorDelete(collection, ids, filter);
    return {
      deleted: result.deleted || ids.length,
      ids: result.ids || ids
    };
  }

  convertToQdrantFilter(filter) {
    // Convert generic filter to Qdrant format
    const must = [];

    for (const [key, value] of Object.entries(filter)) {
      if (typeof value === 'object' && value !== null) {
        if (value.$eq !== undefined) {
          must.push({ key, match: { value: value.$eq } });
        } else if (value.$in !== undefined) {
          must.push({ key, match: { any: value.$in } });
        } else if (value.$gte !== undefined || value.$lte !== undefined) {
          must.push({ key, range: { gte: value.$gte, lte: value.$lte } });
        }
      } else {
        must.push({ key, match: { value } });
      }
    }

    return { must };
  }
}

module.exports = { DeleteTool };
