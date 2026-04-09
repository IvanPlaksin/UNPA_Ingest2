/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLASSIFY CONTENT EXECUTOR
 * Classifies content type and determines appropriate processing path
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

interface ClassifyContentParameters {
  text?: string;
  filename?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
  classifyForLayer?: boolean;
}

type ContentType =
  | 'code'
  | 'documentation'
  | 'workitem'
  | 'email'
  | 'report'
  | 'specification'
  | 'meeting_notes'
  | 'general'
  | 'unknown';

type KnowledgeLayer = 'Strategic' | 'Business' | 'Code';

interface ClassificationResult {
  contentType: ContentType;
  contentTypeConfidence: number;
  programmingLanguage?: string;
  documentFormat?: string;
  knowledgeLayer?: KnowledgeLayer;
  layerConfidence?: number;
  suggestedTags: string[];
  characteristics: {
    hasCode: boolean;
    hasStructuredData: boolean;
    isTemplate: boolean;
    estimatedTechnicalLevel: 'low' | 'medium' | 'high';
    wordCount: number;
    lineCount: number;
  };
}

// ────────────────────────────────────────────────────────────────────────────
// CLASSIFICATION PATTERNS
// ────────────────────────────────────────────────────────────────────────────

const CODE_PATTERNS = {
  javascript: /(?:function\s+\w+|const\s+\w+\s*=|import\s+.*from|export\s+(?:default|const))/,
  typescript: /(?:interface\s+\w+|type\s+\w+\s*=|:\s*(?:string|number|boolean)\b)/,
  python: /(?:def\s+\w+\s*\(|class\s+\w+:|import\s+\w+|from\s+\w+\s+import)/,
  csharp: /(?:namespace\s+\w+|public\s+class\s+\w+|using\s+\w+;)/,
  sql: /(?:SELECT\s+.+FROM|INSERT\s+INTO|CREATE\s+TABLE|ALTER\s+TABLE)/i,
  json: /^\s*[{\[]/,
  xml: /^\s*<\?xml|<\w+[^>]*>/,
};

const DOCUMENT_PATTERNS = {
  workitem: /(?:work\s*item|user\s*story|bug|task|feature|acceptance\s*criteria)/i,
  specification: /(?:requirement|specification|must\s+(?:be|have)|shall\s+)/i,
  meeting: /(?:meeting\s*notes|attendees|agenda|action\s*items|discussed)/i,
  email: /(?:^From:|^To:|^Subject:|^Date:|Dear\s+|Best\s+regards)/im,
  report: /(?:executive\s*summary|findings|conclusion|recommendation)/i,
  documentation: /(?:overview|introduction|getting\s+started|installation|usage)/i,
};

const LAYER_INDICATORS = {
  Strategic: [
    /(?:strategy|strategic|vision|mission|goal|objective|kpi)/i,
    /(?:budget|resource\s*allocation|roadmap|timeline)/i,
    /(?:stakeholder|executive|leadership)/i,
  ],
  Business: [
    /(?:process|workflow|procedure|business\s*rule)/i,
    /(?:requirement|user\s*story|acceptance\s*criteria)/i,
    /(?:team|department|organization|policy)/i,
  ],
  Code: [
    /(?:function|class|interface|module|component)/i,
    /(?:api|endpoint|database|schema|table)/i,
    /(?:test|unit\s*test|integration|deployment)/i,
  ],
};

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR
// ────────────────────────────────────────────────────────────────────────────

export class ClassifyContentExecutor extends BaseExecutor {
  readonly type = 'ingestion.classify_content';
  readonly displayName = 'Classify Content';
  readonly description = 'Classify content type and determine knowledge layer placement';
  readonly domain = 'ingestion';

  readonly parameterSchema = {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to classify (can also use context.variables.text)',
      },
      filename: {
        type: 'string',
        description: 'Original filename for format detection',
      },
      mimeType: {
        type: 'string',
        description: 'MIME type of the content',
      },
      metadata: {
        type: 'object',
        description: 'Additional metadata for classification',
      },
      classifyForLayer: {
        type: 'boolean',
        default: true,
        description: 'Also classify for knowledge layer placement',
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
      const params = parameters as ClassifyContentParameters;

      // Get text from parameters or context
      const text = params.text ||
        (context.variables.text as string) ||
        (context.variables.sanitizedText as string) ||
        (context.variables.content as string);

      if (!text || typeof text !== 'string') {
        return this.error('INVALID_INPUT', 'No text provided for classification', true);
      }

      const filename = params.filename || (context.variables.filename as string);
      const mimeType = params.mimeType || (context.variables.mimeType as string);

      // Classify content type
      const { contentType, confidence: contentTypeConfidence, language } = this.classifyContentType(text, filename, mimeType);

      // Analyze characteristics
      const characteristics = this.analyzeCharacteristics(text, contentType);

      // Determine knowledge layer
      let knowledgeLayer: KnowledgeLayer | undefined;
      let layerConfidence: number | undefined;

      if (params.classifyForLayer !== false) {
        const layerResult = this.classifyLayer(text, contentType, characteristics);
        knowledgeLayer = layerResult.layer;
        layerConfidence = layerResult.confidence;
      }

      // Generate suggested tags
      const suggestedTags = this.generateTags(contentType, characteristics, knowledgeLayer);

      const result: ClassificationResult = {
        contentType,
        contentTypeConfidence,
        programmingLanguage: language,
        documentFormat: this.detectDocumentFormat(filename, mimeType),
        knowledgeLayer,
        layerConfidence,
        suggestedTags,
        characteristics,
      };

      // Quality score based on classification confidence
      const qualityScore = (contentTypeConfidence + (layerConfidence || contentTypeConfidence)) / 2;

      return this.success(
        result,
        {
          inputLength: text.length,
          contentType,
          knowledgeLayer,
          tagCount: suggestedTags.length,
          duration: Date.now() - startTime,
        },
        qualityScore
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return this.error('CLASSIFY_ERROR', `Classification failed: ${message}`, true);
    }
  }

  /**
   * Classify the content type
   */
  private classifyContentType(
    text: string,
    filename?: string,
    mimeType?: string
  ): { contentType: ContentType; confidence: number; language?: string } {
    // Check file extension first
    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      const codeExtensions: Record<string, string> = {
        js: 'javascript',
        ts: 'typescript',
        jsx: 'javascript',
        tsx: 'typescript',
        py: 'python',
        cs: 'csharp',
        java: 'java',
        sql: 'sql',
        json: 'json',
        xml: 'xml',
      };

      if (ext && ext in codeExtensions) {
        return { contentType: 'code', confidence: 0.95, language: codeExtensions[ext] };
      }

      const docExtensions = ['md', 'txt', 'doc', 'docx', 'pdf'];
      if (ext && docExtensions.includes(ext)) {
        // Check content to determine doc type
        for (const [type, pattern] of Object.entries(DOCUMENT_PATTERNS)) {
          if (pattern.test(text)) {
            return { contentType: type as ContentType, confidence: 0.85 };
          }
        }
        return { contentType: 'documentation', confidence: 0.8 };
      }
    }

    // Check for code patterns
    for (const [lang, pattern] of Object.entries(CODE_PATTERNS)) {
      if (pattern.test(text)) {
        return { contentType: 'code', confidence: 0.9, language: lang };
      }
    }

    // Check for document patterns
    for (const [type, pattern] of Object.entries(DOCUMENT_PATTERNS)) {
      if (pattern.test(text)) {
        return { contentType: type as ContentType, confidence: 0.8 };
      }
    }

    return { contentType: 'general', confidence: 0.6 };
  }

  /**
   * Analyze content characteristics
   */
  private analyzeCharacteristics(
    text: string,
    contentType: ContentType
  ): ClassificationResult['characteristics'] {
    const lines = text.split('\n');
    const words = text.split(/\s+/).filter(w => w.length > 0);

    // Detect code presence
    let hasCode = contentType === 'code';
    if (!hasCode) {
      const codeBlockPattern = /```[\s\S]*?```|`[^`]+`/g;
      const codeBlocks = text.match(codeBlockPattern);
      hasCode = (codeBlocks?.length || 0) > 0;
    }

    // Detect structured data
    const hasStructuredData =
      CODE_PATTERNS.json.test(text) ||
      CODE_PATTERNS.xml.test(text) ||
      /\|.*\|.*\|/.test(text); // Table detection

    // Check if it's a template
    const isTemplate = /\{\{.*\}\}|\$\{.*\}|<%.*%>/.test(text);

    // Estimate technical level
    const technicalTerms = [
      /api/gi, /database/gi, /server/gi, /client/gi,
      /function/gi, /class/gi, /interface/gi, /module/gi,
      /algorithm/gi, /performance/gi, /security/gi,
    ];
    const techMatches = technicalTerms.reduce(
      (count, pattern) => count + (text.match(pattern)?.length || 0),
      0
    );
    const techDensity = techMatches / Math.max(words.length, 1);

    let estimatedTechnicalLevel: 'low' | 'medium' | 'high' = 'low';
    if (techDensity > 0.05) estimatedTechnicalLevel = 'high';
    else if (techDensity > 0.02) estimatedTechnicalLevel = 'medium';

    return {
      hasCode,
      hasStructuredData,
      isTemplate,
      estimatedTechnicalLevel,
      wordCount: words.length,
      lineCount: lines.length,
    };
  }

  /**
   * Classify content into knowledge layer
   */
  private classifyLayer(
    text: string,
    contentType: ContentType,
    characteristics: ClassificationResult['characteristics']
  ): { layer: KnowledgeLayer; confidence: number } {
    const scores: Record<KnowledgeLayer, number> = {
      Strategic: 0,
      Business: 0,
      Code: 0,
    };

    // Check layer indicators
    for (const [layer, patterns] of Object.entries(LAYER_INDICATORS) as Array<[KnowledgeLayer, RegExp[]]>) {
      for (const pattern of patterns) {
        const matches = text.match(pattern);
        if (matches) {
          scores[layer] += matches.length * 0.1;
        }
      }
    }

    // Content type hints
    if (contentType === 'code') {
      scores.Code += 0.5;
    } else if (contentType === 'specification' || contentType === 'workitem') {
      scores.Business += 0.4;
    } else if (contentType === 'report') {
      scores.Strategic += 0.3;
    }

    // Characteristics hints
    if (characteristics.hasCode) {
      scores.Code += 0.3;
    }
    if (characteristics.estimatedTechnicalLevel === 'high') {
      scores.Code += 0.2;
    }

    // Find highest score
    const sortedLayers = Object.entries(scores).sort((a, b) => b[1] - a[1]) as Array<[KnowledgeLayer, number]>;
    const [topLayer, topScore] = sortedLayers[0];
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);

    // Confidence is the proportion of total score
    const confidence = totalScore > 0 ? Math.min(topScore / totalScore + 0.3, 0.95) : 0.5;

    return { layer: topLayer, confidence };
  }

  /**
   * Detect document format from filename/mimeType
   */
  private detectDocumentFormat(filename?: string, mimeType?: string): string | undefined {
    if (mimeType) {
      const formatMap: Record<string, string> = {
        'application/pdf': 'pdf',
        'application/msword': 'doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
        'text/markdown': 'markdown',
        'text/plain': 'text',
        'text/html': 'html',
        'application/json': 'json',
        'application/xml': 'xml',
      };
      if (mimeType in formatMap) {
        return formatMap[mimeType];
      }
    }

    if (filename) {
      const ext = filename.split('.').pop()?.toLowerCase();
      return ext;
    }

    return undefined;
  }

  /**
   * Generate suggested tags based on classification
   */
  private generateTags(
    contentType: ContentType,
    characteristics: ClassificationResult['characteristics'],
    layer?: KnowledgeLayer
  ): string[] {
    const tags: string[] = [];

    // Content type tag
    tags.push(contentType);

    // Layer tag
    if (layer) {
      tags.push(`layer:${layer.toLowerCase()}`);
    }

    // Technical level
    tags.push(`tech:${characteristics.estimatedTechnicalLevel}`);

    // Characteristic tags
    if (characteristics.hasCode) tags.push('has-code');
    if (characteristics.hasStructuredData) tags.push('structured');
    if (characteristics.isTemplate) tags.push('template');

    // Size tags
    if (characteristics.wordCount > 2000) tags.push('long-form');
    else if (characteristics.wordCount < 100) tags.push('brief');

    return tags;
  }
}

export default ClassifyContentExecutor;
