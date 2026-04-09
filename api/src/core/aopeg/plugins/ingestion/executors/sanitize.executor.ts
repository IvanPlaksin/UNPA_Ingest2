/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SANITIZE EXECUTOR
 * Wraps TextSanitizer service for AOPEG pipeline
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

interface SanitizeParameters {
  text?: string;
  mode?: 'default' | 'embedding' | 'graph' | 'storage';
  removeHtml?: boolean;
  normalizeWhitespace?: boolean;
  removePII?: boolean;
  preserveStructure?: boolean;
  removeUrls?: boolean;
  removeEmojis?: boolean;
  maxLength?: number;
  preserveCodeBlocks?: boolean;
}

interface SanitizeResult {
  text: string;
  metadata: {
    originalLength: number;
    finalLength: number;
    compressionRatio: number;
    hadPII: boolean;
    hadHtml: boolean;
    codeBlocksPreserved: number;
    changes: Array<{ type: string; count?: number }>;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class SanitizeExecutor extends BaseExecutor {
  readonly type = 'ingestion.sanitize';
  readonly displayName = 'Sanitize Text';
  readonly description = 'Clean and normalize text content, optionally removing PII and HTML';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to sanitize (can also use context.variables.text)',
      },
      mode: {
        type: 'string',
        enum: ['default', 'embedding', 'graph', 'storage'],
        default: 'default',
        description: 'Sanitization preset mode',
      },
      removeHtml: {
        type: 'boolean',
        default: true,
        description: 'Remove HTML tags',
      },
      normalizeWhitespace: {
        type: 'boolean',
        default: true,
        description: 'Normalize whitespace and line endings',
      },
      removePII: {
        type: 'boolean',
        default: false,
        description: 'Remove personally identifiable information',
      },
      preserveStructure: {
        type: 'boolean',
        default: true,
        description: 'Preserve paragraph structure',
      },
      removeUrls: {
        type: 'boolean',
        default: false,
        description: 'Remove URLs from text',
      },
      removeEmojis: {
        type: 'boolean',
        default: false,
        description: 'Remove emoji characters',
      },
      maxLength: {
        type: 'number',
        description: 'Maximum text length (truncate if exceeded)',
      },
      preserveCodeBlocks: {
        type: 'boolean',
        default: true,
        description: 'Preserve code blocks during sanitization',
      },
    },
    required: [],
  };

  private sanitizerModule: typeof import('../../../../../services/preprocessing/sanitizer.service') | null = null;

  /**
   * Lazy load the sanitizer service
   */
  private async getSanitizer() {
    if (!this.sanitizerModule) {
      this.sanitizerModule = await import('../../../../../services/preprocessing/sanitizer.service');
    }
    return this.sanitizerModule;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as SanitizeParameters;

      // Get text from parameters or context
      const text = params.text || (context.variables.text as string) || (context.variables.content as string);

      if (!text || typeof text !== 'string') {
        return this.error('INVALID_INPUT', 'No text provided for sanitization', true);
      }

      const sanitizer = await this.getSanitizer();

      let result: SanitizeResult;

      // Use preset mode or custom options
      switch (params.mode) {
        case 'embedding': {
          const cleanedText = sanitizer.sanitizeForEmbedding(text);
          result = {
            text: cleanedText,
            metadata: {
              originalLength: text.length,
              finalLength: cleanedText.length,
              compressionRatio: cleanedText.length / text.length,
              hadPII: false,
              hadHtml: text.includes('<'),
              codeBlocksPreserved: 0,
              changes: [{ type: 'embedding_preset' }],
            },
          };
          break;
        }

        case 'graph': {
          const cleanedText = sanitizer.sanitizeForGraphExtraction(text);
          result = {
            text: cleanedText,
            metadata: {
              originalLength: text.length,
              finalLength: cleanedText.length,
              compressionRatio: cleanedText.length / text.length,
              hadPII: false,
              hadHtml: text.includes('<'),
              codeBlocksPreserved: 0,
              changes: [{ type: 'graph_preset' }],
            },
          };
          break;
        }

        case 'storage': {
          const sanitized = sanitizer.sanitizeForStorage(text);
          result = {
            text: sanitized.text,
            metadata: {
              ...sanitized.metadata,
              changes: sanitized.changes,
            },
          };
          break;
        }

        default: {
          // Custom options
          const instance = sanitizer.createSanitizer({
            removeHtml: params.removeHtml ?? true,
            normalizeWhitespace: params.normalizeWhitespace ?? true,
            removePII: params.removePII ?? false,
            preserveStructure: params.preserveStructure ?? true,
            removeUrls: params.removeUrls ?? false,
            removeEmojis: params.removeEmojis ?? false,
            maxLength: params.maxLength,
            preserveCodeBlocks: params.preserveCodeBlocks ?? true,
          });

          const sanitized = instance.sanitize(text);
          result = {
            text: sanitized.text,
            metadata: {
              ...sanitized.metadata,
              changes: sanitized.changes,
            },
          };
        }
      }

      // Calculate quality score based on compression ratio
      const qualityScore = Math.min(1, Math.max(0.5, result.metadata.compressionRatio));

      return this.success(
        result,
        {
          inputLength: text.length,
          outputLength: result.text.length,
          mode: params.mode || 'default',
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('SANITIZE_ERROR', `Sanitization failed: ${message}`, true);
    }
  }
}

export default SanitizeExecutor;
