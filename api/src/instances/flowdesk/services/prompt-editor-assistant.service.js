'use strict';

/**
 * Prompt-editor AI assistant (ADMIN P6) — a streaming Claude Code agent embedded
 * in the system-prompt graph editor. It runs on the local Claude Code binary
 * (subscription auth, no API key) wired to the project-knowledge MCP server, so it
 * can call the real `flowdesk_admin_*` tools — read chat sessions, find negative
 * ones, run session analysis, resolve intents, and validate / sandbox-test a
 * candidate prompt graph — then propose edits to the rules graph.
 *
 * Reuses the spawn + `--mcp-config` + `--allowed-tools` pattern from
 * claude-code-reanalyze.service.js, and emits the same SSE event protocol the GXE
 * ExecutionAssistantPanel already consumes: token / tool_call / tool_result /
 * mutations / done / error. Graph edits are proposed in a fenced ```mutations
 * block the frontend applies to the canvas.
 *
 * @module instances/flowdesk/services/prompt-editor-assistant.service
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function findClaudeBinary() {
  const candidates = [
    process.env.CLAUDE_CODE_PATH,
    path.resolve(__dirname, '../../../../node_modules/@anthropic-ai/claude-code/bin/claude.exe'),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'AnthropicClaude', 'claude.exe') : null,
    'claude',
  ].filter(Boolean);
  for (const p of candidates) {
    if (p === 'claude') return p;
    try { if (fs.existsSync(p)) return p; } catch { /* skip */ }
  }
  throw new Error('claude binary not found. Install @anthropic-ai/claude-code or set CLAUDE_CODE_PATH.');
}

function buildMcpConfig() {
  const mcpServerPath = process.env.MCP_SERVER_PATH
    || path.resolve(__dirname, '../../../../../../MCP_CLAUDE/mcp-server/dist/index.js');
  return {
    mcpServers: {
      'project-knowledge': {
        type: 'stdio', command: 'node', args: [mcpServerPath],
        env: {
          NEO4J_URI: process.env.NEO4J_URI || process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
          NEO4J_USERNAME: process.env.NEO4J_USERNAME || process.env.MEMGRAPH_USER || 'memgraph',
          NEO4J_PASSWORD: process.env.NEO4J_PASSWORD || process.env.MEMGRAPH_PASSWORD || 'secret_password_123',
          QDRANT_URL: process.env.QDRANT_URL || 'http://localhost:6333',
          UNPA_API_URL: process.env.UNPA_API_URL || `http://localhost:${process.env.PORT || 3010}`,
          API_BASE_URL: process.env.API_BASE_URL || `http://localhost:${process.env.PORT || 3010}`,
          FLOWDESK_ADMIN_TOKEN: process.env.FLOWDESK_ADMIN_TOKEN || '',
        },
      },
    },
  };
}

// The flowdesk_admin_* tools the assistant may call. Read + diagnose + prompt-test,
// PLUS direct GRAPH EDITING (get/mutate/save graph versions). Applying a prompt LIVE
// stays an explicit human action in the UI (prompt_apply is intentionally excluded).
const ALLOWED_MCP_TOOLS = [
  'mcp__project-knowledge__flowdesk_admin_list_sessions',
  'mcp__project-knowledge__flowdesk_admin_list_negative_sessions',
  'mcp__project-knowledge__flowdesk_admin_get_session',
  'mcp__project-knowledge__flowdesk_admin_get_session_turns',
  'mcp__project-knowledge__flowdesk_admin_analyze_session',
  'mcp__project-knowledge__flowdesk_admin_session_stats',
  'mcp__project-knowledge__flowdesk_admin_resolve_intent',
  'mcp__project-knowledge__flowdesk_admin_list_prompt_overlays',
  // System-prompt graph: read + EDIT + test
  'mcp__project-knowledge__flowdesk_admin_prompt_active',
  'mcp__project-knowledge__flowdesk_admin_prompt_default_graph',
  'mcp__project-knowledge__flowdesk_admin_prompt_list_graphs',
  'mcp__project-knowledge__flowdesk_admin_prompt_get_graph',
  'mcp__project-knowledge__flowdesk_admin_prompt_save_graph',
  'mcp__project-knowledge__flowdesk_admin_prompt_mutate_graph',
  'mcp__project-knowledge__flowdesk_admin_prompt_compile',
  'mcp__project-knowledge__flowdesk_admin_prompt_validate',
  'mcp__project-knowledge__flowdesk_admin_prompt_sandbox',
].join(',');

