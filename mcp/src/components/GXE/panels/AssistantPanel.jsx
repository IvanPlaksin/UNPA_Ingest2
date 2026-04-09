/**
 * AssistantPanel — GXE AI graph analysis chat.
 *
 * Migrated from Nexus/Assistant (CONS-08).
 * Standalone: no nexusStore dependency.
 * Features: chat messages, context bar, quick actions, fallback responses.
 * Tailwind + GXE dark theme, lucide-react icons.
 */

import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Bot, Send, Trash2, Loader2, AlertCircle,
  Network, ArrowRight,
} from 'lucide-react';
import api from '../../../services/api';

// ── Fallback response generator ──
function fallbackResponse(message, context = {}) {
  const msgLower = message.toLowerCase();
  const selectedCount = context.selectedNodes?.length || 0;
  const stats = context.graphStats || {};

  if (msgLower.includes('hub') || msgLower.includes('important') || msgLower.includes('central')) {
    return {
      response: `Hub nodes are the most connected nodes in the graph. They act as bridges between clusters. ${stats.nodeCount ? `Your graph has ${stats.nodeCount} nodes — look for nodes with degree > ${Math.max(3, Math.round(stats.nodeCount * 0.1))}.` : ''}`,
      actions: [{ label: 'Sort by degree', action: 'sort-by-degree' }],
    };
  }
  if (msgLower.includes('cluster') || msgLower.includes('community') || msgLower.includes('group')) {
    return {
      response: 'To discover clusters, use **Guided Mode** → **Discover** phase. Options: Community Detection (structural), Ontology Layers (semantic), or Semantic Similarity (AI-powered).',
      actions: [{ label: 'Open Guided Mode', action: 'switch-guided' }],
    };
  }
  if (msgLower.includes('path') || msgLower.includes('connect') || msgLower.includes('reach')) {
    return {
      response: `To find paths between nodes, select a node and use the **Path Finder** tool. ${selectedCount > 0 ? `You have ${selectedCount} node(s) selected.` : 'Select a starting node first.'}`,
      actions: selectedCount > 0 ? [{ label: 'Open Path Finder', action: 'open-pathfinder' }] : [],
    };
  }
  if (msgLower.includes('search') || msgLower.includes('find') || msgLower.includes('where')) {
    return {
      response: 'Use the **Search** tool (Ctrl+F) to find nodes by name, type, or content. Semantic search requires embeddings.',
      actions: [{ label: 'Open Search', action: 'open-search' }],
    };
  }
  if (msgLower.includes('anomal') || msgLower.includes('problem') || msgLower.includes('issue') || msgLower.includes('orphan')) {
    return {
      response: `Check the **Insights Bar** for detected anomalies. Common issues: orphan nodes, isolated clusters, bridge nodes. ${stats.nodeCount ? `Graph: ${stats.nodeCount} nodes, ${stats.edgeCount || 0} edges.` : ''}`,
      actions: [{ label: 'Refresh Insights', action: 'refresh-insights' }],
    };
  }
  if (msgLower.includes('help') || msgLower.includes('what can') || msgLower.includes('how to')) {
    return {
      response: "I can help analyze your graph. Try asking about:\n- **Hub nodes** — find important nodes\n- **Clusters** — discover communities\n- **Paths** — find connections\n- **Anomalies** — detect problems\n- **Search** — find specific nodes",
      actions: [],
    };
  }
  if (selectedCount > 0) {
    return {
      response: `You have **${selectedCount} node(s)** selected. I can help explore their connections, find paths, or analyze properties.`,
      actions: [{ label: 'Inspect node', action: 'inspect-selected' }, { label: 'Find paths', action: 'open-pathfinder' }],
    };
  }
  return {
    response: "I'm your graph analysis assistant. I can help you understand the structure, find patterns, and navigate the graph. What would you like to explore?",
    actions: [],
  };
}

// ── Suggested questions ──
function getSuggestions({ selectedCount = 0, nodeCount = 0 }) {
  if (nodeCount === 0) return ['How do I get started?', 'What is GXE?'];
  const q = [];
  if (selectedCount > 0) {
    q.push('What is this node connected to?', 'Find similar nodes', 'Why is this node important?');
  } else {
    q.push('What are the hub nodes?', 'Find clusters in the graph');
  }
  if (nodeCount > 50) q.push('How can I simplify this graph?');
  return q.slice(0, 4);
}

// ── Format message content (basic markdown) ──
function formatContent(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  lines.forEach((line, li) => {
    if (li > 0) elements.push(<br key={`br-${li}`} />);
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    parts.forEach((part, pi) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        elements.push(<strong key={`${li}-${pi}`} className="text-gray-200">{part.slice(2, -2)}</strong>);
      } else if (part.startsWith('- ')) {
        elements.push(<span key={`${li}-${pi}`} className="block pl-3">{part}</span>);
      } else {
        elements.push(part);
      }
    });
  });
  return elements;
}

