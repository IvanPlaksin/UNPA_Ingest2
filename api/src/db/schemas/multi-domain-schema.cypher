// ============================================================
// UN PROJECTADVISOR — MULTI-DOMAIN KNOWLEDGE SCHEMA
// Version: 2.0.0
//
// 13 Information Domains:
// D1-STRUCTURAL, D2-BEHAVIORAL, D3-SEMANTIC, D4-TEMPORAL,
// D5-QUALITY_DATA, D6-REQUIREMENTS, D7-CONFIGURATION,
// D8-QUALITY_PROCESS, D9-CONSTRUCTION, D10-ARCHITECTURAL,
// D11-OPERATIONAL, D12-SECURITY, D13-GNN_TRAINING
// ============================================================

// ============================================================
// SECTION 1: GRAPH LIFECYCLE MANAGEMENT
// ============================================================

// DomainGraph — unified container for any domain graph
// Replaces KnowledgeGraph with domain + status fields
CREATE CONSTRAINT domain_graph_id IF NOT EXISTS
FOR (g:DomainGraph) REQUIRE g.id IS UNIQUE;

CREATE INDEX domain_graph_domain IF NOT EXISTS
FOR (g:DomainGraph) ON (g.domain);

CREATE INDEX domain_graph_status IF NOT EXISTS
FOR (g:DomainGraph) ON (g.status);

CREATE INDEX domain_graph_session IF NOT EXISTS
FOR (g:DomainGraph) ON (g.sessionId);

CREATE INDEX domain_graph_source IF NOT EXISTS
FOR (g:DomainGraph) ON (g.sourceSystem);

// GraphStatusChange — audit trail for status transitions
CREATE CONSTRAINT graph_status_change_id IF NOT EXISTS
FOR (s:GraphStatusChange) REQUIRE s.id IS UNIQUE;

// ============================================================
// SECTION 2: DOMAIN-SPECIFIC LABELS
// Each node gets a domain-prefixed label for fast filtering
// ============================================================

// D1: STRUCTURAL — what exists (schema, entities, attributes)
CREATE CONSTRAINT structural_entity_id IF NOT EXISTS
FOR (e:StructuralEntity) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT structural_attribute_id IF NOT EXISTS
FOR (a:StructuralAttribute) REQUIRE a.id IS UNIQUE;

CREATE CONSTRAINT structural_enumeration_id IF NOT EXISTS
FOR (e:StructuralEnumeration) REQUIRE e.id IS UNIQUE;

CREATE INDEX structural_entity_name IF NOT EXISTS
FOR (e:StructuralEntity) ON (e.name);

CREATE INDEX structural_entity_schema IF NOT EXISTS
FOR (e:StructuralEntity) ON (e.schemaName);

// D2: BEHAVIORAL — what happens (GXE-executable processes)
CREATE CONSTRAINT behavioral_process_id IF NOT EXISTS
FOR (p:BehavioralProcess) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT behavioral_node_id IF NOT EXISTS
FOR (n:BehavioralNode) REQUIRE n.id IS UNIQUE;

CREATE INDEX behavioral_process_gxe IF NOT EXISTS
FOR (p:BehavioralProcess) ON (p.gxeCatalogId);

CREATE INDEX behavioral_node_type IF NOT EXISTS
FOR (n:BehavioralNode) ON (n.nodeType);

CREATE INDEX behavioral_process_source IF NOT EXISTS
FOR (p:BehavioralProcess) ON (p.sourceProcedure);

// D3: SEMANTIC — what it means (ontology, rules, calculations)
CREATE CONSTRAINT semantic_concept_id IF NOT EXISTS
FOR (c:SemanticConcept) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT semantic_rule_id IF NOT EXISTS
FOR (r:SemanticRule) REQUIRE r.id IS UNIQUE;

CREATE CONSTRAINT semantic_calculation_id IF NOT EXISTS
FOR (c:SemanticCalculation) REQUIRE c.id IS UNIQUE;

CREATE INDEX semantic_concept_name IF NOT EXISTS
FOR (c:SemanticConcept) ON (c.name);

CREATE INDEX semantic_rule_type IF NOT EXISTS
FOR (r:SemanticRule) ON (r.ruleType);

// D4: TEMPORAL — how it changes (state machines, transitions)
CREATE CONSTRAINT temporal_statemachine_id IF NOT EXISTS
FOR (m:TemporalStateMachine) REQUIRE m.id IS UNIQUE;

CREATE CONSTRAINT temporal_state_id IF NOT EXISTS
FOR (s:TemporalState) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT temporal_transition_id IF NOT EXISTS
FOR (t:TemporalTransition) REQUIRE t.id IS UNIQUE;

