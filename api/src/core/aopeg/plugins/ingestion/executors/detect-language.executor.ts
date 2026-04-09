/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DETECT LANGUAGE EXECUTOR
 * Wraps LanguageDetector service for AOPEG pipeline
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

interface DetectLanguageParameters {
  text?: string;
  detectCode?: boolean;
  detectMultiple?: boolean;
  minTextLength?: number;
  defaultLanguage?: string;
}

interface LanguageDetectionResult {
  language: string;
  name: string;
  confidence: number;
  script: string;
  isCode: boolean;
  scores: Record<string, number>;
  isUNLanguage?: boolean;
  multipleLanguages?: Array<{
    language: string;
    segments: number;
    avgConfidence: number;
  }>;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class DetectLanguageExecutor extends BaseExecutor {
  readonly type = 'ingestion.detect_language';
  readonly displayName = 'Detect Language';
  readonly description = 'Detect the language of text content, optimized for UN official languages';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to analyze (can also use context.variables.text)',
      },
      detectCode: {
        type: 'boolean',
        default: true,
        description: 'Detect if text is programming code',
      },
      detectMultiple: {
        type: 'boolean',
        default: false,
        description: 'Detect multiple languages in the text',
      },
      minTextLength: {
        type: 'number',
        default: 20,
        description: 'Minimum text length for detection',
      },
      defaultLanguage: {
        type: 'string',
        default: 'en',
        description: 'Default language if detection fails',
      },
    },
    required: [],
  };

  private detectorModule: typeof import('../../../../../services/preprocessing/language-detector') | null = null;

  /**
   * Lazy load the language detector service
   */
  private async getDetector() {
    if (!this.detectorModule) {
      this.detectorModule = await import('../../../../../services/preprocessing/language-detector');
    }
    return this.detectorModule;
  }

  async execute(
    parameters: Record<string, unknown>,
    context: ExecutionContext
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();

    try {
      const params = parameters as DetectLanguageParameters;

      // Get text from parameters or context
      const text = params.text ||
        (context.variables.text as string) ||
        (context.variables.sanitizedText as string) ||
        (context.variables.content as string);

      if (!text || typeof text !== 'string') {
        return this.error('INVALID_INPUT', 'No text provided for language detection', true);
      }

      const detector = await this.getDetector();

      // Create detector with options
      const detectorInstance = detector.createDetector({
        minTextLength: params.minTextLength ?? 20,
        defaultLanguage: params.defaultLanguage ?? 'en',
        detectCode: params.detectCode ?? true,
      });

      // Detect language
      const result = detectorInstance.detect(text);

      // Build output
      const output: LanguageDetectionResult = {
        language: result.language,
        name: result.name,
        confidence: result.confidence,
        script: result.script,
        isCode: result.isCode,
        scores: result.scores,
        isUNLanguage: detector.isUNLanguage(result.language),
      };

      // Optionally detect multiple languages
      if (params.detectMultiple) {
        output.multipleLanguages = detectorInstance.detectMultiple(text);
      }

      // Quality score based on detection confidence
      const qualityScore = result.confidence;

      return this.success(
        output,
        {
          textLength: text.length,
          detectedScript: result.script,
          isMultilingual: (output.multipleLanguages?.length || 0) > 1,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('DETECT_LANG_ERROR', `Language detection failed: ${message}`, true);
    }
  }
}

export default DetectLanguageExecutor;
