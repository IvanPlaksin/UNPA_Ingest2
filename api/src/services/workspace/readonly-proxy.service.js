/**
 * ReadOnly Proxy Service
 *
 * Provides read-only access to Global KB from within WorkSpace.
 * All writes are blocked at application layer.
 * All reads are audited in a buffer flushed to Memgraph.
 * Returns lightweight KBReference stubs, not full nodes.
 *
 * Security guarantees:
 * 1. Only MATCH queries allowed (no CREATE/SET/DELETE/MERGE/REMOVE)
 * 2. Only CORE/PROJECT/META/COMMON/CODEX namespaces accessible
 * 3. Cross-workspace access blocked (no workspace:* queries)
 * 4. All reads logged to audit trail
 *
 * @module services/workspace/readonly-proxy.service
 */

'use strict';

const crypto = require('crypto');
const neo4j = require('neo4j-driver');
const { v4: uuidv4 } = require('uuid');

const LOG_PREFIX = '[ReadOnlyProxy]';

// Forbidden Cypher keywords (case-insensitive)
const WRITE_KEYWORDS = [
  'CREATE', 'MERGE', 'SET', 'DELETE', 'REMOVE', 'DROP',
  'DETACH', 'FOREACH'
];

// Compiled regex patterns for write detection
const WRITE_PATTERNS = WRITE_KEYWORDS.map(kw =>
  new RegExp(`\\b${kw}\\b`, 'i')
);

// Allowed namespaces for KB read (no workspace, no blackcodex)
const ALLOWED_KB_NAMESPACES = ['core', 'project', 'meta', 'common', 'Codex'];

// Qdrant collection name mapping for KB namespaces
const KB_COLLECTION_MAP = {
  core: 'core_knowledge',
  project: 'project',
  meta: 'meta_knowledge',
  common: 'common_vocabulary',
  Codex: 'codex_knowledge'
};

// Audit buffer config
const AUDIT_BATCH_SIZE = 50;
const AUDIT_FLUSH_INTERVAL_MS = 30000; // 30 seconds

// Lazy dependencies
let _memgraph = null;
let _qdrant = null;

function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}

function qdrantSvc() {
  if (!_qdrant) _qdrant = require('../qdrant.service');
  return _qdrant;
}

class ReadOnlyProxyService {
  /**
   * @param {string} workspaceId - Owning workspace
   * @param {string} userId - User/agent performing reads
   */
  constructor(workspaceId, userId) {
    this.workspaceId = workspaceId;
    this.userId = userId;
    this.auditBuffer = [];
    this.flushTimer = null;

    this._startPeriodicFlush();
  }

  // ==================== QUERY METHODS ====================

  /**
   * Execute read-only Cypher query against Global KB
   * @param {string} cypher - Cypher query (MATCH only)
   * @param {Object} [params={}] - Query parameters
   * @returns {Promise<any[]>} Query results
   * @throws {Error} If query contains write operations
   */
  async query(cypher, params = {}) {
    this._validateReadOnly(cypher);
    this._validateNoWorkspaceAccess(cypher, params);

    const startTime = Date.now();
    const results = await mg().runQuery(cypher, params);
    const durationMs = Date.now() - startTime;

    this._logAudit({
      operation: 'query',
      cypherHash: this._hashCypher(cypher),
      resultCount: results.length,
      durationMs
    });

    return results;
  }

  /**
   * Get KB node as lightweight KBReference stub
   * @param {string} entityId - Node entityId in Global KB
   * @returns {Promise<Object|null>}
   */
  async getNodeStub(entityId) {
    const startTime = Date.now();

    const results = await mg().runQuery(
      `MATCH (n)
       WHERE n.entityId = $entityId
         AND n.namespace IN $allowedNamespaces
       RETURN n.entityId AS entityId,
              n.type AS type,
              n.name AS name,
              n.namespace AS namespace,
              n.contentHash AS contentHash,
              labels(n) AS labels
       LIMIT 1`,
      { entityId, allowedNamespaces: ALLOWED_KB_NAMESPACES }
    );

    const durationMs = Date.now() - startTime;

    if (results.length === 0) {
      this._logAudit({
        operation: 'getNodeStub',
        targetEntityId: entityId,
        resultCount: 0,
        durationMs
      });
      return null;
    }

    const kbRef = await this._createKBReference(results[0]);

    this._logAudit({
      operation: 'getNodeStub',
      targetEntityId: entityId,
      resultCount: 1,
      durationMs
    });

    return kbRef;
  }

