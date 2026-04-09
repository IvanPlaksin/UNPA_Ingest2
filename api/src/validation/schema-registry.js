/**
 * CODEX-VALID Schema Registry
 * Centralized JSON Schema definitions and validation for all graph entities.
 *
 * Design principles (from research):
 * - W3C PROV-O: Entity, Activity, Agent as core provenance concepts
 * - PAV ontology: Provenance, Authoring, Versioning
 * - Bi-temporal model: transaction time + valid time
 * - Hash chain integrity: contentHash → previousHash → chainHash
 *
 * @module validation/schema-registry
 */

'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const codexSchemas = require('./codex-schemas');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NAMESPACES = Object.freeze({
  CORE: 'CORE',
  PROJECT: 'PROJECT',
  META: 'META',
  COMMON: 'COMMON',
  Codex: 'Codex',
  BlackCodex: 'BlackCodex',
});

const NODE_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  SUPERSEDED: 'SUPERSEDED',
  DEPRECATED: 'DEPRECATED',
  MERGED: 'MERGED',
  DELETED: 'DELETED',
});

const CHANGE_TYPES = Object.freeze({
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DEPRECATE: 'DEPRECATE',
  MERGE: 'MERGE',
  SPLIT: 'SPLIT',
  RESTORE: 'RESTORE',
});

const CATALOG_TYPES = Object.freeze({
  ATOMIC: 'atomic',
  TOOL: 'tool',
  BUSINESS: 'business',
  COMPOSITE: 'composite',
  TEMPLATE: 'template',
});

const VISIBILITY = Object.freeze({
  PUBLIC: 'PUBLIC',
  PRIVATE: 'PRIVATE',
  TEAM: 'TEAM',
});

/**
 * Minimum required fields grouped by entity category.
 * Used both for documentation and runtime validation.
 */
const REQUIRED_CORE_FIELDS = Object.freeze({
  // Минимальный контракт для ЛЮБОГО узла
  MANDATORY: ['id', 'createdAt', 'namespace'],

  // Для узлов с провенансом
  PROVENANCE: ['sourceType', 'sourceId', 'extractionCycleId', 'confidence'],

  // Для версионируемых узлов (NodeVersion)
  VERSION: ['versionId', 'sequenceNumber', 'status', 'ttStart', 'contentHash', 'chainHash'],

  // Для рёбер
  EDGE: ['id', 'sourceEntityId', 'targetEntityId', 'edgeType', 'namespace'],

  // Для каталога
  CATALOG_ENTRY: ['entryId', 'name', 'type', 'namespace', 'createdAt'],
});

// ---------------------------------------------------------------------------
// JSON Schemas
// ---------------------------------------------------------------------------

/**
 * Base node — minimum contract for ANY graph node.
 */
const BaseNodeSchema = {
  $id: 'codex://schemas/base-node',
  type: 'object',
  required: ['id', 'createdAt', 'namespace'],
  properties: {
    id: { type: 'string', minLength: 1 },
    createdAt: { type: 'string', format: 'date-time' },
    namespace: { type: 'string', minLength: 1 },
    updatedAt: { type: 'string', format: 'date-time' },
    extractionCycleId: { type: 'string' },
  },
  additionalProperties: true,
};

/**
 * Provenance block — tracks origin and confidence of a fact.
 * Based on W3C PROV-O (Entity ← wasGeneratedBy ← Activity ← wasAssociatedWith ← Agent).
 */
