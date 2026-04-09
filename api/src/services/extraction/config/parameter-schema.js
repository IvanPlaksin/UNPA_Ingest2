/**
 * @fileoverview JSON Schema for Pipeline Configuration Validation
 * @module services/extraction/config/parameter-schema
 * @version 1.0.0
 *
 * Provides JSON Schema definitions for validating pipeline configuration.
 * Used by the tuning agent to ensure parameter changes are valid.
 */

'use strict';

/**
 * JSON Schema for the complete pipeline configuration
 * @constant {Object}
 */
const PIPELINE_CONFIG_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  type: 'object',
  properties: {
    version: { type: 'string' },

    sanitization: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        piiDetection: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            patterns: { type: 'array', items: { type: 'string' } },
            redactWith: { type: 'string' }
          }
        },
        htmlProcessing: {
          type: 'object',
          properties: {
            stripTags: { type: 'boolean' },
            preserveStructure: { type: 'boolean' },
            decodeEntities: { type: 'boolean' }
          }
        },
        maxLength: { type: 'integer', minimum: 1000, maximum: 1000000 },
        trimWhitespace: { type: 'boolean' },
        normalizeLineEndings: { type: 'boolean' }
      }
    },

    languageDetection: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        minConfidence: { type: 'number', minimum: 0.0, maximum: 1.0 },
        fallbackLanguage: { type: 'string', minLength: 2, maxLength: 5 },
        codeDetection: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            minCodeRatio: { type: 'number', minimum: 0.0, maximum: 1.0 },
            indicators: { type: 'array', items: { type: 'string' } }
          }
        },
        supportedLanguages: { type: 'array', items: { type: 'string' } }
      }
    },

    chunking: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        strategy: { type: 'string', enum: ['fixed', 'semantic', 'sentence', 'paragraph'] },
        maxTokens: { type: 'integer', minimum: 64, maximum: 4096 },
        overlapTokens: { type: 'integer', minimum: 0, maximum: 512 },
        minChunkSize: { type: 'integer', minimum: 10, maximum: 1000 },
        respectBoundaries: { type: 'boolean' }
      }
    },

    entityExtraction: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        regex: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            minConfidence: { type: 'number', minimum: 0.3, maximum: 1.0 },
            patterns: {
              type: 'object',
              properties: {
                systems: { $ref: '#/definitions/patternConfig' },
                documents: { $ref: '#/definitions/patternConfig' },
                organizations: { $ref: '#/definitions/patternConfig' },
                workItems: { $ref: '#/definitions/patternConfig' },
                technical: { $ref: '#/definitions/patternConfig' },
                technologies: { $ref: '#/definitions/patternConfig' },
                camelCase: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    minLength: { type: 'integer', minimum: 3, maximum: 20 },
                    confidence: { type: 'number', minimum: 0.3, maximum: 1.0 },
                    excludeList: { type: 'array', items: { type: 'string' } }
                  }
                }
              }
            }
          }
        },
        llm: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            provider: { type: 'string', enum: ['ollama', 'gemini', 'none'] },
            model: { type: 'string' },
            fallbackChain: { type: 'array', items: { type: 'string' } },
            temperature: { type: 'number', minimum: 0.0, maximum: 2.0 },
            maxTokens: { type: 'integer', minimum: 100, maximum: 8000 },
            timeout: { type: 'integer', minimum: 1000, maximum: 120000 },
            retries: { type: 'integer', minimum: 0, maximum: 5 },
            minContentLength: { type: 'integer', minimum: 10, maximum: 500 },
            confidenceCap: { type: 'number', minimum: 0.5, maximum: 1.0 }
          }
        },
        merge: {
          type: 'object',
          properties: {
            strategy: { type: 'string', enum: ['confidence', 'source-priority', 'union'] },
            sourcePriority: { type: 'array', items: { type: 'string' } },
            boostMultiSource: { type: 'number', minimum: 0.0, maximum: 0.2 },
            maxBoost: { type: 'number', minimum: 0.9, maximum: 1.0 }
          }
        },
        minConfidence: { type: 'number', minimum: 0.3, maximum: 0.95 },
        maxEntities: { type: 'integer', minimum: 10, maximum: 500 },
        deduplication: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            normalizeCase: { type: 'boolean' },
            removeSpecialChars: { type: 'boolean' }
          }
        }
      }
    },

    relationshipExtraction: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        minEntities: { type: 'integer', minimum: 2, maximum: 10 },
        patterns: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            minConfidence: { type: 'number', minimum: 0.3, maximum: 1.0 },
            types: { type: 'object' }
          }
        },
        coOccurrence: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            windowType: { type: 'string', enum: ['sentence', 'paragraph', 'fixed'] },
            fixedWindowSize: { type: 'integer', minimum: 50, maximum: 1000 },
            baseConfidence: { type: 'number', minimum: 0.3, maximum: 0.9 },
            maxConfidence: { type: 'number', minimum: 0.5, maximum: 1.0 },
            distanceBonus: { type: 'number', minimum: 0.0, maximum: 0.3 }
          }
        },
        preposition: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            minConfidence: { type: 'number', minimum: 0.3, maximum: 1.0 }
          }
        },
        llm: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            onlyWhenNoPatterns: { type: 'boolean' },
            minEntities: { type: 'integer', minimum: 2, maximum: 20 }
          }
        },
        maxRelationships: { type: 'integer', minimum: 10, maximum: 200 },
        deduplication: { type: 'boolean' }
      }
    },

    queryExpansion: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        maxTerms: { type: 'integer', minimum: 1, maximum: 50 },
        includesSynonyms: { type: 'boolean' },
        includesHyponyms: { type: 'boolean' },
        includesHypernyms: { type: 'boolean' },
        domainSpecific: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            domains: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    },

    embedding: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        model: { type: 'string' },
        dimension: { type: 'integer', minimum: 128, maximum: 4096 },
        batchSize: { type: 'integer', minimum: 1, maximum: 128 },
        normalize: { type: 'boolean' },
        timeout: { type: 'integer', minimum: 1000, maximum: 120000 },
        retries: { type: 'integer', minimum: 0, maximum: 5 }
      }
    },

    classification: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        minConfidence: { type: 'number', minimum: 0.3, maximum: 1.0 },
        layers: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            mapping: { type: 'object' },
            defaultLayer: { type: 'string' }
          }
        },
        domains: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            categories: { type: 'array', items: { type: 'string' } }
          }
        }
      }
    },

    graphBuild: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        nodes: {
          type: 'object',
          properties: {
            minConfidence: { type: 'number', minimum: 0.3, maximum: 1.0 },
            includeMetadata: { type: 'boolean' },
            idGeneration: { type: 'string', enum: ['uuid', 'hash', 'normalized'] }
          }
        },
        edges: {
          type: 'object',
          properties: {
            minConfidence: { type: 'number', minimum: 0.3, maximum: 1.0 },
            includeEvidence: { type: 'boolean' },
            bidirectional: { type: 'array', items: { type: 'string' } }
          }
        },
        outputFormat: { type: 'string', enum: ['cytoscape', 'd3', 'neo4j'] }
      }
    }
  },

  definitions: {
    patternConfig: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        confidence: { type: 'number', minimum: 0.3, maximum: 1.0 }
      }
    }
  }
};

