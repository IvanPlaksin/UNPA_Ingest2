/**
 * Hybrid Search Service
 *
 * Combines vector similarity search (Qdrant) with graph traversal (Memgraph)
 * for enhanced retrieval. Uses Reciprocal Rank Fusion (RRF) to merge results.
 *
 * Query Flow:
 * 1. Vector Search → Top-K similar chunks
 * 2. Graph Traversal → Related entities (2-3 hops)
 * 3. RRF Fusion → Merged, deduped, ranked results
 *
 * @module services/retrieval/hybrid-search
 */

const { resultFusion, normalizeResults } = require('./result-fusion');

/**
 * Default search configuration
 */
const DEFAULT_CONFIG = {
  // Vector search settings
  vectorTopK: 10,
  vectorThreshold: 0.7,
  vectorCollection: 'embeddings_unified',

  // Graph search settings
  graphMaxDepth: 2,
  graphMaxResults: 20,
  graphRelationTypes: null, // null = all types

  // Fusion settings
  fusionMethod: 'rrf', // 'rrf', 'linear', 'max'
  vectorWeight: 0.6,
  graphWeight: 0.4,
  rrf_k: 60, // RRF constant

  // Output settings
  maxResults: 15,
  includeMetadata: true,
  deduplicateByContent: true
};

/**
 * HybridSearch class
 */
class HybridSearch {
  /**
   * @param {Object} dependencies - Service dependencies
   * @param {Object} dependencies.qdrantService - Qdrant service instance
   * @param {Object} dependencies.memgraphService - Memgraph service instance
   * @param {Object} dependencies.embeddingService - Embedding service instance
   * @param {Object} config - Search configuration
   */
  constructor(dependencies, config = {}) {
    this.qdrant = dependencies.qdrantService;
    this.memgraph = dependencies.memgraphService;
    this.embedding = dependencies.embeddingService;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Perform hybrid search
   * @param {string} query - Search query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} Search results
   */
  async search(query, options = {}) {
    const opts = { ...this.config, ...options };
    const startTime = Date.now();

    try {
      // Step 1: Generate query embedding
      const queryVector = await this._getQueryEmbedding(query);

      // Step 2: Run parallel searches
      const [vectorResults, graphResults] = await Promise.all([
        this._vectorSearch(queryVector, opts),
        this._graphSearch(query, queryVector, opts)
      ]);

      // Step 3: Fuse results
      const fusedResults = this._fuseResults(vectorResults, graphResults, opts);

      // Step 4: Enrich with metadata
      const enrichedResults = opts.includeMetadata
        ? await this._enrichResults(fusedResults, opts)
        : fusedResults;

      // Step 5: Limit and format
      const finalResults = enrichedResults.slice(0, opts.maxResults);

      return {
        success: true,
        query,
        results: finalResults,
        metadata: {
          totalFound: fusedResults.length,
          vectorHits: vectorResults.length,
          graphHits: graphResults.length,
          fusionMethod: opts.fusionMethod,
          searchTime: Date.now() - startTime
        }
      };
    } catch (error) {
      console.error('Hybrid search error:', error);
      return {
        success: false,
        query,
        results: [],
        error: error.message,
        metadata: { searchTime: Date.now() - startTime }
      };
    }
  }

  /**
   * Search with context expansion
   * @param {string} query - Search query
   * @param {Object} context - Context for expansion
   * @returns {Promise<Object>} Search results with expanded context
   */
  async searchWithContext(query, context = {}) {
    const results = await this.search(query);

    if (!results.success || results.results.length === 0) {
      return results;
    }

    // Expand context for top results
    const expandedResults = await Promise.all(
      results.results.slice(0, 5).map(async (result) => {
        const neighbors = await this._getNeighbors(result.id, {
          maxDepth: 1,
          limit: 5
        });
        return {
          ...result,
          context: {
            neighbors,
            path: result.graphPath || []
          }
        };
      })
    );

    return {
      ...results,
      results: [
        ...expandedResults,
        ...results.results.slice(5)
      ]
    };
  }