const SYSTEM_PROMPT = `You are the AI assistant embedded in the FlowDesk Chat "System Prompt Graph" editor.
The chat's system prompt is authored as a GRAPH OF RULES — one rule = one node — which compiles to the text prompt that governs the FlowDesk intake chat (a UN HR/Finance service desk assistant).

Your job: help the operator improve that prompt. You can:
- Read real chat sessions and diagnostics via the MCP tools (flowdesk_admin_list_negative_sessions, flowdesk_admin_get_session_turns, flowdesk_admin_analyze_session, flowdesk_admin_session_stats, flowdesk_admin_resolve_intent). USE THEM to ground your suggestions in real data.
- READ AND EDIT the rules graphs directly via MCP: flowdesk_admin_prompt_list_graphs, flowdesk_admin_prompt_get_graph (load a saved graph + nodes/edges), flowdesk_admin_prompt_mutate_graph (apply add/update/remove ops to a graph and, with save:true, persist a NEW VERSION), flowdesk_admin_prompt_save_graph (save a full graph as a new version), flowdesk_admin_prompt_default_graph (the starter).
- Validate and sandbox-test (flowdesk_admin_prompt_validate, flowdesk_admin_prompt_sandbox) BEFORE persisting or recommending a change.

TWO ways to edit — use the right one:
1. EDIT THE OPERATOR'S CURRENT CANVAS (the graph shown above): output a fenced "mutations" block. The editor applies it to the live canvas. Use this for in-session collaboration.
2. EDIT A SAVED GRAPH DIRECTLY (autonomous): call flowdesk_admin_prompt_mutate_graph with {entryId, mutations, save:true} to apply changes and persist a new version — do this when the operator asks you to edit/save a stored graph. ALWAYS validate (and ideally sandbox) first, and report the new version + validation result.

Mutation op shapes (same for the "mutations" block and the mutate_graph tool):
  { "op": "add",    "node": { "key": "...", "title": "...", "category": "identity|domain|routing|dialogue|tone|safety|deflection|formatting|custom", "text": "the instruction", "appliesTo": ["all"] } }
  { "op": "update", "key": "existing-rule-key", "patch": { "text": "...", "enabled": false, "category": "...", "appliesTo": [...] } }
  { "op": "remove", "key": "existing-rule-key" }
Example mutations block:
\`\`\`mutations
[ { "op": "add", "node": { "key": "confirm-subject", "title": "Confirm subject", "category": "dialogue", "text": "Mirror the user's stated need back for confirmation before asking detail fields.", "appliesTo": ["question_planner"] } } ]
\`\`\`
Rules: keep each rule text a single clear instruction; choose the right category and appliesTo; validate/sandbox before persisting. NEVER apply a prompt LIVE to production (that stays the operator's explicit click). Explain your reasoning briefly. Respond in the user's language.`;

function buildTurnPrompt({ message, history, graph }) {
  const hist = (history || []).slice(-8).map((m) => `${m.role === 'user' ? 'Operator' : 'Assistant'}: ${m.content}`).join('\n');
  const rules = ((graph && graph.nodes) || []).filter((n) => n.data && n.data.kind !== 'section').map((n) => {
    const d = n.data || {};
    return `- [${d.category || 'custom'}] ${d.key || n.id}${d.enabled === false ? ' (disabled)' : ''}: ${d.text || ''} (appliesTo: ${(d.appliesTo || ['all']).join(',')})`;
  }).join('\n');
  return `Current rules graph (${((graph && graph.nodes) || []).length} nodes):\n${rules || '(empty graph)'}\n\n` +
    (hist ? `Conversation so far:\n${hist}\n\n` : '') +
    `Operator: ${message}`;
}

