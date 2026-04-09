/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WRITE VECTOR EXECUTOR
 * Writes text chunks to Qdrant vector store with embeddings
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

interface Chunk {
  content: string;
  index: number;
  startOffset?: number;
  endOffset?: number;
  tokenEstimate?: number;
  metadata?: Record<string, unknown>;
}

interface WriteVectorParameters {
  chunks?: Chunk[];
  text?: string;
  sourceId?: string;
  sourceType?: string;
  namespace?: string;
  collection?: string;
  metadata?: Record<string, unknown>;
  batchSize?: number;
  generateEmbeddings?: boolean;
}

interface WriteVectorResult {
  pointsWritten: number;
  pointIds: string[];
  collection: string;
  errors: string[];
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class WriteVectorExecutor extends BaseExecutor {
  readonly type = 'ingestion.write_vector';
  readonly displayName = 'Write to Vector Store';
  readonly description = 'Write text chunks to Qdrant vector store with embeddings';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      chunks: {
        type: 'array',
        description: 'Text chunks to write (can use context.variables.chunks)',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            index: { type: 'number' },
            metadata: { type: 'object' },
          },
        },
      },
      text: {
        type: 'string',
        description: 'Single text to write (alternative to chunks)',
      },
      sourceId: {
        type: 'string',
        description: 'ID of the source document',
      },
      sourceType: {
        type: 'string',
        description: 'Type of the source',
      },
      namespace: {
        type: 'string',
        default: 'core',
        description: 'Namespace for the vectors',
      },
      collection: {
        type: 'string',
        description: 'Qdrant collection name (auto-determined from namespace if not provided)',
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata for all points',
      },
      batchSize: {
        type: 'number',
        default: 100,
        description: 'Batch size for upsert operations',
      },
      generateEmbeddings: {
        type: 'boolean',
        default: true,
        description: 'Generate embeddings for the text',
      },
    },
    required: [],
  };

  private qdrantService: typeof import('../../../../../services/qdrant.service') | null = null;
  private embeddingService: typeof import('../../../../../services/embedding.service') | null = null;

  /**
   * Lazy load services
   */
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
      const params = parameters as WriteVectorParameters;

      // Get chunks from parameters or context
      let chunks = params.chunks ||
        (context.variables.chunks as Chunk[]);

      // If no chunks, create single chunk from text
      if (!chunks || chunks.length === 0) {
        const text = params.text ||
          (context.variables.text as string) ||
          (context.variables.sanitizedText as string) ||
          (context.variables.content as string);

        if (text && typeof text === 'string') {
          chunks = [{
            content: text,
            index: 0,
            metadata: {},
          }];
        }
      }

      if (!chunks || chunks.length === 0) {
        return this.error('INVALID_INPUT', 'No chunks or text provided for vector storage', true);
      }

      const qdrant = await this.getQdrant();
      const embedding = await this.getEmbedding();

      const namespace = params.namespace || 'core';
      const batchSize = params.batchSize ?? 100;
      const generateEmbeddings = params.generateEmbeddings ?? true;

      const result: WriteVectorResult = {
        pointsWritten: 0,
        pointIds: [],
        collection: params.collection || qdrant.getCollectionName(namespace),
        errors: [],
      };

      // Process chunks in batches
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const points: Array<{
          id: string;
          vector: number[];
          payload: Record<string, unknown>;
        }> = [];

        for (const chunk of batch) {
          try {
            // Generate embedding if needed
            let vector: number[];
            if (generateEmbeddings) {
              const embeddingResult = await embedding.generateEmbedding(chunk.content);
              vector = embeddingResult.embedding || embeddingResult;
            } else {
              // Use placeholder if embeddings disabled (for testing)
              vector = new Array(1024).fill(0);
            }

            // Generate point ID
            const pointId = this.generatePointId(params.sourceId, chunk.index, namespace);

            // Build payload
            const payload: Record<string, unknown> = {
              content: chunk.content,
              chunkIndex: chunk.index,
              namespace,
              sourceId: params.sourceId,
              sourceType: params.sourceType,
              ...chunk.metadata,
              ...params.metadata,
              createdAt: new Date().toISOString(),
            };

            // Add position info if available
            if (chunk.startOffset !== undefined) {
              payload.startOffset = chunk.startOffset;
              payload.endOffset = chunk.endOffset;
            }
            if (chunk.tokenEstimate !== undefined) {
              payload.tokenEstimate = chunk.tokenEstimate;
            }

            points.push({
              id: pointId,
              vector,
              payload,
            });

            result.pointIds.push(pointId);
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Chunk ${chunk.index}: ${message}`);
          }
        }

        // Upsert batch to Qdrant
        if (points.length > 0) {
          try {
            await qdrant.upsertPoints(points, namespace);
            result.pointsWritten += points.length;
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            result.errors.push(`Batch upsert: ${message}`);
          }
        }
      }

      // Quality score based on success rate
      const successRate = chunks.length > 0 ? result.pointsWritten / chunks.length : 0;
      const qualityScore = successRate;

      return this.success(
        result,
        {
          chunksProcessed: chunks.length,
          pointsWritten: result.pointsWritten,
          errorCount: result.errors.length,
          collection: result.collection,
          namespace,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('WRITE_VECTOR_ERROR', `Vector write failed: ${message}`, true);
    }
  }

  /**
   * Generate a unique point ID
   */
  private generatePointId(sourceId: string | undefined, chunkIndex: number, namespace: string): string {
    const base = sourceId || `anon_${Date.now()}`;
    // Qdrant expects UUID format or positive integer
    // We'll create a deterministic UUID-like string
    const hash = this.simpleHash(`${namespace}:${base}:${chunkIndex}`);
    return hash;
  }

  /**
   * Simple hash function for ID generation
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Return as UUID-like format
    const hex = Math.abs(hash).toString(16).padStart(8, '0');
    const timestamp = Date.now().toString(16).padStart(12, '0');
    return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${timestamp.slice(0, 3)}-${timestamp.slice(3, 7)}-${timestamp.slice(7)}`;
  }
}

export default WriteVectorExecutor;
