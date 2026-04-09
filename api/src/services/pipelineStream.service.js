// api/src/services/pipelineStream.service.js
// Сервис потоковой обработки pipeline с реальными сервисами

const crypto = require('crypto');

// ═══════════════════════════════════════════════════════════════════════════════
// ИМПОРТ РЕАЛЬНЫХ СЕРВИСОВ
// ═══════════════════════════════════════════════════════════════════════════════

// Preprocessing services
let SanitizerService = null;
let LanguageDetectorService = null;
let TextChunkerService = null;
let EntityExtractorService = null;

// Additional services (optional)
let QueryExpansionService = null;
let EmbeddingService = null;
let OntologySchema = null;

// Track which services are available
const servicesStatus = {
  sanitizer: false,
  languageDetector: false,
  textChunker: false,
  entityExtractor: false,
  queryExpansion: false,
  embedding: false,
  ontology: false
};

// Import real services with graceful fallback
try {
  const sanitizerModule = require('./preprocessing/sanitizer.service');
  SanitizerService = sanitizerModule.createSanitizer();
  servicesStatus.sanitizer = true;
  console.log('[PipelineStream] ✓ Sanitizer service loaded');
} catch (e) {
  console.log('[PipelineStream] ✗ Sanitizer service not available, using simulation');
}

try {
  const langModule = require('./preprocessing/language-detector');
  LanguageDetectorService = langModule.createDetector();
  servicesStatus.languageDetector = true;
  console.log('[PipelineStream] ✓ Language detector service loaded');
} catch (e) {
  console.log('[PipelineStream] ✗ Language detector not available, using simulation');
}

try {
  const chunkerModule = require('./chunking/text-chunker');
  TextChunkerService = chunkerModule.createChunker();
  servicesStatus.textChunker = true;
  console.log('[PipelineStream] ✓ Text chunker service loaded');
} catch (e) {
  console.log('[PipelineStream] ✗ Text chunker not available, using simulation');
}

try {
  const extractorModule = require('./extraction/entity-extractor');
  // Create entity extractor without LLM for now (regex-only mode)
  EntityExtractorService = new extractorModule.EntityExtractor({
    useLLM: false,
    useRegex: true,
    minConfidence: 0.6
  });
  servicesStatus.entityExtractor = true;
  console.log('[PipelineStream] ✓ Entity extractor service loaded (regex mode)');
} catch (e) {
  console.log('[PipelineStream] ✗ Entity extractor not available, using simulation');
}

try {
  QueryExpansionService = require('./retrieval/query-expansion.service');
  servicesStatus.queryExpansion = true;
  console.log('[PipelineStream] ✓ Query expansion service loaded');
} catch (e) {
  console.log('[PipelineStream] ✗ Query expansion not available, using simulation');
}

try {
  EmbeddingService = require('./retrieval/embedding.service');
  servicesStatus.embedding = true;
  console.log('[PipelineStream] ✓ Embedding service loaded');
} catch (e) {
  console.log('[PipelineStream] ✗ Embedding service not available, using simulation');
}

try {
  OntologySchema = require('./graph/ontology.schema');
  servicesStatus.ontology = true;
  console.log('[PipelineStream] ✓ Ontology schema loaded');
} catch (e) {
  console.log('[PipelineStream] ✗ Ontology schema not available, using simulation');
}

console.log('[PipelineStream] Services status:', servicesStatus);

const STAGE_NAMES = {
  1: 'sanitization',
  2: 'language_detection',
  3: 'chunking',
  4: 'entity_extraction',
  5: 'query_expansion',
  6: 'embedding',
  7: 'classification',
  8: 'relationships',
  9: 'graph_build'
};

// Симуляция задержки обработки (300-800ms на этап)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = () => delay(300 + Math.random() * 500);

class PipelineStreamService {