/**
 * Stream one assistant turn as SSE events via `emit(event)`.
 * @param {object} p {message, history, graph, model, signal}
 * @param {(ev:object)=>void} emit  emits {type:'token'|'tool_call'|'tool_result'|'mutations'|'usage'|'done'|'error', ...}
 */
async function streamAssistantTurn(p, emit) {
  const binary = findClaudeBinary();
  const mcpCfg = buildMcpConfig();
  const useModel = p.model || process.env.FLOWDESK_ADMIN_ASSISTANT_MODEL || process.env.SUMMARY_MODEL || 'claude-sonnet-4-6';
  const prompt = buildTurnPrompt(p);

  const args = [
    '--print', '--output-format', 'stream-json', '--input-format', 'text',
    '--system-prompt', SYSTEM_PROMPT,
    '--mcp-config', JSON.stringify(mcpCfg),
    '--strict-mcp-config', // isolate to OUR project-knowledge server; ignore the user's global MCP config
    '--tools', '',
    '--allowed-tools', ALLOWED_MCP_TOOLS,
    '--model', useModel,
    '--no-session-persistence', '--verbose',
    '--max-turns', '12', '--max-budget-usd', '1.50',
  ];

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(binary, args, { env: { ...process.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      emit({ type: 'error', message: `Failed to spawn claude: ${err.message}` });
      return resolve();
    }
    const kill = () => { try { proc.kill('SIGTERM'); } catch { /* ignore */ } };
    p.signal?.addEventListener('abort', kill);
    const timeout = setTimeout(kill, 4 * 60 * 1000);

    proc.stdin.write(prompt, 'utf8');
    proc.stdin.end();

    let buf = '';
    let stderr = '';
    let fullText = '';
    let done = false;

    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try { handle(JSON.parse(line)); } catch { /* skip malformed */ }
      }
    });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    proc.on('error', (err) => {
      clearTimeout(timeout); p.signal?.removeEventListener('abort', kill);
      emit({ type: 'error', message: `Claude Code error: ${err.message}` });
      resolve();
    });
    proc.on('close', (code) => {
      clearTimeout(timeout); p.signal?.removeEventListener('abort', kill);
      if (!done) {
        if (!fullText) console.warn(`[prompt-assistant] claude exited ${code} with no output. stderr: ${stderr.slice(0, 400)}`);
        // Extract mutations from the accumulated text, then close.
        emitMutations(fullText);
        emit({ type: 'done' });
      }
      if (stderr && !fullText) emit({ type: 'error', message: stderr.slice(0, 300) });
      resolve();
    });

    function emitMutations(text) {
      const m = /```mutations\s*([\s\S]*?)```/i.exec(text);
      if (!m) return;
      try {
        const ops = JSON.parse(m[1].trim());
        if (Array.isArray(ops) && ops.length) emit({ type: 'mutations', mutations: ops });
      } catch { /* malformed mutations block — ignore */ }
    }

    function handle(msg) {
      switch (msg.type) {
        case 'system':
          if (msg.subtype === 'init') emit({ type: 'token', content: '' }); // warm the stream
          break;
        case 'assistant': {
          const content = msg.message?.content || [];
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              fullText += block.text;
              emit({ type: 'token', content: block.text });
            } else if (block.type === 'tool_use') {
              const name = String(block.name || '').replace(/^mcp__project-knowledge__/, '');
              emit({ type: 'tool_call', tool: name, args: block.input || {} });
            }
          }
          break;
        }
        case 'user': {
          // tool results come back as a user message with tool_result blocks
          const content = msg.message?.content || [];
          for (const block of content) {
            if (block.type === 'tool_result') {
              emit({ type: 'tool_result', tool: '', success: !block.is_error, data: null });
            }
          }
          break;
        }
        case 'result':
          done = true;
          if (msg.subtype === 'success') {
            emitMutations(msg.result || fullText);
            emit({ type: 'usage', costUsd: msg.total_cost_usd || 0, turns: msg.num_turns || null });
          } else {
            emit({ type: 'error', message: `agent stopped: ${msg.subtype}` });
          }
          emit({ type: 'done' });
          break;
      }
    }
  });
}

module.exports = { streamAssistantTurn, ALLOWED_MCP_TOOLS };
