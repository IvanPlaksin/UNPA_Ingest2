/**
 * GXE Execution Engine - Service Container
 *
 * Phase 0: Foundation (Day 6)
 *
 * Simple dependency injection container for resolving services
 * by their serviceId from ToolPortSpec.
 */

import { getToolSpec } from '../compiler';

// ═══════════════════════════════════════════════════════════════════════════
// REAL SERVICE IMPORTS (lazy-loaded to avoid circular dependencies)
// ═══════════════════════════════════════════════════════════════════════════

// Singleton services (lazy)
let _qdrantService: unknown = null;
let _memgraphService: unknown = null;
let _teiService: unknown = null;
let _llmService: unknown = null;

function getQdrantService(): unknown {
  if (!_qdrantService) {
    try {
      _qdrantService = require('../../qdrant.service');
    } catch (e) {
      console.warn('[ServiceContainer] QdrantService not available:', (e as Error).message);
    }
  }
  return _qdrantService;
}

function getMemgraphService(): unknown {
  if (!_memgraphService) {
    try {
      _memgraphService = require('../../memgraph.service');
    } catch (e) {
      console.warn('[ServiceContainer] MemgraphService not available:', (e as Error).message);
    }
  }
  return _memgraphService;
}

function getTeiService(): unknown {
  if (!_teiService) {
    try {
      _teiService = require('../../tei.service');
    } catch (e) {
      console.warn('[ServiceContainer] TEIService not available:', (e as Error).message);
    }
  }
  return _teiService;
}

