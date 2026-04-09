'use strict';

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Version Manager — Bridge Pattern (NodeVersion ↔ Domain)
 * CODEX-VERSION §3.2
 *
 * Bridges between:
 * - ImmutableGraph (NodeVersion/EdgeVersion with SUPERSEDES chains)
 * - Domain layer (direct Memgraph nodes like BusinessRule, Table, etc.)
 *
 * Key responsibilities:
 * 1. Create relationships that auto-target ACTIVE versions
 * 2. Relink incoming edges when a version is superseded
 * 3. Get active version for an entity
 * 4. Soft delete with tombstones (CC-021)
 */

const memgraphService = require('./memgraph.service');

class VersionManager {
  constructor(memgraph) {
    this.memgraph = memgraph || memgraphService;
  }

  /**
   * Get the currently ACTIVE NodeVersion for an entity.
   * @param {string} entityId - Stable entity identifier
   * @returns {Promise<Object|null>} Active version or null
   */
  async getActiveVersion(entityId) {
    const result = await this.memgraph.runQuery(`
      MATCH (v:NodeVersion {entityId: $entityId, status: 'ACTIVE'})
      RETURN v
    `, { entityId });

    return result[0]?.v?.properties || result[0]?.v || null;
  }

  /**
   * Get the previous (SUPERSEDED) version for an entity.
   * Returns the most recently superseded version.
   * @param {string} entityId - Stable entity identifier
   * @returns {Promise<Object|null>}
   */
  async getPreviousVersion(entityId) {
    const result = await this.memgraph.runQuery(`
      MATCH (v:NodeVersion {entityId: $entityId, status: 'SUPERSEDED'})
      RETURN v
      ORDER BY v.sequenceNumber DESC
      LIMIT 1
    `, { entityId });

    return result[0]?.v?.properties || result[0]?.v || null;
  }

  /**
   * Create a relationship that targets the ACTIVE version of an entity.
   * Stores the stable entityId in edge properties for relinking on supersede.
   *
   * CODEX-VERSION §3.2: Edges should use stable entityId for relink capability.
   *
   * @param {string} fromId - Source node ID (can be any node)
   * @param {string} toEntityId - Target entity's stable entityId
   * @param {string} relType - Relationship type
   * @param {Object} props - Additional relationship properties
   * @returns {Promise<Object>} Created relationship info
   */
  async createRelationToVersioned(fromId, toEntityId, relType, props = {}) {
    const active = await this.getActiveVersion(toEntityId);

    if (!active) {
      const err = new Error(`No ACTIVE version found for entity '${toEntityId}'`);
      err.code = 'NO_ACTIVE_VERSION';
      err.entityId = toEntityId;
      throw err;
    }

    const versionId = active.versionId;

    await this.memgraph.runQuery(`
      MATCH (from {id: $fromId}), (to:NodeVersion {versionId: $versionId})
      MERGE (from)-[r:${relType}]->(to)
      SET r += $props,
          r.targetEntityId = $toEntityId,
          r.linkedAt = $now
      RETURN r
    `, {
      fromId,
      versionId,
      toEntityId,
      props,
      now: new Date().toISOString(),
    });

    return { fromId, toVersionId: versionId, toEntityId, relType };
  }

