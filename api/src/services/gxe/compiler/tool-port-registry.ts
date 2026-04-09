/**
 * GXE Graph Compiler - Tool Port Registry
 *
 * Phase 0: Foundation (Day 1-2)
 *
 * Single source of truth for all tool port definitions.
 * Each tool declares its input/output ports with types,
 * enabling compile-time type checking and adapter insertion.
 *
 * P0 Domain Tools (14 total):
 * - TEXT: text.sanitize, text.detect_language, text.chunk, text.normalize
 * - EXTRACTION: extraction.entities, extraction.relations
 * - VECTOR: vector.embed, vector.search, vector.write
 * - GRAPH: graph.query, graph.create_node, graph.create_edge
 * - AI: ai.generate, ai.classify
 *
 * P1 Control Flow Tools (5 total):
 * - CONTROL: control.condition, control.switch, control.parallel, control.loop, control.try_catch
 *
 * Total: 19 tools
 */

import {
  ToolPortSpec,
  PortDefinition,
  textType,
  numberType,
  booleanType,
  jsonType,
  embeddingType,
  listType,
  graphNodeType,
  graphEdgeType,
  anyType,
  DEFAULT_EMBEDDING_DIMENSIONS,
  TOOL_LEVELS,
  TOOL_CATEGORIES,
} from './compiler-types';

// ═══════════════════════════════════════════════════════════════════════════
// TOOL PORT REGISTRY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Complete registry of all tools with their port definitions.
 */
