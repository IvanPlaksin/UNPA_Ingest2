// ============================================================
// DIALOGUE GYM — PersonaLibrary + ScenarioBank schema
// Namespace: CORE (platform subsystem, no client names)
// Version: 1.0.0
//
// Dialogue Gym is a closed-loop system-prompt optimizer for agentic
// chat. This schema defines the two authoring entities of Phase 1:
//   - Persona  : a simulated user with behavioural parameters
//   - Scenario : a test case with a verifiable goal (ground truth)
//
// Node labels are prefixed (DialogueGym*) to keep the platform label
// space clean and avoid collisions with generic "Persona"/"Scenario".
// JSON-shaped fields are stored as serialized *Json string properties
// (Memgraph forbids nested-map properties) — same pattern as
// ChatTurn.nodeTraceJson / ChatSession.analysisJson.
// ============================================================

// ============================================================
// PERSONA — simulated user
// ============================================================
CREATE CONSTRAINT ON (p:DialogueGymPersona) ASSERT p.personaId IS UNIQUE;
CREATE INDEX ON :DialogueGymPersona(enabled);
CREATE INDEX ON :DialogueGymPersona(isBuiltin);
CREATE INDEX ON :DialogueGymPersona(language);

// Persona properties:
//   personaId       string  (uuid, unique)
//   name            string  ("Field Officer Mali", "New HR Staff")
//   description     string  (human-readable)
//   -- behavioural parameters --
//   domainKnowledge enum    [none | symptom_only | partial | expert]
//   patience        int     [1..10]  (uncertainty turns before giving up)
//   verbosity       enum    [terse | normal | verbose]
//   cooperativeness enum    [cooperative | neutral | withholding | adversarial]
//   language        enum    [en | fr | es | ar | zh | ru]
//   persona         string  (few-shot instruction block for the simulator LLM)
//   -- metadata --
//   namespace       'CORE'
//   createdAt       ISO datetime string
//   updatedAt       ISO datetime string
//   createdBy       string  (user id or "system")
//   isBuiltin       boolean (true = seed data)
//   enabled         boolean (soft-delete flag)

// ============================================================
// SCENARIO — test case with verifiable goal
// ============================================================
CREATE CONSTRAINT ON (s:DialogueGymScenario) ASSERT s.scenarioId IS UNIQUE;
CREATE INDEX ON :DialogueGymScenario(enabled);
CREATE INDEX ON :DialogueGymScenario(category);
CREATE INDEX ON :DialogueGymScenario(domain);
CREATE INDEX ON :DialogueGymScenario(difficulty);

// Scenario properties:
//   scenarioId          string  (uuid, unique)
//   name                string
//   description         string
//   -- goal definition --
//   userGoal            string  (natural-language goal)
//   initialMessage      string  (first user utterance that starts the dialogue)
//   -- ground truth (deterministic scoring) --
//   expectedServiceCode string | null  (Qdrant service_code, e.g. EO-FIN-GM-GA-ACA)
//   expectedRoute       string | null  (info_answer | question_planner | ...)
//   expectedSlotsJson   string | null  (JSON: {"destination":"required", ...})
//   successCriteriaJson string         (JSON: {serviceIdentified, slotsCollected[], ...})
//   -- constraints --
//   maxTurns            int     (default 20)
//   requiredControls    string[]| null (control ids that must be shown)
//   -- classification --
//   category            enum    [typical | edge_case | red_team | regression]
//   domain              string  (EO-HR | EO-FIN | mixed | out_of_scope)
//   difficulty          enum    [easy | medium | hard]
//   tags                string[]
//   -- ground-truth ratification (ШАГ 3.6) --
//   groundTruthVerified boolean (default false; true once a human confirms expectedServiceCode)
//   groundTruthNotes    string | null  (reviewer note, e.g. "no single service — deflection expected")
//   verifiedAt          ISO datetime | null
//   verifiedBy          string | null  ("ivan" | "cli" | …)
//   -- metadata --
//   source              enum    [catalog_generated | real_dialogue | manual | evolved]
//   sourceRef           string | null
//   namespace           'CORE'
//   createdAt / updatedAt ISO datetime string
//   isBuiltin           boolean
//   enabled             boolean

