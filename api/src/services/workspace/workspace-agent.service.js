/**
 * WorkSpace Agent Service
 *
 * Provides a persistent chat session per WorkSpace, backed by Memgraph.
 * Wraps the existing AnthropicAgentService and injects WorkSpace-aware
 * context (sources, drafts, contradictions count, current status) into
 * the system prompt.
 *
 * Storage model:
 *   (WorkSpace)-[:HAS_AGENT_SESSION]->(WorkSpaceAgentSession)
 *     -[:HAS_MESSAGE]->(WorkSpaceChatMessage {role, content, ts})
 *
 * One session per workspace (singleton). Messages are appended in order
 * and replayed on every chat() call.
 *
 * @module services/workspace/workspace-agent.service
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

const LOG_PREFIX = '[WorkspaceAgentService]';
const MAX_MESSAGES_IN_CONTEXT = 40;     // tail of history sent to the model
const MAX_TEXT_BUFFER = 16000;          // max chars buffered in a single text turn

// Lazy deps
let _memgraph = null;
let _workspaceService = null;
let _draftService = null;
let _agentService = null;
let _actionLog = null;
let _toolFilter = null;
let _graphVersion = null;

function mg() {
  if (!_memgraph) _memgraph = require('../memgraph.service');
  return _memgraph;
}
function ws() {
  if (!_workspaceService) _workspaceService = require('./workspace.service');
  return _workspaceService;
}
function drafts() {
  if (!_draftService) _draftService = require('./draft.service');
  return _draftService;
}
async function agent() {
  if (!_agentService) {
    const { getAgentService } = require('../agents/anthropic-agent.service');
    _agentService = await getAgentService();
  }
  return _agentService;
}
function actionLog() {
  if (!_actionLog) _actionLog = require('./action-log.service');
  return _actionLog;
}
function toolFilter() {
  if (!_toolFilter) _toolFilter = require('./agent-tool-filter');
  return _toolFilter;
}
function graphVersion() {
  if (!_graphVersion) _graphVersion = require('./graph-version.service');
  return _graphVersion;
}

class WorkspaceAgentService {

  // ==================== SESSION CRUD ====================

  /**
   * Get or create a persistent chat session for a workspace.
   * @param {string} workspaceId
   * @returns {Promise<{id, workspaceId, createdAt, lastActiveAt, messages: Array}>}
   */
  async getOrCreateSession(workspaceId) {
    const workspace = await ws().get(workspaceId);
    if (!workspace) {
      throw new Error(`WorkSpace not found: ${workspaceId}`);
    }

    // Try to fetch existing session
    const existing = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_AGENT_SESSION]->(s:WorkSpaceAgentSession)
       RETURN s LIMIT 1`,
      { wsId: workspaceId }
    );

    if (existing && existing.length > 0) {
      const session = this._recordToSession(existing[0]);
      session.messages = await this._loadMessages(session.id);
      return session;
    }

    // Create new session
    const session = {
      id: uuidv4(),
      workspaceId,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString()
    };

    await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})
       CREATE (s:WorkSpaceAgentSession {
         id: $id,
         workspaceId: $wsId,
         createdAt: $createdAt,
         lastActiveAt: $lastActiveAt
       })
       CREATE (w)-[:HAS_AGENT_SESSION]->(s)
       RETURN s`,
      {
        wsId: workspaceId,
        id: session.id,
        createdAt: session.createdAt,
        lastActiveAt: session.lastActiveAt
      }
    );

    console.log(`${LOG_PREFIX} Created session ${session.id} for workspace ${workspaceId}`);
    session.messages = [];
    return session;
  }

  /**
   * Get existing session (does not create).
   * @param {string} workspaceId
   */
  async getSession(workspaceId) {
    const result = await mg().runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_AGENT_SESSION]->(s:WorkSpaceAgentSession)
       RETURN s LIMIT 1`,
      { wsId: workspaceId }
    );
    if (!result || result.length === 0) return null;

    const session = this._recordToSession(result[0]);
    session.messages = await this._loadMessages(session.id);
    return session;
  }

  /**
   * Append a message to the session.
   * @param {string} workspaceId
   * @param {'user'|'assistant'} role
   * @param {string} content
   * @param {Object} [meta] - Optional metadata (e.g. tool calls summary)
   * @returns {Promise<Object>} The created message node
   */
  async addMessage(workspaceId, role, content, meta = {}) {
    if (!['user', 'assistant'].includes(role)) {
      throw new Error(`Invalid role: ${role}`);
    }
    const session = await this.getOrCreateSession(workspaceId);

    const msg = {
      id: uuidv4(),
      sessionId: session.id,
      role,
      content: typeof content === 'string' ? content : JSON.stringify(content),
      meta: JSON.stringify(meta || {}),
      ts: new Date().toISOString()
    };

    await mg().runQuery(
      `MATCH (s:WorkSpaceAgentSession {id: $sessionId})
       CREATE (m:WorkSpaceChatMessage {
         id: $id,
         sessionId: $sessionId,
         role: $role,
         content: $content,
         meta: $meta,
         ts: $ts
       })
       CREATE (s)-[:HAS_MESSAGE]->(m)
       SET s.lastActiveAt = $ts
       RETURN m`,
      msg
    );

    return msg;
  }

  /**
   * Clear all messages in a workspace session (keeps the session node).
   * @param {string} workspaceId
   * @returns {Promise<{cleared: number}>}
   */
  async clearHistory(workspaceId) {
    const session = await this.getSession(workspaceId);
    if (!session) return { cleared: 0 };

    const result = await mg().runQuery(
      `MATCH (s:WorkSpaceAgentSession {id: $sessionId})-[:HAS_MESSAGE]->(m:WorkSpaceChatMessage)
       DETACH DELETE m
       RETURN count(m) as cleared`,
      { sessionId: session.id }
    );
    const cleared = result[0]?.cleared || 0;

    await mg().runQuery(
      `MATCH (s:WorkSpaceAgentSession {id: $sessionId})
       SET s.lastActiveAt = $ts`,
      { sessionId: session.id, ts: new Date().toISOString() }
    );

    console.log(`${LOG_PREFIX} Cleared ${cleared} messages from session ${session.id}`);
    return { cleared };
  }

  // ==================== CHAT ====================

  /**
   * Send a user message and stream the agent response.
   * Persists both the user message and the assistant final reply.
   * Yields SSE-style events for the controller to forward.
   *
   * @param {string} workspaceId
   * @param {string} userMessage
   * @yields {Object} events: text, tool_call, tool_result, done, error
   */
  async *chat(workspaceId, userMessage) {
    if (!userMessage || typeof userMessage !== 'string') {
      throw new Error('userMessage must be a non-empty string');
    }

    const session = await this.getOrCreateSession(workspaceId);

    // Persist user message first so it survives a stream crash
    const userMsg = await this.addMessage(workspaceId, 'user', userMessage);

    // Build system prompt with workspace context
    const systemPrompt = await this._buildSystemPrompt(workspaceId);

    // Build message history for the model (load fresh — addMessage just updated)
    const history = await this._loadMessages(session.id, MAX_MESSAGES_IN_CONTEXT);
    const modelMessages = history.map(m => ({
      role: m.role,
      content: m.content
    }));

    // Stream from the underlying agent with WorkSpace tool whitelist
    const agentSvc = await agent();
    const tf = toolFilter();
    let assistantText = '';
    let toolCalls = [];

    try {
      for await (const event of agentSvc.chat(systemPrompt, modelMessages, {
        workspaceId,
        sessionId: session.id,
        allowedToolsFilter: (tool) => tf.isToolAllowed(tool?.name)
      })) {
        // Buffer assistant text for persistence
        if (event.type === 'text' && typeof event.content === 'string') {
          if (assistantText.length + event.content.length <= MAX_TEXT_BUFFER) {
            assistantText += event.content;
          }
        }

        // Log every tool call to the action log
        if (event.type === 'tool_call') {
          toolCalls.push({ name: event.name, input: event.input });
          let actionRecord = null;
          try {
            actionRecord = await actionLog().logAction({
              workspaceId,
              sessionId: session.id,
              toolName: event.name,
              toolInput: event.input,
              messageId: userMsg.id
            });
          } catch (logErr) {
            console.warn(`${LOG_PREFIX} action log failed for ${event.name}: ${logErr.message}`);
          }
          // Auto-checkpoint hook (debounced inside the version service)
          if (actionRecord) {
            try {
              await graphVersion().maybeAutoCheckpoint(workspaceId, actionRecord);
            } catch (cpErr) {
              console.warn(`${LOG_PREFIX} auto-checkpoint failed: ${cpErr.message}`);
            }
          }
        }

        yield event;
      }
    } catch (err) {
      console.error(`${LOG_PREFIX} chat error:`, err.message);
      yield { type: 'error', error: err.message };
      return;
    }

    // Persist assistant reply (only if we got something)
    if (assistantText.trim().length > 0 || toolCalls.length > 0) {
      await this.addMessage(workspaceId, 'assistant', assistantText || '[tool-only response]', {
        toolCalls: toolCalls.slice(0, 20) // cap stored metadata
      });
    }
  }

  /**
   * Manually log an action (used by external services that perform direct
   * mutations on behalf of the workspace agent — e.g. promotion service).
   * Convenience wrapper around action-log.service.
   */
  async logAction(params) {
    return actionLog().logAction(params);
  }

  /**
   * List actions for a workspace.
   * @param {string} workspaceId
   * @param {Object} [opts]
   */
  async getActions(workspaceId, opts = {}) {
    return actionLog().getActions(workspaceId, opts);
  }

  // ==================== INTERNAL ====================

  async _loadMessages(sessionId, limit = 100) {
    const safeLimit = parseInt(limit, 10) || 100;
    const result = await mg().runQuery(
      `MATCH (s:WorkSpaceAgentSession {id: $sessionId})-[:HAS_MESSAGE]->(m:WorkSpaceChatMessage)
       RETURN m
       ORDER BY m.ts ASC
       LIMIT ${safeLimit}`,
      { sessionId }
    );
    return (result || []).map(r => this._recordToMessage(r));
  }

  async _buildSystemPrompt(workspaceId) {
    const workspace = await ws().get(workspaceId);
    let sourceCount = 0;
    let draftCount = 0;
    try {
      const sources = await ws().listSources(workspaceId);
      sourceCount = Array.isArray(sources) ? sources.length : 0;
    } catch {}
    try {
      const draftRes = await drafts().list(workspaceId, { limit: 1, offset: 0 });
      draftCount = draftRes?.total ?? (draftRes?.items?.length || 0);
    } catch {}

    const tagsArr = (() => {
      try { return JSON.parse(workspace.tags || '[]'); } catch { return []; }
    })();

    return `You are the WorkSpace Agent — an AI assistant operating inside an isolated knowledge-extraction sandbox called a WorkSpace.