export const TOOL_PORT_REGISTRY: Record<string, ToolPortSpec> = {

  // ─────────────────────────────────────────────────────────────────────────
  // TEXT CATEGORY
  // ─────────────────────────────────────────────────────────────────────────

  'text.sanitize': {
    toolId: 'text.sanitize',
    category: TOOL_CATEGORIES.TEXT,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'raw_text',
        type: textType(),
        required: true,
        description: 'Raw text with possible HTML, special characters, or PII',
      },
      {
        name: 'options',
        type: jsonType({
          type: 'object',
          properties: {
            removeHtml: { type: 'boolean', default: true },
            normalizeWhitespace: { type: 'boolean', default: true },
            removePII: { type: 'boolean', default: false },
            lowercase: { type: 'boolean', default: false },
            removeUrls: { type: 'boolean', default: false },
            removeEmails: { type: 'boolean', default: false },
          },
        }),
        required: false,
        default: { removeHtml: true, normalizeWhitespace: true, removePII: false },
        description: 'Sanitization options',
      },
    ],

    outputPorts: [
      {
        name: 'clean_text',
        type: textType(),
        required: true,
        description: 'Sanitized text',
      },
      {
        name: 'stats',
        type: jsonType({
          type: 'object',
          properties: {
            originalLength: { type: 'number' },
            cleanLength: { type: 'number' },
            charsRemoved: { type: 'number' },
            piiFound: { type: 'number' },
          },
        }),
        required: true,
        description: 'Sanitization statistics',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'TextSanitizer',
      method: 'sanitize',
    },

    description: 'Remove HTML, normalize whitespace, optionally redact PII',
    sideEffects: [],
    estimatedDurationMs: 50,
    retryable: true,
  },

  'text.detect_language': {
    toolId: 'text.detect_language',
    category: TOOL_CATEGORIES.TEXT,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'text',
        type: textType(),
        required: true,
        description: 'Text to detect language for',
      },
    ],

    outputPorts: [
      {
        name: 'language',
        type: textType(),
        required: true,
        description: 'ISO 639-1 language code (e.g., "en", "ru", "fr")',
      },
      {
        name: 'confidence',
        type: numberType({ min: 0, max: 1 }),
        required: true,
        description: 'Detection confidence (0-1)',
      },
      {
        name: 'alternatives',
        type: listType(jsonType({
          type: 'object',
          properties: {
            language: { type: 'string' },
            confidence: { type: 'number' },
          },
        })),
        required: true,
        description: 'Alternative language detections',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'LanguageDetector',
      method: 'detect',
    },

    description: 'Detect the language of input text',
    sideEffects: [],
    estimatedDurationMs: 30,
    retryable: true,
  },

  'text.chunk': {
    toolId: 'text.chunk',
    category: TOOL_CATEGORIES.TEXT,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'text',
        type: textType(),
        required: true,
        description: 'Text to split into chunks',
      },
      {
        name: 'chunk_size',
        type: numberType({ min: 100, max: 10000, integer: true }),
        required: false,
        default: 1000,
        description: 'Target chunk size in characters',
      },
      {
        name: 'chunk_overlap',
        type: numberType({ min: 0, max: 500, integer: true }),
        required: false,
        default: 200,
        description: 'Overlap between chunks in characters',
      },
      {
        name: 'strategy',
        type: textType(),
        required: false,
        default: 'semantic',
        description: 'Chunking strategy: "semantic", "fixed", "sentence"',
      },
    ],

    outputPorts: [
      {
        name: 'chunks',
        type: listType(jsonType({
          type: 'object',
          properties: {
            text: { type: 'string' },
            index: { type: 'number' },
            startChar: { type: 'number' },
            endChar: { type: 'number' },
            metadata: { type: 'object' },
          },
        })),
        required: true,
        description: 'Array of text chunks with metadata',
      },
      {
        name: 'chunk_count',
        type: numberType({ integer: true }),
        required: true,
        description: 'Total number of chunks created',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'TextChunker',
      method: 'chunk',
    },

    description: 'Split text into overlapping chunks for processing',
    sideEffects: [],
    estimatedDurationMs: 100,
    retryable: true,
  },

  'text.normalize': {
    toolId: 'text.normalize',
    category: TOOL_CATEGORIES.TEXT,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'text',
        type: textType(),
        required: true,
        description: 'Text to normalize',
      },
      {
        name: 'operations',
        type: listType(textType()),
        required: false,
        default: ['trim', 'lowercase', 'normalize_unicode'],
        description: 'Normalization operations: "trim", "lowercase", "uppercase", "normalize_unicode", "remove_diacritics"',
      },
    ],

    outputPorts: [
      {
        name: 'normalized_text',
        type: textType(),
        required: true,
        description: 'Normalized text',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'TextNormalizer',
      method: 'normalize',
    },

    description: 'Apply text normalization operations (trim, case, unicode)',
    sideEffects: [],
    estimatedDurationMs: 10,
    retryable: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // EXTRACTION CATEGORY
  // ─────────────────────────────────────────────────────────────────────────

  'extraction.entities': {
    toolId: 'extraction.entities',
    category: TOOL_CATEGORIES.EXTRACTION,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'text',
        type: textType(),
        required: true,
        description: 'Text to extract entities from',
      },
      {
        name: 'entity_types',
        type: listType(textType()),
        required: false,
        default: ['PERSON', 'ORGANIZATION', 'LOCATION', 'DATE', 'CONCEPT'],
        description: 'Types of entities to extract',
      },
      {
        name: 'context',
        type: jsonType(),
        required: false,
        description: 'Additional context for extraction (document metadata)',
      },
      {
        name: 'confidence_threshold',
        type: numberType({ min: 0, max: 1 }),
        required: false,
        default: 0.7,
        description: 'Minimum confidence threshold for entities',
      },
    ],

    outputPorts: [
      {
        name: 'entities',
        type: listType(jsonType({
          type: 'object',
          properties: {
            text: { type: 'string' },
            type: { type: 'string' },
            confidence: { type: 'number' },
            startOffset: { type: 'number' },
            endOffset: { type: 'number' },
            normalized: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['text', 'type', 'confidence'],
        })),
        required: true,
        description: 'Extracted entities with metadata',
      },
      {
        name: 'entity_count',
        type: numberType({ integer: true }),
        required: true,
        description: 'Total number of entities extracted',
      },
      {
        name: 'extraction_stats',
        type: jsonType({
          type: 'object',
          properties: {
            byType: { type: 'object' },
            avgConfidence: { type: 'number' },
            processingTimeMs: { type: 'number' },
          },
        }),
        required: true,
        description: 'Extraction statistics',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'EntityExtractor',
      method: 'extract',
    },

    description: 'Extract named entities (people, organizations, dates, etc.) using LLM',
    sideEffects: ['LLM_CALL'],
    estimatedDurationMs: 2000,
    retryable: true,
  },

  'extraction.relations': {
    toolId: 'extraction.relations',
    category: TOOL_CATEGORIES.EXTRACTION,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'text',
        type: textType(),
        required: true,
        description: 'Text to extract relations from',
      },
      {
        name: 'entities',
        type: listType(jsonType({
          type: 'object',
          properties: {
            text: { type: 'string' },
            type: { type: 'string' },
            confidence: { type: 'number' },
            startOffset: { type: 'number' },
            endOffset: { type: 'number' },
            normalized: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['text', 'type', 'confidence'],
        })),
        required: true,
        description: 'Pre-extracted entities to find relations between (output from extraction.entities)',
      },
      {
        name: 'relation_types',
        type: listType(textType()),
        required: false,
        default: ['WORKS_FOR', 'LOCATED_IN', 'RELATES_TO', 'PART_OF', 'MANAGES'],
        description: 'Types of relations to extract',
      },
      {
        name: 'confidence_threshold',
        type: numberType({ min: 0, max: 1 }),
        required: false,
        default: 0.6,
        description: 'Minimum confidence threshold for relations',
      },
    ],

    outputPorts: [
      {
        name: 'relations',
        type: listType(jsonType({
          type: 'object',
          properties: {
            source: { type: 'object' },
            target: { type: 'object' },
            type: { type: 'string' },
            confidence: { type: 'number' },
            evidence: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['source', 'target', 'type', 'confidence'],
        })),
        required: true,
        description: 'Extracted relations between entities',
      },
      {
        name: 'relation_count',
        type: numberType({ integer: true }),
        required: true,
        description: 'Total number of relations extracted',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'RelationExtractor',
      method: 'extract',
    },

    description: 'Extract relationships between entities using LLM',
    sideEffects: ['LLM_CALL'],
    estimatedDurationMs: 2500,
    retryable: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // VECTOR CATEGORY
  // ─────────────────────────────────────────────────────────────────────────

  'vector.embed': {
    toolId: 'vector.embed',
    category: TOOL_CATEGORIES.VECTOR,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'text',
        type: textType(),
        required: true,
        description: 'Text to generate embedding for',
      },
      {
        name: 'model',
        type: textType(),
        required: false,
        default: 'tei-default',
        description: 'Embedding model identifier',
      },
    ],

    outputPorts: [
      {
        name: 'embedding',
        type: embeddingType(DEFAULT_EMBEDDING_DIMENSIONS),
        required: true,
        description: `Dense vector representation (${DEFAULT_EMBEDDING_DIMENSIONS}-dimensional)`,
      },
      {
        name: 'model_used',
        type: textType(),
        required: true,
        description: 'Actual model used for embedding',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'TEIService',
      method: 'embed',
    },

    description: 'Generate text embedding via TEI service',
    sideEffects: ['EXTERNAL'],
    estimatedDurationMs: 200,
    retryable: true,
  },

  'vector.search': {
    toolId: 'vector.search',
    category: TOOL_CATEGORIES.VECTOR,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'query_embedding',
        type: embeddingType(DEFAULT_EMBEDDING_DIMENSIONS),
        required: true,
        description: 'Query vector for similarity search',
      },
      {
        name: 'collection',
        type: textType(),
        required: false,
        default: 'default',
        description: 'Qdrant collection name',
      },
      {
        name: 'top_k',
        type: numberType({ min: 1, max: 100, integer: true }),
        required: false,
        default: 10,
        description: 'Number of results to return',
      },
      {
        name: 'score_threshold',
        type: numberType({ min: 0, max: 1 }),
        required: false,
        default: 0.7,
        description: 'Minimum similarity score',
      },
      {
        name: 'filter',
        type: jsonType(),
        required: false,
        description: 'Qdrant filter conditions',
      },
    ],

    outputPorts: [
      {
        name: 'results',
        type: listType(jsonType({
          type: 'object',
          properties: {
            id: { type: 'string' },
            score: { type: 'number' },
            payload: { type: 'object' },
          },
          required: ['id', 'score'],
        })),
        required: true,
        description: 'Search results with scores and payloads',
      },
      {
        name: 'result_count',
        type: numberType({ integer: true }),
        required: true,
        description: 'Number of results returned',
      },
      {
        name: 'search_time_ms',
        type: numberType(),
        required: true,
        description: 'Search execution time in milliseconds',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'QdrantService',
      method: 'search',
    },

    description: 'Semantic similarity search in Qdrant vector database',
    sideEffects: ['READ'],
    estimatedDurationMs: 150,
    retryable: true,
  },

  'vector.write': {
    toolId: 'vector.write',
    category: TOOL_CATEGORIES.VECTOR,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'embedding',
        type: embeddingType(DEFAULT_EMBEDDING_DIMENSIONS),
        required: true,
        description: 'Vector embedding to store',
      },
      {
        name: 'payload',
        type: jsonType(),
        required: true,
        description: 'Metadata payload to store with the vector',
      },
      {
        name: 'collection',
        type: textType(),
        required: false,
        default: 'default',
        description: 'Qdrant collection name',
      },
      {
        name: 'id',
        type: textType(),
        required: false,
        description: 'Optional point ID (auto-generated if not provided)',
      },
    ],

    outputPorts: [
      {
        name: 'point_id',
        type: textType(),
        required: true,
        description: 'ID of the stored point',
      },
      {
        name: 'status',
        type: textType(),
        required: true,
        description: 'Operation status: "created" or "updated"',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'QdrantService',
      method: 'upsert',
    },

    description: 'Store embedding vector in Qdrant (upsert - idempotent)',
    sideEffects: ['WRITE'],
    estimatedDurationMs: 100,
    retryable: true, // upsert is idempotent
  },

  // ─────────────────────────────────────────────────────────────────────────
  // GRAPH CATEGORY
  // ─────────────────────────────────────────────────────────────────────────

  'graph.query': {
    toolId: 'graph.query',
    category: TOOL_CATEGORIES.GRAPH,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'cypher',
        type: textType(),
        required: true,
        description: 'Cypher query to execute',
      },
      {
        name: 'params',
        type: jsonType(),
        required: false,
        default: {},
        description: 'Query parameters',
      },
    ],

    outputPorts: [
      {
        name: 'records',
        type: listType(jsonType()),
        required: true,
        description: 'Query result records',
      },
      {
        name: 'record_count',
        type: numberType({ integer: true }),
        required: true,
        description: 'Number of records returned',
      },
      {
        name: 'query_time_ms',
        type: numberType(),
        required: true,
        description: 'Query execution time in milliseconds',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'MemgraphService',
      method: 'query',
    },

    description: 'Execute read-only Cypher query on Memgraph',
    sideEffects: ['READ'],
    estimatedDurationMs: 100,
    retryable: true, // read-only queries safe to retry
  },

  'graph.create_node': {
    toolId: 'graph.create_node',
    category: TOOL_CATEGORIES.GRAPH,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'label',
        type: textType(),
        required: true,
        description: 'Node label (e.g., "Person", "Document")',
      },
      {
        name: 'properties',
        type: jsonType(),
        required: true,
        description: 'Node properties',
      },
    ],

    outputPorts: [
      {
        name: 'node',
        type: graphNodeType(),
        required: true,
        description: 'Created node with ID',
      },
      {
        name: 'node_id',
        type: textType(),
        required: true,
        description: 'ID of the created node',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'MemgraphService',
      method: 'createNode',
    },

    description: 'Create a node in Memgraph graph database',
    sideEffects: ['WRITE'],
    estimatedDurationMs: 50,
    retryable: false, // duplicates undesirable
  },

  'graph.create_edge': {
    toolId: 'graph.create_edge',
    category: TOOL_CATEGORIES.GRAPH,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'source_id',
        type: textType(),
        required: true,
        description: 'Source node ID',
      },
      {
        name: 'target_id',
        type: textType(),
        required: true,
        description: 'Target node ID',
      },
      {
        name: 'type',
        type: textType(),
        required: true,
        description: 'Relationship type (e.g., "WORKS_FOR", "RELATES_TO")',
      },
      {
        name: 'properties',
        type: jsonType(),
        required: false,
        default: {},
        description: 'Edge properties',
      },
    ],

    outputPorts: [
      {
        name: 'edge',
        type: graphEdgeType(),
        required: true,
        description: 'Created edge with ID',
      },
      {
        name: 'edge_id',
        type: textType(),
        required: true,
        description: 'ID of the created edge',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'MemgraphService',
      method: 'createEdge',
    },

    description: 'Create an edge between nodes in Memgraph',
    sideEffects: ['WRITE'],
    estimatedDurationMs: 50,
    retryable: false, // duplicates undesirable
  },

  // ─────────────────────────────────────────────────────────────────────────
  // AI CATEGORY
  // ─────────────────────────────────────────────────────────────────────────

  'ai.generate': {
    toolId: 'ai.generate',
    category: TOOL_CATEGORIES.AI,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'prompt',
        type: textType(),
        required: true,
        description: 'User prompt for generation',
      },
      {
        name: 'system_prompt',
        type: textType(),
        required: false,
        description: 'System prompt for context',
      },
      {
        name: 'model',
        type: textType(),
        required: false,
        default: 'llama3',
        description: 'LLM model identifier',
      },
      {
        name: 'temperature',
        type: numberType({ min: 0, max: 2 }),
        required: false,
        default: 0.3,
        description: 'Sampling temperature',
      },
      {
        name: 'max_tokens',
        type: numberType({ min: 1, max: 8192, integer: true }),
        required: false,
        default: 1024,
        description: 'Maximum tokens in response',
      },
    ],

    outputPorts: [
      {
        name: 'text',
        type: textType(),
        required: true,
        description: 'Generated text response',
      },
      {
        name: 'usage',
        type: jsonType({
          type: 'object',
          properties: {
            promptTokens: { type: 'number' },
            completionTokens: { type: 'number' },
            totalTokens: { type: 'number' },
          },
        }),
        required: true,
        description: 'Token usage statistics',
      },
      {
        name: 'model_used',
        type: textType(),
        required: true,
        description: 'Actual model used for generation',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'LLMService',
      method: 'generate',
    },

    description: 'Generate text using LLM (most expensive operation)',
    sideEffects: ['LLM_CALL'],
    estimatedDurationMs: 5000, // slowest tool
    retryable: true,
  },

  'ai.classify': {
    toolId: 'ai.classify',
    category: TOOL_CATEGORIES.AI,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'text',
        type: textType(),
        required: true,
        description: 'Text to classify',
      },
      {
        name: 'categories',
        type: listType(textType()),
        required: true,
        description: 'List of possible categories',
      },
      {
        name: 'multi_label',
        type: booleanType(),
        required: false,
        default: false,
        description: 'Allow multiple categories to be assigned',
      },
    ],

    outputPorts: [
      {
        name: 'category',
        type: textType(),
        required: true,
        description: 'Top predicted category',
      },
      {
        name: 'confidence',
        type: numberType({ min: 0, max: 1 }),
        required: true,
        description: 'Confidence score for top category',
      },
      {
        name: 'all_scores',
        type: jsonType({
          type: 'object',
          additionalProperties: { type: 'number' },
        }),
        required: true,
        description: 'Scores for all categories',
      },
    ],

    execution: {
      type: 'service',
      serviceId: 'LLMService',
      method: 'classify',
    },

    description: 'Classify text into predefined categories using LLM',
    sideEffects: ['LLM_CALL'],
    estimatedDurationMs: 3000,
    retryable: true,
  },

  // ─────────────────────────────────────────────────────────────────────────
  // CONTROL CATEGORY (P1 - Control Flow)
  // ─────────────────────────────────────────────────────────────────────────

  'control.condition': {
    toolId: 'control.condition',
    category: TOOL_CATEGORIES.CONTROL,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'value',
        type: anyType(),
        required: true,
        description: 'Value to evaluate',
      },
      {
        name: 'operator',
        type: textType(),
        required: true,
        description: 'Comparison operator: "eq", "ne", "gt", "lt", "gte", "lte", "contains", "truthy"',
      },
      {
        name: 'comparand',
        type: anyType(),
        required: false,
        description: 'Value to compare against (not needed for "truthy")',
      },
    ],

    outputPorts: [
      {
        name: 'result',
        type: booleanType(),
        required: true,
        description: 'Comparison result (true/false)',
      },
    ],

    execution: {
      type: 'control',
    },

    description: 'Evaluate a condition for branching logic',
    sideEffects: [],
    estimatedDurationMs: 1,
    retryable: true,
  },

  'control.switch': {
    toolId: 'control.switch',
    category: TOOL_CATEGORIES.CONTROL,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'value',
        type: anyType(),
        required: true,
        description: 'Value to switch on',
      },
      {
        name: 'cases',
        type: listType(textType()),
        required: true,
        description: 'List of possible case values',
      },
    ],

    outputPorts: [
      {
        name: 'matched_case',
        type: textType(),
        required: true,
        description: 'Matched case value or "default" if no match',
      },
      {
        name: 'case_index',
        type: numberType({ integer: true }),
        required: true,
        description: 'Index of matched case (-1 for default)',
      },
    ],

    execution: {
      type: 'control',
    },

    description: 'Multi-way branching based on value matching',
    sideEffects: [],
    estimatedDurationMs: 1,
    retryable: true,
  },

  'control.parallel': {
    toolId: 'control.parallel',
    category: TOOL_CATEGORIES.CONTROL,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'input',
        type: anyType(),
        required: true,
        description: 'Input data passed to all parallel branches',
      },
    ],

    outputPorts: [
      {
        name: 'results',
        type: jsonType({
          type: 'object',
          description: 'Results from all branches keyed by branch ID',
        }),
        required: true,
        description: 'Combined results from all parallel branches',
      },
      {
        name: 'branch_count',
        type: numberType({ integer: true }),
        required: true,
        description: 'Number of parallel branches executed',
      },
    ],

    execution: {
      type: 'control',
    },

    description: 'Execute multiple branches in parallel (fork)',
    sideEffects: [],
    estimatedDurationMs: 1, // actual time = max(branches)
    retryable: true,
  },

  'control.loop': {
    toolId: 'control.loop',
    category: TOOL_CATEGORIES.CONTROL,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'items',
        type: listType(anyType()),
        required: true,
        description: 'Array of items to iterate over',
      },
      {
        name: 'max_iterations',
        type: numberType({ min: 1, max: 10000, integer: true }),
        required: false,
        default: 100,
        description: 'Maximum iterations (safety limit)',
      },
    ],

    outputPorts: [
      {
        name: 'results',
        type: listType(jsonType()),
        required: true,
        description: 'Results from each iteration',
      },
      {
        name: 'iteration_count',
        type: numberType({ integer: true }),
        required: true,
        description: 'Actual number of iterations performed',
      },
    ],

    execution: {
      type: 'control',
    },

    description: 'Iterate over array items (for-each loop)',
    sideEffects: [],
    estimatedDurationMs: 1, // actual time = sum(iterations)
    retryable: true,
  },

  'control.try_catch': {
    toolId: 'control.try_catch',
    category: TOOL_CATEGORIES.CONTROL,
    level: TOOL_LEVELS.DOMAIN,

    inputPorts: [
      {
        name: 'input',
        type: anyType(),
        required: true,
        description: 'Input data for the try block',
      },
    ],

    outputPorts: [
      {
        name: 'result',
        type: anyType(),
        required: true,
        description: 'Result from try block (or catch block on error)',
      },
      {
        name: 'error',
        type: jsonType({
          type: 'object',
          properties: {
            message: { type: 'string' },
            code: { type: 'string' },
            nodeId: { type: 'string' },
          },
        }),
        required: false,
        description: 'Error details if catch was triggered',
      },
      {
        name: 'caught',
        type: booleanType(),
        required: true,
        description: 'Whether an error was caught',
      },
    ],

    execution: {
      type: 'control',
    },

    description: 'Error handling wrapper with try/catch semantics',
    sideEffects: [],
    estimatedDurationMs: 1,
    retryable: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// REGISTRY API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get tool specification by ID.
 *
 * @param toolId - Tool identifier (e.g., "text.sanitize")
 * @returns Tool specification or null if not found
 */
export function getToolSpec(toolId: string): ToolPortSpec | null {
  return TOOL_PORT_REGISTRY[toolId] ?? null;
}

/**
 * List all tools, optionally filtered by category.
 *
 * @param category - Optional category filter
 * @returns Array of tool specifications
 */
export function listTools(category?: string): ToolPortSpec[] {
  const tools = Object.values(TOOL_PORT_REGISTRY);
  if (category) {
    return tools.filter(t => t.category === category);
  }
  return tools;
}

/**
 * List all tools by level.
 *
 * @param level - Tool level (1-4)
 * @returns Array of tool specifications
 */
export function listToolsByLevel(level: 1 | 2 | 3 | 4): ToolPortSpec[] {
  return Object.values(TOOL_PORT_REGISTRY).filter(t => t.level === level);
}

/**
 * Check if a tool exists in the registry.
 *
 * @param toolId - Tool identifier
 * @returns True if tool exists
 */
export function toolExists(toolId: string): boolean {
  return toolId in TOOL_PORT_REGISTRY;
}

/**
 * Get input port definition for a tool.
 *
 * @param toolId - Tool identifier
 * @param portName - Port name
 * @returns Port definition or null if not found
 */
export function getInputPort(toolId: string, portName: string): PortDefinition | null {
  const tool = getToolSpec(toolId);
  if (!tool) return null;
  return tool.inputPorts.find(p => p.name === portName) ?? null;
}

/**
 * Get output port definition for a tool.
 *
 * @param toolId - Tool identifier
 * @param portName - Port name
 * @returns Port definition or null if not found
 */
export function getOutputPort(toolId: string, portName: string): PortDefinition | null {
  const tool = getToolSpec(toolId);
  if (!tool) return null;
  return tool.outputPorts.find(p => p.name === portName) ?? null;
}

/**
 * Get all input ports for a tool.
 *
 * @param toolId - Tool identifier
 * @returns Array of input port definitions or empty array if tool not found
 */
export function getInputPorts(toolId: string): PortDefinition[] {
  const tool = getToolSpec(toolId);
  return tool?.inputPorts ?? [];
}

/**
 * Get all output ports for a tool.
 *
 * @param toolId - Tool identifier
 * @returns Array of output port definitions or empty array if tool not found
 */
export function getOutputPorts(toolId: string): PortDefinition[] {
  const tool = getToolSpec(toolId);
  return tool?.outputPorts ?? [];
}

/**
 * Get all tool IDs in the registry.
 *
 * @returns Array of tool IDs
 */
export function getAllToolIds(): string[] {
  return Object.keys(TOOL_PORT_REGISTRY);
}

/**
 * Get all categories in the registry.
 *
 * @returns Array of unique category names
 */
export function getAllCategories(): string[] {
  return Array.from(new Set(Object.values(TOOL_PORT_REGISTRY).map(t => t.category)));
}

/**
 * Get statistics about the registry.
 *
 * @returns Registry statistics
 */
export function getRegistryStats(): {
  totalTools: number;
  byCategory: Record<string, number>;
  byLevel: Record<number, number>;
} {
  const tools = Object.values(TOOL_PORT_REGISTRY);
  const byCategory: Record<string, number> = {};
  const byLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

  for (const tool of tools) {
    byCategory[tool.category] = (byCategory[tool.category] || 0) + 1;
    byLevel[tool.level]++;
  }

  return {
    totalTools: tools.length,
    byCategory,
    byLevel,
  };
}
