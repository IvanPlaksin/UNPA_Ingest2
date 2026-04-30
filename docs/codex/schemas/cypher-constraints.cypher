// ============================================================
// CODEX NAMESPACE: Memgraph Constraints
// Run once during initial setup or migration
// ============================================================

// === EXISTENCE CONSTRAINTS (required properties) ===

// All Codex nodes must have codexId
CREATE CONSTRAINT ON (n:CodexPrinciple) ASSERT EXISTS (n.codexId);
CREATE CONSTRAINT ON (n:CodexRule) ASSERT EXISTS (n.codexId);
CREATE CONSTRAINT ON (n:CodexDefinition) ASSERT EXISTS (n.codexId);
CREATE CONSTRAINT ON (n:CodexConstraint) ASSERT EXISTS (n.codexId);
CREATE CONSTRAINT ON (n:CodexPattern) ASSERT EXISTS (n.codexId);
CREATE CONSTRAINT ON (n:CodexProposal) ASSERT EXISTS (n.codexId);
CREATE CONSTRAINT ON (n:CodexStakeholder) ASSERT EXISTS (n.codexId);

// All Codex nodes must have namespace = 'Codex'
CREATE CONSTRAINT ON (n:CodexPrinciple) ASSERT EXISTS (n.namespace);
CREATE CONSTRAINT ON (n:CodexRule) ASSERT EXISTS (n.namespace);
CREATE CONSTRAINT ON (n:CodexDefinition) ASSERT EXISTS (n.namespace);
CREATE CONSTRAINT ON (n:CodexConstraint) ASSERT EXISTS (n.namespace);
CREATE CONSTRAINT ON (n:CodexPattern) ASSERT EXISTS (n.namespace);

// Information Contract: title, summary, rationale required
CREATE CONSTRAINT ON (n:CodexPrinciple) ASSERT EXISTS (n.title);
CREATE CONSTRAINT ON (n:CodexPrinciple) ASSERT EXISTS (n.summary);
CREATE CONSTRAINT ON (n:CodexPrinciple) ASSERT EXISTS (n.rationale);

CREATE CONSTRAINT ON (n:CodexRule) ASSERT EXISTS (n.title);
CREATE CONSTRAINT ON (n:CodexRule) ASSERT EXISTS (n.summary);
CREATE CONSTRAINT ON (n:CodexRule) ASSERT EXISTS (n.rationale);

// === UNIQUENESS CONSTRAINTS ===

// codexId must be unique across all Codex nodes
CREATE CONSTRAINT ON (n:CodexPrinciple) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexRule) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexDefinition) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexConstraint) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexPattern) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexProposal) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexStakeholder) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexSection) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexVersion) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:CodexDecision) ASSERT n.codexId IS UNIQUE;

// BlackCodex
CREATE CONSTRAINT ON (n:BlackCodexEntry) ASSERT n.codexId IS UNIQUE;
CREATE CONSTRAINT ON (n:BlackCodexEntry) ASSERT EXISTS (n.codexId);

// === INDEXES FOR QUERY PERFORMANCE ===

// Primary lookup by codexId
CREATE INDEX ON :CodexPrinciple(codexId);
CREATE INDEX ON :CodexRule(codexId);
CREATE INDEX ON :CodexDefinition(codexId);
CREATE INDEX ON :CodexConstraint(codexId);
CREATE INDEX ON :CodexPattern(codexId);
CREATE INDEX ON :CodexProposal(codexId);

// Filter by status
CREATE INDEX ON :CodexRule(status);
CREATE INDEX ON :CodexProposal(reviewStatus);

// Filter by modality for rule queries
CREATE INDEX ON :CodexRule(modality);

// Filter by changeabilityTier for governance
CREATE INDEX ON :CodexRule(changeabilityTier);

// Tags for semantic search
CREATE INDEX ON :CodexRule(tags);
CREATE INDEX ON :CodexPattern(tags);

// BlackCodex lookups
CREATE INDEX ON :BlackCodexEntry(codexId);
CREATE INDEX ON :BlackCodexEntry(type);

// === VERIFICATION QUERY ===
// Run after constraints to verify setup:
// CALL db.constraints() YIELD name, type RETURN name, type;
// CALL db.indexes() YIELD name, type RETURN name, type;
