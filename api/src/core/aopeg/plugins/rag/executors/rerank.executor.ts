/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RERANK EXECUTOR
 * Reranks search results using various strategies
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

interface SearchResult {
  id: string;
  content?: string;
  name?: string;
  score: number;
  source?: string;
  type?: string;
  metadata?: Record<string, unknown>;
}

interface RerankParameters {
  results?: SearchResult[];
  query?: string;
  method?: 'cross_encoder' | 'llm' | 'bm25' | 'combined';
  topK?: number;
  model?: string;
  diversityWeight?: number;
  recencyBoost?: boolean;
  typeBoosts?: Record<string, number>;
}

interface RerankResult {
  results: SearchResult[];
  originalCount: number;
  rerankMethod: string;
  rerankedCount: number;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class RerankExecutor extends BaseExecutor {
  readonly type = 'rag.rerank';
  readonly displayName = 'Rerank Results';
  readonly description = 'Rerank search results using cross-encoder or LLM scoring';
  readonly domain = 'rag';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: 'Search results to rerank (can use context.variables.results)',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            content: { type: 'string' },
            score: { type: 'number' },
          },
        },
      },
      query: {
        type: 'string',
        description: 'Original query for relevance scoring',
      },
      method: {
        type: 'string',
        enum: ['cross_encoder', 'llm', 'bm25', 'combined'],
        default: 'combined',
        description: 'Reranking method to use',
      },
      topK: {
        type: 'number',
        default: 10,
        description: 'Number of results to return after reranking',
      },
      model: {
        type: 'string',
        description: 'Model to use for LLM-based reranking',
      },
      diversityWeight: {
        type: 'number',
        default: 0.1,
        description: 'Weight for diversity in results (0-1)',
      },
      recencyBoost: {
        type: 'boolean',
        default: false,
        description: 'Boost more recent documents',
      },
      typeBoosts: {
        type: 'object',
        description: 'Score boosts by content type',
      },
    },
    required: [],
  };

  private rerankerModule: typeof import('../../../../../services/retrieval/reranker.service') | null = null;

  private async getReranker() {
    if (!this.rerankerModule) {
      try {
        this.rerankerModule = await import('../../../../../services/retrieval/reranker.service');
      } catch {
        // Service may not exist, use built-in reranking
        this.rerankerModule = null;
      }
    }
    return this.rerankerModule;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as RerankParameters;

      // Get results from parameters or context
      let results = params.results ||
        (context.variables.results as SearchResult[]) ||
        (context.variables.searchResults as SearchResult[]);

      // Handle nested results structure
      if (!results && context.variables.output) {
        const output = context.variables.output as { results?: SearchResult[] };
        results = output.results;
      }

      if (!results || results.length === 0) {
        return this.success(
          {
            results: [],
            originalCount: 0,
            rerankMethod: params.method || 'combined',
            rerankedCount: 0,
          },
          {
            message: 'No results to rerank',
            duration: Date.now() - startTime,
          },
          0.5
        );
      }

      const query = params.query || (context.variables.query as string) || '';
      const method = params.method || 'combined';
      const topK = params.topK ?? 10;

      // Rerank based on method
      let rerankedResults: SearchResult[];

      switch (method) {
        case 'bm25':
          rerankedResults = this.rerankBM25(results, query);
          break;
        case 'llm':
          rerankedResults = await this.rerankWithLLM(results, query, params.model);
          break;
        case 'cross_encoder':
          rerankedResults = await this.rerankCrossEncoder(results, query);
          break;
        case 'combined':
        default:
          rerankedResults = this.rerankCombined(results, query, params);
          break;
      }

      // Apply type boosts
      if (params.typeBoosts) {
        rerankedResults = this.applyTypeBoosts(rerankedResults, params.typeBoosts);
      }

      // Apply recency boost
      if (params.recencyBoost) {
        rerankedResults = this.applyRecencyBoost(rerankedResults);
      }

      // Apply diversity (MMR-style)
      if (params.diversityWeight && params.diversityWeight > 0) {
        rerankedResults = this.applyDiversity(rerankedResults, params.diversityWeight);
      }

      // Sort and limit
      rerankedResults = rerankedResults
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      const output: RerankResult = {
        results: rerankedResults,
        originalCount: results.length,
        rerankMethod: method,
        rerankedCount: rerankedResults.length,
      };

      // Quality score based on score improvement
      const originalAvg = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      const rerankedAvg = rerankedResults.length > 0
        ? rerankedResults.reduce((sum, r) => sum + r.score, 0) / rerankedResults.length
        : 0;
      const qualityScore = Math.min(rerankedAvg + 0.1, 0.95);

      return this.success(
        output,
        {
          originalCount: results.length,
          rerankedCount: rerankedResults.length,
          method,
          avgScoreChange: (rerankedAvg - originalAvg).toFixed(3),
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('RERANK_ERROR', `Reranking failed: ${message}`, true);
    }
  }

  /**
   * BM25-based reranking
   */
  private rerankBM25(results: SearchResult[], query: string): SearchResult[] {
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

    if (queryTerms.length === 0) {
      return results;
    }

    return results.map(result => {
      const content = (result.content || result.name || '').toLowerCase();
      const words = content.split(/\s+/);

      // Simple BM25-like scoring
      let bm25Score = 0;
      for (const term of queryTerms) {
        const tf = words.filter(w => w.includes(term)).length;
        const docLength = words.length;
        const avgDocLength = 500; // Approximate average

        // BM25 formula (simplified)
        const k1 = 1.2;
        const b = 0.75;
        const tfNormalized = (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLength / avgDocLength)));
        bm25Score += tfNormalized;
      }

      // Combine with original score
      const newScore = result.score * 0.5 + (bm25Score / queryTerms.length) * 0.5;

      return { ...result, score: Math.min(newScore, 1) };
    });
  }

  /**
   * LLM-based reranking: asks the LLM to score each result 0-10 against the query.
   * Batches at most 15 results to keep the prompt token-efficient.
   * Falls back to combined method on any failure.
   */
  private async rerankWithLLM(
    results: SearchResult[],
    query: string,
    _model?: string
  ): Promise<SearchResult[]> {
    if (results.length === 0) return results;

    let llmProvider: any;
    try {
      const { getInstance } = require('../../../../../services/llm/LLMProviderService') as any;
      llmProvider = getInstance();
    } catch {
      return this.rerankCombined(results, query, {});
    }

    const batch = results.slice(0, 15);
    const resultLines = batch
      .map((r, i) => `${i + 1}. [${r.id}] ${(r.content || r.name || '').slice(0, 200)}`)
      .join('\n');

    const prompt =
      `Score each search result's relevance to the query. Scale: 0 (irrelevant) to 10 (perfect match). Integers only.\n` +
      `Query: "${query}"\n\nResults:\n${resultLines}\n\n` +
      `Respond with ONLY a JSON array of ${batch.length} integers, e.g. [8,3,9,5].`;

    try {
      const rawContent = await llmProvider.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 120, temperature: 0 }
      );

      const text: string = Array.isArray(rawContent)
        ? (rawContent as any[]).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
        : (typeof rawContent === 'string' ? rawContent : (rawContent as any)?.content || '');

      const match = text.match(/\[[\d,\s]+\]/);
      if (!match) return this.rerankCombined(results, query, {});

      const scores: number[] = JSON.parse(match[0]);
      if (!Array.isArray(scores) || scores.length < batch.length) {
        return this.rerankCombined(results, query, {});
      }

      const reranked = batch.map((r, i) => ({
        ...r,
        score: (typeof scores[i] === 'number' ? scores[i] : 0) / 10,
      }));

      // Append un-batched results with their original scores
      return [...reranked, ...results.slice(15)];
    } catch {
      return this.rerankCombined(results, query, {});
    }
  }

  /**
   * Cross-encoder reranking. Uses LLM as the scoring model since a dedicated
   * cross-encoder service is not available in this deployment.
   */
  private async rerankCrossEncoder(
    results: SearchResult[],
    query: string
  ): Promise<SearchResult[]> {
    return this.rerankWithLLM(results, query);
  }

  /**
   * Combined reranking strategy
   */
  private rerankCombined(
    results: SearchResult[],
    query: string,
    params: RerankParameters
  ): SearchResult[] {
    // Apply BM25 scoring
    const bm25Results = this.rerankBM25(results, query);

    // Combine original score, BM25, and position
    return bm25Results.map((result, index) => {
      const originalScore = results.find(r => r.id === result.id)?.score || 0;
      const bm25Score = result.score;
      const positionScore = 1 / (index + 1); // Higher position = higher score

      // Weighted combination
      const combinedScore = (
        originalScore * 0.4 +
        bm25Score * 0.4 +
        positionScore * 0.2
      );

      return { ...result, score: combinedScore };
    });
  }

  /**
   * Apply type-based boosts
   */
  private applyTypeBoosts(
    results: SearchResult[],
    typeBoosts: Record<string, number>
  ): SearchResult[] {
    return results.map(result => {
      const type = result.type || 'unknown';
      const boost = typeBoosts[type] || 1;
      return { ...result, score: result.score * boost };
    });
  }

  /**
   * Apply recency boost
   */
  private applyRecencyBoost(results: SearchResult[]): SearchResult[] {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return results.map(result => {
      const metadata = result.metadata as Record<string, unknown> | undefined;
      const createdAt = metadata?.createdAt as string | undefined;

      if (createdAt) {
        const age = now - new Date(createdAt).getTime();
        const ageDays = age / dayMs;

        // Decay factor: recent documents get boost
        const recencyFactor = Math.exp(-ageDays / 30); // 30-day half-life
        const boost = 1 + recencyFactor * 0.2; // Up to 20% boost

        return { ...result, score: result.score * boost };
      }

      return result;
    });
  }

  /**
   * Apply diversity (MMR-style)
   */
  private applyDiversity(
    results: SearchResult[],
    diversityWeight: number
  ): SearchResult[] {
    if (results.length <= 1) return results;

    const selected: SearchResult[] = [results[0]];
    const remaining = results.slice(1);

    while (remaining.length > 0 && selected.length < results.length) {
      let bestIdx = 0;
      let bestScore = -Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i];

        // Calculate similarity to already selected (simple text overlap)
        const maxSimilarity = selected.reduce((max, sel) => {
          const sim = this.textSimilarity(
            candidate.content || candidate.name || '',
            sel.content || sel.name || ''
          );
          return Math.max(max, sim);
        }, 0);

        // MMR score: relevance - diversity penalty
        const mmrScore = candidate.score * (1 - diversityWeight) -
                        maxSimilarity * diversityWeight;

        if (mmrScore > bestScore) {
          bestScore = mmrScore;
          bestIdx = i;
        }
      }

      selected.push(remaining[bestIdx]);
      remaining.splice(bestIdx, 1);
    }

    return selected;
  }

  /**
   * Simple text similarity (Jaccard)
   */
  private textSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.toLowerCase().split(/\s+/));
    const wordsB = new Set(b.toLowerCase().split(/\s+/));

    const intersection = new Set([...wordsA].filter(x => wordsB.has(x)));
    const union = new Set([...wordsA, ...wordsB]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

export default RerankExecutor;
