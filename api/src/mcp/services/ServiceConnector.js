/**
 * ServiceConnector - Unified interface for external services
 * Provides real provider connections for MCP tools
 */

class ServiceConnector {
  constructor(config = {}) {
    this.config = config;
    this.providers = new Map();
    this.initialized = false;
  }

  /**
   * Initialize all service connections
   * @param {object} options - Connection options
   */
  async init(options = {}) {
    const { llm = true, vector = true, graph = true, embedding = true } = options;

    if (llm) {
      await this.initLLM();
    }
    if (embedding) {
      await this.initEmbedding();
    }
    if (vector) {
      await this.initVector();
    }
    if (graph) {
      await this.initGraph();
    }

    this.initialized = true;
    return this;
  }

  /**
   * Initialize LLM provider
   */
  async initLLM() {
    try {
      const llmService = require('../../services/llm.service');
      this.providers.set('llm', {
        type: 'llm',
        service: llmService,
        status: 'connected',
        capabilities: ['chat', 'stream', 'tools']
      });
      console.log('[ServiceConnector] LLM provider initialized');
    } catch (error) {
      this.providers.set('llm', {
        type: 'llm',
        service: null,
        status: 'error',
        error: error.message
      });
      console.warn('[ServiceConnector] LLM provider failed:', error.message);
    }
  }

  /**
   * Initialize Embedding provider
   */
  async initEmbedding() {
    try {
      const teiService = require('../../services/tei.service');
      this.providers.set('embedding', {
        type: 'embedding',
        service: teiService,
        status: 'connected',
        capabilities: ['embed', 'batch']
      });
      console.log('[ServiceConnector] Embedding provider initialized');
    } catch (error) {
      this.providers.set('embedding', {
        type: 'embedding',
        service: null,
        status: 'error',
        error: error.message
      });
      console.warn('[ServiceConnector] Embedding provider failed:', error.message);
    }
  }

  /**
   * Initialize Vector DB provider
   */
  async initVector() {
    try {
      const qdrantService = require('../../services/qdrant.service');
      await qdrantService.initCollection();
      this.providers.set('vector', {
        type: 'vector',
        service: qdrantService,
        status: 'connected',
        capabilities: ['search', 'upsert', 'delete']
      });
      console.log('[ServiceConnector] Vector provider initialized');
    } catch (error) {
      this.providers.set('vector', {
        type: 'vector',
        service: null,
        status: 'error',
        error: error.message
      });
      console.warn('[ServiceConnector] Vector provider failed:', error.message);
    }
  }

  /**
   * Initialize Graph DB provider
   */
  async initGraph() {
    try {
      const neo4jService = require('../../services/neo4j.service');
      this.providers.set('graph', {
        type: 'graph',
        service: neo4jService,
        status: 'connected',
        capabilities: ['query', 'write', 'traverse']
      });
      console.log('[ServiceConnector] Graph provider initialized');
    } catch (error) {
      this.providers.set('graph', {
        type: 'graph',
        service: null,
        status: 'error',
        error: error.message
      });
      console.warn('[ServiceConnector] Graph provider failed:', error.message);
    }
  }

  /**
   * Get a provider by type
   * @param {string} type - Provider type
   * @returns {object|null}
   */
  getProvider(type) {
    return this.providers.get(type)?.service || null;
  }

  /**
   * Check if provider is available
   * @param {string} type - Provider type
   * @returns {boolean}
   */
  hasProvider(type) {
    const provider = this.providers.get(type);
    return provider?.status === 'connected';
  }

  /**
   * Get provider status
   * @returns {object}
   */
  getStatus() {
    const status = {};
    for (const [key, value] of this.providers) {
      status[key] = {
        status: value.status,
        capabilities: value.capabilities || [],
        error: value.error
      };
    }
    return status;
  }

  // ============================================
  // LLM Operations
  // ============================================

  /**
   * Chat completion
   * @param {Array} messages - Chat messages
   * @param {object} options - Options
   */
  async chat(messages, options = {}) {
    const llm = this.getProvider('llm');
    if (!llm) {
      throw new Error('LLM provider not available');
    }

    const { tools = [], stream = false, onChunk } = options;

    if (stream && onChunk) {
      await llm.streamChat(messages, onChunk);
      return { streamed: true };
    }

    return llm.chat(messages, tools);
  }

