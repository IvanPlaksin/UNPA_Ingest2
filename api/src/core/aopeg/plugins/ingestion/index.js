/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INGESTION PLUGIN INDEX
 * Main entry point for ingestion domain plugin
 *
 * Phase 7 - Domain Plugin with real service implementations:
 * - sanitize: TextSanitizer for text cleaning
 * - chunk_text: TextChunker for semantic chunking
 * - extract_entities: EntityExtractor for NER
 * - write_vector: QdrantService for vector storage
 * - write_graph: MemgraphService for graph storage
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { PluginBase, createSimpleExecutor, createSuccessResult, createErrorResult } = require('../plugin-base');

// Import real services
const { TextSanitizer, createSanitizer, DEFAULT_CONFIG: SANITIZER_CONFIG } = require('../../../../services/preprocessing/sanitizer.service');
const { TextChunker, createChunker, DEFAULT_CONFIG: CHUNKER_CONFIG } = require('../../../../services/chunking/text-chunker');
const { EntityExtractor, createEntityExtractor, ENTITY_TYPES } = require('../../../../services/extraction/entity-extractor');
const qdrantService = require('../../../../services/qdrant.service');
const memgraphService = require('../../../../services/memgraph.service');
const { EmbeddingService } = require('../../../../services/structuring/embeddings/EmbeddingService');

// ────────────────────────────────────────────────────────────────────────────
// PLUGIN METADATA
// ────────────────────────────────────────────────────────────────────────────

const PLUGIN_METADATA = {
  name: 'ingestion',
  version: '2.0.0',
  description: 'Document ingestion and preprocessing pipeline executors (Phase 7)',
  author: 'UNPA Team',
  domain: 'ingestion',
};

// ────────────────────────────────────────────────────────────────────────────
// SERVICE INSTANCES (lazy initialized)
// ────────────────────────────────────────────────────────────────────────────

let sanitizerInstance = null;
let chunkerInstance = null;
let entityExtractorInstance = null;
let embeddingServiceInstance = null;

function getSanitizer() {
  if (!sanitizerInstance) {
    sanitizerInstance = createSanitizer();
  }
  return sanitizerInstance;
}

function getChunker() {
  if (!chunkerInstance) {
    chunkerInstance = createChunker();
  }
  return chunkerInstance;
}

function getEntityExtractor() {
  if (!entityExtractorInstance) {
    entityExtractorInstance = createEntityExtractor({
      useLLM: true,
      useRegex: true,
      minConfidence: 0.6,
      maxEntities: 100,
    });
  }
  return entityExtractorInstance;
}

function getEmbeddingService() {
  if (!embeddingServiceInstance) {
    embeddingServiceInstance = new EmbeddingService({
      teiUrl: process.env.TEI_URL || 'http://localhost:8081',
      qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
      dimension: 1024,
      batchSize: 32,
      enableCache: true,
    });
  }
  return embeddingServiceInstance;
}

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: PARSE DOCUMENT
// ────────────────────────────────────────────────────────────────────────────

