/**
 * Vector Search Executor — searches a Qdrant vector collection
 */

const { BaseExecutor } = require('../../plugin-base');

class VectorSearchExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'vector.search';
    this.displayName = 'Vector Search';
    this.description = 'Searches a Qdrant vector collection for similar documents';
    this.domain = 'common';

    this.parameterSchema = {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query text' },
        collection: { type: 'string', description: 'Qdrant collection name' },
        limit: { type: 'number', default: 5, description: 'Maximum number of results' },
        filter: { type: 'object', description: 'Optional Qdrant filter object' },
      },
      required: ['query', 'collection'],
    };
  }

  async execute(parameters, context) {
    const query = this.getRequiredParam(parameters, 'query');
    const collection = this.getRequiredParam(parameters, 'collection');
    const limit = this.getParam(parameters, 'limit', 5);
    const filter = this.getParam(parameters, 'filter', null);
    const mockResults = this.getParam(parameters, 'mock_results', undefined);

    // Return mock results if provided
    if (mockResults !== undefined) {
      return this.success(
        { results: mockResults, count: mockResults.length, collection },
        { query, limit, mock: true },
        0.9,
      );
    }

    try {
      const qdrantService = require('../../../../../services/qdrant.service');

      // First embed the query text using TEI
      let vector;
      try {
        const teiService = require('../../../../../services/tei.service');
        const embedding = await teiService.getEmbedding(query);
        vector = embedding;
      } catch (embedError) {
        return this.error('EMBEDDING_ERROR', `Failed to embed query: ${embedError.message}`, true);
      }

      const results = await qdrantService.searchSimilar(vector, limit, filter, collection);

      return this.success(
        {
          results: results || [],
          count: results ? results.length : 0,
          collection,
        },
        { query, limit },
        1.0,
      );
    } catch (error) {
      // Graceful degradation: return empty results on error
      return this.success(
        { results: [], count: 0, collection },
        { query, limit, error: error.message },
        0.3,
      );
    }
  }
}

module.exports = { VectorSearchExecutor };
