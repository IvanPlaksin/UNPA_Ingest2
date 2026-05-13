/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GXE AI Assistant Controller
 *
 * Handles chat interactions with the GXE AI Assistant.
 * Routes through LlmService (Gemini / Claude / Ollama).
 * Parses graph actions from assistant responses.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const { randomUUID } = require('node:crypto');
const { sessionContextService } = require('../services/agents/SessionContextService');
const { graphActionParser } = require('../services/agents/GraphActionParser');
const { getApiKey, getModel } = require('../config/ai-models.config');
const { agentLearningService } = require('../services/agents/AgentLearningService');
const { getInstance: getLLMProvider } = require('../services/llm/LLMProviderService');

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────────────────────

const MAX_TOKENS = 8192;

// ────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Build context suffix from canvas selection.
 */
function buildSelectionSuffix(selection) {
  if (!selection || (!selection.nodes?.length && !selection.edges?.length)) {
    return '';
  }

  const parts = [];
  if (selection.nodes?.length) {
    const nodeList = selection.nodes
      .map(n => `${n.id} (${n.type || 'unknown'}${n.label ? ': ' + n.label : ''})`)
      .join(', ');
    parts.push(`Выделенные узлы: [${nodeList}]`);
  }
  if (selection.edges?.length) {
    const edgeList = selection.edges
      .map(e => `${e.source}→${e.target}`)
      .join(', ');
    parts.push(`Выделенные рёбра: [${edgeList}]`);
  }
  if (selection.topologicalRole) {
    parts.push(`Роль в графе: ${selection.topologicalRole}`);
  }

  return '\n\n[Контекст canvas: ' + parts.join('. ') + ']';
}

/**
 * Build graph state summary for the system prompt.
 */
function buildGraphStateSuffix(graphState) {
  if (!graphState || graphState.isEmpty) {
    return '\n\n[Граф пуст — canvas чистый. Создай новый граф с нуля.]';
  }

  const nodes = graphState.nodes || [];
  const edges = graphState.edges || [];
  const execNodes = nodes.filter(n => !n.isToolRef);
  const trefNodes = nodes.filter(n => n.isToolRef);

  const lines = [`\n\n<current_graph graphId="${graphState.graphId || 'unsaved'}" nodes="${execNodes.length}" edges="${edges.length}" tref_nodes="${trefNodes.length}">`];

  // Nodes with full details
  lines.push('## Nodes:');
  for (const n of execNodes) {
    lines.push(`- [${n.id}] type=${n.type} tool=${n.tool || 'none'} label="${n.label}"${n.config ? ' config=' + JSON.stringify(n.config).slice(0, 100) : ''}`);
  }

  // Edges
  lines.push('## Edges:');
  for (const e of edges) {
    if (e.label === 'USES_TOOL') continue; // skip tref edges
    lines.push(`- ${e.source} → ${e.target}${e.label ? ' [' + e.label + ']' : ''}`);
  }

  lines.push('</current_graph>');
  return lines.join('\n');
}

/**
 * Enforce strict user/assistant alternation for the Anthropic Messages API.
 * Consecutive same-role messages are merged; result always starts with 'user'.
 */
function enforceAlternation(messages) {
  if (!messages || messages.length === 0) return [];

  // Merge consecutive same-role messages
  const merged = [];
  for (const msg of messages) {
    if (merged.length > 0 && merged[merged.length - 1].role === msg.role) {
      merged[merged.length - 1].content += '\n\n' + msg.content;
    } else {
      merged.push({ role: msg.role, content: msg.content });
    }
  }

  // Ensure starts with 'user'
  if (merged.length > 0 && merged[0].role !== 'user') {
    merged.unshift({ role: 'user', content: '(продолжи)' });
  }

  return merged;
}

// ────────────────────────────────────────────────────────────────────────────
// CONTROLLER METHODS
// ────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/assistant/chat
 *
 * Main chat endpoint with SSE streaming.
 */
