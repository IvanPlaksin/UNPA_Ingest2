'use strict';

/**
 * AnthropicAgentService — Full Agent SDK integration for GXE AI Assistant.
 *
 * Connects to MCP server (project-knowledge) for Codex + knowledge tools.
 * Provides in-process GXE graph tools.
 * Implements proper agentic loop with streaming.
 */

const Anthropic = require('@anthropic-ai/sdk');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { CODEX_TOOLS, executeCodexTool } = require('../codex/codex-tools');
const { createAllTools } = require('../../mcp/index');
const { filterToolsForTask, classifyTaskIntent } = require('../graph/tool-filter');
const { CatalogReuseService } = require('../graph/catalog-reuse.service');

const MCP_SERVER_PATH = process.env.MCP_SERVER_PATH || 'd:/UN/Repos/MCP_CLAUDE/mcp-server/dist/index.js';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const MAX_AGENT_ITERATIONS = 10;

/**
 * Sanitize tool names for Claude API (dots not allowed in tool names).
 * Pattern: ^[a-zA-Z0-9_-]{1,128}$
 */
function sanitizeToolName(name) { return name.replace(/\./g, '_'); }
function restoreToolName(name) { return name.replace(/_/g, '.'); }

/**
 * Optional namespace filter for GXE tools.
 * Set via AGENT_TOOL_NAMESPACES env var (comma-separated).
 * If empty/unset, all tools are loaded.
 * Example: AGENT_TOOL_NAMESPACES=backlog,catalog,graph,workflow
 */
const AGENT_TOOL_NAMESPACES = process.env.AGENT_TOOL_NAMESPACES
  ? process.env.AGENT_TOOL_NAMESPACES.split(',').map(s => s.trim()).filter(Boolean)
  : null; // null = all namespaces

/** Delay between agentic loop iterations to avoid 529 overload (ms). */
const ITERATION_DELAY_MS = parseInt(process.env.AGENT_ITERATION_DELAY_MS || '500', 10);
/** Max retries for 529/overloaded errors within the agentic loop. */
const MAX_OVERLOAD_RETRIES = parseInt(process.env.AGENT_MAX_OVERLOAD_RETRIES || '3', 10);
/** Base delay for exponential backoff on 529 (ms). */
const OVERLOAD_BACKOFF_BASE_MS = parseInt(process.env.AGENT_OVERLOAD_BACKOFF_MS || '5000', 10);

class AnthropicAgentService {
  constructor() {
    this.anthropic = new Anthropic({ maxRetries: 3 });
    this.mcpClient = null;
    this.mcpTransport = null;
    this.allTools = [];
    this.mcpToolNames = new Set();
    this.catalogReuse = new CatalogReuseService();
    this._initialized = false;
  }

  async initialize() {
    if (this._initialized) return;

    // 1. Connect to MCP server
    await this._connectMCP();

    // 2. Load all tools (MCP + in-process Codex + GXE)
    await this._loadTools();

    this._initialized = true;
    console.log(`[AgentSDK] Initialized: ${this.allTools.length} tools (${this.mcpToolNames.size} MCP + ${this.allTools.length - this.mcpToolNames.size} local)`);
  }

  async _connectMCP() {
    try {
      this.mcpTransport = new StdioClientTransport({
        command: 'node',
        args: [MCP_SERVER_PATH],
        env: {
          ...process.env,
          CODEX_API_URL: 'http://localhost:3010/api/v1/codex',
        },
      });

      this.mcpClient = new Client({
        name: 'gxe-assistant-agent',
        version: '1.0.0',
      }, {
        capabilities: { tools: {} },
      });

      await this.mcpClient.connect(this.mcpTransport);
      console.log('[AgentSDK] MCP server connected');
    } catch (err) {
      console.warn('[AgentSDK] MCP connection failed:', err.message, '— running without MCP tools');
      this.mcpClient = null;
    }
  }

