'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

const SEAL_TYPES = ['RELEASE', 'CHECKPOINT', 'AUDIT', 'EXPORT'];

class SealRepository {
  constructor(memgraph) {
    this._mg = memgraph;
  }

  async create({ snapshotId, branchId, certifiedBy = 'system', sealType = 'CHECKPOINT', verificationHash, metadata = {} }) {
    if (!SEAL_TYPES.includes(sealType)) {
      throw new Error(`Invalid sealType: ${sealType}. Must be one of: ${SEAL_TYPES.join(', ')}`);
    }

    const sealId = uuidv4();
    const certifiedAt = new Date().toISOString();
    const metadataJson = JSON.stringify(metadata);

    await this._mg.queryWithNamespace(
      `CREATE (s:SealRecord {
         sealId: $sealId,
         snapshotId: $snapshotId,
         branchId: $branchId,
         certifiedBy: $certifiedBy,
         certifiedAt: $certifiedAt,
         sealType: $sealType,
         verificationHash: $verificationHash,
         metadata: $metadataJson
       })`,
      { sealId, snapshotId, branchId, certifiedBy, certifiedAt, sealType, verificationHash, metadataJson }
    );

    await this._mg.queryWithNamespace(
      `MATCH (seal:SealRecord { sealId: $sealId })
       MATCH (snap:SnapshotRecord { snapshotId: $snapshotId })
       CREATE (seal)-[:CERTIFIES]->(snap)`,
      { sealId, snapshotId }
    );

    return { sealId, snapshotId, branchId, certifiedBy, certifiedAt, sealType, verificationHash, metadata };
  }

  async findById(sealId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:SealRecord { sealId: $sealId }) RETURN s`,
      { sealId }
    );
    return rows.length > 0 ? this._map(rows[0].s) : null;
  }

  async findBySnapshot(snapshotId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:SealRecord { snapshotId: $snapshotId }) RETURN s ORDER BY s.certifiedAt DESC`,
      { snapshotId }
    );
    return rows.map(r => this._map(r.s));
  }

  async findByBranch(branchId, limit = 20) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:SealRecord { branchId: $branchId })
       RETURN s ORDER BY s.certifiedAt DESC LIMIT $limit`,
      { branchId, limit: neo4j.int(limit) }
    );
    return rows.map(r => this._map(r.s));
  }

  async findByType(sealType, limit = 50) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:SealRecord { sealType: $sealType })
       RETURN s ORDER BY s.certifiedAt DESC LIMIT $limit`,
      { sealType, limit: neo4j.int(limit) }
    );
    return rows.map(r => this._map(r.s));
  }

  _map(node) {
    const p = node.properties || node;
    let metadata;
    try {
      metadata = JSON.parse(p.metadata || '{}');
    } catch {
      metadata = {};
    }
    return {
      sealId: p.sealId,
      snapshotId: p.snapshotId,
      branchId: p.branchId,
      certifiedBy: p.certifiedBy,
      certifiedAt: p.certifiedAt,
      sealType: p.sealType,
      verificationHash: p.verificationHash,
      metadata,
    };
  }
}

let _instance = null;
function getSealRepository() {
  if (!_instance) {
    const mg = require('../memgraph.service');
    _instance = new SealRepository(mg);
  }
  return _instance;
}

module.exports = { SealRepository, getSealRepository, SEAL_TYPES };