// ============================================================
// ASSIGNMENT — which personas suit which scenarios (M:N)
// ============================================================
// (p:DialogueGymPersona)-[:SUITABLE_FOR {weight: float, notes: string}]->(s:DialogueGymScenario)
//
// The ArenaRunner (Phase 1 next step) draws (persona, scenario) pairs;
// SUITABLE_FOR biases the draw. When a scenario has no SUITABLE_FOR
// edges, any enabled persona may be paired with it.
//
// NOTE: expectedServiceCode is a string property (ground truth), NOT a
// graph edge — the service catalog lives in Qdrant (flowdesk_services),
// not as :FlowdeskService nodes in Memgraph.

// ============================================================
// ARENA RUN — one simulated dialogue (persona × scenario × prompt)
// ============================================================
CREATE CONSTRAINT ON (r:ArenaRun) ASSERT r.runId IS UNIQUE;
CREATE INDEX ON :ArenaRun(scenarioId);
CREATE INDEX ON :ArenaRun(personaId);
CREATE INDEX ON :ArenaRun(status);
CREATE INDEX ON :ArenaRun(terminalCondition);

// ArenaRun properties:
//   runId              string (uuid, unique)
//   -- references (also as edges) --
//   personaId          string
//   scenarioId         string
//   promptVersionId    string | null   (P3; null = current production prompt)
//   promptLabel        string          (human tag for what was under test)
//   -- prompt provenance (ШАГ 5 — which CHAT_PROMPT was tested) --
//   promptSource       enum [production | version | custom_text | custom_graph]
//   promptEntryId      string | null   (CHAT_PROMPT CatalogEntry id, when source=version/production)
//   promptVersionNumber int | null     (GraphVersion.versionNumber)
//   -- execution --
//   startedAt          ISO datetime
//   completedAt        ISO datetime | null
//   status             enum [running | completed | failed | timeout]
//   -- outcome --
//   terminalCondition  enum [goal_achieved | gave_up | max_turns | agent_error | service_matched]
//   turnsCount         int
//   -- deterministic metrics (ground-truth based) --
//   serviceIdentified      boolean | null   (identifiedServiceCode === scenario.expectedServiceCode)
//   identifiedServiceCode  string | null    (what the agent actually resolved, last seen)
//   expectedServiceCode    string | null    (denormalized from the scenario for querying)
//   slotsCollected         string[]         (union of slots filled across turns)
//   controlsShown          string[]         (union of control ids shown across turns)
//   -- Judge (P2, filled later) --
//   judgeScoresJson    string | null
//   judgeVerdict       string | null
//   -- debug / cost --
//   errorMessage       string | null
//   llmCostUsd         float
//   totalTokens        int
//   namespace          'CORE'

// ============================================================
// ARENA TURN — one exchange inside an ArenaRun
// ============================================================
CREATE CONSTRAINT ON (t:ArenaTurn) ASSERT t.turnId IS UNIQUE;
CREATE INDEX ON :ArenaTurn(runId);

// ArenaTurn properties:
//   turnId             string (uuid, unique)
//   runId              string (denormalized for fast per-run queries)
//   turnIndex          int    (0-based)
//   -- content --
//   userMessage        string (what the persona said)
//   agentResponse      string (what the agent replied)
//   -- agent internals (from the turn object) --
//   route              string | null
//   identifiedService  string | null  (turn.draft.serviceId)
//   askingSlot         string | null
//   slotsFilledJson    string | null  (JSON snapshot of filled slots this turn)
//   controlsJson       string | null  (JSON of controls[] returned)
//   isComplete         boolean
//   -- persona internals --
//   personaReasoning   string | null  (CoT, only when debug=true)
//   personaSignal      enum [continue | goal_achieved | gave_up | confused] | null
//   personaPatience    int | null     (persona's self-reported remaining patience)
//   -- timing / cost --
//   startedAt          ISO datetime
//   agentLatencyMs     int
//   personaLatencyMs   int
//   agentTokens        int
//   personaTokens      int

// --- Relationships ---
// (r:ArenaRun)-[:USES_PERSONA]->(p:DialogueGymPersona)
// (r:ArenaRun)-[:RUNS_SCENARIO]->(s:DialogueGymScenario)
// (r:ArenaRun)-[:HAS_TURN {turnIndex:int}]->(t:ArenaTurn)
// (r:ArenaRun)-[:USES_PROMPT_VERSION]->(v:PromptVersion)   -- P3