function getLlmService(): unknown {
  if (!_llmService) {
    try {
      _llmService = require('../../llm.service');
    } catch (e) {
      console.warn('[ServiceContainer] LLMService not available:', (e as Error).message);
    }
  }
  return _llmService;
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Service health status.
 */
export interface ServiceHealth {
  serviceId: string;
  healthy: boolean;
  latencyMs?: number;
  error?: string;
  checkedAt: Date;
}

/**
 * Service call result.
 */
export interface ServiceCallResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

/**
 * Input mapping function type.
 */
export type InputMapper = (inputs: Record<string, unknown>) => unknown[];

/**
 * Output mapping function type.
 */
export type OutputMapper = (result: unknown) => Record<string, unknown>;

/**
 * Service wrapper with mappings.
 */
export interface ServiceWrapper {
  instance: unknown;
  inputMapper?: InputMapper;
  outputMapper?: OutputMapper;
}

// ═══════════════════════════════════════════════════════════════════════════
// SERVICE CONTAINER CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Service container for resolving and calling services.
 */
export class ServiceContainer {
  private services: Map<string, ServiceWrapper> = new Map();
  private initialized: boolean = false;

  /**
   * Register a service with optional input/output mappers.
   *
   * @param serviceId - Service identifier from ToolPortSpec
   * @param instance - Service instance
   * @param inputMapper - Optional function to map port inputs to method arguments
   * @param outputMapper - Optional function to map method result to port outputs
   */
  register(
    serviceId: string,
    instance: unknown,
    inputMapper?: InputMapper,
    outputMapper?: OutputMapper
  ): void {
    this.services.set(serviceId, {
      instance,
      inputMapper,
      outputMapper,
    });
  }

  /**
   * Get a registered service.
   */
  get(serviceId: string): unknown | null {
    const wrapper = this.services.get(serviceId);
    return wrapper?.instance ?? null;
  }

  /**
   * Check if service is registered.
   */
  has(serviceId: string): boolean {
    return this.services.has(serviceId);
  }

  /**
   * Get all registered service IDs.
   */
  getRegisteredServices(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Call a service method with inputs.
   *
   * @param serviceId - Service identifier
   * @param method - Method name to call
   * @param inputs - Input values keyed by port name
   * @param inputMapping - Optional array of port names for positional arguments
   * @returns Promise with result keyed by output port names
   */
  async callService(
    serviceId: string,
    method: string,
    inputs: Record<string, unknown>,
    inputMapping?: string[]
  ): Promise<ServiceCallResult> {
    const startTime = Date.now();

    try {
      const wrapper = this.services.get(serviceId);
      if (!wrapper) {
        return {
          success: false,
          error: `Service not registered: ${serviceId}`,
          durationMs: Date.now() - startTime,
        };
      }

      const service = wrapper.instance as Record<string, unknown>;
      const fn = service[method];

      if (typeof fn !== 'function') {
        return {
          success: false,
          error: `Method '${method}' not found on service '${serviceId}'`,
          durationMs: Date.now() - startTime,
        };
      }

      // Convert inputs to arguments
      let args: unknown[];

      if (wrapper.inputMapper) {
        // Use custom mapper
        args = wrapper.inputMapper(inputs);
      } else if (inputMapping) {
        // Use positional mapping from port names
        args = inputMapping.map(portName => inputs[portName]);
      } else {
        // Pass inputs as single object
        args = [inputs];
      }

      // Call the method
      const result = await (fn as Function).apply(service, args);

      // Map result to outputs
      let data: Record<string, unknown>;

      if (wrapper.outputMapper) {
        data = wrapper.outputMapper(result);
      } else if (typeof result === 'object' && result !== null) {
        data = result as Record<string, unknown>;
      } else {
        // Wrap primitive result
        data = { result };
      }

      return {
        success: true,
        data,
        durationMs: Date.now() - startTime,
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Initialize container (can be used for async service setup).
   */
  async initialize(): Promise<void> {
    // Placeholder for async initialization
    // Can be extended to call init() on services that need it
    this.initialized = true;
  }

  /**
   * Check if container is initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Health check all registered services.
   */
  async healthCheck(): Promise<Map<string, ServiceHealth>> {
    const results = new Map<string, ServiceHealth>();
    const serviceIds = Array.from(this.services.keys());

    for (const serviceId of serviceIds) {
      const wrapper = this.services.get(serviceId)!;
      const startTime = Date.now();
      const health: ServiceHealth = {
        serviceId,
        healthy: false,
        checkedAt: new Date(),
      };

      try {
        const service = wrapper.instance as Record<string, unknown>;

        // Try calling health check method if exists
        if (typeof service.healthCheck === 'function') {
          await service.healthCheck();
        } else if (typeof service.ping === 'function') {
          await service.ping();
        } else if (typeof service.isConnected === 'function') {
          const connected = await service.isConnected();
          if (!connected) throw new Error('Not connected');
        }

        health.healthy = true;
        health.latencyMs = Date.now() - startTime;

      } catch (error) {
        health.healthy = false;
        health.error = error instanceof Error ? error.message : String(error);
        health.latencyMs = Date.now() - startTime;
      }

      results.set(serviceId, health);
    }

    return results;
  }

  /**
   * Clear all registered services.
   */
  clear(): void {
    this.services.clear();
    this.initialized = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GLOBAL CONTAINER INSTANCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Global service container instance.
 * Initialize in app bootstrap with actual service instances.
 */
export const globalServiceContainer = new ServiceContainer();

// ═══════════════════════════════════════════════════════════════════════════
// INPUT/OUTPUT MAPPERS FOR COMMON SERVICES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default input mappings for known services.
 * Maps port names to positional arguments.
 *
 * These can be overridden when registering services.
 */
export const DEFAULT_INPUT_MAPPINGS: Record<string, string[]> = {
  // Text services
  'TextSanitizer.sanitize': ['raw_text', 'options'],
  'LanguageDetector.detect': ['text'],
  'TextChunker.chunk': ['text', 'chunk_size', 'chunk_overlap', 'strategy'],
  'TextNormalizer.normalize': ['text', 'operations'],

  // Extraction services
  'EntityExtractor.extract': ['text', 'entity_types', 'context', 'confidence_threshold'],
  'RelationExtractor.extract': ['text', 'entities', 'relation_types', 'confidence_threshold'],

  // Vector services
  'TEIService.embed': ['text', 'model'],
  'QdrantService.search': ['query_embedding', 'collection', 'top_k', 'score_threshold', 'filter'],
  'QdrantService.upsert': ['embedding', 'payload', 'collection', 'id'],

  // Graph services
  'MemgraphService.query': ['cypher', 'params'],
  'MemgraphService.createNode': ['label', 'properties'],
  'MemgraphService.createEdge': ['source_id', 'target_id', 'type', 'properties'],

  // AI services
  'LLMService.generate': ['prompt', 'system_prompt', 'model', 'temperature', 'max_tokens'],
  'LLMService.classify': ['text', 'categories', 'multi_label'],
};

/**
 * Get input mapping for a service method.
 */
export function getInputMapping(serviceId: string, method: string): string[] | undefined {
  const key = `${serviceId}.${method}`;
  return DEFAULT_INPUT_MAPPINGS[key];
}

// ═══════════════════════════════════════════════════════════════════════════
// MOCK SERVICES FOR TESTING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a mock service container for testing.
 */
export function createMockServiceContainer(): ServiceContainer {
  const container = new ServiceContainer();

  // Register mock services
  container.register('TextSanitizer', {
    sanitize: async (text: string, _options?: unknown) => ({
      clean_text: text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
      stats: { originalLength: text.length, cleanLength: text.length - 10, charsRemoved: 10, piiFound: 0 },
    }),
  });

  container.register('TextChunker', {
    chunk: async (text: string, chunkSize = 1000, _overlap = 200, _strategy = 'semantic') => {
      const chunks = [{ text, index: 0, startChar: 0, endChar: text.length, metadata: {} }];
      return { chunks, chunk_count: chunks.length };
    },
  });

  container.register('TEIService', {
    embed: async (_text: string, model = 'tei-default') => ({
      embedding: new Array(1024).fill(0).map(() => Math.random()),
      model_used: model,
    }),
  });

  container.register('QdrantService', {
    search: async (_embedding: number[], collection = 'default', topK = 10, _threshold = 0.7, _filter?: unknown) => ({
      results: [],
      result_count: 0,
      search_time_ms: 50,
    }),
    upsert: async (_embedding: number[], _payload: unknown, _collection = 'default', id?: string) => ({
      point_id: id || `mock-${Date.now()}`,
      status: 'created',
    }),
  });

  container.register('MemgraphService', {
    query: async (_cypher: string, _params = {}) => ({
      records: [],
      record_count: 0,
      query_time_ms: 10,
    }),
    createNode: async (label: string, properties: unknown) => ({
      node: { label, properties, id: `node-${Date.now()}` },
      node_id: `node-${Date.now()}`,
    }),
    createEdge: async (sourceId: string, targetId: string, type: string, properties = {}) => ({
      edge: { sourceId, targetId, type, properties, id: `edge-${Date.now()}` },
      edge_id: `edge-${Date.now()}`,
    }),
  });

  container.register('LLMService', {
    generate: async (prompt: string, _systemPrompt?: string, model = 'mock', _temp = 0.3, _maxTokens = 1024) => ({
      text: `Mock response for: ${prompt.slice(0, 50)}...`,
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model_used: model,
    }),
    classify: async (_text: string, categories: string[], _multiLabel = false) => ({
      category: categories[0] || 'unknown',
      confidence: 0.85,
      all_scores: Object.fromEntries(categories.map((c, i) => [c, 1 - i * 0.1])),
    }),
  });

  container.register('EntityExtractor', {
    extract: async (text: string, _types?: string[], _context?: unknown, _threshold = 0.7) => ({
      entities: [{ text: text.slice(0, 20), type: 'CONCEPT', confidence: 0.9 }],
      entity_count: 1,
      extraction_stats: { byType: { CONCEPT: 1 }, avgConfidence: 0.9, processingTimeMs: 100 },
    }),
  });

  container.register('RelationExtractor', {
    extract: async (_text: string, entities: unknown[], _types?: string[], _threshold = 0.6) => ({
      relations: [],
      relation_count: 0,
    }),
  });

  container.register('LanguageDetector', {
    detect: async (_text: string) => ({
      language: 'en',
      confidence: 0.95,
      alternatives: [{ language: 'en', confidence: 0.95 }],
    }),
  });

  container.register('TextNormalizer', {
    normalize: async (text: string, _operations?: string[]) => ({
      normalized_text: text.toLowerCase().trim(),
    }),
  });

  return container;
}

// ═══════════════════════════════════════════════════════════════════════════
// REAL SERVICE CONTAINER (Production)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a service container with real service connections.
 * Falls back to warn-mocks for services that aren't available.
 */
export function createRealServiceContainer(): ServiceContainer {
  const container = new ServiceContainer();

  // ─────────────────────────────────────────────────────────────────────────
  // REAL SERVICES (Singletons)
  // ─────────────────────────────────────────────────────────────────────────

  // QdrantService - Vector database
  const qdrant = getQdrantService() as Record<string, unknown>;
  if (qdrant) {
    container.register('QdrantService', {
      search: async (queryEmbedding: number[], collection = 'default', topK = 10, scoreThreshold = 0.7, filter?: unknown) => {
        const results = await (qdrant.searchSimilar as Function)(queryEmbedding, topK, filter, collection);
        return {
          results: results || [],
          result_count: results?.length || 0,
          search_time_ms: 0, // Not tracked by real service
        };
      },
      upsert: async (embedding: number[], payload: unknown, collection = 'default', id?: string) => {
        const points = [{ id, vector: embedding, payload }];
        await (qdrant.upsertPoints as Function)(points, collection);
        return {
          point_id: id || `qdrant-${Date.now()}`,
          status: 'created',
        };
      },
    });
  } else {
    // Warn-mock
    container.register('QdrantService', {
      search: async () => {
        console.warn('[ServiceContainer] QdrantService not available - using warn-mock');
        return { results: [], result_count: 0, search_time_ms: 0 };
      },
      upsert: async () => {
        console.warn('[ServiceContainer] QdrantService not available - using warn-mock');
        return { point_id: `mock-${Date.now()}`, status: 'mock' };
      },
    });
  }

  // MemgraphService - Graph database
  const memgraph = getMemgraphService() as Record<string, unknown>;
  if (memgraph) {
    container.register('MemgraphService', {
      query: async (cypher: string, params = {}) => {
        const result = await (memgraph.executeQuery as Function)(cypher, params);
        const records = result?.records?.map((r: { toObject: () => unknown }) => r.toObject()) || [];
        return {
          records,
          record_count: records.length,
          query_time_ms: 0,
        };
      },
      createNode: async (label: string, properties: unknown) => {
        await (memgraph.mergeNode as Function)(label, properties);
        return {
          node: { label, properties, id: (properties as Record<string, unknown>).id || `node-${Date.now()}` },
          node_id: (properties as Record<string, unknown>).id || `node-${Date.now()}`,
        };
      },
      createEdge: async (sourceId: string, targetId: string, type: string, properties = {}) => {
        await (memgraph.mergeRelationship as Function)(sourceId, targetId, type, properties);
        return {
          edge: { sourceId, targetId, type, properties, id: `edge-${Date.now()}` },
          edge_id: `edge-${Date.now()}`,
        };
      },
    });
  } else {
    // Warn-mock
    container.register('MemgraphService', {
      query: async () => {
        console.warn('[ServiceContainer] MemgraphService not available - using warn-mock');
        return { records: [], record_count: 0, query_time_ms: 0 };
      },
      createNode: async (label: string, properties: unknown) => {
        console.warn('[ServiceContainer] MemgraphService not available - using warn-mock');
        return { node: { label, properties }, node_id: `mock-${Date.now()}` };
      },
      createEdge: async () => {
        console.warn('[ServiceContainer] MemgraphService not available - using warn-mock');
        return { edge: {}, edge_id: `mock-${Date.now()}` };
      },
    });
  }

  // TEIService - Embeddings
  const tei = getTeiService() as Record<string, unknown>;
  if (tei) {
    container.register('TEIService', {
      embed: async (text: string, model = 'tei-default') => {
        const embeddings = await (tei.getEmbeddings as Function)([text]);
        return {
          embedding: embeddings?.[0] || [],
          model_used: model,
        };
      },
    });
  } else {
    // Warn-mock with random embeddings
    container.register('TEIService', {
      embed: async (_text: string, model = 'mock') => {
        console.warn('[ServiceContainer] TEIService not available - using warn-mock');
        return {
          embedding: new Array(1024).fill(0).map(() => Math.random()),
          model_used: model,
        };
      },
    });
  }

  // LLMService - Language model
  const llm = getLlmService() as Record<string, unknown>;
  if (llm) {
    container.register('LLMService', {
      generate: async (prompt: string, systemPrompt?: string, model = 'llama3', temperature = 0.3, maxTokens = 1024) => {
        const messages = [
          ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
          { role: 'user', content: prompt },
        ];
        const response = await (llm.chat as Function)(messages);
        return {
          text: response?.content || response || '',
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          model_used: model,
        };
      },
      classify: async (text: string, categories: string[], multiLabel = false) => {
        const prompt = `Classify the following text into one of these categories: ${categories.join(', ')}\n\nText: ${text}\n\nCategory:`;
        const messages = [{ role: 'user', content: prompt }];
        const response = await (llm.chat as Function)(messages);
        const category = response?.content?.trim() || categories[0] || 'unknown';
        return {
          category,
          confidence: 0.8,
          all_scores: Object.fromEntries(categories.map((c, i) => [c, c === category ? 0.8 : 0.1])),
        };
      },
    });
  } else {
    // Warn-mock
    container.register('LLMService', {
      generate: async (prompt: string) => {
        console.warn('[ServiceContainer] LLMService not available - using warn-mock');
        return { text: `Mock response for: ${prompt.slice(0, 50)}...`, usage: {}, model_used: 'mock' };
      },
      classify: async (_text: string, categories: string[]) => {
        console.warn('[ServiceContainer] LLMService not available - using warn-mock');
        return { category: categories[0] || 'unknown', confidence: 0.5, all_scores: {} };
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FACTORY SERVICES (Created per-request or with options)
  // ─────────────────────────────────────────────────────────────────────────

  // EntityExtractor - uses LLM internally
  container.register('EntityExtractor', {
    extract: async (text: string, entityTypes?: string[], context?: unknown, confidenceThreshold = 0.7) => {
      try {
        const { createEntityExtractor } = require('../../extraction/entity-extractor');
        const extractor = createEntityExtractor({ minConfidence: confidenceThreshold });
        const result = await extractor.extract(text, context || {});
        return {
          entities: result.entities || [],
          entity_count: result.entities?.length || 0,
          extraction_stats: result.stats || {},
        };
      } catch (e) {
        console.warn('[ServiceContainer] EntityExtractor error:', (e as Error).message);
        return { entities: [], entity_count: 0, extraction_stats: {} };
      }
    },
  });

  // TextChunker - simple implementation
  container.register('TextChunker', {
    chunk: async (text: string, chunkSize = 1000, overlap = 200, _strategy = 'semantic') => {
      // Simple chunking by size with overlap
      const chunks: Array<{ text: string; index: number; startChar: number; endChar: number; metadata: Record<string, unknown> }> = [];
      let start = 0;
      let index = 0;

      while (start < text.length) {
        const end = Math.min(start + chunkSize, text.length);
        chunks.push({
          text: text.slice(start, end),
          index,
          startChar: start,
          endChar: end,
          metadata: {},
        });
        start = end - overlap;
        if (start >= text.length - overlap) break;
        index++;
      }

      return { chunks, chunk_count: chunks.length };
    },
  });

  // ─────────────────────────────────────────────────────────────────────────
  // WARN-MOCK SERVICES (Not yet implemented with real backends)
  // ─────────────────────────────────────────────────────────────────────────

  container.register('TextSanitizer', {
    sanitize: async (text: string, _options?: unknown) => {
      console.warn('[ServiceContainer] TextSanitizer using simple implementation');
      return {
        clean_text: text.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(),
        stats: { originalLength: text.length, cleanLength: text.length, charsRemoved: 0, piiFound: 0 },
      };
    },
  });

  container.register('LanguageDetector', {
    detect: async (_text: string) => {
      console.warn('[ServiceContainer] LanguageDetector using default (en)');
      return { language: 'en', confidence: 0.9, alternatives: [] };
    },
  });

  container.register('TextNormalizer', {
    normalize: async (text: string, _operations?: string[]) => {
      console.warn('[ServiceContainer] TextNormalizer using simple implementation');
      return { normalized_text: text.toLowerCase().trim() };
    },
  });

  container.register('RelationExtractor', {
    extract: async (_text: string, _entities: unknown[], _types?: string[], _threshold = 0.6) => {
      console.warn('[ServiceContainer] RelationExtractor not implemented');
      return { relations: [], relation_count: 0 };
    },
  });

  return container;
}