async function chat(req, res) {
  const {
    sessionId: inputSessionId,
    message,
    selectionContext,
    graphState,
    graphId,
  } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  const sessionId = inputSessionId || uuidv4();
  let rawHistory = [];
  let session = null;

  try {
    // 1. Get or create session (with optional graph binding)
    session = await sessionContextService.getOrCreate(sessionId, 'agent-gxe-assistant-v1', graphId || null);

    // 2. Update selection context if provided
    if (selectionContext) {
      await sessionContextService.updateSelectionContext(sessionId, selectionContext);
    }

    // 3. Save graph snapshot for undo
    if (graphState && !graphState.isEmpty) {
      await sessionContextService.pushGraphSnapshot(sessionId, {
        nodes: graphState.nodes || [],
        edges: graphState.edges || [],
      });
    }

    // 4. Build user message with context
    let userContent = message;
    userContent += buildSelectionSuffix(selectionContext);
    userContent += buildGraphStateSuffix(graphState);

    // 5. Append user message to history
    await sessionContextService.appendMessage(sessionId, 'user', userContent);

    // 6. Build messages array for LLM
    rawHistory = await sessionContextService.getMessages(sessionId);
    const history = enforceAlternation(rawHistory);

    // 7. Prepend system context as a system message
    const systemCtx = session.systemContext || '';
    const llmMessages = [];
    if (systemCtx) {
      llmMessages.push({ role: 'system', content: systemCtx });
    }
    llmMessages.push(...history);

    // 8. Setup SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', sessionId);
    res.flushHeaders();

    const llmProvider = getLLMProvider();
    console.log(`[Assistant] Streaming via provider: ${llmProvider.type}`);

    // 9. Execute via Agent SDK (Anthropic) or fallback to basic streaming
    let fullResponse = '';
    let aborted = false;

    req.on('close', () => { aborted = true; });

    try {
      if (llmProvider.type === 'anthropic') {
        // ── Agent SDK Mode: full agentic loop with MCP tools ──
        const { getAgentService } = require('../services/agents/anthropic-agent.service');
        const agent = await getAgentService();
        const systemPrompt = llmMessages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const chatMessages = llmMessages.filter(m => m.role !== 'system');

        for await (const event of agent.chat(systemPrompt, chatMessages)) {
          if (aborted) break;

          switch (event.type) {
            case 'text':
              fullResponse += event.content;
              res.write(`data: ${JSON.stringify({ type: 'chunk', text: event.content })}\n\n`);
              break;
            case 'tool_call':
              console.log(`[Assistant] Agent tool: ${event.name}(${JSON.stringify(event.input).slice(0, 80)})`);
              res.write(`data: ${JSON.stringify({ type: 'tool_call', name: event.name })}\n\n`);
              break;
            case 'tool_result':
              res.write(`data: ${JSON.stringify({ type: 'tool_result', name: event.name })}\n\n`);
              break;
            case 'tool_error':
              console.warn(`[Assistant] Tool error: ${event.name}: ${event.error}`);
              break;
            case 'filter_applied':
              console.log(`[Assistant] ToolFilter: ${event.toolsProvided}/${event.toolsTotal} tools (${event.reduction}% reduction, domain=${event.domain})`);
              res.write(`data: ${JSON.stringify({ type: 'filter_applied', domain: event.domain, toolsProvided: event.toolsProvided, toolsTotal: event.toolsTotal })}\n\n`);
              break;
            case 'catalog_search':
              console.log(`[Assistant] CatalogReuse: strategy=${event.strategy} score=${event.score?.toFixed?.(2) || 0} candidates=${event.candidatesCount}`);
              res.write(`data: ${JSON.stringify({ type: 'catalog_search', strategy: event.strategy, score: event.score, candidatesCount: event.candidatesCount, recommendation: event.recommendation })}\n\n`);
              break;
            case 'reuse_suggestion':
              console.log(`[Assistant] ReuseSuggestion: ${event.action} — ${event.graphName} (${event.nodeCount} nodes)`);
              res.write(`data: ${JSON.stringify({ type: 'reuse_suggestion', action: event.action, graphId: event.graphId, graphName: event.graphName, nodeCount: event.nodeCount, message: event.message })}\n\n`);
              break;
            case 'retry':
              console.warn(`[Assistant] API retry: ${event.reason} (attempt ${event.attempt}, delay ${event.delay}ms)`);
              res.write(`data: ${JSON.stringify({ type: 'status', message: `API overloaded, retrying in ${Math.round(event.delay / 1000)}s...` })}\n\n`);
              break;
            case 'done':
              console.log(`[Assistant] Agent done in ${event.iterations} iterations`);
              break;
            case 'error':
              console.error(`[Assistant] Agent error: ${event.error}`);
              res.write(`data: ${JSON.stringify({ type: 'error', error: event.error })}\n\n`);
              break;
            case 'max_iterations':
              console.warn(`[Assistant] Agent reached max iterations: ${event.iterations}`);
              break;
          }
        }
      } else {
        // ── Fallback: basic streaming without tools ──
        const streamObj = llmProvider.stream(llmMessages, { maxTokens: MAX_TOKENS });
        for await (const event of streamObj) {
          if (aborted) break;
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            const text = event.delta.text;
            fullResponse += text;
            res.write(`data: ${JSON.stringify({ type: 'chunk', text })}\n\n`);
          }
        }
      }
    } catch (streamErr) {
      const errorMsg = streamErr.response?.data?.error?.message || streamErr.message;
      console.error('[Assistant] Stream error:', errorMsg);
      if (!aborted) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
        res.end();
      }
      return;
    }

    if (aborted) return;

    // 10. Process completed response
    try {
      const parsed = graphActionParser.parse(fullResponse);

      await sessionContextService.appendMessage(sessionId, 'assistant', fullResponse);

      for (const action of parsed.actions) {
        const inverseDiff = graphActionParser.generateInverseDiff(action, graphState || { nodes: [], edges: [] });
        if (inverseDiff) {
          await sessionContextService.pushUndo(sessionId, {
            actionType: action.type,
            diff: inverseDiff,
          });
        }
      }

      for (const lesson of (parsed.lessons || [])) {
        await agentLearningService.saveLesson({
          ...lesson,
          sessionId,
          graphId: graphId || '',
        }).catch(err => console.warn('[Assistant] Lesson save failed:', err.message));
      }

      res.write(`data: ${JSON.stringify({
        type: 'done',
        text: parsed.text,
        actions: parsed.actions,
        errors: parsed.errors,
        rationale: parsed.rationale || null,
        lessons: parsed.lessons || [],
        sessionId,
      })}\n\n`);
    } catch (err) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    }

    res.end();

  } catch (err) {
    const errorMsg = err.message;
    console.error('[Assistant] Chat error:', errorMsg);

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: errorMsg })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: errorMsg, sessionId });
    }
  }
}