  /**
   * Relink all incoming edges from an old version to a new version.
   * Only relinks edges that have a `targetEntityId` matching the entity.
   *
   * CODEX-VERSION §3.2: On supersede, incoming edges are migrated to new version.
   *
   * @param {string} oldVersionId - Old version being superseded
   * @param {string} newVersionId - New ACTIVE version
   * @param {string} entityId - Stable entity identifier
   * @returns {Promise<number>} Number of edges relinked
   */
  async relinkOnSupersede(oldVersionId, newVersionId, entityId) {
    // Find all incoming edges to the old version that reference this entity
    const incoming = await this.memgraph.runQuery(`
      MATCH (source)-[r]->(old:NodeVersion {versionId: $oldVersionId})
      WHERE r.targetEntityId = $entityId
      RETURN source.id as sourceId, type(r) as relType, properties(r) as props
    `, { oldVersionId, entityId });

    if (incoming.length === 0) return 0;

    let relinked = 0;
    const now = new Date().toISOString();

    for (const edge of incoming) {
      const { sourceId, relType, props } = edge;
      if (!sourceId || !relType) continue;

      // Create new edge to new version
      await this.memgraph.runQuery(`
        MATCH (s {id: $sourceId}), (nv:NodeVersion {versionId: $newVersionId})
        MERGE (s)-[r:${relType}]->(nv)
        SET r += $props,
            r.relinkedAt = $now,
            r.previousVersionId = $oldVersionId
        RETURN r
      `, {
        sourceId,
        newVersionId,
        props: props || {},
        now,
        oldVersionId,
      });

      // Remove old edge
      await this.memgraph.runQuery(`
        MATCH (s {id: $sourceId})-[r]->(old:NodeVersion {versionId: $oldVersionId})
        WHERE type(r) = $relType AND r.targetEntityId = $entityId
        DELETE r
      `, { sourceId, oldVersionId, relType, entityId });

      relinked++;
    }

    return relinked;
  }

  /**
   * Supersede an entity with new data and relink incoming edges.
   * Combines version creation + edge relinking in one operation.
   *
   * @param {string} entityId - Stable entity identifier
   * @param {Object} newProperties - New properties for the updated version
   * @param {string} changeReason - Why this change was made
   * @param {string} changedBy - Who made the change
   * @returns {Promise<{newVersion: Object, relinkedEdges: number}>}
   */
  async supersede(entityId, newProperties, changeReason, changedBy = 'system') {
    const activeVersion = await this.getActiveVersion(entityId);
    if (!activeVersion) {
      const err = new Error(`No ACTIVE version found for entity '${entityId}'`);
      err.code = 'NO_ACTIVE_VERSION';
      throw err;
    }

    const now = new Date().toISOString();
    const newVersionId = uuidv4();

    // Compute hashes
    const mergedProperties = { ...activeVersion.properties, ...newProperties };
    const contentHash = crypto.createHash('sha256')
      .update(JSON.stringify(mergedProperties, Object.keys(mergedProperties).sort()))
      .digest('hex');
    const previousHash = activeVersion.contentHash || null;
    const chainHash = previousHash
      ? crypto.createHash('sha256').update(contentHash + previousHash).digest('hex')
      : contentHash;

    // Mark old version as SUPERSEDED
    await this.memgraph.runQuery(`
      MATCH (old:NodeVersion {versionId: $oldVersionId})
      SET old.status = 'SUPERSEDED',
          old.ttEnd = $now,
          old.supersededById = $newVersionId
      RETURN old
    `, {
      oldVersionId: activeVersion.versionId,
      now,
      newVersionId,
    });

    // Create new version
    const seq = (activeVersion.sequenceNumber || 0) + 1;
    await this.memgraph.runQuery(`
      CREATE (v:NodeVersion {
        versionId: $versionId,
        entityId: $entityId,
        namespace: $namespace,
        sequenceNumber: $seq,
        status: 'ACTIVE',
        ttStart: $now,
        ttEnd: null,
        vtStart: $now,
        vtEnd: null,
        previousVersionId: $previousVersionId,
        supersededById: null,
        changeType: 'UPDATE',
        changeReason: $changeReason,
        changedBy: $changedBy,
        contentHash: $contentHash,
        previousHash: $previousHash,
        chainHash: $chainHash,
        nodeType: $nodeType
      })
      SET v.properties = $properties
      RETURN v
    `, {
      versionId: newVersionId,
      entityId,
      namespace: activeVersion.namespace || 'CORE',
      seq,
      now,
      previousVersionId: activeVersion.versionId,
      changeReason,
      changedBy,
      contentHash,
      previousHash,
      chainHash,
      nodeType: activeVersion.nodeType || 'Unknown',
      properties: mergedProperties,
    });

    // Create SUPERSEDES edge
    await this.memgraph.runQuery(`
      MATCH (new:NodeVersion {versionId: $newVersionId}),
            (old:NodeVersion {versionId: $oldVersionId})
      CREATE (new)-[:SUPERSEDES {reason: $changeReason, at: $now}]->(old)
    `, {
      newVersionId,
      oldVersionId: activeVersion.versionId,
      changeReason,
      now,
    });

    // Relink incoming edges
    const relinkedEdges = await this.relinkOnSupersede(
      activeVersion.versionId,
      newVersionId,
      entityId
    );

    return {
      newVersion: {
        versionId: newVersionId,
        entityId,
        sequenceNumber: seq,
        contentHash,
        chainHash,
      },
      oldVersionId: activeVersion.versionId,
      relinkedEdges,
    };
  }

