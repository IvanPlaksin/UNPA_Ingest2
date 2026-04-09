// ═══════════════════════════════════════════════════════════════════════════
// WorkSpace Schema — Isolated Knowledge Extraction Sandbox
// Memgraph constraints and indexes for WorkSpace system
//
// Node Types:
//   WorkSpace, WorkSpaceSession, SourceReference, SourceProfile,
//   DraftEntity, DraftRelationship, DraftBusinessRule, DraftSchema,
//   DraftWorkflow, DraftCalculation, DraftConcept, DraftPolicy,
//   DraftDecision, DraftRequirement, DraftAnomaly, DraftAPIContract,
//   KBReference, ExperienceRecord, ExtractionStrategy,
//   PromotionRecord, PromotionItem
//
// Edge Types:
//   HAS_SOURCE, CONTAINS_DRAFT, REFERENCES_KB,
//   DRAFT_RELATES_TO, EXTRACTED_FROM,
//   HAS_EXPERIENCE, HAS_PROMOTION, PROMOTED_ITEM,
//   HAS_SESSION, EVOLVED_FROM, USES_STRATEGY
// ═══════════════════════════════════════════════════════════════════════════

// === WorkSpace ===
// Properties: id, name, description, status (WorkspaceStatus enum),
//   createdBy, createdAt, updatedAt, namespace (always workspace:{id}),
//   sourceCount, draftCount, promotedCount, domain, tags[]
CREATE INDEX ON :WorkSpace(id);
CREATE INDEX ON :WorkSpace(status);
CREATE INDEX ON :WorkSpace(createdBy);
CREATE INDEX ON :WorkSpace(createdAt);
CREATE INDEX ON :WorkSpace(namespace);

// === WorkSpaceSession ===
// Properties: id, workspaceId, startedAt, endedAt, agentId,
//   mode (AUTONOMOUS/PLANNING), extractedCount, errorCount
CREATE INDEX ON :WorkSpaceSession(id);
CREATE INDEX ON :WorkSpaceSession(workspaceId);

// === SourceReference ===
// Properties: id, workspaceId, sourceType (FILE/DATABASE/API/FILESYSTEM),
//   filename, mimeType, sizeBytes, uri, uploadedAt, status (PENDING/PROFILED/PROCESSING/DONE/ERROR)
CREATE INDEX ON :SourceReference(id);
CREATE INDEX ON :SourceReference(workspaceId);
CREATE INDEX ON :SourceReference(sourceType);
CREATE INDEX ON :SourceReference(status);

// === SourceProfile ===
// Properties: id, sourceReferenceId, workspaceId,
//   documentType (REGULATORY/TECHNICAL/BUSINESS/DATA_SCHEMA/API_SPEC/MIXED),
//   domain, language, structureType (TABULAR/HIERARCHICAL/FLAT/MIXED),
//   complexity (LOW/MEDIUM/HIGH), quality (0.0-1.0),
//   suggestedExtractors[], entityCount, schemaDetected (bool),
//   profiledAt
CREATE INDEX ON :SourceProfile(id);
CREATE INDEX ON :SourceProfile(workspaceId);
CREATE INDEX ON :SourceProfile(documentType);
CREATE INDEX ON :SourceProfile(domain);

// === Draft Knowledge Objects (14 types, common properties) ===
// Common properties for all Draft* nodes:
//   id, workspaceId, type (knowledge family: STRUCTURAL/BEHAVIORAL/SEMANTIC/OPERATIONAL/CONTEXTUAL),
//   name, description, confidence (0.0-1.0), status (DraftKnowledgeStatus enum),
//   extractedAt, extractedBy (agentId/sessionId), sourceReferenceId,
//   namespace (workspace:{id}), metadata (JSON)

// DraftEntity — extracted business entity
// Additional: attributes[], primaryKey, constraints[], domain
CREATE INDEX ON :DraftEntity(id);
CREATE INDEX ON :DraftEntity(workspaceId);
CREATE INDEX ON :DraftEntity(status);
CREATE INDEX ON :DraftEntity(name);

// DraftRelationship — extracted relationship between entities
// Additional: sourceEntityId, targetEntityId, relationType, cardinality, bidirectional
CREATE INDEX ON :DraftRelationship(id);
CREATE INDEX ON :DraftRelationship(workspaceId);
CREATE INDEX ON :DraftRelationship(status);

// DraftBusinessRule — extracted business rule (formalized)
// Additional: condition, action, scope, exceptions[], priority, enforcement,
//   ruleType (VALIDATION/CALCULATION/AUTHORIZATION/WORKFLOW), dmn (DMN decision table JSON)
CREATE INDEX ON :DraftBusinessRule(id);
CREATE INDEX ON :DraftBusinessRule(workspaceId);
CREATE INDEX ON :DraftBusinessRule(status);
CREATE INDEX ON :DraftBusinessRule(ruleType);

// DraftSchema — extracted data schema (tables, columns, FK mappings)
// Additional: schemaType (RELATIONAL/API/JSON/XML), tables[], foreignKeys[], version
CREATE INDEX ON :DraftSchema(id);
CREATE INDEX ON :DraftSchema(workspaceId);
CREATE INDEX ON :DraftSchema(status);