// D5: QUALITY_DATA — data anomalies and integrity issues
CREATE CONSTRAINT quality_anomaly_id IF NOT EXISTS
FOR (a:QualityAnomaly) REQUIRE a.id IS UNIQUE;

CREATE INDEX quality_anomaly_type IF NOT EXISTS
FOR (a:QualityAnomaly) ON (a.anomalyType);

CREATE INDEX quality_anomaly_severity IF NOT EXISTS
FOR (a:QualityAnomaly) ON (a.severity);

// D6: REQUIREMENTS — what was required (user stories, epics)
CREATE CONSTRAINT requirement_id IF NOT EXISTS
FOR (r:Requirement) REQUIRE r.id IS UNIQUE;

CREATE CONSTRAINT user_story_id IF NOT EXISTS
FOR (s:UserStory) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT epic_id IF NOT EXISTS
FOR (e:Epic) REQUIRE e.id IS UNIQUE;

CREATE INDEX requirement_priority IF NOT EXISTS
FOR (r:Requirement) ON (r.priority);

// D7: CONFIGURATION — versions and environments
CREATE CONSTRAINT config_version_id IF NOT EXISTS
FOR (v:ConfigVersion) REQUIRE v.id IS UNIQUE;

CREATE CONSTRAINT config_release_id IF NOT EXISTS
FOR (r:ConfigRelease) REQUIRE r.id IS UNIQUE;

CREATE CONSTRAINT config_environment_id IF NOT EXISTS
FOR (e:ConfigEnvironment) REQUIRE e.id IS UNIQUE;

// D8: QUALITY_PROCESS — tests and defects
CREATE CONSTRAINT test_case_id IF NOT EXISTS
FOR (t:TestCase) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT defect_id IF NOT EXISTS
FOR (d:Defect) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT test_suite_id IF NOT EXISTS
FOR (s:TestSuite) REQUIRE s.id IS UNIQUE;

CREATE INDEX defect_severity IF NOT EXISTS
FOR (d:Defect) ON (d.severity);

// D9: CONSTRUCTION — how it's implemented (code artifacts)
CREATE CONSTRAINT code_artifact_id IF NOT EXISTS
FOR (c:CodeArtifact) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT commit_record_id IF NOT EXISTS
FOR (c:CommitRecord) REQUIRE c.id IS UNIQUE;

CREATE INDEX code_artifact_path IF NOT EXISTS
FOR (c:CodeArtifact) ON (c.filePath);

// D10: ARCHITECTURAL — system topology
CREATE CONSTRAINT system_component_id IF NOT EXISTS
FOR (c:SystemComponent) REQUIRE c.id IS UNIQUE;

CREATE CONSTRAINT arch_decision_id IF NOT EXISTS
FOR (d:ArchDecision) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT integration_point_id IF NOT EXISTS
FOR (i:IntegrationPoint) REQUIRE i.id IS UNIQUE;

// D11: OPERATIONAL — runtime, incidents
CREATE CONSTRAINT operational_procedure_id IF NOT EXISTS
FOR (p:OperationalProcedure) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT incident_id IF NOT EXISTS
FOR (i:Incident) REQUIRE i.id IS UNIQUE;

CREATE INDEX incident_severity IF NOT EXISTS
FOR (i:Incident) ON (i.severity);

// D12: SECURITY — access, permissions, audit
CREATE CONSTRAINT access_role_id IF NOT EXISTS
FOR (r:AccessRole) REQUIRE r.id IS UNIQUE;

CREATE CONSTRAINT security_policy_id IF NOT EXISTS
FOR (p:SecurityPolicy) REQUIRE p.id IS UNIQUE;

// D13: GNN_TRAINING — ML training material
CREATE CONSTRAINT gnn_training_graph_id IF NOT EXISTS
FOR (g:GnnTrainingGraph) REQUIRE g.id IS UNIQUE;

CREATE INDEX gnn_training_status IF NOT EXISTS
FOR (g:GnnTrainingGraph) ON (g.trainingStatus);

CREATE INDEX gnn_training_model IF NOT EXISTS
FOR (g:GnnTrainingGraph) ON (g.modelVersion);

// ============================================================
// SECTION 3: CROSS-DOMAIN EDGE INDEXES
// ============================================================

// Fast lookup for cross-domain relationships
CREATE INDEX cross_domain_source IF NOT EXISTS
FOR ()-[r:CROSS_DOMAIN]-() ON (r.sourceDomain);

