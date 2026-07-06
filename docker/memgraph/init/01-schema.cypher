// ═══════════════════════════════════════════════════════════════════════════
// IMMUTABLE GRAPH SCHEMA INITIALIZATION
// UN ProjectAdvisor - Bi-temporal versioned graph system
// ═══════════════════════════════════════════════════════════════════════════

// === CONSTRAINTS ===
CREATE CONSTRAINT ON (n:NodeVersion) ASSERT n.versionId IS UNIQUE;
CREATE CONSTRAINT ON (e:EdgeVersion) ASSERT e.versionId IS UNIQUE;
CREATE CONSTRAINT ON (ns:NamespaceConfig) ASSERT ns.namespaceId IS UNIQUE;
CREATE CONSTRAINT ON (g:GodModeSession) ASSERT g.sessionId IS UNIQUE;
CREATE CONSTRAINT ON (a:GodModeAuditRecord) ASSERT a.recordId IS UNIQUE;
CREATE CONSTRAINT ON (t:Tombstone) ASSERT t.tombstoneId IS UNIQUE;
CREATE CONSTRAINT ON (p:PendingDeletion) ASSERT p.pendingId IS UNIQUE;
CREATE CONSTRAINT ON (m:MergeRecord) ASSERT m.mergeId IS UNIQUE;

// === INDEXES ===
CREATE INDEX ON :NodeVersion(entityId);
CREATE INDEX ON :NodeVersion(status);
CREATE INDEX ON :NodeVersion(namespace);
CREATE INDEX ON :NodeVersion(sequenceNumber);
CREATE INDEX ON :NodeVersion(versionName);
CREATE INDEX ON :NodeVersion(nodeType);
CREATE INDEX ON :NodeVersion(ttStart);
CREATE INDEX ON :NodeVersion(vtStart);

CREATE INDEX ON :EdgeVersion(edgeId);
CREATE INDEX ON :EdgeVersion(status);
CREATE INDEX ON :EdgeVersion(sourceEntityId);
CREATE INDEX ON :EdgeVersion(targetEntityId);
CREATE INDEX ON :EdgeVersion(namespace);
CREATE INDEX ON :EdgeVersion(edgeType);

CREATE INDEX ON :GodModeSession(userId);
CREATE INDEX ON :GodModeSession(isActive);
CREATE INDEX ON :GodModeAuditRecord(sessionId);
CREATE INDEX ON :GodModeAuditRecord(entityId);
CREATE INDEX ON :GodModeAuditRecord(performedAt);

CREATE INDEX ON :Tombstone(originalId);
CREATE INDEX ON :Tombstone(recoverableUntil);

CREATE INDEX ON :PendingDeletion(entityId);

// === KNOWLEDGE GRAPH INDEXES ===
// Performance indexes for common query patterns
CREATE INDEX ON :Entity(normalizedForm);
// Document indexes — primary lookup keys used across the ingest pipeline.
// NOTE: the code writes `contentHash` (SHA-256), not sourceHash/fileHash — the
// legacy hash indexes below indexed properties that are never set.
CREATE INDEX ON :Document(id);
CREATE INDEX ON :Document(contentHash);
CREATE INDEX ON :Document(unSymbol);
CREATE INDEX ON :Document(baseSymbol);
CREATE INDEX ON :Document(organCode);
CREATE INDEX ON :Document(status);
// SourceDocument (harvester cache) lookup keys.
CREATE INDEX ON :SourceDocument(id);
CREATE INDEX ON :SourceDocument(sourceId);
CREATE INDEX ON :SourceDocument(symbol);
CREATE INDEX ON :SourceDocument(importedDocumentId);
// UN document-management node types (series / agenda) — used by MARC promotion.
CREATE INDEX ON :DocumentSeries(id);
CREATE INDEX ON :DocumentSeries(name);
CREATE INDEX ON :AgendaItem(id);
CREATE INDEX ON :KnowledgeQuantum(quantumId);
CREATE INDEX ON :KnowledgeQuantum(namespace);
CREATE INDEX ON :KnowledgeQuantum(fullNamespace);
CREATE INDEX ON :KnowledgeQuantum(projectId);

// === AOPEG INDEXES ===
// Graph and node indexes for AOPEG system
CREATE INDEX ON :AOPEG_ExecutionGraph(id);
CREATE INDEX ON :AOPEG_ExecutionGraph(domain);
CREATE INDEX ON :AOPEG_ExecutionGraph(status);
CREATE INDEX ON :AOPEG_GraphNode(id);
CREATE INDEX ON :AOPEG_GraphNode(graphId);
CREATE INDEX ON :AOPEG_GraphNode(executorType);
CREATE INDEX ON :AOPEG_GraphEdge(id);
CREATE INDEX ON :AOPEG_GraphEdge(graphId);
CREATE INDEX ON :AOPEG_Execution(id);
CREATE INDEX ON :AOPEG_Execution(graphId);
CREATE INDEX ON :AOPEG_Execution(status);

// === INITIAL NAMESPACE CONFIGS ===
MERGE (core:NamespaceConfig {namespaceId: 'CORE'})
SET core.currentEpoch = 9000,
    core.currentSequence = 0,
    core.lastVersionName = '',
    core.godModeAllowed = false,
    core.description = 'UN ProjectAdvisor system knowledge',
    core.createdAt = datetime();

MERGE (meta:NamespaceConfig {namespaceId: 'META'})
SET meta.currentEpoch = 9000,
    meta.currentSequence = 0,
    meta.lastVersionName = '',
    meta.godModeAllowed = false,
    meta.description = 'Methodological knowledge and strategies',
    meta.createdAt = datetime();

MERGE (common:NamespaceConfig {namespaceId: 'COMMON'})
SET common.currentEpoch = 9000,
    common.currentSequence = 0,
    common.lastVersionName = '',
    common.godModeAllowed = true,
    common.description = 'Shared vocabulary and terminology',
    common.createdAt = datetime();

MERGE (project:NamespaceConfig {namespaceId: 'PROJECT'})
SET project.currentEpoch = 9000,
    project.currentSequence = 0,
    project.lastVersionName = '',
    project.godModeAllowed = true,
    project.description = 'Project-specific knowledge graphs',
    project.createdAt = datetime();

// Log initialization
RETURN 'Immutable Graph Schema initialized successfully' AS status, datetime() AS timestamp;
