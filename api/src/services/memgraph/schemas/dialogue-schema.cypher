// ═══════════════════════════════════════════════════════════════════════════
// Dialogue Schema — DIALOGUE Namespace
// Memgraph constraints and indexes for DevDialogue Collector
//
// Node Types:
//   DialogueSession, DialogueSegment, ArchDecision, DialogueTopic,
//   DialogueChain
//
// Edge Types:
//   HAS_SEGMENT, MAKES_DECISION, DISCUSSES_TOPIC, PART_OF_CHAIN,
//   REFERENCES_BACKLOG, REFERENCES_CODEX, CONTINUES_SESSION,
//   IMPLEMENTS_DECISION, SUPERSEDES_DECISION
//
// Namespace: DIALOGUE
// ═══════════════════════════════════════════════════════════════════════════

// === DialogueSession ===
// Properties: sessionId, platform (claude_code|claude_ai), projectPath,
//   gitBranch, startedAt, endedAt, messageCount, tokenCount,
//   summary, language, processingRound, sanitized
CREATE INDEX ON :DialogueSession(sessionId);
CREATE INDEX ON :DialogueSession(platform);
CREATE INDEX ON :DialogueSession(startedAt);
CREATE INDEX ON :DialogueSession(projectPath);
CREATE INDEX ON :DialogueSession(processingRound);
CREATE CONSTRAINT ON (s:DialogueSession) ASSERT s.sessionId IS UNIQUE;

// === DialogueSegment ===
// Properties: segmentId, sessionId, speakerRole (human|assistant|claude_code),
//   text, summary, contributionType (planning|implementation|debugging|review|question|decision),
//   startIndex, endIndex, tokenCount, embeddingId
CREATE INDEX ON :DialogueSegment(segmentId);
CREATE INDEX ON :DialogueSegment(sessionId);
CREATE INDEX ON :DialogueSegment(contributionType);
CREATE INDEX ON :DialogueSegment(speakerRole);
CREATE CONSTRAINT ON (s:DialogueSegment) ASSERT s.segmentId IS UNIQUE;

// === ArchDecision (ADR) ===
// Properties: decisionId, sessionId, title, rationale, alternatives,
//   status (proposed|accepted|deprecated|superseded), category
//   (architecture|technology|pattern|convention|rejection),
//   namespace (CORE|FLOWDESK|CODEX|GXE|META|DIALOGUE),
//   decidedAt, confidence
CREATE INDEX ON :ArchDecision(decisionId);
CREATE INDEX ON :ArchDecision(status);
CREATE INDEX ON :ArchDecision(category);
CREATE INDEX ON :ArchDecision(namespace);
CREATE INDEX ON :ArchDecision(decidedAt);
CREATE CONSTRAINT ON (d:ArchDecision) ASSERT d.decisionId IS UNIQUE;

// === DialogueTopic ===
// Properties: topicId, name, namespace, frequency, lastSeenAt
CREATE INDEX ON :DialogueTopic(topicId);
CREATE INDEX ON :DialogueTopic(namespace);
CREATE INDEX ON :DialogueTopic(name);
CREATE CONSTRAINT ON (t:DialogueTopic) ASSERT t.topicId IS UNIQUE;

// === DialogueChain ===
// Properties: chainId, title, sessionIds[], startedAt, endedAt,
//   summary, topicNamespace
CREATE INDEX ON :DialogueChain(chainId);
CREATE INDEX ON :DialogueChain(topicNamespace);
CREATE CONSTRAINT ON (c:DialogueChain) ASSERT c.chainId IS UNIQUE;
