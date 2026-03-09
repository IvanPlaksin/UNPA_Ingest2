// ============================================================================
// Immutable Graph Architecture - Memgraph Schema
// UN ProjectAdvisor - Bi-temporal versioned graph system
// ============================================================================

// === CONSTRAINTS ===
// Unique constraints for primary identifiers

CREATE CONSTRAINT ON (n:NodeVersion) ASSERT n.versionId IS UNIQUE;
CREATE CONSTRAINT ON (e:EdgeVersion) ASSERT e.versionId IS UNIQUE;
CREATE CONSTRAINT ON (ns:NamespaceConfig) ASSERT ns.namespaceId IS UNIQUE;
CREATE CONSTRAINT ON (g:GodModeSession) ASSERT g.sessionId IS UNIQUE;
CREATE CONSTRAINT ON (a:GodModeAuditRecord) ASSERT a.recordId IS UNIQUE;
CREATE CONSTRAINT ON (t:Tombstone) ASSERT t.tombstoneId IS UNIQUE;
CREATE CONSTRAINT ON (p:PendingDeletion) ASSERT p.pendingId IS UNIQUE;
CREATE CONSTRAINT ON (m:MergeRecord) ASSERT m.mergeId IS UNIQUE;

// === INDEXES FOR NodeVersion ===
// Performance indexes for common query patterns

CREATE INDEX ON :NodeVersion(entityId);
CREATE INDEX ON :NodeVersion(status);
CREATE INDEX ON :NodeVersion(namespace);
CREATE INDEX ON :NodeVersion(sequenceNumber);
CREATE INDEX ON :NodeVersion(versionName);
CREATE INDEX ON :NodeVersion(nodeType);
CREATE INDEX ON :NodeVersion(ttStart);
CREATE INDEX ON :NodeVersion(vtStart);
CREATE INDEX ON :NodeVersion(changedBy);
CREATE INDEX ON :NodeVersion(contentHash);
CREATE INDEX ON :NodeVersion(chainHash);

// Composite indexes for bi-temporal queries
CREATE INDEX ON :NodeVersion(entityId, status);
CREATE INDEX ON :NodeVersion(namespace, status);
CREATE INDEX ON :NodeVersion(namespace, nodeType);
CREATE INDEX ON :NodeVersion(entityId, ttStart);
CREATE INDEX ON :NodeVersion(entityId, vtStart);

// === INDEXES FOR EdgeVersion ===

CREATE INDEX ON :EdgeVersion(edgeId);
CREATE INDEX ON :EdgeVersion(status);
CREATE INDEX ON :EdgeVersion(sourceEntityId);
CREATE INDEX ON :EdgeVersion(targetEntityId);
CREATE INDEX ON :EdgeVersion(edgeType);
CREATE INDEX ON :EdgeVersion(namespace);
CREATE INDEX ON :EdgeVersion(sequenceNumber);
CREATE INDEX ON :EdgeVersion(orphanedReason);
CREATE INDEX ON :EdgeVersion(ttStart);
CREATE INDEX ON :EdgeVersion(vtStart);

// Composite indexes for edge queries
CREATE INDEX ON :EdgeVersion(edgeId, status);
CREATE INDEX ON :EdgeVersion(sourceEntityId, status);
CREATE INDEX ON :EdgeVersion(targetEntityId, status);
CREATE INDEX ON :EdgeVersion(namespace, edgeType);

// === INDEXES FOR God Mode ===

CREATE INDEX ON :GodModeSession(userId);
CREATE INDEX ON :GodModeSession(isActive);
CREATE INDEX ON :GodModeSession(activatedAt);
CREATE INDEX ON :GodModeSession(autoDisableAt);

CREATE INDEX ON :GodModeAuditRecord(sessionId);
CREATE INDEX ON :GodModeAuditRecord(performedAt);
CREATE INDEX ON :GodModeAuditRecord(actionType);
CREATE INDEX ON :GodModeAuditRecord(entityId);

// === INDEXES FOR Tombstone and Recovery ===

CREATE INDEX ON :Tombstone(originalId);
CREATE INDEX ON :Tombstone(entityType);
CREATE INDEX ON :Tombstone(recoverableUntil);
CREATE INDEX ON :Tombstone(recovered);
CREATE INDEX ON :Tombstone(deletedAt);

CREATE INDEX ON :PendingDeletion(entityId);
CREATE INDEX ON :PendingDeletion(confirmDeadline);
CREATE INDEX ON :PendingDeletion(confirmed);
CREATE INDEX ON :PendingDeletion(markedBy);

