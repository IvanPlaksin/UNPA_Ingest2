/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXTRACT RELATIONS EXECUTOR
 * Wraps RelationshipExtractor service for AOPEG pipeline
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

interface ExtractRelationsParameters {
  text?: string;
  entities?: Array<{
    name: string;
    type: string;
    normalizedForm?: string;
    confidence?: number;
  }>;
  includeCoOccurrence?: boolean;
  minConfidence?: number;
  maxDistance?: number;
  useLLM?: boolean;
}

interface Relationship {
  source: string;
  sourceType: string;
  target: string;
  targetType: string;
  type: string;
  confidence: number;
  evidence?: string;
  extractionMethod?: string;
  distance?: number;
}

interface RelationExtractionResult {
  relationships: Relationship[];
  stats: {
    total: number;
    byType: Record<string, number>;
    byMethod: Record<string, number>;
    avgConfidence: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class ExtractRelationsExecutor extends BaseExecutor {
  readonly type = 'ingestion.extract_relations';
  readonly displayName = 'Extract Relations';
  readonly description = 'Extract relationships between entities using pattern matching and co-occurrence';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to analyze (can also use context.variables.text)',
      },
      entities: {
        type: 'array',
        description: 'Entities to find relationships between (can use context.variables.entities)',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            type: { type: 'string' },
            normalizedForm: { type: 'string' },
            confidence: { type: 'number' },
          },
        },
      },
      includeCoOccurrence: {
        type: 'boolean',
        default: true,
        description: 'Include co-occurrence based relationships',
      },
      minConfidence: {
        type: 'number',
        default: 0.5,
        description: 'Minimum confidence threshold for relationships',
      },
      maxDistance: {
        type: 'number',
        default: 200,
        description: 'Maximum character distance for co-occurrence',
      },
      useLLM: {
        type: 'boolean',
        default: false,
        description: 'Use LLM for additional relationship extraction',
      },
    },
    required: [],
  };

  private extractorModule: typeof import('../../../../../services/extraction/relationship-extractor') | null = null;

  /**
   * Lazy load the relationship extractor service
   */
  private async getExtractor() {
    if (!this.extractorModule) {
      this.extractorModule = await import('../../../../../services/extraction/relationship-extractor');
    }
    return this.extractorModule;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as ExtractRelationsParameters;

      // Get text from parameters or context
      const text = params.text ||
        (context.variables.text as string) ||
        (context.variables.sanitizedText as string) ||
        (context.variables.content as string);

      if (!text || typeof text !== 'string') {
        return this.error('INVALID_INPUT', 'No text provided for relationship extraction', true);
      }

      // Get entities from parameters or context
      const entities = params.entities ||
        (context.variables.entities as Array<{ name: string; type: string }>) ||
        [];

      if (entities.length < 2) {
        // Not enough entities for relationship extraction
        return this.success(
          {
            relationships: [],
            stats: {
              total: 0,
              byType: {},
              byMethod: {},
              avgConfidence: 0,
            },
          },
          {
            inputLength: text.length,
            entityCount: entities.length,
            message: 'At least 2 entities required for relationship extraction',
            duration: Date.now() - startTime,
          },
          0.5
        );
      }

      const extractor = await this.getExtractor();

      // Extract relationships using pattern matching and co-occurrence
      const relationships = extractor.extractRelationships(text, entities, {
        includeCoOccurrence: params.includeCoOccurrence ?? true,
        minConfidence: params.minConfidence ?? 0.5,
        maxDistance: params.maxDistance ?? 200,
      });

      // Calculate stats
      const byType: Record<string, number> = {};
      const byMethod: Record<string, number> = {};
      let totalConfidence = 0;

      for (const rel of relationships) {
        byType[rel.type] = (byType[rel.type] || 0) + 1;
        const method = rel.extractionMethod || 'pattern';
        byMethod[method] = (byMethod[method] || 0) + 1;
        totalConfidence += rel.confidence;
      }

      const result: RelationExtractionResult = {
        relationships,
        stats: {
          total: relationships.length,
          byType,
          byMethod,
          avgConfidence: relationships.length > 0 ? totalConfidence / relationships.length : 0,
        },
      };

      // Quality score based on relationship extraction
      const qualityScore = relationships.length > 0 ? result.stats.avgConfidence : 0.5;

      return this.success(
        result,
        {
          inputLength: text.length,
          entityCount: entities.length,
          relationshipCount: relationships.length,
          topRelationType: Object.entries(byType).sort((a, b) => b[1] - a[1])[0]?.[0] || 'none',
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('EXTRACT_RELATIONS_ERROR', `Relationship extraction failed: ${message}`, true);
    }
  }
}

export default ExtractRelationsExecutor;
