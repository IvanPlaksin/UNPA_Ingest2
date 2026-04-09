/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AOPEG REPOSITORY INDEX
 * Exports all repository components
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Schema
const {
  AOPEG_LABELS,
  AOPEG_RELATIONSHIPS,
  AOPEG_INDEXES,
  AOPEG_QUERIES,
  getCreateIndexesCypher,
} = require('./aopeg.schema');

// Graph Repository
const {
  GraphRepository,
  getGraphRepository,
  createGraphRepository,
} = require('./graph.repository');

// Execution Repository
const {
  ExecutionRepository,
  getExecutionRepository,
  createExecutionRepository,
} = require('./execution.repository');

module.exports = {
  // Schema
  AOPEG_LABELS,
  AOPEG_RELATIONSHIPS,
  AOPEG_INDEXES,
  AOPEG_QUERIES,
  getCreateIndexesCypher,

  // Graph Repository
  GraphRepository,
  getGraphRepository,
  createGraphRepository,

  // Execution Repository
  ExecutionRepository,
  getExecutionRepository,
  createExecutionRepository,
};