## Current WorkSpace
- **ID:** ${workspace.id}
- **Name:** ${workspace.name}
- **Description:** ${workspace.description || '(none)'}
- **Domain:** ${workspace.domain || '(none)'}
- **Status:** ${workspace.status}
- **Tags:** ${tagsArr.join(', ') || '(none)'}
- **Sources:** ${sourceCount}
- **Draft knowledge objects:** ${draftCount}

**ALWAYS pass workspaceId="${workspace.id}" to every workspace_* tool you call.**

## Isolation Rules (CRITICAL)
1. You operate ONLY within this WorkSpace. You can READ from the global Knowledge Base, but you CANNOT write to it directly.
2. All extracted knowledge becomes DRAFT inside this WorkSpace. Promotion to global KB requires explicit user confirmation.
3. You cannot see or read data from other WorkSpaces.

## Tools You Have (call them by these exact names)

### Lifecycle & inspection
- \`workspace_get\` — fetch this WorkSpace's metadata + stats
- \`workspace_list_sources\` — list all uploaded source documents
- \`workspace_list_drafts\` — list draft knowledge objects (filterable by type, status)
- \`workspace_get_draft\` — full content of a single draft
- \`workspace_search_drafts\` — semantic search across drafts in this WorkSpace
- \`workspace_retrieve\` — hybrid retrieval: semantic search PLUS graph expansion from what it finds. Returns \`assembledContext\` — prompt-ready text you can reason over directly. Use this instead of \`workspace_search_drafts\` when you need context to answer a question, rather than a list of matching drafts: it also surfaces the rules governing a matched entity, its dependencies, and any draft that contradicts it — none of which share wording with the query.

### Mutation
- \`workspace_create_draft\` — create a new draft knowledge object (entity, business_rule, workflow, etc.)
- \`workspace_update_draft\` — modify a draft (label, content, status, confidence)
- \`workspace_create_edge\` — link two drafts with a typed relationship
- \`workspace_get_edges\` — list edges around a draft

### Read-only access to Global KB
- \`workspace_kb_search\` — semantic search in the global Knowledge Base
- \`workspace_kb_get_node\` — fetch a single KB node
- \`workspace_kb_get_neighbors\` — graph neighbours of a KB node

### Analysis (use these for high-level questions)
- \`workspace_validate_graph\` — run all 10 validation rules; returns blockers/errors/warnings
- \`workspace_detect_contradictions\` — scan drafts for conflicting values across sources
- \`workspace_analyze_sources\` — coverage / shared entities / source relationships / health report

You can call multiple tools in sequence. Start with the most relevant inspection tool for the user's question.

## Your Responsibilities
- Help the user analyze sources, extract entities/rules/workflows, and build a coherent draft knowledge graph.
- Detect contradictions between sources and surface them for review.
- Suggest links between draft objects and existing global KB nodes.
- Validate the draft graph before promotion.
- Be concise and explicit about what you change. Every action is logged.

Respond in the user's language (Russian by default for this project). Keep replies focused and actionable.`;
  }

  _recordToSession(record) {
    const node = record.s?.properties || record.s || record;
    return {
      id: node.id,
      workspaceId: node.workspaceId,
      createdAt: node.createdAt,
      lastActiveAt: node.lastActiveAt
    };
  }

  _recordToMessage(record) {
    const node = record.m?.properties || record.m || record;
    let meta = {};
    try { meta = JSON.parse(node.meta || '{}'); } catch {}
    return {
      id: node.id,
      sessionId: node.sessionId,
      role: node.role,
      content: node.content,
      meta,
      ts: node.ts
    };
  }
}

// Singleton
const instance = new WorkspaceAgentService();

module.exports = instance;
module.exports.WorkspaceAgentService = WorkspaceAgentService;
