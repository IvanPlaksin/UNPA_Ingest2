'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

class BranchRepository {
  constructor(memgraph) {
    this._mg = memgraph;
  }

  async create({ name, namespace = null, headSnapshotId = null, parentBranchId = null, parentSnapshotId = null, createdBy = 'system', isMain = false }) {
    const branchId = uuidv4();
    const createdAt = new Date().toISOString();

    await this._mg.queryWithNamespace(
      `CREATE (b:BranchRecord {
         branchId: $branchId,
         name: $name,
         namespace: $namespace,
         headSnapshotId: $headSnapshotId,
         parentBranchId: $parentBranchId,
         parentSnapshotId: $parentSnapshotId,
         createdAt: $createdAt,
         createdBy: $createdBy,
         isMain: $isMain
       })`,
      { branchId, name, namespace, headSnapshotId, parentBranchId, parentSnapshotId, createdAt, createdBy, isMain }
    );

    if (parentBranchId) {
      await this._mg.queryWithNamespace(
        `MATCH (child:BranchRecord { branchId: $branchId })
         MATCH (parent:BranchRecord { branchId: $parentBranchId })
         CREATE (child)-[:BRANCHED_FROM]->(parent)`,
        { branchId, parentBranchId }
      );
    }

    if (headSnapshotId) {
      await this._mg.queryWithNamespace(
        `MATCH (b:BranchRecord { branchId: $branchId })
         MATCH (s:SnapshotRecord { snapshotId: $headSnapshotId })
         CREATE (b)-[:HAS_SNAPSHOT]->(s)`,
        { branchId, headSnapshotId }
      );
    }

    return { branchId, name, namespace, headSnapshotId, parentBranchId, parentSnapshotId, createdAt, createdBy, isMain };
  }

  async findById(branchId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (b:BranchRecord { branchId: $branchId }) RETURN b`,
      { branchId }
    );
    return rows.length > 0 ? this._map(rows[0].b) : null;
  }

  async findByName(name, namespace = null) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (b:BranchRecord { name: $name })
       WHERE ($namespace IS NULL OR b.namespace = $namespace)
       RETURN b LIMIT 1`,
      { name, namespace }
    );
    return rows.length > 0 ? this._map(rows[0].b) : null;
  }

  async findMain(namespace = null) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (b:BranchRecord { isMain: true })
       WHERE ($namespace IS NULL OR b.namespace = $namespace)
       RETURN b LIMIT 1`,
      { namespace }
    );
    return rows.length > 0 ? this._map(rows[0].b) : null;
  }

  async list(namespace = null, limit = 50) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (b:BranchRecord)
       WHERE ($namespace IS NULL OR b.namespace = $namespace)
       RETURN b ORDER BY b.isMain DESC, b.createdAt DESC
       LIMIT $limit`,
      { namespace, limit: neo4j.int(limit) }
    );
    return rows.map(r => this._map(r.b));
  }

  async updateHead(branchId, headSnapshotId) {
    await this._mg.queryWithNamespace(
      `MATCH (b:BranchRecord { branchId: $branchId })
       SET b.headSnapshotId = $headSnapshotId
       WITH b
       OPTIONAL MATCH (b)-[old:HAS_SNAPSHOT]->()
       DELETE old
       WITH b
       MATCH (s:SnapshotRecord { snapshotId: $headSnapshotId })
       CREATE (b)-[:HAS_SNAPSHOT]->(s)`,
      { branchId, headSnapshotId }
    );
  }

  _map(node) {
    const p = node.properties || node;
    return {
      branchId: p.branchId,
      name: p.name,
      namespace: p.namespace || null,
      headSnapshotId: p.headSnapshotId || null,
      parentBranchId: p.parentBranchId || null,
      parentSnapshotId: p.parentSnapshotId || null,
      createdAt: p.createdAt,
      createdBy: p.createdBy,
      isMain: p.isMain === true || p.isMain === 'true',
    };
  }
}

let _instance = null;
function getBranchRepository() {
  if (!_instance) {
    const mg = require('../memgraph.service');
    _instance = new BranchRepository(mg);
  }
  return _instance;
}

module.exports = { BranchRepository, getBranchRepository };
