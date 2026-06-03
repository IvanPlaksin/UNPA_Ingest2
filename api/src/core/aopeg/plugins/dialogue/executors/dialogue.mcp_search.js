'use strict';

const { createSimpleExecutor, createSuccessResult, createErrorResult } = require('../../plugin-base');

/**
 * dialogue.mcp_search — MCP Tool
 *
 * Semantic search over the full dialogue corpus from within a Claude Code conversation.
 * Returns session summaries with direct vscode:// and permalink links.
 *
 * Usage:
 *   dialogue_search({ query: "GNN service integration" })
 *   dialogue_search({ query: "auth middleware", limit: 5 })
 */
const dialogueMCPSearchExecutor = createSimpleExecutor({
  type: 'dialogue.mcp_search',
  displayName: 'Search Dialogue History (MCP)',
  description: 'Semantic search across all indexed Claude Code and Claude.ai sessions. Returns summaries and direct links to open sessions in VS Code.',
  domain: 'dialogue',
  parameterSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Natural-language search query',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results to return (default: 5)',
      },
    },
  },

  async execute(params, _context) {
    const { query, limit = 5 } = params;

    if (!query) {
      return createErrorResult('MISSING_PARAMS', 'Field "query" is required');
    }

    try {
      const { DialogueAISearchService } = require('../services/dialogue.ai-search');
      const { DialogueSearchService } = require('../services/dialogue.search');
      const { DialogueQdrantService } = require('../services/dialogue.qdrant');
      const { EmbeddingService } = require('../../../../services/structuring/embeddings/EmbeddingService');
      const { dialogueNavigator } = require('../services/dialogue.navigator');

      const searchSvc = new DialogueSearchService(
        new DialogueQdrantService(),
        require('../../../../services/memgraph.service'),
        new EmbeddingService()
      );
      const aiSearch = new DialogueAISearchService(searchSvc);
      const result = await aiSearch.search(query);

      if (!result.results || result.results.length === 0) {
        return createSuccessResult({
          query,
          count: 0,
          results: [],
          message: `No sessions found for: "${query}"`,
        });
      }

      const topResults = result.results.slice(0, limit).map((r, i) => ({
        rank: i + 1,
        sessionId: r.sessionId,
        title: r.title || r.aiTitle || 'Untitled',
        platform: r.source || 'unknown',
        date: r.createdAt || r.lastModified,
        gitBranch: r.gitBranch,
        summary: r.summary ? r.summary.slice(0, 300) : null,
        score: r.score,
        openInVSCode: dialogueNavigator.buildVSCodeUri(r.sessionId),
        permalink: dialogueNavigator.buildPermalink(r.sessionId),
        navigatorOpen: dialogueNavigator.buildNavigatorUrl(r.sessionId),
      }));

      // Build human-readable markdown for MCP display
      const lines = [`**Search results for:** "${query}" (${topResults.length} of ${result.results.length})\n`];
      for (const r of topResults) {
        const dateStr = r.date ? new Date(r.date).toLocaleDateString() : '?';
        lines.push(`**${r.rank}. ${r.title}** — ${r.platform} · ${dateStr}${r.gitBranch ? ` · \`${r.gitBranch}\`` : ''}`);
        if (r.summary) lines.push(`   ${r.summary}`);
        lines.push(`   [Open in VS Code](${r.openInVSCode}) · [Permalink](${r.permalink})\n`);
      }

      return createSuccessResult({
        query,
        strategy: result.strategy,
        count: topResults.length,
        total: result.results.length,
        results: topResults,
        markdown: lines.join('\n'),
      });
    } catch (err) {
      return createErrorResult('SEARCH_ERROR', `Search failed: ${err.message}`);
    }
  },
});

module.exports = { dialogueMCPSearchExecutor };
