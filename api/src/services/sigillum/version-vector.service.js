'use strict';

/**
 * VersionVectorService — computes version vectors from the immutable graph layer.
 *
 * A version vector is a Map<entityId, versionId> that precisely describes
 * the state of a set of graph entities at a point in time. The vector is
 * computed by collecting the currently ACTIVE NodeVersion for each entity.
 *
 * Key operations:
 *   computeForNamespace   — all entities in a namespace
 *   computeForSubgraph    — entities returned by an arbitrary Cypher query
 *   computeForEntities    — specific entityIds (+ optional depth expansion)
 *   diff                  — compare two vectors → {added, removed, modified}
 *   computeHash           — SHA-256 of the sorted vector (deterministic)
 */

const crypto = require('crypto');
const neo4j = require('neo4j-driver');

class VersionVectorService {
  /**
   * @param {Object} memgraph — MemgraphService instance (queryWithNamespace)
   */
  constructor(memgraph) {
    this._mg = memgraph;
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Build version vector for all ACTIVE entities in a namespace.
   * @param {string} namespace
   * @returns {Promise<Map<string, string>>} entityId → versionId
   */
  async computeForNamespace(namespace) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (nv:NodeVersion { namespace: $namespace, status: 'ACTIVE' })
       RETURN nv.entityId AS entityId, nv.versionId AS versionId`,
      { namespace }
    );
    return this._rowsToMap(rows);
  }

  /**
   * Build version vector from entities returned by a Cypher query.
   * The query MUST return a column named `entityId`.
   * @param {string} cypher — query that yields { entityId }
   * @param {Object} params — query parameters
   * @returns {Promise<Map<string, string>>}
   */
  async computeForSubgraph(cypher, params = {}) {
    const idRows = await this._mg.queryWithNamespace(cypher, params);
    const entityIds = idRows.map(r => r.entityId).filter(Boolean);
    if (entityIds.length === 0) return new Map();
    return this._fetchActiveVersions(entityIds);
  }

  /**
   * Build version vector for a specific set of entityIds.
   * @param {string[]} entityIds
   * @param {number} depth — 0 = exact set only; >0 = expand depth hops via RELATED edges
   * @returns {Promise<Map<string, string>>}
   */
  async computeForEntities(entityIds, depth = 0) {
    if (!entityIds || entityIds.length === 0) return new Map();

    let ids = [...entityIds];

    if (depth > 0) {
      // Use plain integer — Memgraph requires literal range in variable-length paths
      const expandRows = await this._mg.queryWithNamespace(
        `MATCH (nv:NodeVersion)
         WHERE nv.entityId IN $entityIds AND nv.status = 'ACTIVE'
         WITH nv
         MATCH (nv)-[:RELATED*1..${Math.min(depth, 3)}]-(neighbor:NodeVersion)
         WHERE neighbor.status = 'ACTIVE'
         RETURN DISTINCT neighbor.entityId AS entityId`,
        { entityIds }
      );
      const neighborIds = expandRows.map(r => r.entityId).filter(Boolean);
      ids = [...new Set([...ids, ...neighborIds])];
    }

    return this._fetchActiveVersions(ids);
  }

  /**
   * Compare two version vectors.
   * @param {Map<string, string>} vv1
   * @param {Map<string, string>} vv2
   * @returns {{ added: string[], removed: string[], modified: string[] }}
   *   added    — entityIds present in vv2 but not vv1
   *   removed  — entityIds present in vv1 but not vv2
   *   modified — entityIds present in both but with different versionId
   */
  diff(vv1, vv2) {
    const added = [];
    const removed = [];
    const modified = [];

    for (const [id, ver] of vv2) {
      if (!vv1.has(id)) {
        added.push(id);
      } else if (vv1.get(id) !== ver) {
        modified.push(id);
      }
    }

    for (const id of vv1.keys()) {
      if (!vv2.has(id)) removed.push(id);
    }

    return { added, removed, modified };
  }

  /**
   * Compute a deterministic SHA-256 hash of a version vector.
   * Sorts by entityId so identical vectors always produce the same hash.
   * @param {Map<string, string>} versionVector
   * @returns {string} hex digest
   */
  computeHash(versionVector) {
    const sorted = [...versionVector.entries()]
      .sort(([a], [b]) => a.localeCompare(b));
    const payload = JSON.stringify(sorted);
    return crypto.createHash('sha256').update(payload).digest('hex');
  }

  /**
   * Serialize a version vector to a plain object for storage.
   * @param {Map<string, string>} versionVector
   * @returns {Object}
   */
  serialize(versionVector) {
    return Object.fromEntries(versionVector);
  }

  /**
   * Deserialize a stored object back into a Map.
   * @param {Object} obj
   * @returns {Map<string, string>}
   */
  deserialize(obj) {
    return new Map(Object.entries(obj || {}));
  }

  // ─── Internals ───────────────────────────────────────────────────────────────

  async _fetchActiveVersions(entityIds) {
    if (entityIds.length === 0) return new Map();

    const rows = await this._mg.queryWithNamespace(
      `MATCH (nv:NodeVersion)
       WHERE nv.entityId IN $entityIds AND nv.status = 'ACTIVE'
       RETURN nv.entityId AS entityId, nv.versionId AS versionId`,
      { entityIds }
    );
    return this._rowsToMap(rows);
  }

  _rowsToMap(rows) {
    const map = new Map();
    for (const row of rows) {
      if (row.entityId && row.versionId) {
        map.set(String(row.entityId), String(row.versionId));
      }
    }
    return map;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance = null;

function getVersionVectorService() {
  if (!_instance) {
    const memgraphService = require('../memgraph.service');
    _instance = new VersionVectorService(memgraphService);
  }
  return _instance;
}

module.exports = { VersionVectorService, getVersionVectorService };