  /**
   * Search by entity type
   * @param {string} query - Search query
   * @param {string|Array} entityTypes - Entity type(s) to filter
   * @returns {Promise<Object>} Filtered search results
   */
  async searchByType(query, entityTypes) {
    const types = Array.isArray(entityTypes) ? entityTypes : [entityTypes];

    return this.search(query, {
      vectorFilter: { type: { $in: types } },
      graphNodeTypes: types
    });
  }

  /**
   * Search within a specific layer
   * @param {string} query - Search query
   * @param {string} layer - Layer name (Strategic, Business, Code)
   * @returns {Promise<Object>} Layer-filtered search results
   */
  async searchInLayer(query, layer) {
    const layerTypes = this._getTypesForLayer(layer);
    return this.searchByType(query, layerTypes);
  }

  // ===== Private Methods =====

  /**
   * Get query embedding
   * @private
   */
  async _getQueryEmbedding(query) {
    if (this.embedding && typeof this.embedding.embed === 'function') {
      const result = await this.embedding.embed(query);
      return result.embedding || result;
    }

    // Fallback: use Qdrant's internal embedding if available
    throw new Error('Embedding service not available');
  }

  /**
   * Perform vector similarity search
   * @private
   */
  async _vectorSearch(queryVector, opts) {
    try {
      const results = await this.qdrant.searchSimilar(
        queryVector,
        opts.vectorTopK,
        opts.vectorFilter || {},
        opts.vectorCollection
      );

      return results.map((r, index) => ({
        id: r.id || r.payload?.id,
        content: r.payload?.content || r.payload?.text,
        score: r.score,
        source: 'vector',
        rank: index + 1,
        payload: r.payload,
        type: r.payload?.type || 'unknown'
      }));
    } catch (error) {
      console.error('Vector search error:', error);
      return [];
    }
  }

  /**
   * Perform graph-based search
   * @private
   */
  async _graphSearch(query, queryVector, opts) {
    try {
      // Strategy 1: Keyword-based node matching
      const keywordResults = await this._graphKeywordSearch(query, opts);

      // Strategy 2: Vector-based node finding + graph expansion
      const vectorNodeResults = await this._graphVectorExpansion(queryVector, opts);

      // Combine results
      const combined = [...keywordResults, ...vectorNodeResults];

      // Deduplicate by ID
      const seen = new Set();
      return combined.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    } catch (error) {
      console.error('Graph search error:', error);
      return [];
    }
  }

  /**
   * Keyword-based graph search
   * @private
   */
  async _graphKeywordSearch(query, opts) {
    // Extract keywords (simple approach)
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 5);

    if (keywords.length === 0) return [];

    const cypher = `
      MATCH (n:KnowledgeQuantum)
      WHERE any(kw IN $keywords WHERE
        toLower(n.name) CONTAINS kw OR
        toLower(coalesce(n.title, '')) CONTAINS kw OR
        toLower(coalesce(n.description, '')) CONTAINS kw
      )
      RETURN n, labels(n) as labels
      LIMIT $limit
    `;

    const result = await this.memgraph.executeQuery(cypher, {
      keywords,
      limit: opts.graphMaxResults
    });