  /**
   * Обработка всего pipeline с callbacks для streaming
   */
  async processPipeline(text, options, callbacks) {
    const { onStageStart, onStageProgress, onStageComplete, onError } = callbacks;

    let currentInput = text;
    let entities = [];
    let chunks = [];
    let classifications = {};
    let relationships = [];

    try {
      // Этап 1: Санитизация
      onStageStart(1, STAGE_NAMES[1]);
      const stage1 = await this.processSanitization(currentInput);
      onStageComplete(1, stage1, stage1.duration);
      currentInput = stage1.sanitized;

      // Этап 2: Определение языка
      onStageStart(2, STAGE_NAMES[2]);
      const stage2 = await this.processLanguageDetection(currentInput);
      onStageComplete(2, stage2, stage2.duration);

      // Этап 3: Чанкинг
      onStageStart(3, STAGE_NAMES[3]);
      const stage3 = await this.processChunking(currentInput, options);
      onStageComplete(3, stage3, stage3.duration);
      chunks = stage3.chunks;

      // Этап 4: Извлечение сущностей
      onStageStart(4, STAGE_NAMES[4]);
      const stage4 = await this.processEntityExtraction(chunks, currentInput);
      onStageComplete(4, stage4, stage4.duration);
      entities = stage4.entities;

      // Этап 5: Расширение запросов
      onStageStart(5, STAGE_NAMES[5]);
      const stage5 = await this.processQueryExpansion(entities);
      onStageComplete(5, stage5, stage5.duration);

      // Этап 6: Эмбеддинги
      onStageStart(6, STAGE_NAMES[6]);
      const stage6 = await this.processEmbedding(chunks);
      onStageComplete(6, stage6, stage6.duration);

      // Этап 7: Классификация
      onStageStart(7, STAGE_NAMES[7]);
      const stage7 = await this.processClassification(entities);
      onStageComplete(7, stage7, stage7.duration);
      classifications = stage7.classifications;

      // Этап 8: Связи
      onStageStart(8, STAGE_NAMES[8]);
      const stage8 = await this.processRelationships(entities, chunks);
      onStageComplete(8, stage8, stage8.duration);
      relationships = stage8.relationships;

      // Этап 9: Построение графа
      onStageStart(9, STAGE_NAMES[9]);
      const stage9 = await this.processGraphBuild(entities, relationships, classifications);
      onStageComplete(9, stage9, stage9.duration);

      return stage9;

    } catch (error) {
      throw error;
    }
  }