  async _loadTools() {
    this.allTools = [];
    this.mcpToolNames = new Set();

    // MCP tools from project-knowledge server
    if (this.mcpClient) {
      try {
        const mcpResult = await this.mcpClient.listTools();
        for (const tool of (mcpResult.tools || [])) {
          const safeName = sanitizeToolName(tool.name);
          this.allTools.push({
            name: safeName,
            description: tool.description,
            input_schema: tool.inputSchema,
          });
          this.mcpToolNames.add(safeName);
        }
        console.log(`[AgentSDK] Loaded ${this.mcpToolNames.size} MCP tools`);
      } catch (err) {
        console.warn('[AgentSDK] Failed to load MCP tools:', err.message);
      }
    }

    // Fallback: local Codex tools (if MCP not available)
    if (this.mcpToolNames.size === 0) {
      for (const tool of CODEX_TOOLS) {
        this.allTools.push(tool);
      }
      console.log(`[AgentSDK] Loaded ${CODEX_TOOLS.length} local Codex tools (MCP fallback)`);
    }

    // In-process GXE tools (ALL tools from local MCP server, with optional namespace filter)
    this._gxeToolInstances = {};
    try {
      let gxeToolInstances = createAllTools();

      // Optional namespace filtering
      if (AGENT_TOOL_NAMESPACES) {
        const nsSet = new Set(AGENT_TOOL_NAMESPACES);
        gxeToolInstances = gxeToolInstances.filter(t => {
          const def = t.getDefinition();
          const ns = (def.id || '').split('.')[0]; // e.g. 'backlog' from 'backlog.create_task'
          return nsSet.has(ns) || nsSet.has(def.category);
        });
        console.log(`[AgentSDK] Namespace filter: ${AGENT_TOOL_NAMESPACES.join(', ')}`);
      }

      // Deduplicate: skip GXE tools that already exist as MCP tools
      for (const toolInstance of gxeToolInstances) {
        const def = toolInstance.getDefinition();
        const toolName = def.id;

        const safeName = sanitizeToolName(toolName);
        if (this.mcpToolNames.has(safeName)) continue; // MCP version takes precedence

        this.allTools.push({
          name: safeName,
          description: `[${def.category}] ${def.description}`,
          input_schema: def.inputSchema,
        });
        this._gxeToolInstances[safeName] = toolInstance;
      }
      console.log(`[AgentSDK] Loaded ${Object.keys(this._gxeToolInstances).length} GXE tools (in-process${AGENT_TOOL_NAMESPACES ? ', filtered' : ', all'})`);
    } catch (err) {
      console.warn('[AgentSDK] Failed to load GXE tools:', err.message);
    }
  }

