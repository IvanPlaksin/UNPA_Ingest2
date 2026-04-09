'use strict';

/**
 * CODEX-VALID / CODEX-CRUD Error Classes
 * @module validation/errors
 */

/**
 * Thrown when a relationship endpoint (source or target node) does not exist.
 * CODEX-CRUD §1.3: Explicit failure over silent data loss.
 */
class RelationshipEndpointNotFoundError extends Error {
  /**
   * @param {'SOURCE_NOT_FOUND'|'TARGET_NOT_FOUND'|'BOTH_NOT_FOUND'} code
   * @param {string} missingId - ID of the missing node
   * @param {string} [relType] - Relationship type being created
   */
  constructor(code, missingId, relType) {
    super(`Endpoint not found [${code}]: node '${missingId}' does not exist${relType ? ` (relationship: ${relType})` : ''}`);
    this.name = 'RelationshipEndpointNotFoundError';
    this.code = code;
    this.missingId = missingId;
    this.relType = relType;
  }
}

/**
 * Thrown when schema validation fails in strict mode.
 * CODEX-VALID: Pre-write validation.
 */
class SchemaValidationError extends Error {
  /**
   * @param {string} stage - Validation stage (BASE_SCHEMA, DOMAIN_SCHEMA, FINGERPRINT)
   * @param {Array} errors - Validation errors from ajv
   * @param {string} [label] - Node label
   */
  constructor(stage, errors, label) {
    super(`Schema validation failed at ${stage}${label ? ` for ${label}` : ''}: ${JSON.stringify(errors)}`);
    this.name = 'SchemaValidationError';
    this.stage = stage;
    this.validationErrors = errors;
    this.label = label;
  }
}

module.exports = {
  RelationshipEndpointNotFoundError,
  SchemaValidationError,
};