// ============================================================
// JUDGE RECORD — one multi-criteria evaluation of an ArenaRun (P2)
// ============================================================
CREATE CONSTRAINT ON (j:JudgeRecord) ASSERT j.judgeId IS UNIQUE;
CREATE INDEX ON :JudgeRecord(runId);
CREATE INDEX ON :JudgeRecord(overallVerdict);
CREATE INDEX ON :JudgeRecord(judgeModel);

// JudgeRecord properties:
//   judgeId              string (uuid, unique)
//   runId                string (the judged ArenaRun)
//   -- deterministic metrics (computed, not LLM) --
//   intentAccuracy       enum [correct | incorrect | partial | not_applicable]
//   intentAccuracyScore  float 0..1 | null   (1=correct, 0.5=partial/same-domain, 0=incorrect; null=n/a & unverified)
//   turnsToIdentify      int | null          (0-based turn where a service was first resolved)
//   clarificationEfficiencyScore float 0..1
//   -- LLM rubric metrics (null when skipLLM) --
//   groundingScore / groundingNotes
//   toneScore / toneNotes                     (UN-collegial: polite, not over-formal/robotic)
//   controlsCorrectnessScore / controlsCorrectnessNotes
//   helpfulnessScore / helpfulnessNotes
//   -- aggregate --
//   overallScore         float 0..1 (weighted over available criteria)
//   overallVerdict       enum [excellent | good | acceptable | poor | failure]
//   summaryNotes         string
//   -- metadata --
//   judgedAt             ISO datetime
//   judgeModel           string ("claude-sonnet-4-6" | "deterministic-only" | "human:ivan")
//   judgePromptVersion   string ("v1")
//   llmTokens            int
//   llmCostUsd           float
//   namespace            'CORE'

// --- Relationship ---
// (j:JudgeRecord)-[:JUDGES]->(r:ArenaRun)

// ============================================================
// OPTIMIZATION RUN + PROMPT CANDIDATE — GEPA loop (ШАГ 7)
// ============================================================
CREATE CONSTRAINT ON (o:OptimizationRun) ASSERT o.optimizationId IS UNIQUE;
CREATE INDEX ON :OptimizationRun(status);
CREATE CONSTRAINT ON (c:PromptCandidate) ASSERT c.candidateId IS UNIQUE;
CREATE INDEX ON :PromptCandidate(optimizationId);

// OptimizationRun properties:
//   optimizationId string (uuid, unique)
//   name           string
//   status         enum [running | completed | failed | paused]
//   -- config --
//   basePromptEntryId   string | null   (starting CHAT_PROMPT entry)
//   basePromptVersion   int | null
//   maxIterations       int
//   scenarioIdsJson     string (JSON string[])
//   personaIdsJson      string (JSON string[])
//   -- progress --
//   currentIteration    int
//   candidatesEvaluated int
//   bestScore           float | null
//   bestCandidateId     string | null
//   -- timing / cost --
//   startedAt / completedAt  ISO datetime
//   totalCostUsd        float
//   -- result --
//   improvementPercent  float | null
//   recommendedCandidateId string | null
//   governanceStatus    enum [pending | approved | rejected] | null
//   namespace 'CORE'

// PromptCandidate properties:
//   candidateId      string (uuid, unique)
//   optimizationId   string
//   iteration        int
//   -- content --
//   promptGraphJson  string (JSON {nodes,edges})
//   mutationsJson    string | null  (JSON ops[] applied from parent)
//   parentCandidateId string | null (null = baseline)
//   promptEntryId    string | null  (CHAT_PROMPT entry this optimizes)
//   -- evaluation --
//   arenaRunIdsJson  string (JSON string[])
//   aggregateScore   float | null
//   intentAccuracyRate float | null
//   -- pareto --
//   paretoRank       int | null     (0 = on frontier)
//   -- reflection --
//   reflectionNotes  string | null
//   -- governance --
//   savedAsVersion   int | null
//   governanceStatus enum [pending | approved | rejected] | null
//   createdAt / evaluatedAt  ISO datetime
//   namespace 'CORE'

// --- Relationships ---
// (o:OptimizationRun)-[:HAS_CANDIDATE]->(c:PromptCandidate)
// (c:PromptCandidate)-[:MUTATED_FROM]->(parent:PromptCandidate)
// (c:PromptCandidate)-[:EVALUATED_BY]->(r:ArenaRun)


