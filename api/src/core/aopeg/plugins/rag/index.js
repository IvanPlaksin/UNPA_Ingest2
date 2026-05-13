/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RAG PLUGIN INDEX
 * Main entry point for RAG (Retrieval-Augmented Generation) domain plugin
 *
 * Phase 7 - Domain Plugin with real service implementations:
 * - vector_search: QdrantService for semantic vector search
 * - graph_search: MemgraphService for graph traversal
 * - assemble_context: Context assembly from multiple sources
 * - generate: LLM response generation with context
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { PluginBase, createSimpleExecutor, createSuccessResult, createErrorResult } = require('../plugin-base');

// Import real services
const qdrantService = require('../../../../services/qdrant.service');
const memgraphService = require('../../../../services/memgraph.service');
const { getInstance: getLLMProvider } = require('../../../../services/llm/LLMProviderService');
const { EmbeddingService } = require('../../../../services/structuring/embeddings/EmbeddingService');
const { HybridSearch, createHybridSearch } = require('../../../../services/retrieval/hybrid-search');
const { QueryExpansionService, createQueryExpansionService } = require('../../../../services/retrieval/query-expansion.service');

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN METADATA
// ────────────────────────────────────────────────────────────────────────────

const PLUGIN_METADATA = {
  name: 'rag',
  version: '2.0.0',
  description: 'Retrieval-Augmented Generation pipeline executors (Phase 7)',
  author: 'UNPA Team',
  domain: 'rag',
};

// ────────────────────────────────────────────────────────────────────────────
// SERVICE INSTANCES (lazy initialized)
// ────────────────────────────────────────────────────────────────────────────

let embeddingServiceInstance = null;
let hybridSearchInstance = null;
let queryExpansionInstance = null;

function getEmbeddingService() {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService({
      teiUrl: process.env.TEI_URL || 'http://localhost:8081',
      qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      dimension: 1024,
      batchSize: 32,
      enableCache: true,
    });
  }
  return embeddingServiceInstance;
}

function getHybridSearch() {
  if (!hybridSearchInstance) {
    hybridSearchInstance = createHybridSearch({
      qdrantService,
      memgraphService,
      embeddingService: getEmbeddingService(),
    });
  }
  return hybridSearchInstance;
}

