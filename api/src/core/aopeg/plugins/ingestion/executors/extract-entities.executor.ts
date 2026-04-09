/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTRACT ENTITIES EXECUTOR
 * Wraps EntityExtractor service for AOPEG pipeline
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

interface ExtractEntitiesParameters {
  text?: string;
  sourceType?: 'text' | 'workitem' | 'code' | 'document';
  filePath?: string;
  language?: string;
  isCode?: boolean;
  useLLM?: boolean;
  useRegex?: boolean;
  minConfidence?: number;
  maxEntities?: number;
  extractRelationships?: boolean;
  llmProvider?: string;
  llmModel?: string;
}

interface Entity {
  name: string;
  type: string;
  normalizedForm: string;
  confidence: number;
  context: string;
  source: string;
  sources?: string[];
  graphLabel?: string;
  startIndex?: number;
  category?: string;
  workItemId?: string;
  codeContext?: {
    type: string;
    language: string;
    filePath?: string;
    extends?: string;
    implements?: string;
  };
}

interface EntityExtractionResult {
  entities: Entity[];
  relationships: Array<{
    source: string;
    sourceType: string;
    target: string;
    targetType: string;
    type: string;
    confidence: number;
    evidence?: string;
  }>;
  stats: {
    regex: number;
    llm: number;
    merged: number;
    provider: string;
    regexRelationships?: number;
    llmRelationships?: number;
    totalRelationships?: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class ExtractEntitiesExecutor extends BaseExecutor {
  readonly type = 'ingestion.extract_entities';
  readonly displayName = 'Extract Entities';
  readonly description = 'Extract named entities from text using hybrid regex + LLM approach';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to analyze (can also use context.variables.text)',
      },
      sourceType: {
        type: 'string',
        enum: ['text', 'workitem', 'code', 'document'],
        default: 'text',
        description: 'Type of source content',
      },
      filePath: {
        type: 'string',
        description: 'File path for code analysis',
      },
      language: {
        type: 'string',
        default: 'en',
        description: 'Content language',
      },
      isCode: {
        type: 'boolean',
        default: false,
        description: 'Whether content is source code',
      },
      useLLM: {
        type: 'boolean',
        default: true,
        description: 'Use LLM for semantic extraction',
      },
      useRegex: {
        type: 'boolean',
        default: true,
        description: 'Use regex patterns for fast extraction',
      },
      minConfidence: {
        type: 'number',
        default: 0.6,
        description: 'Minimum confidence threshold',
      },
      maxEntities: {
        type: 'number',
        default: 100,
        description: 'Maximum entities to return',
      },
      extractRelationships: {
        type: 'boolean',
        default: true,
        description: 'Also extract relationships between entities',
      },
      llmProvider: {
        type: 'string',
        description: 'LLM provider to use (ollama, gemini, anthropic)',
      },
      llmModel: {
        type: 'string',
        description: 'LLM model to use',
      },
    },
    required: [],
  };

  private extractorModule: typeof import('../../../../../services/extraction/entity-extractor') | null = null;

  /**
   * Lazy load the entity extractor service
   */
  private async getExtractor() {
    if (!this.extractorModule) {
      this.extractorModule = await import('../../../../../services/extraction/entity-extractor');
    }
    return this.extractorModule;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as ExtractEntitiesParameters;

      // Get text from parameters or context
      const text = params.text ||
        (context.variables.text as string) ||
        (context.variables.sanitizedText as string) ||
        (context.variables.content as string);

      if (!text || typeof text !== 'string') {
        return this.error('INVALID_INPUT', 'No text provided for entity extraction', true);
      }

      const extractorModule = await this.getExtractor();

      // Create extractor with options
      const extractor = extractorModule.createEntityExtractor({
        useLLM: params.useLLM ?? true,
        useRegex: params.useRegex ?? true,
        minConfidence: params.minConfidence ?? 0.6,
        maxEntities: params.maxEntities ?? 100,
        extractRelationships: params.extractRelationships ?? true,
        llmProvider: params.llmProvider,
        model: params.llmModel,
        provider: params.llmProvider,
      });

      // Determine extraction context
      const extractionContext = {
        sourceType: params.sourceType || 'text',
        filePath: params.filePath || '',
        language: params.language || context.variables.detectedLanguage as string || 'en',
        isCode: params.isCode ?? false,
      };

      // Extract entities
      const result = await extractor.extract(text, extractionContext);

      const output: EntityExtractionResult = {
        entities: result.entities,
        relationships: result.relationships,
        stats: result.stats,
      };

      // Quality score based on extraction confidence and coverage
      let qualityScore = 0.7; // Base score
      if (result.entities.length > 0) {
        const avgConfidence = result.entities.reduce((sum, e) => sum + e.confidence, 0) / result.entities.length;
        qualityScore = avgConfidence;
      }

      return this.success(
        output,
        {
          inputLength: text.length,
          entityCount: result.entities.length,
          relationshipCount: result.relationships.length,
          regexEntities: result.stats.regex,
          llmEntities: result.stats.llm,
          llmProvider: result.stats.provider,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('EXTRACT_ENTITIES_ERROR', `Entity extraction failed: ${message}`, true);
    }
  }
}

export default ExtractEntitiesExecutor;