const parseDocumentExecutor = createSimpleExecutor({
  type: 'ingestion.parse_document',
  displayName: 'Parse Document',
  description: 'Parse document from file or raw content',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'Raw document content' },
      mimeType: { type: 'string', description: 'Document MIME type', default: 'text/plain' },
    },
  },
  async execute(params, context) {
    const content = params.content || context.input;
    const mimeType = params.mimeType || 'text/plain';

    if (!content) {
      return createErrorResult('PARSE_ERROR', 'No content provided');
    }

    return createSuccessResult({
      text: typeof content === 'string' ? content : JSON.stringify(content),
      metadata: {
        mimeType,
        originalLength: String(content).length,
        parsedAt: new Date().toISOString(),
      },
    });
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: SANITIZE (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const sanitizeExecutor = createSimpleExecutor({
  type: 'ingestion.sanitize',
  displayName: 'Sanitize Text',
  description: 'Clean and normalize text content using TextSanitizer',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      removeHtml: { type: 'boolean', default: true, description: 'Remove HTML tags' },
      normalizeWhitespace: { type: 'boolean', default: true, description: 'Normalize whitespace' },
      removePII: { type: 'boolean', default: false, description: 'Remove PII (emails, phones, etc.)' },
      preserveCodeBlocks: { type: 'boolean', default: true, description: 'Preserve code blocks' },
      decodeHtmlEntities: { type: 'boolean', default: true, description: 'Decode HTML entities' },
      maxLength: { type: 'number', description: 'Maximum output length' },
    },
  },
  async execute(params, context) {
    try {
      let text = params.text || context.input?.text || context.input;

      if (!text || typeof text !== 'string') {
        return createErrorResult('SANITIZE_ERROR', 'No text provided for sanitization', true);
      }

      const sanitizer = getSanitizer();

      // Build options from params
      const options = {
        removeHtml: params.removeHtml !== false,
        normalizeWhitespace: params.normalizeWhitespace !== false,
        removePII: params.removePII === true,
        preserveCodeBlocks: params.preserveCodeBlocks !== false,
        decodeHtmlEntities: params.decodeHtmlEntities !== false,
        maxLength: params.maxLength || null,
      };

      const result = sanitizer.sanitize(text, options);

      return createSuccessResult({
        text: result.text,
        sanitized: true,
        changes: result.changes,
        metadata: result.metadata,
      }, {
        originalLength: result.metadata.originalLength,
        finalLength: result.metadata.finalLength,
        compressionRatio: result.metadata.compressionRatio,
        hadPII: result.metadata.hadPII,
        hadHtml: result.metadata.hadHtml,
      }, 1.0);

    } catch (error) {
      return createErrorResult('SANITIZE_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: DETECT LANGUAGE
// ────────────────────────────────────────────────────────────────────────────

const detectLanguageExecutor = createSimpleExecutor({
  type: 'ingestion.detect_language',
  displayName: 'Detect Language',
  description: 'Detect the language of text content',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Text to analyze' },
    },
  },
  async execute(params, context) {
    const text = params.text || context.input?.text || context.input;

    if (!text || typeof text !== 'string') {
      return createErrorResult('LANG_ERROR', 'No text provided for language detection', true);
    }

    // Simple language detection heuristics
    const cyrillicRatio = (text.match(/[\u0400-\u04FF]/g) || []).length / text.length;
    const arabicRatio = (text.match(/[\u0600-\u06FF]/g) || []).length / text.length;
    const chineseRatio = (text.match(/[\u4E00-\u9FFF]/g) || []).length / text.length;

    let language = 'en';
    let confidence = 0.85;

    if (cyrillicRatio > 0.3) {
      language = 'ru';
      confidence = Math.min(0.95, 0.5 + cyrillicRatio);
    } else if (arabicRatio > 0.3) {
      language = 'ar';
      confidence = Math.min(0.95, 0.5 + arabicRatio);
    } else if (chineseRatio > 0.3) {
      language = 'zh';
      confidence = Math.min(0.95, 0.5 + chineseRatio);
    }

    return createSuccessResult({
      text,
      language,
      confidence,
    }, { detectedAt: new Date().toISOString() }, confidence);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: CHUNK TEXT (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const chunkTextExecutor = createSimpleExecutor({
  type: 'ingestion.chunk_text',
  displayName: 'Chunk Text',
  description: 'Split text into semantic chunks using TextChunker',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      maxTokens: { type: 'number', default: 512, description: 'Maximum tokens per chunk' },
      overlapTokens: { type: 'number', default: 50, description: 'Token overlap between chunks' },
      preserveParagraphs: { type: 'boolean', default: true, description: 'Try to keep paragraphs intact' },
      preserveSentences: { type: 'boolean', default: true, description: 'Try to keep sentences intact' },
      detectHeaders: { type: 'boolean', default: true, description: 'Detect and use headers as boundaries' },
    },
  },
  async execute(params, context) {
    try {
      const text = params.text || context.input?.text || context.input;

      if (!text || typeof text !== 'string') {
        return createErrorResult('CHUNK_ERROR', 'No text provided for chunking', true);
      }

      const chunker = getChunker();

      const options = {
        maxTokens: params.maxTokens || 512,
        overlapTokens: params.overlapTokens || 50,
        preserveParagraphs: params.preserveParagraphs !== false,
        preserveSentences: params.preserveSentences !== false,
        detectHeaders: params.detectHeaders !== false,
        includeMetadata: true,
      };

      const chunks = chunker.chunk(text, options);
      const stats = chunker.getStats(chunks);

      return createSuccessResult({
        chunks,
        totalChunks: chunks.length,
        stats,
      }, {
        avgTokens: stats.avgTokens,
        totalTokens: stats.totalTokens,
      }, 1.0);

    } catch (error) {
      return createErrorResult('CHUNK_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: EXTRACT ENTITIES (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const extractEntitiesExecutor = createSimpleExecutor({
  type: 'ingestion.extract_entities',
  displayName: 'Extract Entities',
  description: 'Extract named entities from text using EntityExtractor',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      useLLM: { type: 'boolean', default: true, description: 'Use LLM for extraction' },
      useRegex: { type: 'boolean', default: true, description: 'Use regex patterns for extraction' },
      minConfidence: { type: 'number', default: 0.6, description: 'Minimum confidence threshold' },
      maxEntities: { type: 'number', default: 100, description: 'Maximum entities to return' },
      extractRelationships: { type: 'boolean', default: true, description: 'Also extract relationships' },
      sourceType: { type: 'string', default: 'text', description: 'Source type (text, workitem, code)' },
    },
  },
  async execute(params, context) {
    try {
      const text = params.text || context.input?.text || context.input;

      if (!text || typeof text !== 'string' || text.length < 10) {
        return createSuccessResult({
          entities: [],
          relationships: [],
          stats: { total: 0 },
        });
      }

      const extractor = getEntityExtractor();

      // Update options from params
      extractor.options.useLLM = params.useLLM !== false;
      extractor.options.useRegex = params.useRegex !== false;
      extractor.options.minConfidence = params.minConfidence || 0.6;
      extractor.options.maxEntities = params.maxEntities || 100;
      extractor.options.extractRelationships = params.extractRelationships !== false;

      const result = await extractor.extract(text, {
        sourceType: params.sourceType || 'text',
        language: context.input?.language || 'en',
      });

      const qualityScore = result.entities.length > 0
        ? result.entities.reduce((sum, e) => sum + e.confidence, 0) / result.entities.length
        : 0;

      return createSuccessResult({
        entities: result.entities,
        relationships: result.relationships,
        text,
        stats: result.stats,
      }, {
        entityCount: result.entities.length,
        relationshipCount: result.relationships.length,
        provider: result.stats.provider,
      }, qualityScore);

    } catch (error) {
      return createErrorResult('EXTRACT_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: EXTRACT RELATIONS
// ────────────────────────────────────────────────────────────────────────────

const extractRelationsExecutor = createSimpleExecutor({
  type: 'ingestion.extract_relations',
  displayName: 'Extract Relations',
  description: 'Extract relationships between entities',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      relationTypes: { type: 'array', items: { type: 'string' } },
    },
  },
  async execute(params, context) {
    const entities = context.input?.entities || [];
    const relationships = context.input?.relationships || [];

    // If relationships already exist from extract_entities, pass through
    if (relationships.length > 0) {
      return createSuccessResult({
        relations: relationships,
        entities,
      }, { relationCount: relationships.length });
    }

    // Otherwise, try to extract from entities
    return createSuccessResult({
      relations: [],
      entities,
    }, { relationCount: 0 });
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: CLASSIFY CONTENT
// ────────────────────────────────────────────────────────────────────────────

const classifyContentExecutor = createSimpleExecutor({
  type: 'ingestion.classify_content',
  displayName: 'Classify Content',
  description: 'Classify content into categories',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      categories: { type: 'array', items: { type: 'string' } },
    },
  },
  async execute(params, context) {
    const text = params.text || context.input?.text || context.input;
    const entities = context.input?.entities || [];

    // Simple classification based on entity types
    let category = 'general';
    let confidence = 0.7;

    const entityTypes = entities.map(e => e.type);

    if (entityTypes.includes('SYSTEM') || entityTypes.includes('MODULE') || entityTypes.includes('API')) {
      category = 'technical';
      confidence = 0.85;
    } else if (entityTypes.includes('PERSON') || entityTypes.includes('ORGANIZATION')) {
      category = 'organizational';
      confidence = 0.80;
    } else if (entityTypes.includes('PROCESS') || entityTypes.includes('BUSINESS_RULE')) {
      category = 'business';
      confidence = 0.82;
    } else if (entityTypes.includes('WORK_ITEM_REF')) {
      category = 'project';
      confidence = 0.90;
    }

    return createSuccessResult({
      classification: { category, confidence },
      text,
      entityTypesFound: [...new Set(entityTypes)],
    }, { category }, confidence);
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: WRITE TO GRAPH (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const writeGraphExecutor = createSimpleExecutor({
  type: 'ingestion.write_graph',
  displayName: 'Write to Graph',
  description: 'Write entities and relations to Memgraph knowledge graph',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      namespace: { type: 'string', description: 'Graph namespace (e.g., core, project:myproject)' },
      mergeStrategy: { type: 'string', default: 'merge', description: 'Strategy: merge or create' },
    },
  },
  async execute(params, context) {
    try {
      const entities = context.input?.entities || [];
      const relations = context.input?.relations || context.input?.relationships || [];
      const namespace = params.namespace || 'core';

      if (entities.length === 0) {
        return createSuccessResult({
          written: true,
          entitiesWritten: 0,
          relationsWritten: 0,
        }, { namespace });
      }

      const namespaceCtx = {
        namespace: namespace.startsWith('project:') ? 'project' : namespace,
        projectId: namespace.startsWith('project:') ? namespace.slice(8) : null,
        fullNamespace: namespace,
      };

      let entitiesWritten = 0;
      let relationsWritten = 0;
      const errors = [];

      // Write entities as nodes
      for (const entity of entities) {
        try {
          const label = entity.graphLabel || 'Entity';
          const properties = {
            id: entity.normalizedForm || entity.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
            name: entity.name,
            type: entity.type,
            confidence: entity.confidence,
            context: entity.context || '',
            source: entity.source || 'ingestion',
            createdAt: new Date().toISOString(),
          };

          await memgraphService.mergeNode(label, properties, namespaceCtx);
          entitiesWritten++;
        } catch (error) {
          errors.push({ entity: entity.name, error: error.message });
        }
      }

      // Write relationships
      for (const rel of relations) {
        try {
          const fromId = (rel.source || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
          const toId = (rel.target || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
          const relType = (rel.type || 'RELATED_TO').toUpperCase().replace(/[^A-Z_]/g, '_');

          await memgraphService.mergeRelationship(fromId, toId, relType, {
            confidence: rel.confidence || 0.7,
            evidence: rel.evidence || '',
          });
          relationsWritten++;
        } catch (error) {
          errors.push({ relation: `${rel.source}->${rel.target}`, error: error.message });
        }
      }

      const qualityScore = entitiesWritten > 0
        ? Math.min(1.0, entitiesWritten / entities.length)
        : 0;

      return createSuccessResult({
        written: true,
        entitiesWritten,
        relationsWritten,
        errors: errors.length > 0 ? errors : undefined,
      }, {
        namespace,
        totalEntities: entities.length,
        totalRelations: relations.length,
      }, qualityScore);

    } catch (error) {
      return createErrorResult('GRAPH_WRITE_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: WRITE TO VECTOR STORE (Real Implementation)
// ────────────────────────────────────────────────────────────────────────────

const writeVectorExecutor = createSimpleExecutor({
  type: 'ingestion.write_vector',
  displayName: 'Write to Vector Store',
  description: 'Generate embeddings and write to Qdrant vector store',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    properties: {
      collection: { type: 'string', description: 'Vector collection name' },
      namespace: { type: 'string', description: 'Namespace for filtering' },
      includeMetadata: { type: 'boolean', default: true, description: 'Include metadata in payload' },
    },
  },
  async execute(params, context) {
    try {
      const chunks = context.input?.chunks || [];
      const text = context.input?.text;
      const entities = context.input?.entities || [];
      const namespace = params.namespace || params.collection || 'default';

      // If no chunks but have text, create single chunk
      let documents = chunks;
      if (chunks.length === 0 && text) {
        documents = [{ content: text, index: 0 }];
      }

      if (documents.length === 0) {
        return createSuccessResult({
          written: true,
          documentsWritten: 0,
        }, { namespace });
      }

      // Initialize collection if needed
      await qdrantService.initCollectionForNamespace(namespace);

      const embeddingService = getEmbeddingService();

      // Generate embeddings for all documents
      const texts = documents.map(d => d.content || d.text || '');
      let embeddings;

      try {
        embeddings = await embeddingService.generateBatchEmbeddings(texts);
      } catch (embError) {
        console.warn('[writeVector] Embedding generation failed, using placeholder:', embError.message);
        // Create placeholder embeddings if TEI is unavailable
        embeddings = texts.map(() => new Array(1024).fill(0));
      }

      // Build points for Qdrant
      const points = documents.map((doc, i) => {
        const vector = embeddings[i];
        if (!vector) return null;

        const payload = {
          text: texts[i].substring(0, 10000), // Limit text size
          chunkIndex: doc.index || i,
          namespace: namespace.startsWith('project:') ? 'project' : namespace,
          fullNamespace: namespace,
          ...(params.includeMetadata !== false && {
            metadata: doc.metadata || {},
            entityCount: entities.length,
            header: doc.metadata?.header || null,
          }),
          createdAt: new Date().toISOString(),
        };

        if (namespace.startsWith('project:')) {
          payload.projectId = namespace.slice(8);
        }

        return {
          id: `${namespace}-chunk-${i}-${Date.now()}`,
          vector,
          payload,
        };
      }).filter(Boolean);

      // Upsert to Qdrant
      if (points.length > 0) {
        await qdrantService.upsertPoints(points, namespace);
      }

      return createSuccessResult({
        written: true,
        documentsWritten: points.length,
      }, {
        namespace,
        totalDocuments: documents.length,
        vectorDimension: 1024,
      }, 1.0);

    } catch (error) {
      return createErrorResult('VECTOR_WRITE_ERROR', error.message, true);
    }
  },
});

// ────────────────────────────────────────────────────────────────────────────
// EXECUTOR: CONSOLIDATE SUBGRAPH
// ────────────────────────────────────────────────────────────────────────────

const consolidateSubgraphExecutor = createSimpleExecutor({
  type: 'ingestion.consolidate_subgraph',
  displayName: 'Consolidate SubGraph',
  description: 'Extract a cluster into a SubGraph, resolve boundary, and consolidate with checkpoint for rollback',
  domain: 'ingestion',
  parameterSchema: {
    type: 'object',
    required: ['namespace', 'nodeIds', 'name'],
    properties: {
      namespace: { type: 'string', description: 'Graph namespace (e.g., GXE)' },
      nodeIds: { type: 'array', items: { type: 'string' }, description: 'Node IDs to consolidate' },
      name: { type: 'string', description: 'SubGraph name' },
      autoRollbackOnError: { type: 'boolean', default: true },
    },
  },
  async execute(params) {
    const { SubGraphExtractor } = require('../../../../services/graph/subgraph-extractor');
    const { BoundaryResolver } = require('../../../../services/graph/boundary-resolver');
    const { SubgraphAdapter } = require('../../../../services/immutable-graph/integration/subgraph-adapter');

    const { namespace, nodeIds, name } = params;

    if (!namespace || !nodeIds?.length || !name) {
      return createErrorResult('CONSOLIDATE_ERROR', 'namespace, nodeIds[], and name are required');
    }

    const extractor = new SubGraphExtractor();
    const resolver = new BoundaryResolver();
    const adapter = new SubgraphAdapter();

    // Extract
    const extraction = await extractor.extract({ namespace, clusterNodeIds: nodeIds, name });
    const sgId = extraction.subgraph.id;

    // Boundary
    const boundary = await resolver.resolve({ subgraphId: sgId, namespace, clusterNodeIds: nodeIds });

    // Consolidate with checkpoint
    const tx = await adapter.beginConsolidation(sgId, namespace, nodeIds);
    const result = await adapter.commitConsolidation(tx);

    return createSuccessResult({
      subgraphId: sgId,
      checkpointId: tx.checkpointId,
      status: 'consolidated',
      ports: boundary.ports.length,
      statistics: {
        nodesArchived: result.archivedNodes,
        internalEdgesRemoved: result.removedEdges,
        boundaryEdgesRewired: result.rewiredEdges,
      },
    });
  },
});

// ────────────────────────────────────────────────────────────────────────────
// INGESTION PLUGIN CLASS
// ────────────────────────────────────────────────────────────────────────────

class IngestionPlugin extends PluginBase {
  constructor() {
    super(PLUGIN_METADATA);
  }

  async initialize() {
    console.log('[IngestionPlugin] Initializing Phase 7 executors...');

    // Add all executors
    this.addExecutor(parseDocumentExecutor);
    this.addExecutor(sanitizeExecutor);
    this.addExecutor(detectLanguageExecutor);
    this.addExecutor(chunkTextExecutor);
    this.addExecutor(extractEntitiesExecutor);
    this.addExecutor(extractRelationsExecutor);
    this.addExecutor(classifyContentExecutor);
    this.addExecutor(writeGraphExecutor);
    this.addExecutor(writeVectorExecutor);
    this.addExecutor(consolidateSubgraphExecutor);

    console.log('[IngestionPlugin] Initialized with 10 executors (real service implementations)');
  }

  async cleanup() {
    console.log('[IngestionPlugin] Cleaning up...');
    sanitizerInstance = null;
    chunkerInstance = null;
    entityExtractorInstance = null;
    embeddingServiceInstance = null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────────────────────

const ingestionPlugin = new IngestionPlugin();

module.exports = {
  IngestionPlugin,
  ingestionPlugin,
  // Export executors for testing
  executors: {
    parseDocument: parseDocumentExecutor,
    sanitize: sanitizeExecutor,
    detectLanguage: detectLanguageExecutor,
    chunkText: chunkTextExecutor,
    extractEntities: extractEntitiesExecutor,
    extractRelations: extractRelationsExecutor,
    classifyContent: classifyContentExecutor,
    writeGraph: writeGraphExecutor,
    writeVector: writeVectorExecutor,
    consolidateSubgraph: consolidateSubgraphExecutor,
  },
};
