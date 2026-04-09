/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VECTOR SEARCH EXECUTOR
 * Performs vector similarity search using Qdrant
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

interface VectorSearchParameters {
  query?: string;
  queryVector?: number[];
  topK?: number;
  scoreThreshold?: number;
  namespace?: string;
  filter?: Record<string, unknown>;
  includeMetadata?: boolean;
}

interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
}

interface VectorSearchResult {
  results: SearchResult[];
  query: string;
  totalFound: number;
  searchTime: number;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class VectorSearchExecutor extends BaseExecutor {
  readonly type = 'rag.vector_search';
  readonly displayName = 'Vector Search';
  readonly description = 'Search for similar content using vector embeddings';
  readonly domain = 'rag';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text (will be embedded)',
      },
      queryVector: {
        type: 'array',
        description: 'Pre-computed query vector (alternative to query)',
        items: { type: 'number' },
      },
      topK: {
        type: 'number',
        default: 10,
        description: 'Number of results to return',
      },
      scoreThreshold: {
        type: 'number',
        default: 0.7,
        description: 'Minimum similarity score threshold',
      },
      namespace: {
        type: 'string',
        default: 'core',
        description: 'Namespace to search in',
      },
      filter: {
        type: 'object',
        description: 'Qdrant filter conditions',
      },
      includeMetadata: {
        type: 'boolean',
        default: true,
        description: 'Include full metadata in results',
      },
    },
    required: [],
  };

  private qdrantService: typeof import('../../../../../services/qdrant.service') | null = null;
  private embeddingService: typeof import('../../../../../services/embedding.service') | null = null;

  private async getQdrant() {
    if (!this.qdrantService) {
      this.qdrantService = await import('../../../../../services/qdrant.service');
    }
    return this.qdrantService.default || this.qdrantService;
  }

  private async getEmbedding() {
    if (!this.embeddingService) {
      this.embeddingService = await import('../../../../../services/embedding.service');
    }
    return this.embeddingService.default || this.embeddingService;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as VectorSearchParameters;

      // Get query from parameters or context
      const query = params.query || (context.variables.query as string);
      let queryVector = params.queryVector || (context.variables.queryVector as number[]);

      if (!query && !queryVector) {
        return this.error('INVALID_INPUT', 'No query or queryVector provided', true);
      }

      const qdrant = await this.getQdrant();
      const embedding = await this.getEmbedding();

      // Generate embedding if not provided
      if (!queryVector && query) {
        const embeddingResult = await embedding.generateEmbedding(query);
        queryVector = embeddingResult.embedding || embeddingResult;
      }

      const topK = params.topK ?? 10;
      const namespace = params.namespace || 'core';
      const filter = params.filter || null;

      // Perform search
      const searchResults = await qdrant.searchSimilar(
        queryVector,
        topK,
        filter,
        namespace
      );

      // Filter by score threshold and format results
      const threshold = params.scoreThreshold ?? 0.7;
      const results: SearchResult[] = searchResults
        .filter((r: { score: number }) => r.score >= threshold)
        .map((r: { id: string; score: number; payload: Record<string, unknown> }) => ({
          id: r.id,
          score: r.score,
          content: (r.payload?.content as string) || (r.payload?.text as string) || '',
          metadata: params.includeMetadata !== false ? r.payload : { id: r.id },
        }));

      const output: VectorSearchResult = {
        results,
        query: query || '[vector query]',
        totalFound: results.length,
        searchTime: Date.now() - startTime,
      };

      // Quality score based on result relevance
      const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;
      const qualityScore = avgScore;

      return this.success(
        output,
        {
          resultsReturned: results.length,
          avgScore: avgScore.toFixed(3),
          namespace,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('VECTOR_SEARCH_ERROR', `Vector search failed: ${message}`, true);
    }
  }
}

export default VectorSearchExecutor;
