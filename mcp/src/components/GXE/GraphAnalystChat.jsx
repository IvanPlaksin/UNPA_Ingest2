/**
 * GraphAnalystChat — Chat interface for graph analysis with Claude 4.6 + MCP tools.
 * Renders inside BottomPanel as a tab.
 *
 * Features:
 * - SSE streaming (token-by-token rendering)
 * - MCP tool call visualization (chips with success/error)
 * - Markdown rendering (react-markdown)
 * - Quick action suggestions
 * - Abort/stop streaming
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  Send, StopCircle, Sparkles, User, Trash2,
  CheckCircle, XCircle, Wrench, Loader2, MessageSquare,
} from 'lucide-react';
import { streamGraphAnalystChat } from '../../services/gxe.service';
import { useStreamThrottle } from '../../hooks/useStreamThrottle';

// ────────────────────────────────────────────────────────────────────────────
// QUICK ACTIONS (shown when chat is empty)
// ────────────────────────────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { label: 'Analyze structure', prompt: 'Analyze the current graph structure, connectivity, and identify key patterns such as hubs, bridges, and clusters.' },
  { label: 'Describe business logic', prompt: 'Describe the business logic and data flow represented in this graph. Explain how entities relate to each other.' },
  { label: 'Find quality issues', prompt: 'Examine this graph for quality issues: missing connections, orphan nodes, duplicate entities, or anomalies.' },
  { label: 'Summarize graph', prompt: 'Provide a concise summary of what this graph represents, including key entities, relationship types, and overall structure.' },
];

const QuickActions = ({ onAction, disabled }) => (
  <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
    <div className="flex items-center gap-2 text-gray-500">
      <Sparkles className="w-5 h-5 text-cyan-500" />
      <span className="text-sm font-medium">Graph Analyst</span>
    </div>
    <p className="text-xs text-gray-500 text-center max-w-sm">
      Ask questions about your graph. Claude has access to MCP tools to query and analyze the graph in real-time.
    </p>
    <div className="flex flex-wrap gap-2 justify-center max-w-md">
      {QUICK_ACTIONS.map((action, idx) => (
        <button
          key={idx}
          onClick={() => onAction(action.prompt)}
          disabled={disabled}
          className="px-3 py-1.5 text-xs text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded-full
                     hover:bg-cyan-500/20 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed
                     transition-colors"
        >
          {action.label}
        </button>
      ))}
    </div>
  </div>
);

// ────────────────────────────────────────────────────────────────────────────
// TOOL CALL CHIP
// ────────────────────────────────────────────────────────────────────────────

const ToolCallChip = ({ tool, success, pending }) => (
  <span
    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border ${
      pending
        ? 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
        : success
          ? 'text-green-400 bg-green-500/10 border-green-500/30'
          : 'text-red-400 bg-red-500/10 border-red-500/30'
    }`}
  >
    {pending ? (
      <Loader2 className="w-2.5 h-2.5 animate-spin" />
    ) : success ? (
      <CheckCircle className="w-2.5 h-2.5" />
    ) : (
      <XCircle className="w-2.5 h-2.5" />
    )}
    <Wrench className="w-2.5 h-2.5 opacity-60" />
    {tool}
  </span>
);

// ────────────────────────────────────────────────────────────────────────────
// MESSAGE BUBBLE
// ────────────────────────────────────────────────────────────────────────────

const MessageBubble = ({ message, isLast }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`flex ${isUser ? 'flex-row-reverse' : 'flex-row'} gap-2 max-w-[90%]`}>
        {/* Avatar */}
        <div
          className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
            isUser ? 'bg-cyan-600' : 'bg-purple-600'
          }`}
        >
          {isUser ? <User className="w-3.5 h-3.5 text-white" /> : <Sparkles className="w-3.5 h-3.5 text-white" />}
        </div>

        {/* Content */}
        <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
          {/* Tool calls */}
          {message.toolCalls?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-1">
              {message.toolCalls.map((tc, idx) => (
                <ToolCallChip
                  key={idx}
                  tool={tc.tool}
                  success={tc.success}
                  pending={tc.pending}
                />
              ))}
            </div>
          )}

          {/* Bubble */}
          <div
            className={`px-3 py-2 rounded-lg text-sm ${
              isUser
                ? 'bg-cyan-600 text-white rounded-tr-none'
                : 'bg-[#21262d] text-[#f0f6fc] border border-[#30363d] rounded-tl-none'
            }`}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <div className="prose prose-invert prose-sm max-w-none
                [&_p]:m-0 [&_p]:mb-1.5 [&_p:last-child]:mb-0
                [&_pre]:bg-black/30 [&_pre]:p-2 [&_pre]:rounded [&_pre]:text-xs [&_pre]:overflow-x-auto
                [&_code]:font-mono [&_code]:text-xs [&_code]:bg-black/20 [&_code]:px-1 [&_code]:rounded
                [&_ul]:pl-4 [&_ul]:my-1 [&_ol]:pl-4 [&_ol]:my-1 [&_li]:mb-0.5
                [&_h1]:text-base [&_h1]:font-bold [&_h1]:mt-2 [&_h1]:mb-1
                [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mt-2 [&_h2]:mb-1
                [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-1.5 [&_h3]:mb-1
                [&_table]:text-xs [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1
                [&_blockquote]:border-l-2 [&_blockquote]:border-gray-600 [&_blockquote]:pl-3 [&_blockquote]:italic">
                <ReactMarkdown>{message.content || ''}</ReactMarkdown>
                {message.streaming && (
                  <span className="inline-block w-1.5 h-4 bg-cyan-500 ml-0.5 animate-pulse" />
                )}
              </div>
            )}
          </div>

          {/* Error indicator */}
          {message.error && (
            <span className="flex items-center gap-1 mt-1 px-2 py-0.5 text-[10px] text-red-400 bg-red-500/10 border border-red-500/30 rounded">
              <XCircle className="w-3 h-3" />
              {message.error}
            </span>
          )}

          {/* Usage stats */}
          {message.usage && (
            <span className="mt-1 text-[10px] text-gray-600">
              {message.usage.input_tokens + message.usage.output_tokens} tokens · {message.usage.turns} turn{message.usage.turns !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────

const GraphAnalystChat = ({ nodes = [], edges = [], namespace }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  // Coalesce per-token stream updates into ≤1 render per ~80ms.
  const { schedule: scheduleTokenFlush, flushNow: flushTokens } = useStreamThrottle(80);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Build graph context for API
  const graphContext = useMemo(() => ({
    nodes: nodes.map(n => ({ id: n.id, data: { label: n.data?.label, kind: n.data?.kind } })),
    edges: edges.map(e => ({ source: e.source, target: e.target, label: e.label })),
  }), [nodes, edges]);

  // Build history for API (exclude streaming/tool metadata)
  const buildHistory = useCallback(() => {
    return messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming))
      .map(m => ({ role: m.role, content: m.content }));
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    const userMsg = text || input.trim();
    if (!userMsg || isStreaming) return;

    setInput('');

    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: userMsg,
      timestamp: new Date().toISOString(),
    };

    const assistantMessage = {
      id: Date.now() + 1,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      streaming: true,
      toolCalls: [],
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);

    const history = buildHistory();

    try {
      const { responsePromise, abort } = streamGraphAnalystChat(
        userMsg, history, graphContext, { namespace }
      );
      abortRef.current = abort;

      const response = await responsePromise;

      if (!response.ok) {
        const errText = await response.text().catch(() => 'Unknown error');
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = ''; // accumulate tokens; throttled flush writes absolute value

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const rawData = line.slice(6).trim();
          if (!rawData) continue;

          let data;
          try { data = JSON.parse(rawData); } catch { continue; }

          switch (data.type) {
            case 'token':
              fullContent += (data.content || '');
              scheduleTokenFlush(() => setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, content: fullContent };
                }
                return updated;
              }));
              break;

            case 'tool_call':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    toolCalls: [...(last.toolCalls || []), { tool: data.tool, pending: true }],
                  };
                }
                return updated;
              });
              break;

            case 'tool_result':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  const toolCalls = [...(last.toolCalls || [])];
                  const idx = toolCalls.findLastIndex(tc => tc.tool === data.tool && tc.pending);
                  if (idx >= 0) {
                    toolCalls[idx] = { ...toolCalls[idx], pending: false, success: data.success };
                  }
                  updated[updated.length - 1] = { ...last, toolCalls };
                }
                return updated;
              });
              break;

            case 'usage':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = {
                    ...last,
                    usage: { input_tokens: data.input_tokens, output_tokens: data.output_tokens, turns: data.turns },
                  };
                }
                return updated;
              });
              break;

            case 'done':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, streaming: false };
                }
                return updated;
              });
              break;

            case 'error':
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last?.role === 'assistant') {
                  updated[updated.length - 1] = { ...last, streaming: false, error: data.message };
                }
                return updated;
              });
              break;
          }
        }
      }
      flushTokens();
    } catch (err) {
      flushTokens();
      if (err.name === 'AbortError') {
        // User cancelled
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, streaming: false, content: last.content + '\n\n*(cancelled)*' };
          }
          return updated;
        });
      } else {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last?.role === 'assistant') {
            updated[updated.length - 1] = { ...last, streaming: false, error: err.message };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, buildHistory, graphContext, namespace]);

  const handleStop = useCallback(() => {
    abortRef.current?.();
  }, []);

  const handleClear = useCallback(() => {
    if (isStreaming) return;
    setMessages([]);
  }, [isStreaming]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const hasMessages = messages.length > 0;

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Messages area */}
      <div className="flex-1 overflow-auto">
        {!hasMessages ? (
          <QuickActions onAction={(prompt) => sendMessage(prompt)} disabled={isStreaming} />
        ) : (
          <div className="p-3">
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLast={msg.id === messages[messages.length - 1]?.id}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-[#30363d] bg-[#161b22] px-3 py-2">
        <div className="flex items-end gap-2">
          {/* Clear button */}
          {hasMessages && !isStreaming && (
            <button
              onClick={handleClear}
              className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-[#21262d] rounded transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}

          {/* Input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your graph..."
            disabled={isStreaming}
            rows={1}
            className="flex-1 bg-[#0d1117] text-[#f0f6fc] text-sm border border-[#30363d] rounded-lg px-3 py-2
                       placeholder-gray-600 resize-none focus:outline-none focus:border-cyan-500/50
                       disabled:opacity-50 disabled:cursor-not-allowed
                       max-h-24 overflow-y-auto"
            style={{ minHeight: '36px' }}
          />

          {/* Send / Stop button */}
          {isStreaming ? (
            <button
              onClick={handleStop}
              className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              title="Stop generation"
            >
              <StopCircle className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className="p-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default GraphAnalystChat;