function getQueryExpansion() {
  if (!queryExpansionInstance) {
    queryExpansionInstance = createQueryExpansionService({
      maxExpansions: 5,
      maxSynonymsPerTerm: 3,
      llmService: getLLMProvider(),
    });
  }
  return queryExpansionInstance;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: EXPAND QUERY
// ────────────────────────────────────────────────────────────────────────────

const expandQueryExecutor = createSimpleExecutor({
  type: 'rag.expand_query',
  displayName: 'Expand Query',
  description: 'Expand query with synonyms and UN-specific terms',
  domain: 'rag',
  parameterSchema: {
    type: 'object',
    properties: {
      includeSynonyms: { type: 'boolean', default: true },
      includeUNTerms: { type: 'boolean', default: true },
      includeRelatedSystems: { type: 'boolean', default: true },
      generateRelated: {
        type: 'boolean',
        default: false,
        description: 'Use LLM to generate related queries (requires LLM provider)'
      },
    },
  },
  async execute(params, context) {
    try {
      const query = params.query || context.input?.query || context.input;

      if (!query || typeof query !== 'string') {
        return createErrorResult('EXPAND_ERROR', 'No query provided', true);
      }

      const expansionService = getQueryExpansion();
      const result = await expansionService.expand(query, {
        includeSynonyms: params.includeSynonyms !== false,
        includeUNTerms: params.includeUNTerms !== false,
        includeRelatedSystems: params.includeRelatedSystems !== false,
        generateRelated: params.generateRelated === true,
      });

      return createSuccessResult({
        originalQuery: result.original,
        expandedQuery: result.expanded,
        terms: result.terms,
        synonyms: result.synonyms,
        systemExpansions: result.systemExpansions,
        unEntities: result.unEntities,
        relatedSystems: result.relatedSystems,
        relatedQueries: result.relatedQueries || [],
      }, {
        termCount: result.metadata.termCount,
        synonymCount: result.metadata.synonymCount,
        expansionRatio: result.metadata.expansionRatio,
        relatedQueriesGenerated: (result.relatedQueries || []).length,
      }, 1.0);

    } catch (error) {
      return createErrorResult('EXPAND_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: VECTOR SEARCH (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const vectorSearchExecutor = createSimpleExecutor({
  type: 'rag.vector_search',
  displayName: 'Vector Search',
  description: 'Semantic vector similarity search using Qdrant',
  domain: 'rag',
  parameterSchema: {
    type: 'object',
    properties: {
      collection: { type: 'string', description: 'Vector collection name' },
      namespace: { type: 'string', description: 'Namespace filter' },
      topK: { type: 'number', default: 10, description: 'Number of results to return' },
      scoreThreshold: { type: 'number', default: 0.7, description: 'Minimum similarity score' },
    },
  },
  async execute(params, context) {
    try {
      const query = params.query || context.input?.expandedQuery || context.input?.query || context.input;
      const namespace = params.namespace || params.collection || 'default';
      const topK = params.topK || 10;
      const scoreThreshold = params.scoreThreshold || 0.5;

      if (!query || typeof query !== 'string') {
        return createErrorResult('SEARCH_ERROR', 'No query provided', true);
      }

      // Generate query embedding
      const embeddingService = getEmbeddingService();
      let queryVector;

      try {
        queryVector = await embeddingService.generateEmbedding(query);
      } catch (embError) {
        console.warn('[vectorSearch] Embedding generation failed:', embError.message);
        // Return empty results if embedding fails
        return createSuccessResult({
          results: [],
          query,
        }, { searchType: 'vector', error: 'Embedding service unavailable' });
      }

      // Build filter and resolve fullNamespace for collection selection.
      // fullNamespace is the 4th arg to searchSimilar and determines which
      // Qdrant collection to use via namespace.config.js mapping.
      let searchFilter = null;
      let fullNamespace = namespace;

      if (namespace.startsWith('project:')) {
        // project:<id> → project collection, filter by projectId
        fullNamespace = namespace;
        searchFilter = { must: [{ key: 'projectId', match: { value: namespace.slice(8) } }] };
      }
      // unified, core, meta, codex, etc. are passed as-is to resolve via namespace.config.js

      // Search in Qdrant
      const searchResult = await qdrantService.searchSimilar(queryVector, topK, searchFilter, fullNamespace);

      // Filter by score threshold
      const filteredResults = searchResult.filter(r => r.score >= scoreThreshold);

      const results = filteredResults.map((r, index) => ({
        id: r.id,
        text: r.payload?.text || r.payload?.content || '',
        name: r.payload?.name || r.payload?.quantum_id || '',
        score: r.score,
        rank: index + 1,
        source: 'vector',
        metadata: {
          namespace:    r.payload?.namespace,
          sessionId:    r.payload?.sessionId,
          sourceType:   r.payload?.source_type,
          primaryType:  r.payload?.primary_type,
          chunkIndex:   r.payload?.chunkIndex,
          entityCount:  r.payload?.entityCount,
          createdAt:    r.payload?.createdAt,
        },
      }));

      const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;

      return createSuccessResult({
        results,
        query,
        totalFound: results.length,
      }, {
        searchType: 'vector',
        namespace,
        avgScore: avgScore.toFixed(3),
      }, avgScore);

    } catch (error) {
      return createErrorResult('SEARCH_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: GRAPH SEARCH (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const graphSearchExecutor = createSimpleExecutor({
  type: 'rag.graph_search',
  displayName: 'Graph Search',
  description: 'Knowledge graph traversal search using Memgraph',
  domain: 'rag',
  parameterSchema: {
    type: 'object',
    properties: {
      maxDepth: { type: 'number', default: 2, description: 'Maximum graph traversal depth' },
      maxResults: { type: 'number', default: 20, description: 'Maximum results to return' },
      nodeTypes: { type: 'array', items: { type: 'string' }, description: 'Filter by node types' },
      relationTypes: { type: 'array', items: { type: 'string' }, description: 'Filter by relation types' },
    },
  },
  async execute(params, context) {
    try {
      const query = params.query || context.input?.query || context.input;
      const maxDepth = params.maxDepth || 2;
      const maxResults = params.maxResults || 20;
      const nodeTypes = params.nodeTypes || [];

      if (!query || typeof query !== 'string') {
        return createErrorResult('SEARCH_ERROR', 'No query provided', true);
      }

      // Extract keywords for graph search
      const keywords = query
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 3)
        .slice(0, 5);

      if (keywords.length === 0) {
        return createSuccessResult({
          results: [],
          query,
        }, { searchType: 'graph' });
      }

      // Build node type filter
      const nodeTypeFilter = nodeTypes.length > 0
        ? `AND any(label IN labels(n) WHERE label IN $nodeTypes)`
        : '';

      // Keyword-based search
      const cypher = `
        MATCH (n:KnowledgeQuantum)
        WHERE any(kw IN $keywords WHERE
          toLower(n.name) CONTAINS kw OR
          toLower(coalesce(n.title, '')) CONTAINS kw OR
          toLower(coalesce(n.description, '')) CONTAINS kw
        )
        ${nodeTypeFilter}
        WITH n, labels(n) as nodeLabels
        OPTIONAL MATCH path = (n)-[r*1..${maxDepth}]-(neighbor:KnowledgeQuantum)
        WHERE neighbor <> n
        RETURN DISTINCT n.id as id, n.name as name, n.description as description,
               nodeLabels, collect(DISTINCT neighbor.name)[0..5] as neighbors
        LIMIT $limit
      `;

      let graphResult;
      try {
        graphResult = await memgraphService.executeQuery(cypher, {
          keywords,
          nodeTypes,
          limit: maxResults,
        });
      } catch (dbError) {
        console.warn('[graphSearch] Query failed:', dbError.message);
        return createSuccessResult({
          results: [],
          query,
        }, { searchType: 'graph', error: dbError.message });
      }

      const results = (graphResult.records || []).map((r, index) => ({
        id: r.get('id'),
        name: r.get('name'),
        description: r.get('description') || '',
        type: r.get('nodeLabels')?.[1] || r.get('nodeLabels')?.[0] || 'Entity',
        score: 0.8 - (index * 0.02), // Decreasing score by rank
        rank: index + 1,
        source: 'graph',
        neighbors: r.get('neighbors') || [],
      }));

      return createSuccessResult({
        results,
        query,
        totalFound: results.length,
      }, {
        searchType: 'graph',
        maxDepth,
      }, results.length > 0 ? 0.8 : 0);

    } catch (error) {
      return createErrorResult('SEARCH_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: HYBRID SEARCH
// ────────────────────────────────────────────────────────────────────────────

const hybridSearchExecutor = createSimpleExecutor({
  type: 'rag.hybrid_search',
  displayName: 'Hybrid Search',
  description: 'Combined vector and graph search with result fusion',
  domain: 'rag',
  parameterSchema: {
    type: 'object',
    properties: {
      vectorWeight: { type: 'number', default: 0.6, description: 'Weight for vector results' },
      graphWeight: { type: 'number', default: 0.4, description: 'Weight for graph results' },
      maxResults: { type: 'number', default: 15, description: 'Maximum combined results' },
      fusionMethod: { type: 'string', default: 'rrf', description: 'Fusion method: rrf, linear, max' },
    },
  },
  async execute(params, context) {
    try {
      const query = params.query || context.input?.expandedQuery || context.input?.query || context.input;

      if (!query || typeof query !== 'string') {
        return createErrorResult('SEARCH_ERROR', 'No query provided', true);
      }

      const hybridSearch = getHybridSearch();

      const searchResult = await hybridSearch.search(query, {
        vectorWeight: params.vectorWeight || 0.6,
        graphWeight: params.graphWeight || 0.4,
        maxResults: params.maxResults || 15,
        fusionMethod: params.fusionMethod || 'rrf',
      });

      if (!searchResult.success) {
        return createErrorResult('SEARCH_ERROR', searchResult.error, true);
      }

      return createSuccessResult({
        results: searchResult.results,
        query,
        totalFound: searchResult.metadata.totalFound,
      }, {
        searchType: 'hybrid',
        vectorHits: searchResult.metadata.vectorHits,
        graphHits: searchResult.metadata.graphHits,
        fusionMethod: searchResult.metadata.fusionMethod,
        searchTime: searchResult.metadata.searchTime,
      }, searchResult.results.length > 0 ? 0.85 : 0);

    } catch (error) {
      return createErrorResult('SEARCH_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: ASSEMBLE CONTEXT (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const assembleContextExecutor = createSimpleExecutor({
  type: 'rag.assemble_context',
  displayName: 'Assemble Context',
  description: 'Assemble context from search results for LLM generation',
  domain: 'rag',
  parameterSchema: {
    type: 'object',
    properties: {
      maxTokens: { type: 'number', default: 4000, description: 'Maximum context tokens' },
      includeMetadata: { type: 'boolean', default: true, description: 'Include result metadata' },
      deduplicateContent: { type: 'boolean', default: true, description: 'Remove duplicate content' },
      sortByScore: { type: 'boolean', default: true, description: 'Sort results by relevance score' },
    },
  },
  async execute(params, context) {
    try {
      const query = context.input?.query || '';
      const vectorResults = context.input?.results || [];
      const graphResults = context.input?.graphResults || [];
      const maxTokens = params.maxTokens || 4000;
      const charsPerToken = 4; // Approximate

      // Combine all results
      let allResults = [...vectorResults, ...graphResults];

      // Sort by score if requested
      if (params.sortByScore !== false) {
        allResults.sort((a, b) => (b.score || 0) - (a.score || 0));
      }

      // Deduplicate by content similarity
      if (params.deduplicateContent !== false) {
        const seen = new Set();
        allResults = allResults.filter(r => {
          const key = (r.text || r.name || r.id || '').substring(0, 100).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // Build context string
      let contextParts = [];
      let totalChars = 0;
      const maxChars = maxTokens * charsPerToken;

      for (const result of allResults) {
        const content = result.text || result.name || result.description || '';
        if (!content) continue;

        let part = '';
        if (params.includeMetadata !== false && result.source) {
          part = `[${result.source.toUpperCase()}] ${content}`;
        } else {
          part = content;
        }

        if (totalChars + part.length > maxChars) {
          // Truncate last part if needed
          const remaining = maxChars - totalChars;
          if (remaining > 100) {
            contextParts.push(part.substring(0, remaining) + '...');
          }
          break;
        }

        contextParts.push(part);
        totalChars += part.length;
      }

      const assembledContext = contextParts.join('\n\n');
      const estimatedTokens = Math.ceil(assembledContext.length / charsPerToken);

      return createSuccessResult({
        context: assembledContext,
        query,
        sourcesUsed: contextParts.length,
        estimatedTokens,
      }, {
        totalResults: allResults.length,
        vectorSources: vectorResults.length,
        graphSources: graphResults.length,
        contextLength: assembledContext.length,
      }, contextParts.length > 0 ? 1.0 : 0);

    } catch (error) {
      return createErrorResult('ASSEMBLE_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: RERANK RESULTS
// ────────────────────────────────────────────────────────────────────────────

// ── BM25 helper (simple TF-IDF approximation) ────────────────────────────────

function tokenize(text) {
  return (text || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(t => t.length > 2);
}

function bm25Score(docTokens, queryTokens, avgDocLen, k1 = 1.5, b = 0.75) {
  const docLen = docTokens.length;
  const freq = {};
  for (const t of docTokens) freq[t] = (freq[t] || 0) + 1;
  let score = 0;
  for (const qt of queryTokens) {
    const tf = freq[qt] || 0;
    if (tf === 0) continue;
    const idf = Math.log(1 + 1 / (0.5 + 0.5 * tf));
    score += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * docLen / Math.max(avgDocLen, 1)));
  }
  return score;
}

const rerankResultsExecutor = createSimpleExecutor({
  type: 'rag.rerank',
  displayName: 'Rerank Results',
  description: 'Rerank search results using BM25 or LLM scoring',
  domain: 'rag',
  parameterSchema: {
    type: 'object',
    properties: {
      topK:   { type: 'number', default: 10,        description: 'Number of top results to keep' },
      method: { type: 'string', default: 'combined', description: 'Reranking method: score|bm25|llm|combined' },
    },
  },
  async execute(params, context) {
    const query   = params.query || context.input?.query || '';
    const results = context.input?.results || [];
    const topK    = params.topK || 10;
    const method  = params.method || 'combined';

    if (results.length === 0) {
      return createSuccessResult({ results: [], query }, { method });
    }

    let reranked;

    if (method === 'llm') {
      // LLM reranking: ask LLM to score 0-10, fall back to bm25 on any error
      let llmProvider = null;
      try { llmProvider = getLLMProvider(); } catch { /* no provider */ }

      if (llmProvider) {
        try {
          const batch = results.slice(0, 15);
          const lines = batch.map((r, i) =>
            `${i + 1}. [${r.id}] ${(r.text || r.content || r.name || '').slice(0, 200)}`
          ).join('\n');
          const prompt =
            `Score each result's relevance to the query. Scale: 0-10 integers only.\n` +
            `Query: "${query}"\n\nResults:\n${lines}\n\n` +
            `Respond with ONLY a JSON array of ${batch.length} integers, e.g. [8,3,9,5].`;

          const raw = await llmProvider.chat([{ role: 'user', content: prompt }], { maxTokens: 120, temperature: 0 });
          const text = Array.isArray(raw)
            ? raw.filter(b => b.type === 'text').map(b => b.text).join('')
            : (typeof raw === 'string' ? raw : raw?.content || '');

          const match = text.match(/\[[\d,\s]+\]/);
          if (match) {
            const scores = JSON.parse(match[0]);
            if (Array.isArray(scores) && scores.length >= batch.length) {
              const scored = batch.map((r, i) => ({ ...r, score: (scores[i] || 0) / 10 }));
              reranked = [...scored, ...results.slice(15)].sort((a, b) => (b.score || 0) - (a.score || 0));
            }
          }
        } catch (e) {
          console.warn('[rerank] LLM scoring failed, falling back to BM25:', e.message);
        }
      }
    }

    if (!reranked) {
      // BM25 reranking: combine BM25 score with original vector score
      const queryTokens = tokenize(query);
      const allTokens   = results.map(r => tokenize(r.text || r.content || r.name || ''));
      const avgLen      = allTokens.reduce((s, t) => s + t.length, 0) / Math.max(allTokens.length, 1);

      reranked = results.map((r, i) => {
        const bm25 = bm25Score(allTokens[i], queryTokens, avgLen);
        const normBm25 = Math.min(bm25 / 10, 1);
        const combined = (r.score || 0) * 0.6 + normBm25 * 0.4;
        return { ...r, score: combined };
      }).sort((a, b) => (b.score || 0) - (a.score || 0));
    }

    const top = reranked.slice(0, topK).map((r, i) => ({
      ...r, originalRank: results.indexOf(results.find(x => x.id === r.id)) + 1, newRank: i + 1,
    }));

    return createSuccessResult({
      results: top,
      query,
    }, {
      method,
      originalCount: results.length,
      rerankedCount: top.length,
    });
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: GENERATE RESPONSE (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const generateResponseExecutor = createSimpleExecutor({
  type: 'rag.generate_response',
  displayName: 'Generate Response',
  description: 'Generate LLM response using retrieved context',
  domain: 'rag',
  parameterSchema: {
    type: 'object',
    properties: {
      systemPrompt: { type: 'string', description: 'System prompt for the LLM' },
      temperature: { type: 'number', default: 0.7, description: 'LLM temperature' },
      maxTokens: { type: 'number', default: 1024, description: 'Maximum response tokens' },
      stream: { type: 'boolean', default: false, description: 'Stream the response' },
    },
  },
  async execute(params, context) {
    try {
      const query = context.input?.query || context.input?.originalQuery || '';
      const retrievedContext = context.input?.context || '';

      if (!query) {
        return createErrorResult('GENERATE_ERROR', 'No query provided', true);
      }

      // Build system prompt
      const systemPrompt = params.systemPrompt || `You are a helpful assistant with access to the following context information. Use this context to answer the user's question accurately and concisely. If the context doesn't contain relevant information, say so.

Context:
${retrievedContext}

Instructions:
- Answer based primarily on the provided context
- If context is insufficient, indicate that clearly
- Be concise and factual
- Cite sources when relevant`;

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: query }
      ];

      // Call LLM
      let response;
      try {
        response = await getLLMProvider().chat(messages);
      } catch (llmError) {
        console.warn('[generate] LLM call failed:', llmError.message);
        return createErrorResult('LLM_ERROR', `LLM unavailable: ${llmError.message}`, true);
      }

      const rawContent = response?.content;
      const generatedText = Array.isArray(rawContent)
        ? rawContent.filter(b => b.type === 'text').map(b => b.text).join('')
        : (rawContent || '');

      return createSuccessResult({
        response: generatedText,
        query,
        contextUsed: retrievedContext.length > 0,
      }, {
        responseLength: generatedText.length,
        contextLength: retrievedContext.length,
        estimatedTokens: Math.ceil(generatedText.length / 4),
      }, generatedText.length > 0 ? 0.9 : 0);

    } catch (error) {
      return createErrorResult('GENERATE_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: SUMMARIZE RESULTS
// ────────────────────────────────────────────────────────────────────────────

const summarizeResultsExecutor = createSimpleExecutor({
  type: 'rag.summarize',
  displayName: 'Summarize Results',
  description: 'Summarize search results into a concise response',
  domain: 'rag',
  parameterSchema: {
    type: 'object',
    properties: {
      maxLength: { type: 'number', default: 500, description: 'Maximum summary length' },
    },
  },
  async execute(params, context) {
    try {
      const query = context.input?.query || '';
      const results = context.input?.results || [];
      const maxLength = params.maxLength || 500;

      if (results.length === 0) {
        return createSuccessResult({
          summary: 'No relevant results found.',
          query,
        }, { resultCount: 0 });
      }

      // Build context for summarization
      const contextText = results
        .slice(0, 5)
        .map(r => r.text || r.name || r.description || '')
        .filter(Boolean)
        .join('\n\n');

      const messages = [
        {
          role: 'system',
          content: `Summarize the following search results in response to the query. Be concise (max ${maxLength} characters).`
        },
        {
          role: 'user',
          content: `Query: ${query}\n\nResults:\n${contextText}`
        }
      ];

      let summary;
      try {
        const response = await getLLMProvider().chat(messages);
        const rc = response?.content;
        summary = Array.isArray(rc)
          ? rc.filter(b => b.type === 'text').map(b => b.text).join('')
          : (rc || '');
      } catch (llmError) {
        // Fallback to simple extraction
        summary = results
          .slice(0, 3)
          .map(r => r.text || r.name || '')
          .join('. ')
          .substring(0, maxLength);
      }

      return createSuccessResult({
        summary: summary.substring(0, maxLength),
        query,
        sourcesUsed: Math.min(results.length, 5),
      }, {
        resultCount: results.length,
        summaryLength: summary.length,
      }, 0.85);

    } catch (error) {
      return createErrorResult('SUMMARIZE_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// RAG PLUGIN CLASS
// ────────────────────────────────────────────────────────────────────────────

class RAGPlugin extends PluginBase {
  constructor() {
    super(PLUGIN_METADATA);
  }

  async initialize() {
    console.log('[RAGPlugin] Initializing Phase 7 executors...');

    // Add all executors
    this.addExecutor(expandQueryExecutor);
    this.addExecutor(vectorSearchExecutor);
    this.addExecutor(graphSearchExecutor);
    this.addExecutor(hybridSearchExecutor);
    this.addExecutor(assembleContextExecutor);
    this.addExecutor(rerankResultsExecutor);
    this.addExecutor(generateResponseExecutor);
    this.addExecutor(summarizeResultsExecutor);

    console.log('[RAGPlugin] Initialized with 8 executors (real service implementations)');
  }

  async cleanup() {
    console.log('[RAGPlugin] Cleaning up...');
    embeddingServiceInstance = null;
    hybridSearchInstance = null;
    queryExpansionInstance = null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

const ragPlugin = new RAGPlugin();

module.exports = {
  RAGPlugin,
  ragPlugin,
  // Export executors for testing
  executors: {
    expandQuery: expandQueryExecutor,
    vectorSearch: vectorSearchExecutor,
    graphSearch: graphSearchExecutor,
    hybridSearch: hybridSearchExecutor,
    assembleContext: assembleContextExecutor,
    rerankResults: rerankResultsExecutor,
    generateResponse: generateResponseExecutor,
    summarizeResults: summarizeResultsExecutor,
  },
};
