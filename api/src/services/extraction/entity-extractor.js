/**
 * @fileoverview Combined entity extraction service (Regex + LLM)
 * @module services/extraction/entity-extractor
 * @version 1.0.0
 *
 * Hybrid entity extraction combining:
 * - Fast regex-based pattern matching for known UN entities
 * - LLM-powered extraction for semantic entities
 * - Confidence-based merging and deduplication
 */

'use strict';

const {
  UN_SYSTEMS,
  UN_ORGANIZATIONS,
  UN_DOCUMENT_PATTERNS,
  WORK_ITEM_PATTERNS,
  PERSON_PATTERNS,
  TECHNICAL_PATTERNS,
  extractAllEntities,
  getLayerForType
} = require('../../config/un-entities.config');

const {
  buildEntityExtractionPrompt,
  buildCodeEntityPrompt,
  buildRelationshipPrompt,
  buildWorkItemPrompt,
  parseJSONResponse,
} = require('./prompts/entity-extraction');

// LLM Provider Manager with automatic fallback
const {
  extractEntitiesWithLLM,
  isLLMAvailable,
  getActiveProviderName,
  getStatus: getLLMStatus
} = require('./llm-provider');

// Relationship extractor for co-occurrence and pattern-based extraction
const {
  extractRelationships: extractRelationshipsFromText,
  mergeRelationships,
  getRelationshipStats
} = require('./relationship-extractor');

// Pipeline Configuration for tunable parameters
const {
  DEFAULT_CONFIG,
  getParameter
} = require('./config/pipeline-config');

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get configuration value with fallback to default
 * @param {string} path - Configuration path (dot notation)
 * @param {*} defaultValue - Fallback value
 * @returns {*} Configuration value
 */