  /**
   * Main agentic loop with streaming.
   * Yields events: { type: 'text'|'tool_call'|'tool_result'|'done'|'error', ... }
   */
  async *chat(systemPrompt, messages, sessionContext = {}) {
    if (!this._initialized) await this.initialize();

    let currentMessages = messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    // ── Optional caller-provided whitelist (e.g. WorkSpace agent isolation) ──
    // sessionContext.allowedToolsFilter: (tool) => boolean
    // Applied BEFORE the heuristic ToolFilter so that intent-based filtering
    // works on the already-restricted set.
    let baseTools = this.allTools;
    if (typeof sessionContext.allowedToolsFilter === 'function') {
      const before = baseTools.length;
      baseTools = baseTools.filter(t => {
        try { return !!sessionContext.allowedToolsFilter(t); } catch { return false; }
      });
      console.log(`[AgentSDK] Caller-provided tool whitelist: ${baseTools.length}/${before} tools allowed`);
      yield {
        type: 'whitelist_applied',
        toolsAllowed: baseTools.length,
        toolsTotal: before,
      };
    }

    // ── ToolFilter: reduce tools based on message intent ──────────────
    // SKIPPED when the caller already provided an explicit whitelist
    // (e.g. WorkSpace agent passes only the relevant ~40 tools — narrowing
    // them further by greeting-text intent removes the very tools the agent
    // was scoped to use). Caller can also explicitly opt out via
    // sessionContext.skipIntentFilter = true.
    const skipIntentFilter = sessionContext.skipIntentFilter === true
      || typeof sessionContext.allowedToolsFilter === 'function';

    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    const userText = typeof lastUserMsg?.content === 'string'
      ? lastUserMsg.content
      : (Array.isArray(lastUserMsg?.content) ? lastUserMsg.content.map(b => b.text || '').join(' ') : '');

    // Always classify intent — it's used downstream by CatalogReuse
    const intent = classifyTaskIntent(userText);
    let activeTools = baseTools;

    if (skipIntentFilter) {
      console.log(`[AgentSDK] Intent filter skipped (caller-provided whitelist) — using all ${baseTools.length} allowed tools`);
    } else if (intent.confidence >= 0.3) {
      const filterResult = filterToolsForTask(userText, baseTools, { minTools: 5, maxTools: 30 });
      activeTools = filterResult.tools.length >= 5 ? filterResult.tools : baseTools;
      console.log(`[AgentSDK] ToolFilter: ${filterResult.reduction} | domain=${intent.primaryDomain} confidence=${intent.confidence.toFixed(2)}`);
      yield {
        type: 'filter_applied',
        domain: intent.primaryDomain,
        confidence: intent.confidence,
        toolsProvided: activeTools.length,
        toolsTotal: baseTools.length,
        reduction: filterResult.stats.reductionPercent,
      };
    } else {
      console.log(`[AgentSDK] ToolFilter: low confidence (${intent.confidence.toFixed(2)}), using all ${baseTools.length} tools`);
    }

    // ── Catalog Reuse: search for similar existing graphs ────────────
    let reuseContext = '';
    try {
      const reuseResult = await this.catalogReuse.findReuseOpportunity(userText, intent);

      yield {
        type: 'catalog_search',
        strategy: reuseResult.strategy,
        score: reuseResult.score,
        candidatesCount: reuseResult.candidates.length,
        recommendation: reuseResult.recommendation,
      };

      if (reuseResult.strategy === 'DIRECT_REUSE') {
        const existingGraph = await this.catalogReuse.loadGraphForReuse(reuseResult.bestMatch.id);
        const nodeSummary = existingGraph.nodes.map(n => `${n.id}: ${n.data?.label || n.type} (${n.data?.tool || n.data?.toolId || '-'})`).join('\n');
        reuseContext = `\n\n## EXISTING GRAPH FOUND (${(reuseResult.score * 100).toFixed(0)}% match)
A highly similar graph "${existingGraph.name}" already exists in the catalog (ID: ${existingGraph.id}).
Nodes:\n${nodeSummary}
\nInstead of creating a new graph from scratch, suggest how to use or adapt this existing graph. Only propose new nodes if the user's request clearly requires functionality not present in the existing graph.`;

        yield {
          type: 'reuse_suggestion',
          action: 'DIRECT_REUSE',
          graphId: existingGraph.id,
          graphName: existingGraph.name,
          nodeCount: existingGraph.nodes.length,
          message: reuseResult.recommendation.message,
        };

      } else if (reuseResult.strategy === 'CLONE_MODIFY') {
        const templateGraph = await this.catalogReuse.loadGraphForReuse(reuseResult.bestMatch.id);
        const nodeSummary = templateGraph.nodes.map(n => `${n.id}: ${n.data?.label || n.type} (${n.data?.tool || n.data?.toolId || '-'})`).join('\n');
        reuseContext = `\n\n## STARTING TEMPLATE (${(reuseResult.score * 100).toFixed(0)}% match)
A similar graph "${templateGraph.name}" has been loaded as your starting point (ID: ${templateGraph.id}).
Template nodes:\n${nodeSummary}
\nModify this template to match the user's requirements. Use %%ACTION%% blocks to UPDATE_NODE, ADD_NODE, REMOVE_NODE, ADD_EDGE, or REMOVE_EDGE as needed.`;

        yield {
          type: 'reuse_suggestion',
          action: 'CLONE_MODIFY',
          graphId: templateGraph.id,
          graphName: templateGraph.name,
          nodeCount: templateGraph.nodes.length,
          message: reuseResult.recommendation.message,
        };

      } else if (reuseResult.strategy === 'ABSTRACT_INHERIT' && reuseResult.bestMatch) {
        reuseContext = `\n\n## REFERENCE GRAPH
A related graph "${reuseResult.bestMatch.name}" exists in the catalog (${(reuseResult.score * 100).toFixed(0)}% match). Consider its structure when designing, but create nodes appropriate for the user's specific requirements.`;
      }
    } catch (reuseErr) {
      console.warn('[AgentSDK] CatalogReuse search failed:', reuseErr.message);
    }

    // Append reuse context to system prompt
    const effectiveSystemPrompt = reuseContext ? systemPrompt + reuseContext : systemPrompt;

    let iterations = 0;

    while (iterations < MAX_AGENT_ITERATIONS) {
      iterations++;

      // Throttle between iterations to avoid API overload (529)
      if (iterations > 1 && ITERATION_DELAY_MS > 0) {
        await new Promise(r => setTimeout(r, ITERATION_DELAY_MS));
      }

      try {
        // Call Anthropic with streaming (retry on 529/overloaded)
        let stream;
        let overloadRetries = 0;
        while (true) {
          try {
            stream = this.anthropic.messages.stream({
              model: ANTHROPIC_MODEL,
              max_tokens: 8192,
              system: effectiveSystemPrompt,
              tools: activeTools,
              messages: currentMessages,
            });
            break; // success
          } catch (apiErr) {
            const status = apiErr.status || apiErr.statusCode || apiErr.error?.status;
            if ((status === 529 || (apiErr.message && apiErr.message.includes('overloaded'))) && overloadRetries < MAX_OVERLOAD_RETRIES) {
              overloadRetries++;
              const delay = OVERLOAD_BACKOFF_BASE_MS * Math.pow(2, overloadRetries - 1);
              console.warn(`[AgentSDK] 529 Overloaded (attempt ${overloadRetries}/${MAX_OVERLOAD_RETRIES}), retrying in ${delay}ms...`);
              yield { type: 'retry', attempt: overloadRetries, delay, reason: 'API overloaded (529)' };
              await new Promise(r => setTimeout(r, delay));
            } else {
              throw apiErr;
            }
          }
        }

        let assistantContent = [];
        let hasToolUse = false;

        // Process streaming events
        try {
          for await (const event of stream) {
            if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta') {
                yield { type: 'text', content: event.delta.text };
              }
            }

            if (event.type === 'content_block_stop' && event.content_block) {
              assistantContent.push(event.content_block);
              if (event.content_block.type === 'tool_use') {
                hasToolUse = true;
                yield {
                  type: 'tool_call',
                  name: event.content_block.name,
                  input: event.content_block.input,
                  id: event.content_block.id,
                };
              }
            }
          }
        } catch (streamReadErr) {
          // Handle 529 during streaming (mid-response)
          const status = streamReadErr.status || streamReadErr.statusCode;
          if ((status === 529 || (streamReadErr.message && streamReadErr.message.includes('overloaded'))) && overloadRetries < MAX_OVERLOAD_RETRIES) {
            overloadRetries++;
            const delay = OVERLOAD_BACKOFF_BASE_MS * Math.pow(2, overloadRetries - 1);
            console.warn(`[AgentSDK] 529 during stream (attempt ${overloadRetries}/${MAX_OVERLOAD_RETRIES}), retrying in ${delay}ms...`);
            yield { type: 'retry', attempt: overloadRetries, delay, reason: 'API overloaded during stream (529)' };
            await new Promise(r => setTimeout(r, delay));
            continue; // retry entire iteration
          }
          throw streamReadErr;
        }

        // Ensure we capture the full message
        const finalMessage = await stream.finalMessage();
        if (finalMessage?.content) {
          assistantContent = finalMessage.content;
          hasToolUse = assistantContent.some(b => b.type === 'tool_use');
        }

        // If no tool use, we're done
        if (!hasToolUse) {
          yield { type: 'done', iterations };
          return;
        }

        // Execute tools
        currentMessages.push({ role: 'assistant', content: assistantContent });

        const toolResults = [];
        for (const block of assistantContent) {
          if (block.type !== 'tool_use') continue;

          const { id, name, input } = block;

          try {
            let result;

            if (this.mcpToolNames.has(name)) {
              // Execute via MCP (project-knowledge server) — restore original name with dots
              const originalName = restoreToolName(name);
              const mcpResult = await this.mcpClient.callTool({ name: originalName, arguments: input });
              result = mcpResult.content?.[0]?.text || JSON.stringify(mcpResult);
            } else if (this._gxeToolInstances?.[name]) {
              // Execute GXE tool in-process (backlog, catalog, graph, etc.)
              const toolResult = await this._gxeToolInstances[name].execute(input, { agentId: 'gxe-assistant' });
              result = JSON.stringify(toolResult?.data || toolResult);
            } else {
              // Execute locally (Codex fallback)
              result = await executeCodexTool(name, input);
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: id,
              content: typeof result === 'string' ? result : JSON.stringify(result),
            });

            yield { type: 'tool_result', name, result: result?.slice?.(0, 200) || '...' };

          } catch (err) {
            toolResults.push({
              type: 'tool_result',
              tool_use_id: id,
              content: JSON.stringify({ error: err.message }),
              is_error: true,
            });

            yield { type: 'tool_error', name, error: err.message };
          }
        }

