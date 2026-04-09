/**
 * @fileoverview Centralized Pipeline Configuration
 * @module services/extraction/config/pipeline-config
 * @version 1.0.0
 *
 * Self-tuning configuration for the text processing pipeline.
 * All tunable parameters are centralized here for the AI agent to optimize.
 */

'use strict';

/**
 * Default pipeline configuration with all tunable parameters
 * @constant {Object}
 */
const DEFAULT_CONFIG = {
  version: '1.0.0',

  // ═══════════════════════════════════════════════════════════════════════════
  // SANITIZATION STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  sanitization: {
    enabled: true,
    piiDetection: {
      enabled: true,
      patterns: ['email', 'phone', 'ssn', 'creditcard'],
      redactWith: '[REDACTED]'
    },
    htmlProcessing: {
      stripTags: true,
      preserveStructure: true,
      decodeEntities: true
    },
    maxLength: 100000,
    trimWhitespace: true,
    normalizeLineEndings: true
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LANGUAGE DETECTION STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  languageDetection: {
    enabled: true,
    minConfidence: 0.5,
    fallbackLanguage: 'en',
    codeDetection: {
      enabled: true,
      minCodeRatio: 0.3,
      indicators: ['function', 'class', 'const', 'let', 'var', 'import', 'export', 'return']
    },
    supportedLanguages: ['en', 'fr', 'es', 'ar', 'zh', 'ru']
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CHUNKING STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  chunking: {
    enabled: true,
    strategy: 'semantic', // 'fixed', 'semantic', 'sentence', 'paragraph'
    maxTokens: 512,
    overlapTokens: 50,
    minChunkSize: 100,
    respectBoundaries: true, // don't split mid-sentence
    sentenceSplitPattern: /[.!?]+\s+/,
    paragraphSplitPattern: /\n\s*\n/
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENTITY EXTRACTION STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  entityExtraction: {
    enabled: true,

    // Regex-based extraction
    regex: {
      enabled: true,
      minConfidence: 0.7,
      patterns: {
        // UN Systems and Technologies
        systems: {
          enabled: true,
          confidence: 0.95
        },
        // Documents (A/RES/*, ST/*, etc.)
        documents: {
          enabled: true,
          confidence: 0.97
        },
        // Organizations (UN, UNDP, UNICEF, etc.)
        organizations: {
          enabled: true,
          confidence: 0.93
        },
        // Work Items (#12345, WI-12345)
        workItems: {
          enabled: true,
          confidence: 0.99
        },
        // Technical references (paths, APIs, versions)
        technical: {
          enabled: true,
          confidence: 0.85
        },
        // Modern technologies (Memgraph, Qdrant, Redis, etc.)
        technologies: {
          enabled: true,
          confidence: 0.90
        },
        // CamelCase identifiers
        camelCase: {
          enabled: true,
          minLength: 6,
          confidence: 0.70,
          excludeList: ['JavaScript', 'TypeScript', 'Microsoft', 'GitHub']
        }
      }
    },

    // LLM-based extraction
    llm: {
      enabled: true,
      provider: 'ollama', // 'ollama', 'gemini', 'none'
      model: 'llama3',
      fallbackChain: ['ollama', 'gemini'], // provider fallback order
      temperature: 0.1,
      maxTokens: 2000,
      timeout: 30000,
      retries: 2,
      minContentLength: 50, // min chars to trigger LLM
      confidenceCap: 0.95 // max confidence for LLM entities
    },

    // Merging strategy
    merge: {
      strategy: 'confidence', // 'confidence', 'source-priority', 'union'
      sourcePriority: ['regex', 'llm'], // for source-priority strategy
      boostMultiSource: 0.05, // confidence boost for multi-source entities
      maxBoost: 0.99
    },

    // Filtering
    minConfidence: 0.6,
    maxEntities: 100,
    deduplication: {
      enabled: true,
      normalizeCase: true,
      removeSpecialChars: true
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATIONSHIP EXTRACTION STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  relationshipExtraction: {
    enabled: true,
    minEntities: 2, // min entities required to extract relationships

    // Pattern-based extraction
    patterns: {
      enabled: true,
      minConfidence: 0.5,
      types: {
        USES: { enabled: true, confidence: 0.85 },
        DEPENDS_ON: { enabled: true, confidence: 0.85 },
        INTEGRATES_WITH: { enabled: true, confidence: 0.75 },
        CONNECTS_TO: { enabled: true, confidence: 0.85 },
        IS_A: { enabled: true, confidence: 0.70 },
        PROVIDES: { enabled: true, confidence: 0.80 },
        HANDLES: { enabled: true, confidence: 0.80 },
        STORES_IN: { enabled: true, confidence: 0.80 },
        STORED_IN: { enabled: true, confidence: 0.80 },
        WRITES_TO: { enabled: true, confidence: 0.75 },
        READS_FROM: { enabled: true, confidence: 0.75 },
        CONTAINS: { enabled: true, confidence: 0.70 },
        PART_OF: { enabled: true, confidence: 0.75 },
        GENERATES: { enabled: true, confidence: 0.80 },
        CALLS: { enabled: true, confidence: 0.80 }
      }
    },

    // Co-occurrence analysis
    coOccurrence: {
      enabled: true,
      windowType: 'sentence', // 'sentence', 'paragraph', 'fixed'
      fixedWindowSize: 200, // chars, for 'fixed' type
      baseConfidence: 0.55,
      maxConfidence: 0.70,
      distanceBonus: 0.15
    },

    // Preposition patterns ("X for Y", "X as Y")
    preposition: {
      enabled: true,
      minConfidence: 0.65
    },

    // LLM relationship extraction
    llm: {
      enabled: true,
      onlyWhenNoPatterns: true, // only use LLM if no pattern matches
      minEntities: 3
    },

    maxRelationships: 50,
    deduplication: true
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // QUERY EXPANSION STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  queryExpansion: {
    enabled: true,
    maxTerms: 10,
    includesSynonyms: true,
    includesHyponyms: false,
    includesHypernyms: false,
    domainSpecific: {
      enabled: true,
      domains: ['UN', 'software', 'business']
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // EMBEDDING STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  embedding: {
    enabled: true,
    model: 'nomic-embed-text',
    dimension: 1024,
    batchSize: 32,
    normalize: true,
    timeout: 30000,
    retries: 2
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CLASSIFICATION STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  classification: {
    enabled: true,
    minConfidence: 0.5,

    // Layer classification
    layers: {
      enabled: true,
      mapping: {
        // Entity types -> Architecture layers
        SYSTEM: 'Infrastructure',
        DATABASE: 'Infrastructure',
        API: 'Integration',
        MODULE: 'Business',
        PROCESS: 'Business',
        BUSINESS_RULE: 'Business',
        CONCEPT: 'Business',
        DOCUMENT: 'Application',
        ORGANIZATION: 'Business',
        PERSON: 'Application',
        TECHNOLOGY: 'Infrastructure',
        WORK_ITEM_REF: 'Application',
        FILE_PATH: 'Infrastructure',
        UNKNOWN: 'Unknown'
      },
      defaultLayer: 'Unknown'
    },

    // Domain classification
    domains: {
      enabled: true,
      categories: ['technical', 'business', 'organizational', 'procedural']
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GRAPH BUILD STAGE
  // ═══════════════════════════════════════════════════════════════════════════
  graphBuild: {
    enabled: true,

    // Node settings
    nodes: {
      minConfidence: 0.6,
      includeMetadata: true,
      idGeneration: 'uuid' // 'uuid', 'hash', 'normalized'
    },

    // Edge settings
    edges: {
      minConfidence: 0.5,
      includeEvidence: true,
      bidirectional: ['RELATED_TO'] // relationship types that are bidirectional
    },

    // Graph output format
    outputFormat: 'cytoscape' // 'cytoscape', 'd3', 'neo4j'
  }
};

/**
 * Parameter metadata for tuning agent
 * Describes constraints and tuning recommendations for each parameter
 */
const PARAMETER_METADATA = {
  'entityExtraction.regex.minConfidence': {
    type: 'float',
    min: 0.3,
    max: 1.0,
    step: 0.05,
    description: 'Minimum confidence threshold for regex-extracted entities',
    tuningHint: 'Lower values increase recall, higher values increase precision'
  },
  'entityExtraction.llm.temperature': {
    type: 'float',
    min: 0.0,
    max: 1.0,
    step: 0.1,
    description: 'LLM temperature for entity extraction',
    tuningHint: 'Lower values for more deterministic, higher for creative extraction'
  },
  'entityExtraction.minConfidence': {
    type: 'float',
    min: 0.3,
    max: 0.9,
    step: 0.05,
    description: 'Global minimum confidence for final entities',
    tuningHint: 'Primary knob for precision/recall tradeoff'
  },
  'relationshipExtraction.coOccurrence.baseConfidence': {
    type: 'float',
    min: 0.3,
    max: 0.8,
    step: 0.05,
    description: 'Base confidence for co-occurrence relationships',
    tuningHint: 'Affects how many implicit relationships are detected'
  },
  'chunking.maxTokens': {
    type: 'int',
    min: 128,
    max: 2048,
    step: 64,
    description: 'Maximum tokens per chunk',
    tuningHint: 'Larger chunks preserve more context but may dilute entities'
  },
  'chunking.overlapTokens': {
    type: 'int',
    min: 0,
    max: 256,
    step: 16,
    description: 'Overlap between adjacent chunks',
    tuningHint: 'Higher values prevent entity loss at boundaries'
  }
};

/**
 * Get current configuration with optional overrides
 * @param {Object} overrides - Configuration overrides
 * @returns {Object} Merged configuration
 */
function getConfig(overrides = {}) {
  return deepMerge(DEFAULT_CONFIG, overrides);
}

/**
 * Get parameter value from config using dot notation
 * @param {Object} config - Configuration object
 * @param {string} path - Dot-notated path (e.g., 'entityExtraction.llm.temperature')
 * @returns {*} Parameter value
 */
function getParameter(config, path) {
  return path.split('.').reduce((obj, key) => obj?.[key], config);
}

/**
 * Set parameter value in config using dot notation
 * @param {Object} config - Configuration object
 * @param {string} path - Dot-notated path
 * @param {*} value - Value to set
 * @returns {Object} Updated configuration
 */
function setParameter(config, path, value) {
  const newConfig = JSON.parse(JSON.stringify(config));
  const keys = path.split('.');
  const lastKey = keys.pop();
  const parent = keys.reduce((obj, key) => {
    if (!obj[key]) obj[key] = {};
    return obj[key];
  }, newConfig);
  parent[lastKey] = value;
  return newConfig;
}

/**
 * Validate parameter value against metadata
 * @param {string} path - Parameter path
 * @param {*} value - Value to validate
 * @returns {{valid: boolean, error?: string}}
 */
function validateParameter(path, value) {
  const meta = PARAMETER_METADATA[path];
  if (!meta) {
    return { valid: true }; // no constraints
  }

  if (meta.type === 'float' || meta.type === 'int') {
    if (typeof value !== 'number') {
      return { valid: false, error: `Expected number, got ${typeof value}` };
    }
    if (value < meta.min || value > meta.max) {
      return { valid: false, error: `Value ${value} out of range [${meta.min}, ${meta.max}]` };
    }
  }

  return { valid: true };
}

/**
 * Get all tunable parameters with their metadata
 * @returns {Object} Tunable parameters
 */
function getTunableParameters() {
  return Object.entries(PARAMETER_METADATA).map(([path, meta]) => ({
    path,
    ...meta,
    currentValue: getParameter(DEFAULT_CONFIG, path)
  }));
}

/**
 * Deep merge two objects
 * @param {Object} target - Target object
 * @param {Object} source - Source object
 * @returns {Object} Merged object
 */
function deepMerge(target, source) {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Export configuration as JSON for persistence
 * @param {Object} config - Configuration to export
 * @returns {string} JSON string
 */
function exportConfig(config) {
  return JSON.stringify(config, null, 2);
}

/**
 * Import configuration from JSON
 * @param {string} json - JSON string
 * @returns {Object} Configuration object
 */
function importConfig(json) {
  try {
    const parsed = JSON.parse(json);
    return deepMerge(DEFAULT_CONFIG, parsed);
  } catch (error) {
    throw new Error(`Invalid configuration JSON: ${error.message}`);
  }
}

module.exports = {
  DEFAULT_CONFIG,
  PARAMETER_METADATA,
  getConfig,
  getParameter,
  setParameter,
  validateParameter,
  getTunableParameters,
  deepMerge,
  exportConfig,
  importConfig
};
