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
              s.totalInputTokens AS inputTokens, s.totalOutputTokens AS outputTokens
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
    if (sourceFile) {
      try {
        const { dialogueNormalizer } = require('../core/aopeg/plugins/dialogue/services/dialogue.normalizer');
        const dialogue = dialogueNormalizer.parseClaudeCodeSession(sourceFile);
        if (dialogue) {
          messages = dialogue.messages.map(m => ({
            messageId: m.messageId,
            role: m.role,
            participant: m.participant,
            content: m.text.slice(0, 2000), // Truncate for API response
            timestamp: m.timestamp,
            toolUseCount: m.toolUse?.length || 0,
          }));
        }
      } catch {
        // Non-fatal — return session without messages
      }
    }

    // Raise truncation limit for full message view (10k chars per message)
    const fullContent = req.query.full === 'true';
    if (fullContent && messages.length > 0) {
      try {
        const { dialogueNormalizer } = require('../core/aopeg/plugins/dialogue/services/dialogue.normalizer');
        const dialogue = dialogueNormalizer.parseClaudeCodeSession(sourceFile);
        if (dialogue) {
          messages = dialogue.messages.map(m => ({
            messageId: m.messageId,
            role: m.role,
            participant: m.participant,
            content: m.text.slice(0, 10000),
            timestamp: m.timestamp,
            toolUseCount: m.toolUse?.length || 0,
            toolUse: m.toolUse?.slice(0, 5).map(t => ({ name: t.name, inputSummary: JSON.stringify(t.input || {}).slice(0, 200) })) || [],
          }));
        }
      } catch { /* use already-loaded messages */ }
    }

    return res.json({
      session: { ...session, messages },
    });
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

module.exports = router;
