// ═══════════════════════════════════════════════════════════════════════════
// Sigillum Schema — Git-like Versioning for Knowledge Graph
//
// Node Types:
//   SnapshotRecord  — immutable version vector at a point in time
//   BranchRecord    — named branch tracking HEAD snapshot
//   SealRecord      — certified, immutable snapshot (release/audit)
//
// Edge Types:
//   INHERITS_FROM   — (SnapshotRecord)->(SnapshotRecord) parent chain
//   HAS_SNAPSHOT    — (BranchRecord)->(SnapshotRecord) HEAD pointer
//   BRANCHED_FROM   — (BranchRecord)->(BranchRecord) branch origin
//   CERTIFIES       — (SealRecord)->(SnapshotRecord) seal binding
//
// Namespace: SIGILLUM
// ═══════════════════════════════════════════════════════════════════════════

// === SnapshotRecord ===
// Properties: snapshotId, branchId, parentSnapshotId, namespace,
//   versionVector (JSON string: Map<entityId, versionId>),
//   contentHash (SHA-256 of sorted versionVector),
//   message, entityCount, createdAt, createdBy
CREATE CONSTRAINT ON (s:SnapshotRecord) ASSERT s.snapshotId IS UNIQUE;
CREATE INDEX ON :SnapshotRecord(branchId);
CREATE INDEX ON :SnapshotRecord(parentSnapshotId);
CREATE INDEX ON :SnapshotRecord(contentHash);
CREATE INDEX ON :SnapshotRecord(namespace);
CREATE INDEX ON :SnapshotRecord(createdAt);
CREATE INDEX ON :SnapshotRecord(createdBy);

// === BranchRecord ===
// Properties: branchId, name, namespace, headSnapshotId,
//   parentBranchId, parentSnapshotId,
//   createdAt, createdBy, isMain (boolean)
CREATE CONSTRAINT ON (b:BranchRecord) ASSERT b.branchId IS UNIQUE;
CREATE INDEX ON :BranchRecord(name);
CREATE INDEX ON :BranchRecord(namespace);
CREATE INDEX ON :BranchRecord(headSnapshotId);
CREATE INDEX ON :BranchRecord(parentBranchId);
CREATE INDEX ON :BranchRecord(createdAt);
CREATE INDEX ON :BranchRecord(isMain);

// === SealRecord ===
// Properties: sealId, snapshotId, branchId, certifiedBy, certifiedAt,
//   sealType (RELEASE|CHECKPOINT|AUDIT|EXPORT),
//   verificationHash, metadata (JSON string)
CREATE CONSTRAINT ON (s:SealRecord) ASSERT s.sealId IS UNIQUE;
CREATE INDEX ON :SealRecord(snapshotId);
CREATE INDEX ON :SealRecord(branchId);
CREATE INDEX ON :SealRecord(sealType);
CREATE INDEX ON :SealRecord(certifiedAt);
CREATE INDEX ON :SealRecord(certifiedBy);
