// ============================================================================
// INGESTION_PROCESS SCHEMA
// Namespace: Core, Label: INGESTION_PROCESS
//
// Meta-information about knowledge extraction processes:
// - Sessions and their results
// - Phases and execution steps
// - Prompts and their effectiveness
// - Agent decisions and outcomes
// - Metrics for meta-learning
// ============================================================================

// === CONSTRAINTS (Memgraph syntax) ===

CREATE CONSTRAINT ON (s:IngestionSession) ASSERT s.id IS UNIQUE;
CREATE CONSTRAINT ON (p:IngestionPhase) ASSERT p.id IS UNIQUE;
CREATE CONSTRAINT ON (s:AgentStep) ASSERT s.id IS UNIQUE;
CREATE CONSTRAINT ON (p:PromptRecord) ASSERT p.id IS UNIQUE;
CREATE CONSTRAINT ON (d:AgentDecision) ASSERT d.id IS UNIQUE;
CREATE CONSTRAINT ON (m:ExtractionMetric) ASSERT m.id IS UNIQUE;
CREATE CONSTRAINT ON (t:TableProfile) ASSERT t.id IS UNIQUE;
CREATE CONSTRAINT ON (s:StrategyVersion) ASSERT s.id IS UNIQUE;
CREATE CONSTRAINT ON (a:DiscoveredAnomaly) ASSERT a.id IS UNIQUE;

// === INDEXES ===

CREATE INDEX ON :IngestionSession(sourceDatabase);
CREATE INDEX ON :IngestionSession(status);
CREATE INDEX ON :IngestionSession(qualityScore);
CREATE INDEX ON :IngestionPhase(phaseName);
CREATE INDEX ON :AgentStep(stepType);
CREATE INDEX ON :PromptRecord(promptType);
CREATE INDEX ON :AgentDecision(decisionType);
CREATE INDEX ON :ExtractionMetric(metricName);
CREATE INDEX ON :TableProfile(classifiedAs);

// === NODE LABELS AND PROPERTIES ===
//
// IngestionSession — top-level, one session = one import
//   id: string (UUID)
//   sourceDatabase: string
//   sourceType: 'mssql' | 'postgresql' | etc
//   sourceServer: string
//   startedAt: string (ISO datetime)
//   completedAt: string (ISO datetime)
//   status: 'running' | 'complete' | 'partial' | 'failed'
//   qualityScore: float (0-1)
//   coveragePercent: float (0-100)
//   tablesProcessed: int
//   entitiesDiscovered: int
//   rulesExtracted: int
//   tokensUsed: int
//   durationMs: int
//   strategyVersion: string
//   strategySource: 'default' | 'meta_adapted'
//   errorMessage: string (if failed)
//   namespace: 'Core'
//   label: 'INGESTION_PROCESS'
//
// IngestionPhase — one of 9 spiral phases
//   id: string (UUID)
//   sessionId: string (FK)
//   phaseNumber: int (0-8)
//   phaseName: string
//   startedAt: string
//   completedAt: string
//   status: 'running' | 'complete' | 'skipped' | 'failed'
//   durationMs: int
//   itemsProcessed: int
//   tokensUsed: int
//   toolCalls: int
//   llmCalls: int
//   errorMessage: string (if failed)
//
// AgentStep — one agent step (tool call or LLM call)
//   id: string (UUID)
//   phaseId: string (FK)
//   stepNumber: int
//   stepType: 'tool_call' | 'llm_call' | 'decision' | 'reflection'
//   toolName: string (if tool_call)
//   inputSummary: string (truncated)
//   outputSummary: string (truncated)
//   reasoning: string (CoT if LLM)
//   confidence: float
//   durationMs: int
//   tokensIn: int
//   tokensOut: int
//   timestamp: string
//
// PromptRecord — prompt record for reproducibility
//   id: string (UUID)
//   stepId: string (FK)
//   promptType: string
//   promptTemplate: string
//   promptVariables: string (JSON)
//   responseRaw: string (truncated to 10KB)
//   responseParsed: string (JSON)
//   qualityRating: float (0-1, post-hoc)
//   improvementNotes: string
//   wasEffective: boolean
//
// AgentDecision — agent decision
//   id: string (UUID)
//   stepId: string (FK)
//   decisionType: string
//   subject: string (what the decision is about)
//   optionsConsidered: string (JSON array)
//   chosenOption: string
//   reasoning: string
//   confidence: float
//   outcome: string (filled post-hoc)
//   wasCorrect: boolean (filled post-hoc)
//
// ExtractionMetric — process metric
//   id: string (UUID)
//   sessionId: string (FK)
//   phaseId: string (FK, optional)
//   metricName: string
//   metricValue: float
//   metricUnit: string
//   context: string (JSON)
//   timestamp: string
//
// TableProfile — table classification profile
//   id: string (UUID)
//   sessionId: string (FK)
//   schemaName: string
//   tableName: string
//   rowCount: int
//   columnCount: int
//   fkInbound: int
//   fkOutbound: int
//   signals: string (JSON array of matched signals)
//   classifiedAs: 'reference' | 'master' | 'transaction' | 'log' | 'junction' | 'unknown'
//   confidence: float
//   wasReclassified: boolean
//   reclassificationReason: string
//   samplingStrategy: string
//
// StrategyVersion — strategy evolution
//   id: string (UUID)
//   version: string
//   basedOnSessions: string (JSON array of session IDs)
//   changes: string (JSON)
//   createdAt: string
//   performanceDelta: float
//   isActive: boolean
//
// DiscoveredAnomaly — found anomaly
//   id: string (UUID)
//   sessionId: string (FK)
//   anomalyType: string
//   description: string
//   affectedTables: string (JSON array)
//   severity: 'low' | 'medium' | 'high'
//   resolved: boolean
//   resolution: string

// === RELATIONSHIPS ===
//
// (IngestionSession)-[:HAS_PHASE {order: int}]->(IngestionPhase)
// (IngestionPhase)-[:HAS_STEP {order: int}]->(AgentStep)
// (AgentStep)-[:USED_PROMPT]->(PromptRecord)
// (AgentStep)-[:MADE_DECISION]->(AgentDecision)
// (IngestionSession)-[:HAS_METRIC]->(ExtractionMetric)
// (IngestionPhase)-[:PRODUCED_METRIC]->(ExtractionMetric)
// (IngestionSession)-[:PROFILED_TABLE]->(TableProfile)
// (IngestionSession)-[:FOUND_ANOMALY]->(DiscoveredAnomaly)
// (IngestionSession)-[:LEARNED_FROM {relevanceScore: float}]->(IngestionSession)
// (IngestionSession)-[:USED_STRATEGY]->(StrategyVersion)
// (StrategyVersion)-[:EVOLVED_TO]->(StrategyVersion)
// (IngestionSession)-[:PRODUCED_GRAPH {graphType: string}]->(KnowledgeGraph)