  /**
   * Get full KB node (use sparingly — prefer getNodeStub)
   * Flags FULL_NODE_ACCESS in audit for security review.
   * @param {string} entityId
   * @returns {Promise<Object|null>}
   */
  async getNodeFull(entityId) {
    const startTime = Date.now();

    const results = await mg().runQuery(
      `MATCH (n)
       WHERE n.entityId = $entityId
         AND n.namespace IN $allowedNamespaces
       RETURN n
       LIMIT 1`,
      { entityId, allowedNamespaces: ALLOWED_KB_NAMESPACES }
    );

    const durationMs = Date.now() - startTime;

    this._logAudit({
      operation: 'getNodeFull',
      targetEntityId: entityId,
      resultCount: results.length,
      durationMs,
      flags: ['FULL_NODE_ACCESS']
    });

    if (results.length === 0) return null;

    const node = results[0].n?.properties || results[0].n || results[0];

    // Also create a KBReference for tracking
    await this._createKBReference({
      entityId: node.entityId,
      namespace: node.namespace,
      type: node.type,
      name: node.name,
      contentHash: node.contentHash
    });

    return node;
  }

  /**
   * Search KB for similar nodes via vector search
   * @param {number[]} embedding - Query vector
   * @param {Object} options
   * @param {string} [options.namespace] - Filter by namespace
   * @param {string} [options.type] - Filter by type
   * @param {number} [options.limit=10]
   * @param {number} [options.threshold=0.7]
   * @returns {Promise<Object[]>} Array of KBReference stubs with scores
   */
  async searchSimilar(embedding, { namespace, type, limit = 10, threshold = 0.7 } = {}) {
    if (namespace && !ALLOWED_KB_NAMESPACES.includes(namespace)) {
      throw new Error(`Access denied: namespace '${namespace}' not allowed from WorkSpace`);
    }

    const startTime = Date.now();
    const collections = this._getKBCollections(namespace);
    const allResults = [];

    for (const collection of collections) {
      try {
        const filter = type
          ? { must: [{ key: 'type', match: { value: type } }] }
          : undefined;

        const results = await qdrantSvc().client.search(collection, {
          vector: embedding,
          limit,
          filter,
          score_threshold: threshold,
          with_payload: true
        });

        for (const r of results) {
          allResults.push({
            id: r.id,
            score: r.score,
            payload: r.payload || {},
            sourceCollection: collection
          });
        }
      } catch (err) {
        // Collection might not exist — skip silently
        console.debug(`${LOG_PREFIX} Skipping collection ${collection}: ${err.message}`);
      }
    }

    // Sort by score, take top N
    allResults.sort((a, b) => b.score - a.score);
    const topResults = allResults.slice(0, limit);

    // Convert to KBReferences
    const kbRefs = [];
    for (const r of topResults) {
      const ref = await this._createKBReferenceFromQdrant(r);
      if (ref) {
        kbRefs.push({ ...ref, score: r.score });
      }
    }

    const durationMs = Date.now() - startTime;

    this._logAudit({
      operation: 'searchSimilar',
      resultCount: kbRefs.length,
      durationMs,
      filters: { namespace, type, limit, threshold }
    });

    return kbRefs;
  }

  /**
   * Get KB nodes by type
   * @param {string} type - Node type to search
   * @param {Object} options
   * @param {string} [options.namespace]
   * @param {number} [options.limit=20]
   * @returns {Promise<Object[]>} KBReference stubs
   */
  async getNodesByType(type, { namespace, limit = 20 } = {}) {
    const allowedNs = namespace ? [namespace] : ALLOWED_KB_NAMESPACES;

    const results = await this.query(
      `MATCH (n)
       WHERE n.type = $type AND n.namespace IN $allowedNamespaces
       RETURN n.entityId AS entityId, n.type AS type, n.name AS name,
              n.namespace AS namespace, n.contentHash AS contentHash
       ORDER BY n.createdAt DESC
       LIMIT $limit`,
      { type, allowedNamespaces: allowedNs, limit: neo4j.int(parseInt(limit, 10) || 50) }
    );

    const refs = [];
    for (const r of results) {
      refs.push(await this._createKBReference(r));
    }
    return refs;
  }

