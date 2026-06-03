/**
 * Dialogue REST API — DevDialogue Collector
 * Phase 1: ingestion pipeline + session listing/details/stats
 * Phase 2: search, decisions, provenance
 *
 * POST   /api/v1/dialogue/ingest
 * GET    /api/v1/dialogue/sessions
 * GET    /api/v1/dialogue/sessions/:sessionId
 * GET    /api/v1/dialogue/stats
 * POST   /api/v1/dialogue/search
 * GET    /api/v1/dialogue/decisions
 * GET    /api/v1/dialogue/decisions/provenance
 */

const express = require('express');
const router = express.Router();

// Lazy-load to avoid startup cost
let _memgraph = null;
function getMemgraph() {
  if (!_memgraph) _memgraph = require('../services/memgraph.service');
  return _memgraph;
}

let _searchService = null;
function getSearchService() {
  if (!_searchService) {
    const { DialogueSearchService } = require('../core/aopeg/plugins/dialogue/services/dialogue.search');
    const { DialogueQdrantService } = require('../core/aopeg/plugins/dialogue/services/dialogue.qdrant');
    const { EmbeddingService } = require('../services/structuring/embeddings/EmbeddingService');
    _searchService = new DialogueSearchService(
      new DialogueQdrantService(),
      getMemgraph(),
      new EmbeddingService()
    );
  }
  return _searchService;
}

let _aiSearchService = null;
function getAISearchService() {
  if (!_aiSearchService) {
    const { DialogueAISearchService } = require('../core/aopeg/plugins/dialogue/services/dialogue.ai-search');
    _aiSearchService = new DialogueAISearchService(getSearchService());
  }
  return _aiSearchService;
}

// ─── POST /ingest ─────────────────────────────────────────────────────────────

