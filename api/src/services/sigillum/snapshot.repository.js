'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

class SnapshotRepository {
  constructor(memgraph) {
    this._mg = memgraph;
  }

  async create({ branchId, parentSnapshotId = null, namespace = null, versionVector, contentHash, message = '', entityCount = 0, createdBy = 'system' }) {
    const snapshotId = uuidv4();
    const createdAt = new Date().toISOString();
    const versionVectorJson = JSON.stringify(Object.fromEntries(versionVector));

    await this._mg.queryWithNamespace(
      `CREATE (s:SnapshotRecord {
         snapshotId: $snapshotId,
         branchId: $branchId,
         parentSnapshotId: $parentSnapshotId,
         namespace: $namespace,
         versionVector: $versionVectorJson,
         contentHash: $contentHash,
         message: $message,
         entityCount: $entityCount,
         createdAt: $createdAt,
         createdBy: $createdBy
       })`,
      { snapshotId, branchId, parentSnapshotId, namespace, versionVectorJson, contentHash, message, entityCount: neo4j.int(entityCount), createdAt, createdBy }
    );

    if (parentSnapshotId) {
      await this._mg.queryWithNamespace(
        `MATCH (child:SnapshotRecord { snapshotId: $snapshotId })
         MATCH (parent:SnapshotRecord { snapshotId: $parentSnapshotId })
         CREATE (child)-[:INHERITS_FROM]->(parent)`,
        { snapshotId, parentSnapshotId }
      );
    }

    return { snapshotId, branchId, parentSnapshotId, namespace, contentHash, message, entityCount, createdAt, createdBy };
  }

  async findById(snapshotId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:SnapshotRecord { snapshotId: $snapshotId }) RETURN s`,
      { snapshotId }
    );
    return rows.length > 0 ? this._map(rows[0].s) : null;
  }

  async findByBranch(branchId, limit = 20, offset = 0) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:SnapshotRecord { branchId: $branchId })
       RETURN s ORDER BY s.createdAt DESC
       SKIP $offset LIMIT $limit`,
      { branchId, limit: neo4j.int(limit), offset: neo4j.int(offset) }
    );
    return rows.map(r => this._map(r.s));
  }

  async findByContentHash(contentHash) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:SnapshotRecord { contentHash: $contentHash }) RETURN s LIMIT 1`,
      { contentHash }
    );
    return rows.length > 0 ? this._map(rows[0].s) : null;
  }

  async getAncestors(snapshotId, maxDepth = 10) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:SnapshotRecord { snapshotId: $snapshotId })-[:INHERITS_FROM*1..${maxDepth}]->(anc:SnapshotRecord)
       RETURN anc ORDER BY anc.createdAt DESC`,
      { snapshotId }
    );
    return rows.map(r => this._map(r.anc));
  }

  _map(node) {
    const p = node.properties || node;
    let versionVector;
    try {
      versionVector = JSON.parse(p.versionVector || '{}');
    } catch {
      versionVector = {};
    }
    return {
      snapshotId: p.snapshotId,
      branchId: p.branchId,
      parentSnapshotId: p.parentSnapshotId || null,
      namespace: p.namespace || null,
      versionVector,
      contentHash: p.contentHash,
      message: p.message || '',
      entityCount: typeof p.entityCount === 'object' ? p.entityCount.toNumber() : (p.entityCount || 0),
      createdAt: p.createdAt,
      createdBy: p.createdBy,
    };
  }
}

let _instance = null;
function getSnapshotRepository() {
  if (!_instance) {
    const mg = require('../memgraph.service');
    _instance = new SnapshotRepository(mg);
  }
  return _instance;
}

module.exports = { SnapshotRepository, getSnapshotRepository };
