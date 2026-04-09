/**
 * Catalog AI Assistant Service (UTC-002)
 *
 * Specialised LLM agent for the Tool Catalog. Wraps the existing
 * `anthropic-agent.service` with:
 *
 *   - A catalog-focused system prompt
 *   - A whitelist restricted to catalog + pattern + graph read + workspace read tools
 *   - Context-awareness: when workspaceId is provided, workspace inspection
 *     tools are available; otherwise only global catalog tools are exposed
 *
 * The assistant can:
 *   - Recommend tools for a described task
 *   - Search and browse the catalog/tool registry
 *   - Analyse workspace subgraphs for pattern matches (UTC-001)
 *   - Preview and suggest pattern replacements
 *   - Help design graph structure from requirements
 *
 * Session state is kept in the **frontend** (React state) — the backend
 * is stateless per request. Full message history is passed with each call.
 *
 * @module services/catalog/catalog-assistant.service
 */

'use strict';

const LOG_PREFIX = '[CatalogAssistant]';

let _agentService = null;

async function getAgent() {
  if (!_agentService) {
    const { getAgentService } = require('../agents/anthropic-agent.service');
    _agentService = await getAgentService();
  }
  return _agentService;
}

// Tool name patterns allowed for the catalog assistant (sanitised form — dots → underscores)
const CATALOG_TOOLS = [
  // Catalog CRUD + search
  /^catalog_search_graphs$/,
  /^catalog_search_tools$/,
  /^catalog_suggest_tools$/,
  /^catalog_find_similar_graphs$/,
  /^catalog_analyze_reuse$/,
  /^catalog_get_graph$/,
  /^catalog_get_tool$/,
  /^catalog_list_tools$/,
  /^catalog_clone_graph$/,
  // Pattern matching (UTC-001)
  /^catalog_analyze_patterns$/,
  /^catalog_match_subgraph$/,
  /^catalog_preview_replacement$/,
  // Graph read-only analysis
  /^graph_analyze_structure$/,
  /^graph_neighbors$/,
  /^graph_query$/,
  /^graph_find_path$/
];

const WORKSPACE_TOOLS = [
  // Read-only workspace inspection
  /^workspace_list_drafts$/,
  /^workspace_search_drafts$/,
  /^workspace_get_draft$/,
  /^workspace_get$/,
  /^workspace_list_sources$/,
  /^workspace_validate_graph$/,
  /^workspace_analyze_sources$/,
  /^workspace_detect_contradictions$/,
  // Workspace canvas graph
  /^workspace_get_edges$/
];

function isAllowed(toolName, workspaceId) {
  if (!toolName) return false;
  for (const pat of CATALOG_TOOLS) {
    if (pat.test(toolName)) return true;
  }
  if (workspaceId) {
    for (const pat of WORKSPACE_TOOLS) {
      if (pat.test(toolName)) return true;
    }
  }
  return false;
}

