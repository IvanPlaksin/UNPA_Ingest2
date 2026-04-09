/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CYPHER UTILITIES
 * Common utility functions for Cypher queries and Neo4j/Memgraph operations
 * ═══════════════════════════════════════════════════════════════════════════
 */

// ────────────────────────────────────────────────────────────────────────────
// JSON SERIALIZATION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Serialize a value to JSON string for graph storage
 * @param {*} value - Value to serialize
 * @returns {string|null} - JSON string or null
 */
function serializeJson(value) {
  if (value === undefined || value === null) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * Parse a JSON string from graph storage
 * @param {string} value - JSON string to parse
 * @returns {*} - Parsed value or undefined
 */
function parseJson(value) {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// SESSION MANAGEMENT
// ────────────────────────────────────────────────────────────────────────────

/**
 * Execute a function with a managed session
 * Automatically handles session cleanup in finally block
 * @param {object} driver - Neo4j driver instance
 * @param {function} fn - Async function to execute with session
 * @returns {Promise<*>} - Result from fn
 */
async function withSession(driver, fn) {
  const session = driver.session();
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

/**
 * Execute a write transaction with a managed session
 * @param {object} driver - Neo4j driver instance
 * @param {function} fn - Transaction function
 * @returns {Promise<*>} - Transaction result
 */
async function withWriteTransaction(driver, fn) {
  return withSession(driver, async (session) => {
    return session.writeTransaction(fn);
  });
}

/**
 * Execute a read transaction with a managed session
 * @param {object} driver - Neo4j driver instance
 * @param {function} fn - Transaction function
 * @returns {Promise<*>} - Transaction result
 */
async function withReadTransaction(driver, fn) {
  return withSession(driver, async (session) => {
    return session.readTransaction(fn);
  });
}

// ────────────────────────────────────────────────────────────────────────────
// RECORD CONVERSION
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert a Neo4j integer to a JavaScript number
 * @param {*} value - Neo4j integer or regular value
 * @returns {number} - JavaScript number
 */
function toNumber(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toNumber === 'function') return value.toNumber();
  return Number(value) || 0;
}

/**
 * Convert Neo4j datetime to ISO string
 * @param {*} datetime - Neo4j datetime
 * @returns {string|null} - ISO string or null
 */
function toIsoString(datetime) {
  if (!datetime) return null;
  if (typeof datetime === 'string') return datetime;
  if (datetime.toString) return datetime.toString();
  return null;
}

/**
 * Extract properties from a Neo4j node record
 * @param {object} record - Neo4j record
 * @param {string} alias - Node alias
 * @returns {object|null} - Node properties or null
 */
function getNodeProperties(record, alias) {
  const node = record.get(alias);
  return node?.properties || null;
}

/**
 * Map records to objects using a transform function
 * @param {object} result - Neo4j result
 * @param {function} transform - Transform function for each record
 * @returns {Array} - Array of transformed objects
 */
function mapRecords(result, transform) {
  return result.records.map(record => {
    try {
      return transform(record);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ────────────────────────────────────────────────────────────────────────────
// PARAMETER BUILDERS
// ────────────────────────────────────────────────────────────────────────────

const neo4j = require('neo4j-driver');

/**
 * Build pagination parameters
 * @param {number} limit - Limit value
 * @param {number} offset - Offset value
 * @returns {object} - Neo4j integer parameters
 */
function paginationParams(limit = 100, offset = 0) {
  return {
    limit: neo4j.int(Math.min(Math.max(1, limit), 1000)),
    offset: neo4j.int(Math.max(0, offset))
  };
}

/**
 * Build optional filter parameter
 * @param {*} value - Value (can be null/undefined)
 * @returns {*} - Value or null
 */
function optionalParam(value) {
  return value ?? null;
}

module.exports = {
  // JSON
  serializeJson,
  parseJson,
  // Session
  withSession,
  withWriteTransaction,
  withReadTransaction,
  // Records
  toNumber,
  toIsoString,
  getNodeProperties,
  mapRecords,
  // Parameters
  paginationParams,
  optionalParam
};
