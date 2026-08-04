/**
 * Which workspace the chat draws knowledge from.
 *
 * Follows the shape of `act-permissions.service`: a node in the graph is the
 * editable source of truth, an env var is the bootstrap fallback, and reads are
 * cached because this is consulted on the hot path of every chat turn.
 *
 * Singleton by construction — there is one chat, so there is one binding.
 *
 * Resolution order, and the one rule that matters in it:
 *   1. a binding node exists and is enabled  → its workspaceId
 *   2. a binding node exists and is DISABLED → null, NOT the env var
 *   3. no binding node at all                → FLOWDESK_KNOWLEDGE_WORKSPACE_ID
 *   4. the read failed                       → null (fail-closed)
 *
 * Step 2 is the important one. Someone who switches knowledge off in the admin
 * expects it off; falling back to a stale env var would silently keep feeding
 * the model from a workspace an operator just disconnected.
 *
 * @module instances/flowdesk/services/knowledge-binding
 */

'use strict';

const crypto = require('crypto');

const LOG_PREFIX = '[FlowDesk:knowledge-binding]';
const CACHE_TTL_MS = 5 * 60 * 1000;

let _memgraph = null;
function mg() {
  if (!_memgraph) _memgraph = require('../../../services/memgraph.service');
  return _memgraph;
}

/**
 * @typedef {Object} KnowledgeBinding
 * @property {string} id
 * @property {string} workspaceId
 * @property {string} workspaceName
 * @property {boolean} enabled
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string} updatedBy
 * @property {'graph'|'env'|'none'} source - Where the active value came from
 */

function toBinding(props) {
  if (!props) return null;
  return {
    id: props.id || null,
    workspaceId: props.workspaceId || null,
    workspaceName: props.workspaceName || null,
    enabled: props.enabled !== false,
    createdAt: props.createdAt || null,
    updatedAt: props.updatedAt || null,
    updatedBy: props.updatedBy || null
  };
}

class KnowledgeBindingService {
  /**
   * @param {Object} [deps]
   * @param {Object} [deps.memgraphService]
   */
  constructor(deps = {}) {
    this._mg = deps.memgraphService || null;
    this._cache = undefined; // undefined = never read; null = read, no node
    this._cacheExpiry = 0;
  }

  graph() {
    return this._mg || mg();
  }

  /** Drops the cached binding so the next read hits the graph. */
  invalidateCache() {
    this._cache = undefined;
    this._cacheExpiry = 0;
  }

  /**
   * Reads the binding node.
   *
   * @returns {Promise<KnowledgeBinding|null>}
   */
  async getBinding() {
    const rows = await this.graph().runQuery(
      'MATCH (b:FlowDeskKnowledgeBinding) RETURN properties(b) AS props LIMIT 1',
      {}
    );
    return rows && rows.length ? toBinding(rows[0].props) : null;
  }

  /**
   * The workspace the chat should read knowledge from right now.
   *
   * Never throws: a failure here must not fail the chat turn that asked.
   *
   * @returns {Promise<string|null>}
   */
  async getActiveWorkspaceId() {
    if (this._cache !== undefined && Date.now() < this._cacheExpiry) {
      return this._resolve(this._cache);
    }

    let binding;
    try {
      binding = await this.getBinding();
    } catch (error) {
      // Fail-closed. Falling back to env on an unreadable graph would mean the
      // chat quietly ignores an operator's decision it simply could not read.
      console.warn(`${LOG_PREFIX} read failed, knowledge disabled: ${error.message}`);
      return null;
    }

    this._cache = binding;
    this._cacheExpiry = Date.now() + CACHE_TTL_MS;
    return this._resolve(binding);
  }

  /**
   * @param {KnowledgeBinding|null} binding
   * @returns {string|null}
   * @private
   */
  _resolve(binding) {
    if (binding) {
      // A disabled binding is an explicit "off", not an absence.
      return binding.enabled ? (binding.workspaceId || null) : null;
    }
    return process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID || null;
  }