/**
 * POST /api/v1/assistant/undo
 */
async function undo(req, res) {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    const action = await sessionContextService.popUndo(sessionId);

    if (!action) {
      return res.json({ success: false, reason: 'Nothing to undo' });
    }

    res.json({
      success: true,
      action: action.diff,
      actionType: action.actionType,
    });
  } catch (err) {
    console.error('[Assistant] Undo error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/v1/assistant/reset
 */
async function resetSession(req, res) {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  try {
    await sessionContextService.destroy(sessionId);
    res.json({ success: true });
  } catch (err) {
    console.error('[Assistant] Reset error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/v1/assistant/session/:graphId
 *
 * Load existing chat session bound to a catalog graph.
 * Returns session with messages for restoring chat history.
 */
async function getSessionByGraph(req, res) {
  const { graphId } = req.params;

  if (!graphId) {
    return res.status(400).json({ error: 'graphId is required' });
  }

  try {
    const session = await sessionContextService.getByGraphId(graphId);

    if (!session) {
      return res.json({ found: false, graphId });
    }

    res.json({
      found: true,
      graphId,
      sessionId: session.sessionId,
      messages: (session.messages || []).map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      })),
      iterationCount: session.iterationCount || 0,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
    });
  } catch (err) {
    console.error('[Assistant] getSessionByGraph error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// GRAPH EXECUTION
// ────────────────────────────────────────────────────────────────────────────

let _runtimeInit = null;
let _mcpRegistry = null;

async function ensureRuntime() {
  if (_mcpRegistry) return _mcpRegistry;
  if (_runtimeInit) return _runtimeInit;

  _runtimeInit = (async () => {
    const aopegModule = require('../core/aopeg/index');
    if (!aopegModule.isAOPEGInitialized()) {
      await aopegModule.initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });
    }
    const { AOPEGAdapter } = require('../runtime/integration');
    const adapter = new AOPEGAdapter(aopegModule.pluginRegistry);
    _mcpRegistry = adapter.createMcpCompatibleRegistry();
    console.log('[Assistant] Runtime initialized, executors:', adapter.listExecutors().length);
    return _mcpRegistry;
  })();

  return _runtimeInit;
}

/**
 * POST /api/v1/assistant/execute
 *
 * Execute the current canvas graph via RuntimeEngine.
 * Streams SSE events: node:start, node:complete, node:error, complete, error.
 * Returns full execution result at the end for assistant analysis.
 */
async function executeGraph(req, res) {
  const { dag, inputData, config, sessionId } = req.body;

  if (!dag || !dag.nodes || dag.nodes.length === 0) {
    return res.status(400).json({ error: 'dag with nodes is required' });
  }

  try {
    const registry = await ensureRuntime();
    const { RuntimeEngine, DEFAULT_CONFIG } = require('../runtime');
    const { GXESSEBridge } = require('../runtime/integration/GXESSEBridge');

    const executionId = randomUUID();
    const engine = new RuntimeEngine(registry, {
      ...DEFAULT_CONFIG,
      ...(config || {}),
    });

    const bridge = new GXESSEBridge(engine, dag);
    bridge.attach(req, res, executionId);

    // Execute and capture result
    const result = await engine.execute(dag, inputData || {}, { executionId });

    // After bridge detaches, if sessionId provided, save execution result to session
    if (sessionId) {
      const summary = formatExecutionSummary(result);
      await sessionContextService.appendMessage(sessionId, 'user',
        `[EXECUTION RESULT]\n${summary}`
      ).catch(err => console.warn('[Assistant] Failed to save execution result:', err.message));
    }

  } catch (err) {
    console.error('[Assistant] Execute error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      try { res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`); } catch (_) {}
      try { res.end(); } catch (_) {}
    }
  }
}

/**
 * Format execution result into a human-readable summary for the assistant.
 */
function formatExecutionSummary(result) {
  const lines = [];
  lines.push(`Status: ${result.status}`);

  if (result.metrics) {
    lines.push(`Duration: ${result.metrics.totalDurationMs}ms`);
    lines.push(`Nodes: ${result.metrics.nodesSucceeded}/${result.metrics.nodesTotal} succeeded, ${result.metrics.nodesFailed} failed, ${result.metrics.nodesSkipped} skipped`);
  }

  if (result.nodeResults) {
    const failed = Object.entries(result.nodeResults)
      .filter(([, r]) => r.status === 'FAILED');
    if (failed.length > 0) {
      lines.push('\nFailed nodes:');
      for (const [nodeId, r] of failed) {
        lines.push(`  - ${nodeId}: ${r.error || 'unknown error'} (phase: ${r.failedAtPhase || '?'}, attempts: ${r.attempts || 1})`);
        if (r.details) {
          const detail = typeof r.details === 'string' ? r.details : JSON.stringify(r.details).substring(0, 200);
          lines.push(`    Details: ${detail}`);
        }
      }
    }

    const succeeded = Object.entries(result.nodeResults)
      .filter(([, r]) => r.status === 'SUCCEEDED');
    if (succeeded.length > 0) {
      lines.push('\nSucceeded nodes:');
      for (const [nodeId, r] of succeeded) {
        const outputPreview = r.output
          ? JSON.stringify(r.output).substring(0, 150)
          : 'no output';
        lines.push(`  - ${nodeId}: ${r.durationMs || 0}ms → ${outputPreview}`);
      }
    }
  }

  if (result.error) {
    lines.push(`\nExecution error: ${result.error.message || result.error}`);
  }

  return lines.join('\n');
}

module.exports = {
  chat,
  undo,
  resetSession,
  getSessionByGraph,
  executeGraph,
};
