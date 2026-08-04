/**
 * CRUD for workspace retrieval connectors.
 *
 * Connectors hang off the workspace they belong to:
 *
 *   (:WorkSpace)-[:HAS_CONNECTOR]->(:RadixConnector)
 *
 * Every query traverses that edge rather than matching a connector by id alone,
 * so a connector from another workspace cannot be read or written through this
 * service — the same isolation rule the rest of Radix follows.
 *
 * @module services/radix/connector/connector.service
 */

'use strict';

const crypto = require('crypto');
const {
  validateConnector,
  withDefaults,
  buildPreamble,
  DEFAULTS
} = require('./connector.schema');

const LOG_PREFIX = '[RadixConnector]';

let _memgraph = null;
function mg() {
  if (!_memgraph) _memgraph = require('../../memgraph.service');
  return _memgraph;
}

/**
 * Turns a graph record into a connector object.
 *
 * @param {Object} props
 * @returns {Object}
 */
function toConnector(props) {
  if (!props) return null;
  return {
    id: props.id,
    workspaceId: props.workspaceId,
    name: props.name,
    category: props.category,
    enabled: props.enabled !== false,
    priority: typeof props.priority === 'number' ? props.priority : DEFAULTS.priority,
    vectorThreshold: typeof props.vectorThreshold === 'number'
      ? props.vectorThreshold
      : DEFAULTS.vectorThreshold,
    maxElements: typeof props.maxElements === 'number' ? props.maxElements : DEFAULTS.maxElements,
    tokenBudget: typeof props.tokenBudget === 'number' ? props.tokenBudget : DEFAULTS.tokenBudget,
    draftTypes: Array.isArray(props.draftTypes) ? props.draftTypes : [],
    knowledgeFamilies: Array.isArray(props.knowledgeFamilies) ? props.knowledgeFamilies : [],
    excludeStatuses: Array.isArray(props.excludeStatuses)
      ? props.excludeStatuses
      : [...DEFAULTS.excludeStatuses],
    preamble: props.preamble || '',
    createdAt: props.createdAt || null,
    updatedAt: props.updatedAt || null
  };
}

class ConnectorService {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.memgraphService]
   */
  constructor(deps = {}) {
    this._mg = deps.memgraphService || null;
  }

  /** @returns {Object} */
  graph() {
    return this._mg || mg();
  }

  /**
   * Creates a connector on a workspace.
   *
   * @param {string} workspaceId
   * @param {Object} input
   * @returns {Promise<Object>}
   */
  async create(workspaceId, input) {
    if (!workspaceId) throw new Error('workspaceId is required');

    const { valid, errors, value } = validateConnector(input);
    if (!valid) throw new Error(`Invalid connector: ${errors.join('; ')}`);

    const now = new Date().toISOString();
    const props = {
      ...withDefaults(value),
      id: crypto.randomUUID(),
      workspaceId,
      createdAt: now,
      updatedAt: now
    };

    const rows = await this.graph().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})
       CREATE (w)-[:HAS_CONNECTOR]->(c:RadixConnector)
       SET c += $props
       RETURN properties(c) AS props`,
      { wsId: workspaceId, props }
    );

    if (!rows || rows.length === 0) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    console.log(`${LOG_PREFIX} Created "${props.name}" (${props.category}) on ${workspaceId}`);
    return toConnector(rows[0].props);
  }

  /**
   * Lists connectors on a workspace.
   *
   * @param {string} workspaceId
   * @param {Object} [opts]
   * @param {boolean} [opts.enabledOnly=false]
   * @returns {Promise<Object[]>}
   */
  async list(workspaceId, opts = {}) {
    if (!workspaceId) return [];

    const rows = await this.graph().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_CONNECTOR]->(c:RadixConnector)
       ${opts.enabledOnly ? 'WHERE c.enabled = true' : ''}
       RETURN properties(c) AS props`,
      { wsId: workspaceId }
    );

    // Ordering is applied here rather than in Cypher: a connector written before
    // `priority` existed has no such property, and Memgraph sorts a missing
    // value inconsistently against a number.
    return (rows || [])
      .map((r) => toConnector(r.props))
      .filter(Boolean)
      .sort((a, b) => (b.priority - a.priority) || a.name.localeCompare(b.name));
  }

  /**
   * @param {string} workspaceId
   * @param {string} connectorId
   * @returns {Promise<Object|null>}
   */
  async get(workspaceId, connectorId) {
    if (!workspaceId || !connectorId) return null;

    const rows = await this.graph().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_CONNECTOR]->(c:RadixConnector {id: $id})
       RETURN properties(c) AS props`,
      { wsId: workspaceId, id: connectorId }
    );

    return rows && rows.length ? toConnector(rows[0].props) : null;
  }

  /**
   * @param {string} workspaceId
   * @param {string} connectorId
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async update(workspaceId, connectorId, updates) {
    if (!workspaceId || !connectorId) throw new Error('workspaceId and connectorId are required');

    const { valid, errors, value } = validateConnector(updates, true);
    if (!valid) throw new Error(`Invalid connector update: ${errors.join('; ')}`);
    if (Object.keys(value).length === 0) throw new Error('No valid fields to update');

    const rows = await this.graph().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_CONNECTOR]->(c:RadixConnector {id: $id})
       SET c += $updates, c.updatedAt = $now
       RETURN properties(c) AS props`,
      { wsId: workspaceId, id: connectorId, updates: value, now: new Date().toISOString() }
    );

    if (!rows || rows.length === 0) {
      throw new Error(`Connector not found: ${connectorId}`);
    }

    return toConnector(rows[0].props);
  }

  /**
   * @param {string} workspaceId
   * @param {string} connectorId
   * @returns {Promise<boolean>}
   */
  async delete(workspaceId, connectorId) {
    if (!workspaceId || !connectorId) return false;

    const rows = await this.graph().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_CONNECTOR]->(c:RadixConnector {id: $id})
       WITH c, c.id AS deletedId
       DETACH DELETE c
       RETURN deletedId`,
      { wsId: workspaceId, id: connectorId }
    );

    return Boolean(rows && rows.length);
  }

  /**
   * Connectors ready for a retrieval run: enabled, ordered, each carrying the
   * preamble its section will be introduced with.
   *
   * Returns [] on failure rather than throwing — a broken connector definition
   * must degrade retrieval to its default behaviour, not fail the chat turn that
   * asked for context.
   *
   * @param {string} workspaceId
   * @returns {Promise<Object[]>}
   */
  async resolveForRetrieval(workspaceId) {
    try {
      const connectors = await this.list(workspaceId, { enabledOnly: true });
      return connectors.map((c) => ({ ...c, resolvedPreamble: buildPreamble(c) }));
    } catch (error) {
      console.warn(`${LOG_PREFIX} resolve failed for ${workspaceId}: ${error.message}`);
      return [];
    }
  }
}

let _singleton = null;

/** @returns {ConnectorService} */
function getConnectorService() {
  if (!_singleton) _singleton = new ConnectorService();
  return _singleton;
}

module.exports = {
  ConnectorService,
  getConnectorService,
  toConnector
};
