/**
 * WorkSpace Agent Tool Filter (WS2-002)
 *
 * Whitelist of tool name patterns the WorkSpace agent is allowed to call.
 * Enforces isolation: the agent CANNOT write to the global Knowledge Base,
 * cannot manipulate other workspaces, and cannot run side-effecting tools
 * unrelated to its workspace.
 *
 * Tool names here are SANITIZED (dots replaced with underscores), matching
 * the form passed to Anthropic by anthropic-agent.service.js.
 *
 * @module services/workspace/agent-tool-filter
 */

'use strict';

/**
 * Patterns of tool names allowed inside a workspace agent session.
 * Each entry is a RegExp tested against the sanitized tool name.
 *
 * Categories:
 *   - workspace_*       : workspace own operations (drafts, sources, edges, kb-proxy)
 *   - draft_*           : draft helpers (if any standalone tools exist)
 *   - source_*          : source helpers
 *   - kb_search/kb_get  : read-only global KB access (NOT kb_create / kb_update)
 *   - codex_search_*    : read codex rules
 *   - graph_neighbors / graph_query / graph_find_path : read-only graph queries
 *   - catalog_search / catalog_find_similar           : read-only catalog browsing
 *   - extraction_*      : entity/relation extraction helpers (read-only NLP)
 *   - ai_classify / ai_summarize / ai_extract         : pure NLP utilities
 *   - web_search / web_fetch                          : research
 */
const ALLOWED_PATTERNS = [
  /^workspace_/,
  /^draft_/,
  /^source_/,
  /^kb_search$/,
  /^kb_get_/,
  /^codex_search/,
  /^codex_get_/,
  /^graph_neighbors$/,
  /^graph_query$/,
  /^graph_find_path$/,
  /^graph_analyze_/,
  /^catalog_search/,
  /^catalog_find_/,
  /^catalog_get_/,
  /^extraction_/,
  /^ai_classify$/,
  /^ai_summarize$/,
  /^ai_extract$/,
  /^web_search$/,
  /^web_fetch$/,
  /^webfetch$/,
  /^websearch$/
];

/**
 * Patterns explicitly denied even if they match an allowed pattern.
 * Defense-in-depth.
 */
const DENIED_PATTERNS = [
  /_create_kb/,
  /_write_kb/,
  /_delete_kb/,
  /^kb_create/,
  /^kb_update/,
  /^kb_delete/,
  /^graph_delete_/,
  /^graph_create_/   // global graph mutation; workspace mutates only via workspace_* tools
];

/**
 * Decide whether a tool name is allowed for the workspace agent.
 * @param {string} toolName Sanitized tool name (no dots).
 * @returns {boolean}
 */
function isToolAllowed(toolName) {
  if (!toolName || typeof toolName !== 'string') return false;
  for (const denied of DENIED_PATTERNS) {
    if (denied.test(toolName)) return false;
  }
  for (const allowed of ALLOWED_PATTERNS) {
    if (allowed.test(toolName)) return true;
  }
  return false;
}

/**
 * Filter a list of Anthropic tool definitions.
 * Returns the subset whose `name` is allowed.
 * @param {Array<{name: string}>} tools
 * @returns {Array}
 */
function filterAllowedTools(tools) {
  if (!Array.isArray(tools)) return [];
  return tools.filter(t => isToolAllowed(t?.name));
}

module.exports = {
  ALLOWED_PATTERNS,
  DENIED_PATTERNS,
  isToolAllowed,
  filterAllowedTools
};