/**
 * Validate configuration against schema
 * @param {Object} config - Configuration to validate
 * @returns {{valid: boolean, errors: Array}}
 */
function validateConfig(config) {
  const errors = [];

  // Simple validation without external library
  function validateObject(obj, schema, path = '') {
    if (!schema || !obj) return;

    if (schema.type === 'object' && schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        const propPath = path ? `${path}.${key}` : key;
        const value = obj[key];

        if (value !== undefined) {
          validateValue(value, propSchema, propPath);
        }
      }
    }
  }

  function validateValue(value, schema, path) {
    if (schema.$ref) {
      const refPath = schema.$ref.replace('#/definitions/', '');
      const refSchema = PIPELINE_CONFIG_SCHEMA.definitions[refPath];
      if (refSchema) {
        validateValue(value, refSchema, path);
      }
      return;
    }

    // Type check
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ path, message: `Expected boolean, got ${typeof value}` });
    } else if (schema.type === 'string' && typeof value !== 'string') {
      errors.push({ path, message: `Expected string, got ${typeof value}` });
    } else if (schema.type === 'number' && typeof value !== 'number') {
      errors.push({ path, message: `Expected number, got ${typeof value}` });
    } else if (schema.type === 'integer' && (!Number.isInteger(value))) {
      errors.push({ path, message: `Expected integer, got ${typeof value}` });
    } else if (schema.type === 'array' && !Array.isArray(value)) {
      errors.push({ path, message: `Expected array, got ${typeof value}` });
    } else if (schema.type === 'object' && typeof value !== 'object') {
      errors.push({ path, message: `Expected object, got ${typeof value}` });
    }

    // Range check for numbers
    if ((schema.type === 'number' || schema.type === 'integer') && typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({ path, message: `Value ${value} is below minimum ${schema.minimum}` });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({ path, message: `Value ${value} exceeds maximum ${schema.maximum}` });
      }
    }

    // Enum check
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push({ path, message: `Value ${value} not in enum [${schema.enum.join(', ')}]` });
    }

    // String length check
    if (schema.type === 'string' && typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({ path, message: `String length ${value.length} below minimum ${schema.minLength}` });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({ path, message: `String length ${value.length} exceeds maximum ${schema.maxLength}` });
      }
    }

    // Recurse into objects
    if (schema.type === 'object' && typeof value === 'object' && value !== null) {
      validateObject(value, schema, path);
    }
  }

  validateObject(config, PIPELINE_CONFIG_SCHEMA);

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get schema for a specific parameter path
 * @param {string} path - Dot-notated parameter path
 * @returns {Object|null} Schema for the parameter
 */
function getParameterSchema(path) {
  const parts = path.split('.');
  let schema = PIPELINE_CONFIG_SCHEMA;

  for (const part of parts) {
    if (schema.properties && schema.properties[part]) {
      schema = schema.properties[part];
    } else {
      return null;
    }
  }

  return schema;
}

/**
 * Get constraints for a parameter
 * @param {string} path - Parameter path
 * @returns {Object} Constraints object
 */
function getParameterConstraints(path) {
  const schema = getParameterSchema(path);
  if (!schema) return {};

  const constraints = {
    type: schema.type
  };

  if (schema.minimum !== undefined) constraints.min = schema.minimum;
  if (schema.maximum !== undefined) constraints.max = schema.maximum;
  if (schema.enum) constraints.allowedValues = schema.enum;
  if (schema.minLength !== undefined) constraints.minLength = schema.minLength;
  if (schema.maxLength !== undefined) constraints.maxLength = schema.maxLength;

  return constraints;
}

module.exports = {
  PIPELINE_CONFIG_SCHEMA,
  validateConfig,
  getParameterSchema,
  getParameterConstraints
};