  /**
   * Get neighbors of a KB node (1 hop)
   * @param {string} entityId
   * @param {Object} options
   * @param {string} [options.direction='both'] - 'in', 'out', 'both'
   * @param {number} [options.limit=20]
   * @returns {Promise<Object[]>} KBReference stubs of neighbors
   */
  async getNeighbors(entityId, { direction = 'both', limit = 20 } = {}) {
    let pattern;
    switch (direction) {
      case 'out': pattern = '(n)-[r]->(neighbor)'; break;
      case 'in':  pattern = '(neighbor)-[r]->(n)'; break;
      default:    pattern = '(n)-[r]-(neighbor)'; break;
    }

    const results = await this.query(
      `MATCH (n {entityId: $entityId})
       WHERE n.namespace IN $allowedNamespaces
       MATCH ${pattern}
       WHERE neighbor.namespace IN $allowedNamespaces
       RETURN neighbor.entityId AS entityId, neighbor.type AS type,
              neighbor.name AS name, neighbor.namespace AS namespace,
              neighbor.contentHash AS contentHash, type(r) AS relType
       LIMIT $limit`,
      { entityId, allowedNamespaces: ALLOWED_KB_NAMESPACES, limit: neo4j.int(parseInt(limit, 10) || 50) }
    );

    const refs = [];
    for (const r of results) {
      const ref = await this._createKBReference(r);
      refs.push({ ...ref, relType: r.relType });
    }
    return refs;
  }

  // ==================== AUDIT ====================

  /**
   * Get audit log for this workspace
   * @param {Object} options
   * @returns {Promise<Object[]>}
   */
  async getAuditLog({ limit = 100, operation } = {}) {
    const conditions = ['ws.id = $workspaceId'];
    const params = { workspaceId: this.workspaceId, limit: neo4j.int(parseInt(limit, 10) || 100) };

    if (operation) {
      conditions.push('a.operation = $operation');
      params.operation = operation;
    }

    const results = await mg().runQuery(
      `MATCH (ws:WorkSpace {id: $workspaceId})-[:HAS_AUDIT]->(a:ReadAuditEntry)
       WHERE ${conditions.join(' AND ')}
       RETURN a ORDER BY a.timestamp DESC LIMIT $limit`,
      params
    );

    return results.map(r => r.a?.properties || r.a || r);
  }

  // ==================== LIFECYCLE ====================

