'use strict';

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

/**
 * dialogue.open_vscode — MCP Tool
 *
 * Opens a Claude Code session tab in VS Code from within a Claude Code conversation.
 *
 * Usage:
 *   dialogue_open_session({ sessionId: "UUID" })
 *   dialogue_open_session({ query: "GNN service implementation" })
 *
 * If query is provided, performs AI search and opens the top result.
 * If sessionId is provided, opens that session directly.
 */
const dialogueOpenVSCodeExecutor = createSimpleExecutor({
  type: 'dialogue.open_vscode',
  displayName: 'Open Session in VS Code',
  description: 'Opens a Claude Code session tab in VS Code. Accepts a session UUID or a natural-language query to find and open the most relevant past session.',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Direct session UUID to open (36-char UUID)',
      },
      query: {
        type: 'string',
        description: 'Natural-language query to find the session (e.g. "DevDialogue phase 1 skeleton plugin")',
      },
    },
  },

  async execute(params, _context) {
    const { sessionId, query } = params;

    if (!sessionId && !query) {
      return createErrorResult('MISSING_PARAMS', 'Provide either sessionId or query');
    }

    const { dialogueNavigator } = require('../services/dialogue.navigator');
    let targetSessionId = sessionId;
    let sessionTitle = null;
    let searchUsed = false;

    // ── Resolve sessionId via AI search if only query given ─────────────────
    if (!targetSessionId && query) {
      searchUsed = true;
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
        const result = await aiSearch.search(query);

        if (!result.results || result.results.length === 0) {
          return createErrorResult('NOT_FOUND', `No sessions found for query: "${query}"`);
        }

        const top = result.results[0];
        targetSessionId = top.sessionId;
        sessionTitle = top.title || top.aiTitle;
      } catch (err) {
        return createErrorResult('SEARCH_FAILED', `Search failed: ${err.message}`);
      }
    }

    // ── Fetch session title if not yet known ─────────────────────────────────
    if (!sessionTitle) {
      try {
        const mg = require('../../../../services/memgraph.service');
        const rows = await mg.runQuery(
          'MATCH (s:DialogueSession {sessionId: $sid}) RETURN s.aiTitle AS title LIMIT 1',
          { sid: targetSessionId }
        );
        if (rows.length > 0) sessionTitle = rows[0].title;
      } catch { /* non-fatal */ }
    }

    // ── Open in VS Code ──────────────────────────────────────────────────────
    const openResult = dialogueNavigator.openSession(targetSessionId);
    const vsCodeUri = dialogueNavigator.buildVSCodeUri(targetSessionId);
    const permalink = dialogueNavigator.buildPermalink(targetSessionId);

    if (!openResult.success) {
      // Still return useful info even if the OS open failed
      return createSuccessResult({
        opened: false,
        sessionId: targetSessionId,
        sessionTitle,
        warning: openResult.error || openResult.warning,
        vsCodeUri,
        permalink,
        searchUsed,
        message: `Could not auto-open. Use: ${vsCodeUri}`,
      });
    }

    return createSuccessResult({
      opened: true,
      sessionId: targetSessionId,
      sessionTitle: sessionTitle || targetSessionId,
      method: openResult.method,
      vsCodeUri,
      permalink,
      searchUsed,
      message: searchUsed
        ? `Opened session found for query "${query}": "${sessionTitle}"`
        : `Opened session: "${sessionTitle || targetSessionId}"`,
    });
  },
});

module.exports = { dialogueOpenVSCodeExecutor };
