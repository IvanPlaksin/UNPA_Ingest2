'use strict';

const SEARCH_METHODOLOGY_PROMPT = `You are a search strategy assistant for a developer AI dialogue archive.

The corpus contains developer conversation sessions (Claude Code + Claude.ai) about software development.
Each session has: title, summary (Main Topics / Key Decisions / Problems Solved), entity tags, platform, dates, git branch.

Session types: Architecture | Debugging | DevOps | Refactoring | Analysis | Planning | Implementation

Your task: Analyze the user's query and return optimal search parameters.

Strategy selection:
- "vector_only": Pure semantic similarity. Best for vague/exploratory queries.
- "graph_first": Graph traversal (decisions, session chains). Best for relational queries about decisions or session relationships.
- "hybrid": Vector + graph. Best for specific technical queries (recommended default).

Output ONLY valid JSON (no markdown code blocks, no text outside JSON):
{
  "strategy": "hybrid|vector_only|graph_first",
  "reasoning": "One concise sentence explaining your strategy",
  "searchParams": {
    "semanticQuery": "Query rephrased for optimal vector similarity matching",
    "entityFocus": ["entity1", "entity2"],
    "sessionType": null or one of the session types above,
    "graphExpansion": true,
    "limit": 12
  }
}`;

class DialogueAISearchService {
  constructor(searchService) {
    this.searchService = searchService;
  }

  async search(userQuery) {
    const startMs = Date.now();
    let decomposition = null;
    let aiAvailable = false;

    try {
      const { getInstance } = require('../../../../../services/llm/LLMProviderService');
      const llm = getInstance();
      const response = await llm.chat(
        [{ role: 'user', content: userQuery }],
        {
          model: 'haiku',
          maxTokens: 512,
          temperature: 0.1,
          system: SEARCH_METHODOLOGY_PROMPT,
        }
      );
      const rawContent = Array.isArray(response.content)
        ? response.content.filter(b => b.type === 'text').map(b => b.text).join('')
        : (response.content || '');
      decomposition = this._parseDecomposition(rawContent);
      aiAvailable = true;
    } catch (err) {
      console.warn(`[AISearch] LLM decomposition failed: ${err.message} — falling back to direct search`);
      decomposition = {
        strategy: 'hybrid',
        reasoning: 'AI unavailable — using direct semantic search',
        searchParams: {
          semanticQuery: userQuery,
          entityFocus: [],
          sessionType: null,
          graphExpansion: true,
          limit: 12,
        },
      };
    }

    const { strategy, reasoning, searchParams } = decomposition;

    const results = await this.searchService.search(
      searchParams.semanticQuery || userQuery,
      {
        filters: searchParams.filters || {},
        limit: searchParams.limit || 12,
        expandGraph: searchParams.graphExpansion !== false,
      }
    );

    return {
      results,
      strategy,
      reasoning,
      searchParams,
      executionMs: Date.now() - startMs,
      aiAvailable,
    };
  }

  _parseDecomposition(text) {
    try {
      // Strip markdown code blocks if present
      const cleaned = text.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        strategy: parsed.strategy || 'hybrid',
        reasoning: parsed.reasoning || '',
        searchParams: {
          semanticQuery: parsed.searchParams?.semanticQuery || '',
          entityFocus: parsed.searchParams?.entityFocus || [],
          sessionType: parsed.searchParams?.sessionType || null,
          graphExpansion: parsed.searchParams?.graphExpansion !== false,
          limit: parsed.searchParams?.limit || 12,
          filters: parsed.searchParams?.filters || {},
        },
      };
    } catch {
      return {
        strategy: 'hybrid',
        reasoning: 'Could not parse AI response — using direct query',
        searchParams: { semanticQuery: '', entityFocus: [], sessionType: null, graphExpansion: true, limit: 12 },
      };
    }
  }
}

module.exports = { DialogueAISearchService };