  /**
   * Full state for the admin UI, including where the active value comes from.
   *
   * The `source` field is what lets the tab say "this is coming from an env var,
   * not from anything you can edit here" instead of showing a workspace with no
   * explanation of why changing it does nothing.
   *
   * @returns {Promise<KnowledgeBinding & {source: string}>}
   */
  async getStatus() {
    let binding = null;
    let readFailed = false;

    try {
      binding = await this.getBinding();
    } catch (error) {
      readFailed = true;
      console.warn(`${LOG_PREFIX} status read failed: ${error.message}`);
    }

    if (binding) {
      return { ...binding, source: 'graph', active: binding.enabled ? binding.workspaceId : null };
    }

    const envWorkspace = readFailed ? null : (process.env.FLOWDESK_KNOWLEDGE_WORKSPACE_ID || null);
    return {
      id: null,
      workspaceId: envWorkspace,
      workspaceName: null,
      enabled: Boolean(envWorkspace),
      createdAt: null,
      updatedAt: null,
      updatedBy: null,
      source: envWorkspace ? 'env' : 'none',
      active: envWorkspace
    };
  }

  /**
   * Binds a workspace to the chat. Upsert — there is only ever one binding.
   *
   * @param {string} workspaceId
   * @param {Object} [opts]
   * @param {string} [opts.workspaceName] - Denormalized so the UI need not join
   * @param {string} [opts.updatedBy]
   * @returns {Promise<KnowledgeBinding>}
   */
  async setBinding(workspaceId, opts = {}) {
    if (!workspaceId) throw new Error('workspaceId is required');

    const now = new Date().toISOString();
    const rows = await this.graph().runQuery(
      `MERGE (b:FlowDeskKnowledgeBinding)
       ON CREATE SET b.id = $id, b.createdAt = $now
       SET b.workspaceId = $workspaceId,
           b.workspaceName = $workspaceName,
           b.enabled = true,
           b.updatedAt = $now,
           b.updatedBy = $updatedBy
       RETURN properties(b) AS props`,
      {
        id: crypto.randomUUID(),
        workspaceId,
        // Memgraph rejects a null literal in a property map.
        workspaceName: opts.workspaceName || '',
        updatedBy: opts.updatedBy || 'unknown',
        now
      }
    );

    this.invalidateCache();
    console.log(`${LOG_PREFIX} bound to ${workspaceId} by ${opts.updatedBy || 'unknown'}`);
    return toBinding(rows[0].props);
  }

  /**
   * Turns knowledge off without forgetting which workspace it was.
   *
   * @param {Object} [opts]
   * @param {string} [opts.updatedBy]
   * @returns {Promise<KnowledgeBinding|null>}
   */
  async disableBinding(opts = {}) {
    const rows = await this.graph().runQuery(
      `MATCH (b:FlowDeskKnowledgeBinding)
       SET b.enabled = false, b.updatedAt = $now, b.updatedBy = $updatedBy
       RETURN properties(b) AS props`,
      { now: new Date().toISOString(), updatedBy: opts.updatedBy || 'unknown' }
    );

    this.invalidateCache();
    return rows && rows.length ? toBinding(rows[0].props) : null;
  }

  /**
   * Re-enables the existing binding.
   *
   * @param {Object} [opts]
   * @returns {Promise<KnowledgeBinding|null>}
   */
  async enableBinding(opts = {}) {
    const rows = await this.graph().runQuery(
      `MATCH (b:FlowDeskKnowledgeBinding)
       SET b.enabled = true, b.updatedAt = $now, b.updatedBy = $updatedBy
       RETURN properties(b) AS props`,
      { now: new Date().toISOString(), updatedBy: opts.updatedBy || 'unknown' }
    );

    this.invalidateCache();
    return rows && rows.length ? toBinding(rows[0].props) : null;
  }

  /**
   * Removes the binding entirely, restoring the env fallback.
   *
   * @returns {Promise<boolean>}
   */
  async deleteBinding() {
    const rows = await this.graph().runQuery(
      `MATCH (b:FlowDeskKnowledgeBinding)
       WITH b, b.id AS deletedId
       DETACH DELETE b
       RETURN deletedId`,
      {}
    );

    this.invalidateCache();
    return Boolean(rows && rows.length);
  }
}

let _singleton = null;

/** @returns {KnowledgeBindingService} */
function getKnowledgeBindingService() {
  if (!_singleton) _singleton = new KnowledgeBindingService();
  return _singleton;
}

module.exports = {
  KnowledgeBindingService,
  getKnowledgeBindingService,
  CACHE_TTL_MS
};