  /**
   * Cleanup — flush remaining audit entries, stop timer
   */
  async close() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this._flushAuditBuffer();
  }

  // ==================== PRIVATE: VALIDATION ====================

  /**
   * Validate query is read-only (no write keywords)
   * @private
   */
  _validateReadOnly(cypher) {
    // Strip comments before checking
    const clean = cypher
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

    for (const pattern of WRITE_PATTERNS) {
      if (pattern.test(clean)) {
        const keyword = WRITE_KEYWORDS[WRITE_PATTERNS.indexOf(pattern)];
        console.warn(`${LOG_PREFIX} BLOCKED write attempt in workspace ${this.workspaceId}: ${keyword}`);
        this._logAudit({
          operation: 'BLOCKED_WRITE',
          keyword,
          cypherHash: this._hashCypher(cypher),
          flags: ['SECURITY_VIOLATION']
        });
        throw new Error(`Write operations not allowed from WorkSpace: '${keyword}' detected`);
      }
    }
  }

  /**
   * Validate query doesn't access workspace namespaces
   * @private
   */
  _validateNoWorkspaceAccess(cypher, params) {
    if (/workspace:/i.test(cypher)) {
      throw new Error('Access to workspace namespace not allowed through KB proxy');
    }
    const paramStr = JSON.stringify(params);
    if (/workspace:/i.test(paramStr)) {
      throw new Error('Workspace namespace in query parameters not allowed');
    }
  }

  // ==================== PRIVATE: KB REFERENCE ====================

  /**
   * Create or update KBReference in workspace
   * @private
   */
  async _createKBReference(nodeData) {
    if (!nodeData.entityId) return null;

    const refId = uuidv4();
    const now = new Date().toISOString();

    // Check if reference already exists
    const existing = await mg().runQuery(
      `MATCH (r:KBReference {workspaceId: $workspaceId, kbNodeId: $kbNodeId})
       RETURN r LIMIT 1`,
      { workspaceId: this.workspaceId, kbNodeId: nodeData.entityId }
    );

    if (existing.length > 0) {
      const existingRef = existing[0].r?.properties || existing[0].r;
      // Update snapshot timestamp
      await mg().runQuery(
        `MATCH (r:KBReference {id: $id})
         SET r.snapshotAt = $now, r.snapshotHash = $hash, r.isStale = false, r.lastAccessedAt = $now`,
        {
          id: existingRef.id,
          now,
          hash: nodeData.contentHash || ''
        }
      );
      return {
        ...existingRef,
        snapshotAt: now,
        snapshotHash: nodeData.contentHash || '',
        isStale: false,
        lastAccessedAt: now
      };
    }

    // Create new KBReference
    const kbRef = {
      id: refId,
      workspaceId: this.workspaceId,
      kbNodeId: nodeData.entityId,
      kbNamespace: nodeData.namespace || '',
      type: nodeData.type || '',
      name: nodeData.name || '',
      snapshotHash: nodeData.contentHash || '',
      snapshotAt: now,
      isStale: false,
      lastAccessedAt: now
    };

    await mg().runQuery(
      `MATCH (ws:WorkSpace {id: $wsId})
       CREATE (r:KBReference $props)
       CREATE (ws)-[:REFERENCES_KB]->(r)`,
      { wsId: this.workspaceId, props: kbRef }
    );

    return kbRef;
  }

  /**
   * Create KBReference from Qdrant result
   * @private
   */
  async _createKBReferenceFromQdrant(qdrantResult) {
    const payload = qdrantResult.payload || {};
    return this._createKBReference({
      entityId: payload.entityId || String(qdrantResult.id),
      namespace: payload.namespace || payload.fullNamespace,
      type: payload.type,
      name: payload.name,
      contentHash: payload.contentHash
    });
  }

  // ==================== PRIVATE: AUDIT ====================

  /**
   * Add entry to audit buffer
   * @private
   */
  _logAudit(entry) {
    this.auditBuffer.push({
      id: uuidv4(),
      workspaceId: this.workspaceId,
      userId: this.userId,
      timestamp: new Date().toISOString(),
      ...entry,
      flags: entry.flags ? JSON.stringify(entry.flags) : null,
      filters: entry.filters ? JSON.stringify(entry.filters) : null
    });

    if (this.auditBuffer.length >= AUDIT_BATCH_SIZE) {
      this._flushAuditBuffer().catch(err => {
        console.error(`${LOG_PREFIX} Audit flush error: ${err.message}`);
      });
    }
  }

  /**
   * Flush audit buffer to Memgraph
   * @private
   */
  async _flushAuditBuffer() {
    if (this.auditBuffer.length === 0) return;

    const entries = [...this.auditBuffer];
    this.auditBuffer = [];

    try {
      for (const entry of entries) {
        await mg().runQuery(
          `MATCH (ws:WorkSpace {id: $workspaceId})
           CREATE (a:ReadAuditEntry $props)
           CREATE (ws)-[:HAS_AUDIT]->(a)`,
          { workspaceId: this.workspaceId, props: entry }
        );
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to flush audit: ${err.message}`);
      // Re-add failed entries (capped to prevent unbounded growth)
      if (this.auditBuffer.length < AUDIT_BATCH_SIZE * 3) {
        this.auditBuffer.unshift(...entries);
      }
    }
  }

  /**
   * Start periodic flush timer
   * @private
   */
  _startPeriodicFlush() {
    this.flushTimer = setInterval(() => {
      this._flushAuditBuffer().catch(() => {});
    }, AUDIT_FLUSH_INTERVAL_MS);

    // Allow Node.js to exit even if timer is active
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  }

  // ==================== PRIVATE: HELPERS ====================

  /**
   * Hash cypher for audit logging
   * @private
   */
  _hashCypher(cypher) {
    return crypto.createHash('sha256').update(cypher).digest('hex').substring(0, 16);
  }

  /**
   * Get KB collection names for Qdrant search
   * @private
   */
  _getKBCollections(namespace) {
    if (namespace) {
      return [KB_COLLECTION_MAP[namespace] || `${namespace}_knowledge`];
    }
    return Object.values(KB_COLLECTION_MAP);
  }
}

/**
 * Factory to create ReadOnlyProxy for a workspace
 * @param {string} workspaceId
 * @param {string} userId
 * @returns {ReadOnlyProxyService}
 */
function createReadOnlyProxy(workspaceId, userId) {
  return new ReadOnlyProxyService(workspaceId, userId);
}

module.exports = {
  ReadOnlyProxyService,
  createReadOnlyProxy,
  ALLOWED_KB_NAMESPACES,
  WRITE_KEYWORDS
};