  /**
   * Get full version lineage for an entity (all versions, ordered).
   * @param {string} entityId
   * @returns {Promise<Array>}
   */
  async getLineage(entityId) {
    const result = await this.memgraph.runQuery(`
      MATCH (v:NodeVersion {entityId: $entityId})
      RETURN v
      ORDER BY v.sequenceNumber ASC
    `, { entityId });

    return result.map(r => r.v?.properties || r.v);
  }

  /**
   * Count active versions across all entities in a namespace.
   * @param {string} namespace
   * @returns {Promise<number>}
   */
  async countActiveVersions(namespace) {
    const result = await this.memgraph.runQuery(`
      MATCH (v:NodeVersion {namespace: $namespace, status: 'ACTIVE'})
      RETURN count(v) as total
    `, { namespace });

    return result[0]?.total ?? 0;
  }

  // =========================================================================
  // TOMBSTONES — CODEX-VERSION §3.6
  // =========================================================================

  /**
   * Soft-delete an entity by creating a Tombstone node.
   * The entity can be restored within 90 days.
   *
   * @param {string} entityId - Stable entity identifier
   * @param {string} reason - Why the entity is being deleted
   * @param {string} deletedBy - Who initiated the delete
   * @returns {Promise<Object>} Tombstone record
   */
  async softDelete(entityId, reason, deletedBy = 'system') {
    const activeVersion = await this.getActiveVersion(entityId);
    if (!activeVersion) {
      const err = new Error(`No ACTIVE version found for entity '${entityId}'`);
      err.code = 'NO_ACTIVE_VERSION';
      throw err;
    }

    const now = new Date();
    const restoreDeadline = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days

    const tombstone = {
      tombstoneId: uuidv4(),
      entityType: 'NODE',
      entityId,
      lastVersionId: activeVersion.versionId,
      reason,
      deletedAt: now.toISOString(),
      deletedBy,
      restorable: true,
      restoreDeadline: restoreDeadline.toISOString(),
    };

    // Create tombstone node
    await this.memgraph.runQuery(`
      CREATE (t:Tombstone {
        tombstoneId: $tombstoneId,
        entityType: $entityType,
        entityId: $entityId,
        lastVersionId: $lastVersionId,
        reason: $reason,
        deletedAt: $deletedAt,
        deletedBy: $deletedBy,
        restorable: $restorable,
        restoreDeadline: $restoreDeadline
      })
      RETURN t
    `, tombstone);

    // Mark active version as DELETED
    await this.memgraph.runQuery(`
      MATCH (v:NodeVersion {versionId: $versionId})
      SET v.status = 'DELETED', v.deletedAt = $now
      RETURN v
    `, { versionId: activeVersion.versionId, now: tombstone.deletedAt });

    // Orphan connected edges
    await this.memgraph.runQuery(`
      MATCH (v:NodeVersion {entityId: $entityId})-[r]-()
      WHERE r.status IS NULL OR r.status = 'ACTIVE'
      SET r.status = 'ORPHANED', r.orphanedAt = $now
    `, { entityId, now: tombstone.deletedAt });

    return tombstone;
  }

