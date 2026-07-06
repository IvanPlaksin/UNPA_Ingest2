// ═══════════════════════════════════════════════════════════════════════════
// Investigation Schema — Reproducible Graph-Programs for Knowledge Exploration
//
// Node Types:
//   InvestigationSession  — named investigation session (top-level or subsession)
//   InvestigationVersion  — versioned checkpoint of session state
//   InvestigationStep     — one executed investigative primitive (the program chain)
//   InvestigationArtifact — immutable computed result produced by a step
//
// Edge Types:
//   SESSION_PARENT     — (InvestigationSession)->(InvestigationSession) subsession chain
//   VERSION_INHERITS   — (InvestigationVersion)->(InvestigationVersion) version history
//   VERSION_PINNED_TO  — (InvestigationVersion)->(SnapshotRecord) KB snapshot binding
//   STEP_FOLLOWS       — (InvestigationStep)->(InvestigationStep) program sequence
//   STEP_IN_SESSION    — (InvestigationStep)->(InvestigationSession)
//   STEP_IN_VERSION    — (InvestigationStep)->(InvestigationVersion)
//   STEP_PRODUCES      — (InvestigationStep)->(InvestigationArtifact)
//   ARTIFACT_IN_SESSION — (InvestigationArtifact)->(InvestigationSession)
//   EVIDENCED_BY       — (InvestigationArtifact)->(Entity) provenance anchor
//
// Namespace: INVESTIGATION
// Design: every session IS a reproducible graph-program.
//   Each InvestigationStep records primitiveType + inputParams for replay.
//   Each InvestigationArtifact is immutable; only InvestigationVersion advances.
//   Evidentiary versions pin a KB snapshot; logical versions inherit the parent snapshot.
// ═══════════════════════════════════════════════════════════════════════════

// === InvestigationSession ===
// Properties: sessionId, name, description, status (ACTIVE|CLOSED|ARCHIVED),
//   parentSessionId (null for root), createdBy, createdAt, closedAt
CREATE CONSTRAINT ON (s:InvestigationSession) ASSERT s.sessionId IS UNIQUE;
CREATE INDEX ON :InvestigationSession(parentSessionId);
CREATE INDEX ON :InvestigationSession(status);
CREATE INDEX ON :InvestigationSession(createdBy);
CREATE INDEX ON :InvestigationSession(createdAt);

// === InvestigationVersion ===
// Properties: versionId, sessionId, type (EVIDENTIARY|LOGICAL),
//   message, kbSnapshotId (Sigillum snapshotId, may be null for LOGICAL inheriting parent),
//   parentVersionId, createdAt, createdBy
CREATE CONSTRAINT ON (v:InvestigationVersion) ASSERT v.versionId IS UNIQUE;
CREATE INDEX ON :InvestigationVersion(sessionId);
CREATE INDEX ON :InvestigationVersion(type);
CREATE INDEX ON :InvestigationVersion(kbSnapshotId);
CREATE INDEX ON :InvestigationVersion(parentVersionId);
CREATE INDEX ON :InvestigationVersion(createdAt);

// === InvestigationStep ===
// Properties: stepId, sessionId, versionId, primitiveType
//   (LOCATE|CONNECT|EXPAND|PROFILE|MATRIX|STRUCTURE|TIMELINE|RESOLVE|SYNTHESIZE),
//   inputParams (JSON), prevStepId (null for first step), triggersEvidentiaryVersion (bool),
//   status (PENDING|RUNNING|DONE|FAILED), createdAt, doneAt
CREATE CONSTRAINT ON (s:InvestigationStep) ASSERT s.stepId IS UNIQUE;
CREATE INDEX ON :InvestigationStep(sessionId);
CREATE INDEX ON :InvestigationStep(versionId);
CREATE INDEX ON :InvestigationStep(primitiveType);
CREATE INDEX ON :InvestigationStep(prevStepId);
CREATE INDEX ON :InvestigationStep(status);
CREATE INDEX ON :InvestigationStep(createdAt);

// === InvestigationArtifact ===
// Properties: artifactId, sessionId, versionId, stepId, primitiveType,
//   content (JSON — typed schema per primitiveType), createdAt
CREATE CONSTRAINT ON (a:InvestigationArtifact) ASSERT a.artifactId IS UNIQUE;
CREATE INDEX ON :InvestigationArtifact(sessionId);
CREATE INDEX ON :InvestigationArtifact(versionId);
CREATE INDEX ON :InvestigationArtifact(stepId);
CREATE INDEX ON :InvestigationArtifact(primitiveType);
CREATE INDEX ON :InvestigationArtifact(createdAt);