CREATE INDEX cross_domain_target IF NOT EXISTS
FOR ()-[r:CROSS_DOMAIN]-() ON (r.targetDomain);

CREATE INDEX cross_domain_type IF NOT EXISTS
FOR ()-[r:CROSS_DOMAIN]-() ON (r.edgeType);

// ============================================================
// SECTION 4: INGESTION SESSION (updated for multi-domain)
// ============================================================

// Keep IngestionSession but link to DomainGraph instead of KnowledgeGraph
CREATE CONSTRAINT ingestion_session_id IF NOT EXISTS
FOR (s:IngestionSession) REQUIRE s.id IS UNIQUE;

CREATE INDEX ingestion_session_status IF NOT EXISTS
FOR (s:IngestionSession) ON (s.status);

CREATE INDEX ingestion_session_source IF NOT EXISTS
FOR (s:IngestionSession) ON (s.sourceDatabase);

CREATE INDEX ingestion_session_source_type IF NOT EXISTS
FOR (s:IngestionSession) ON (s.sourceType);

// ============================================================
// SECTION 5: INGESTION PROCESS NODES (unchanged)
// ============================================================

CREATE CONSTRAINT ingestion_phase_id IF NOT EXISTS
FOR (p:IngestionPhase) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT agent_step_id IF NOT EXISTS
FOR (s:AgentStep) REQUIRE s.id IS UNIQUE;

CREATE CONSTRAINT prompt_record_id IF NOT EXISTS
FOR (p:PromptRecord) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT agent_decision_id IF NOT EXISTS
FOR (d:AgentDecision) REQUIRE d.id IS UNIQUE;

CREATE CONSTRAINT extraction_metric_id IF NOT EXISTS
FOR (m:ExtractionMetric) REQUIRE m.id IS UNIQUE;

CREATE CONSTRAINT table_profile_id IF NOT EXISTS
FOR (t:TableProfile) REQUIRE t.id IS UNIQUE;

CREATE CONSTRAINT strategy_version_id IF NOT EXISTS
FOR (s:StrategyVersion) REQUIRE s.id IS UNIQUE;

// ============================================================
// SECTION 6: RELATIONSHIP TYPE DEFINITIONS (documentation)
// ============================================================

// DomainGraph relationships:
//   (IngestionSession)-[:PRODUCED]->(DomainGraph)
//   (DomainGraph)-[:CONTAINS_NODE]->(StructuralEntity|BehavioralNode|...)
//   (DomainGraph)-[:HAS_STATUS_CHANGE]->(GraphStatusChange)
//
// Cross-domain (all via :CROSS_DOMAIN with edgeType property):
//   OPERATES_ON:     D2→D1 (Process uses Entity)
//   DEFINED_BY:      D3→D1 (Concept defined by Entity)
//   ENFORCES:        D2→D3 (Process enforces Rule)
//   TRIGGERS:        D2→D4 (Process triggers Transition)
//   GUARDED_BY:      D4→D3 (Transition guarded by Rule)
//   GOVERNS:         D4→D1 (StateMachine governs Entity)
//   AFFECTS:         D5→D1 (Anomaly affects Entity)
//   VIOLATES:        D5→D3 (Anomaly violates Rule)
//   SPAWNS_TASK:     D5→iNeed (Anomaly creates task)
//   IMPLEMENTED_BY:  D6→D2 (Requirement implemented by Process)
//   TRACES_TO:       D6→D9 (Requirement traces to Code)
//   VALIDATES:       D8→D6 (TestCase validates Requirement)
//   EXERCISES:       D8→D2 (TestCase exercises Process)
//   IMPLEMENTS:      D9→D2 (Code implements Process)
//   USES:            D9→D1 (Code uses Entity)
//   WATCHED_BY:      D11→D2 (MonitoringRule watches Process)
//   APPLIES_TO:      D12→D1/D2 (Permission applies to resource)
//   AUDITED_BY:      D12→D2 (Security audit of Process)
//
// Intra-domain (domain-specific):
//   D1: HAS_ATTRIBUTE, RELATES_TO, USES_ENUMERATION
//   D2: HAS_NODE, CONNECTS_TO (dataflow)
//   D3: IS_A, PART_OF, SYNONYM_OF
//   D4: TRANSITIONS_TO
//   D6: PART_OF (UserStory→Epic)
//   D8: BELONGS_TO (TestCase→TestSuite)
//   D9: MODIFIES (CommitRecord→CodeArtifact)
//   D10: DEPENDS_ON, EXPOSES, CONTAINS
//   D12: GRANTS (Role→Permission)