// DraftWorkflow — extracted process/workflow (state machine)
// Additional: states[], transitions[], actors[], slaPerTransition{}, entryPoint, exitPoint
CREATE INDEX ON :DraftWorkflow(id);
CREATE INDEX ON :DraftWorkflow(workspaceId);
CREATE INDEX ON :DraftWorkflow(status);

// DraftCalculation — extracted formula/calculation
// Additional: formula, variables[], domain, inputTypes{}, outputType
CREATE INDEX ON :DraftCalculation(id);
CREATE INDEX ON :DraftCalculation(workspaceId);
CREATE INDEX ON :DraftCalculation(status);

// DraftConcept — extracted domain concept/glossary term
// Additional: definition, synonyms[], parentConcept, domain, isOfficial
CREATE INDEX ON :DraftConcept(id);
CREATE INDEX ON :DraftConcept(workspaceId);
CREATE INDEX ON :DraftConcept(status);
CREATE INDEX ON :DraftConcept(domain);

// DraftPolicy — extracted organizational policy
// Additional: policyType, applicability, enforcementLevel, effectiveDate, expiryDate
CREATE INDEX ON :DraftPolicy(id);
CREATE INDEX ON :DraftPolicy(workspaceId);
CREATE INDEX ON :DraftPolicy(status);

// DraftDecision — extracted architectural/design decision (ADR-like)
// Additional: context, alternatives[], rationale, consequences[], supersedes
CREATE INDEX ON :DraftDecision(id);
CREATE INDEX ON :DraftDecision(workspaceId);
CREATE INDEX ON :DraftDecision(status);

// DraftRequirement — extracted functional requirement
// Additional: reqType (FUNCTIONAL/NON_FUNCTIONAL/CONSTRAINT), priority, linkedRules[]
CREATE INDEX ON :DraftRequirement(id);
CREATE INDEX ON :DraftRequirement(workspaceId);
CREATE INDEX ON :DraftRequirement(status);

// DraftAnomaly — detected anomaly/contradiction/technical debt
// Additional: anomalyType (CONTRADICTION/DEAD_CODE/TECH_DEBT/MISSING_SPEC), severity, affectedNodes[]
CREATE INDEX ON :DraftAnomaly(id);
CREATE INDEX ON :DraftAnomaly(workspaceId);
CREATE INDEX ON :DraftAnomaly(status);
CREATE INDEX ON :DraftAnomaly(anomalyType);

// DraftAPIContract — extracted API contract
// Additional: endpoints[], requestSchema, responseSchema, authType, sla, version
CREATE INDEX ON :DraftAPIContract(id);
CREATE INDEX ON :DraftAPIContract(workspaceId);
CREATE INDEX ON :DraftAPIContract(status);

// === KBReference ===
// Read-only pointer to a Global KB node (never a full copy)
// Properties: id, workspaceId, kbNodeId, kbNamespace,
//   type (label of KB node), name, summary,
//   snapshotHash, snapshotAt, isStale (bool),
//   lastAccessedAt
CREATE INDEX ON :KBReference(id);
CREATE INDEX ON :KBReference(workspaceId);
CREATE INDEX ON :KBReference(kbNodeId);
CREATE INDEX ON :KBReference(kbNamespace);

// === ExperienceRecord ===
// Strategy-only metadata (NO domain content) for cross-WS learning
// Properties: id, workspaceId,
//   documentType, sourceSystemType, dataComplexity,
//   strategyUsed, promptVersion, extractorChain[],
//   outcome (SUCCESS/PARTIAL/FAILURE), confidence,
//   durationMs, extractedCount, errorCount, errorPatterns[],
//   createdAt
CREATE INDEX ON :ExperienceRecord(id);
CREATE INDEX ON :ExperienceRecord(workspaceId);
CREATE INDEX ON :ExperienceRecord(documentType);
CREATE INDEX ON :ExperienceRecord(outcome);
CREATE INDEX ON :ExperienceRecord(sourceSystemType);

// === ExtractionStrategy ===
// Reusable extraction strategy (linked from ExperienceRecord)
// Properties: id, name, description, extractorChain[],
//   applicableDocTypes[], applicableDomains[],
//   successRate, usageCount, createdAt, updatedAt
CREATE INDEX ON :ExtractionStrategy(id);
CREATE INDEX ON :ExtractionStrategy(name);

// === PromotionRecord ===
// Immutable audit record of a promotion event
// Properties: id, workspaceId, promotedBy, promotedAt,
//   itemCount, status (PENDING/IN_PROGRESS/COMPLETED/ROLLED_BACK),
//   sagaTransactionId, notes
CREATE INDEX ON :PromotionRecord(id);
CREATE INDEX ON :PromotionRecord(workspaceId);
CREATE INDEX ON :PromotionRecord(promotedBy);
CREATE INDEX ON :PromotionRecord(status);

// === PromotionItem ===
// Individual item within a promotion (links DraftNode to KB outcome)
// Properties: id, promotionRecordId, draftNodeId, draftNodeType,
//   action (PromotionAction enum: NEW/ENRICH/SUPERSEDE/MERGE/CONFLICT/REJECT),
//   kbNodeId (target KB node after promotion, null if REJECT),
//   confidence, notes
CREATE INDEX ON :PromotionItem(id);
CREATE INDEX ON :PromotionItem(promotionRecordId);
CREATE INDEX ON :PromotionItem(action);