const ProvenanceSchema = {
  $id: 'codex://schemas/provenance',
  type: 'object',
  required: ['sourceType', 'sourceId', 'confidence'],
  properties: {
    sourceType: {
      type: 'string',
      enum: ['llm', 'user', 'system', 'import', 'pipeline', 'agent'],
    },
    sourceId: { type: 'string', minLength: 1 },
    extractionCycleId: { type: 'string' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    model: { type: 'string' },
    prompt: { type: 'string' },
    agentId: { type: 'string' },
  },
  additionalProperties: true,
};

/**
 * NodeVersion — immutable, bi-temporal, hash-chained node.
 */
const NodeVersionSchema = {
  $id: 'codex://schemas/node-version',
  type: 'object',
  required: [
    'versionId', 'entityId', 'namespace', 'sequenceNumber',
    'status', 'ttStart', 'contentHash', 'chainHash', 'nodeType',
  ],
  properties: {
    versionId: { type: 'string', minLength: 1 },
    entityId: { type: 'string', minLength: 1 },
    namespace: { enum: Object.values(NAMESPACES) },
    sequenceNumber: { type: 'integer', minimum: 1 },
    versionName: { type: 'string' },
    status: { enum: Object.values(NODE_STATUS) },
    // Bi-temporal fields
    ttStart: { type: 'string', format: 'date-time' },
    ttEnd: { type: ['string', 'null'], format: 'date-time' },
    vtStart: { type: 'string', format: 'date-time' },
    vtEnd: { type: ['string', 'null'], format: 'date-time' },
    // Version chain
    previousVersionId: { type: ['string', 'null'] },
    supersededById: { type: ['string', 'null'] },
    mergedFromIds: { type: 'array', items: { type: 'string' } },
    splitIntoIds: { type: 'array', items: { type: 'string' } },
    // Change metadata
    changeType: { enum: Object.values(CHANGE_TYPES) },
    changeReason: { type: 'string' },
    changedBy: { type: 'string' },
    changeSource: { type: 'string' },
    extractionCycleId: { type: ['string', 'null'] },
    // Hash chain integrity
    contentHash: { type: 'string', minLength: 64, maxLength: 64 },
    previousHash: { type: ['string', 'null'] },
    chainHash: { type: 'string', minLength: 64, maxLength: 64 },
    signature: { type: ['string', 'null'] },
    // Payload
    properties: { type: ['object', 'string'] },
    nodeType: { type: 'string', minLength: 1 },
  },
  additionalProperties: false,
};

/**
 * EdgeVersion — immutable, hash-chained edge between NodeVersions.
 */
const EdgeVersionSchema = {
  $id: 'codex://schemas/edge-version',
  type: 'object',
  required: [
    'versionId', 'edgeId', 'sourceEntityId', 'targetEntityId',
    'edgeType', 'namespace', 'status', 'ttStart', 'contentHash', 'chainHash',
  ],
  properties: {
    versionId: { type: 'string', minLength: 1 },
    edgeId: { type: 'string', minLength: 1 },
    sourceEntityId: { type: 'string', minLength: 1 },
    targetEntityId: { type: 'string', minLength: 1 },
    edgeType: { type: 'string', minLength: 1 },
    namespace: { enum: Object.values(NAMESPACES) },
    sequenceNumber: { type: 'integer', minimum: 1 },
    status: { enum: Object.values(NODE_STATUS) },
    ttStart: { type: 'string', format: 'date-time' },
    ttEnd: { type: ['string', 'null'], format: 'date-time' },
    vtStart: { type: 'string', format: 'date-time' },
    vtEnd: { type: ['string', 'null'], format: 'date-time' },
    contentHash: { type: 'string', minLength: 64, maxLength: 64 },
    previousHash: { type: ['string', 'null'] },
    chainHash: { type: 'string', minLength: 64, maxLength: 64 },
    properties: { type: ['object', 'string'] },
  },
  additionalProperties: false,
};

/**
 * CatalogEntry — GXE graph catalog record.
 */
const CatalogEntrySchema = {
  $id: 'codex://schemas/catalog-entry',
  type: 'object',
  required: ['entryId', 'name', 'type', 'namespace', 'createdAt'],
  properties: {
    entryId: { type: 'string', minLength: 1 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    description: { type: 'string', maxLength: 2000 },
    type: { enum: Object.values(CATALOG_TYPES) },
    namespace: { type: 'string', minLength: 1 },
    tags: { type: 'array', items: { type: 'string' } },
    visibility: { enum: Object.values(VISIBILITY) },
    isPublic: { type: 'boolean' },
    createdBy: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    currentVersion: { type: 'integer', minimum: 1 },
    usageCount: { type: 'integer', minimum: 0 },
    qualityScore: { type: 'number', minimum: 0, maximum: 1 },
  },
  additionalProperties: true,
};

/**
 * GraphVersion — a version snapshot within a CatalogEntry.
 */
const GraphVersionSchema = {
  $id: 'codex://schemas/graph-version',
  type: 'object',
  required: ['versionId', 'versionNumber', 'createdAt', 'contentHash'],
  properties: {
    versionId: { type: 'string', minLength: 1 },
    versionNumber: { type: 'integer', minimum: 1 },
    changelog: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
    createdBy: { type: 'string' },
    contentHash: { type: 'string', minLength: 64, maxLength: 64 },
    isProduction: { type: 'boolean' },
  },
  additionalProperties: false,
};

/**
 * ExecutionRecord — unified runtime execution log (CC-029).
 * Records graph execution from both RuntimeEngine and GxeManagerService.
 */
const ExecutionRecordSchema = {
  $id: 'codex://schemas/execution-record',
  type: 'object',
  required: ['executionId', 'graphId', 'status', 'startedAt'],
  properties: {
    executionId: { type: 'string', minLength: 1 },
    graphId: { type: 'string', minLength: 1 },
    graphName: { type: 'string' },
    namespace: { type: 'string', enum: ['META'] },
    status: { enum: ['COMPLETED', 'FAILED', 'TIMED_OUT', 'PARTIAL_FAILURE', 'CANCELLED'] },
    startedAt: { type: 'string', format: 'date-time' },
    completedAt: { type: 'string', format: 'date-time' },
    durationMs: { type: 'number', minimum: 0 },
    executedBy: { type: 'string' },
    inputHash: { type: 'string' },
    outputSummary: { type: 'string' },
    nodesTotal: { type: 'integer', minimum: 0 },
    nodesSucceeded: { type: 'integer', minimum: 0 },
    nodesFailed: { type: 'integer', minimum: 0 },
    nodesSkipped: { type: 'integer', minimum: 0 },
    totalRetries: { type: 'integer', minimum: 0 },
    errorMessage: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  additionalProperties: true,
};

/**
 * ExecutionNodeRecord — per-node execution detail (CC-029).
 * Linked to parent ExecutionRecord via EXECUTED_NODE edge.
 */
const ExecutionNodeRecordSchema = {
  $id: 'codex://schemas/execution-node-record',
  type: 'object',
  required: ['id', 'executionId', 'nodeId', 'status'],
  properties: {
    id: { type: 'string', minLength: 1 },
    executionId: { type: 'string', minLength: 1 },
    nodeId: { type: 'string', minLength: 1 },
    namespace: { type: 'string', enum: ['META'] },
    status: { type: 'string' },
    durationMs: { type: 'number', minimum: 0 },
    attempts: { type: 'integer', minimum: 1 },
    errorMessage: { type: 'string' },
    createdAt: { type: 'string', format: 'date-time' },
  },
  additionalProperties: true,
};

// ---------------------------------------------------------------------------
// Schema Registry class
// ---------------------------------------------------------------------------

class SchemaRegistry {
  constructor() {
    this._ajv = new Ajv({ allErrors: true, strict: false });
    try {
      addFormats(this._ajv);
    } catch {
      // ajv-formats may not be installed; date-time validation will be skipped
    }
    this._schemas = new Map();
    this._registerBuiltinSchemas();
  }

  /** Register all built-in Codex schemas. */
  _registerBuiltinSchemas() {
    const builtins = [
      BaseNodeSchema,
      ProvenanceSchema,
      NodeVersionSchema,
      EdgeVersionSchema,
      CatalogEntrySchema,
      GraphVersionSchema,
      ExecutionRecordSchema,
      ExecutionNodeRecordSchema,
    ];
    for (const schema of builtins) {
      this.register(schema);
    }

    // Register Codex namespace schemas
    for (const schema of Object.values(codexSchemas.schemas)) {
      this.register(schema);
    }
  }

  /**
   * Register (or replace) a JSON Schema.
   * @param {object} schema — must contain `$id`.
   */
  register(schema) {
    if (!schema.$id) throw new Error('Schema must have an $id');
    // Remove old version if re-registering
    if (this._schemas.has(schema.$id)) {
      this._ajv.removeSchema(schema.$id);
    }
    this._ajv.addSchema(schema);
    this._schemas.set(schema.$id, schema);
  }

  /**
   * Validate data against a registered schema.
   * @param {string} schemaId — e.g. 'codex://schemas/base-node'
   * @param {unknown} data
   * @returns {{ valid: boolean, errors: Array|null }}
   */
  validate(schemaId, data) {
    const validateFn = this._ajv.getSchema(schemaId);
    if (!validateFn) {
      return { valid: false, errors: [{ message: `Schema not found: ${schemaId}` }] };
    }
    const valid = validateFn(data);
    return {
      valid,
      errors: valid ? null : [...validateFn.errors],
    };
  }

  /**
   * Shorthand validators for common entity types.
   * Returns { valid, errors }.
   */
  validateBaseNode(data) { return this.validate('codex://schemas/base-node', data); }
  validateProvenance(data) { return this.validate('codex://schemas/provenance', data); }
  validateNodeVersion(data) { return this.validate('codex://schemas/node-version', data); }
  validateEdgeVersion(data) { return this.validate('codex://schemas/edge-version', data); }
  validateCatalogEntry(data) { return this.validate('codex://schemas/catalog-entry', data); }
  validateGraphVersion(data) { return this.validate('codex://schemas/graph-version', data); }
  validateExecutionRecord(data) { return this.validate('codex://schemas/execution-record', data); }
  validateExecutionNodeRecord(data) { return this.validate('codex://schemas/execution-node-record', data); }

  // Codex namespace validators
  validateCodexPrinciple(data) { return this.validate('codex-principle', data); }
  validateCodexRule(data) { return this.validate('codex-rule', data); }
  validateCodexDefinition(data) { return this.validate('codex-definition', data); }
  validateCodexConstraint(data) { return this.validate('codex-constraint', data); }
  validateCodexPattern(data) { return this.validate('codex-pattern', data); }
  validateCodexProposal(data) { return this.validate('codex-proposal', data); }
  validateCodexStakeholder(data) { return this.validate('codex-stakeholder', data); }

  /** List all registered schema IDs. */
  listSchemas() {
    return [...this._schemas.keys()];
  }

  /** Get raw schema object by ID. */
  getSchema(schemaId) {
    return this._schemas.get(schemaId) || null;
  }
}

// ---------------------------------------------------------------------------
// Fingerprint collision checker (stub — requires memgraph service injection)
// ---------------------------------------------------------------------------

/**
 * Check whether a content fingerprint already exists in the graph.
 *
 * @param {object} memgraphService — memgraph service instance
 * @param {string} contentHash — SHA-256 hex digest
 * @param {string} namespace — target namespace
 * @returns {Promise<{exists: boolean, existingNodeId: string|null, action: 'create'|'upsert'|'reject'}>}
 */
async function checkFingerprintCollision(memgraphService, contentHash, namespace) {
  const query = `
    MATCH (n)
    WHERE n.contentHash = $contentHash AND n.namespace = $namespace
    RETURN n.id AS nodeId, labels(n) AS labels
    LIMIT 1
  `;
  const result = await memgraphService.executeQuery(query, { contentHash, namespace });

  if (!result.records || result.records.length === 0) {
    return { exists: false, existingNodeId: null, action: 'create' };
  }

  const existingNodeId = result.records[0].get('nodeId');
  return { exists: true, existingNodeId, action: 'upsert' };
}

// ---------------------------------------------------------------------------
// Singleton instance
// ---------------------------------------------------------------------------

let _instance = null;

function getSchemaRegistry() {
  if (!_instance) {
    _instance = new SchemaRegistry();
  }
  return _instance;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Constants
  NAMESPACES,
  NODE_STATUS,
  CHANGE_TYPES,
  CATALOG_TYPES,
  VISIBILITY,
  REQUIRED_CORE_FIELDS,

  // Schemas (raw objects for documentation / external use)
  BaseNodeSchema,
  ProvenanceSchema,
  NodeVersionSchema,
  EdgeVersionSchema,
  CatalogEntrySchema,
  GraphVersionSchema,
  ExecutionRecordSchema,
  ExecutionNodeRecordSchema,

  // Registry
  SchemaRegistry,
  getSchemaRegistry,

  // Codex schemas
  codexSchemas,

  // Utilities
  checkFingerprintCollision,
};
