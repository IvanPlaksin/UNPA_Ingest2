/**
 * =============================================================================
 * KB (KNOWLEDGE BASE) DATASOURCE EXECUTOR
 *
 * Executor for loading data from the Knowledge Base:
 *   - Memgraph (Cypher queries)
 *   - Qdrant  (Vector / semantic search)
 * =============================================================================
 */

const { BaseDataSourceExecutor } = require('./base-datasource.executor');
const neo4j = require('neo4j-driver');

class KBDataSourceExecutor extends BaseDataSourceExecutor {
  constructor(options = {}) {
    super(options);
    this.memgraph = options.memgraph || null;   // Memgraph service (runQuery)
    this.qdrant = options.qdrant || null;       // Qdrant client
    this.embedder = options.embedder || null;   // Embedding service (text → vector)
  }

  setMemgraph(memgraph) { this.memgraph = memgraph; return this; }
  setQdrant(qdrant)     { this.qdrant = qdrant;     return this; }
  setEmbedder(embedder) { this.embedder = embedder;  return this; }

  // ---------------------------------------------------------------------------
  // Operations — dispatch by queryType (cypher | vector)
  // ---------------------------------------------------------------------------

  async loadAll(config, params = {}) {
    this.validateConfig(config);
    const queryType = config.kbConfig?.queryType || 'cypher';
    if (queryType === 'cypher' || queryType === 'list') return this._loadAllCypher(config, params);
    if (queryType === 'vector') return this._loadAllVector(config, params);
    throw new Error(`Unsupported KB queryType: ${queryType}`);
  }

  async search(config, params = {}) {
    this.validateConfig(config);
    const { query: searchText } = params;
    if (!searchText || searchText.length < 1) return { items: [], total: 0 };

    const queryType = config.kbConfig?.queryType || 'cypher';
    if (queryType === 'cypher' || queryType === 'list') return this._searchCypher(config, params);
    if (queryType === 'vector') return this._searchVector(config, params);
    throw new Error(`Unsupported KB queryType: ${queryType}`);
  }

  async getById(config, params = {}) {
    this.validateConfig(config);
    if (!params.id) throw new Error('id is required for getById');

    const queryType = config.kbConfig?.queryType || 'cypher';
    if (queryType === 'vector') return this._getByIdVector(config, params);
    return this._getByIdCypher(config, params);
  }

  async count(config, params = {}) {
    this.validateConfig(config);
    const queryType = config.kbConfig?.queryType || 'cypher';
    if (queryType === 'vector') return this._countVector(config, params);
    return this._countCypher(config, params);
  }

  async validate(config, params = {}) {
    this.validateConfig(config);
    if (params.value === undefined) throw new Error('value is required for validate');

    const queryType = config.kbConfig?.queryType || 'cypher';
    if (queryType === 'vector') {
      const result = await this._getByIdVector(config, { id: params.value });
      return result !== null;
    }
    const result = await this._getByIdCypher(config, { id: params.value });
    return result !== null;
  }

  // ---------------------------------------------------------------------------
  // Cypher Implementation
  // ---------------------------------------------------------------------------

  async _loadAllCypher(config, params) {
    if (!this.memgraph) throw new Error('Memgraph service not configured');

    return this.withCache(config, 'loadAll', params, async () => {
      const { limit, offset } = this.applyLimits(params, config);
      const kbConfig = config.kbConfig || {};

      let query = kbConfig.cypherQuery;
      if (!query) throw new Error('cypherQuery is required for Cypher loadAll');

      // Append pagination if not already present
      if (!query.toLowerCase().includes('skip') && !query.toLowerCase().includes('limit')) {
        query = `${query} SKIP $offset LIMIT $limit`;
      }

      const queryParams = { ...params.filters, offset: neo4j.int(offset), limit: neo4j.int(limit) };
      if (kbConfig.namespace) queryParams.namespace = kbConfig.namespace;

      const result = await this.memgraph.runQuery(query, queryParams);
      const items = this.transformOutput(result, config);
      const total = await this._countCypher(config, params);

      return { items, total };
    });
  }

