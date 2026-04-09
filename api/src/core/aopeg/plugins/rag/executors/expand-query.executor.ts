/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPAND QUERY EXECUTOR
 * Expands user query with synonyms, related terms, and reformulations
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

interface ExpandQueryParameters {
  query?: string;
  method?: 'synonyms' | 'llm' | 'hybrid';
  maxExpansions?: number;
  includeOriginal?: boolean;
  domainContext?: string;
  useLLM?: boolean;
}

interface ExpandQueryResult {
  originalQuery: string;
  expandedQueries: string[];
  keywords: string[];
  synonyms: Record<string, string[]>;
  entities: string[];
  expansionMethod: string;
}

// ────────────────────────────────────────────────────────────────────────────
// DOMAIN-SPECIFIC SYNONYMS
// ────────────────────────────────────────────────────────────────────────────

const DOMAIN_SYNONYMS: Record<string, Record<string, string[]>> = {
  general: {
    error: ['bug', 'issue', 'problem', 'fault', 'defect'],
    fix: ['resolve', 'repair', 'correct', 'patch', 'remedy'],
    create: ['make', 'build', 'generate', 'develop', 'construct'],
    delete: ['remove', 'eliminate', 'drop', 'erase', 'clear'],
    update: ['modify', 'change', 'edit', 'revise', 'alter'],
    user: ['person', 'member', 'account', 'profile', 'customer'],
    data: ['information', 'content', 'record', 'entry'],
    process: ['workflow', 'procedure', 'operation', 'task'],
    system: ['application', 'platform', 'service', 'tool'],
    document: ['file', 'record', 'report', 'artifact'],
  },
  technical: {
    api: ['endpoint', 'interface', 'service', 'REST', 'GraphQL'],
    database: ['db', 'storage', 'datastore', 'repository'],
    function: ['method', 'procedure', 'routine', 'handler'],
    class: ['object', 'type', 'model', 'entity'],
    module: ['component', 'package', 'library', 'service'],
    query: ['request', 'fetch', 'retrieve', 'lookup'],
    cache: ['store', 'buffer', 'memory'],
    async: ['asynchronous', 'concurrent', 'parallel'],
    auth: ['authentication', 'authorization', 'login', 'security'],
  },
  un: {
    resolution: ['decision', 'declaration', 'mandate'],
    member: ['state', 'nation', 'country', 'delegation'],
    assembly: ['ga', 'general assembly', 'plenary'],
    council: ['sc', 'security council', 'committee'],
    secretariat: ['secretary', 'admin', 'headquarters'],
    meeting: ['session', 'conference', 'summit'],
    report: ['document', 'paper', 'brief', 'note'],
  },
};

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class ExpandQueryExecutor extends BaseExecutor {
  readonly type = 'rag.expand_query';
  readonly displayName = 'Expand Query';
  readonly description = 'Expand search query with synonyms and related terms';
  readonly domain = 'rag';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Query to expand',
      },
      method: {
        type: 'string',
        enum: ['synonyms', 'llm', 'hybrid'],
        default: 'synonyms',
        description: 'Expansion method to use',
      },
      maxExpansions: {
        type: 'number',
        default: 5,
        description: 'Maximum number of expanded queries',
      },
      includeOriginal: {
        type: 'boolean',
        default: true,
        description: 'Include original query in results',
      },
      domainContext: {
        type: 'string',
        enum: ['general', 'technical', 'un'],
        default: 'general',
        description: 'Domain context for synonym selection',
      },
      useLLM: {
        type: 'boolean',
        default: false,
        description: 'Use LLM for query expansion',
      },
    },
    required: [],
  };

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as ExpandQueryParameters;

      // Get query from parameters or context
      const query = params.query || (context.variables.query as string);

      if (!query) {
        return this.error('INVALID_INPUT', 'No query provided', true);
      }

      const method = params.method || 'synonyms';
      const maxExpansions = params.maxExpansions ?? 5;
      const includeOriginal = params.includeOriginal ?? true;
      const domainContext = params.domainContext || 'general';

      // Extract keywords from query
      const keywords = this.extractKeywords(query);

      // Find synonyms for keywords
      const synonyms = this.findSynonyms(keywords, domainContext);

      // Extract potential entities
      const entities = this.extractEntities(query);

      // Generate expanded queries
      let expandedQueries: string[] = [];

      switch (method) {
        case 'llm':
          expandedQueries = await this.expandWithLLM(query, params);
          break;
        case 'hybrid':
          const synonymExpansions = this.expandWithSynonyms(query, synonyms, maxExpansions);
          const llmExpansions = await this.expandWithLLM(query, params);
          expandedQueries = [...new Set([...synonymExpansions, ...llmExpansions])].slice(0, maxExpansions);
          break;
        case 'synonyms':
        default:
          expandedQueries = this.expandWithSynonyms(query, synonyms, maxExpansions);
          break;
      }

      // Include original if requested
      if (includeOriginal && !expandedQueries.includes(query)) {
        expandedQueries.unshift(query);
      }

      const output: ExpandQueryResult = {
        originalQuery: query,
        expandedQueries,
        keywords,
        synonyms,
        entities,
        expansionMethod: method,
      };

      // Quality score based on expansion count and diversity
      const expansionRatio = expandedQueries.length / maxExpansions;
      const hasSynonyms = Object.keys(synonyms).length > 0;
      const qualityScore = (expansionRatio * 0.5) + (hasSynonyms ? 0.3 : 0) + 0.2;

      return this.success(
        output,
        {
          originalLength: query.length,
          keywordCount: keywords.length,
          expansionCount: expandedQueries.length,
          method,
          duration: Date.now() - startTime,
        },
        Math.min(qualityScore, 0.95)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('EXPAND_ERROR', `Query expansion failed: ${message}`, true);
    }
  }

  /**
   * Extract keywords from query
   */
  private extractKeywords(query: string): string[] {
    const stopWords = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
      'would', 'could', 'should', 'may', 'might', 'must', 'can',
      'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
      'it', 'we', 'they', 'what', 'which', 'who', 'whom', 'where',
      'when', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
      'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not',
      'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
      'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while',
      'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between',
      'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over',
    ]);

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word));
  }

  /**
   * Find synonyms for keywords
   */
  private findSynonyms(keywords: string[], domain: string): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    const domainDict = DOMAIN_SYNONYMS[domain] || {};
    const generalDict = DOMAIN_SYNONYMS.general || {};

    for (const keyword of keywords) {
      const synonyms = domainDict[keyword] || generalDict[keyword] || [];
      if (synonyms.length > 0) {
        result[keyword] = synonyms;
      }
    }

    return result;
  }

  /**
   * Extract potential entities from query
   */
  private extractEntities(query: string): string[] {
    const entities: string[] = [];

    // CamelCase words
    const camelCase = query.match(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g);
    if (camelCase) entities.push(...camelCase);

    // ALL CAPS words (likely acronyms)
    const acronyms = query.match(/\b[A-Z]{2,}\b/g);
    if (acronyms) entities.push(...acronyms);

    // Quoted strings
    const quoted = query.match(/"([^"]+)"|'([^']+)'/g);
    if (quoted) {
      entities.push(...quoted.map(q => q.replace(/['"]/g, '')));
    }

    return [...new Set(entities)];
  }

  /**
   * Expand query using synonyms
   */
  private expandWithSynonyms(
    query: string,
    synonyms: Record<string, string[]>,
    maxExpansions: number
  ): string[] {
    const expansions: Set<string> = new Set();

    // Original query with single word replacements
    for (const [keyword, syns] of Object.entries(synonyms)) {
      for (const syn of syns.slice(0, 2)) { // Top 2 synonyms per keyword
        const expanded = query.toLowerCase().replace(
          new RegExp(`\\b${keyword}\\b`, 'gi'),
          syn
        );
        if (expanded !== query.toLowerCase()) {
          expansions.add(expanded);
        }
      }
    }

    // Add keyword-only queries
    const keywords = Object.keys(synonyms);
    if (keywords.length > 0) {
      expansions.add(keywords.join(' '));

      // Add with top synonyms
      const withSynonyms = keywords.map(k =>
        synonyms[k]?.[0] || k
      ).join(' ');
      if (withSynonyms !== keywords.join(' ')) {
        expansions.add(withSynonyms);
      }
    }

    return Array.from(expansions).slice(0, maxExpansions);
  }

  /**
   * Expand query using LLM (stub - would use actual LLM)
   */
  private async expandWithLLM(
    query: string,
    _params: ExpandQueryParameters
  ): Promise<string[]> {
    // For now, return basic reformulations
    // In production, this would call an LLM to generate expansions
    const expansions: string[] = [];

    // Simple reformulations
    if (query.startsWith('how')) {
      expansions.push(query.replace(/^how\s+/i, 'what is the way to '));
    }
    if (query.startsWith('what')) {
      expansions.push(query.replace(/^what\s+(is|are)\s+/i, 'explain '));
    }
    if (!query.includes('?')) {
      expansions.push(query + '?');
    }

    // Add a more specific version
    expansions.push(query + ' details');
    expansions.push(query + ' example');

    return expansions.slice(0, 3);
  }
}

export default ExpandQueryExecutor;