function buildSystemPrompt(context) {
  const { workspaceId, workspaceName, currentSelection, mode, language } = context;

  const wsSection = workspaceId
    ? `\n## Current Workspace\nYou are operating within workspace **${workspaceName || workspaceId}** (ID: ${workspaceId}).\nYou have access to workspace inspection tools (list drafts, search, validate, analyze).\nAlways pass \`workspaceId: "${workspaceId}"\` to workspace_* and catalog_analyze_patterns tools.\n`
    : '\nNo workspace context — you are in standalone catalog mode.\n';

  const selectionSection = currentSelection && currentSelection.length > 0
    ? `\n## User Selection\nThe user has selected ${currentSelection.length} node(s) on the canvas: ${currentSelection.map(n => n.name || n.id).join(', ')}.\nConsider this selection when making recommendations.\n`
    : '';

  const modeSection = mode === 'pattern_analysis'
    ? '\n## Mode: Pattern Analysis\nFocus on finding patterns in the workspace graph that match existing catalog entries. Use `catalog_analyze_patterns` to scan the workspace.\n'
    : mode === 'tool_selection'
    ? '\n## Mode: Tool Selection\nFocus on recommending specific tools from the catalog for the user\'s described task. Use `catalog_suggest_tools` and `catalog_search_tools`.\n'
    : mode === 'graph_design'
    ? '\n## Mode: Graph Design\nHelp the user design a graph structure. Search the catalog for similar existing graphs (`catalog_find_similar_graphs`) and suggest tools to compose.\n'
    : '';

  return `You are the **Catalog AI Assistant** for UN ProjectAdvisor.

You help users navigate the Tool Catalog, find relevant tools and graph templates, and detect reusable patterns in workspace graphs.

## Your Capabilities

1. **TOOL RECOMMENDATION**: Search the catalog by keywords or natural language. Use \`catalog_suggest_tools\` for AI-powered recommendations and \`catalog_search_tools\` for keyword search.

2. **GRAPH TEMPLATE SEARCH**: Find existing graphs similar to what the user needs. Use \`catalog_find_similar_graphs\` with a description. Use \`catalog_analyze_reuse\` to determine whether to reuse, clone, or create new.

3. **PATTERN DETECTION** (requires workspace context): Analyse a workspace's draft graph to find subgraph patterns that already exist in the catalog. Use \`catalog_analyze_patterns\` to scan the workspace. For each match, explain the similarity and suggest replacement with \`catalog_preview_replacement\`.

4. **GRAPH DESIGN GUIDANCE**: When the user describes a task ("I need a graph for leave request approval"), search for templates and recommend a composition of tools/nodes.

## Rules

- **Never fabricate tool IDs** — only recommend tools you find via catalog_search_tools or catalog_suggest_tools.
- **Always verify** — if you're unsure whether a tool exists, search before recommending.
- **Explain your reasoning** — don't just list tools, explain WHY each is relevant and how they connect.
- **When finding pattern matches**, show the similarity score and explain what's similar vs different.
- **Respond in ${language || 'the user\'s language (Russian by default for this project)'}.**
${wsSection}${selectionSection}${modeSection}`;
}

class CatalogAssistantService {

  /**
   * Stream an assistant response for a catalog-related query.
   *
   * @param {Object} request
   * @param {string} request.query             User's natural language message
   * @param {Array}  [request.sessionHistory]   Previous messages [{role, content}]
   * @param {string} [request.workspaceId]      If set, workspace tools are available
   * @param {string} [request.workspaceName]
   * @param {Array}  [request.currentSelection] Nodes selected on canvas [{id, name, type}]
   * @param {string} [request.mode]             'tool_selection' | 'pattern_analysis' | 'graph_design' | 'general'
   * @param {string} [request.language]
   * @yields {Object} SSE events (same shape as anthropic-agent.service)
   */
  async *chat(request) {
    const {
      query,
      sessionHistory = [],
      workspaceId,
      workspaceName,
      currentSelection,
      mode = 'general',
      language
    } = request;

    if (!query || typeof query !== 'string') {
      throw new Error('query must be a non-empty string');
    }

    const systemPrompt = buildSystemPrompt({
      workspaceId, workspaceName, currentSelection, mode, language
    });

    const messages = [
      ...sessionHistory.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: query }
    ];

    const agentSvc = await getAgent();

    for await (const event of agentSvc.chat(systemPrompt, messages, {
      // Custom whitelist that narrows tools to catalog + workspace-read-only
      allowedToolsFilter: (tool) => isAllowed(tool?.name, workspaceId),
      skipIntentFilter: true  // intent filter would remove catalog tools on generic queries
    })) {
      yield event;
    }
  }
}

const instance = new CatalogAssistantService();

module.exports = instance;
module.exports.CatalogAssistantService = CatalogAssistantService;
module.exports.buildSystemPrompt = buildSystemPrompt;
module.exports.isAllowed = isAllowed;
