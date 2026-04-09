'use strict';

/**
 * Codex Tool Definitions for LLM tool-calling (Anthropic format).
 *
 * These tools allow GXE AI Assistant to dynamically query Codex
 * during conversation, not just from static system prompt.
 */

const CODEX_TOOLS = [
  {
    name: 'codex_search_rules',
    description: 'Search Codex rules by query, scope, or modality. Use to find specific governance rules applicable to the current task.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (matches title, summary, rationale)' },
        scope: { type: 'string', description: 'Filter by scope: gxe, graph, dialog, flowdesk, crud, etc.' },
        modality: { type: 'string', enum: ['MUST', 'SHOULD', 'MAY', 'MUST_NOT', 'SHOULD_NOT'], description: 'Filter by modality' },
      },
    },
  },
  {
    name: 'codex_get_rule',
    description: 'Get a specific Codex rule by its ID (e.g., CODEX-RULE-032). Returns full details with rationale, examples, and anti-patterns.',
    input_schema: {
      type: 'object',
      properties: {
        rule_id: { type: 'string', description: 'Codex rule ID (e.g., CODEX-RULE-032)' },
      },
      required: ['rule_id'],
    },
  },
  {
    name: 'codex_get_principles',
    description: 'Get all 7 immutable Codex principles (M3 level). Use when you need to ground decisions in fundamental principles.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'codex_get_blackcodex',
    description: 'Get BlackCodex entries — anti-patterns, failed approaches, and their resolutions. Use to avoid known mistakes.',
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Filter anti-patterns by scope tag' },
      },
    },
  },
  {
    name: 'codex_check_compliance',
    description: 'Check if a graph or operation complies with Codex rules. Returns violations and suggestions.',
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'Scope to check: flowdesk, gxe, etc.', default: 'gxe' },
      },
    },
  },
  {
    name: 'codex_propose_change',
    description: 'Propose a new rule or change to existing Codex rule. Creates a CodexProposal for human review.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Proposal title' },
        description: { type: 'string', description: 'Detailed description and rationale' },
        change_type: { type: 'string', enum: ['NEW_RULE', 'MODIFY_RULE', 'DEPRECATE_RULE', 'NEW_PATTERN', 'NEW_ANTIPATTERN'] },
        target_rule_id: { type: 'string', description: 'Target rule ID for modifications (optional)' },
      },
      required: ['title', 'description', 'change_type'],
    },
  },
];

/**
 * Execute a Codex tool call. Returns result as string.
 */
async function executeCodexTool(toolName, toolInput) {
  const CODEX_API = 'http://localhost:3010/api/v1/codex';

  try {
    let url;
    let method = 'GET';
    let body = null;

    switch (toolName) {
      case 'codex_search_rules': {
        const params = new URLSearchParams();
        if (toolInput.query) params.set('query', toolInput.query);
        if (toolInput.scope) params.set('scope', toolInput.scope);
        if (toolInput.modality) params.set('modality', toolInput.modality);
        url = `${CODEX_API}/rules?${params}`;
        break;
      }
      case 'codex_get_rule':
        url = `${CODEX_API}/rule/${toolInput.rule_id}`;
        break;
      case 'codex_get_principles':
        url = `${CODEX_API}/principles`;
        break;
      case 'codex_get_blackcodex':
        url = `${CODEX_API}/blackcodex${toolInput.scope ? '?scope=' + toolInput.scope : ''}`;
        break;
      case 'codex_check_compliance':
        url = `${CODEX_API}/compliance/${toolInput.scope || 'gxe'}`;
        break;
      case 'codex_propose_change':
        url = `${CODEX_API}/proposals`;
        method = 'POST';
        body = JSON.stringify({
          title: toolInput.title,
          description: toolInput.description,
          changeType: toolInput.change_type,
          targetRuleId: toolInput.target_rule_id,
          proposedBy: 'gxe-assistant',
        });
        break;
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }

    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = body;

    const res = await fetch(url, opts);
    const data = await res.json();
    return JSON.stringify(data, null, 2);
  } catch (err) {
    return JSON.stringify({ error: err.message });
  }
}

module.exports = { CODEX_TOOLS, executeCodexTool };