    return (result.records || []).map((r, index) => ({
      id: r.get('n').properties.id,
      content: r.get('n').properties.name || r.get('n').properties.title,
      score: 0.5, // Base score for keyword match
      source: 'graph_keyword',
      rank: index + 1,
      type: r.get('labels')[1] || r.get('labels')[0],
      properties: r.get('n').properties
    }));
  }

  /**
   * Vector-based graph expansion
   * @private
   */
  async _graphVectorExpansion(queryVector, opts) {
    // First, find similar nodes via vector search
    const vectorResults = await this.qdrant.searchSimilar(
      queryVector,
      5, // Top 5 for expansion
      {},
      opts.vectorCollection
    );

    if (vectorResults.length === 0) return [];

    // Get IDs of similar nodes
    const seedIds = vectorResults
      .map(r => r.payload?.nodeId || r.payload?.id)
      .filter(Boolean);

    if (seedIds.length === 0) return [];

    // Expand from seed nodes in graph
    const cypher = `
      MATCH (seed:KnowledgeQuantum)
      WHERE seed.id IN $seedIds
      OPTIONAL MATCH path = (seed)-[r*1..${opts.graphMaxDepth}]-(neighbor:KnowledgeQuantum)
      WHERE neighbor.id <> seed.id
      WITH DISTINCT neighbor, length(path) as distance
      RETURN neighbor, labels(neighbor) as labels, distance
      ORDER BY distance
      LIMIT $limit
    `;

    const result = await this.memgraph.executeQuery(cypher, {
      seedIds,
      limit: opts.graphMaxResults
    });

    return (result.records || []).map((r, index) => ({
      id: r.get('neighbor').properties.id,
      content: r.get('neighbor').properties.name || r.get('neighbor').properties.title,
      score: 0.4 / (1 + r.get('distance') * 0.1), // Score decreases with distance
      source: 'graph_expansion',
      rank: index + 1,
      type: r.get('labels')[1] || r.get('labels')[0],
      distance: r.get('distance'),
      properties: r.get('neighbor').properties
    }));
  }

  /**
   * Fuse results from multiple sources
   * @private
   */
  _fuseResults(vectorResults, graphResults, opts) {
    // Normalize scores
    const normalizedVector = normalizeResults(vectorResults, 'score');
    const normalizedGraph = normalizeResults(graphResults, 'score');

    // Apply fusion
    const fused = resultFusion(
      { results: normalizedVector, weight: opts.vectorWeight },
      { results: normalizedGraph, weight: opts.graphWeight },
      {
        method: opts.fusionMethod,
        k: opts.rrf_k,
        deduplicateBy: opts.deduplicateByContent ? 'content' : 'id'
      }
    );

    return fused;
  }

  /**
   * Enrich results with additional metadata
   * @private
   */
  async _enrichResults(results, opts) {
    // Batch fetch additional data from graph
    const ids = results.map(r => r.id).filter(Boolean);

    if (ids.length === 0) return results;

    try {
      const cypher = `
        MATCH (n:KnowledgeQuantum)
        WHERE n.id IN $ids
        OPTIONAL MATCH (n)-[r]->(related)
        RETURN n.id as id, labels(n) as labels,
               collect(DISTINCT {type: type(r), targetId: related.id, targetName: related.name})[0..3] as relations
      `;

      const graphData = await this.memgraph.executeQuery(cypher, { ids });

      const enrichmentMap = {};
      for (const record of graphData.records || []) {
        enrichmentMap[record.get('id')] = {
          labels: record.get('labels'),
          relations: record.get('relations')
        };
      }

      return results.map(r => ({
        ...r,
        labels: enrichmentMap[r.id]?.labels || [],
        relations: enrichmentMap[r.id]?.relations || []
      }));
    } catch (error) {
      console.error('Enrichment error:', error);
      return results;
    }
  }

  /**
   * Get neighbors of a node
   * @private
   */
  async _getNeighbors(nodeId, opts = {}) {
    const cypher = `
      MATCH (n {id: $nodeId})-[r]-(neighbor)
      RETURN neighbor.id as id, neighbor.name as name, type(r) as relation, labels(neighbor) as labels
      LIMIT $limit
    `;

    const result = await this.memgraph.executeQuery(cypher, {
      nodeId,
      limit: opts.limit || 10
    });

    return (result.records || []).map(r => ({
      id: r.get('id'),
      name: r.get('name'),
      relation: r.get('relation'),
      type: r.get('labels')[1] || r.get('labels')[0]
    }));
  }

  /**
   * Get entity types for a layer
   * @private
   */
  _getTypesForLayer(layer) {
    const layerTypes = {
      Strategic: ['Epic', 'Feature', 'BusinessRule', 'Concept', 'Strategy', 'Goal', 'KPI'],
      Business: ['WorkItem', 'Task', 'Bug', 'UserStory', 'Document', 'Person', 'Team', 'Organization', 'Process'],
      Code: ['File', 'Class', 'Interface', 'Function', 'Method', 'Module', 'Commit', 'Changeset', 'Component']
    };

    return layerTypes[layer] || [];
  }
}

/**
 * Create hybrid search instance
 * @param {Object} dependencies - Service dependencies
 * @param {Object} config - Configuration
 * @returns {HybridSearch} Search instance
 */
function createHybridSearch(dependencies, config = {}) {
  return new HybridSearch(dependencies, config);
}

module.exports = {
  HybridSearch,
  createHybridSearch,
  DEFAULT_CONFIG
};