  async _searchCypher(config, params) {
    if (!this.memgraph) throw new Error('Memgraph service not configured');

    const { query: searchText, limit = 10 } = params;
    const kbConfig = config.kbConfig || {};

    let query = kbConfig.cypherSearchQuery;
    if (!query) {
      const labelField = config.config?.labelField || 'name';
      query = `
        MATCH (n)
        WHERE n.${labelField} =~ $searchPattern
        RETURN n
        LIMIT $limit
      `;
    }

    const queryParams = {
      ...params.filters,
      search: searchText,
      searchPattern: `(?i).*${this._escapeRegex(searchText)}.*`,
      limit: neo4j.int(Math.min(limit, config.config?.maxLimit || 100)),
    };
    if (kbConfig.namespace) queryParams.namespace = kbConfig.namespace;

    const result = await this.memgraph.runQuery(query, queryParams);
    const items = this.transformOutput(result, config);

    return { items, total: items.length };
  }

  async _getByIdCypher(config, params) {
    if (!this.memgraph) throw new Error('Memgraph service not configured');

    const { id } = params;
    const valueField = config.config?.valueField || 'id';

    const result = await this.memgraph.runQuery(
      `MATCH (n) WHERE n.${valueField} = $id RETURN n LIMIT 1`,
      { id },
    );

    if (result.length === 0) return null;
    const items = this.transformOutput(result, config);
    return items[0];
  }

  async _countCypher(config, params) {
    if (!this.memgraph) throw new Error('Memgraph service not configured');

    const kbConfig = config.kbConfig || {};
    let countQuery = kbConfig.cypherCountQuery;

    if (!countQuery) {
      const baseQuery = kbConfig.cypherQuery || 'MATCH (n) RETURN n';
      countQuery = baseQuery.replace(/RETURN\s+.+$/i, 'RETURN count(*) as total');
      countQuery = countQuery.replace(/SKIP\s+\$?\w+/gi, '');
      countQuery = countQuery.replace(/LIMIT\s+\$?\w+/gi, '');
    }

    const queryParams = { ...params.filters };
    if (kbConfig.namespace) queryParams.namespace = kbConfig.namespace;

    const result = await this.memgraph.runQuery(countQuery, queryParams);
    return result[0]?.total || 0;
  }

  // ---------------------------------------------------------------------------
  // Vector (Qdrant) Implementation
  // ---------------------------------------------------------------------------

  async _loadAllVector(config, params) {
    if (!this.qdrant) throw new Error('Qdrant client not configured');

    return this.withCache(config, 'loadAll', params, async () => {
      const { limit, offset } = this.applyLimits(params, config);
      const collection = config.kbConfig?.collection;
      if (!collection) throw new Error('collection is required for Vector loadAll');

      const result = await this.qdrant.scroll(collection, {
        limit, offset, with_payload: true, with_vector: false,
      });

      const items = this.transformOutput(
        result.points.map(p => ({ id: p.id, ...p.payload })),
        config,
      );
      const total = await this._countVector(config, params);

      return { items, total };
    });
  }

  async _searchVector(config, params) {
    if (!this.qdrant) throw new Error('Qdrant client not configured');
    if (!this.embedder) throw new Error('Embedder service not configured for vector search');

    const { query: searchText, limit = 10 } = params;
    const kbConfig = config.kbConfig || {};
    const collection = kbConfig.collection;
    if (!collection) throw new Error('collection is required for Vector search');

    const vector = await this.embedder.embed(searchText);

    const result = await this.qdrant.search(collection, {
      vector,
      limit: Math.min(limit, config.config?.maxLimit || 100),
      score_threshold: kbConfig.similarityThreshold || 0.7,
      with_payload: true,
    });

    const items = this.transformOutput(
      result.map(r => ({ id: r.id, score: r.score, ...r.payload })),
      config,
    );

    return { items, total: items.length };
  }

  async _getByIdVector(config, params) {
    if (!this.qdrant) throw new Error('Qdrant client not configured');

    const { id } = params;
    const collection = config.kbConfig?.collection;
    if (!collection) throw new Error('collection is required for Vector getById');

    try {
      const result = await this.qdrant.retrieve(collection, {
        ids: [id], with_payload: true, with_vector: false,
      });

      if (result.length === 0) return null;
      const items = this.transformOutput(
        [{ id: result[0].id, ...result[0].payload }],
        config,
      );
      return items[0];
    } catch (err) {
      if (err.message?.includes('not found')) return null;
      throw err;
    }
  }

  async _countVector(config, params) {
    if (!this.qdrant) throw new Error('Qdrant client not configured');

    const collection = config.kbConfig?.collection;
    if (!collection) throw new Error('collection is required for Vector count');

    const info = await this.qdrant.getCollection(collection);
    return info.points_count || 0;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}

module.exports = { KBDataSourceExecutor };
