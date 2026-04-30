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
    description: `Propose a new Codex rule, pattern, anti-pattern, or change to an existing one. Creates a CodexProposal for human review.

WRITING GUIDELINES — every proposal MUST follow these:
1. COMPLETENESS: Fill in ALL required fields. A rule without rationale, examples, or whyItExists is useless.
2. ABSTRACTION LEVEL: Write rules that are specific enough to be actionable in the described context, but abstract enough to apply to similar situations. Do NOT write rules tied to one-off incidents — extract the general principle. Do NOT write rules so abstract that they cannot guide a concrete decision.
3. RATIONALE: Explain WHY this rule exists — what goes wrong without it, what pattern it prevents.
4. EXAMPLES: Provide at least 2 concrete examples showing correct application AND what violation looks like.
5. TRACEABILITY: Link to a Codex Principle (derivesFromPrinciple) when possible.
6. SCOPE: Always specify which parts of the system this rule applies to.`,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short, descriptive rule title (5-200 chars)' },
        summary: { type: 'string', description: 'What this rule prescribes in 1-2 self-contained sentences' },
        rationale: { type: 'string', description: 'WHY this rule exists — what problem it prevents, what happens without it. Most critical field.' },
        whyItExists: { type: 'string', description: 'The specific event or observation that created the need for this rule' },
        examples: { type: 'array', items: { type: 'string' }, description: 'Concrete examples of correct application and/or violations (at least 1, 2+ recommended)' },
        change_type: { type: 'string', enum: ['NEW_RULE', 'MODIFY_RULE', 'DEPRECATE_RULE', 'NEW_PATTERN', 'NEW_ANTIPATTERN'], description: 'Type of change' },
        target_rule_id: { type: 'string', description: 'Target rule codexId for MODIFY_RULE/DEPRECATE_RULE (e.g., CODEX-RULE-042)' },
        scope: { type: 'array', items: { type: 'string' }, description: 'System areas: ["gxe","graph"], ["flowdesk"], ["extraction","KnowledgeQuantum"], etc.' },
        modality: { type: 'string', enum: ['MUST', 'SHOULD', 'MAY', 'MUST_NOT', 'SHOULD_NOT'], description: 'Deontic modality. Default: SHOULD' },
        ruleKind: { type: 'string', enum: ['CONSTITUTIVE', 'PRESCRIPTIVE'], description: 'CONSTITUTIVE=defines term, PRESCRIPTIVE=mandates behavior. Default: PRESCRIPTIVE' },
        derivesFromPrinciple: { type: 'string', description: 'Codex Principle ID this derives from. Use codex_get_principles first to find valid IDs (format is PRINCIPLE-0-N, e.g., PRINCIPLE-0-4 = "граф, достойный доверия"). DO NOT invent IDs.' },
        agentConfidence: { type: 'number', description: 'Confidence 0.0-1.0. Default: 0.7' },
      },
      required: ['title', 'summary', 'rationale', 'whyItExists', 'examples', 'change_type'],
    },
  },
];

/**
 * Execute a Codex tool call. Returns result as string.
 */
async function executeCodexTool(toolName, toolInput) {
  const CODEX_API = process.env.CODEX_API_URL || `${process.env.API_BASE_URL || 'http://localhost:3010'}/api/v1/codex`;

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
      case 'codex_propose_change': {
        url = `${CODEX_API}/proposals`;
        method = 'POST';

        // Map change_type to proposalType expected by governance service
        const CHANGE_TYPE_MAP = {
          'NEW_RULE': 'CREATE',
          'MODIFY_RULE': 'MODIFY',
          'DEPRECATE_RULE': 'DEPRECATE',
          'NEW_PATTERN': 'CREATE',
          'NEW_ANTIPATTERN': 'CREATE',
        };
        const proposalType = CHANGE_TYPE_MAP[toolInput.change_type] || 'CREATE';

        // Determine nodeType from change_type
        const NODE_TYPE_MAP = {
          'NEW_RULE': 'CodexRule',
          'MODIFY_RULE': 'CodexRule',
          'DEPRECATE_RULE': 'CodexRule',
          'NEW_PATTERN': 'CodexPattern',
          'NEW_ANTIPATTERN': 'BlackCodexEntry',
        };
        const nodeType = NODE_TYPE_MAP[toolInput.change_type] || 'CodexRule';

        // Build proposedChanges with full Information Contract fields
        const proposedChanges = {
          nodeType,
          title: toolInput.title,
          summary: toolInput.summary,
          rationale: toolInput.rationale,
          whyItExists: toolInput.whyItExists,
          examples: toolInput.examples || [],
          scope: toolInput.scope || [],
          modality: toolInput.modality || 'SHOULD',
          ruleKind: toolInput.ruleKind || 'PRESCRIPTIVE',
          derivesFromPrinciple: toolInput.derivesFromPrinciple || '',
        };

        body = JSON.stringify({
          proposalType,
          title: toolInput.title,
          summary: toolInput.summary,
          rationale: toolInput.rationale,
          whyItExists: toolInput.whyItExists,
          examples: toolInput.examples || [],
          targetCodexId: toolInput.target_rule_id || '',
          proposedChanges,
          agentConfidence: toolInput.agentConfidence || 0.7,
          proposedBy: 'gxe-assistant',
        });
        break;
      }
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
