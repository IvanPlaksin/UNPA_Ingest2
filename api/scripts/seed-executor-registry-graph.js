#!/usr/bin/env node
/**
 * Seed Executor Registry Graph
 * Creates a tool-catalog graph representing all 32 AOPEG executors
 * across 4 plugins (ingestion, common, ai, rag) with full metadata,
 * service dependencies, and valid chaining patterns.
 *
 * Stored in Memgraph under the "core" namespace via GraphCatalog.
 *
 * Usage: node api/scripts/seed-executor-registry-graph.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH DEFINITION: AOPEG Executor Tool Registry
// ═══════════════════════════════════════════════════════════════════════════

const EXECUTOR_REGISTRY_GRAPH = {
  name: 'AOPEG Executor Tool Registry',
  namespace: 'core',
  type: 'tool',
  description:
    'Searchable catalog of all 37 AOPEG executors across 7 plugins (ingestion, common, ai, rag, filesystem, session, script). ' +
    'Each tool node contains full metadata: implementation path, class name, input/output schemas, ' +
    'service dependencies, and quality score formulas. Used for runtime discovery and pipeline composition.',
  version: '1.0.0',
  createdBy: 'system',
  tags: ['registry', 'tool-catalog', 'aopeg', 'executors', 'core', 'metadata'],
  isPublic: true,

  // ── NODES ──────────────────────────────────────────────────────────────
  nodes: [
    // ─────────────────────────────────────────────────────────────────────
    //  ROOT CONTAINER
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'registry-root',
      type: 'container',
      data: {
        label: 'AOPEG Executor Tool Registry',
        name: 'AOPEG Executor Tool Registry',
        type: 'container',
        description: 'Catalog of all 37 AOPEG executors across 7 plugin domains',
        version: '2.0.0',
        namespace: 'core',
        totalExecutors: 37,
        totalDomains: 7,
      },
      position: { x: 0, y: 1500 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  DOMAIN GROUP NODES (4)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'domain-ingestion',
      type: 'domainGroup',
      data: {
        label: 'Ingestion Plugin',
        pluginDomain: 'ingestion',
        pluginName: 'ingestion',
        pluginVersion: '2.0.0',
        description: 'Document ingestion and preprocessing pipeline executors',
        executorCount: 9,
        implementationFile: 'api/src/core/aopeg/plugins/ingestion/index.js',
        color: '#22c55e',
      },
      position: { x: 300, y: 400 },
    },
    {
      id: 'domain-common',
      type: 'domainGroup',
      data: {
        label: 'Common Plugin',
        pluginDomain: 'common',
        pluginName: 'aopeg-common',
        pluginVersion: '1.0.0',
        description: 'General-purpose executors for flow control and utility operations',
        executorCount: 10,
        implementationFile: 'api/src/plugins/common/common.plugin.ts',
        color: '#64748b',
      },
      position: { x: 300, y: 1350 },
    },
    {
      id: 'domain-ai',
      type: 'domainGroup',
      data: {
        label: 'AI Plugin',
        pluginDomain: 'ai',
        pluginName: 'aopeg-ai',
        pluginVersion: '1.0.0',
        description: 'LLM-powered executors for intelligent text processing',
        executorCount: 5,
        implementationFile: 'api/src/plugins/ai/ai.plugin.ts',
        color: '#f59e0b',
      },
      position: { x: 300, y: 2100 },
    },
    {
      id: 'domain-rag',
      type: 'domainGroup',
      data: {
        label: 'RAG Plugin',
        pluginDomain: 'rag',
        pluginName: 'rag',
        pluginVersion: '2.0.0',
        description: 'Retrieval-Augmented Generation pipeline executors',
        executorCount: 8,
        implementationFile: 'api/src/core/aopeg/plugins/rag/index.js',
        color: '#3b82f6',
      },
      position: { x: 300, y: 2750 },
    },
    {
      id: 'domain-filesystem',
      type: 'domainGroup',
      data: {
        label: 'Filesystem Plugin',
        pluginDomain: 'filesystem',
        pluginName: 'aopeg-filesystem',
        pluginVersion: '1.0.0',
        description: 'Sandboxed file system operations within the Artefacts directory',
        executorCount: 3,
        implementationFile: 'api/src/plugins/filesystem/filesystem.plugin.ts',
        color: '#10b981',
      },
      position: { x: 300, y: 3400 },
    },
    {
      id: 'domain-session',
      type: 'domainGroup',
      data: {
        label: 'Session Plugin',
        pluginDomain: 'session',
        pluginName: 'aopeg-session',
        pluginVersion: '1.0.0',
        description: 'AI session executors for LLM chat interactions within graph execution',
        executorCount: 1,
        implementationFile: 'api/src/plugins/session/session.plugin.ts',
        color: '#8b5cf6',
      },
      position: { x: 300, y: 3850 },
    },
    {
      id: 'domain-script',
      type: 'domainGroup',
      data: {
        label: 'Script Plugin',
        pluginDomain: 'script',
        pluginName: 'aopeg-script',
        pluginVersion: '1.0.0',
        description: 'Sandboxed JavaScript execution for data transformation and scripting',
        executorCount: 1,
        implementationFile: 'api/src/plugins/script/script.plugin.ts',
        color: '#ec4899',
      },
      position: { x: 300, y: 4100 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  SERVICE DEPENDENCY NODES (7)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'svc-memgraph',
      type: 'serviceNode',
      data: {
        label: 'Memgraph',
        serviceType: 'graph-database',
        url: 'bolt://localhost:7687',
        description: 'Graph database for knowledge graph storage and Cypher queries',
        implementationFile: 'api/src/services/memgraph.service.js',
      },
      position: { x: 1200, y: 500 },
    },
    {
      id: 'svc-qdrant',
      type: 'serviceNode',
      data: {
        label: 'Qdrant',
        serviceType: 'vector-database',
        url: 'http://localhost:6333',
        description: 'Vector similarity search engine for embeddings',
        implementationFile: 'api/src/services/qdrant.service.js',
      },
      position: { x: 1200, y: 700 },
    },
    {
      id: 'svc-tei',
      type: 'serviceNode',
      data: {
        label: 'TEI',
        serviceType: 'embedding',
        url: 'http://localhost:8081',
        description: 'Text Embeddings Inference (nomic-embed-text, 1024 dimensions)',
        implementationFile: 'api/src/services/tei.service.js',
      },
      position: { x: 1200, y: 900 },
    },
    {
      id: 'svc-llm',
      type: 'serviceNode',
      data: {
        label: 'LLM',
        serviceType: 'language-model',
        providers: ['ollama', 'claude', 'gemini'],
        description: 'LLM provider chain with fallback: Ollama -> Claude -> Gemini',
        implementationFile: 'api/src/services/llm.service.js',
      },
      position: { x: 1200, y: 1100 },
    },
    {
      id: 'svc-redis',
      type: 'serviceNode',
      data: {
        label: 'Redis',
        serviceType: 'cache',
        url: 'redis://localhost:6379',
        description: 'In-memory cache, BullMQ job queue, and pub/sub',
        implementationFile: 'api/src/services/redis.service.js',
      },
      position: { x: 1200, y: 1300 },
    },
    {
      id: 'svc-filesystem',
      type: 'serviceNode',
      data: {
        label: 'Filesystem',
        serviceType: 'storage',
        description: 'Local filesystem for document I/O and temporary files',
      },
      position: { x: 1200, y: 1500 },
    },
    {
      id: 'svc-chromadb',
      type: 'serviceNode',
      data: {
        label: 'ChromaDB',
        serviceType: 'vector-database',
        url: 'http://localhost:8000',
        description: 'Alternative vector database (legacy)',
      },
      position: { x: 1200, y: 1700 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  INGESTION PLUGIN TOOLS (9)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tool-ingestion-parse-document',
      type: 'toolNode',
      data: {
        label: 'Parse Document',
        executorType: 'ingestion.parse_document',
        description: 'Parse PDF, DOCX, TXT, MD, HTML documents to extract raw text with metadata and structure detection',
        parameters: {
          executorType: 'ingestion.parse_document',
          className: 'parseDocumentExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            content: { type: 'string', description: 'Raw document content or base64' },
            mimeType: { type: 'string', default: 'text/plain' },
            filePath: { type: 'string', description: 'Path to document file' },
            extractMetadata: { type: 'boolean', default: true },
            extractStructure: { type: 'boolean', default: true },
          },
          outputSchema: {
            text: 'string',
            format: 'string',
            metadata: '{ title, author, pageCount, wordCount, charCount }',
            structure: '{ sections, hasTableOfContents, hasTables, hasImages }',
          },
          serviceDependencies: ['filesystem'],
          qualityScoreFormula: '1.0 if content parsed successfully, 0 on error',
        },
      },
      position: { x: 700, y: 0 },
    },
    {
      id: 'tool-ingestion-sanitize',
      type: 'toolNode',
      data: {
        label: 'Sanitize & Preprocess',
        executorType: 'ingestion.sanitize',
        description: 'Clean text: strip HTML, decode entities, trim whitespace, PII detection. Presets: default, embedding, graph, storage',
        parameters: {
          executorType: 'ingestion.sanitize',
          className: 'sanitizeExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            text: { type: 'string' },
            mode: { type: 'string', enum: ['default', 'embedding', 'graph', 'storage'], default: 'default' },
            removeHtml: { type: 'boolean', default: true },
            normalizeWhitespace: { type: 'boolean', default: true },
            removePII: { type: 'boolean', default: false },
            preserveStructure: { type: 'boolean', default: true },
            maxLength: { type: 'number', default: 100000 },
            preserveCodeBlocks: { type: 'boolean', default: true },
          },
          outputSchema: {
            text: 'string',
            metadata: '{ originalLength, finalLength, compressionRatio, hadPII, hadHtml, changes }',
          },
          serviceDependencies: [],
          qualityScoreFormula: 'Based on compression ratio',
        },
      },
      position: { x: 700, y: 100 },
    },
    {
      id: 'tool-ingestion-detect-language',
      type: 'toolNode',
      data: {
        label: 'Detect Language',
        executorType: 'ingestion.detect_language',
        description: 'Detect input language (en, fr, es, ar, zh, ru). Code detection if code-to-text ratio > 0.3. UN-optimized.',
        parameters: {
          executorType: 'ingestion.detect_language',
          className: 'detectLanguageExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            text: { type: 'string' },
            detectCode: { type: 'boolean', default: true },
            detectMultiple: { type: 'boolean', default: false },
            minTextLength: { type: 'number', default: 20 },
            defaultLanguage: { type: 'string', default: 'en' },
          },
          outputSchema: {
            language: 'string',
            name: 'string',
            confidence: 'number',
            script: 'string',
            isCode: 'boolean',
            isUNLanguage: 'boolean',
          },
          serviceDependencies: [],
          qualityScoreFormula: 'confidence score from detection (0.5-0.95)',
        },
      },
      position: { x: 700, y: 200 },
    },
    {
      id: 'tool-ingestion-chunk-text',
      type: 'toolNode',
      data: {
        label: 'Semantic Chunking',
        executorType: 'ingestion.chunk_text',
        description: 'Split text into semantic chunks with overlap. Respects paragraph/sentence boundaries. Header detection for section-aware splitting.',
        parameters: {
          executorType: 'ingestion.chunk_text',
          className: 'chunkTextExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            text: { type: 'string' },
            mode: { type: 'string', enum: ['default', 'embedding', 'rag', 'document'], default: 'embedding' },
            maxTokens: { type: 'number', default: 512 },
            overlapTokens: { type: 'number', default: 50 },
            minChunkSize: { type: 'number', default: 100 },
            preserveParagraphs: { type: 'boolean', default: true },
            preserveSentences: { type: 'boolean', default: true },
            detectHeaders: { type: 'boolean', default: true },
          },
          outputSchema: {
            chunks: 'array of { content, index, startOffset, endOffset, tokenEstimate, metadata }',
            stats: '{ count, totalTokens, avgTokens, minTokens, maxTokens }',
          },
          serviceDependencies: [],
          qualityScoreFormula: 'Based on average chunk size optimization',
        },
      },
      position: { x: 700, y: 300 },
    },
    {
      id: 'tool-ingestion-extract-entities',
      type: 'toolNode',
      data: {
        label: 'Extract Entities',
        executorType: 'ingestion.extract_entities',
        description:
          'Hybrid regex + LLM entity extraction. Provider chain: Ollama -> Claude -> Gemini. ' +
          '13 entity types: PERSON, TEAM, ORGANIZATION, SYSTEM, MODULE, API, DATABASE, PROCESS, ' +
          'BUSINESS_RULE, CONCEPT, TECHNOLOGY, DOCUMENT, PROJECT.',
        parameters: {
          executorType: 'ingestion.extract_entities',
          className: 'extractEntitiesExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            text: { type: 'string' },
            sourceType: { type: 'string', enum: ['text', 'workitem', 'code', 'document'], default: 'text' },
            useLLM: { type: 'boolean', default: true },
            useRegex: { type: 'boolean', default: true },
            minConfidence: { type: 'number', default: 0.6 },
            maxEntities: { type: 'number', default: 100 },
            llmProvider: { type: 'string', default: 'ollama' },
            llmModel: { type: 'string', default: 'llama3' },
            temperature: { type: 'number', default: 0.1 },
          },
          outputSchema: {
            entities: 'array of { name, type, normalizedForm, confidence, context, graphLabel }',
            relationships: 'array of entity relationships',
            stats: '{ regexCount, llmCount, mergedCount, provider }',
          },
          serviceDependencies: ['llm'],
          qualityScoreFormula: 'avg(entity.confidence) across all entities',
        },
      },
      position: { x: 700, y: 400 },
    },
    {
      id: 'tool-ingestion-extract-relations',
      type: 'toolNode',
      data: {
        label: 'Extract Relations',
        executorType: 'ingestion.extract_relations',
        description:
          'Relationship extraction: pattern matching (USES, DEPENDS_ON, INTEGRATES_WITH), ' +
          'co-occurrence analysis (sentence window), preposition patterns. LLM fallback.',
        parameters: {
          executorType: 'ingestion.extract_relations',
          className: 'extractRelationsExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            text: { type: 'string' },
            entities: { type: 'array', description: 'Pre-extracted entities' },
            includeCoOccurrence: { type: 'boolean', default: true },
            minConfidence: { type: 'number', default: 0.5 },
            maxDistance: { type: 'number', default: 200 },
            useLLM: { type: 'boolean', default: false },
          },
          outputSchema: {
            relationships: 'array of { source, sourceType, target, targetType, type, confidence, evidence, extractionMethod }',
            stats: '{ total, byType, byMethod, avgConfidence }',
          },
          serviceDependencies: [],
          qualityScoreFormula: 'avg(relationship.confidence)',
        },
      },
      position: { x: 700, y: 500 },
    },
    {
      id: 'tool-ingestion-classify-content',
      type: 'toolNode',
      data: {
        label: 'Classify Content',
        executorType: 'ingestion.classify_content',
        description: 'Classify content type and determine Knowledge Planes layer placement (Strategic, Business, Code, Infrastructure)',
        parameters: {
          executorType: 'ingestion.classify_content',
          className: 'classifyContentExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            text: { type: 'string' },
            filename: { type: 'string' },
            mimeType: { type: 'string' },
            metadata: { type: 'object' },
            classifyForLayer: { type: 'boolean', default: true },
          },
          outputSchema: {
            contentType: 'enum: code|documentation|workitem|email|report|specification|meeting_notes|general',
            contentTypeConfidence: 'number',
            knowledgeLayer: 'enum: Strategic|Business|Code',
            suggestedTags: 'array',
            characteristics: '{ hasCode, hasStructuredData, isTemplate, estimatedTechnicalLevel }',
          },
          serviceDependencies: [],
          qualityScoreFormula: 'contentTypeConfidence (0.7-0.9)',
        },
      },
      position: { x: 700, y: 600 },
    },
    {
      id: 'tool-ingestion-write-graph',
      type: 'toolNode',
      data: {
        label: 'Write to Memgraph',
        executorType: 'ingestion.write_graph',
        description: 'Persist entities and relationships to Memgraph via mergeNode/mergeRelationship. Namespace-aware storage with provenance tracking.',
        parameters: {
          executorType: 'ingestion.write_graph',
          className: 'writeGraphExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            entities: { type: 'array', description: 'Entities to write' },
            relationships: { type: 'array', description: 'Relationships to write' },
            sourceId: { type: 'string' },
            sourceType: { type: 'string' },
            namespace: { type: 'string', default: 'core' },
            createProvenance: { type: 'boolean', default: true },
            mergeExisting: { type: 'boolean', default: true },
            minConfidence: { type: 'number', default: 0.5 },
          },
          outputSchema: {
            nodesCreated: 'number',
            nodesUpdated: 'number',
            relationshipsCreated: 'number',
            errors: 'array',
            nodeIds: 'array',
          },
          serviceDependencies: ['memgraph'],
          qualityScoreFormula: 'min(1.0, entitiesWritten / entities.length)',
        },
      },
      position: { x: 700, y: 700 },
    },
    {
      id: 'tool-ingestion-write-vector',
      type: 'toolNode',
      data: {
        label: 'Write to Qdrant',
        executorType: 'ingestion.write_vector',
        description: 'Embed text chunks via TEI (nomic-embed-text, 1024d) and store in Qdrant. Enables vector similarity search for entity resolution.',
        parameters: {
          executorType: 'ingestion.write_vector',
          className: 'writeVectorExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/ingestion/index.js',
          pluginDomain: 'ingestion',
          inputSchema: {
            chunks: { type: 'array', description: 'Text chunks to embed and store' },
            text: { type: 'string', description: 'Single text to embed' },
            sourceId: { type: 'string' },
            namespace: { type: 'string', default: 'core' },
            collection: { type: 'string', default: 'kg_entities' },
            batchSize: { type: 'number', default: 100 },
            generateEmbeddings: { type: 'boolean', default: true },
          },
          outputSchema: {
            pointsWritten: 'number',
            pointIds: 'array',
            collection: 'string',
            errors: 'array',
          },
          serviceDependencies: ['qdrant', 'tei'],
          qualityScoreFormula: '1.0 if points upserted successfully',
        },
      },
      position: { x: 700, y: 800 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  COMMON PLUGIN TOOLS (10)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tool-common-log',
      type: 'toolNode',
      data: {
        label: 'Log',
        executorType: 'common.log',
        description: 'Log a message to console at specified level. Passes input through unchanged.',
        parameters: {
          executorType: 'common.log',
          className: 'LogExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
            message: { type: 'string' },
            includeInput: { type: 'boolean', default: false },
          },
          outputSchema: { logged: 'true', level: 'string', message: 'string' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (always succeeds)',
        },
      },
      position: { x: 700, y: 1000 },
    },
    {
      id: 'tool-common-delay',
      type: 'toolNode',
      data: {
        label: 'Delay',
        executorType: 'common.delay',
        description: 'Wait for specified duration in milliseconds. Passes input through unchanged.',
        parameters: {
          executorType: 'common.delay',
          className: 'DelayExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            duration: { type: 'number', default: 1000, description: 'Delay in milliseconds' },
          },
          outputSchema: { delayed: 'number (duration)' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (always succeeds after delay)',
        },
      },
      position: { x: 700, y: 1100 },
    },
    {
      id: 'tool-common-passthrough',
      type: 'toolNode',
      data: {
        label: 'Passthrough',
        executorType: 'common.passthrough',
        description: 'Identity operation: passes input directly to output without modification. Used for placeholder nodes.',
        parameters: {
          executorType: 'common.passthrough',
          className: 'PassThroughExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {},
          outputSchema: { '<passthrough>': 'same as input' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (identity operation)',
        },
      },
      position: { x: 700, y: 1200 },
    },
    {
      id: 'tool-common-set-variable',
      type: 'toolNode',
      data: {
        label: 'Set Variable',
        executorType: 'common.set_variable',
        description: 'Store a value in shared execution state (context.variables). Can store input data or explicit value.',
        parameters: {
          executorType: 'common.set_variable',
          className: 'SetVariableExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            key: { type: 'string', required: true },
            value: { type: 'any' },
            fromInput: { type: 'boolean', default: true },
          },
          outputSchema: { variableSet: 'string (key name)' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (stores value in sharedState)',
        },
      },
      position: { x: 700, y: 1300 },
    },
    {
      id: 'tool-common-get-variable',
      type: 'toolNode',
      data: {
        label: 'Get Variable',
        executorType: 'common.get_variable',
        description: 'Retrieve a value from shared execution state (context.variables).',
        parameters: {
          executorType: 'common.get_variable',
          className: 'GetVariableExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            key: { type: 'string', required: true },
            defaultValue: { type: 'any', description: 'Fallback if key not found' },
          },
          outputSchema: { '<retrieved value>': 'any (or defaultValue)' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (retrieves from sharedState)',
        },
      },
      position: { x: 700, y: 1400 },
    },
    {
      id: 'tool-common-validate',
      type: 'toolNode',
      data: {
        label: 'Validate',
        executorType: 'common.validate',
        description: 'Validate input data against rules: not_null, not_empty, is_object, is_array, is_string. Optional JSON Schema validation.',
        parameters: {
          executorType: 'common.validate',
          className: 'ValidateExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            rules: { type: 'array', items: 'string', description: 'Validation rule names' },
            schema: { type: 'object', description: 'JSON Schema for validation' },
          },
          outputSchema: { valid: 'boolean', errors: 'array', input: 'any' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 minus 0.2-0.3 per failed rule',
        },
      },
      position: { x: 700, y: 1500 },
    },
    {
      id: 'tool-common-aggregate',
      type: 'toolNode',
      data: {
        label: 'Aggregate',
        executorType: 'common.aggregate',
        description: 'Aggregate array data with operations: merge, concat, sum, count, unique, first, last. Optional deduplication.',
        parameters: {
          executorType: 'common.aggregate',
          className: 'AggregateExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            operation: { type: 'string', enum: ['merge', 'concat', 'sum', 'count', 'unique', 'first', 'last'], default: 'merge' },
            deduplicateBy: { type: 'string', description: 'Field name for deduplication' },
          },
          outputSchema: { '<aggregated result>': 'varies by operation' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (deterministic aggregation)',
        },
      },
      position: { x: 700, y: 1600 },
    },
    {
      id: 'tool-common-http-request',
      type: 'toolNode',
      data: {
        label: 'HTTP Request',
        executorType: 'common.http_request',
        description: 'Make HTTP requests (GET, POST, PUT, DELETE, PATCH) with configurable headers and timeout.',
        parameters: {
          executorType: 'common.http_request',
          className: 'HttpRequestExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            url: { type: 'string', required: true },
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
            headers: { type: 'object' },
            body: { type: 'any' },
            timeout: { type: 'number', default: 30000 },
          },
          outputSchema: { '<response data>': 'parsed JSON or text' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 if HTTP 2xx, error if 4xx/5xx',
        },
      },
      position: { x: 700, y: 1700 },
    },
    {
      id: 'tool-common-notify',
      type: 'toolNode',
      data: {
        label: 'Notify',
        executorType: 'common.notify',
        description: 'Send a notification to a channel with configurable priority. Extensible dispatcher.',
        parameters: {
          executorType: 'common.notify',
          className: 'NotifyExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            channel: { type: 'string', required: true },
            message: { type: 'string' },
            priority: { type: 'string', enum: ['low', 'medium', 'high'], default: 'medium' },
          },
          outputSchema: { notified: 'true', channel: 'string', priority: 'string' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (placeholder, always succeeds)',
        },
      },
      position: { x: 700, y: 1800 },
    },
    {
      id: 'tool-common-conditional',
      type: 'toolNode',
      data: {
        label: 'Conditional',
        executorType: 'common.conditional',
        description: 'Branch execution based on a JavaScript expression. Returns trueValue or falseValue.',
        parameters: {
          executorType: 'common.conditional',
          className: 'ConditionalExecutor',
          implementationPath: 'api/src/plugins/common/common.plugin.ts',
          pluginDomain: 'common',
          inputSchema: {
            condition: { type: 'string', required: true, description: 'JavaScript expression to evaluate' },
            trueValue: { type: 'any' },
            falseValue: { type: 'any' },
          },
          outputSchema: { '<trueValue or falseValue>': 'based on condition evaluation' },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 if evaluates, error if expression throws',
        },
      },
      position: { x: 700, y: 1900 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  AI PLUGIN TOOLS (5)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tool-ai-llm-generate',
      type: 'toolNode',
      data: {
        label: 'LLM Generate',
        executorType: 'ai.llm_generate',
        description: 'Generate text using LLM with prompt templates. Supports {{input}} placeholder substitution.',
        parameters: {
          executorType: 'ai.llm_generate',
          className: 'LLMGenerateExecutor',
          implementationPath: 'api/src/plugins/ai/ai.plugin.ts',
          pluginDomain: 'ai',
          inputSchema: {
            model: { type: 'string', default: 'gemini-flash' },
            prompt: { type: 'string', required: true, description: 'Prompt with {{input}} placeholder' },
            systemPrompt: { type: 'string' },
            maxTokens: { type: 'number', default: 1000 },
            temperature: { type: 'number', default: 0.7 },
            responseFormat: { type: 'string', enum: ['text', 'json'], default: 'text' },
          },
          outputSchema: { '<generated text or parsed JSON>': 'string | object' },
          serviceDependencies: ['llm'],
          qualityScoreFormula: '0.85 fixed on success',
        },
      },
      position: { x: 700, y: 2000 },
    },
    {
      id: 'tool-ai-llm-extract',
      type: 'toolNode',
      data: {
        label: 'LLM Extract',
        executorType: 'ai.llm_extract',
        description: 'Extract structured data from text using LLM. Returns JSON matching provided schema.',
        parameters: {
          executorType: 'ai.llm_extract',
          className: 'LLMExtractExecutor',
          implementationPath: 'api/src/plugins/ai/ai.plugin.ts',
          pluginDomain: 'ai',
          inputSchema: {
            model: { type: 'string', default: 'gemini-flash' },
            schema: { type: 'object', required: true, description: 'JSON Schema for output structure' },
            instructions: { type: 'string', description: 'Additional extraction instructions' },
            maxTokens: { type: 'number', default: 2000 },
          },
          outputSchema: { '<structured data>': 'object matching provided schema' },
          serviceDependencies: ['llm'],
          qualityScoreFormula: '0.85 if JSON parsed successfully',
        },
      },
      position: { x: 700, y: 2100 },
    },
    {
      id: 'tool-ai-llm-classify',
      type: 'toolNode',
      data: {
        label: 'LLM Classify',
        executorType: 'ai.llm_classify',
        description: 'Classify text into categories using LLM. Supports single-label and multi-label modes.',
        parameters: {
          executorType: 'ai.llm_classify',
          className: 'LLMClassifyExecutor',
          implementationPath: 'api/src/plugins/ai/ai.plugin.ts',
          pluginDomain: 'ai',
          inputSchema: {
            model: { type: 'string', default: 'gemini-flash' },
            categories: { type: 'array', required: true, description: 'Possible categories' },
            multiLabel: { type: 'boolean', default: false },
            maxTokens: { type: 'number', default: 500 },
          },
          outputSchema: {
            'single-label': '{ category: string, confidence: number }',
            'multi-label': '{ categories: array, confidences: object }',
          },
          serviceDependencies: ['llm'],
          qualityScoreFormula: 'result.confidence or max(result.confidences)',
        },
      },
      position: { x: 700, y: 2200 },
    },
    {
      id: 'tool-ai-llm-summarize',
      type: 'toolNode',
      data: {
        label: 'LLM Summarize',
        executorType: 'ai.llm_summarize',
        description: 'Summarize text using LLM with configurable style: brief, detailed, or bullet_points.',
        parameters: {
          executorType: 'ai.llm_summarize',
          className: 'LLMSummarizeExecutor',
          implementationPath: 'api/src/plugins/ai/ai.plugin.ts',
          pluginDomain: 'ai',
          inputSchema: {
            model: { type: 'string', default: 'gemini-flash' },
            maxLength: { type: 'number', default: 200, description: 'Max summary length in words' },
            style: { type: 'string', enum: ['brief', 'detailed', 'bullet_points'], default: 'brief' },
            maxTokens: { type: 'number', default: 1000 },
          },
          outputSchema: { '<summary text>': 'string' },
          serviceDependencies: ['llm'],
          qualityScoreFormula: 'Based on response length relative to maxLength',
        },
      },
      position: { x: 700, y: 2300 },
    },
    {
      id: 'tool-ai-llm-transform',
      type: 'toolNode',
      data: {
        label: 'LLM Transform',
        executorType: 'ai.llm_transform',
        description: 'Transform data format using LLM. Converts between text, JSON, markdown, and CSV.',
        parameters: {
          executorType: 'ai.llm_transform',
          className: 'LLMTransformExecutor',
          implementationPath: 'api/src/plugins/ai/ai.plugin.ts',
          pluginDomain: 'ai',
          inputSchema: {
            model: { type: 'string', default: 'gemini-flash' },
            transformation: { type: 'string', required: true, description: 'Description of desired transformation' },
            outputFormat: { type: 'string', enum: ['text', 'json', 'markdown', 'csv'], default: 'text' },
            maxTokens: { type: 'number', default: 2000 },
          },
          outputSchema: { '<transformed data>': 'in requested format' },
          serviceDependencies: ['llm'],
          qualityScoreFormula: '0.9 fixed on success',
        },
      },
      position: { x: 700, y: 2400 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  RAG PLUGIN TOOLS (8)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tool-rag-expand-query',
      type: 'toolNode',
      data: {
        label: 'Expand Query',
        executorType: 'rag.expand_query',
        description: 'Expand search query with synonyms, UN terms, and related system names. Rule-based with optional LLM.',
        parameters: {
          executorType: 'rag.expand_query',
          className: 'expandQueryExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/rag/index.js',
          pluginDomain: 'rag',
          inputSchema: {
            query: { type: 'string', required: true },
            includeSynonyms: { type: 'boolean', default: true },
            includeUNTerms: { type: 'boolean', default: true },
            includeRelatedSystems: { type: 'boolean', default: true },
            maxExpansions: { type: 'number', default: 5 },
          },
          outputSchema: {
            originalQuery: 'string',
            expandedQuery: 'string',
            terms: 'array',
            synonyms: 'array',
          },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (synonym expansion always succeeds)',
        },
      },
      position: { x: 700, y: 2500 },
    },
    {
      id: 'tool-rag-vector-search',
      type: 'toolNode',
      data: {
        label: 'Vector Search',
        executorType: 'rag.vector_search',
        description: 'Semantic vector search in Qdrant. Embeds query via TEI and returns similar content with scores.',
        parameters: {
          executorType: 'rag.vector_search',
          className: 'vectorSearchExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/rag/index.js',
          pluginDomain: 'rag',
          inputSchema: {
            query: { type: 'string' },
            queryVector: { type: 'array', description: 'Pre-computed query vector' },
            topK: { type: 'number', default: 10 },
            scoreThreshold: { type: 'number', default: 0.7 },
            namespace: { type: 'string', default: 'core' },
            filter: { type: 'object', description: 'Qdrant filter conditions' },
          },
          outputSchema: {
            results: 'array of { id, score, content, metadata }',
            query: 'string',
            totalFound: 'number',
            searchTime: 'number (ms)',
          },
          serviceDependencies: ['qdrant', 'tei'],
          qualityScoreFormula: 'avg(result.score) across filtered results',
        },
      },
      position: { x: 700, y: 2600 },
    },
    {
      id: 'tool-rag-graph-search',
      type: 'toolNode',
      data: {
        label: 'Graph Search',
        executorType: 'rag.graph_search',
        description: 'Search Memgraph knowledge graph for related entities via keyword matching and traversal.',
        parameters: {
          executorType: 'rag.graph_search',
          className: 'graphSearchExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/rag/index.js',
          pluginDomain: 'rag',
          inputSchema: {
            query: { type: 'string' },
            keywords: { type: 'array' },
            entityTypes: { type: 'array', description: 'Filter by entity types' },
            maxDepth: { type: 'number', default: 2 },
            maxResults: { type: 'number', default: 20 },
            namespace: { type: 'string', default: 'core' },
          },
          outputSchema: {
            results: 'array of { id, name, type, labels, score, properties, distance }',
            query: 'string',
            totalFound: 'number',
            searchTime: 'number (ms)',
          },
          serviceDependencies: ['memgraph'],
          qualityScoreFormula: '0.8 if results found, 0 otherwise',
        },
      },
      position: { x: 700, y: 2700 },
    },
    {
      id: 'tool-rag-hybrid-search',
      type: 'toolNode',
      data: {
        label: 'Hybrid Search',
        executorType: 'rag.hybrid_search',
        description: 'Combined vector + graph search with Reciprocal Rank Fusion (RRF). Configurable weight split.',
        parameters: {
          executorType: 'rag.hybrid_search',
          className: 'hybridSearchExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/rag/index.js',
          pluginDomain: 'rag',
          inputSchema: {
            query: { type: 'string', required: true },
            topK: { type: 'number', default: 15 },
            vectorWeight: { type: 'number', default: 0.6 },
            graphWeight: { type: 'number', default: 0.4 },
            fusionMethod: { type: 'string', enum: ['rrf', 'linear', 'max'], default: 'rrf' },
            rrf_k: { type: 'number', default: 60 },
            namespace: { type: 'string', default: 'core' },
          },
          outputSchema: {
            results: 'array of SearchResult with source field (vector|graph|both)',
            query: 'string',
            metadata: '{ totalFound, vectorHits, graphHits, fusedCount, fusionMethod, searchTime }',
          },
          serviceDependencies: ['qdrant', 'tei', 'memgraph'],
          qualityScoreFormula: 'avg(score) + diversity bonus',
        },
      },
      position: { x: 700, y: 2800 },
    },
    {
      id: 'tool-rag-rerank',
      type: 'toolNode',
      data: {
        label: 'Rerank Results',
        executorType: 'rag.rerank',
        description: 'Rerank search results using score-based sorting, BM25, LLM, or combined methods. Optional diversity weighting.',
        parameters: {
          executorType: 'rag.rerank',
          className: 'rerankResultsExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/rag/index.js',
          pluginDomain: 'rag',
          inputSchema: {
            results: { type: 'array', description: 'Search results to rerank' },
            query: { type: 'string' },
            method: { type: 'string', enum: ['cross_encoder', 'llm', 'bm25', 'combined'], default: 'combined' },
            topK: { type: 'number', default: 10 },
            diversityWeight: { type: 'number', default: 0.1 },
          },
          outputSchema: {
            results: 'array with originalRank and newRank fields',
            originalCount: 'number',
            rerankMethod: 'string',
          },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 (score-based reranking is deterministic)',
        },
      },
      position: { x: 700, y: 2900 },
    },
    {
      id: 'tool-rag-assemble-context',
      type: 'toolNode',
      data: {
        label: 'Assemble Context',
        executorType: 'rag.assemble_context',
        description: 'Combine search results into formatted context for LLM generation. Supports plain, markdown, xml, numbered formats.',
        parameters: {
          executorType: 'rag.assemble_context',
          className: 'assembleContextExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/rag/index.js',
          pluginDomain: 'rag',
          inputSchema: {
            results: { type: 'array' },
            query: { type: 'string' },
            maxTokens: { type: 'number', default: 4000 },
            format: { type: 'string', enum: ['plain', 'markdown', 'xml', 'numbered'], default: 'markdown' },
            includeMetadata: { type: 'boolean', default: true },
            deduplicateContent: { type: 'boolean', default: true },
          },
          outputSchema: {
            context: 'string',
            sourceCount: 'number',
            estimatedTokens: 'number',
            truncated: 'boolean',
            sources: 'array of { id, type, score }',
          },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 if contextParts.length > 0',
        },
      },
      position: { x: 700, y: 3000 },
    },
    {
      id: 'tool-rag-generate-response',
      type: 'toolNode',
      data: {
        label: 'Generate Response',
        executorType: 'rag.generate_response',
        description: 'Generate LLM response using assembled RAG context. Multi-provider support with fallback chain.',
        parameters: {
          executorType: 'rag.generate_response',
          className: 'generateResponseExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/rag/index.js',
          pluginDomain: 'rag',
          inputSchema: {
            query: { type: 'string' },
            context: { type: 'string' },
            systemPrompt: { type: 'string' },
            provider: { type: 'string', enum: ['ollama', 'gemini', 'anthropic'], default: 'ollama' },
            model: { type: 'string' },
            temperature: { type: 'number', default: 0.7 },
            maxTokens: { type: 'number', default: 1024 },
            includeSourceCitations: { type: 'boolean', default: true },
          },
          outputSchema: {
            response: 'string',
            provider: 'string',
            model: 'string',
            usage: '{ promptTokens, completionTokens, totalTokens }',
            citations: 'array',
          },
          serviceDependencies: ['llm'],
          qualityScoreFormula: '0.9 if response generated, 0 otherwise',
        },
      },
      position: { x: 700, y: 3100 },
    },
    {
      id: 'tool-rag-summarize',
      type: 'toolNode',
      data: {
        label: 'Summarize Results',
        executorType: 'rag.summarize',
        description: 'Summarize RAG search results using LLM. Produces concise summary of retrieved content.',
        parameters: {
          executorType: 'rag.summarize',
          className: 'summarizeResultsExecutor',
          implementationPath: 'api/src/core/aopeg/plugins/rag/index.js',
          pluginDomain: 'rag',
          inputSchema: {
            results: { type: 'array' },
            query: { type: 'string' },
            maxLength: { type: 'number', default: 500 },
          },
          outputSchema: {
            summary: 'string',
            query: 'string',
            sourcesUsed: 'number',
          },
          serviceDependencies: ['llm'],
          qualityScoreFormula: '0.85 fixed for successful summarization',
        },
      },
      position: { x: 700, y: 3200 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  FILESYSTEM PLUGIN TOOLS (3)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tool-filesystem-read',
      type: 'toolNode',
      data: {
        label: 'Read File',
        executorType: 'filesystem.read',
        description: 'Read a file from the sandboxed Artefacts directory. Supports text encoding options.',
        parameters: {
          executorType: 'filesystem.read',
          className: 'ReadFileExecutor',
          implementationPath: 'api/src/plugins/filesystem/executors/read-file.executor.ts',
          pluginDomain: 'filesystem',
          inputSchema: {
            path: { type: 'string', required: true },
            encoding: { type: 'string', default: 'utf-8' },
          },
          outputSchema: {
            content: 'string',
            size: 'number',
            path: 'string',
          },
          serviceDependencies: ['filesystem'],
          qualityScoreFormula: '1.0 if file read successfully, 0 otherwise',
        },
      },
      position: { x: 700, y: 3400 },
    },
    {
      id: 'tool-filesystem-write',
      type: 'toolNode',
      data: {
        label: 'Write File',
        executorType: 'filesystem.write',
        description: 'Write content to a file in the sandboxed Artefacts directory. Supports append mode.',
        parameters: {
          executorType: 'filesystem.write',
          className: 'WriteFileExecutor',
          implementationPath: 'api/src/plugins/filesystem/executors/write-file.executor.ts',
          pluginDomain: 'filesystem',
          inputSchema: {
            path: { type: 'string', required: true },
            content: { type: 'string' },
            contentFromInput: { type: 'boolean', default: false },
            append: { type: 'boolean', default: false },
          },
          outputSchema: {
            bytesWritten: 'number',
            path: 'string',
          },
          serviceDependencies: ['filesystem'],
          qualityScoreFormula: '1.0 if file written successfully, 0 otherwise',
        },
      },
      position: { x: 700, y: 3500 },
    },
    {
      id: 'tool-filesystem-list',
      type: 'toolNode',
      data: {
        label: 'List Files',
        executorType: 'filesystem.list',
        description: 'List files in the sandboxed Artefacts directory. Supports recursive listing and pattern filtering.',
        parameters: {
          executorType: 'filesystem.list',
          className: 'ListFilesExecutor',
          implementationPath: 'api/src/plugins/filesystem/executors/list-files.executor.ts',
          pluginDomain: 'filesystem',
          inputSchema: {
            path: { type: 'string', default: '.' },
            recursive: { type: 'boolean', default: false },
            pattern: { type: 'string' },
          },
          outputSchema: {
            files: 'array',
            count: 'number',
          },
          serviceDependencies: ['filesystem'],
          qualityScoreFormula: '1.0 if directory listed, 0 otherwise',
        },
      },
      position: { x: 700, y: 3600 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  SESSION PLUGIN TOOLS (1)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tool-session-ai-chat',
      type: 'toolNode',
      data: {
        label: 'AI Chat',
        executorType: 'session.ai_chat',
        description: 'Send a prompt to an LLM and return the response. Supports {{input}} placeholder substitution.',
        parameters: {
          executorType: 'session.ai_chat',
          className: 'AIChatExecutor',
          implementationPath: 'api/src/plugins/session/executors/ai-chat.executor.ts',
          pluginDomain: 'session',
          inputSchema: {
            prompt: { type: 'string', required: true },
            systemPrompt: { type: 'string' },
            model: { type: 'string', default: 'gemini-flash' },
            temperature: { type: 'number', default: 0.7 },
            maxTokens: { type: 'number', default: 1000 },
            responseFormat: { type: 'string', enum: ['text', 'json'], default: 'text' },
          },
          outputSchema: {
            response: 'string',
            model: 'string',
            tokensUsed: 'number',
          },
          serviceDependencies: ['llm'],
          qualityScoreFormula: '0.9 if response generated, 0 otherwise',
        },
      },
      position: { x: 700, y: 3850 },
    },

    // ─────────────────────────────────────────────────────────────────────
    //  SCRIPT PLUGIN TOOLS (1)
    // ─────────────────────────────────────────────────────────────────────
    {
      id: 'tool-script-execute',
      type: 'toolNode',
      data: {
        label: 'Execute Script',
        executorType: 'script.execute',
        description: 'Run sandboxed JavaScript code with access to upstream data. Set `result` variable to produce output.',
        parameters: {
          executorType: 'script.execute',
          className: 'ScriptExecuteExecutor',
          implementationPath: 'api/src/plugins/script/executors/script-execute.executor.ts',
          pluginDomain: 'script',
          inputSchema: {
            code: { type: 'string', required: true },
            timeout: { type: 'number', default: 5000 },
          },
          outputSchema: {
            result: 'any',
            logs: 'array',
            executionTime: 'number',
          },
          serviceDependencies: [],
          qualityScoreFormula: '1.0 if script completed without error, 0 otherwise',
        },
      },
      position: { x: 700, y: 4100 },
    },
  ],

  // ── EDGES ──────────────────────────────────────────────────────────────
  edges: [
    // ── CONTAINS: root -> domain groups (7) ──
    { id: 'e-root-ingestion', source: 'registry-root', target: 'domain-ingestion', label: 'CONTAINS' },
    { id: 'e-root-common', source: 'registry-root', target: 'domain-common', label: 'CONTAINS' },
    { id: 'e-root-ai', source: 'registry-root', target: 'domain-ai', label: 'CONTAINS' },
    { id: 'e-root-rag', source: 'registry-root', target: 'domain-rag', label: 'CONTAINS' },
    { id: 'e-root-filesystem', source: 'registry-root', target: 'domain-filesystem', label: 'CONTAINS' },
    { id: 'e-root-session', source: 'registry-root', target: 'domain-session', label: 'CONTAINS' },
    { id: 'e-root-script', source: 'registry-root', target: 'domain-script', label: 'CONTAINS' },

    // ── PROVIDES: ingestion domain -> tools (9) ──
    { id: 'e-ing-parse', source: 'domain-ingestion', target: 'tool-ingestion-parse-document', label: 'PROVIDES' },
    { id: 'e-ing-sanitize', source: 'domain-ingestion', target: 'tool-ingestion-sanitize', label: 'PROVIDES' },
    { id: 'e-ing-detect-lang', source: 'domain-ingestion', target: 'tool-ingestion-detect-language', label: 'PROVIDES' },
    { id: 'e-ing-chunk', source: 'domain-ingestion', target: 'tool-ingestion-chunk-text', label: 'PROVIDES' },
    { id: 'e-ing-extract-ent', source: 'domain-ingestion', target: 'tool-ingestion-extract-entities', label: 'PROVIDES' },
    { id: 'e-ing-extract-rel', source: 'domain-ingestion', target: 'tool-ingestion-extract-relations', label: 'PROVIDES' },
    { id: 'e-ing-classify', source: 'domain-ingestion', target: 'tool-ingestion-classify-content', label: 'PROVIDES' },
    { id: 'e-ing-write-graph', source: 'domain-ingestion', target: 'tool-ingestion-write-graph', label: 'PROVIDES' },
    { id: 'e-ing-write-vector', source: 'domain-ingestion', target: 'tool-ingestion-write-vector', label: 'PROVIDES' },

    // ── PROVIDES: common domain -> tools (10) ──
    { id: 'e-com-log', source: 'domain-common', target: 'tool-common-log', label: 'PROVIDES' },
    { id: 'e-com-delay', source: 'domain-common', target: 'tool-common-delay', label: 'PROVIDES' },
    { id: 'e-com-passthrough', source: 'domain-common', target: 'tool-common-passthrough', label: 'PROVIDES' },
    { id: 'e-com-set-var', source: 'domain-common', target: 'tool-common-set-variable', label: 'PROVIDES' },
    { id: 'e-com-get-var', source: 'domain-common', target: 'tool-common-get-variable', label: 'PROVIDES' },
    { id: 'e-com-validate', source: 'domain-common', target: 'tool-common-validate', label: 'PROVIDES' },
    { id: 'e-com-aggregate', source: 'domain-common', target: 'tool-common-aggregate', label: 'PROVIDES' },
    { id: 'e-com-http', source: 'domain-common', target: 'tool-common-http-request', label: 'PROVIDES' },
    { id: 'e-com-notify', source: 'domain-common', target: 'tool-common-notify', label: 'PROVIDES' },
    { id: 'e-com-conditional', source: 'domain-common', target: 'tool-common-conditional', label: 'PROVIDES' },

    // ── PROVIDES: ai domain -> tools (5) ──
    { id: 'e-ai-generate', source: 'domain-ai', target: 'tool-ai-llm-generate', label: 'PROVIDES' },
    { id: 'e-ai-extract', source: 'domain-ai', target: 'tool-ai-llm-extract', label: 'PROVIDES' },
    { id: 'e-ai-classify', source: 'domain-ai', target: 'tool-ai-llm-classify', label: 'PROVIDES' },
    { id: 'e-ai-summarize', source: 'domain-ai', target: 'tool-ai-llm-summarize', label: 'PROVIDES' },
    { id: 'e-ai-transform', source: 'domain-ai', target: 'tool-ai-llm-transform', label: 'PROVIDES' },

    // ── PROVIDES: rag domain -> tools (8) ──
    { id: 'e-rag-expand', source: 'domain-rag', target: 'tool-rag-expand-query', label: 'PROVIDES' },
    { id: 'e-rag-vsearch', source: 'domain-rag', target: 'tool-rag-vector-search', label: 'PROVIDES' },
    { id: 'e-rag-gsearch', source: 'domain-rag', target: 'tool-rag-graph-search', label: 'PROVIDES' },
    { id: 'e-rag-hybrid', source: 'domain-rag', target: 'tool-rag-hybrid-search', label: 'PROVIDES' },
    { id: 'e-rag-rerank', source: 'domain-rag', target: 'tool-rag-rerank', label: 'PROVIDES' },
    { id: 'e-rag-assemble', source: 'domain-rag', target: 'tool-rag-assemble-context', label: 'PROVIDES' },
    { id: 'e-rag-gen-resp', source: 'domain-rag', target: 'tool-rag-generate-response', label: 'PROVIDES' },
    { id: 'e-rag-summarize', source: 'domain-rag', target: 'tool-rag-summarize', label: 'PROVIDES' },

    // ── DEPENDS_ON: tools -> services (18) ──
    // Ingestion deps
    { id: 'e-dep-parse-fs', source: 'tool-ingestion-parse-document', target: 'svc-filesystem', label: 'DEPENDS_ON' },
    { id: 'e-dep-extract-ent-llm', source: 'tool-ingestion-extract-entities', target: 'svc-llm', label: 'DEPENDS_ON' },
    { id: 'e-dep-wgraph-mg', source: 'tool-ingestion-write-graph', target: 'svc-memgraph', label: 'DEPENDS_ON' },
    { id: 'e-dep-wvec-qdrant', source: 'tool-ingestion-write-vector', target: 'svc-qdrant', label: 'DEPENDS_ON' },
    { id: 'e-dep-wvec-tei', source: 'tool-ingestion-write-vector', target: 'svc-tei', label: 'DEPENDS_ON' },
    // AI deps (all 5 -> llm)
    { id: 'e-dep-ai-gen-llm', source: 'tool-ai-llm-generate', target: 'svc-llm', label: 'DEPENDS_ON' },
    { id: 'e-dep-ai-ext-llm', source: 'tool-ai-llm-extract', target: 'svc-llm', label: 'DEPENDS_ON' },
    { id: 'e-dep-ai-cls-llm', source: 'tool-ai-llm-classify', target: 'svc-llm', label: 'DEPENDS_ON' },
    { id: 'e-dep-ai-sum-llm', source: 'tool-ai-llm-summarize', target: 'svc-llm', label: 'DEPENDS_ON' },
    { id: 'e-dep-ai-trn-llm', source: 'tool-ai-llm-transform', target: 'svc-llm', label: 'DEPENDS_ON' },
    // RAG deps
    { id: 'e-dep-vsearch-qdrant', source: 'tool-rag-vector-search', target: 'svc-qdrant', label: 'DEPENDS_ON' },
    { id: 'e-dep-vsearch-tei', source: 'tool-rag-vector-search', target: 'svc-tei', label: 'DEPENDS_ON' },
    { id: 'e-dep-gsearch-mg', source: 'tool-rag-graph-search', target: 'svc-memgraph', label: 'DEPENDS_ON' },
    { id: 'e-dep-hybrid-qdrant', source: 'tool-rag-hybrid-search', target: 'svc-qdrant', label: 'DEPENDS_ON' },
    { id: 'e-dep-hybrid-tei', source: 'tool-rag-hybrid-search', target: 'svc-tei', label: 'DEPENDS_ON' },
    { id: 'e-dep-hybrid-mg', source: 'tool-rag-hybrid-search', target: 'svc-memgraph', label: 'DEPENDS_ON' },
    { id: 'e-dep-genresp-llm', source: 'tool-rag-generate-response', target: 'svc-llm', label: 'DEPENDS_ON' },
    { id: 'e-dep-sumres-llm', source: 'tool-rag-summarize', target: 'svc-llm', label: 'DEPENDS_ON' },

    // ── CAN_CHAIN: known valid pipeline patterns (20) ──
    // Ingestion pipeline chain
    { id: 'e-chain-parse-sanitize', source: 'tool-ingestion-parse-document', target: 'tool-ingestion-sanitize', label: 'CAN_CHAIN' },
    { id: 'e-chain-sanitize-detect', source: 'tool-ingestion-sanitize', target: 'tool-ingestion-detect-language', label: 'CAN_CHAIN' },
    { id: 'e-chain-sanitize-chunk', source: 'tool-ingestion-sanitize', target: 'tool-ingestion-chunk-text', label: 'CAN_CHAIN' },
    { id: 'e-chain-detect-chunk', source: 'tool-ingestion-detect-language', target: 'tool-ingestion-chunk-text', label: 'CAN_CHAIN' },
    { id: 'e-chain-chunk-extract-e', source: 'tool-ingestion-chunk-text', target: 'tool-ingestion-extract-entities', label: 'CAN_CHAIN' },
    { id: 'e-chain-chunk-extract-r', source: 'tool-ingestion-chunk-text', target: 'tool-ingestion-extract-relations', label: 'CAN_CHAIN' },
    { id: 'e-chain-extract-wgraph', source: 'tool-ingestion-extract-entities', target: 'tool-ingestion-write-graph', label: 'CAN_CHAIN' },
    { id: 'e-chain-extract-wvector', source: 'tool-ingestion-extract-entities', target: 'tool-ingestion-write-vector', label: 'CAN_CHAIN' },
    { id: 'e-chain-chunk-wvector', source: 'tool-ingestion-chunk-text', target: 'tool-ingestion-write-vector', label: 'CAN_CHAIN' },
    { id: 'e-chain-extract-classify', source: 'tool-ingestion-extract-entities', target: 'tool-ingestion-classify-content', label: 'CAN_CHAIN' },
    // RAG pipeline chain
    { id: 'e-chain-expand-vsearch', source: 'tool-rag-expand-query', target: 'tool-rag-vector-search', label: 'CAN_CHAIN' },
    { id: 'e-chain-expand-hybrid', source: 'tool-rag-expand-query', target: 'tool-rag-hybrid-search', label: 'CAN_CHAIN' },
    { id: 'e-chain-vsearch-rerank', source: 'tool-rag-vector-search', target: 'tool-rag-rerank', label: 'CAN_CHAIN' },
    { id: 'e-chain-gsearch-rerank', source: 'tool-rag-graph-search', target: 'tool-rag-rerank', label: 'CAN_CHAIN' },
    { id: 'e-chain-hybrid-rerank', source: 'tool-rag-hybrid-search', target: 'tool-rag-rerank', label: 'CAN_CHAIN' },
    { id: 'e-chain-rerank-assemble', source: 'tool-rag-rerank', target: 'tool-rag-assemble-context', label: 'CAN_CHAIN' },
    { id: 'e-chain-assemble-gen', source: 'tool-rag-assemble-context', target: 'tool-rag-generate-response', label: 'CAN_CHAIN' },
    { id: 'e-chain-genresp-summ', source: 'tool-rag-generate-response', target: 'tool-rag-summarize', label: 'CAN_CHAIN' },
    // Cross-domain chains
    { id: 'e-chain-extract-llmext', source: 'tool-ingestion-extract-entities', target: 'tool-ai-llm-extract', label: 'CAN_CHAIN' },
    { id: 'e-chain-validate-log', source: 'tool-common-validate', target: 'tool-common-log', label: 'CAN_CHAIN' },

    // ── PROVIDES: filesystem domain -> tools (3) ──
    { id: 'e-fs-read', source: 'domain-filesystem', target: 'tool-filesystem-read', label: 'PROVIDES' },
    { id: 'e-fs-write', source: 'domain-filesystem', target: 'tool-filesystem-write', label: 'PROVIDES' },
    { id: 'e-fs-list', source: 'domain-filesystem', target: 'tool-filesystem-list', label: 'PROVIDES' },

    // ── PROVIDES: session domain -> tools (1) ──
    { id: 'e-sess-chat', source: 'domain-session', target: 'tool-session-ai-chat', label: 'PROVIDES' },

    // ── PROVIDES: script domain -> tools (1) ──
    { id: 'e-scr-execute', source: 'domain-script', target: 'tool-script-execute', label: 'PROVIDES' },

    // ── DEPENDS_ON: new tools -> services ──
    { id: 'e-dep-fs-read-fs', source: 'tool-filesystem-read', target: 'svc-filesystem', label: 'DEPENDS_ON' },
    { id: 'e-dep-fs-write-fs', source: 'tool-filesystem-write', target: 'svc-filesystem', label: 'DEPENDS_ON' },
    { id: 'e-dep-fs-list-fs', source: 'tool-filesystem-list', target: 'svc-filesystem', label: 'DEPENDS_ON' },
    { id: 'e-dep-sess-chat-llm', source: 'tool-session-ai-chat', target: 'svc-llm', label: 'DEPENDS_ON' },

    // ── CAN_CHAIN: new tool patterns ──
    { id: 'e-chain-fsread-aichat', source: 'tool-filesystem-read', target: 'tool-session-ai-chat', label: 'CAN_CHAIN' },
    { id: 'e-chain-aichat-script', source: 'tool-session-ai-chat', target: 'tool-script-execute', label: 'CAN_CHAIN' },
    { id: 'e-chain-script-fswrite', source: 'tool-script-execute', target: 'tool-filesystem-write', label: 'CAN_CHAIN' },
    { id: 'e-chain-fswrite-fslist', source: 'tool-filesystem-write', target: 'tool-filesystem-list', label: 'CAN_CHAIN' },
    { id: 'e-chain-validate-fsread', source: 'tool-common-validate', target: 'tool-filesystem-read', label: 'CAN_CHAIN' },
    { id: 'e-chain-fsread-script', source: 'tool-filesystem-read', target: 'tool-script-execute', label: 'CAN_CHAIN' },
    { id: 'e-chain-aichat-fswrite', source: 'tool-session-ai-chat', target: 'tool-filesystem-write', label: 'CAN_CHAIN' },
  ],

  // ── REQUIRED PARAMS ────────────────────────────────────────────────────
  // This is a reference/catalog graph, not an executable pipeline
  requiredParams: {},
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: Write to Memgraph
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Seed: AOPEG Executor Tool Registry → Core                 ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const memgraphService = require('../src/services/memgraph.service');

  // Retry connection up to 5 times
  let connected = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      if (!memgraphService.driver) {
        console.log(`[${attempt}/5] Waiting for Memgraph driver...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      const session = memgraphService.driver.session();
      await session.run('RETURN 1');
      await session.close();
      connected = true;
      console.log(`[OK] Memgraph connected`);
      break;
    } catch (err) {
      console.warn(`[${attempt}/5] Memgraph not ready: ${err.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!connected) {
    console.error('[FAIL] Cannot connect to Memgraph. Exiting.');
    process.exit(1);
  }

  const { graphCatalogService } = require('../src/services/graphCatalog.service');

  // Check if graph already exists
  const existing = await graphCatalogService.listGraphs({
    namespace: 'core',
    search: 'AOPEG Executor Tool Registry',
  });

  if (existing.data && existing.data.length > 0) {
    const existingGraph = existing.data.find(g => g.name === 'AOPEG Executor Tool Registry');
    if (existingGraph) {
      console.log(`[UPDATE] Graph already exists (id: ${existingGraph.id}), updating...`);
      const updated = await graphCatalogService.updateGraph(existingGraph.id, {
        nodes: EXECUTOR_REGISTRY_GRAPH.nodes,
        edges: EXECUTOR_REGISTRY_GRAPH.edges,
        description: EXECUTOR_REGISTRY_GRAPH.description,
        version: EXECUTOR_REGISTRY_GRAPH.version,
        tags: EXECUTOR_REGISTRY_GRAPH.tags,
      });
      console.log(`[OK] Graph updated: ${updated.name} (${updated.id})`);
      printSummary(updated);
      await cleanup();
      return;
    }
  }

  // Create new graph
  console.log('[CREATE] Writing new graph to Memgraph...');
  const created = await graphCatalogService.createGraph(EXECUTOR_REGISTRY_GRAPH);

  console.log(`[OK] Graph created: ${created.name} (${created.id})`);
  printSummary(created);

  await cleanup();
}

function printSummary(graph) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : JSON.parse(graph.nodes || '[]');
  const edges = Array.isArray(graph.edges) ? graph.edges : JSON.parse(graph.edges || '[]');

  const toolNodes = nodes.filter(n => n.type === 'toolNode');
  const domainNodes = nodes.filter(n => n.type === 'domainGroup');
  const serviceNodes = nodes.filter(n => n.type === 'serviceNode');

  const containsEdges = edges.filter(e => e.label === 'CONTAINS');
  const providesEdges = edges.filter(e => e.label === 'PROVIDES');
  const dependsEdges = edges.filter(e => e.label === 'DEPENDS_ON');
  const chainEdges = edges.filter(e => e.label === 'CAN_CHAIN');

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log(`│ Name:        ${graph.name}`);
  console.log(`│ Namespace:   ${graph.namespace}`);
  console.log(`│ Type:        ${graph.type}`);
  console.log(`│ ID:          ${graph.id}`);
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log(`│ Total Nodes: ${nodes.length} (${toolNodes.length} tools, ${domainNodes.length} domains, ${serviceNodes.length} services, 1 root)`);
  console.log(`│ Total Edges: ${edges.length} (${containsEdges.length} CONTAINS, ${providesEdges.length} PROVIDES, ${dependsEdges.length} DEPENDS_ON, ${chainEdges.length} CAN_CHAIN)`);
  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│ Executor Tools:');

  for (const domain of domainNodes) {
    const domainTools = toolNodes.filter(t => t.data?.parameters?.pluginDomain === domain.data?.pluginDomain);
    console.log(`│   ┌── ${domain.data.label} (${domainTools.length})`);
    for (const tool of domainTools) {
      const type = tool.data?.parameters?.executorType || tool.data?.executorType || '—';
      const name = tool.data?.label || tool.id;
      console.log(`│   │   ${type.padEnd(30)} ${name}`);
    }
  }

  console.log('├─────────────────────────────────────────────────────────────────┤');
  console.log('│ Service Dependencies:');
  for (const svc of serviceNodes) {
    const deps = dependsEdges.filter(e => e.target === svc.id);
    console.log(`│   ${svc.data.label.padEnd(15)} ← ${deps.length} tool(s)`);
  }
  console.log('└─────────────────────────────────────────────────────────────────┘');
}

async function cleanup() {
  try {
    const memgraphService = require('../src/services/memgraph.service');
    if (memgraphService.driver) {
      await memgraphService.driver.close();
    }
  } catch (_) { /* ignore */ }
  process.exit(0);
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