  /**
   * Обработка отдельного этапа
   */
  async processStage(stageId, input, options) {
    switch (stageId) {
      case 1: return this.processSanitization(input);
      case 2: return this.processLanguageDetection(input);
      case 3: return this.processChunking(input, options);
      case 4: return this.processEntityExtraction(input.chunks || [], input.text || input);
      case 5: return this.processQueryExpansion(input.entities || input);
      case 6: return this.processEmbedding(input.chunks || input);
      case 7: return this.processClassification(input.entities || input);
      case 8: return this.processRelationships(input.entities || [], input.chunks || []);
      case 9: return this.processGraphBuild(input.entities, input.relationships, input.classifications);
      default: throw new Error(`Unknown stage: ${stageId}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 1: Санитизация
  // ─────────────────────────────────────────────────────────────────────────
  async processSanitization(text) {
    const startTime = Date.now();

    // Использование реального сервиса если доступен
    if (servicesStatus.sanitizer && SanitizerService) {
      try {
        const result = SanitizerService.sanitize(text);

        return {
          sanitized: result.text,
          stats: {
            htmlTagsRemoved: result.metadata.hadHtml ? 'yes' : 'no',
            entitiesDecoded: result.changes.some(c => c.type === 'entities_decoded') ? 'yes' : 'no',
            sizeReduction: `${Math.round((1 - result.metadata.compressionRatio) * 100)}%`,
            originalLength: result.metadata.originalLength,
            cleanedLength: result.metadata.finalLength,
            piiRedacted: result.metadata.hadPII,
            codeBlocksPreserved: result.metadata.codeBlocksPreserved
          },
          changes: result.changes,
          usingRealService: true,
          duration: Date.now() - startTime
        };
      } catch (e) {
        console.error('[PipelineStream] Sanitizer error, falling back to simulation:', e.message);
      }
    }

    // Fallback: симуляция санитизации
    await randomDelay();

    const sanitized = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    const htmlTagsRemoved = (text.match(/<[^>]*>/g) || []).length;
    const entitiesDecoded = (text.match(/&\w+;/g) || []).length;

    return {
      sanitized,
      stats: {
        htmlTagsRemoved,
        entitiesDecoded,
        sizeReduction: `${Math.round((1 - sanitized.length / text.length) * 100)}%`,
        originalLength: text.length,
        cleanedLength: sanitized.length
      },
      usingRealService: false,
      duration: Date.now() - startTime
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 2: Определение языка
  // ─────────────────────────────────────────────────────────────────────────
  async processLanguageDetection(text) {
    const startTime = Date.now();

    // Использование реального сервиса если доступен
    if (servicesStatus.languageDetector && LanguageDetectorService) {
      try {
        const result = LanguageDetectorService.detect(text);

        return {
          language: result.name || result.language,
          languageCode: result.language,
          confidence: result.confidence,
          script: result.script,
          isCode: result.isCode,
          scores: result.scores,
          usingRealService: true,
          duration: Date.now() - startTime
        };
      } catch (e) {
        console.error('[PipelineStream] Language detector error, falling back to simulation:', e.message);
      }
    }

    // Fallback: симуляция определения языка
    await randomDelay();

    const hasCode = /function|const|let|var|class|import|export|=>|\(\)|\{\}/.test(text);
    const codeLanguage = hasCode ? this.detectCodeLanguage(text) : null;

    return {
      language: 'English',
      confidence: 0.92 + Math.random() * 0.07,
      codeLanguage: codeLanguage?.language || null,
      codeConfidence: codeLanguage?.confidence || null,
      isMultilingual: false,
      usingRealService: false,
      duration: Date.now() - startTime
    };
  }

  detectCodeLanguage(text) {
    if (/\bfunction\s+\w+\s*\(|const\s+\w+\s*=|=>\s*\{/.test(text)) {
      return { language: 'JavaScript', confidence: 0.85 };
    }
    if (/\bclass\s+\w+|public\s+static|private\s+void/.test(text)) {
      return { language: 'C#', confidence: 0.80 };
    }
    if (/SELECT|INSERT|UPDATE|DELETE|FROM|WHERE/i.test(text)) {
      return { language: 'SQL', confidence: 0.90 };
    }
    return { language: 'Unknown', confidence: 0.5 };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 3: Чанкинг
  // ─────────────────────────────────────────────────────────────────────────
  async processChunking(text, options = {}) {
    const startTime = Date.now();

    // Использование реального сервиса если доступен
    if (servicesStatus.textChunker && TextChunkerService) {
      try {
        const chunks = TextChunkerService.chunk(text, {
          maxTokens: options.maxTokens || 512,
          overlapTokens: options.overlapTokens || 50,
          preserveParagraphs: true,
          preserveSentences: true
        });

        const stats = TextChunkerService.getStats(chunks);

        // Преобразование к ожидаемому формату
        const formattedChunks = chunks.map((chunk, idx) => ({
          id: idx + 1,
          content: chunk.content,
          preview: chunk.content.substring(0, 100) + (chunk.content.length > 100 ? '...' : ''),
          tokens: chunk.tokenEstimate,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          metadata: chunk.metadata
        }));

        return {
          chunks: formattedChunks,
          strategy: 'semantic',
          totalChunks: stats.count,
          avgTokens: stats.avgTokens,
          minTokens: stats.minTokens,
          maxTokens: stats.maxTokens,
          usingRealService: true,
          duration: Date.now() - startTime
        };
      } catch (e) {
        console.error('[PipelineStream] Text chunker error, falling back to simulation:', e.message);
      }
    }

    // Fallback: симуляция чанкинга
    await randomDelay();

    const maxTokens = options.maxTokens || 512;
    const sentences = text.split(/(?<=[.!?])\s+/);
    const chunks = [];
    let currentChunk = '';
    let chunkId = 1;

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxTokens * 4) { // ~4 символа на токен
        if (currentChunk) {
          chunks.push({
            id: chunkId++,
            content: currentChunk.trim(),
            preview: currentChunk.trim().substring(0, 100) + '...',
            tokens: Math.round(currentChunk.length / 4),
            startOffset: 0,
            endOffset: currentChunk.length
          });
        }
        currentChunk = sentence;
      } else {
        currentChunk += ' ' + sentence;
      }
    }

    if (currentChunk.trim()) {
      chunks.push({
        id: chunkId,
        content: currentChunk.trim(),
        preview: currentChunk.trim().substring(0, 100) + (currentChunk.length > 100 ? '...' : ''),
        tokens: Math.round(currentChunk.length / 4),
        startOffset: 0,
        endOffset: currentChunk.length
      });
    }

    return {
      chunks,
      strategy: 'semantic',
      totalChunks: chunks.length,
      avgTokens: chunks.length > 0 ? Math.round(chunks.reduce((sum, c) => sum + c.tokens, 0) / chunks.length) : 0,
      usingRealService: false,
      duration: Date.now() - startTime
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 4: Извлечение сущностей
  // ─────────────────────────────────────────────────────────────────────────
  async processEntityExtraction(chunks, fullText) {
    const startTime = Date.now();

    const text = typeof fullText === 'string' ? fullText : chunks.map(c => c.content).join(' ');

    // Использование реального сервиса если доступен
    if (servicesStatus.entityExtractor && EntityExtractorService) {
      try {
        const result = await EntityExtractorService.extract(text, {
          sourceType: 'text',
          isCode: false
        });

        // Преобразование к ожидаемому формату
        const entities = result.entities.map(e => ({
          id: `entity_${crypto.randomBytes(4).toString('hex')}`,
          name: e.name,
          type: e.type || 'Unknown',
          normalizedForm: e.normalizedForm,
          confidence: e.confidence,
          source: e.source,
          context: e.context,
          graphLabel: e.graphLabel
        }));

        const stats = EntityExtractorService.getStats(result);

        return {
          entities,
          relationships: result.relationships || [],
          statistics: {
            total: stats.totalEntities,
            byType: stats.byType,
            bySource: stats.bySource,
            avgConfidence: parseFloat(stats.avgConfidence) || 0
          },
          usingRealService: true,
          duration: Date.now() - startTime
        };
      } catch (e) {
        console.error('[PipelineStream] Entity extractor error, falling back to simulation:', e.message);
      }
    }

    // Fallback: симуляция извлечения сущностей
    await randomDelay();

    const entities = [];

    // UN системы
    const systems = ['IMIS', 'Umoja', 'Inspira', 'ERP', 'SAP', 'iNeed', 'Unite'];
    systems.forEach(sys => {
      if (text.includes(sys)) {
        entities.push({
          id: `entity_${crypto.randomBytes(4).toString('hex')}`,
          name: sys,
          type: 'System',
          confidence: 0.95 + Math.random() * 0.05,
          source: 'regex'
        });
      }
    });

    // Организации
    const orgs = text.match(/\b(OICT|DGACM|UNDP|UNICEF|WHO|UN\s*Secretariat)\b/gi) || [];
    [...new Set(orgs)].forEach(org => {
      entities.push({
        id: `entity_${crypto.randomBytes(4).toString('hex')}`,
        name: org.toUpperCase(),
        type: 'Organization',
        confidence: 0.90 + Math.random() * 0.08,
        source: 'regex'
      });
    });

    // Элементы кода
    const functions = text.match(/\b(\w+)\s*\(\)/g) || [];
    [...new Set(functions)].forEach(fn => {
      entities.push({
        id: `entity_${crypto.randomBytes(4).toString('hex')}`,
        name: fn,
        type: 'Code',
        confidence: 1.0,
        source: 'regex'
      });
    });

    // Документы (формат ST/SGB/YYYY/N)
    const docs = text.match(/ST\/[A-Z]+\/\d{4}\/\d+/g) || [];
    [...new Set(docs)].forEach(doc => {
      entities.push({
        id: `entity_${crypto.randomBytes(4).toString('hex')}`,
        name: doc,
        type: 'Document',
        confidence: 0.98,
        source: 'regex'
      });
    });

    // Люди (простой паттерн)
    const people = text.match(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g) || [];
    [...new Set(people)].slice(0, 3).forEach(person => {
      if (!systems.includes(person) && person.length > 5) {
        entities.push({
          id: `entity_${crypto.randomBytes(4).toString('hex')}`,
          name: person,
          type: 'Person',
          confidence: 0.70 + Math.random() * 0.15,
          source: 'llm'
        });
      }
    });

    // Бизнес-процессы
    const processes = ['budget', 'allocation', 'calculation', 'reporting', 'workflow'];
    processes.forEach(proc => {
      if (text.toLowerCase().includes(proc)) {
        entities.push({
          id: `entity_${crypto.randomBytes(4).toString('hex')}`,
          name: proc.charAt(0).toUpperCase() + proc.slice(1) + ' Process',
          type: 'Process',
          confidence: 0.80 + Math.random() * 0.15,
          source: 'llm'
        });
      }
    });

    return {
      entities,
      statistics: {
        total: entities.length,
        byType: entities.reduce((acc, e) => {
          acc[e.type] = (acc[e.type] || 0) + 1;
          return acc;
        }, {}),
        bySource: entities.reduce((acc, e) => {
          acc[e.source] = (acc[e.source] || 0) + 1;
          return acc;
        }, {}),
        avgConfidence: entities.length > 0 ? entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length : 0
      },
      usingRealService: false,
      duration: Date.now() - startTime
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 5: Расширение запросов
  // ─────────────────────────────────────────────────────────────────────────
  async processQueryExpansion(entities) {
    const startTime = Date.now();
    await randomDelay();

    if (QueryExpansionService?.expand) {
      const result = QueryExpansionService.expand(entities);
      return { ...result, duration: Date.now() - startTime };
    }

    // Симуляция расширения
    const synonymMap = {
      'IMIS': ['ERP', 'Legacy System', 'Enterprise Resource Planning'],
      'Umoja': ['SAP', 'ERP System', 'Financial System'],
      'Budget': ['allocation', 'funding', 'financial plan'],
      'Calculation': ['computation', 'processing', 'formula'],
      'Report': ['document', 'analysis', 'summary']
    };

    const expansions = entities
      .filter(e => e.type === 'System' || e.type === 'Process')
      .slice(0, 5)
      .map(entity => {
        const baseName = entity.name.replace(' Process', '').replace('()', '');
        return {
          term: entity.name,
          synonyms: synonymMap[baseName] || ['related term 1', 'related term 2'],
          category: entity.type
        };
      });

    return {
      expansions,
      totalTerms: entities.length,
      expandedTerms: expansions.reduce((sum, e) => sum + e.synonyms.length, 0),
      duration: Date.now() - startTime
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 6: Эмбеддинги
  // ─────────────────────────────────────────────────────────────────────────
  async processEmbedding(chunks) {
    const startTime = Date.now();
    await delay(400 + Math.random() * 400); // Эмбеддинги занимают больше времени

    if (EmbeddingService?.generateBatch) {
      const result = await EmbeddingService.generateBatch(chunks);
      return { ...result, duration: Date.now() - startTime };
    }

    // Симуляция эмбеддингов
    const vectors = chunks.length;
    const dimension = 1024;
    const avgTime = Math.round((Date.now() - startTime) / vectors);

    return {
      vectors,
      totalVectors: vectors,
      dimension,
      model: 'nomic-embed-text',
      avgTime: `${avgTime}ms`,
      avgGenerationTime: avgTime,
      clusters: Math.min(Math.ceil(vectors / 2), 3),
      clustersDetected: Math.min(Math.ceil(vectors / 2), 3),
      duration: Date.now() - startTime
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 7: Классификация
  // ─────────────────────────────────────────────────────────────────────────
  async processClassification(entities) {
    const startTime = Date.now();
    await randomDelay();

    if (OntologySchema?.classifyEntities) {
      const result = OntologySchema.classifyEntities(entities);
      return { ...result, duration: Date.now() - startTime };
    }

    // Маппинг слоёв
    const layerMap = {
      'Document': 'Strategic',
      'Policy': 'Strategic',
      'System': 'Business',
      'Process': 'Business',
      'Organization': 'Business',
      'Person': 'Business',
      'Code': 'Code',
      'Function': 'Code',
      'API': 'Code'
    };

    const classifications = {};
    const distribution = { Strategic: 0, Business: 0, Code: 0 };

    entities.forEach(entity => {
      const layer = layerMap[entity.type] || 'Business';
      classifications[entity.name] = {
        layer,
        confidence: 0.85 + Math.random() * 0.15,
        reasoning: `${entity.type} entities are typically in ${layer} layer`
      };
      distribution[layer]++;
    });

    return {
      classifications,
      distribution,
      duration: Date.now() - startTime
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 8: Связи
  // ─────────────────────────────────────────────────────────────────────────
  async processRelationships(entities, chunks) {
    const startTime = Date.now();
    await randomDelay();

    const relationships = [];
    const entityMap = new Map(entities.map(e => [e.name, e]));

    // Генерация связей на основе типов сущностей
    const systems = entities.filter(e => e.type === 'System');
    const processes = entities.filter(e => e.type === 'Process');
    const code = entities.filter(e => e.type === 'Code');
    const people = entities.filter(e => e.type === 'Person');
    const orgs = entities.filter(e => e.type === 'Organization');
    const docs = entities.filter(e => e.type === 'Document');

    // System -> System (DEPENDS_ON)
    if (systems.length >= 2) {
      relationships.push({
        id: `rel_${crypto.randomBytes(4).toString('hex')}`,
        from: systems[0].name,
        to: systems[1].name,
        sourceId: systems[0].id,
        targetId: systems[1].id,
        type: 'DEPENDS_ON',
        confidence: 0.85,
        evidence: 'Co-occurrence in text'
      });
    }

    // System -> Code (CONTAINS)
    systems.forEach(sys => {
      code.forEach(c => {
        relationships.push({
          id: `rel_${crypto.randomBytes(4).toString('hex')}`,
          from: sys.name,
          to: c.name,
          sourceId: sys.id,
          targetId: c.id,
          type: 'CONTAINS',
          confidence: 0.90,
          evidence: 'Code belongs to system'
        });
      });
    });

    // Code -> Process (IMPLEMENTS)
    code.forEach(c => {
      processes.forEach(p => {
        relationships.push({
          id: `rel_${crypto.randomBytes(4).toString('hex')}`,
          from: c.name,
          to: p.name,
          sourceId: c.id,
          targetId: p.id,
          type: 'IMPLEMENTS',
          confidence: 0.80,
          evidence: 'Function implements process'
        });
      });
    });

    // Person -> Organization (BELONGS_TO)
    people.forEach(person => {
      if (orgs.length > 0) {
        relationships.push({
          id: `rel_${crypto.randomBytes(4).toString('hex')}`,
          from: person.name,
          to: orgs[0].name,
          sourceId: person.id,
          targetId: orgs[0].id,
          type: 'BELONGS_TO',
          confidence: 0.75,
          evidence: 'Person mentioned with organization'
        });
      }
    });

    // Document -> Process (DEFINES)
    docs.forEach(doc => {
      processes.forEach(p => {
        relationships.push({
          id: `rel_${crypto.randomBytes(4).toString('hex')}`,
          from: doc.name,
          to: p.name,
          sourceId: doc.id,
          targetId: p.id,
          type: 'DEFINES',
          confidence: 0.85,
          evidence: 'Document defines process rules'
        });
      });
    });

    return {
      relationships,
      statistics: {
        total: relationships.length,
        byType: relationships.reduce((acc, r) => {
          acc[r.type] = (acc[r.type] || 0) + 1;
          return acc;
        }, {}),
        avgConfidence: relationships.length > 0
          ? relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length
          : 0
      },
      duration: Date.now() - startTime
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ЭТАП 9: Построение графа
  // ─────────────────────────────────────────────────────────────────────────
  async processGraphBuild(entities, relationships, classifications) {
    const startTime = Date.now();
    await randomDelay();

    const layerColors = {
      Strategic: '#FF6B9D',
      Business: '#00D4FF',
      Code: '#7B61FF'
    };

    const typeShapes = {
      System: 'cube',
      Person: 'sphere',
      Process: 'cube',
      Code: 'sphere',
      Document: 'cube',
      Organization: 'cube'
    };

    const nodes = entities.map((entity, index) => {
      const layer = classifications[entity.name]?.layer || 'Business';
      return {
        id: entity.id || entity.name,
        name: entity.name,
        type: entity.type,
        layer,
        confidence: entity.confidence,
        color: layerColors[layer],
        size: entity.type === 'System' ? 8 : entity.type === 'Code' ? 5 : 6,
        shape: typeShapes[entity.type] || 'sphere'
      };
    });

    const links = relationships.map(rel => ({
      source: rel.sourceId || rel.from,
      target: rel.targetId || rel.to,
      type: rel.type,
      confidence: rel.confidence
    }));

    return {
      nodes,
      links,
      metadata: {
        totalNodes: nodes.length,
        totalLinks: links.length,
        layerDistribution: {
          Strategic: nodes.filter(n => n.layer === 'Strategic').length,
          Business: nodes.filter(n => n.layer === 'Business').length,
          Code: nodes.filter(n => n.layer === 'Code').length
        }
      },
      duration: Date.now() - startTime
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Вспомогательные методы экспорта
  // ─────────────────────────────────────────────────────────────────────────
  graphToCypher(graphData) {
    const { nodes, links } = graphData;
    let cypher = '// Generated Cypher statements\n\n';

    // Создание узлов
    nodes.forEach(node => {
      cypher += `CREATE (n:${node.type} {id: '${node.id}', name: '${node.name}', layer: '${node.layer}'});\n`;
    });

    cypher += '\n';

    // Создание связей
    links.forEach(link => {
      cypher += `MATCH (a {id: '${link.source}'}), (b {id: '${link.target}'}) CREATE (a)-[:${link.type}]->(b);\n`;
    });

    return cypher;
  }

  graphToGexf(graphData) {
    const { nodes, links } = graphData;

    let gexf = `<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://www.gexf.net/1.2draft" version="1.2">
  <graph mode="static" defaultedgetype="directed">
    <nodes>\n`;

    nodes.forEach(node => {
      gexf += `      <node id="${node.id}" label="${node.name}">
        <attvalues>
          <attvalue for="type" value="${node.type}"/>
          <attvalue for="layer" value="${node.layer}"/>
        </attvalues>
      </node>\n`;
    });

    gexf += `    </nodes>
    <edges>\n`;

    links.forEach((link, i) => {
      gexf += `      <edge id="${i}" source="${link.source}" target="${link.target}" label="${link.type}"/>\n`;
    });

    gexf += `    </edges>
  </graph>
</gexf>`;

    return gexf;
  }
}

module.exports = new PipelineStreamService();