// ── Main AssistantPanel ──
const AssistantPanel = ({ nodes = [], edges = [], selectedNode, namespace = 'GXE', onAction }) => {
  const [messages, setMessages] = useState([{
    id: 'welcome',
    role: 'assistant',
    content: 'Hello! I\'m your graph analysis assistant. Ask me about nodes, clusters, paths, or anomalies.',
    timestamp: new Date().toISOString(),
    actions: [],
  }]);
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const graphStats = useMemo(() => ({ nodeCount: nodes.length, edgeCount: edges.length }), [nodes.length, edges.length]);

  const selectedNodes = useMemo(() => {
    if (!selectedNode) return [];
    return [{ id: selectedNode.id, name: selectedNode.data?.label || selectedNode.name || selectedNode.id, type: selectedNode.type }];
  }, [selectedNode]);

  const suggestions = useMemo(() =>
    getSuggestions({ selectedCount: selectedNodes.length, nodeCount: nodes.length }),
    [selectedNodes.length, nodes.length]
  );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = useCallback(async (text) => {
    if (!text?.trim()) return;
    const trimmed = text.trim();

    const userMsg = { id: `msg-${Date.now()}`, role: 'user', content: trimmed, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setInputValue('');

    try {
      const context = { selectedNodes, graphStats, mode: 'explore' };
      const resp = await api.post('/advisor/assistant', {
        namespace, message: trimmed,
        context: { selectedNodes, graphStats: context.graphStats, mode: context.mode },
      });

      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-reply`,
        role: 'assistant',
        content: resp.data?.response || 'I couldn\'t process that request.',
        timestamp: new Date().toISOString(),
        actions: resp.data?.actions || [],
      }]);
    } catch {
      // Fallback
      const fb = fallbackResponse(trimmed, { selectedNodes, graphStats });
      setMessages(prev => [...prev, {
        id: `msg-${Date.now()}-fb`,
        role: 'assistant',
        content: fb.response,
        timestamp: new Date().toISOString(),
        actions: fb.actions || [],
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [namespace, selectedNodes, graphStats]);

  const clearChat = useCallback(() => {
    setMessages([{
      id: 'welcome-reset',
      role: 'assistant',
      content: 'Chat cleared. How can I help analyze the graph?',
      timestamp: new Date().toISOString(),
      actions: [],
    }]);
  }, []);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  }, [inputValue, sendMessage]);

  const timeStr = (ts) => {
    try { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return ''; }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Context Bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-[#0d1117] border-b border-[#21262d] text-[10px] text-gray-500">
        <span><Network size={10} className="inline mr-1" />{graphStats.nodeCount} nodes</span>
        <span>|</span>
        <span>{graphStats.edgeCount} edges</span>
        {selectedNodes.length > 0 && (
          <>
            <span>|</span>
            <span className="text-indigo-400 truncate max-w-[120px]">
              {selectedNodes.length === 1 ? selectedNodes[0].name : `${selectedNodes.length} selected`}
            </span>
          </>
        )}
        <div className="flex-1" />
        <button
          onClick={clearChat}
          className="p-1 rounded text-gray-600 hover:text-gray-300 hover:bg-[#21262d] transition-colors"
          title="Clear chat"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
        {messages.map(msg => {
          const isUser = msg.role === 'user';
          return (
            <div key={msg.id} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
              {!isUser && (
                <div className="w-6 h-6 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  {msg.isError ? <AlertCircle size={12} className="text-red-400" /> : <Bot size={12} className="text-indigo-400" />}
                </div>
              )}
              <div className={`max-w-[85%] ${isUser ? 'ml-auto' : ''}`}>
                <div className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-indigo-600 text-white rounded-br-sm'
                    : msg.isError
                      ? 'bg-red-500/10 text-red-300 border border-red-500/20 rounded-bl-sm'
                      : 'bg-[#21262d] text-gray-300 rounded-bl-sm'
                }`}>
                  {formatContent(msg.content)}
                </div>

                {msg.actions?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {msg.actions.map((action, idx) => (
                      <button
                        key={idx}
                        className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[#21262d] text-gray-400 hover:text-gray-200 hover:bg-[#30363d] border border-[#30363d] transition-colors"
                        onClick={() => onAction?.(action.action, action)}
                      >
                        <ArrowRight size={10} />
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className={`text-[9px] text-gray-600 mt-1 ${isUser ? 'text-right' : ''}`}>
                  {timeStr(msg.timestamp)}
                </div>
              </div>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
              <Bot size={12} className="text-indigo-400" />
            </div>
            <div className="bg-[#21262d] rounded-lg px-3 py-2 rounded-bl-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Actions */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-t border-[#21262d]">
          {suggestions.map((q, i) => (
            <button
              key={i}
              className="px-2 py-1 rounded-full text-[10px] bg-[#21262d] text-gray-400 hover:text-gray-200 hover:bg-[#30363d] border border-[#30363d] transition-colors disabled:opacity-50"
              onClick={() => sendMessage(q)}
              disabled={isLoading}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-[#30363d] bg-[#0d1117]">
        <input
          ref={inputRef}
          type="text"
          className="flex-1 bg-transparent text-xs text-gray-200 placeholder-gray-600 outline-none"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about the graph..."
          disabled={isLoading}
        />
        <button
          className="p-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => sendMessage(inputValue)}
          disabled={isLoading || !inputValue.trim()}
          title="Send (Enter)"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
};

export default AssistantPanel;