// === INDEXES FOR MergeRecord ===

CREATE INDEX ON :MergeRecord(resultEntityId);
CREATE INDEX ON :MergeRecord(sourceAId);
CREATE INDEX ON :MergeRecord(sourceBId);
CREATE INDEX ON :MergeRecord(needsReview);
CREATE INDEX ON :MergeRecord(mergedAt);

// === INITIAL NAMESPACE CONFIGS ===
// Bootstrap namespace configurations

MERGE (core:NamespaceConfig {namespaceId: 'CORE'})
SET core.currentEpoch = 9000,
    core.currentSequence = 0,
    core.lastVersionName = '',
    core.godModeAllowed = false,
    core.description = 'UN ProjectAdvisor system knowledge - immutable system core',
    core.createdAt = datetime();

MERGE (meta:NamespaceConfig {namespaceId: 'META'})
SET meta.currentEpoch = 9000,
    meta.currentSequence = 0,
    meta.lastVersionName = '',
    meta.godModeAllowed = false,
    meta.description = 'Methodological knowledge and extraction strategies',
    meta.createdAt = datetime();

MERGE (common:NamespaceConfig {namespaceId: 'COMMON'})
SET common.currentEpoch = 9000,
    common.currentSequence = 0,
    common.lastVersionName = '',
    common.godModeAllowed = true,
    common.description = 'Shared vocabulary, terms and common concepts',
    common.createdAt = datetime();

// === RELATIONSHIP TYPES ===
// Document standard relationship types for the immutable graph

// Version chain relationships
// (:NodeVersion)-[:SUPERSEDES]->(:NodeVersion)
// (:EdgeVersion)-[:SUPERSEDES]->(:EdgeVersion)

// Merge tracking
// (:NodeVersion)-[:MERGED_FROM]->(:NodeVersion)
// (:MergeRecord)-[:RESULT_OF]->(:NodeVersion)

// God Mode tracking
// (:GodModeAuditRecord)-[:IN_SESSION]->(:GodModeSession)
// (:Tombstone)-[:DELETED_IN_SESSION]->(:GodModeSession)

// === UTILITY QUERIES ===

// Query: Get current (latest) version of a node
// MATCH (n:NodeVersion {entityId: $entityId})
// WHERE n.status = 'ACTIVE' AND n.ttEnd IS NULL
// RETURN n;

// Query: Get node at specific valid time
// MATCH (n:NodeVersion {entityId: $entityId})
// WHERE n.vtStart <= $validTime
//   AND (n.vtEnd IS NULL OR n.vtEnd > $validTime)
//   AND n.ttEnd IS NULL
// RETURN n;

// Query: Get node at specific transaction time (historical knowledge)
// MATCH (n:NodeVersion {entityId: $entityId})
// WHERE n.ttStart <= $transactionTime
//   AND (n.ttEnd IS NULL OR n.ttEnd > $transactionTime)
// RETURN n;

// Query: Get full version history of a node
// MATCH (n:NodeVersion {entityId: $entityId})
// RETURN n ORDER BY n.sequenceNumber DESC;

// Query: Find orphaned edges for a deprecated node
// MATCH (e:EdgeVersion)
// WHERE (e.sourceEntityId = $nodeId OR e.targetEntityId = $nodeId)
//   AND e.status = 'ACTIVE'
// RETURN e;

// Query: Verify chain integrity
// MATCH (n:NodeVersion {entityId: $entityId})
// WITH n ORDER BY n.sequenceNumber
// WITH collect(n) AS versions
// UNWIND range(1, size(versions)-1) AS i
// WITH versions[i-1] AS prev, versions[i] AS curr
// WHERE curr.previousHash <> prev.chainHash
// RETURN prev, curr AS integrity_violation;

// === TRIGGERS (Conceptual - implement in application layer) ===

// On NodeVersion status change to DEPRECATED/MERGED:
// - Find all EdgeVersions where sourceEntityId or targetEntityId matches
// - Create new EdgeVersion with status=ORPHANED
// - Set orphanedReason, orphanedAt, orphanedByNodeId

// On God Mode session timeout:
// - Update GodModeSession.isActive = false
// - Set GodModeSession.deactivatedAt = datetime()

// On Tombstone recoverableUntil expiry:
// - Mark Tombstone as unrecoverable (optional cleanup)
