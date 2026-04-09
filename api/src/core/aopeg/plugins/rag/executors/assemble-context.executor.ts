/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASSEMBLE CONTEXT EXECUTOR
 * Assembles context from search results for LLM generation
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

interface AssembleContextParameters {
  results?: SearchResult[];
  query?: string;
  maxTokens?: number;
  format?: 'plain' | 'markdown' | 'xml' | 'numbered';
  includeMetadata?: boolean;
  includeScores?: boolean;
  separator?: string;
  preamble?: string;
  maxResults?: number;
  minScore?: number;
}

interface AssembleContextResult {
  context: string;
  sourceCount: number;
  estimatedTokens: number;
  truncated: boolean;
  sources: Array<{
    id: string;
    type?: string;
    score: number;
  }>;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class AssembleContextExecutor extends BaseExecutor {
  readonly type = 'rag.assemble_context';
  readonly displayName = 'Assemble Context';
  readonly description = 'Assemble context from search results for LLM generation';
  readonly domain = 'rag';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      results: {
        type: 'array',
        description: 'Search results to assemble (can use context.variables.results)',
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
        description: 'Original query for context framing',
      },
      maxTokens: {
        type: 'number',
        default: 4000,
        description: 'Maximum tokens for assembled context',
      },
      format: {
        type: 'string',
        enum: ['plain', 'markdown', 'xml', 'numbered'],
        default: 'markdown',
        description: 'Context formatting style',
      },
      includeMetadata: {
        type: 'boolean',
        default: true,
        description: 'Include source metadata in context',
      },
      includeScores: {
        type: 'boolean',
        default: false,
        description: 'Include relevance scores',
      },
      separator: {
        type: 'string',
        default: '\n\n---\n\n',
        description: 'Separator between context chunks',
      },
      preamble: {
        type: 'string',
        description: 'Text to prepend to context',
      },
      maxResults: {
        type: 'number',
        default: 10,
        description: 'Maximum number of results to include',
      },
      minScore: {
        type: 'number',
        default: 0.3,
        description: 'Minimum score to include in context',
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
      const params = parameters as AssembleContextParameters;

      // Get results from parameters or context
      let results = params.results ||
        (context.variables.results as SearchResult[]) ||
        (context.variables.rerankedResults as SearchResult[]);

      // Handle nested results structure
      if (!results && context.variables.output) {
        const output = context.variables.output as { results?: SearchResult[] };
        results = output.results;
      }

      if (!results || results.length === 0) {
        return this.success(
          {
            context: '',
            sourceCount: 0,
            estimatedTokens: 0,
            truncated: false,
            sources: [],
          },
          {
            message: 'No results to assemble',
            duration: Date.now() - startTime,
          },
          0.5
        );
      }

      const query = params.query || (context.variables.query as string) || '';
      const maxTokens = params.maxTokens ?? 4000;
      const format = params.format || 'markdown';
      const maxResults = params.maxResults ?? 10;
      const minScore = params.minScore ?? 0.3;
      const avgCharsPerToken = 4;
      const maxChars = maxTokens * avgCharsPerToken;

      // Filter and limit results
      const filteredResults = results
        .filter(r => r.score >= minScore)
        .slice(0, maxResults);

      // Assemble context based on format
      let contextParts: string[] = [];
      let truncated = false;
      let currentLength = 0;

      // Add preamble if provided
      if (params.preamble) {
        contextParts.push(params.preamble);
        currentLength += params.preamble.length;
      }

      const separator = params.separator ?? '\n\n---\n\n';
      const sources: Array<{ id: string; type?: string; score: number }> = [];

      for (let i = 0; i < filteredResults.length; i++) {
        const result = filteredResults[i];
        const content = result.content || result.name || '';

        if (!content) continue;

        // Format this result
        const formattedContent = this.formatResult(
          result,
          i + 1,
          format,
          params.includeMetadata ?? true,
          params.includeScores ?? false
        );

        // Check if adding this would exceed limit
        if (currentLength + formattedContent.length + separator.length > maxChars) {
          truncated = true;
          break;
        }

        contextParts.push(formattedContent);
        currentLength += formattedContent.length + separator.length;

        sources.push({
          id: result.id,
          type: result.type,
          score: result.score,
        });
      }

      // Join parts
      const assembledContext = contextParts.join(separator);
      const estimatedTokens = Math.ceil(assembledContext.length / avgCharsPerToken);

      const output: AssembleContextResult = {
        context: assembledContext,
        sourceCount: sources.length,
        estimatedTokens,
        truncated,
        sources,
      };

      // Quality score based on coverage
      const coverageRatio = sources.length / Math.min(filteredResults.length, maxResults);
      const avgScore = sources.length > 0
        ? sources.reduce((sum, s) => sum + s.score, 0) / sources.length
        : 0;
      const qualityScore = coverageRatio * 0.5 + avgScore * 0.5;

      return this.success(
        output,
        {
          sourceCount: sources.length,
          estimatedTokens,
          truncated,
          format,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('ASSEMBLE_ERROR', `Context assembly failed: ${message}`, true);
    }
  }

  /**
   * Format a single result based on style
   */
  private formatResult(
    result: SearchResult,
    index: number,
    format: string,
    includeMetadata: boolean,
    includeScores: boolean
  ): string {
    const content = result.content || result.name || '';
    const type = result.type || 'unknown';
    const score = result.score;

    switch (format) {
      case 'xml':
        return this.formatXML(result, index, content, type, score, includeMetadata, includeScores);
      case 'numbered':
        return this.formatNumbered(result, index, content, type, score, includeMetadata, includeScores);
      case 'plain':
        return this.formatPlain(result, content, includeMetadata);
      case 'markdown':
      default:
        return this.formatMarkdown(result, index, content, type, score, includeMetadata, includeScores);
    }
  }

  private formatMarkdown(
    result: SearchResult,
    index: number,
    content: string,
    type: string,
    score: number,
    includeMetadata: boolean,
    includeScores: boolean
  ): string {
    let md = `### Source ${index}`;

    if (includeMetadata) {
      md += ` (${type})`;
    }

    if (includeScores) {
      md += ` [relevance: ${(score * 100).toFixed(0)}%]`;
    }

    md += '\n\n';
    md += content;

    if (includeMetadata && result.metadata) {
      const metaEntries = Object.entries(result.metadata)
        .filter(([k]) => ['sourceId', 'filename', 'title', 'author'].includes(k))
        .slice(0, 3);

      if (metaEntries.length > 0) {
        md += '\n\n*Metadata:* ';
        md += metaEntries.map(([k, v]) => `${k}: ${v}`).join(', ');
      }
    }

    return md;
  }

  private formatXML(
    result: SearchResult,
    index: number,
    content: string,
    type: string,
    score: number,
    includeMetadata: boolean,
    includeScores: boolean
  ): string {
    let xml = `<source id="${index}" type="${type}"`;

    if (includeScores) {
      xml += ` relevance="${(score * 100).toFixed(0)}"`;
    }

    xml += '>\n';
    xml += `  <content>${this.escapeXML(content)}</content>\n`;

    if (includeMetadata && result.metadata) {
      xml += '  <metadata>\n';
      for (const [k, v] of Object.entries(result.metadata).slice(0, 5)) {
        xml += `    <${k}>${this.escapeXML(String(v))}</${k}>\n`;
      }
      xml += '  </metadata>\n';
    }

    xml += '</source>';
    return xml;
  }

  private formatNumbered(
    result: SearchResult,
    index: number,
    content: string,
    type: string,
    score: number,
    includeMetadata: boolean,
    includeScores: boolean
  ): string {
    let text = `[${index}]`;

    if (includeMetadata) {
      text += ` {${type}}`;
    }

    if (includeScores) {
      text += ` (${(score * 100).toFixed(0)}%)`;
    }

    text += ' ';
    text += content;

    return text;
  }

  private formatPlain(
    result: SearchResult,
    content: string,
    includeMetadata: boolean
  ): string {
    let text = content;

    if (includeMetadata && result.metadata?.sourceId) {
      text += `\n[Source: ${result.metadata.sourceId}]`;
    }

    return text;
  }

  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}

export default AssembleContextExecutor;
