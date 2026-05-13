'use strict';

/**
 * SigillumService — Git-like versioning for the Knowledge Graph.
 *
 * Provides snapshot/branch/seal operations over the immutable NodeVersion layer.
 * Analogues: snapshot=commit, branch=branch, seal=tag/release.
 *
 * Tasks covered: P0-004 (snapshots), P0-005 (branches), P0-006 (seals), P0-007 (queries)
 */

const neo4j = require('neo4j-driver');

class SigillumService {
  constructor({ versionVectorService, snapshotRepo, branchRepo, sealRepo, memgraph }) {
    this._vvs = versionVectorService;
    this._snapshots = snapshotRepo;
    this._branches = branchRepo;
    this._seals = sealRepo;
    this._mg = memgraph;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // P0-004: Snapshots
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new snapshot on a branch.
   * Computes the version vector for the given namespace, stores it, advances HEAD.
   */
  async createSnapshot({ branchId, namespace = null, message = '', createdBy = 'system' }) {
    const branch = await this._branches.findById(branchId);
    if (!branch) throw new Error(`Branch not found: ${branchId}`);

    const versionVector = namespace
      ? await this._vvs.computeForNamespace(namespace)
      : await this._vvs.computeForNamespace('CORE');

    const contentHash = this._vvs.computeHash(versionVector);

    // Idempotent: if contentHash matches HEAD, return existing snapshot
    if (branch.headSnapshotId) {
      const head = await this._snapshots.findById(branch.headSnapshotId);
      if (head && head.contentHash === contentHash) {
        return { snapshot: head, changed: false };
      }
    }

    const snapshot = await this._snapshots.create({
      branchId,
      parentSnapshotId: branch.headSnapshotId || null,
      namespace,
      versionVector,
      contentHash,
      message,
      entityCount: versionVector.size,
      createdBy,
    });

    await this._branches.updateHead(branchId, snapshot.snapshotId);

    return { snapshot, changed: true };
  }

  /**
   * Create a snapshot from a specific set of entityIds (partial snapshot).
   */
  async createPartialSnapshot({ branchId, entityIds, message = '', createdBy = 'system' }) {
    const branch = await this._branches.findById(branchId);
    if (!branch) throw new Error(`Branch not found: ${branchId}`);

    const versionVector = await this._vvs.computeForEntities(entityIds, 0);
    const contentHash = this._vvs.computeHash(versionVector);

    const snapshot = await this._snapshots.create({
      branchId,
      parentSnapshotId: branch.headSnapshotId || null,
      namespace: null,
      versionVector,
      contentHash,
      message,
      entityCount: versionVector.size,
      createdBy,
    });

    await this._branches.updateHead(branchId, snapshot.snapshotId);
    return { snapshot, changed: true };
  }

  async getSnapshot(snapshotId) {
    const snapshot = await this._snapshots.findById(snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
    return snapshot;
  }

  async listSnapshots(branchId, limit = 20, offset = 0) {
    return this._snapshots.findByBranch(branchId, limit, offset);
  }

  /**
   * Ensure the main branch exists for a namespace. Creates it if missing.
   */
  async ensureMainBranch(namespace = null) {
    let main = await this._branches.findMain(namespace);
    if (main) return main;

    main = await this._branches.create({
      name: 'main',
      namespace,
      isMain: true,
      createdBy: 'system',
    });
    return main;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // P0-005: Branches
  // ═══════════════════════════════════════════════════════════════════════════

  async createBranch({ name, namespace = null, fromBranchId = null, fromSnapshotId = null, createdBy = 'system' }) {
    // Determine parent snapshot
    let parentSnapshotId = fromSnapshotId;
    let parentBranchId = fromBranchId;

    if (!parentSnapshotId && fromBranchId) {
      const parentBranch = await this._branches.findById(fromBranchId);
      if (!parentBranch) throw new Error(`Source branch not found: ${fromBranchId}`);
      parentSnapshotId = parentBranch.headSnapshotId;
    }

    const branch = await this._branches.create({
      name,
      namespace,
      headSnapshotId: parentSnapshotId || null,
      parentBranchId: parentBranchId || null,
      parentSnapshotId: parentSnapshotId || null,
      createdBy,
      isMain: false,
    });

    return branch;
  }

  async getBranch(branchId) {
    const branch = await this._branches.findById(branchId);
    if (!branch) throw new Error(`Branch not found: ${branchId}`);
    return branch;
  }

  async getBranchByName(name, namespace = null) {
    return this._branches.findByName(name, namespace);
  }

  async listBranches(namespace = null, limit = 50) {
    return this._branches.list(namespace, limit);
  }

  async updateBranchHead(branchId, snapshotId) {
    const branch = await this._branches.findById(branchId);
    if (!branch) throw new Error(`Branch not found: ${branchId}`);
    const snap = await this._snapshots.findById(snapshotId);
    if (!snap) throw new Error(`Snapshot not found: ${snapshotId}`);
    await this._branches.updateHead(branchId, snapshotId);
    return { branchId, headSnapshotId: snapshotId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // P0-006: Seals
  // ═══════════════════════════════════════════════════════════════════════════

  async createSeal({ snapshotId, sealType = 'CHECKPOINT', certifiedBy = 'system', metadata = {} }) {
    const snapshot = await this._snapshots.findById(snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

    // Re-compute hash for verification
    const vv = this._vvs.deserialize(snapshot.versionVector);
    const verificationHash = this._vvs.computeHash(vv);

    const seal = await this._seals.create({
      snapshotId,
      branchId: snapshot.branchId,
      certifiedBy,
      sealType,
      verificationHash,
      metadata,
    });

    return seal;
  }

  async getSeal(sealId) {
    const seal = await this._seals.findById(sealId);
    if (!seal) throw new Error(`Seal not found: ${sealId}`);
    return seal;
  }

  async listSeals(branchId = null, sealType = null, limit = 20) {
    if (branchId) return this._seals.findByBranch(branchId, limit);
    if (sealType) return this._seals.findByType(sealType, limit);
    return this._seals.findByType('CHECKPOINT', limit);
  }

  async verifySeal(sealId) {
    const seal = await this._seals.findById(sealId);
    if (!seal) throw new Error(`Seal not found: ${sealId}`);

    const snapshot = await this._snapshots.findById(seal.snapshotId);
    if (!snapshot) return { valid: false, reason: 'snapshot_missing' };

    const vv = this._vvs.deserialize(snapshot.versionVector);
    const currentHash = this._vvs.computeHash(vv);

    const valid = currentHash === seal.verificationHash;
    return {
      valid,
      sealId,
      snapshotId: seal.snapshotId,
      storedHash: seal.verificationHash,
      currentHash,
      reason: valid ? null : 'hash_mismatch',
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // P0-007: Queries
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Diff two snapshots — what changed between them.
   */
  async diffSnapshots(snapshotId1, snapshotId2) {
    const [s1, s2] = await Promise.all([
      this._snapshots.findById(snapshotId1),
      this._snapshots.findById(snapshotId2),
    ]);
    if (!s1) throw new Error(`Snapshot not found: ${snapshotId1}`);
    if (!s2) throw new Error(`Snapshot not found: ${snapshotId2}`);

    const vv1 = this._vvs.deserialize(s1.versionVector);
    const vv2 = this._vvs.deserialize(s2.versionVector);
    const diff = this._vvs.diff(vv1, vv2);

    return {
      from: { snapshotId: snapshotId1, createdAt: s1.createdAt, message: s1.message },
      to: { snapshotId: snapshotId2, createdAt: s2.createdAt, message: s2.message },
      diff,
      summary: {
        added: diff.added.length,
        removed: diff.removed.length,
        modified: diff.modified.length,
        total: diff.added.length + diff.removed.length + diff.modified.length,
      },
    };
  }

  /**
   * Query the graph as it was at a given snapshot.
   * Resolves entityIds from the version vector, then fetches those NodeVersions.
   */
  async queryAsOfSnapshot(snapshotId, namespace = null) {
    const snapshot = await this._snapshots.findById(snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

    const vv = this._vvs.deserialize(snapshot.versionVector);
    const versionIds = [...vv.values()];

    if (versionIds.length === 0) return { snapshotId, nodes: [] };

    const nsFilter = namespace ? ` AND nv.namespace = '${namespace}'` : '';
    const rows = await this._mg.queryWithNamespace(
      `MATCH (nv:NodeVersion)
       WHERE nv.versionId IN $versionIds${nsFilter}
       RETURN nv.entityId AS entityId, nv.versionId AS versionId,
              nv.namespace AS namespace, nv.nodeType AS nodeType,
              nv.status AS status, nv.versionName AS versionName,
              nv.createdAt AS createdAt`,
      { versionIds }
    );

    return {
      snapshotId,
      message: snapshot.message,
      createdAt: snapshot.createdAt,
      nodes: rows,
    };
  }

  /**
   * Get a specific entity's state at a given snapshot.
   */
  async getEntityAtSnapshot(snapshotId, entityId) {
    const snapshot = await this._snapshots.findById(snapshotId);
    if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);

    const vv = this._vvs.deserialize(snapshot.versionVector);
    const versionId = vv.get(entityId);

    if (!versionId) {
      return { snapshotId, entityId, found: false };
    }

    const rows = await this._mg.queryWithNamespace(
      `MATCH (nv:NodeVersion { versionId: $versionId }) RETURN nv`,
      { versionId }
    );

    if (rows.length === 0) return { snapshotId, entityId, found: false };

    const p = rows[0].nv.properties || rows[0].nv;
    return { snapshotId, entityId, found: true, versionId, node: p };
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

let _instance = null;

function getSigillumService() {
  if (!_instance) {
    const { getVersionVectorService } = require('./version-vector.service');
    const { getSnapshotRepository } = require('./snapshot.repository');
    const { getBranchRepository } = require('./branch.repository');
    const { getSealRepository } = require('./seal.repository');
    const memgraph = require('../memgraph.service');

    _instance = new SigillumService({
      versionVectorService: getVersionVectorService(),
      snapshotRepo: getSnapshotRepository(),
      branchRepo: getBranchRepository(),
      sealRepo: getSealRepository(),
      memgraph,
    });
  }
  return _instance;
}

module.exports = { SigillumService, getSigillumService };
