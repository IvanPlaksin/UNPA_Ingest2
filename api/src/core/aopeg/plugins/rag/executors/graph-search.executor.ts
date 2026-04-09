/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GRAPH SEARCH EXECUTOR
 * Performs graph-based search using Memgraph
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

interface GraphSearchParameters {
  query?: string;
  keywords?: string[];
  entityTypes?: string[];
  maxDepth?: number;
  maxResults?: number;
  namespace?: string;
  relationTypes?: string[];
  expandFromIds?: string[];
}

interface GraphSearchResult {
  id: string;
  name: string;
  type: string;
  labels: string[];
  score: number;
  properties: Record<string, unknown>;
  distance?: number;
  path?: string[];
}

interface GraphSearchOutput {
  results: GraphSearchResult[];
  query: string;
  totalFound: number;
  searchTime: number;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class GraphSearchExecutor extends BaseExecutor {
  readonly type = 'rag.graph_search';
  readonly displayName = 'Graph Search';
  readonly description = 'Search the knowledge graph for related entities';
  readonly domain = 'rag';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query text',
      },
      keywords: {
        type: 'array',
        description: 'Keywords to search for (alternative to query)',
        items: { type: 'string' },
      },
      entityTypes: {
        type: 'array',
        description: 'Filter by entity types',
        items: { type: 'string' },
      },
      maxDepth: {
        type: 'number',
        default: 2,
        description: 'Maximum graph traversal depth',
      },
      maxResults: {
        type: 'number',
        default: 20,
        description: 'Maximum results to return',
      },
      namespace: {
        type: 'string',
        default: 'core',
        description: 'Namespace to search in',
      },
      relationTypes: {
        type: 'array',
        description: 'Filter by relationship types',
        items: { type: 'string' },
      },
      expandFromIds: {
        type: 'array',
        description: 'Start expansion from these node IDs',
        items: { type: 'string' },
      },
    },
    required: [],
  };

  private memgraphService: typeof import('../../../../../services/memgraph.service') | null = null;

  private async getMemgraph() {
    if (!this.memgraphService) {
      this.memgraphService = await import('../../../../../services/memgraph.service');
    }
    return this.memgraphService.default || this.memgraphService;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as GraphSearchParameters;

      // Get query from parameters or context
      const query = params.query || (context.variables.query as string);
      let keywords = params.keywords || (context.variables.keywords as string[]);

      // Extract keywords from query if not provided
      if (!keywords && query) {
        keywords = this.extractKeywords(query);
      }

      if ((!keywords || keywords.length === 0) && !params.expandFromIds) {
        return this.error('INVALID_INPUT', 'No query, keywords, or expandFromIds provided', true);
      }

      const memgraph = await this.getMemgraph();
      const maxDepth = params.maxDepth ?? 2;
      const maxResults = params.maxResults ?? 20;
      const namespace = params.namespace || 'core';

      let results: GraphSearchResult[] = [];

      // Strategy 1: Keyword-based search
      if (keywords && keywords.length > 0) {
        const keywordResults = await this.keywordSearch(memgraph, keywords, params, namespace, maxResults);
        results.push(...keywordResults);
      }

      // Strategy 2: Expansion from seed nodes
      if (params.expandFromIds && params.expandFromIds.length > 0) {
        const expansionResults = await this.expandFromNodes(
          memgraph,
          params.expandFromIds,
          maxDepth,
          params.relationTypes,
          maxResults
        );
        results.push(...expansionResults);
      }

      // Deduplicate results
      const seen = new Set<string>();
      results = results.filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      // Sort by score and limit
      results = results
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);

      const output: GraphSearchOutput = {
        results,
        query: query || keywords?.join(', ') || '[expansion]',
        totalFound: results.length,
        searchTime: Date.now() - startTime,
      };

      // Quality score based on results
      const avgScore = results.length > 0
        ? results.reduce((sum, r) => sum + r.score, 0) / results.length
        : 0;
      const qualityScore = Math.min(avgScore + 0.3, 0.95);

      return this.success(
        output,
        {
          resultsReturned: results.length,
          keywordsUsed: keywords?.length || 0,
          namespace,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('GRAPH_SEARCH_ERROR', `Graph search failed: ${message}`, true);
    }
  }

  /**
   * Extract keywords from query text
   */
  private extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3)
      .filter(w => !['this', 'that', 'with', 'from', 'what', 'when', 'where', 'which', 'have', 'does'].includes(w))
      .slice(0, 10);
  }

  /**
   * Perform keyword-based graph search
   */
  private async keywordSearch(
    memgraph: unknown,
    keywords: string[],
    params: GraphSearchParameters,
    namespace: string,
    limit: number
  ): Promise<GraphSearchResult[]> {
    const mg = memgraph as {
      executeQuery: (query: string, params: Record<string, unknown>) => Promise<{
        records: Array<{ get: (key: string) => unknown }>;
      }>;
    };

    // Build entity type filter
    let typeFilter = '';
    if (params.entityTypes && params.entityTypes.length > 0) {
      const types = params.entityTypes.map(t => `"${t}"`).join(', ');
      typeFilter = `AND n.type IN [${types}]`;
    }

    const query = `
      MATCH (n:KnowledgeQuantum)
      WHERE n.namespace = $namespace ${typeFilter}
        AND any(kw IN $keywords WHERE
          toLower(n.name) CONTAINS kw OR
          toLower(coalesce(n.title, '')) CONTAINS kw OR
          toLower(coalesce(n.description, '')) CONTAINS kw OR
          toLower(coalesce(n.normalizedForm, '')) CONTAINS kw
        )
      RETURN n, labels(n) as labels
      LIMIT $limit
    `;

    const result = await mg.executeQuery(query, {
      keywords,
      namespace,
      limit,
    });

    return (result.records || []).map((r, index) => {
      const node = r.get('n') as { properties: Record<string, unknown> };
      const labels = r.get('labels') as string[];

      // Calculate match score based on keyword presence
      const props = node.properties;
      const text = `${props.name || ''} ${props.title || ''} ${props.description || ''}`.toLowerCase();
      const matchCount = keywords.filter(kw => text.includes(kw)).length;
      const score = 0.3 + (matchCount / keywords.length) * 0.5;

      return {
        id: props.id as string,
        name: (props.name || props.title) as string,
        type: props.type as string || labels[1] || 'unknown',
        labels,
        score,
        properties: props,
      };
    });
  }

  /**
   * Expand from seed nodes
   */
  private async expandFromNodes(
    memgraph: unknown,
    seedIds: string[],
    maxDepth: number,
    relationTypes: string[] | undefined,
    limit: number
  ): Promise<GraphSearchResult[]> {
    const mg = memgraph as {
      executeQuery: (query: string, params: Record<string, unknown>) => Promise<{
        records: Array<{ get: (key: string) => unknown }>;
      }>;
    };

    // Build relation filter
    let relFilter = '';
    if (relationTypes && relationTypes.length > 0) {
      const types = relationTypes.join('|');
      relFilter = `:${types}`;
    }

    const query = `
      MATCH (seed:KnowledgeQuantum)
      WHERE seed.id IN $seedIds
      MATCH path = (seed)-[r${relFilter}*1..${maxDepth}]-(neighbor:KnowledgeQuantum)
      WHERE neighbor.id <> seed.id
      WITH DISTINCT neighbor, min(length(path)) as distance
      RETURN neighbor, labels(neighbor) as labels, distance
      ORDER BY distance
      LIMIT $limit
    `;

    const result = await mg.executeQuery(query, {
      seedIds,
      limit,
    });

    return (result.records || []).map((r) => {
      const node = r.get('neighbor') as { properties: Record<string, unknown> };
      const labels = r.get('labels') as string[];
      const distance = r.get('distance') as number;
      const props = node.properties;

      // Score decreases with distance
      const score = 0.6 / (1 + distance * 0.2);

      return {
        id: props.id as string,
        name: (props.name || props.title) as string,
        type: props.type as string || labels[1] || 'unknown',
        labels,
        score,
        properties: props,
        distance,
      };
    });
  }
}

export default GraphSearchExecutor;