  /**
   * Generate text completion
   * @param {string} prompt - Prompt text
   * @param {object} options - Options
   */
  async complete(prompt, options = {}) {
    const messages = [{ role: 'user', content: prompt }];

    if (options.systemPrompt) {
      messages.unshift({ role: 'system', content: options.systemPrompt });
    }

    return this.chat(messages, options);
  }

  // ============================================
  // Embedding Operations
  // ============================================

  /**
   * Generate embeddings
   * @param {string|string[]} texts - Text(s) to embed
   */
  async embed(texts) {
    const embedding = this.getProvider('embedding');
    if (!embedding) {
      throw new Error('Embedding provider not available');
    }

    const inputTexts = Array.isArray(texts) ? texts : [texts];
    const embeddings = await embedding.getEmbeddings(inputTexts);

    return Array.isArray(texts) ? embeddings : embeddings[0];
  }

  // ============================================
  // Vector Operations
  // ============================================

  /**
   * Search similar vectors
   * @param {number[]} vector - Query vector
   * @param {object} options - Search options
   */
  async vectorSearch(vector, options = {}) {
    const qdrant = this.getProvider('vector');
    if (!qdrant) {
      throw new Error('Vector provider not available');
    }

    const { limit = 5, filter = null, namespace = null } = options;
    return qdrant.searchSimilar(vector, limit, filter, namespace);
  }

  /**
   * Upsert vectors
   * @param {Array} points - Points to upsert
   * @param {string} namespace - Optional namespace
   */
  async vectorUpsert(points, namespace = null) {
    const qdrant = this.getProvider('vector');
    if (!qdrant) {
      throw new Error('Vector provider not available');
    }

    return qdrant.upsertPoints(points, namespace);
  }

  /**
   * Semantic search (text -> embed -> search)
   * @param {string} query - Search query
   * @param {object} options - Options
   */
  async semanticSearch(query, options = {}) {
    const vector = await this.embed(query);
    return this.vectorSearch(vector, options);
  }

  // ============================================
  // Graph Operations
  // ============================================

  /**
   * Execute Cypher query
   * @param {string} query - Cypher query
   * @param {object} params - Query parameters
   */
  async graphQuery(query, params = {}) {
    const neo4j = this.getProvider('graph');
    if (!neo4j) {
      throw new Error('Graph provider not available');
    }

    const session = neo4j.getSession();
    try {
      const result = await session.run(query, params);
      return this.formatGraphResult(result);
    } finally {
      await session.close();
    }
  }

  /**
   * Format Neo4j result to standard format
   * @param {object} result - Neo4j result
   */
  formatGraphResult(result) {
    const records = result.records.map(record => {
      const obj = {};
      record.keys.forEach((key, i) => {
        const value = record.get(key);
        obj[key] = this.convertNeo4jValue(value);
      });
      return obj;
    });

    return {
      records,
      summary: {
        counters: result.summary?.counters?.updates() || {},
        queryType: result.summary?.queryType
      }
    };
  }

  /**
   * Convert Neo4j values to plain objects
   * @param {any} value - Neo4j value
   */
  convertNeo4jValue(value) {
    if (value === null || value === undefined) return value;

    // Node
    if (value.labels && value.properties) {
      return {
        id: value.identity?.toString(),
        labels: value.labels,
        properties: value.properties
      };
    }

    // Relationship
    if (value.type && value.start && value.end) {
      return {
        id: value.identity?.toString(),
        type: value.type,
        start: value.start?.toString(),
        end: value.end?.toString(),
        properties: value.properties
      };
    }

    // Integer
    if (value.toNumber) {
      return value.toNumber();
    }

    return value;
  }

  /**
   * Close all connections
   */
  async close() {
    const neo4j = this.getProvider('graph');
    if (neo4j) {
      await neo4j.close();
    }
    this.providers.clear();
    this.initialized = false;
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create ServiceConnector instance
 * @param {object} config - Configuration
 * @returns {ServiceConnector}
 */
function getServiceConnector(config = {}) {
  if (!instance) {
    instance = new ServiceConnector(config);
  }
  return instance;
}

module.exports = {
  ServiceConnector,
  getServiceConnector
};
