#!/usr/bin/env node
/**
 * Seed Extraction Pipeline Graph
 * Creates an executable GXE graph representing the full KG extraction pipeline
 * and stores it in Memgraph under the "core" namespace.
 *
 * Usage: node api/scripts/seed-extraction-pipeline-graph.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH DEFINITION: Knowledge Graph Extraction Pipeline
// ═══════════════════════════════════════════════════════════════════════════

const EXTRACTION_PIPELINE_GRAPH = {
  name: 'Knowledge Graph Extraction Pipeline',
  namespace: 'core',
  type: 'composite',
  description:
    'Full extraction pipeline: text → parse → chunk → extract entities → extract relations → ' +
    'deduplicate → cross-source resolve → verify → build graph → AI analysis → write to stores. ' +
    'Matches the KG SSE pipeline in gxe.controller.js and the UnifiedExtractor orchestration.',
  version: '2.0.0',
  createdBy: 'system',
  tags: ['extraction', 'pipeline', 'core', 'knowledge-graph', 'nlp', 'ingestion', 'tool-bound'],
  isPublic: true,

  // ── NODES ──────────────────────────────────────────────────────────────
  // Format: ReactFlow-compatible — data.label for display, position for layout
  nodes: [
    // ── Container root node (graph metadata) ──
    {
      id: 'pipeline-root',
      type: 'container',
      data: {
        label: 'Knowledge Graph Extraction Pipeline',
        name: 'Knowledge Graph Extraction Pipeline',
        type: 'container',
        description: 'Full extraction pipeline: text → parse → chunk → extract → deduplicate → resolve → verify → persist',
        version: '1.0.0',
        namespace: 'core',
      },
      position: { x: 0, y: 300 },
    },

    // ── Stage 0: Input ──
    {
      id: 'input',
      type: 'graphNode',
      data: {
        label: 'Input Text',
        executorType: 'ingestion.parse_document',
        description: 'Accept raw text or document content for knowledge graph extraction',
        toolRef: 'tool-ingestion-parse-document',
        parameters: { mimeType: 'text/plain' },
        inputFormat: {
          content: { type: 'string', description: 'Raw document content or base64' },
          mimeType: { type: 'string', default: 'text/plain' },
          filePath: { type: 'string', optional: true },
        },
        outputFormat: {
          text: { type: 'string', description: 'Extracted text content' },
          metadata: {
            type: 'object',
            fields: { mimeType: 'string', originalLength: 'number', parsedAt: 'string' },
          },
        },
      },
      position: { x: 200, y: 300 },
    },

    // ── Stage 1: Parse & Preprocess ──
    {
      id: 'sanitize',
      type: 'graphNode',
      data: {
        label: 'Sanitize & Preprocess',
        executorType: 'ingestion.sanitize',
        description:
          'TextSanitizer: strip HTML, decode entities, trim whitespace, PII detection. ' +
          'TextPreprocessor: sentence segmentation, coreference resolution.',
        toolRef: 'tool-ingestion-sanitize',
        parameters: {
          removeHtml: true,
          decodeEntities: true,
          trimWhitespace: true,
          maxLength: 100000,
          resolveCoreferences: false,
          decomposeSentences: false,
        },
        inputFormat: {
          text: { type: 'string', source: 'input.text' },
        },
        outputFormat: {
          text: { type: 'string', description: 'Sanitized text' },
          sanitized: { type: 'boolean' },
          metadata: {
            type: 'object',
            fields: { originalLength: 'number', finalLength: 'number', compressionRatio: 'number', hadPII: 'boolean', hadHtml: 'boolean' },
          },
        },
      },
      position: { x: 400, y: 300 },
    },

    // ── Stage 2: Language Detection ──
    {
      id: 'detect-language',
      type: 'graphNode',
      data: {
        label: 'Detect Language',
        executorType: 'ingestion.detect_language',
        description:
          'Detect input language (en, fr, es, ar, zh, ru). ' +
          'Code detection if code-to-text ratio > 0.3. Fallback: en.',
        toolRef: 'tool-ingestion-detect-language',
        parameters: {
          minConfidence: 0.5,
          fallbackLanguage: 'en',
          codeDetection: true,
        },
        inputFormat: {
          text: { type: 'string', source: 'sanitize.text' },
        },
        outputFormat: {
          text: { type: 'string', description: 'Passthrough text' },
          language: { type: 'string', description: 'ISO language code (en, fr, es, ar, zh, ru)' },
          confidence: { type: 'number', description: 'Detection confidence 0.5-0.95' },
        },
      },
      position: { x: 600, y: 300 },
    },

    // ── Stage 3: Semantic Chunking ──
    {
      id: 'chunk',
      type: 'graphNode',
      data: {
        label: 'Semantic Chunking',
        executorType: 'ingestion.chunk_text',
        description:
          'TextChunker: split text into semantic chunks with overlap. ' +
          'Strategy: semantic. Respects paragraph/sentence boundaries. ' +
          'Header detection for section-aware splitting.',
        toolRef: 'tool-ingestion-chunk-text',
        parameters: {
          strategy: 'semantic',
          maxTokens: 512,
          overlapTokens: 50,
          minChunkSize: 100,
          preserveParagraphs: true,
          preserveSentences: true,
          detectHeaders: true,
        },
        inputFormat: {
          text: { type: 'string', source: 'detect-language.text' },
        },
        outputFormat: {
          chunks: {
            type: 'array',
            items: { content: 'string', index: 'number', metadata: '{ header?, startOffset, endOffset }' },
          },
          totalChunks: { type: 'number' },
          stats: { type: 'object', fields: { avgTokens: 'number', totalTokens: 'number' } },
        },
      },
      position: { x: 800, y: 300 },
    },

    // ── Stage 4: Entity Extraction (Multi-Provider) ──
    {
      id: 'extract-entities',
      type: 'graphNode',
      data: {
        label: 'Extract Entities',
        executorType: 'ingestion.extract_entities',
        description:
          'PatternEnhancedExtractor (hybrid mode): pattern regex + LLM extraction. ' +
          'LLM provider chain: Ollama → Claude → Gemini. ' +
          'Entity types: PERSON, TEAM, ORGANIZATION, SYSTEM, MODULE, API, DATABASE, ' +
          'PROCESS, BUSINESS_RULE, CONCEPT, TECHNOLOGY, DOCUMENT, PROJECT. ' +
          'Multi-source confidence boosting (+0.05).',
        toolRef: 'tool-ingestion-extract-entities',
        parameters: {
          method: 'hybrid',
          useLLM: true,
          useRegex: true,
          minConfidence: 0.6,
          maxEntities: 100,
          llmProvider: 'ollama',
          llmModel: 'llama3',
          temperature: 0.1,
          timeout: 30000,
          retries: 2,
        },
        inputFormat: {
          text: { type: 'string', source: 'detect-language.text' },
          language: { type: 'string', source: 'detect-language.language', optional: true },
          chunks: { type: 'array', source: 'chunk.chunks', optional: true },
        },
        outputFormat: {
          entities: {
            type: 'array',
            items: { name: 'string', type: 'string', confidence: 'number', context: 'string', normalizedForm: 'string' },
          },
          relationships: {
            type: 'array',
            items: { source: 'string', target: 'string', type: 'string', confidence: 'number', evidence: 'string' },
          },
          text: { type: 'string', description: 'Original text passthrough' },
          stats: { type: 'object', fields: { total: 'number', provider: 'string' } },
        },
      },
      position: { x: 1000, y: 200 },
    },

    // ── Stage 5: Relationship Extraction ──
    {
      id: 'extract-relations',
      type: 'graphNode',
      data: {
        label: 'Extract Relations',
        executorType: 'ingestion.extract_relations',
        description:
          'RelationshipExtractor: pattern matching (USES, DEPENDS_ON, INTEGRATES_WITH, etc.), ' +
          'co-occurrence analysis (sentence window), preposition patterns ("X for Y"). ' +
          'LLM fallback when no patterns match.',
        toolRef: 'tool-ingestion-extract-relations',
        parameters: {
          patternMatching: true,
          coOccurrence: true,
          prepositionPatterns: true,
          minConfidence: 0.5,
          maxRelationships: 50,
          llmFallback: true,
        },
        inputFormat: {
          text: { type: 'string', source: 'detect-language.text' },
          entities: { type: 'array', source: 'extract-entities.entities', optional: true },
          chunks: { type: 'array', source: 'chunk.chunks', optional: true },
        },
        outputFormat: {
          relationships: {
            type: 'array',
            items: { source: 'string', sourceType: 'string', target: 'string', targetType: 'string', type: 'string', confidence: 'number', evidence: 'string', extractionMethod: 'string' },
          },
          entities: { type: 'array', description: 'Passthrough entities from input' },
          stats: { type: 'object', fields: { total: 'number', byType: 'object', byMethod: 'object', avgConfidence: 'number' } },
        },
      },
      position: { x: 1000, y: 400 },
    },

    // ── Stage 6: Merge & Aggregate ──
    {
      id: 'merge-results',
      type: 'graphNode',
      data: {
        label: 'Merge Extraction Results',
        executorType: 'common.aggregate',
        description:
          'Aggregate entities and relations from all chunks. ' +
          'Normalize relation fields: subject→source, object→target, predicate→type.',
        toolRef: 'tool-common-aggregate',
        parameters: { operation: 'merge' },
        inputFormat: {
          _parallel: {
            type: 'array',
            description: 'Receives parallel outputs from extract-entities and extract-relations',
            items: { entities: 'array', relationships: 'array' },
          },
        },
        outputFormat: {
          entities: { type: 'array', description: 'Merged entities from all parallel inputs' },
          relationships: { type: 'array', description: 'Merged relationships from all parallel inputs' },
        },
      },
      position: { x: 1200, y: 300 },
    },

    // ── Stage 7: Deduplication ──
    // NOTE: Uses common.passthrough — dedicated ingestion.deduplicate executor not yet implemented
    {
      id: 'deduplicate',
      type: 'graphNode',
      data: {
        label: 'Deduplicate Entities & Relations',
        executorType: 'common.passthrough',
        description:
          'Entity dedup: case-insensitive name matching, property merge. ' +
          'Relation dedup: source|target|type composite key. ' +
          'Anomaly gate: >80% entity removal = noisy input.',
        toolRef: 'tool-common-passthrough',
        toolRefDesired: 'tool-ingestion-deduplicate',
        parameters: {
          entityDedup: 'case-insensitive-name',
          relationDedup: 'source-target-type-key',
          anomalyThreshold: 0.8,
        },
        inputFormat: {
          entities: { type: 'array', source: 'merge-results.entities' },
          relationships: { type: 'array', source: 'merge-results.relationships' },
        },
        outputFormat: {
          entities: { type: 'array', description: 'Deduplicated entities (passthrough until dedicated executor)' },
          relationships: { type: 'array', description: 'Deduplicated relationships (passthrough until dedicated executor)' },
        },
      },
      position: { x: 1400, y: 300 },
    },

    // ── Stage 8: Cross-Source Resolution ──
    // NOTE: Uses common.passthrough — dedicated ingestion.resolve_entities executor not yet implemented
    {
      id: 'resolve-entities',
      type: 'graphNode',
      data: {
        label: 'Cross-Source Entity Resolution',
        executorType: 'common.passthrough',
        description:
          'CrossSourceResolver: 3-level resolution strategy. ' +
          'L1: Vector similarity (Qdrant, threshold 0.85). ' +
          'L2: Fuzzy matching (Levenshtein, threshold 0.80). ' +
          'L3: GNN-enhanced scoring (optional, threshold 0.75). ' +
          'Weights: vector 50%, fuzzy 30%, GNN 20%.',
        toolRef: 'tool-common-passthrough',
        toolRefDesired: 'tool-ingestion-resolve-entities',
        parameters: {
          vectorThreshold: 0.85,
          fuzzyThreshold: 0.80,
          gnnThreshold: 0.75,
          maxCandidates: 10,
          useGNN: false,
        },
        inputFormat: {
          entities: { type: 'array', source: 'deduplicate.entities' },
          relationships: { type: 'array', source: 'deduplicate.relationships' },
        },
        outputFormat: {
          entities: { type: 'array', description: 'Resolved entities (passthrough until dedicated executor)' },
          relationships: { type: 'array', description: 'Relationships with resolved entity refs' },
        },
      },
      position: { x: 1600, y: 300 },
    },

    // ── Stage 9: Verification ──
    {
      id: 'verify',
      type: 'graphNode',
      data: {
        label: 'Verify Extraction Quality',
        executorType: 'common.validate',
        description:
          'GraphVerifier: score extraction results (0-1). ' +
          'Anomaly gates: 0 entities, all-same-type, short names, 0 relations. ' +
          'Threshold: overall score >= 0.6.',
        toolRef: 'tool-common-validate',
        parameters: {
          minScore: 0.6,
          checkEntityQuality: true,
          checkRelationQuality: true,
          rules: ['not_null', 'not_empty', 'is_object'],
        },
        inputFormat: {
          entities: { type: 'array', source: 'resolve-entities.entities' },
          relationships: { type: 'array', source: 'resolve-entities.relationships' },
        },
        outputFormat: {
          valid: { type: 'boolean', description: 'Validation passed' },
          errors: { type: 'array', description: 'Validation error messages' },
          input: {
            type: 'object',
            description: 'Original input passthrough: { entities, relationships }',
          },
        },
      },
      position: { x: 1800, y: 300 },
    },

    // ── Stage 10: Build ReactFlow Graph ──
    // NOTE: Uses common.passthrough — dedicated ingestion.build_graph executor not yet implemented
    {
      id: 'build-graph',
      type: 'graphNode',
      data: {
        label: 'Build ReactFlow Graph',
        executorType: 'common.passthrough',
        description:
          'Map entities → nodes (circular layout), relations → edges (smoothstep). ' +
          'Entity name → node ID normalization. ' +
          'Edge styling: stroke #8b5cf6, arrowclosed markers.',
        toolRef: 'tool-common-passthrough',
        toolRefDesired: 'tool-ingestion-build-graph',
        parameters: {
          layout: 'circular',
          edgeType: 'smoothstep',
          animated: true,
        },
        inputFormat: {
          entities: { type: 'array', source: 'verify.input.entities' },
          relationships: { type: 'array', source: 'verify.input.relationships' },
        },
        outputFormat: {
          entities: { type: 'array', description: 'Entities for graph persistence and embedding' },
          relationships: { type: 'array', description: 'Relationships for graph persistence' },
          nodes: { type: 'array', description: 'ReactFlow nodes (when dedicated executor implemented)', optional: true },
          edges: { type: 'array', description: 'ReactFlow edges (when dedicated executor implemented)', optional: true },
        },
      },
      position: { x: 2000, y: 200 },
    },

    // ── Stage 11: AI Quality Analysis ──
    {
      id: 'ai-analysis',
      type: 'graphNode',
      data: {
        label: 'AI Quality Analysis (Claude)',
        executorType: 'ai.llm_extract',
        description:
          'Claude Opus analyzes completeness: missing entities, missing relations, ' +
          'incorrect extractions. Returns completenessScore (0-100%), recommendations. ' +
          'Soft anomaly gate: score < 20% triggers warning.',
        toolRef: 'tool-ai-llm-extract',
        parameters: {
          model: 'claude-opus',
          analysisType: 'completeness',
          timeout: 60000,
          schema: {
            type: 'object',
            properties: {
              completenessScore: { type: 'number', description: '0-100 percentage' },
              missingEntities: { type: 'array', items: { type: 'string' } },
              missingRelations: { type: 'array', items: { type: 'string' } },
              incorrectExtractions: { type: 'array', items: { type: 'string' } },
              recommendations: { type: 'array', items: { type: 'string' } },
            },
          },
        },
        inputFormat: {
          entities: { type: 'array', source: 'verify.input.entities', description: 'Entities to analyze' },
          relationships: { type: 'array', source: 'verify.input.relationships', description: 'Relationships to analyze' },
        },
        outputFormat: {
          completenessScore: { type: 'number', description: 'Quality score 0-100%' },
          missingEntities: { type: 'array', description: 'Entities likely missed' },
          missingRelations: { type: 'array', description: 'Relations likely missed' },
          incorrectExtractions: { type: 'array', description: 'Likely incorrect extractions' },
          recommendations: { type: 'array', description: 'Improvement suggestions' },
        },
      },
      position: { x: 2000, y: 400 },
    },

    // ── Stage 12: Write to Graph DB ──
    {
      id: 'write-graph',
      type: 'graphNode',
      data: {
        label: 'Write to Memgraph',
        executorType: 'ingestion.write_graph',
        description:
          'Persist nodes and edges to Memgraph via mergeNode/mergeRelationship. ' +
          'Namespace-aware storage with provenance tracking.',
        toolRef: 'tool-ingestion-write-graph',
        parameters: {
          namespace: 'core',
          mergeStrategy: 'upsert',
          createProvenance: true,
          mergeExisting: true,
          minConfidence: 0.5,
        },
        inputFormat: {
          entities: { type: 'array', source: 'build-graph.entities', description: 'Entities to persist as graph nodes' },
          relationships: { type: 'array', source: 'build-graph.relationships', description: 'Relations to persist as graph edges' },
        },
        outputFormat: {
          written: { type: 'boolean' },
          nodesCreated: { type: 'number' },
          nodesUpdated: { type: 'number' },
          relationshipsCreated: { type: 'number' },
          errors: { type: 'array' },
          nodeIds: { type: 'array', description: 'IDs of created/updated Memgraph nodes' },
        },
      },
      position: { x: 2200, y: 200 },
    },

    // ── Stage 13: Write to Vector Store ──
    {
      id: 'write-vector',
      type: 'graphNode',
      data: {
        label: 'Write to Qdrant',
        executorType: 'ingestion.write_vector',
        description:
          'Embed entities via TEI (nomic-embed-text, 1024d) and store in Qdrant. ' +
          'Enables vector similarity search for entity resolution.',
        toolRef: 'tool-ingestion-write-vector',
        parameters: {
          model: 'nomic-embed-text',
          dimension: 1024,
          batchSize: 32,
          collection: 'kg_entities',
          generateEmbeddings: true,
        },
        inputFormat: {
          entities: { type: 'array', source: 'build-graph.entities', description: 'Entities to embed and store' },
          chunks: { type: 'array', source: 'chunk.chunks', optional: true, description: 'Text chunks for embedding (if available)' },
        },
        outputFormat: {
          written: { type: 'boolean' },
          pointsWritten: { type: 'number', description: 'Number of vectors stored in Qdrant' },
          pointIds: { type: 'array', description: 'Qdrant point IDs' },
          collection: { type: 'string', description: 'Target Qdrant collection name' },
          errors: { type: 'array' },
        },
      },
      position: { x: 2200, y: 400 },
    },

    // ── Stage 14: Output ──
    {
      id: 'output',
      type: 'graphNode',
      data: {
        label: 'Pipeline Output',
        executorType: 'common.passthrough',
        description:
          'Return final result: nodes, edges, aiAnalysis, stats (parse, chunk, extract, dedup, graph, duration).',
        toolRef: 'tool-common-passthrough',
        parameters: {},
        inputFormat: {
          _parallel: {
            type: 'array',
            description: 'Receives 3 parallel outputs: write-graph, write-vector, ai-analysis',
            items: [
              { source: 'write-graph', fields: { written: 'boolean', nodesCreated: 'number', relationshipsCreated: 'number' } },
              { source: 'write-vector', fields: { written: 'boolean', pointsWritten: 'number', collection: 'string' } },
              { source: 'ai-analysis', fields: { completenessScore: 'number', recommendations: 'array' } },
            ],
          },
        },
        outputFormat: {
          written: { type: 'boolean', description: 'Overall success' },
          nodesCreated: { type: 'number', description: 'Graph nodes persisted' },
          relationshipsCreated: { type: 'number', description: 'Graph edges persisted' },
          pointsWritten: { type: 'number', description: 'Vectors stored' },
          completenessScore: { type: 'number', description: 'AI quality score 0-100%' },
          recommendations: { type: 'array', description: 'AI improvement suggestions' },
        },
      },
      position: { x: 2400, y: 300 },
    },
  ],

  // ── EDGES ──────────────────────────────────────────────────────────────
  // Format: ReactFlow-compatible — source/target (NOT sourceNodeId/targetNodeId)
  // Each edge carries a dataContract describing the data shape flowing through it
  edges: [
    // Container root → pipeline entry
    { id: 'e00', source: 'pipeline-root', target: 'input', label: 'entry point',
      dataContract: { type: 'meta', description: 'Container ownership, not data flow' } },

    // Linear flow: input → sanitize → detect-language → chunk
    { id: 'e01', source: 'input', target: 'sanitize', label: 'raw text',
      dataContract: {
        fields: { text: 'string', metadata: '{ mimeType, originalLength, parsedAt }' },
        mapping: { 'input.text': 'sanitize.text' },
      } },
    { id: 'e02', source: 'sanitize', target: 'detect-language', label: 'clean text',
      dataContract: {
        fields: { text: 'string', sanitized: 'boolean', metadata: '{ originalLength, finalLength, compressionRatio }' },
        mapping: { 'sanitize.text': 'detect-language.text' },
      } },
    { id: 'e03', source: 'detect-language', target: 'chunk', label: 'text + lang',
      dataContract: {
        fields: { text: 'string', language: 'string', confidence: 'number' },
        mapping: { 'detect-language.text': 'chunk.text' },
      } },

    // Parallel extraction: chunk → entities AND chunk → relations
    { id: 'e04', source: 'chunk', target: 'extract-entities', label: 'chunks[]',
      dataContract: {
        fields: { chunks: 'array<{ content, index, metadata }>', totalChunks: 'number', text: 'string' },
        mapping: { 'chunk.chunks': 'extract-entities.chunks', 'detect-language.text': 'extract-entities.text' },
      } },
    { id: 'e05', source: 'chunk', target: 'extract-relations', label: 'chunks[]',
      dataContract: {
        fields: { chunks: 'array<{ content, index, metadata }>', totalChunks: 'number', text: 'string' },
        mapping: { 'chunk.chunks': 'extract-relations.chunks', 'detect-language.text': 'extract-relations.text' },
      } },

    // Merge: entities + relations → merge (fan-in from parallel)
    { id: 'e06', source: 'extract-entities', target: 'merge-results', label: 'entities[]',
      dataContract: {
        fields: { entities: 'array<{ name, type, confidence, context, normalizedForm }>', relationships: 'array', text: 'string' },
        mapping: { 'extract-entities.entities': 'merge-results[0].entities', 'extract-entities.relationships': 'merge-results[0].relationships' },
      } },
    { id: 'e07', source: 'extract-relations', target: 'merge-results', label: 'relations[]',
      dataContract: {
        fields: { relationships: 'array<{ source, target, type, confidence, evidence }>', entities: 'array' },
        mapping: { 'extract-relations.relationships': 'merge-results[1].relationships', 'extract-relations.entities': 'merge-results[1].entities' },
      } },

    // Sequential: merge → dedup → resolve → verify
    { id: 'e08', source: 'merge-results', target: 'deduplicate', label: 'merged entities + relations',
      dataContract: {
        fields: { entities: 'array<Entity>', relationships: 'array<Relationship>' },
        mapping: { 'merge-results.entities': 'deduplicate.entities', 'merge-results.relationships': 'deduplicate.relationships' },
      } },
    { id: 'e09', source: 'deduplicate', target: 'resolve-entities', label: 'unique entities',
      dataContract: {
        fields: { entities: 'array<Entity>', relationships: 'array<Relationship>' },
        mapping: { 'deduplicate.entities': 'resolve-entities.entities', 'deduplicate.relationships': 'resolve-entities.relationships' },
      } },
    { id: 'e10', source: 'resolve-entities', target: 'verify', label: 'resolved entities',
      dataContract: {
        fields: { entities: 'array<Entity>', relationships: 'array<Relationship>' },
        mapping: { 'resolve-entities.entities': 'verify.entities', 'resolve-entities.relationships': 'verify.relationships' },
      } },

    // Parallel output: verify → build-graph AND verify → ai-analysis (fan-out)
    { id: 'e11', source: 'verify', target: 'build-graph', label: 'verified data',
      dataContract: {
        fields: { valid: 'boolean', errors: 'array', input: '{ entities, relationships }' },
        mapping: { 'verify.input.entities': 'build-graph.entities', 'verify.input.relationships': 'build-graph.relationships' },
      } },
    { id: 'e12', source: 'verify', target: 'ai-analysis', label: 'verified data',
      dataContract: {
        fields: { valid: 'boolean', errors: 'array', input: '{ entities, relationships }' },
        mapping: { 'verify.input.entities': 'ai-analysis.entities', 'verify.input.relationships': 'ai-analysis.relationships' },
        note: 'Entire input serialized to JSON string for LLM analysis',
      } },

    // Parallel persistence: build-graph → write-graph, write-vector (fan-out)
    { id: 'e13', source: 'build-graph', target: 'write-graph', label: 'entities + relationships',
      dataContract: {
        fields: { entities: 'array<Entity>', relationships: 'array<Relationship>' },
        mapping: { 'build-graph.entities': 'write-graph.entities', 'build-graph.relationships': 'write-graph.relationships' },
      } },
    { id: 'e14', source: 'build-graph', target: 'write-vector', label: 'entities for embedding',
      dataContract: {
        fields: { entities: 'array<Entity>', relationships: 'array<Relationship>' },
        mapping: { 'build-graph.entities': 'write-vector.entities' },
        note: 'Entities are embedded as vectors; chunks may also be passed from earlier stages via context',
      } },

    // Final aggregation → output (fan-in from 3 parallel branches)
    { id: 'e15', source: 'write-graph', target: 'output', label: 'graph persisted',
      dataContract: {
        fields: { written: 'boolean', nodesCreated: 'number', nodesUpdated: 'number', relationshipsCreated: 'number', nodeIds: 'array' },
        mapping: { 'write-graph.*': 'output[0].*' },
      } },
    { id: 'e16', source: 'write-vector', target: 'output', label: 'vectors stored',
      dataContract: {
        fields: { written: 'boolean', pointsWritten: 'number', pointIds: 'array', collection: 'string' },
        mapping: { 'write-vector.*': 'output[1].*' },
      } },
    { id: 'e17', source: 'ai-analysis', target: 'output', label: 'quality report',
      dataContract: {
        fields: { completenessScore: 'number', missingEntities: 'array', missingRelations: 'array', recommendations: 'array' },
        mapping: { 'ai-analysis.*': 'output[2].*' },
      } },
  ],

  // ── REQUIRED PARAMS ────────────────────────────────────────────────────
  requiredParams: {
    text: {
      type: 'string',
      description: 'Input text for knowledge graph extraction',
      required: true,
    },
    method: {
      type: 'string',
      description: 'Extraction method: hybrid | pattern',
      default: 'hybrid',
    },
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// GENERATE TOOL-REFERENCE NODES + USES_TOOL EDGES
// Adds inline tool badges connected to each executor via dashed amber edges.
// These are generated programmatically from the toolRef fields above.
// ═══════════════════════════════════════════════════════════════════════════

const toolRefNodes = EXTRACTION_PIPELINE_GRAPH.nodes
  .filter(n => n.type === 'graphNode' && n.data?.toolRef)
  .map(n => {
    const toolId = n.data.toolRef;                         // e.g. 'tool-ingestion-parse-document'
    const trefId = `tref-${toolId.replace('tool-', '')}`;  // e.g. 'tref-ingestion-parse-document'
    const xOffset = 260; // Side-by-side: tool-ref to the right of executor
    return {
      id: trefId,
      type: 'graphNode',
      data: {
        label: n.data.label,
        kind: 'tool',
        description: n.data.executorType,
        executorType: n.data.executorType,
        toolNodeId: toolId,
        pluginDomain: n.data.executorType.split('.')[0],
        isToolRef: true,
      },
      position: { x: n.position.x + xOffset, y: n.position.y },
    };
  });

const toolRefEdges = EXTRACTION_PIPELINE_GRAPH.nodes
  .filter(n => n.type === 'graphNode' && n.data?.toolRef)
  .map(n => {
    const toolId = n.data.toolRef;
    const trefId = `tref-${toolId.replace('tool-', '')}`;
    return {
      id: `et-${n.id}`,
      source: n.id,
      target: trefId,
      sourceHandle: 'tool-bind',
      targetHandle: 'tool-bind',
      label: 'USES_TOOL',
      type: 'smoothstep',
      animated: false,
      style: { stroke: '#f59e0b', strokeWidth: 1.5, strokeDasharray: '5,5' },
      markerEnd: { type: 'arrowclosed', color: '#f59e0b' },
      dataContract: { type: 'tool-binding', description: 'Executor → Tool binding reference' },
    };
  });

EXTRACTION_PIPELINE_GRAPH.nodes.push(...toolRefNodes);
EXTRACTION_PIPELINE_GRAPH.edges.push(...toolRefEdges);

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: Write to Memgraph
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Seed: Knowledge Graph Extraction Pipeline → Core          ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  // Wait for memgraph service to initialize
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
    search: 'Knowledge Graph Extraction Pipeline',
  });

  if (existing.data && existing.data.length > 0) {
    const existingGraph = existing.data.find(g => g.name === 'Knowledge Graph Extraction Pipeline');
    if (existingGraph) {
      console.log(`[UPDATE] Graph already exists (id: ${existingGraph.id}), updating...`);
      const updated = await graphCatalogService.updateGraph(existingGraph.id, {
        nodes: EXTRACTION_PIPELINE_GRAPH.nodes,
        edges: EXTRACTION_PIPELINE_GRAPH.edges,
        description: EXTRACTION_PIPELINE_GRAPH.description,
        version: EXTRACTION_PIPELINE_GRAPH.version,
        tags: EXTRACTION_PIPELINE_GRAPH.tags,
      });
      console.log(`[OK] Graph updated: ${updated.name} (${updated.id})`);
      printSummary(updated);
      await cleanup();
      return;
    }
  }

  // Create new graph
  console.log('[CREATE] Writing new graph to Memgraph...');
  const created = await graphCatalogService.createGraph(EXTRACTION_PIPELINE_GRAPH);

  console.log(`[OK] Graph created: ${created.name} (${created.id})`);
  printSummary(created);

  await cleanup();
}

function printSummary(graph) {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : JSON.parse(graph.nodes || '[]');
  const edges = Array.isArray(graph.edges) ? graph.edges : JSON.parse(graph.edges || '[]');

  console.log('');
  console.log('┌─────────────────────────────────────────────────────────┐');
  console.log(`│ Name:      ${graph.name}`);
  console.log(`│ Namespace: ${graph.namespace}`);
  console.log(`│ Type:      ${graph.type}`);
  console.log(`│ Nodes:     ${nodes.length}`);
  console.log(`│ Edges:     ${edges.length}`);
  console.log(`│ ID:        ${graph.id}`);
  console.log(`│ Version:   ${graph.version || '—'}`);
  console.log('├─────────────────────────────────────────────────────────┤');
  // Separate executor nodes from tool-ref nodes
  const executorNodes = nodes.filter(n => n.type === 'graphNode' && !n.data?.isToolRef);
  const toolRefNodes = nodes.filter(n => n.data?.isToolRef);
  const usesToolEdges = edges.filter(e => e.label === 'USES_TOOL');
  const dataFlowEdges = edges.filter(e => e.label !== 'USES_TOOL');

  console.log('│ Pipeline Stages (with tool bindings):');
  let boundCount = 0;
  let passthroughCount = 0;
  for (const node of executorNodes) {
    const name = node.data?.label || node.displayName || node.id;
    const executor = node.data?.executorType || '—';
    const toolRef = node.data?.toolRef || '—';
    const desired = node.data?.toolRefDesired;
    if (desired) passthroughCount++; else boundCount++;
    console.log(`│   ${node.id.padEnd(20)} ${name.padEnd(32)} ${executor.padEnd(28)} → ${toolRef}`);
    if (desired) {
      console.log(`│   ${''.padEnd(20)} ${''.padEnd(32)} ${'⚠ needs:'.padEnd(28)}   ${desired}`);
    }
  }
  console.log('├─────────────────────────────────────────────────────────┤');
  console.log(`│ Executor nodes:    ${executorNodes.length}`);
  console.log(`│ Tool-ref nodes:    ${toolRefNodes.length} (kind: tool, amber badges)`);
  console.log(`│ USES_TOOL edges:   ${usesToolEdges.length}`);
  console.log(`│ Data-flow edges:   ${dataFlowEdges.length}`);
  console.log(`│ Tool bindings:     ${boundCount} bound, ${passthroughCount} passthrough stubs`);
  const edgesWithContracts = dataFlowEdges.filter(e => e.dataContract && e.dataContract.fields);
  console.log(`│ Data contracts:    ${edgesWithContracts.length}/${dataFlowEdges.length} data-flow edges have field mappings`);
  console.log('└─────────────────────────────────────────────────────────┘');
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
