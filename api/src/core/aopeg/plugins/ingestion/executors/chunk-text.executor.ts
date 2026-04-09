/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CHUNK TEXT EXECUTOR
 * Wraps TextChunker service for AOPEG pipeline
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

interface ChunkTextParameters {
  text?: string;
  mode?: 'default' | 'embedding' | 'rag' | 'document';
  maxTokens?: number;
  overlapTokens?: number;
  minChunkSize?: number;
  preserveParagraphs?: boolean;
  preserveSentences?: boolean;
  detectHeaders?: boolean;
  avgCharsPerToken?: number;
  documentStructure?: {
    title?: string;
    type?: string;
    sections?: Array<{ title: string; start: number; end: number }>;
  };
}

interface Chunk {
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
  tokenEstimate: number;
  metadata?: {
    header?: string | null;
    type?: string;
    charCount?: number;
    wordCount?: number;
    lineCount?: number;
    documentTitle?: string;
    documentType?: string;
    section?: string | null;
  };
}

interface ChunkResult {
  chunks: Chunk[];
  stats: {
    count: number;
    totalTokens: number;
    avgTokens: number;
    minTokens: number;
    maxTokens: number;
    totalChars: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class ChunkTextExecutor extends BaseExecutor {
  readonly type = 'ingestion.chunk_text';
  readonly displayName = 'Chunk Text';
  readonly description = 'Split text into semantic chunks for embedding and retrieval';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to chunk (can also use context.variables.text)',
      },
      mode: {
        type: 'string',
        enum: ['default', 'embedding', 'rag', 'document'],
        default: 'embedding',
        description: 'Chunking preset mode',
      },
      maxTokens: {
        type: 'number',
        default: 512,
        description: 'Maximum tokens per chunk',
      },
      overlapTokens: {
        type: 'number',
        default: 50,
        description: 'Token overlap between chunks',
      },
      minChunkSize: {
        type: 'number',
        default: 100,
        description: 'Minimum chunk size in characters',
      },
      preserveParagraphs: {
        type: 'boolean',
        default: true,
        description: 'Try to keep paragraphs intact',
      },
      preserveSentences: {
        type: 'boolean',
        default: true,
        description: 'Try to keep sentences intact',
      },
      detectHeaders: {
        type: 'boolean',
        default: true,
        description: 'Detect and use headers as chunk boundaries',
      },
      avgCharsPerToken: {
        type: 'number',
        default: 4,
        description: 'Average characters per token estimate',
      },
      documentStructure: {
        type: 'object',
        description: 'Optional document structure for enhanced chunking',
      },
    },
    required: [],
  };

  private chunkerModule: typeof import('../../../../../services/chunking/text-chunker') | null = null;

  /**
   * Lazy load the chunker service
   */
  private async getChunker() {
    if (!this.chunkerModule) {
      this.chunkerModule = await import('../../../../../services/chunking/text-chunker');
    }
    return this.chunkerModule;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as ChunkTextParameters;

      // Get text from parameters or context
      const text = params.text ||
        (context.variables.text as string) ||
        (context.variables.sanitizedText as string) ||
        (context.variables.content as string);

      if (!text || typeof text !== 'string') {
        return this.error('INVALID_INPUT', 'No text provided for chunking', true);
      }

      const chunker = await this.getChunker();

      let chunks: Chunk[];

      // Use preset mode or custom options
      switch (params.mode) {
        case 'embedding': {
          chunks = chunker.chunkForEmbedding(text);
          break;
        }

        case 'rag': {
          chunks = chunker.chunkForRAG(text);
          break;
        }

        case 'document': {
          const instance = chunker.createChunker({
            maxTokens: params.maxTokens ?? 512,
            overlapTokens: params.overlapTokens ?? 50,
            detectHeaders: true,
          });
          chunks = instance.chunkDocument(text, params.documentStructure || {});
          break;
        }

        default: {
          // Custom options
          const instance = chunker.createChunker({
            maxTokens: params.maxTokens ?? 512,
            overlapTokens: params.overlapTokens ?? 50,
            minChunkSize: params.minChunkSize ?? 100,
            preserveParagraphs: params.preserveParagraphs ?? true,
            preserveSentences: params.preserveSentences ?? true,
            detectHeaders: params.detectHeaders ?? true,
            avgCharsPerToken: params.avgCharsPerToken ?? 4,
          });
          chunks = instance.chunk(text);
        }
      }

      // Get stats
      const chunkerInstance = chunker.createChunker({});
      const stats = chunkerInstance.getStats(chunks);

      const result: ChunkResult = {
        chunks,
        stats,
      };

      // Quality score based on average chunk size optimization
      // Ideal is close to maxTokens, penalize very small or uneven chunks
      const idealTokens = params.maxTokens || 512;
      const avgRatio = stats.avgTokens / idealTokens;
      const qualityScore = Math.min(1, Math.max(0.5, avgRatio));

      return this.success(
        result,
        {
          inputLength: text.length,
          chunkCount: chunks.length,
          avgChunkSize: stats.avgTokens,
          mode: params.mode || 'default',
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('CHUNK_ERROR', `Chunking failed: ${message}`, true);
    }
  }
}

export default ChunkTextExecutor;