        currentMessages.push({ role: 'user', content: toolResults });

      } catch (err) {
        // Final catch: check if 529 and can retry the whole iteration
        const status = err.status || err.statusCode;
        if ((status === 529 || (err.message && err.message.includes('overloaded'))) && iterations < MAX_AGENT_ITERATIONS) {
          const delay = OVERLOAD_BACKOFF_BASE_MS * 2;
          console.warn(`[AgentSDK] 529 Overloaded at iteration ${iterations}, retrying in ${delay}ms...`);
          yield { type: 'retry', attempt: iterations, delay, reason: 'API overloaded (529), retrying iteration' };
          await new Promise(r => setTimeout(r, delay));
          iterations--; // retry same iteration
          continue;
        }
        yield { type: 'error', error: err.message, iterations };
        return;
      }
    }

    yield { type: 'max_iterations', iterations: MAX_AGENT_ITERATIONS };
  }

  async shutdown() {
    if (this.mcpClient) {
      try { await this.mcpClient.close(); } catch {}
    }
    if (this.mcpTransport) {
      try { await this.mcpTransport.close(); } catch {}
    }
    this._initialized = false;
  }
}

// Singleton
let _instance = null;

async function getAgentService() {
  if (!_instance) {
    _instance = new AnthropicAgentService();
    await _instance.initialize();
  }
  return _instance;
}

module.exports = { AnthropicAgentService, getAgentService };