function getConfigValue(path, defaultValue) {
  const value = getParameter(DEFAULT_CONFIG, path);
  return value !== undefined ? value : defaultValue;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Entity types enumeration
 */
const ENTITY_TYPES = {
  // People & Organizations
  PERSON: 'PERSON',
  TEAM: 'TEAM',
  ORGANIZATION: 'ORGANIZATION',

  // Technical
  SYSTEM: 'SYSTEM',
  MODULE: 'MODULE',
  API: 'API',
  DATABASE: 'DATABASE',
  TABLE: 'TABLE',

  // Business
  PROCESS: 'PROCESS',
  BUSINESS_RULE: 'BUSINESS_RULE',
  CONCEPT: 'CONCEPT',

  // Artifacts
  TECHNOLOGY: 'TECHNOLOGY',
  DOCUMENT: 'DOCUMENT',
  PROJECT: 'PROJECT',

  // References
  WORK_ITEM_REF: 'WORK_ITEM_REF',
  FILE_PATH: 'FILE_PATH',
  VERSION: 'VERSION',
  EMAIL: 'EMAIL',
  DATE: 'DATE',

  // Generic
  UNKNOWN: 'UNKNOWN'
};

/**
 * Default extraction options - now loaded from centralized config
 * @constant {Object}
 */
const DEFAULT_OPTIONS = {
  useLLM: getConfigValue('entityExtraction.llm.enabled', true),
  useRegex: getConfigValue('entityExtraction.regex.enabled', true),
  minConfidence: getConfigValue('entityExtraction.minConfidence', 0.6),
  maxEntities: getConfigValue('entityExtraction.maxEntities', 100),
  extractRelationships: getConfigValue('relationshipExtraction.enabled', true),
  llmProvider: getConfigValue('entityExtraction.llm.provider', 'ollama'),
  llmModel: getConfigValue('entityExtraction.llm.model', 'llama3'),
  // Dynamic model/provider (can be set per-request)
  model: null,     // e.g. 'llama4', 'gemini-3-pro', 'claude-opus-4-5-20251124'
  provider: null,  // e.g. 'ollama', 'gemini', 'anthropic'
  timeout: getConfigValue('entityExtraction.llm.timeout', 30000),
  retries: getConfigValue('entityExtraction.llm.retries', 2),
  // Additional config-driven parameters
  regexMinConfidence: getConfigValue('entityExtraction.regex.minConfidence', 0.7),
  llmTemperature: getConfigValue('entityExtraction.llm.temperature', 0.1),
  llmMaxTokens: getConfigValue('entityExtraction.llm.maxTokens', 2000),
  llmConfidenceCap: getConfigValue('entityExtraction.llm.confidenceCap', 0.95),
  mergeStrategy: getConfigValue('entityExtraction.merge.strategy', 'confidence'),
  boostMultiSource: getConfigValue('entityExtraction.merge.boostMultiSource', 0.05),
};

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITY EXTRACTOR CLASS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Hybrid entity extraction service
 * @class
 */
class EntityExtractor {
  /**
   * Create EntityExtractor instance
   * @param {Object} [options={}] - Configuration options
   * @param {Object} [llmService=null] - LLM service instance
   */
  constructor(options = {}, llmService = null) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.llm = llmService;
    this.normalizationCache = new Map();
  }

  /**
   * Set LLM service (for dependency injection)
   * @param {Object} llmService - LLM service instance
   */
  setLLMService(llmService) {
    this.llm = llmService;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN EXTRACTION METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract entities from content (main method)
   * @param {string} content - Text content to analyze
   * @param {Object} [context={}] - Additional context
   * @returns {Promise<{entities: Array, relationships: Array, stats: Object}>}
   */
  async extract(content, context = {}) {
    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      return { entities: [], relationships: [], stats: { regex: 0, llm: 0, merged: 0, provider: 'none' } };
    }

    const {
      sourceType = 'text',
      filePath = '',
      language = 'en',
      isCode = false,
    } = context;

    let entities = [];
    let relationships = [];
    const stats = { regex: 0, llm: 0, merged: 0, provider: 'none' };

    // Step 1: Regex-based extraction (fast, deterministic)
    if (this.options.useRegex) {
      const regexEntities = this.extractWithRegex(content);
      entities.push(...regexEntities);
      stats.regex = regexEntities.length;
    }

    // Step 2: LLM-based extraction using new provider manager (Ollama -> Gemini -> none)
    if (this.options.useLLM && content.length >= 50) {
      try {
        // Use new LLM provider manager with automatic fallback
        const llmResult = await extractEntitiesWithLLM(content, {
          sourceType,
          filePath,
          language,
          isCode,
          // Pass model/provider from options
          model: this.options.model,
          provider: this.options.provider
        });

        if (llmResult.entities && llmResult.entities.length > 0) {
          entities.push(...llmResult.entities);
          stats.llm = llmResult.entities.length;
          stats.provider = llmResult.provider;
        }

        if (llmResult.relationships && llmResult.relationships.length > 0) {
          relationships.push(...llmResult.relationships);
        }
      } catch (error) {
        console.error('[EntityExtractor] LLM extraction failed:', error.message);
        stats.provider = 'error';
      }
    }

    // Step 3: Merge and deduplicate
    entities = this.mergeEntities(entities);
    stats.merged = entities.length;

    // Step 4: Filter by confidence
    entities = entities
      .filter(e => e.confidence >= this.options.minConfidence)
      .slice(0, this.options.maxEntities);

    // Step 5: Extract relationships using pattern matching and co-occurrence
    if (this.options.extractRelationships && entities.length >= 2) {
      // First: Pattern-based and co-occurrence extraction (always available)
      const regexRelationships = extractRelationshipsFromText(content, entities, {
        includeCoOccurrence: true,
        minConfidence: this.options.minConfidence
      });
      stats.regexRelationships = regexRelationships.length;

      // Second: Try LLM for additional relationships
      if (this.options.useLLM && relationships.length === 0) {
        try {
          const relResult = await extractEntitiesWithLLM(
            this._buildRelationshipContext(content, entities),
            { extractRelationshipsOnly: true }
          );
          if (relResult.relationships) {
            relationships = relResult.relationships;
            stats.llmRelationships = relationships.length;
          }
        } catch (error) {
          console.error('[EntityExtractor] LLM relationship extraction failed:', error.message);
        }
      }

      // Merge regex and LLM relationships
      relationships = mergeRelationships(regexRelationships, relationships);
      stats.totalRelationships = relationships.length;
    }

    // Step 6: Add graph labels
    entities = entities.map(e => ({
      ...e,
      graphLabel: this.getGraphLabelForType(e.type),
    }));

    return { entities, relationships, stats };
  }

  /**
   * Build context string for relationship extraction
   * @private
   */
  _buildRelationshipContext(content, entities) {
    const entityList = entities.map(e => `${e.name} (${e.type})`).join(', ');
    return `Text: ${content.slice(0, 2000)}\n\nEntities found: ${entityList}\n\nFind relationships between these entities.`;
  }

  /**
   * Extract entities from Work Item
   * @param {Object} workItem - Work Item object
   * @returns {Promise<{entities: Array, relationships: Array, businessRules: Array}>}
   */
  async extractFromWorkItem(workItem) {
    if (!workItem) {
      return { entities: [], relationships: [], businessRules: [] };
    }

    // Combine text fields
    const combinedText = [
      workItem.title || '',
      workItem.description || '',
      workItem.acceptanceCriteria || '',
      workItem.reproSteps || '',
    ].filter(Boolean).join('\n\n');

    // Basic extraction
    const { entities, relationships } = await this.extract(combinedText, {
      sourceType: 'workitem',
      isCode: false,
    });

    // Add Work Item reference as entity
    if (workItem.id) {
      entities.unshift({
        name: `#${workItem.id}`,
        type: ENTITY_TYPES.WORK_ITEM_REF,
        normalizedForm: `WI-${workItem.id}`,
        confidence: 1.0,
        context: workItem.title || '',
        source: 'metadata',
      });
    }

    // LLM-based business rule extraction
    let businessRules = [];
    if (this.options.useLLM && this.llm) {
      try {
        const messages = buildWorkItemPrompt(workItem);
        const response = await this.callLLM(messages);
        const parsed = parseJSONResponse(response);

        if (parsed?.businessRules) {
          businessRules = parsed.businessRules;
        }
      } catch (error) {
        console.error('Business rule extraction failed:', error.message);
      }
    }

    return { entities, relationships, businessRules };
  }

  /**
   * Extract entities from source code
   * @param {string} code - Source code content
   * @param {string} language - Programming language
   * @param {string} filePath - File path
   * @returns {Promise<{entities: Array, relationships: Array}>}
   */
  async extractFromCode(code, language, filePath) {
    if (!code || code.trim().length < 20) {
      return { entities: [], relationships: [] };
    }

    // Regex extraction for code patterns
    const regexEntities = this.extractCodePatternsWithRegex(code, language, filePath);

    // LLM extraction for semantic analysis
    let llmEntities = [];
    let relationships = [];

    if (this.options.useLLM && this.llm) {
      try {
        const result = await this.extractCodeEntitiesWithLLM(code, language, filePath);
        llmEntities = result.entities || [];
        relationships = result.relationships || [];
      } catch (error) {
        console.error('Code LLM extraction failed:', error.message);
      }
    }

    // Merge results
    const entities = this.mergeEntities([...regexEntities, ...llmEntities]);

    return {
      entities: entities.filter(e => e.confidence >= this.options.minConfidence),
      relationships,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // REGEX-BASED EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract entities using regex patterns
   * @param {string} content - Text to analyze
   * @returns {Array} Extracted entities
   */
  extractWithRegex(content) {
    if (!content) return [];

    const entities = [];

    // Use UN pattern matcher from config
    const unMatches = extractAllEntities(content);

    // Process systems
    for (const match of unMatches.systems) {
      entities.push({
        name: match.match,
        type: ENTITY_TYPES.SYSTEM,
        normalizedForm: match.name.toLowerCase(),
        confidence: 0.95,
        context: this.getContext(content, match.index),
        source: 'regex',
        startIndex: match.index,
        category: match.category
      });
    }

    // Process documents
    for (const match of unMatches.documents) {
      entities.push({
        name: match.match,
        type: ENTITY_TYPES.DOCUMENT,
        normalizedForm: match.match.toUpperCase(),
        confidence: 0.97,
        context: this.getContext(content, match.index),
        source: 'regex',
        startIndex: match.index,
        category: match.category
      });
    }

    // Process organizations
    for (const match of unMatches.organizations) {
      entities.push({
        name: match.match,
        type: ENTITY_TYPES.ORGANIZATION,
        normalizedForm: match.name.toLowerCase(),
        confidence: 0.93,
        context: this.getContext(content, match.index),
        source: 'regex',
        startIndex: match.index,
        fullName: match.fullName
      });
    }

    // Process work items
    for (const match of unMatches.workItems) {
      entities.push({
        name: match.match,
        type: ENTITY_TYPES.WORK_ITEM_REF,
        normalizedForm: `WI-${match.id}`,
        confidence: 0.99,
        context: this.getContext(content, match.index),
        source: 'regex',
        startIndex: match.index,
        workItemId: match.id
      });
    }

    // Process persons (emails)
    for (const match of unMatches.persons) {
      entities.push({
        name: match.match,
        type: match.category === 'Email' ? ENTITY_TYPES.EMAIL : ENTITY_TYPES.PERSON,
        normalizedForm: match.match.toLowerCase(),
        confidence: 0.97,
        context: this.getContext(content, match.index),
        source: 'regex',
        startIndex: match.index
      });
    }

    // Process technical references
    for (const match of unMatches.technical) {
      let type = ENTITY_TYPES.UNKNOWN;
      switch (match.category) {
        case 'Path':
          type = ENTITY_TYPES.FILE_PATH;
          break;
        case 'Database':
          type = ENTITY_TYPES.DATABASE;
          break;
        case 'API':
          type = ENTITY_TYPES.API;
          break;
        case 'Version':
          type = ENTITY_TYPES.VERSION;
          break;
      }

      if (type !== ENTITY_TYPES.UNKNOWN) {
        entities.push({
          name: match.match,
          type,
          normalizedForm: match.match.toLowerCase(),
          confidence: 0.85,
          context: this.getContext(content, match.index),
          source: 'regex',
          startIndex: match.index
        });
      }
    }

    // Process extended technology patterns (Memgraph, Qdrant, Redis, etc.)
    for (const match of unMatches.technologies || []) {
      let type = ENTITY_TYPES.TECHNOLOGY;

      // Map category to entity type
      switch (match.category) {
        case 'Database':
          type = ENTITY_TYPES.DATABASE;
          break;
        case 'Queue':
          type = ENTITY_TYPES.TECHNOLOGY;
          break;
        case 'AI':
          type = ENTITY_TYPES.TECHNOLOGY;
          break;
        case 'Framework':
          type = ENTITY_TYPES.TECHNOLOGY;
          break;
        case 'Protocol':
          type = ENTITY_TYPES.API;
          break;
        case 'System':
          type = ENTITY_TYPES.SYSTEM;
          break;
        case 'Concept':
          type = ENTITY_TYPES.CONCEPT;
          break;
      }

      entities.push({
        name: match.name,
        type,
        normalizedForm: match.name.toLowerCase().replace(/\s+/g, '_'),
        confidence: match.confidence || 0.90,
        context: this.getContext(content, match.index),
        source: 'regex',
        startIndex: match.index,
        category: match.category,
        subType: match.subType
      });
    }

    // Additional: CamelCase identifiers (potential class/function names)
    const camelRegex = /\b([A-Z][a-z]+(?:[A-Z][a-z]+){1,5})\b/g;
    let match;
    while ((match = camelRegex.exec(content)) !== null) {
      if (match[1].length < 6) continue;
      if (['JavaScript', 'TypeScript', 'Microsoft'].includes(match[1])) continue;

      entities.push({
        name: match[1],
        type: ENTITY_TYPES.MODULE,
        normalizedForm: this.camelToSnake(match[1]),
        confidence: 0.70,
        context: this.getContext(content, match.index),
        source: 'regex',
        startIndex: match.index,
      });
    }

    return entities;
  }

  /**
   * Extract code-specific patterns with regex
   * @param {string} code - Source code
   * @param {string} language - Programming language
   * @param {string} filePath - File path
   * @returns {Array}
   */
  extractCodePatternsWithRegex(code, language, filePath) {
    const entities = [];

    // Import/require statements
    // Updated patterns to handle ES6 imports: import { X } from 'module'
    const importPatterns = {
      javascript: /(?:import\s+(?:\{[^}]*\}\s+from\s+|[\w*]+\s+from\s+|)['"]([^'"]+)['"]|require\s*\(['"]([^'"]+)['"]\))/g,
      typescript: /(?:import\s+(?:\{[^}]*\}\s+from\s+|[\w*]+\s+from\s+|type\s+\{[^}]*\}\s+from\s+|)['"]([^'"]+)['"]|require\s*\(['"]([^'"]+)['"]\))/g,
      csharp: /using\s+([\w.]+);/g,
      python: /(?:import|from)\s+([\w.]+)/g,
    };

    const importRegex = importPatterns[language];
    if (importRegex) {
      let match;
      while ((match = importRegex.exec(code)) !== null) {
        // Get the module name from first non-null captured group
        const moduleName = match[1] || match[2];
        if (moduleName) {
          entities.push({
            name: moduleName,
            type: ENTITY_TYPES.MODULE,
            normalizedForm: moduleName.replace(/['"]/g, ''),
            confidence: 0.95,
            context: match[0],
            source: 'regex',
            codeContext: { type: 'import', language },
          });
        }
      }
    }

    // Class definitions
    const classPatterns = {
      javascript: /class\s+(\w+)(?:\s+extends\s+(\w+))?/g,
      typescript: /class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w,\s]+))?/g,
      csharp: /class\s+(\w+)(?:\s*:\s*([\w,\s]+))?/g,
      python: /class\s+(\w+)(?:\(([\w,\s]+)\))?:/g,
    };

    const classRegex = classPatterns[language];
    if (classRegex) {
      let match;
      while ((match = classRegex.exec(code)) !== null) {
        entities.push({
          name: match[1],
          type: ENTITY_TYPES.MODULE,
          normalizedForm: match[1],
          confidence: 0.98,
          context: match[0],
          source: 'regex',
          codeContext: {
            type: 'class',
            language,
            extends: match[2] || null,
            implements: match[3] || null,
          },
        });
      }
    }

    // Function definitions
    const funcPatterns = {
      javascript: /(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g,
      typescript: /(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*(?::\s*\w+\s*)?=>/g,
    };

    const funcRegex = funcPatterns[language];
    if (funcRegex) {
      let match;
      while ((match = funcRegex.exec(code)) !== null) {
        const funcName = match[1] || match[2];
        if (funcName && funcName.length > 2) {
          entities.push({
            name: funcName,
            type: ENTITY_TYPES.MODULE,
            normalizedForm: funcName,
            confidence: 0.95,
            context: match[0].substring(0, 100),
            source: 'regex',
            codeContext: { type: 'function', language },
          });
        }
      }
    }

    return entities;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LLM-BASED EXTRACTION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Extract entities using LLM
   * @param {string} content - Text to analyze
   * @param {Object} context - Additional context
   * @returns {Promise<{entities: Array, relationships: Array}>}
   */
  async extractWithLLM(content, context) {
    if (!this.llm) {
      throw new Error('LLM service not configured');
    }

    const messages = buildEntityExtractionPrompt(content, context);
    const response = await this.callLLM(messages);
    const parsed = parseJSONResponse(response, 'entities');

    if (!parsed) {
      return { entities: [], relationships: [] };
    }

    const entities = (parsed.entities || []).map(e => ({
      name: e.name || '',
      type: this.normalizeEntityType(e.type),
      normalizedForm: e.normalizedForm || this.normalizeEntityName(e.name),
      confidence: Math.min(0.95, e.confidence || 0.80),
      context: e.context || '',
      source: 'llm',
    })).filter(e => e.name && e.name.length > 1);

    return {
      entities,
      relationships: parsed.relationships || [],
    };
  }

  /**
   * Extract code entities using LLM
   * @param {string} code - Source code
   * @param {string} language - Programming language
   * @param {string} filePath - File path
   * @returns {Promise<{entities: Array, relationships: Array}>}
   */
  async extractCodeEntitiesWithLLM(code, language, filePath) {
    if (!this.llm) {
      throw new Error('LLM service not configured');
    }

    const messages = buildCodeEntityPrompt(code, language, filePath);
    const response = await this.callLLM(messages);
    const parsed = parseJSONResponse(response, 'entities');

    if (!parsed) {
      return { entities: [], relationships: [] };
    }

    const entities = (parsed.entities || []).map(e => ({
      name: e.name || '',
      type: this.normalizeEntityType(e.type),
      normalizedForm: e.normalizedForm || e.name,
      confidence: Math.min(0.92, e.confidence || 0.75),
      context: e.context || '',
      source: 'llm',
      codeContext: {
        type: e.codeType || 'unknown',
        language,
        filePath,
      },
    })).filter(e => e.name && e.name.length > 1);

    return {
      entities,
      relationships: parsed.relationships || [],
    };
  }

  /**
   * Extract relationships between entities
   * @param {string} content - Original content
   * @param {Array} entities - Extracted entities
   * @returns {Promise<Array>}
   */
  async extractRelationships(content, entities) {
    if (!this.llm || entities.length < 2) {
      return [];
    }

    const messages = buildRelationshipPrompt(content, entities);
    const response = await this.callLLM(messages);
    const parsed = parseJSONResponse(response, 'relationships');

    if (!parsed?.relationships) {
      return [];
    }

    const entityNames = new Set(entities.map(e => e.normalizedForm.toLowerCase()));

    return parsed.relationships.filter(rel => {
      const sourceNorm = (rel.source || '').toLowerCase();
      const targetNorm = (rel.target || '').toLowerCase();
      return entityNames.has(sourceNorm) || entityNames.has(targetNorm);
    }).map(rel => ({
      source: rel.source,
      sourceType: rel.sourceType || ENTITY_TYPES.UNKNOWN,
      target: rel.target,
      targetType: rel.targetType || ENTITY_TYPES.UNKNOWN,
      type: rel.type || 'RELATED_TO',
      confidence: Math.min(0.90, rel.confidence || 0.70),
      evidence: rel.evidence || '',
    }));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MERGING AND DEDUPLICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Merge entities from multiple sources, removing duplicates
   * @param {Array} entities - All extracted entities
   * @returns {Array} Merged and deduplicated entities
   */
  mergeEntities(entities) {
    if (!entities || entities.length === 0) {
      return [];
    }

    const merged = new Map();

    for (const entity of entities) {
      const key = this.getEntityKey(entity);

      if (merged.has(key)) {
        const existing = merged.get(key);

        existing.confidence = Math.max(existing.confidence, entity.confidence);

        if (existing.source !== entity.source) {
          existing.confidence = Math.min(0.99, existing.confidence + 0.05);
          existing.sources = [...new Set([
            ...(existing.sources || [existing.source]),
            entity.source,
          ])];
        }

        if (entity.type !== ENTITY_TYPES.UNKNOWN && existing.type === ENTITY_TYPES.UNKNOWN) {
          existing.type = entity.type;
        }

        if (entity.context && entity.context.length > (existing.context?.length || 0)) {
          existing.context = entity.context;
        }
      } else {
        merged.set(key, {
          ...entity,
          sources: [entity.source],
        });
      }
    }

    return Array.from(merged.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get unique key for entity deduplication
   * @param {Object} entity - Entity to key
   * @returns {string} Unique key
   */
  getEntityKey(entity) {
    const normalizedName = (entity.normalizedForm || entity.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    return `${entity.type}:${normalizedName}`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Call LLM service with retry logic
   * @param {Array} messages - Chat messages
   * @returns {Promise<string>} LLM response
   */
  async callLLM(messages) {
    let lastError;

    for (let attempt = 0; attempt <= this.options.retries; attempt++) {
      try {
        const response = await Promise.race([
          this.llm.chat(messages, {
            temperature: 0.1,
            maxTokens: 2000,
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('LLM timeout')), this.options.timeout)
          ),
        ]);

        return response;
      } catch (error) {
        lastError = error;
        console.warn(`LLM attempt ${attempt + 1} failed:`, error.message);

        if (attempt < this.options.retries) {
          await this.sleep(1000 * (attempt + 1));
        }
      }
    }

    throw lastError;
  }

  /**
   * Get context around a found entity
   * @param {string} content - Full content
   * @param {number} index - Position of entity
   * @param {number} [contextLength=60] - Characters of context
   * @returns {string} Context snippet
   */
  getContext(content, index, contextLength = 60) {
    if (!content || index === undefined) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(content.length, index + contextLength);

    let context = content.slice(start, end);

    if (start > 0) context = '...' + context;
    if (end < content.length) context = context + '...';

    return context.replace(/\s+/g, ' ').trim();
  }

  /**
   * Normalize entity type to known type
   * @param {string} type - Raw type string
   * @returns {string} Normalized type
   */
  normalizeEntityType(type) {
    if (!type) return ENTITY_TYPES.UNKNOWN;

    const normalized = type.toUpperCase().replace(/[^A-Z_]/g, '');

    if (Object.values(ENTITY_TYPES).includes(normalized)) {
      return normalized;
    }

    const typeMap = {
      'CLASS': ENTITY_TYPES.MODULE,
      'FUNCTION': ENTITY_TYPES.MODULE,
      'METHOD': ENTITY_TYPES.MODULE,
      'SERVICE': ENTITY_TYPES.MODULE,
      'COMPONENT': ENTITY_TYPES.MODULE,
      'INTERFACE': ENTITY_TYPES.MODULE,
      'USER': ENTITY_TYPES.PERSON,
      'STAFF': ENTITY_TYPES.PERSON,
      'EMPLOYEE': ENTITY_TYPES.PERSON,
      'DEPARTMENT': ENTITY_TYPES.ORGANIZATION,
      'UNIT': ENTITY_TYPES.ORGANIZATION,
      'DIVISION': ENTITY_TYPES.ORGANIZATION,
      'APPLICATION': ENTITY_TYPES.SYSTEM,
      'SOFTWARE': ENTITY_TYPES.SYSTEM,
      'PLATFORM': ENTITY_TYPES.SYSTEM,
      'RULE': ENTITY_TYPES.BUSINESS_RULE,
      'POLICY': ENTITY_TYPES.BUSINESS_RULE,
      'CONSTRAINT': ENTITY_TYPES.BUSINESS_RULE,
      'WORKFLOW': ENTITY_TYPES.PROCESS,
      'PROCEDURE': ENTITY_TYPES.PROCESS,
    };

    return typeMap[normalized] || ENTITY_TYPES.UNKNOWN;
  }

  /**
   * Normalize entity name
   * @param {string} name - Raw entity name
   * @returns {string} Normalized name
   */
  normalizeEntityName(name) {
    if (!name) return '';

    if (this.normalizationCache.has(name)) {
      return this.normalizationCache.get(name);
    }

    let normalized = name
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w.-]/g, '')
      .toLowerCase();

    this.normalizationCache.set(name, normalized);

    return normalized;
  }

  /**
   * Get graph label for entity type
   * @param {string} type - Entity type
   * @returns {string} Graph label
   */
  getGraphLabelForType(type) {
    const labelMap = {
      [ENTITY_TYPES.PERSON]: 'Person',
      [ENTITY_TYPES.TEAM]: 'Team',
      [ENTITY_TYPES.ORGANIZATION]: 'Organization',
      [ENTITY_TYPES.SYSTEM]: 'System',
      [ENTITY_TYPES.MODULE]: 'Module',
      [ENTITY_TYPES.API]: 'API',
      [ENTITY_TYPES.DATABASE]: 'Database',
      [ENTITY_TYPES.TABLE]: 'Table',
      [ENTITY_TYPES.PROCESS]: 'Process',
      [ENTITY_TYPES.BUSINESS_RULE]: 'BusinessRule',
      [ENTITY_TYPES.CONCEPT]: 'Concept',
      [ENTITY_TYPES.TECHNOLOGY]: 'Technology',
      [ENTITY_TYPES.DOCUMENT]: 'Document',
      [ENTITY_TYPES.PROJECT]: 'Project',
      [ENTITY_TYPES.WORK_ITEM_REF]: 'WorkItem',
      [ENTITY_TYPES.FILE_PATH]: 'File',
    };

    return labelMap[type] || 'Entity';
  }

  /**
   * Convert CamelCase to snake_case
   * @param {string} str - CamelCase string
   * @returns {string} snake_case string
   */
  camelToSnake(str) {
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get extraction statistics
   * @param {Object} result - Extraction result
   * @returns {Object} Statistics
   */
  getStats(result) {
    const { entities = [], relationships = [] } = result;

    const byType = {};
    const bySource = {};

    for (const e of entities) {
      byType[e.type] = (byType[e.type] || 0) + 1;
      bySource[e.source] = (bySource[e.source] || 0) + 1;
    }

    return {
      totalEntities: entities.length,
      totalRelationships: relationships.length,
      byType,
      bySource,
      avgConfidence: entities.length > 0
        ? (entities.reduce((sum, e) => sum + e.confidence, 0) / entities.length).toFixed(3)
        : 0,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create EntityExtractor with LLM service
 * @param {Object} options - Options
 * @param {Object} llmFactory - LLM factory
 * @returns {EntityExtractor}
 */
function createEntityExtractor(options = {}, llmFactory = null) {
  const extractor = new EntityExtractor(options);

  if (llmFactory && options.useLLM !== false) {
    try {
      const llm = llmFactory.create(options.llmProvider || 'ollama');
      extractor.setLLMService(llm);
    } catch (error) {
      console.warn('Could not initialize LLM service:', error.message);
    }
  }

  return extractor;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  EntityExtractor,
  createEntityExtractor,
  ENTITY_TYPES,
  DEFAULT_OPTIONS,
  // LLM Provider utilities
  isLLMAvailable,
  getActiveProviderName,
  getLLMStatus,
};
