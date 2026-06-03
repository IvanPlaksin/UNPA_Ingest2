'use strict';

const path = require('path');
const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

/**
 * dialogue.resume — MCP Tool
 *
 * Finds and opens the most relevant past session for the current work context.
 * If no topic is given, infers it from git branch + cwd.
 *
 * Usage:
 *   dialogue_resume({})                           — infer topic from context
 *   dialogue_resume({ topic: "GNN integration" }) — explicit topic
 *   dialogue_resume({ maxAgeDays: 14 })           — limit to last 2 weeks
 */
const dialogueResumeExecutor = createSimpleExecutor({
  type: 'dialogue.resume',
  displayName: 'Resume Session',
  description: 'Finds and opens the most relevant past Claude Code session for the current work context. Infers topic from git branch and working directory if not specified.',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'Topic or task to resume (optional — inferred from context if omitted)',
      },
      maxAgeDays: {
        type: 'number',
        description: 'Only search sessions from the last N days (default: 30)',
      },
    },
  },

  async execute(params, context) {
    const { topic, maxAgeDays = 30 } = params;

    const { dialogueNavigator } = require('../services/dialogue.navigator');

    // ── Build search query from context if no topic given ────────────────────
    let searchQuery = topic;
    let inferredFrom = 'explicit';

    if (!searchQuery) {
      searchQuery = _inferTopicFromContext(context);
      inferredFrom = 'context';
    }

    if (!searchQuery) {
      return createErrorResult('NO_CONTEXT', 'Could not infer topic from context. Provide a topic parameter.');
    }

    // ── Search ───────────────────────────────────────────────────────────────
    let results;
    try {
      const { DialogueAISearchService } = require('../services/dialogue.ai-search');
      const { DialogueSearchService } = require('../services/dialogue.search');
      const { DialogueQdrantService } = require('../services/dialogue.qdrant');
      const { EmbeddingService } = require('../../../../services/structuring/embeddings/EmbeddingService');

      const searchSvc = new DialogueSearchService(
        new DialogueQdrantService(),
        require('../../../../services/memgraph.service'),
        new EmbeddingService()
      );
      const aiSearch = new DialogueAISearchService(searchSvc);
      const result = await aiSearch.search(searchQuery);
      results = result.results || [];
    } catch (err) {
      return createErrorResult('SEARCH_FAILED', `Search failed: ${err.message}`);
    }

    if (results.length === 0) {
      return createSuccessResult({
        found: false,
        query: searchQuery,
        inferredFrom,
        message: `No sessions found for: "${searchQuery}"`,
      });
    }

    // ── Filter by age ────────────────────────────────────────────────────────
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const filtered = results.filter(r => {
      const ts = r.lastModified || r.createdAt;
      if (!ts) return true;
      return new Date(ts).getTime() >= cutoff;
    });

    const top = filtered.length > 0 ? filtered[0] : results[0];
    const ageWarning = filtered.length === 0 ? ` (oldest available — beyond ${maxAgeDays}d window)` : '';

    // ── Fetch full context summary from Memgraph ─────────────────────────────
    let decisions = [];
    let summary = top.summary;
    try {
      const mg = require('../../../../services/memgraph.service');
      const rows = await mg.runQuery(
        `MATCH (s:DialogueSession {sessionId: $sid})
         OPTIONAL MATCH (s)-[:HAS_DECISION]->(d:DialogueDecision)
         RETURN s.summary AS summary, collect(d.text)[..3] AS decisions`,
        { sid: top.sessionId }
      );
      if (rows.length > 0) {
        summary = rows[0].summary || summary;
        decisions = rows[0].decisions || [];
      }
    } catch { /* non-fatal */ }

    // ── Open in VS Code ──────────────────────────────────────────────────────
    const openResult = dialogueNavigator.openSession(top.sessionId);
    const vsCodeUri = dialogueNavigator.buildVSCodeUri(top.sessionId);

    const dateStr = top.lastModified
      ? new Date(top.lastModified).toLocaleDateString()
      : '?';

    return createSuccessResult({
      found: true,
      opened: openResult.success,
      sessionId: top.sessionId,
      sessionTitle: top.title || top.aiTitle || top.sessionId,
      date: dateStr,
      gitBranch: top.gitBranch,
      summary: summary ? summary.slice(0, 500) : null,
      keyDecisions: decisions,
      vsCodeUri,
      permalink: dialogueNavigator.buildPermalink(top.sessionId),
      query: searchQuery,
      inferredFrom,
      message: `Resuming${ageWarning}: "${top.title || top.sessionId}" (${dateStr})`,
    });
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function _inferTopicFromContext(context) {
  const parts = [];

  // From git branch
  const branch = context?.executionContext?.gitBranch || context?.gitBranch;
  if (branch && branch !== 'HEAD' && branch !== 'main' && branch !== 'master') {
    parts.push(branch.replace(/[-_]/g, ' '));
  }

  // From cwd — last 2 path segments
  const cwd = context?.executionContext?.cwd || context?.cwd;
  if (cwd) {
    const segments = cwd.split(/[/\\]/).filter(Boolean).slice(-2);
    parts.push(...segments);
  }

  return parts.length > 0 ? parts.join(' ') : null;
}

module.exports = { dialogueResumeExecutor };
