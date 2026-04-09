/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HYBRID SEARCH EXECUTOR
 * Combines vector and graph search with result fusion
 * ═══════════════════════════════════════════════════════════════════════════
 */

import {
  BaseExecutor,
  ExecutionContext,
  NodeExecutionResult,
} from '../../../plugins/plugin-base';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────

interface HybridSearchParameters {
  query?: string;
  topK?: number;
  vectorWeight?: number;
  graphWeight?: number;
  fusionMethod?: 'rrf' | 'linear' | 'max';
  rrf_k?: number;
  namespace?: string;
  vectorThreshold?: number;
  graphMaxDepth?: number;
  expandContext?: boolean;
}

interface SearchResult {
  id: string;
  content?: string;
  name?: string;
  score: number;
  source: 'vector' | 'graph' | 'both';
  type?: string;
  metadata?: Record<string, unknown>;
}

interface HybridSearchOutput {
  results: SearchResult[];
  query: string;
  metadata: {
    totalFound: number;
    vectorHits: number;
    graphHits: number;
    fusedCount: number;
    fusionMethod: string;
    searchTime: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class HybridSearchExecutor extends BaseExecutor {
  readonly type = 'rag.hybrid_search';
  readonly displayName = 'Hybrid Search';
  readonly description = 'Combined vector + graph search with result fusion';
  readonly domain = 'rag';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
      topK: {
        type: 'number',
        default: 15,
        description: 'Number of results to return',
      },
      vectorWeight: {
        type: 'number',
        default: 0.6,
        description: 'Weight for vector search results',
      },
      graphWeight: {
        type: 'number',
        default: 0.4,
        description: 'Weight for graph search results',
      },
      fusionMethod: {
        type: 'string',
        enum: ['rrf', 'linear', 'max'],
        default: 'rrf',
        description: 'Method for fusing results',
      },
      rrf_k: {
        type: 'number',
        default: 60,
        description: 'RRF constant (higher = more weight to lower ranks)',
      },
      namespace: {
        type: 'string',
        default: 'core',
        description: 'Namespace to search in',
      },
      vectorThreshold: {
        type: 'number',
        default: 0.7,
        description: 'Minimum vector similarity score',
      },
      graphMaxDepth: {
        type: 'number',
        default: 2,
        description: 'Maximum graph traversal depth',
      },
      expandContext: {
        type: 'boolean',
        default: false,
        description: 'Expand context for top results',
      },
    },
    required: [],
  };

  private hybridSearchModule: typeof import('../../../../../services/retrieval/hybrid-search') | null = null;
  private qdrantService: typeof import('../../../../../services/qdrant.service') | null = null;
  private memgraphService: typeof import('../../../../../services/memgraph.service') | null = null;
  private embeddingService: typeof import('../../../../../services/embedding.service') | null = null;

  private async getHybridSearch() {
    if (!this.hybridSearchModule) {
      this.hybridSearchModule = await import('../../../../../services/retrieval/hybrid-search');
    }
    return this.hybridSearchModule;
  }

  private async getServices() {
    if (!this.qdrantService) {
      this.qdrantService = await import('../../../../../services/qdrant.service');
    }
    if (!this.memgraphService) {
      this.memgraphService = await import('../../../../../services/memgraph.service');
    }
    if (!this.embeddingService) {
      this.embeddingService = await import('../../../../../services/embedding.service');
    }

    return {
      qdrant: this.qdrantService.default || this.qdrantService,
      memgraph: this.memgraphService.default || this.memgraphService,
      embedding: this.embeddingService.default || this.embeddingService,
    };
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as HybridSearchParameters;

      // Get query from parameters or context
      const query = params.query || (context.variables.query as string);

      if (!query) {
        return this.error('INVALID_INPUT', 'No query provided', true);
      }

      const services = await this.getServices();
      const hybridSearchModule = await this.getHybridSearch();

      // Create hybrid search instance
      const hybridSearch = hybridSearchModule.createHybridSearch(
        {
          qdrantService: services.qdrant,
          memgraphService: services.memgraph,
          embeddingService: services.embedding,
        },
        {
          vectorTopK: params.topK ?? 15,
          vectorThreshold: params.vectorThreshold ?? 0.7,
          graphMaxDepth: params.graphMaxDepth ?? 2,
          graphMaxResults: params.topK ?? 15,
          fusionMethod: params.fusionMethod ?? 'rrf',
          vectorWeight: params.vectorWeight ?? 0.6,
          graphWeight: params.graphWeight ?? 0.4,
          rrf_k: params.rrf_k ?? 60,
          maxResults: params.topK ?? 15,
        }
      );

      // Perform search
      let searchResult;
      if (params.expandContext) {
        searchResult = await hybridSearch.searchWithContext(query);
      } else {
        searchResult = await hybridSearch.search(query);
      }

      if (!searchResult.success) {
        return this.error('SEARCH_FAILED', searchResult.error || 'Hybrid search failed', true);
      }

      // Format results
      const results: SearchResult[] = searchResult.results.map((r: {
        id: string;
        content?: string;
        name?: string;
        score: number;
        source?: string;
        type?: string;
        payload?: Record<string, unknown>;
        properties?: Record<string, unknown>;
      }) => ({
        id: r.id,
        content: r.content || r.name,
        name: r.name || r.content?.substring(0, 100),
        score: r.score,
        source: r.source?.includes('vector') && r.source?.includes('graph') ? 'both' :
                r.source?.includes('vector') ? 'vector' : 'graph',
        type: r.type,
        metadata: r.payload || r.properties,
      }));

      const output: HybridSearchOutput = {
        results,
        query,
        metadata: {
          totalFound: results.length,
          vectorHits: searchResult.metadata.vectorHits || 0,
          graphHits: searchResult.metadata.graphHits || 0,
          fusedCount: results.length,
          fusionMethod: params.fusionMethod || 'rrf',
          searchTime: searchResult.metadata.searchTime || (Date.now() - startTime),
        },
      };

      // Quality score based on result diversity and scores
      const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;
      const hasMultipleSources = results.some(r => r.source === 'both') ||
        (results.some(r => r.source === 'vector') && results.some(r => r.source === 'graph'));
      const qualityScore = Math.min(avgScore + (hasMultipleSources ? 0.1 : 0), 0.95);

      return this.success(
        output,
        {
          resultsReturned: results.length,
          vectorHits: output.metadata.vectorHits,
          graphHits: output.metadata.graphHits,
          fusionMethod: output.metadata.fusionMethod,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('HYBRID_SEARCH_ERROR', `Hybrid search failed: ${message}`, true);
    }
  }
}

export default HybridSearchExecutor;