  /**
   * Restore a soft-deleted entity from its tombstone.
   * Only works within the 90-day restore window.
   *
   * @param {string} tombstoneId - Tombstone identifier
   * @param {string} restoredBy - Who initiated the restore
   * @returns {Promise<{ restored: boolean, entityId: string }>}
   */
  async restore(tombstoneId, restoredBy = 'system') {
    const tombstone = await this._getTombstone(tombstoneId);

    if (!tombstone) {
      const err = new Error(`Tombstone '${tombstoneId}' not found`);
      err.code = 'TOMBSTONE_NOT_FOUND';
      throw err;
    }

    if (!tombstone.restorable) {
      const err = new Error(`Tombstone '${tombstoneId}' is not restorable`);
      err.code = 'TOMBSTONE_NOT_RESTORABLE';
      throw err;
    }

    if (new Date() > new Date(tombstone.restoreDeadline)) {
      const err = new Error(`Restore deadline passed for tombstone '${tombstoneId}'`);
      err.code = 'RESTORE_DEADLINE_PASSED';
      throw err;
    }

    const now = new Date().toISOString();

    // Restore version to ACTIVE
    await this.memgraph.runQuery(`
      MATCH (v:NodeVersion {versionId: $versionId})
      SET v.status = 'ACTIVE', v.deletedAt = null
      RETURN v
    `, { versionId: tombstone.lastVersionId });

    // Restore orphaned edges
    await this.memgraph.runQuery(`
      MATCH (v:NodeVersion {entityId: $entityId})-[r {status: 'ORPHANED'}]-()
      SET r.status = 'ACTIVE', r.orphanedAt = null
    `, { entityId: tombstone.entityId });

    // Mark tombstone as consumed
    await this.memgraph.runQuery(`
      MATCH (t:Tombstone {tombstoneId: $tombstoneId})
      SET t.restorable = false,
          t.restoredAt = $now,
          t.restoredBy = $restoredBy
      RETURN t
    `, { tombstoneId, now, restoredBy });

    return { restored: true, entityId: tombstone.entityId };
  }

  /**
   * Expire tombstones past their restore deadline.
   * Should be called periodically (e.g., daily cron).
   *
   * @returns {Promise<number>} Number of expired tombstones
   */
  async expireTombstones() {
    const now = new Date().toISOString();

    const result = await this.memgraph.runQuery(`
      MATCH (t:Tombstone)
      WHERE t.restorable = true AND t.restoreDeadline < $now
      SET t.restorable = false, t.expiredAt = $now
      RETURN count(t) as count
    `, { now });

    return result[0]?.count ?? 0;
  }

  /**
   * Get a tombstone by ID.
   * @private
   */
  async _getTombstone(tombstoneId) {
    const result = await this.memgraph.runQuery(`
      MATCH (t:Tombstone {tombstoneId: $tombstoneId})
      RETURN t
    `, { tombstoneId });

    return result[0]?.t?.properties || result[0]?.t || null;
  }

  /**
   * List all restorable tombstones (for admin UI).
   * @returns {Promise<Array>}
   */
  async listRestorableTombstones() {
    const result = await this.memgraph.runQuery(`
      MATCH (t:Tombstone {restorable: true})
      WHERE t.restoreDeadline > $now
      RETURN t
      ORDER BY t.deletedAt DESC
    `, { now: new Date().toISOString() });

    return result.map(r => r.t?.properties || r.t);
  }
}

// Singleton
let _instance = null;
function getVersionManager() {
  if (!_instance) {
    _instance = new VersionManager();
  }
  return _instance;
}

module.exports = { VersionManager, getVersionManager };