router.post('/ingest', async (req, res) => {
  const { source = 'auto', path: sourcePath, incremental = true, projectFilter } = req.body;

  if (!sourcePath) {
    return res.status(400).json({ success: false, error: 'Field "path" is required' });
  }

  try {
    const { dialogueNormalizer } = require('../core/aopeg/plugins/dialogue/services/dialogue.normalizer');
    const { dialogueSanitizeExecutor } = require('../core/aopeg/plugins/dialogue/executors/dialogue.sanitize');
    const { dialogueStoreExecutor } = require('../core/aopeg/plugins/dialogue/executors/dialogue.store');

    // Step 1 — Ingest
    let dialogues = [];
    const fs = require('fs');
    const stat = fs.statSync(sourcePath);

    if (stat.isDirectory()) {
      dialogues = dialogueNormalizer.parseClaudeCodeDirectory(sourcePath);
    } else if (sourcePath.endsWith('.jsonl')) {
      const d = dialogueNormalizer.parseClaudeCodeSession(sourcePath);
      if (d) dialogues = [d];
    } else {
      dialogues = dialogueNormalizer.parseClaudeAIExport(sourcePath);
    }

    if (projectFilter) {
      dialogues = dialogues.filter(d => d.projectPath?.includes(projectFilter));
    }

    const ingestStats = {
      sessionsFound: dialogues.length,
      totalMessages: dialogues.reduce((s, d) => s + d.messages.length, 0),
    };

    // Step 2 — Sanitize
    const sanitizeResult = await dialogueSanitizeExecutor.execute(
      { dialogues, logRedactions: false }, {}
    );
    if (!sanitizeResult.success) {
      return res.status(500).json({ success: false, error: sanitizeResult.errors[0]?.message });
    }

    // Step 3 — Store
    const storeResult = await dialogueStoreExecutor.execute(
      { dialogues: sanitizeResult.output.dialogues, generateEmbeddings: false }, {}
    );
    if (!storeResult.success) {
      return res.status(500).json({ success: false, error: storeResult.errors[0]?.message });
    }

    return res.json({
      success: true,
      stats: {
        sessionsIngested: ingestStats.sessionsFound,
        messagesProcessed: ingestStats.totalMessages,
        redactions: sanitizeResult.metadata.totalRedactions,
        memgraphCreated: storeResult.output.stored.memgraph.created,
        memgraphUpdated: storeResult.output.stored.memgraph.updated,
        processingRound: storeResult.output.processingRound,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /sessions ────────────────────────────────────────────────────────────

router.get('/sessions', async (req, res) => {
  const {
    platform,
    startDate,
    endDate,
    project,
    sort = 'startedAt_desc',
    limit = 50,
    offset = 0,
  } = req.query;

  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const off = parseInt(offset, 10) || 0;

  try {
    let conditions = [];
    const params = {};

    if (platform) {
      conditions.push('s.platform = $platform');
      params.platform = platform;
    }
    if (startDate) {
      conditions.push('s.startedAt >= $startDate');
      params.startDate = startDate;
    }
    if (endDate) {
      conditions.push('s.startedAt <= $endDate');
      params.endDate = endDate;
    }
    if (project) {
      conditions.push('s.projectPath CONTAINS $project');
      params.project = project;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const orderMap = {
      startedAt_desc: 's.startedAt DESC',
      startedAt_asc: 's.startedAt ASC',
      messageCount_desc: 's.messageCount DESC',
    };
    const orderBy = orderMap[sort] || 's.startedAt DESC';

    const neo4j = require('neo4j-driver');
    params.limit = neo4j.int(lim);
    params.offset = neo4j.int(off);

    const rows = await getMemgraph().runQuery(
      `MATCH (s:DialogueSession) ${where}
       RETURN s.sessionId AS sessionId, s.platform AS platform, s.title AS title,
              s.startedAt AS startedAt, s.updatedAt AS updatedAt,
              s.messageCount AS messageCount, s.gitBranch AS gitBranch,
              s.totalInputTokens AS inputTokens, s.totalOutputTokens AS outputTokens,
              s.summary AS summary, s.entities AS entities,
              s.lastReanalyzedAt AS lastReanalyzedAt,
              s.goals AS goals, s.goalsProgress AS goalsProgress,
              s.goalsSummary AS goalsSummary
       ORDER BY ${orderBy}
       SKIP $offset LIMIT $limit`,
      params
    );

    // Count total
    const countRows = await getMemgraph().runQuery(
      `MATCH (s:DialogueSession) ${where} RETURN count(s) AS total`,
      Object.fromEntries(Object.entries(params).filter(([k]) => !['limit', 'offset'].includes(k)))
    );
    const total = countRows[0]?.total || 0;

    return res.json({
      sessions: rows,
      pagination: { total: Number(total), limit: lim, offset: off },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /sessions/text-search ────────────────────────────────────────────────
// Fast full-text search on title + summary + entities — no TEI/embedding required.
// MUST be defined before /sessions/:sessionId to avoid Express treating 'text-search' as a param.

router.get('/sessions/text-search', async (req, res) => {
  const { q, platform, limit = 20, offset = 0 } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ success: false, error: 'Query parameter "q" is required' });
  }

  const lim = Math.min(parseInt(limit, 10) || 20, 100);
  const off = parseInt(offset, 10) || 0;
  const neo4j = require('neo4j-driver');

  try {
    const qLower = q.trim().toLowerCase();
    const conditions = [
      '(toLower(s.title) CONTAINS $q OR toLower(s.summary) CONTAINS $q OR toLower(coalesce(s.entities, "")) CONTAINS $q)',
    ];
    const params = { q: qLower, limit: neo4j.int(lim), offset: neo4j.int(off) };

    if (platform) {
      conditions.push('s.platform = $platform');
      params.platform = platform;
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await getMemgraph().runQuery(
      `MATCH (s:DialogueSession) ${where}
       RETURN s.sessionId AS sessionId, s.platform AS platform, s.title AS title,
              s.startedAt AS startedAt, s.updatedAt AS updatedAt,
              s.messageCount AS messageCount, s.gitBranch AS gitBranch,
              s.totalInputTokens AS inputTokens, s.totalOutputTokens AS outputTokens,
              s.summary AS summary, s.entities AS entities,
              s.lastReanalyzedAt AS lastReanalyzedAt,
              s.goals AS goals, s.goalsProgress AS goalsProgress,
              s.goalsSummary AS goalsSummary
       ORDER BY s.startedAt DESC
       SKIP $offset LIMIT $limit`,
      params
    );

    const countRows = await getMemgraph().runQuery(
      `MATCH (s:DialogueSession) ${where} RETURN count(s) AS total`,
      { q: qLower, ...(platform ? { platform } : {}) }
    );
    const total = countRows[0]?.total || 0;

    return res.json({
      success: true,
      query: q,
      sessions: rows,
      pagination: { total: Number(total), limit: lim, offset: off },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /sessions/:sessionId ──────────────────────────────────────────────────

router.get('/sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  try {
    const rows = await getMemgraph().runQuery(
      `MATCH (s:DialogueSession { sessionId: $sessionId }) RETURN s`,
      { sessionId }
    );

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, error: `Session ${sessionId} not found` });
    }

    const rawNode = rows[0].s || rows[0];
    const session = rawNode?.properties || rawNode;

    // Load messages from source JSONL
    let messages = [];
    const sourceFile = session.sourceFile;
    const fullContent = req.query.full === 'true';
    if (sourceFile) {
      try {
        const { dialogueNormalizer } = require('../core/aopeg/plugins/dialogue/services/dialogue.normalizer');
        const dialogue = dialogueNormalizer.parseClaudeCodeSession(sourceFile);
        if (dialogue) {
          const contentLimit = fullContent ? 10000 : 2000;
          messages = dialogue.messages
            .map(m => {
              const content = (m.text || '').slice(0, contentLimit);
              const toolUseCount = m.toolUse?.length || 0;
              return {
                messageId: m.messageId,
                role: m.role,
                participant: m.participant,
                content,
                timestamp: m.timestamp,
                toolUseCount,
                isToolOnly: !content.trim() && toolUseCount > 0,
                toolUse: m.toolUse?.slice(0, 8).map(t => ({
                  name: t.name,
                  inputSummary: JSON.stringify(t.input || {}).slice(0, 200),
                })) || [],
              };
            })
            .filter(m => m.content.trim() || m.toolUseCount > 0); // drop truly empty messages
        }
      } catch {
        // Non-fatal — return session without messages
      }
    }

    return res.json({
      session: { ...session, messages },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /sessions/:sessionId/linked-conversations ────────────────────────────

router.get('/sessions/:sessionId/linked-conversations', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const mg = require('../services/memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (s:DialogueSession {sessionId: $sid})-[:REFERENCES_CONVERSATION]->(c:LinkedConversation)
       RETURN c.conversationId AS conversationId,
              c.title AS title,
              c.messageCount AS messageCount,
              c.messages AS messages,
              c.updatedAt AS updatedAt,
              c.source AS source,
              c.firstCcTimestamp AS firstCcTimestamp`,
      { sid: sessionId }
    );

    const conversations = rows.map(r => ({
      conversationId: r.conversationId,
      title: r.title,
      messageCount: Number(r.messageCount) || 0,
      updatedAt: r.updatedAt,
      source: r.source || 'claude_ai_jsonl',
      firstCcTimestamp: r.firstCcTimestamp || null,
      webUrl: `https://claude.ai/chat/${r.conversationId}`,
      messages: (() => { try { return JSON.parse(r.messages || '[]'); } catch { return []; } })(),
    }));

    return res.json({ success: true, sessionId, conversations });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /stats ────────────────────────────────────────────────────────────────

router.get('/stats', async (req, res) => {
  try {
    const rows = await getMemgraph().runQuery(`
      MATCH (s:DialogueSession)
      RETURN
        count(s) AS totalSessions,
        sum(s.messageCount) AS totalMessages,
        sum(s.totalInputTokens + s.totalOutputTokens) AS totalTokens,
        min(s.startedAt) AS oldest,
        max(s.updatedAt) AS newest
    `);

    const platformRows = await getMemgraph().runQuery(`
      MATCH (s:DialogueSession)
      RETURN s.platform AS platform, count(s) AS count
    `);

    const byPlatform = {};
    for (const r of platformRows) {
      byPlatform[r.platform] = Number(r.count);
    }

    let redisStats = null;
    try {
      const redis = require('../services/redis.service');
      redisStats = await redis.get('dialogue:stats');
    } catch { /* non-fatal */ }

    const r = rows[0] || {};
    return res.json({
      totalSessions: Number(r.totalSessions) || 0,
      byPlatform,
      totalMessages: Number(r.totalMessages) || 0,
      totalTokens: Number(r.totalTokens) || 0,
      dateRange: { oldest: r.oldest, newest: r.newest },
      lastIngestion: redisStats?.lastProcessedAt || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /search ─────────────────────────────────────────────────────────────

router.post('/search', async (req, res) => {
  const { query, filters, limit = 20, expandGraph = true, vectorName = 'summary' } = req.body;

  if (!query) {
    return res.status(400).json({ success: false, error: 'Field "query" is required' });
  }

  try {
    const results = await getSearchService().search(query, { filters, limit, expandGraph, vectorName });
    return res.json({ success: true, query, results, count: results.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /decisions ────────────────────────────────────────────────────────────

router.get('/decisions', async (req, res) => {
  const { sessionId, category, minConfidence = 0, limit = 50 } = req.query;
  const lim = Math.min(parseInt(limit, 10) || 50, 200);
  const neo4j = require('neo4j-driver');

  try {
    const conditions = ['d.confidence >= $minConfidence'];
    const params = { minConfidence: parseFloat(minConfidence) || 0, limit: neo4j.int(lim) };

    if (sessionId) { conditions.push('d.sessionId = $sessionId'); params.sessionId = sessionId; }
    if (category) { conditions.push('d.category = $category'); params.category = category; }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const rows = await getMemgraph().runQuery(
      `MATCH (d:ArchDecision) ${where}
       RETURN d.decisionId AS decisionId, d.title AS title,
              d.category AS category, d.confidence AS confidence,
              d.status AS status, d.sessionId AS sessionId,
              d.segmentId AS segmentId, d.decision AS decision,
              d.rationale AS rationale, d.alternatives AS alternatives,
              d.consequences AS consequences, d.context AS context,
              d.namespace AS namespace, d.createdAt AS createdAt
       ORDER BY d.confidence DESC
       LIMIT $limit`,
      params
    );

    return res.json({ success: true, decisions: rows, count: rows.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /decisions/:decisionId ────────────────────────────────────────────────
// Full decision detail with session provenance and cross-references

router.get('/decisions/:decisionId', async (req, res) => {
  const { decisionId } = req.params;
  const mg = getMemgraph();

  try {
    // Decision node
    const decRows = await mg.runQuery(
      `MATCH (d:ArchDecision { decisionId: $decisionId }) RETURN d`,
      { decisionId }
    );
    if (!decRows.length) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }
    const rawNode = decRows[0].d || decRows[0];
    const d = rawNode?.properties || rawNode;

    // Session provenance
    let provenance = null;
    if (d.sessionId) {
      const sessRows = await mg.runQuery(
        `MATCH (s:DialogueSession { sessionId: $sid })
         RETURN s.sessionId AS sessionId, s.title AS title, s.platform AS platform,
                s.startedAt AS startedAt, s.gitBranch AS gitBranch, s.projectPath AS projectPath`,
        { sid: d.sessionId }
      ).catch(() => []);
      if (sessRows.length) provenance = sessRows[0];
    }

    // Segment provenance
    let segment = null;
    if (d.segmentId) {
      const segRows = await mg.runQuery(
        `MATCH (seg:DialogueSegment { segmentId: $segId })
         RETURN seg.index AS idx, seg.timeStart AS timeStart, seg.summary AS summary,
                seg.contributionType AS contributionType`,
        { segId: d.segmentId }
      ).catch(() => []);
      if (segRows.length) segment = segRows[0];
    }

    // Extract cross-references from text fields
    const allText = [d.title, d.decision, d.rationale, d.context, d.consequences]
      .filter(Boolean).join(' ');

    const refs = {
      backlog: [...new Set((allText.match(/BACKLOG-\d{3,}/g) || []))],
      codex: [...new Set((allText.match(/CODEX-RULE-[A-Z]+-\d+/g) || []))],
      tasks: [...new Set((allText.match(/TASK-[A-Z]+-[A-Z0-9]+-\d+/g) || []))],
    };

    // Extract technology tags from context + decision text
    const TECH_PATTERNS = [
      'React', 'Node\\.js', 'Express', 'Memgraph', 'Qdrant', 'Redis',
      'BullMQ', 'Vite', 'MUI', 'ReactFlow', 'Zustand', 'TypeScript',
      'JavaScript', 'Cypher', 'neo4j-driver', 'Claude', 'LLM',
      'Anthropic', 'chokidar', 'AOPEG', 'GXE', 'BackLog', 'Codex',
    ];
    const techTags = TECH_PATTERNS.filter(t => new RegExp(t, 'i').test(allText));

    return res.json({
      success: true,
      decision: {
        decisionId: d.decisionId,
        title: d.title,
        category: d.category,
        confidence: parseFloat(d.confidence) || 0,
        status: d.status,
        decision: d.decision,
        rationale: d.rationale,
        alternatives: d.alternatives,
        consequences: d.consequences,
        context: d.context,
        namespace: d.namespace,
        sessionId: d.sessionId,
        segmentId: d.segmentId,
        createdAt: d.createdAt,
      },
      provenance: { session: provenance, segment },
      crossRefs: refs,
      techTags,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /decisions/provenance ─────────────────────────────────────────────────

router.get('/decisions/provenance', async (req, res) => {
  const { query, limit = 10 } = req.query;

  if (!query) {
    return res.status(400).json({ success: false, error: 'Field "query" is required' });
  }

  try {
    const results = await getSearchService().traceDecisionProvenance(query, parseInt(limit, 10) || 10);
    return res.json({ success: true, query, results, count: results.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /sessions/:sessionId/context ─────────────────────────────────────────
// SessionContextPackage: comprehensive session data for detail view + AI assistant
//
// Structure (authoritative definition for AI-assistant context consumption):
// {
//   session:   { sessionId, title, platform, startedAt, gitBranch, summary,
//                messageCount, totalInputTokens, totalOutputTokens, model }
//   segments:  [{ index, summary, contributionType, messageCount, timeStart, timeEnd }]
//   decisions: {
//     accepted:  ArchDecision[] (confidence >= 0.7 && status=active)
//     proposed:  ArchDecision[] (confidence < 0.7 || status=proposed)
//     rejected:  ArchDecision[] (category=rejection)
//   }
//   linkedEntities: {
//     backlog:  [{ backlogId, title, status }]       via DISCUSSES
//     codex:    [{ codexId, title, category }]       via REFERENCES_RULE
//     catalog:  [{ entryId, title }]                 via REFERENCES_GRAPH
//   }
//   relatedSessions: [{ sessionId, title, platform, score, summary }]  via CONTINUES_FROM
//   thread: {
//     sessions:      [{ sessionId, platform, title, score }]  ordered chain
//     totalSessions: N
//   }
//   // For AI assistant (future): pass this entire package as system context
//   _meta: { generatedAt, dataCompleteness, hasSegmentSummaries, hasDecisions, hasLinkedEntities }
// }

router.get('/sessions/:sessionId/context', async (req, res) => {
  const { sessionId } = req.params;
  const mg = getMemgraph();

  const withTimeout = (promise, ms = 5000, fallback = null) =>
    Promise.race([promise, new Promise(resolve => setTimeout(() => resolve(fallback), ms))]);

  try {
    console.log('[context] start', sessionId);
    // 1. Session node
    const sessionRows = await withTimeout(
      mg.runQuery(`MATCH (s:DialogueSession { sessionId: $sessionId }) RETURN s`, { sessionId }),
      5000, []
    );
    console.log('[context] q1 done, rows:', sessionRows?.length);
    if (!sessionRows || !sessionRows.length) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    const rawNode = sessionRows[0].s || sessionRows[0];
    const session = rawNode?.properties || rawNode;

    // 2. Segments with summaries
    const segRows = await withTimeout(
      mg.runQuery(
        `MATCH (s:DialogueSession { sessionId: $sid })-[:HAS_SEGMENT]->(seg:DialogueSegment)
         RETURN seg.segmentId AS segmentId, seg.index AS idx, seg.summary AS summary,
                seg.messageCount AS msgCount, seg.timeStart AS timeStart, seg.timeEnd AS timeEnd,
                seg.contributionType AS contributionType
         ORDER BY seg.index LIMIT 50`,
        { sid: sessionId }
      ).catch(() => []),
      5000, []
    );
    console.log('[context] q2 done, segs:', segRows?.length);

    // 3. Decisions (split by type)
    const decRows = await withTimeout(
      mg.runQuery(
        `MATCH (d:ArchDecision { sessionId: $sid })
         RETURN d.decisionId AS decisionId, d.title AS title, d.category AS category,
                d.confidence AS confidence, d.status AS status, d.decision AS decision,
                d.rationale AS rationale, d.alternatives AS alternatives,
                d.consequences AS consequences, d.createdAt AS createdAt
         ORDER BY d.confidence DESC LIMIT 50`,
        { sid: sessionId }
      ).catch(() => []),
      5000, []
    );
    console.log('[context] q3 done, decisions:', decRows?.length);

    const decisions = { accepted: [], proposed: [], rejected: [] };
    for (const d of decRows) {
      const conf = parseFloat(d.confidence) || 0;
      if (d.category === 'rejection') {
        decisions.rejected.push(d);
      } else if (conf >= 0.7 && d.status !== 'proposed') {
        decisions.accepted.push(d);
      } else {
        decisions.proposed.push(d);
      }
    }

    // 4. Linked entities (parallel, each with own timeout)
    const [backlogRows, codexRows, catalogRows] = await Promise.all([
      withTimeout(
        mg.runQuery(
          `MATCH (s:DialogueSession { sessionId: $sid })-[:DISCUSSES]->(b)
           WHERE b.backlogId IS NOT NULL OR b.taskId IS NOT NULL
           RETURN coalesce(b.backlogId, b.taskId) AS backlogId, b.title AS title, b.status AS status
           LIMIT 20`,
          { sid: sessionId }
        ).catch(() => []),
        4000, []
      ),
      withTimeout(
        mg.runQuery(
          `MATCH (s:DialogueSession { sessionId: $sid })-[:REFERENCES_RULE]->(r:CodexRule)
           RETURN r.codexId AS codexId, r.title AS title, r.category AS category LIMIT 20`,
          { sid: sessionId }
        ).catch(() => []),
        4000, []
      ),
      withTimeout(
        mg.runQuery(
          `MATCH (s:DialogueSession { sessionId: $sid })-[:REFERENCES_GRAPH]->(e)
           RETURN coalesce(e.entryId, e.graphId) AS entryId, e.title AS title, e.graphType AS graphType
           LIMIT 20`,
          { sid: sessionId }
        ).catch(() => []),
        4000, []
      ),
    ]);

    console.log('[context] q4 done, entities:', backlogRows?.length, codexRows?.length, catalogRows?.length);
    // 5. Related sessions (CONTINUES_FROM in both directions)
    const relatedRows = await withTimeout(
      mg.runQuery(
        `MATCH (s:DialogueSession { sessionId: $sid })-[r:CONTINUES_FROM]-(other:DialogueSession)
         RETURN other.sessionId AS sessionId, other.title AS title, other.platform AS platform,
                other.startedAt AS startedAt, r.score AS score, other.summary AS summary
         ORDER BY r.score DESC LIMIT 10`,
        { sid: sessionId }
      ).catch(() => []),
      4000, []
    );

    console.log('[context] q5 done, related:', relatedRows?.length);
    // 6. Full conversation thread (anchored to this session, short depth for performance)
    const threadRows = await withTimeout(
      mg.runQuery(
        `MATCH (s:DialogueSession { sessionId: $sid })-[:CONTINUES_FROM*1..5]-(other:DialogueSession)
         RETURN DISTINCT other.sessionId AS sessionId, other.title AS title,
                other.platform AS platform, other.startedAt AS startedAt, other.summary AS summary
         ORDER BY other.startedAt LIMIT 15`,
        { sid: sessionId }
      ).catch(() => []),
      4000, []
    );
    console.log('[context] q6 done, thread:', threadRows?.length);

    // Compute data completeness for AI-assistant meta
    const hasSegmentSummaries = segRows.some(s => s.summary);
    const hasDecisions = decRows.length > 0;
    const hasLinkedEntities = backlogRows.length > 0 || codexRows.length > 0 || catalogRows.length > 0;
    const hasRelated = relatedRows.length > 0;

    return res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        title: session.title,
        platform: session.platform,
        startedAt: session.startedAt,
        updatedAt: session.updatedAt,
        gitBranch: session.gitBranch,
        model: session.model,
        projectPath: session.projectPath,
        summary: session.summary || null,
        messageCount: Number(session.messageCount) || 0,
        totalInputTokens: Number(session.totalInputTokens) || 0,
        totalOutputTokens: Number(session.totalOutputTokens) || 0,
        entities: session.entities || null,
        lastReanalyzedAt: session.lastReanalyzedAt || null,
        participants: session.participants || null,
        goals: session.goals || null,
        goalsProgress: session.goalsProgress || null,
        goalsSummary: session.goalsSummary || null,
        goalsPendingActions: session.goalsPendingActions || null,
        goalsAnalyzedAt: session.goalsAnalyzedAt || null,
      },
      segments: segRows.map(s => ({
        segmentId: s.segmentId,
        index: Number(s.idx),
        summary: s.summary || null,
        messageCount: Number(s.msgCount) || 0,
        timeStart: s.timeStart,
        timeEnd: s.timeEnd,
        contributionType: s.contributionType || 'mixed',
      })),
      decisions,
      linkedEntities: {
        backlog: backlogRows,
        codex: codexRows,
        catalog: catalogRows,
      },
      relatedSessions: relatedRows.map(r => ({
        sessionId: r.sessionId,
        title: r.title,
        platform: r.platform,
        startedAt: r.startedAt,
        score: parseFloat(r.score) || 0,
        summary: r.summary || null,
      })),
      thread: {
        sessions: threadRows,
        totalSessions: threadRows.length,
      },
      _meta: {
        generatedAt: new Date().toISOString(),
        hasSegmentSummaries,
        hasDecisions,
        hasLinkedEntities,
        hasRelated,
        // Completeness score 0-1 for AI assistant to gauge context quality
        dataCompleteness: [
          hasSegmentSummaries, hasDecisions, hasLinkedEntities, hasRelated,
          !!session.summary,
        ].filter(Boolean).length / 5,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /sessions/:sessionId/related ─────────────────────────────────────────

router.get('/sessions/:sessionId/related', async (req, res) => {
  const { sessionId } = req.params;
  const { limit = 5 } = req.query;

  try {
    const related = await getSearchService().findRelatedSessions(sessionId, parseInt(limit, 10) || 5);
    return res.json({ success: true, sessionId, related });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /analytics ───────────────────────────────────────────────────────────
// Aggregated analytics for the Analytics Dashboard
// Query params: period=7d|30d|90d|all (default: all)

router.get('/analytics', async (req, res) => {
  const { period = 'all' } = req.query;
  const mg = getMemgraph();

  const periodDays = { '7d': 7, '30d': 30, '90d': 90, all: null };
  const days = periodDays[period] ?? null;

  const now = new Date();
  const startDate = days ? new Date(now - days * 86400000).toISOString() : null;
  const prevStartDate = days ? new Date(now - 2 * days * 86400000).toISOString() : null;
  const prevEndDate = startDate;

  const wt = (p, fb = []) => Promise.race([p, new Promise(r => setTimeout(() => r(fb), 5000))]);

  try {
    const params = {};
    const periodFilter = startDate ? 'WHERE s.startedAt >= $start' : '';
    const decPeriodFilter = startDate ? 'WHERE d.createdAt >= $start' : '';
    const prevSessFilter = prevStartDate ? 'WHERE s.startedAt >= $prevStart AND s.startedAt < $prevEnd' : 'WHERE false';
    const prevDecFilter = prevStartDate ? 'WHERE d.createdAt >= $prevStart AND d.createdAt < $prevEnd' : 'WHERE false';
    if (startDate) { params.start = startDate; params.prevStart = prevStartDate; params.prevEnd = prevEndDate; }

    const [
      sessCountRows, segCountRows, decCountRows, chainCountRows,
      prevSessRows, prevDecRows,
      byCategoryRows, byStatusRows, byConfidenceRows,
      sessTimelineRows, decTimelineRows,
      platformRows,
      watcherRows,
    ] = await Promise.all([
      // Current period — separate counts
      wt(mg.runQuery(`MATCH (s:DialogueSession) ${periodFilter} RETURN count(s) AS cnt`, params).catch(() => [{ cnt: 0 }]), [{ cnt: 0 }]),
      wt(mg.runQuery('MATCH (s:DialogueSegment) RETURN count(s) AS cnt', {}).catch(() => [{ cnt: 0 }]), [{ cnt: 0 }]),
      wt(mg.runQuery(`MATCH (d:ArchDecision) ${decPeriodFilter} RETURN count(d) AS cnt`, params).catch(() => [{ cnt: 0 }]), [{ cnt: 0 }]),
      wt(mg.runQuery('MATCH ()-[r:CONTINUES_FROM]->() RETURN count(r) AS cnt', {}).catch(() => [{ cnt: 0 }]), [{ cnt: 0 }]),

      // Previous period — for trend calculation
      wt(mg.runQuery(`MATCH (s:DialogueSession) ${prevSessFilter} RETURN count(s) AS cnt`, params).catch(() => [{ cnt: 0 }]), [{ cnt: 0 }]),
      wt(mg.runQuery(`MATCH (d:ArchDecision) ${prevDecFilter} RETURN count(d) AS cnt`, params).catch(() => [{ cnt: 0 }]), [{ cnt: 0 }]),

      // Decisions by category
      wt(mg.runQuery(
        `MATCH (d:ArchDecision) ${decPeriodFilter}
         RETURN d.category AS category, count(d) AS count ORDER BY count DESC`,
        params
      ).catch(() => []), []),

      // Decisions by status
      wt(mg.runQuery(
        `MATCH (d:ArchDecision) ${decPeriodFilter}
         RETURN d.status AS status, count(d) AS count ORDER BY count DESC`,
        params
      ).catch(() => []), []),

      // Decisions by confidence bucket (0.5–1.0 in 0.1 steps)
      wt(mg.runQuery(
        `MATCH (d:ArchDecision) ${decPeriodFilter}
         WHERE d.confidence IS NOT NULL
         WITH toFloat(d.confidence) AS conf
         WITH floor(conf * 10) / 10.0 AS bucket, count(*) AS count
         RETURN bucket, count ORDER BY bucket`,
        params
      ).catch(() => []), []),

      // Sessions timeline (by day)
      wt(mg.runQuery(
        `MATCH (s:DialogueSession) ${periodFilter}
         WHERE s.startedAt IS NOT NULL
         RETURN substring(s.startedAt, 0, 10) AS date, count(s) AS sessions
         ORDER BY date`,
        params
      ).catch(() => []), []),

      // Decisions timeline (by day)
      wt(mg.runQuery(
        `MATCH (d:ArchDecision) ${decPeriodFilter}
         WHERE d.createdAt IS NOT NULL
         RETURN substring(d.createdAt, 0, 10) AS date, count(d) AS decisions
         ORDER BY date`,
        params
      ).catch(() => []), []),

      // Sessions by platform
      wt(mg.runQuery(
        `MATCH (s:DialogueSession) ${periodFilter}
         RETURN s.platform AS platform, count(s) AS count ORDER BY count DESC`,
        params
      ).catch(() => []), []),

      // Watcher status from metrics service
      wt(
        (async () => {
          try {
            const { getDialogueMetrics } = require('../core/aopeg/plugins/dialogue/services/dialogue.metrics');
            const m = getDialogueMetrics();
            const snap = await m.collectSnapshot();
            return [{ sessions: snap.sessions, lastIngestion: snap.lastIngestion }];
          } catch { return []; }
        })(),
        null
      ),
    ]);

    // Merge session + decision timelines by date
    const timelineMap = {};
    for (const r of sessTimelineRows) {
      timelineMap[r.date] = { date: r.date, sessions: Number(r.sessions) || 0, decisions: 0 };
    }
    for (const r of decTimelineRows) {
      if (timelineMap[r.date]) timelineMap[r.date].decisions = Number(r.decisions) || 0;
      else timelineMap[r.date] = { date: r.date, sessions: 0, decisions: Number(r.decisions) || 0 };
    }
    const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

    const curSessions = Number(sessCountRows[0]?.cnt) || 0;
    const curSegments = Number(segCountRows[0]?.cnt) || 0;
    const curDecisions = Number(decCountRows[0]?.cnt) || 0;
    const curChains = Number(chainCountRows[0]?.cnt) || 0;
    const prevSessions = Number(prevSessRows[0]?.cnt) || 0;
    const prevDecisions = Number(prevDecRows[0]?.cnt) || 0;

    const trend = (cur, prev) => {
      if (!prev) return null;
      return Math.round(((cur - prev) / prev) * 100);
    };

    return res.json({
      success: true,
      period,
      generatedAt: now.toISOString(),
      totals: {
        sessions: curSessions,
        segments: curSegments,
        decisions: curDecisions,
        chains: curChains,
        trends: {
          sessions: trend(curSessions, prevSessions),
          decisions: trend(curDecisions, prevDecisions),
        },
      },
      byCategory: byCategoryRows.map(r => ({ category: r.category || 'unknown', count: Number(r.count) || 0 })),
      byStatus: byStatusRows.map(r => ({ status: r.status || 'unknown', count: Number(r.count) || 0 })),
      byConfidence: byConfidenceRows.map(r => ({
        bucket: `${Math.round(Number(r.bucket) * 10) / 10}–${Math.round((Number(r.bucket) + 0.1) * 10) / 10}`,
        count: Number(r.count) || 0,
      })),
      timeline,
      byPlatform: platformRows.map(r => ({ platform: r.platform || 'unknown', count: Number(r.count) || 0 })),
      watcherStatus: watcherRows?.[0] || null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /metrics ──────────────────────────────────────────────────────────────

router.get('/metrics', async (_req, res) => {
  try {
    const { getDialogueMetrics } = require('../core/aopeg/plugins/dialogue/services/dialogue.metrics');
    const collector = getDialogueMetrics();
    const [snapshot, inMemory] = await Promise.all([
      collector.collectSnapshot(),
      Promise.resolve(collector.getInMemoryMetrics()),
    ]);
    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      dialogue: { ...snapshot, runtime: inMemory },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /related/backlog/:backlogId ──────────────────────────────────────────
// Sessions that DISCUSS a specific BackLog item

router.get('/related/backlog/:backlogId', async (req, res) => {
  const { backlogId } = req.params;
  const mg = getMemgraph();

  try {
    const rows = await mg.runQuery(
      `MATCH (s:DialogueSession)-[rel:DISCUSSES]->(b:BackLogItem)
       WHERE b.backlogId = $backlogId
       RETURN s.sessionId AS sessionId, s.title AS title,
              s.platform AS platform, s.startedAt AS startedAt,
              s.updatedAt AS updatedAt, s.messageCount AS messageCount,
              s.gitBranch AS gitBranch, s.summary AS summary,
              rel.mentions AS mentions
       ORDER BY s.startedAt DESC`,
      { backlogId }
    );

    const sessions = rows.map(r => ({
      sessionId: r.sessionId,
      title: r.title,
      platform: r.platform,
      startedAt: r.startedAt,
      updatedAt: r.updatedAt,
      messageCount: Number(r.messageCount) || 0,
      gitBranch: r.gitBranch || null,
      summary: r.summary || null,
      mentions: r.mentions != null ? Number(r.mentions) : null,
    }));

    return res.json({ success: true, backlogId, sessions, total: sessions.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /provenance/decision/:decisionId ─────────────────────────────────────
// Decision SUPERSEDES chain: ancestors (decisions this one supersedes) +
// descendants (decisions that supersede this one)

router.get('/provenance/decision/:decisionId', async (req, res) => {
  const { decisionId } = req.params;
  const mg = getMemgraph();

  const withTimeout = (p, ms = 4000, fb = []) =>
    Promise.race([p, new Promise(r => setTimeout(() => r(fb), ms))]);

  try {
    // Current decision node
    const curRows = await mg.runQuery(
      `MATCH (d:ArchDecision { decisionId: $decisionId })
       RETURN d.decisionId AS decisionId, d.title AS title, d.category AS category,
              d.confidence AS confidence, d.status AS status, d.createdAt AS createdAt,
              d.sessionId AS sessionId`,
      { decisionId }
    );
    if (!curRows.length) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }
    const current = curRows[0];

    // Direct ancestors: decisions this one supersedes (single hop for Memgraph compatibility)
    const ancestorRows = await withTimeout(mg.runQuery(
      `MATCH (d:ArchDecision { decisionId: $decisionId })-[:SUPERSEDES]->(anc:ArchDecision)
       RETURN anc.decisionId AS decisionId, anc.title AS title, anc.category AS category,
              anc.confidence AS confidence, anc.status AS status, anc.createdAt AS createdAt,
              anc.sessionId AS sessionId`,
      { decisionId }
    ).catch(() => []), 6000, []);

    // Direct descendants: decisions that supersede this one
    const descendantRows = await withTimeout(mg.runQuery(
      `MATCH (desc:ArchDecision)-[:SUPERSEDES]->(d:ArchDecision { decisionId: $decisionId })
       RETURN desc.decisionId AS decisionId, desc.title AS title, desc.category AS category,
              desc.confidence AS confidence, desc.status AS status, desc.createdAt AS createdAt,
              desc.sessionId AS sessionId`,
      { decisionId }
    ).catch(() => []), 6000, []);

    // Build edges from results directly (no extra query needed)
    const edgeRows = [
      ...ancestorRows.map(r => ({ from: decisionId, to: r.decisionId })),
      ...descendantRows.map(r => ({ from: r.decisionId, to: decisionId })),
    ];

    const mapNode = r => ({
      decisionId: r.decisionId,
      title: r.title,
      category: r.category,
      confidence: parseFloat(r.confidence) || 0,
      status: r.status || 'proposed',
      createdAt: r.createdAt || null,
      sessionId: r.sessionId || null,
    });

    return res.json({
      success: true,
      type: 'decision',
      current: mapNode(current),
      ancestors: ancestorRows.map(mapNode),
      descendants: descendantRows.map(mapNode),
      edges: edgeRows.map(r => ({ from: r.from, to: r.to })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── GET /provenance/session/:sessionId ───────────────────────────────────────
// Session CONTINUES_FROM chain: ancestor sessions + descendant sessions

router.get('/provenance/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const mg = getMemgraph();

  const withTimeout = (p, ms = 6000, fb = []) =>
    Promise.race([p, new Promise(r => setTimeout(() => r(fb), ms))]);

  try {
    // Current session
    const curRows = await mg.runQuery(
      `MATCH (s:DialogueSession { sessionId: $sessionId })
       RETURN s.sessionId AS sessionId, s.title AS title, s.platform AS platform,
              s.startedAt AS startedAt, s.messageCount AS messageCount, s.gitBranch AS gitBranch,
              s.summary AS summary`,
      { sessionId }
    );
    if (!curRows.length) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    const current = curRows[0];

    // Direct ancestors (sessions this one continues from) — single hop avoids Memgraph var-path timeout
    const ancestorRows = await withTimeout(mg.runQuery(
      `MATCH (cur:DialogueSession { sessionId: $sessionId })-[r:CONTINUES_FROM]->(anc:DialogueSession)
       RETURN anc.sessionId AS sessionId, anc.title AS title, anc.platform AS platform,
              anc.startedAt AS startedAt, anc.messageCount AS messageCount, anc.gitBranch AS gitBranch,
              anc.summary AS summary, r.score AS edgeScore
       ORDER BY r.score DESC LIMIT 20`,
      { sessionId }
    ).catch(() => []), 6000, []);

    // Direct descendants (sessions that continue from this one)
    const descendantRows = await withTimeout(mg.runQuery(
      `MATCH (desc:DialogueSession)-[r:CONTINUES_FROM]->(cur:DialogueSession { sessionId: $sessionId })
       RETURN desc.sessionId AS sessionId, desc.title AS title, desc.platform AS platform,
              desc.startedAt AS startedAt, desc.messageCount AS messageCount, desc.gitBranch AS gitBranch,
              desc.summary AS summary, r.score AS edgeScore
       ORDER BY r.score DESC LIMIT 20`,
      { sessionId }
    ).catch(() => []), 6000, []);

    // Collect edges (ancestor edges: cur→anc, descendant edges: desc→cur)
    const directEdgeRows = [
      ...ancestorRows.map(r => ({ from: sessionId, to: r.sessionId, score: r.edgeScore })),
      ...descendantRows.map(r => ({ from: r.sessionId, to: sessionId, score: r.edgeScore })),
    ];

    const mapSession = r => ({
      sessionId: r.sessionId,
      title: r.title || 'Untitled session',
      platform: r.platform || 'claude_code',
      startedAt: r.startedAt || null,
      messageCount: Number(r.messageCount) || 0,
      gitBranch: r.gitBranch || null,
      summary: r.summary || null,
    });

    return res.json({
      success: true,
      type: 'session',
      current: mapSession(current),
      ancestors: ancestorRows.map(mapSession),
      descendants: descendantRows.map(mapSession),
      edges: directEdgeRows.map(r => ({ from: r.from, to: r.to, score: parseFloat(r.score) || null })).filter(e => e.from && e.to),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /ai-search ──────────────────────────────────────────────────────────

router.post('/ai-search', async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ success: false, error: 'Field "query" is required' });
  try {
    const result = await getAISearchService().search(query);
    return res.json({ success: true, query, ...result, count: result.results.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /sessions/:sessionId/reanalyze ──────────────────────────────────────

router.post('/sessions/:sessionId/reanalyze', async (req, res) => {
  const { sessionId } = req.params;
  const { model } = req.body || {};

  let ws = null;
  try { ws = require('../services/websocket').websocketService; } catch { /* non-fatal */ }

  const emit = (step, total, label, status = 'running', result = null) => {
    try {
      ws?.broadcastAll({ type: 'dialogue:reanalyze', sessionId, step, total, label, status, result });
    } catch { /* non-fatal */ }
  };

  // ── Claude Code agent path ──────────────────────────────────────────────────
  if (model === 'claude-code') {
    try {
      const { reanalyzeWithClaudeCode, persistAnalysis } = require('../services/agents/claude-code-reanalyze.service');
      const { dialogueNormalizer } = require('../core/aopeg/plugins/dialogue/services/dialogue.normalizer');
      const { buildSmartTranscript } = require('../core/aopeg/plugins/dialogue/services/dialogue.transcript-builder');
      const mg = require('../services/memgraph.service');

      // Fetch session transcript
      emit(1, 5, 'Loading session transcript…');
      const sessRows = await mg.runQuery(
        'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.sourceFile AS sf',
        { sid: sessionId }
      );
      const sourceFile = sessRows[0]?.sf;
      let transcript = '';
      if (sourceFile) {
        const dialogue = dialogueNormalizer.parseClaudeCodeSession(sourceFile);
        if (dialogue?.messages?.length) {
          transcript = buildSmartTranscript(dialogue.messages);
        }
      }
      if (!transcript) {
        // Fallback: use stored segment summaries
        const segRows = await mg.runQuery(
          `MATCH (s:DialogueSession {sessionId: $sid})-[:HAS_SEGMENT]->(seg:DialogueSegment)
           RETURN seg.summary AS summary ORDER BY seg.index`,
          { sid: sessionId }
        );
        transcript = segRows.map(r => r.summary).filter(Boolean).join('\n\n');
      }
      if (!transcript) {
        return res.status(400).json({ success: false, error: 'No transcript content found for session' });
      }

      // Run Claude Code agent
      const { analysis, rawResult, cost } = await reanalyzeWithClaudeCode(
        sessionId, transcript, { emit, model: undefined /* use service default */ }
      );

      // Persist results
      await persistAnalysis(sessionId, analysis);

      // Persist timestamp
      await mg.runQuery(
        'MATCH (s:DialogueSession {sessionId: $sid}) SET s.lastReanalyzedAt = $ts',
        { sid: sessionId, ts: new Date().toISOString() }
      ).catch(() => { /* non-fatal */ });

      const gCnt = analysis?.goals?.length || 0;
      const dCnt = analysis?.decisions?.length || 0;
      const eCnt = analysis?.entities?.length || 0;
      emit(5, 5, 'Re-analysis complete', 'done',
        `${gCnt} goals · ${dCnt} decisions · ${eCnt} entities · cost $${(cost || 0).toFixed(3)}`);

      return res.json({
        success: true, sessionId,
        reanalyzedAt: new Date().toISOString(),
        model: 'claude-code',
        stats: {
          goalsFound: analysis?.goals?.length || 0,
          decisionsExtracted: analysis?.decisions?.length || 0,
          entitiesFound: analysis?.entities?.length || 0,
          cost,
        },
      });
    } catch (err) {
      emit(0, 5, err.message, 'error');
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  try {
    const { dialogueSummarizeExecutor }          = require('../core/aopeg/plugins/dialogue/executors/dialogue.summarize');
    const { dialogueExtractEntitiesExecutor }    = require('../core/aopeg/plugins/dialogue/executors/dialogue.extract_entities');
    const { dialogueExtractDecisionsExecutor }   = require('../core/aopeg/plugins/dialogue/executors/dialogue.extract_decisions');
    const { dialogueExtractMcpConversationsExecutor } = require('../core/aopeg/plugins/dialogue/executors/dialogue.extract_mcp_conversations');
    const { dialogueExtractGoalsExecutor }       = require('../core/aopeg/plugins/dialogue/executors/dialogue.extract_goals');
    const { dialogueNormalizer }                 = require('../core/aopeg/plugins/dialogue/services/dialogue.normalizer');
    const { buildGoalsTranscript, buildSmartTranscript, transcriptStats } = require('../core/aopeg/plugins/dialogue/services/dialogue.transcript-builder');
    const mg = require('../services/memgraph.service');

    // ── Step 1: extract linked Claude.ai conversations (must run first) ────────
    emit(1, 5, 'Extracting linked Claude.ai conversations…');
    const convRes   = await dialogueExtractMcpConversationsExecutor.execute({ sessionId }, {});
    const convStats = convRes?.output || {};
    const linkedMessages      = convStats.linkedMessages      || [];
    const linkedConversations = convStats.linkedConversations || [];
    emit(1, 5, 'Linked conversations extracted', 'done',
      convStats.conversationsFound > 0
        ? `${convStats.conversationsFound} conversation${convStats.conversationsFound > 1 ? 's' : ''} · ${convStats.messagesExtracted} messages`
        : 'No linked conversations found');

    // ── Build merged transcript ─────────────────────────────────────────────────
    // Load the Claude Code session messages from JSONL
    let codeMessages = [];
    try {
      const sessRows = await mg.runQuery(
        'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.sourceFile AS sf',
        { sid: sessionId }
      );
      const sourceFile = sessRows[0]?.sf;
      if (sourceFile) {
        const dialogue = dialogueNormalizer.parseClaudeCodeSession(sourceFile);
        codeMessages = dialogue?.messages || [];
      }
    } catch { /* non-fatal — analysis continues with linked only */ }

    // Merge + sort chronologically
    const linkedNorm = linkedMessages.map(m => ({
      participant: m.participant || m.role,
      content:     m.content || '',
      timestamp:   m.timestamp || null,
      source:      'claude_ai_linked',
    }));
    const codeNorm = codeMessages.map(m => ({
      participant: m.participant || m.role,
      content:     m.text || '',
      timestamp:   m.timestamp || null,
      source:      'claude_code',
    }));
    const allMerged = [...codeNorm, ...linkedNorm].sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });

    // smartTranscript: text + compact tool markers (for entities/decisions — action context matters)
    // goalsTranscript: text only from all participants, sampled B+M+E (goals live in conversation, not tool outputs)
    const smartTranscript = buildSmartTranscript(codeMessages.length ? codeMessages : allMerged);
    const goalsTranscript = buildGoalsTranscript(allMerged);
    console.log(`[reanalyze] ${sessionId.slice(0,8)}: smart=${transcriptStats(
      allMerged.map(m=>m.content||'').join(''), smartTranscript
    )}, goals=${transcriptStats(allMerged.map(m=>m.content||'').join(''), goalsTranscript)}`);

    // legacy name kept for backwards compat with entities/decisions executors
    const mergedText = smartTranscript;

    // ── Detect + store participants ─────────────────────────────────────────────
    const participants = [
      { type: 'user',        label: 'User',        icon: 'person' },
      {
        type:       'claude_code',
        label:      'Claude Code',
        icon:       'code',
        sessionId,
        vsCodeUrl:  `vscode://devdialogue.connector/open/${sessionId}`,
      },
      ...linkedConversations.map(c => ({
        type:           'claude_ai',
        label:          c.title || `Claude.ai Chat`,
        icon:           'chat',
        conversationId: c.conversationId,
        webUrl:         c.webUrl || `https://claude.ai/chat/${c.conversationId}`,
      })),
    ];
    try {
      await mg.runQuery(
        `MATCH (s:DialogueSession {sessionId: $sid})
         SET s.participants = $parts, s.participantCount = $count`,
        { sid: sessionId, parts: JSON.stringify(participants), count: participants.length }
      );
    } catch { /* non-fatal */ }

    // ── Step 2: summarize (Claude Code segments — keep as-is) ──────────────────
    emit(2, 5, 'Generating session summary…');
    const sumRes  = await dialogueSummarizeExecutor.execute({ sessionId, level: 'session', useLLM: true, model }, {});
    const sumStats = sumRes?.output?.stats || {};
    const usedLLM  = (sumStats.llmCalls || 0) > 0;
    emit(2, 5, 'Session summary', 'done',
      `${sumStats.segmentsSummarized || 0} segments${usedLLM ? ' · via LLM' : ' · heuristic'}`);

    // ── Step 3: extract entities from merged transcript ─────────────────────────
    emit(3, 5, 'Extracting entities from merged dialogue…');
    const entRes    = await dialogueExtractEntitiesExecutor.execute(
      { sessionId, useLLM: true, text: mergedText || undefined, model }, {}
    );
    const entities  = entRes?.output?.entities || [];
    const entUsedLLM = entRes?.output?.usedLLM === true;
    const byType    = entities.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});
    const typeStr   = Object.entries(byType).map(([t, n]) => `${n} ${t}`).join(', ');
    emit(3, 5, 'Entities extracted', 'done',
      entities.length > 0
        ? `${entities.length} found · ${typeStr}${entUsedLLM ? ' · via LLM' : ''}`
        : '0 found');

    // ── Step 4: extract decisions from merged transcript ───────────────────────
    emit(4, 5, 'Extracting decisions from merged dialogue…');
    const decParams = mergedText
      ? { sessionId, useLLM: true, minConfidence: 0.45, mergedText, model }
      : { sessionId, useLLM: true, minConfidence: 0.45, model };
    const decRes   = await dialogueExtractDecisionsExecutor.execute(decParams, {});
    const decStats = decRes?.output?.stats || {};
    const decTotal = decStats.decisionsExtracted || 0;
    const highConf = decStats.byConfidence?.high || 0;
    const medConf  = decStats.byConfidence?.medium || 0;
    emit(4, 5, 'Decisions extracted', 'done',
      decTotal > 0
        ? `${decTotal} found · ${highConf} high · ${medConf} medium confidence`
        : '0 found in this session');

    // ── Step 5: extract goals from merged transcript ───────────────────────────
    emit(5, 5, 'Extracting goals and progress…');
    const goalsRes    = await dialogueExtractGoalsExecutor.execute(
      { sessionId, mergedText: goalsTranscript || undefined, model }, {}
    );
    const goalsOut    = goalsRes?.output || {};
    const goalsFound  = goalsOut.goalsFound || 0;
    const goalsProgress = goalsOut.overallProgress || 'unknown';
    const byStatus    = goalsOut.byStatus || {};
    emit(5, 5, 'Goals extracted', 'done',
      goalsFound > 0
        ? `${goalsFound} goals · progress=${goalsProgress} · achieved=${byStatus.achieved || 0}`
        : '0 goals found');

    // ── Persist timestamp ───────────────────────────────────────────────────────
    const reanalyzedAt = new Date().toISOString();
    try {
      await mg.runQuery(
        'MATCH (s:DialogueSession {sessionId: $sid}) SET s.lastReanalyzedAt = $ts',
        { sid: sessionId, ts: reanalyzedAt }
      );
    } catch { /* non-fatal */ }

    const finalStats = {
      segmentsSummarized:    sumStats.segmentsSummarized || 0,
      usedLLM:               usedLLM || entUsedLLM,
      entitiesFound:         entities.length,
      decisionsExtracted:    decTotal,
      highConfidenceDecisions: highConf,
      conversationsLinked:   convStats.conversationsFound || 0,
      participants:          participants.length,
      goalsFound,
      goalsProgress,
    };

    emit(5, 5, 'Re-analysis complete', 'done', JSON.stringify(finalStats));

    // Knowledge map refresh — fire-and-forget
    if (entities.length > 0) {
      Promise.resolve().then(async () => {
        try {
          const { dialogueKnowledgeLayoutExecutor } = require('../core/aopeg/plugins/dialogue/executors/dialogue.knowledge-layout');
          await dialogueKnowledgeLayoutExecutor.execute({}, {});
        } catch { /* non-fatal */ }
      });
    }

    return res.json({ success: true, sessionId, reanalyzedAt, stats: finalStats });
  } catch (err) {
    emit(0, 5, err.message, 'error');
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /sessions/:sessionId/analyze-goals ──────────────────────────────────
// Standalone goals analysis — builds merged transcript + calls goals executor.
// Useful as a targeted operation without running the full 5-step reanalyze pipeline.

router.post('/sessions/:sessionId/analyze-goals', async (req, res) => {
  const { sessionId } = req.params;

  let ws = null;
  try { ws = require('../services/websocket').websocketService; } catch { /* non-fatal */ }

  const emit = (step, total, label, status = 'running', result = null) => {
    try {
      ws?.broadcastAll({ type: 'dialogue:reanalyze', sessionId, step, total, label, status, result });
    } catch { /* non-fatal */ }
  };

  try {
    const { reanalyzeWithClaudeCode, persistAnalysis } = require('../services/agents/claude-code-reanalyze.service');
    const { dialogueNormalizer }   = require('../core/aopeg/plugins/dialogue/services/dialogue.normalizer');
    const { buildGoalsTranscript } = require('../core/aopeg/plugins/dialogue/services/dialogue.transcript-builder');
    const mg = require('../services/memgraph.service');

    // Load transcript from JSONL (goals-focused: text only, B+M+E sampled)
    const sessRows = await mg.runQuery(
      'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.sourceFile AS sf',
      { sid: sessionId }
    );
    const sourceFile = sessRows[0]?.sf;
    let transcript = '';
    if (sourceFile) {
      const dialogue = dialogueNormalizer.parseClaudeCodeSession(sourceFile);
      if (dialogue?.messages?.length) {
        transcript = buildGoalsTranscript(dialogue.messages);
      }
    }
    if (!transcript) {
      const segRows = await mg.runQuery(
        `MATCH (s:DialogueSession {sessionId: $sid})-[:HAS_SEGMENT]->(seg:DialogueSegment)
         RETURN seg.summary AS summary ORDER BY seg.index`,
        { sid: sessionId }
      );
      transcript = segRows.map(r => r.summary).filter(Boolean).join('\n\n');
    }
    if (!transcript) {
      return res.status(400).json({ success: false, error: 'No transcript content found for session' });
    }

    // Run via Claude Code agent subprocess (streams progress via WebSocket)
    console.log(`[analyze-goals] ${sessionId.slice(0, 8)}: running via Claude Code agent`);
    const { analysis } = await reanalyzeWithClaudeCode(sessionId, transcript, { emit });

    // Persist all extracted data (goals + decisions + entities + summary)
    await persistAnalysis(sessionId, analysis);

    const goals           = analysis?.goals           || [];
    const overallProgress = analysis?.overallProgress || 'not_started';

    return res.json({
      success:         true,
      sessionId,
      goalsFound:      goals.length,
      overallProgress,
      goals,
      pendingActions:  [],
      summary:         analysis?.summary || '',
      analyzedAt:      new Date().toISOString(),
    });
  } catch (err) {
    emit(0, 5, err.message, 'error');
    console.error(`[analyze-goals] error: ${err.message}`);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DevCollector Open-Tasks Report ──────────────────────────────────────────
// Namespace: CORE / Section: DevCollector
// Stored as a singleton DevCollectorReport node in Memgraph.

/**
 * GET /devcollector/report
 * Load the last-saved open-tasks report.
 */
router.get('/devcollector/report', async (req, res) => {
  try {
    const { loadReport } = require('../core/aopeg/plugins/dialogue/services/dialogue.open-tasks-report');
    const report = await loadReport();
    return res.json({ success: true, report: report || null });
  } catch (err) {
    console.error('[devcollector/report]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /devcollector/analyze
 * Body: { model?: string }
 * Run a fresh analysis of all sessions with open tasks; persist & return result.
 */
router.post('/devcollector/analyze', async (req, res) => {
  const model = req.body?.model || process.env.SUMMARY_MODEL || 'claude-sonnet-4-6';
  try {
    const svc = require('../core/aopeg/plugins/dialogue/services/dialogue.open-tasks-report');

    // ── Claude Code mode: prepare data, store as pending request, return immediately ──
    if (model === 'claude-code') {
      const prepared = await svc.prepareAnalysisData();
      if (prepared.empty) {
        return res.json({ success: true, pending: false, report: {
          summary: 'No open tasks found.', tasks: [], sessionCount: 0, openTaskCount: 0,
        }});
      }
      await svc.savePendingRequest(prepared.text, prepared.sessionCount, prepared.openTaskCount);
      return res.json({
        success: true,
        pending: true,
        sessionCount:  prepared.sessionCount,
        openTaskCount: prepared.openTaskCount,
        message: 'Analysis queued. In Claude Code: call devcollector_get_analysis_request, analyze, then devcollector_submit_analysis.',
      });
    }

    // ── LLM mode: call model directly ─────────────────────────────────────────
    const report     = await svc.runOpenTasksAnalysis(model);
    const analyzedAt = new Date().toISOString();
    if (report.tasks.length > 0) {
      await svc.saveReport(report, model, analyzedAt);
    }
    return res.json({ success: true, report: { ...report, analyzedAt, model } });
  } catch (err) {
    console.error('[devcollector/analyze]', err.message);
    if (err.message === 'LLM_QUOTA_EXHAUSTED') {
      return res.status(402).json({ success: false, error: 'Anthropic API credit balance is too low. Please top up at console.anthropic.com.', code: 'LLM_QUOTA_EXHAUSTED' });
    }
    if (err.message === 'LLM_AUTH_ERROR') {
      return res.status(401).json({ success: false, error: 'Anthropic API authentication failed. Check ANTHROPIC_API_KEY.', code: 'LLM_AUTH_ERROR' });
    }
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DevCollector: submit analysis from Claude Code ──────────────────────────

/**
 * GET /devcollector/analyze-request
 * Returns the current pending analysis request (formatted session data for Claude Code).
 */
router.get('/devcollector/analyze-request', async (req, res) => {
  try {
    const { loadPendingRequest } = require('../core/aopeg/plugins/dialogue/services/dialogue.open-tasks-report');
    const req_ = await loadPendingRequest();
    if (!req_) return res.json({ success: true, request: null });
    return res.json({ success: true, request: req_ });
  } catch (err) {
    console.error('[devcollector/analyze-request]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /devcollector/analyze-submit
 * Body: { summary, tasks, sessionCount, openTaskCount, model? }
 * Called by Claude Code after running the analysis manually.
 */
router.post('/devcollector/analyze-submit', async (req, res) => {
  try {
    const { summary, tasks, sessionCount, openTaskCount } = req.body || {};
    if (!summary || !Array.isArray(tasks)) {
      return res.status(400).json({ success: false, error: '"summary" and "tasks" array are required' });
    }
    const { saveReport, markRequestDone } = require('../core/aopeg/plugins/dialogue/services/dialogue.open-tasks-report');
    const model      = req.body.model || 'claude-code';
    const analyzedAt = new Date().toISOString();
    const report     = { summary, tasks, sessionCount: sessionCount || 0, openTaskCount: openTaskCount || tasks.length };
    await saveReport(report, model, analyzedAt);
    await markRequestDone().catch(() => {});
    return res.json({ success: true, report: { ...report, analyzedAt, model } });
  } catch (err) {
    console.error('[devcollector/analyze-submit]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── DevCollector: Prepare Claude Code task session ──────────────────────────
// Builds a task-briefing markdown file and returns a vscode:// URI to open it.

/**
 * POST /devcollector/prepare-session
 * Body: { rank: number }          — pick task by rank from saved report
 *       { sessionId: string }     — optionally add source session context header
 * Returns: { prompt, filePath, vsCodeUri, task }
 */
router.post('/devcollector/prepare-session', async (req, res) => {
  const rank = Number(req.body?.rank);
  if (!rank || rank < 1) {
    return res.status(400).json({ success: false, error: '"rank" (integer ≥ 1) is required' });
  }

  try {
    const path = require('path');
    const fs   = require('fs');
    const { loadReport } = require('../core/aopeg/plugins/dialogue/services/dialogue.open-tasks-report');
    const { dialogueNavigator } = require('../core/aopeg/plugins/dialogue/services/dialogue.navigator');

    const report = await loadReport();
    if (!report?.tasks?.length) {
      return res.status(404).json({ success: false, error: 'No DevCollector report found. Run analysis first.' });
    }

    const task = report.tasks.find(t => t.rank === rank);
    if (!task) {
      return res.status(404).json({ success: false, error: `Task with rank ${rank} not found in report (${report.tasks.length} tasks total)` });
    }

    // ── Build the task briefing markdown ──────────────────────────────────────

    const depsSection = task.dependencies?.length
      ? `\n## Dependencies\n${task.dependencies.map(d => `- ${d}`).join('\n')}\n`
      : '';

    const prompt = `# Task Briefing — ${task.title}

**Rank**: ${task.rank} of ${report.tasks.length}  |  **Category**: ${task.category}  |  **Status**: ${task.status}
**Source session**: ${task.sessionTitle || task.sessionId}

---

## What needs to be done
${task.description}

## Why this matters
${task.importance}

## Why at rank #${task.rank}
${task.order_rationale}
${depsSection}
---

## Context retrieval via MCP

Before starting, call these MCP tools to get full context:

\`\`\`
// 1. Get full DevCollector backlog report
devcollector_get_report()

// 2. Get source session context
devcollector_get_session_context({ sessionId: "${task.sessionId}" })

// 3. Search for related project knowledge
search_knowledge({ query: "${task.title}" })

// 4. Get project conventions
get_project_context()
\`\`\`

## Instructions

1. Call \`devcollector_get_session_context\` with the sessionId above — this shows the full goal list and entities from the session where this task was identified.
2. Call \`search_knowledge\` to find any existing knowledge relevant to this task.
3. Call \`get_project_context\` to review coding conventions before writing code.
4. Implement the task following project conventions (namespace separation, graph-first, etc.).
5. When done, update the task status via the DevCollector UI.

---
*Generated by DevCollector · ${new Date().toISOString()} · Model: ${report.model || 'unknown'}*
`;

    // ── Write briefing file ───────────────────────────────────────────────────

    const briefDir  = path.resolve(__dirname, '../../..', '..', '.claude', 'task-briefs');
    fs.mkdirSync(briefDir, { recursive: true });

    const safeTitle = (task.title || 'task')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const fileName  = `task-${task.rank}-${safeTitle}.md`;
    const filePath  = path.join(briefDir, fileName);
    fs.writeFileSync(filePath, prompt, 'utf8');

    const vsCodeUri = dialogueNavigator.buildFileUri(filePath);

    return res.json({
      success: true,
      task:       { rank: task.rank, title: task.title, sessionId: task.sessionId },
      prompt,
      filePath,
      vsCodeUri,
    });
  } catch (err) {
    console.error('[devcollector/prepare-session]', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── TAGS ─────────────────────────────────────────────────────────────────────

/**
 * GET /sessions/:sessionId/tags — list tags on a session
 */
router.get('/sessions/:sessionId/tags', async (req, res) => {
  try {
    const mg = require('../services/memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (s:DialogueSession {sessionId: $sid})-[:TAGGED_AS]->(t:DialogueTag)
       RETURN collect(t.name) AS tags`,
      { sid: req.params.sessionId }
    );
    return res.json({ success: true, sessionId: req.params.sessionId, tags: rows[0]?.tags || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /sessions/:sessionId/tags — add tags
 * Body: { tags: string[], bookmarked?: boolean }
 */
router.post('/sessions/:sessionId/tags', async (req, res) => {
  const { tags = [], bookmarked } = req.body;
  const { sessionId } = req.params;
  try {
    const { dialogueTagExecutor } = require('../core/aopeg/plugins/dialogue/executors/dialogue.tag');
    const result = await dialogueTagExecutor.execute({ sessionId, tags, bookmarked }, {});
    return res.json({ success: true, ...result.output });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /sessions/:sessionId/tags — remove tags
 * Body: { tags: string[] }
 */
router.delete('/sessions/:sessionId/tags', async (req, res) => {
  const { tags = [] } = req.body;
  const { sessionId } = req.params;
  try {
    const { dialogueTagExecutor } = require('../core/aopeg/plugins/dialogue/executors/dialogue.tag');
    const result = await dialogueTagExecutor.execute({ sessionId, tags, remove: true }, {});
    return res.json({ success: true, ...result.output });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /tags — list all tags with session counts
 */
router.get('/tags', async (req, res) => {
  try {
    const mg = require('../services/memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (t:DialogueTag)<-[:TAGGED_AS]-(s:DialogueSession)
       RETURN t.name AS tag, count(s) AS sessionCount
       ORDER BY sessionCount DESC`
    );
    return res.json({ success: true, tags: rows.map(r => ({ tag: r.tag, sessionCount: r.sessionCount })) });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ─── NAVIGATE: open VS Code tabs from browser / HTTP ─────────────────────────

let _navigator = null;
function getNavigator() {
  if (!_navigator) {
    const { dialogueNavigator } = require('../core/aopeg/plugins/dialogue/services/dialogue.navigator');
    _navigator = dialogueNavigator;
  }
  return _navigator;
}

/**
 * GET /navigate/status
 * Check VS Code connectivity status.
 */
router.get('/navigate/status', (_req, res) => {
  const nav = getNavigator();
  const vsCodeRunning = nav.isVSCodeRunning();
  return res.json({
    success: true,
    vsCodeRunning,
    connectorUri: 'vscode://devdialogue.connector',
    platform: process.platform,
  });
});

/**
 * GET /navigate/open/:sessionId
 * Open a Claude Code tab for the given session.
 * Designed to be called from browser links, the DevDialogue UI, or MCP tools.
 */
router.get('/navigate/open/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const nav = getNavigator();

  // Verify session exists in Memgraph before opening
  let sessionTitle = null;
  try {
    const mg = require('../services/memgraph.service');
    const rows = await mg.runQuery(
      'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.aiTitle AS title, s.cwd AS cwd LIMIT 1',
      { sid: sessionId }
    );
    if (rows.length > 0) sessionTitle = rows[0].title;
  } catch { /* non-fatal — open anyway */ }

  const result = nav.openSession(sessionId);

  if (req.headers.accept?.includes('text/html')) {
    // Browser request — return a redirect page
    const title = sessionTitle || sessionId;
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Opening: ${title}</title>
<meta http-equiv="refresh" content="1;url=${nav.buildVSCodeUri(sessionId)}">
<style>body{font-family:sans-serif;padding:2rem;background:#1e1e1e;color:#ccc}
a{color:#4fc3f7}.card{background:#252526;padding:1.5rem;border-radius:8px;max-width:500px;margin:2rem auto}</style>
</head><body>
<div class="card">
<h2>Opening Claude Code</h2>
<p><strong>${title}</strong></p>
${result.success
  ? `<p>✓ VS Code should open now. <a href="${nav.buildVSCodeUri(sessionId)}">Click here</a> if nothing happened.</p>`
  : `<p>⚠ Could not open automatically. <a href="${nav.buildVSCodeUri(sessionId)}">Click here</a> to open.</p>`
}
<p style="margin-top:1rem;font-size:0.85rem;color:#888">Requires <em>DevDialogue Connector</em> VS Code extension.</p>
</div></body></html>`;
    return res.set('Content-Type', 'text/html').send(html);
  }

  return res.json({ ...result, sessionTitle });
});

/**
 * GET /navigate/session/:sessionId
 * Return session permalink data (title, summary, decisions, open links).
 * Used by the browser permalink page and by MCP tools.
 */
router.get('/navigate/session/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const nav = getNavigator();

  try {
    const mg = require('../services/memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (s:DialogueSession {sessionId: $sid})
       OPTIONAL MATCH (s)-[:HAS_DECISION]->(d:DialogueDecision)
       RETURN s, collect(d {.text, .confidence, .decisionId}) AS decisions
       LIMIT 1`,
      { sid: sessionId }
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }

    const s = rows[0].s.properties || rows[0].s;
    const decisions = rows[0].decisions || [];

    return res.json({
      success: true,
      session: {
        sessionId,
        title: s.aiTitle || s.title || sessionId,
        platform: s.source || 'unknown',
        gitBranch: s.gitBranch,
        createdAt: s.createdAt,
        lastModified: s.lastModified,
        summary: s.summary,
        decisions,
      },
      links: {
        openInVSCode: nav.buildVSCodeUri(sessionId),
        navigatorOpen: nav.buildNavigatorUrl(sessionId, `${req.protocol}://${req.get('host')}`),
        permalink: nav.buildPermalink(sessionId),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /navigate/decision/:decisionId
 * Open the session containing this decision in VS Code,
 * and return the decision context for use as initialPrompt.
 */
router.get('/navigate/decision/:decisionId', async (req, res) => {
  const { decisionId } = req.params;
  const nav = getNavigator();

  try {
    const mg = require('../services/memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (d:DialogueDecision {decisionId: $did})<-[:HAS_DECISION]-(s:DialogueSession)
       RETURN s.sessionId AS sessionId, s.aiTitle AS sessionTitle,
              d.text AS decisionText, d.confidence AS confidence
       LIMIT 1`,
      { did: decisionId }
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    const { sessionId, sessionTitle, decisionText, confidence } = rows[0];
    const contextPrompt = `Decision context: "${decisionText}"`;
    const openResult = nav.openSession(sessionId);

    return res.json({
      success: true,
      decisionId,
      decisionText,
      confidence,
      sessionId,
      sessionTitle,
      opened: openResult.success,
      links: {
        openInVSCode: nav.buildVSCodeUri(sessionId),
        sessionPermalink: nav.buildPermalink(sessionId),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /navigate/enrich-text
 * Replace bare session/decision UUIDs in text with markdown links.
 * Body: { text: string }
 */
router.post('/navigate/enrich-text', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ success: false, error: 'Field "text" is required' });
  try {
    const { dialogueLinkEnricher } = require('../core/aopeg/plugins/dialogue/services/dialogue.link-enricher');
    const enriched = await dialogueLinkEnricher.enrich(text);
    return res.json({ success: true, original: text, enriched, changed: enriched !== text });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /navigate/continuation-hint
 * Returns a pending continuation hint if one exists (auto-continuation Toast support).
 * The VS Code DevDialogue Connector extension polls this endpoint.
 * Hint is cleared after retrieval (one-shot).
 */
router.get('/navigate/continuation-hint', async (_req, res) => {
  try {
    const redis = require('../services/redis.service');
    const raw = await redis.get('dialogue:continuation:hint');
    if (!raw) {
      return res.json({ success: true, hint: null });
    }
    // Clear after read (one-shot)
    await redis.del('dialogue:continuation:hint');
    return res.json({ success: true, hint: JSON.parse(raw) });
  } catch {
    return res.json({ success: true, hint: null });
  }
});

// ─── KNOWLEDGE MAP ────────────────────────────────────────────────────────────

const GNN_BASE = process.env.GNN_SERVICE_URL || 'http://localhost:5001';

function getKnowledgeQdrant() {
  return require('../core/aopeg/plugins/dialogue/services/dialogue.knowledge-qdrant').knowledgeQdrant;
}

/**
 * GET /knowledge-map/stats
 * Entity count, type breakdown, cluster count.
 */
router.get('/knowledge-map/stats', async (_req, res) => {
  try {
    const kq = getKnowledgeQdrant();
    const all = await kq.getAll({ limit: 5000 });
    const byType = {};
    let withLayout = 0;
    const clusters = new Set();
    for (const p of all) {
      const t = p.payload?.type || 'unknown';
      byType[t] = (byType[t] || 0) + 1;
      if (p.payload?.x != null) withLayout++;
      if (p.payload?.cluster != null && p.payload.cluster >= 0) clusters.add(p.payload.cluster);
    }
    return res.json({
      success: true,
      totalEntities: all.length,
      entitiesWithLayout: withLayout,
      clusterCount: clusters.size,
      byType,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /knowledge-map/entities
 * All entities with xyz coordinates (for 3D rendering).
 * Query: ?type=technology&cluster=2&limit=500&offset=0
 */
router.get('/knowledge-map/entities', async (req, res) => {
  try {
    const kq = getKnowledgeQdrant();
    const { type, limit = '500', offset = '0' } = req.query;
    const all = await kq.getAll({
      limit:      Math.min(parseInt(limit) || 500, 2000),
      offset:     parseInt(offset) || 0,
      typeFilter: type || null,
    });
    return res.json({
      success:  true,
      entities: all.map(p => ({ id: p.id, ...p.payload })),
      total:    all.length,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /knowledge-map/entity/:entityId
 * Full entity detail: metadata + source sessions with titles.
 */
router.get('/knowledge-map/entity/:entityId', async (req, res) => {
  try {
    const kq = getKnowledgeQdrant();
    const { QdrantClient } = require('@qdrant/js-client-rest');
    const client = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });
    const [point] = await client.retrieve('knowledge_entities', {
      ids: [req.params.entityId], with_payload: true, with_vector: false,
    });
    if (!point) return res.status(404).json({ success: false, error: 'Entity not found' });

    // Enrich with session titles from Memgraph
    const sessionIds = point.payload?.sessionIds || [];
    let sessions = [];
    if (sessionIds.length > 0) {
      const mg = require('../services/memgraph.service');
      const rows = await mg.runQuery(
        `MATCH (s:DialogueSession) WHERE s.sessionId IN $ids
         RETURN s.sessionId AS sessionId, s.aiTitle AS title, s.gitBranch AS branch
         LIMIT 20`,
        { ids: sessionIds }
      );
      sessions = rows.map(r => ({ sessionId: r.sessionId, title: r.title, branch: r.branch }));
    }

    return res.json({ success: true, entity: { id: point.id, ...point.payload }, sessions });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /knowledge-map/search
 * Semantic search: embed query text, find nearest entities in Qdrant.
 * Body: { query: string, topK?: number, type?: string }
 */
router.post('/knowledge-map/search', async (req, res) => {
  const { query, topK = 20, type } = req.body;
  if (!query) return res.status(400).json({ success: false, error: 'query is required' });
  try {
    const { EmbeddingService } = require('../services/structuring/embeddings/EmbeddingService');
    const kq = getKnowledgeQdrant();
    const embSvc = new EmbeddingService();
    const vector = await embSvc.generateEmbedding(query);
    const results = await kq.search(vector, { topK, typeFilter: type || null });
    return res.json({
      success: true,
      results: results.map(r => ({ id: r.id, score: r.score, ...r.payload })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /knowledge-map/clusters
 * Cluster list with representative entity names.
 */
router.get('/knowledge-map/clusters', async (_req, res) => {
  try {
    const kq = getKnowledgeQdrant();
    const all = await kq.getAll({ limit: 5000 });
    const clusterMap = {};
    for (const p of all) {
      const c = p.payload?.cluster;
      if (c == null || c < 0) continue;
      if (!clusterMap[c]) clusterMap[c] = { cluster: c, entities: [], types: {} };
      clusterMap[c].entities.push(p.payload?.name || p.id);
      const t = p.payload?.type || 'unknown';
      clusterMap[c].types[t] = (clusterMap[c].types[t] || 0) + 1;
    }
    const clusters = Object.values(clusterMap).map(c => ({
      ...c,
      size:          c.entities.length,
      topEntities:   c.entities.slice(0, 8),
      dominantType:  Object.entries(c.types).sort((a, b) => b[1] - a[1])[0]?.[0],
    })).sort((a, b) => b.size - a.size);
    return res.json({ success: true, clusters, total: clusters.length });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /knowledge-map/gnn-probe — test outbound connectivity to GNN service
 */
/**
 * POST /knowledge-map/layout/refresh
 * Trigger UMAP layout recomputation via gnn-service.
 * Body: { nNeighbors?, minDist?, minClusterSize? }
 */
router.post('/knowledge-map/layout/refresh', async (req, res) => {
  try {
    const { dialogueKnowledgeLayoutExecutor } = require('../core/aopeg/plugins/dialogue/executors/dialogue.knowledge-layout');
    const { nNeighbors = 15, minDist = 0.1, minClusterSize = 3 } = req.body || {};
    const result = await dialogueKnowledgeLayoutExecutor.execute({ nNeighbors, minDist, minClusterSize }, {});
    if (!result.success) {
      return res.status(500).json({ success: false, errors: result.errors });
    }
    return res.json({ success: true, ...result.output });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

