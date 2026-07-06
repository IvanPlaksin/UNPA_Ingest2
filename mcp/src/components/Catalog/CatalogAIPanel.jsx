/**
 * CatalogAIPanel (UTC-004)
 *
 * AI chat panel embedded in UnifiedToolCatalog. Two tabs:
 *   - "AI Suggest" — natural language query → tool/template recommendations
 *   - "Patterns"   — workspace graph pattern matches from catalog
 *
 * Streams responses from POST /api/v1/graph-catalog/assistant/chat (SSE).
 * Session history is kept in React state (backend is stateless).
 *
 * Pattern detection triggers automatically when:
 *   - workspaceId is provided
 *   - selectedNodes has ≥ 3 nodes
 *
 * Otherwise the user can click "Scan workspace" to trigger manual analysis.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search, Send, RefreshCw, Layers, MessageSquare, Sparkles,
  Replace, Eye, ChevronDown, ChevronUp, WifiOff
} from 'lucide-react';
import { useSSEStream } from '../../hooks/useSSEStream';

const API_BASE = '/api/v1';

const S = {
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: '#0d1117', color: '#e2e8f0', fontSize: 13 },
  tabBar: { display: 'flex', borderBottom: '1px solid #30363d', flexShrink: 0 },
  tab: (active) => ({
    flex: 1, padding: '6px 8px', textAlign: 'center', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    background: active ? '#161b22' : 'transparent', color: active ? '#e2e8f0' : '#8b949e',
    borderBottom: active ? '2px solid #58a6ff' : '2px solid transparent', transition: 'all 0.15s'
  }),
  messages: { flex: 1, overflowY: 'auto', padding: 8, minHeight: 0 },
  msg: (role) => ({
    padding: '6px 8px', borderRadius: 6, marginBottom: 6, fontSize: 13, lineHeight: 1.4, whiteSpace: 'pre-wrap',
    background: role === 'user' ? '#1c2333' : 'transparent',
    borderLeft: role === 'user' ? '2px solid #58a6ff' : '2px solid #30363d'
  }),
  inputRow: { display: 'flex', gap: 4, padding: '6px 8px', borderTop: '1px solid #30363d', flexShrink: 0 },
  input: {
    flex: 1, background: '#0d1117', border: '1px solid #30363d', borderRadius: 6,
    padding: '5px 8px', color: '#e2e8f0', fontSize: 13, outline: 'none', resize: 'none'
  },
  sendBtn: (disabled) => ({
    background: disabled ? '#21262d' : '#238636', border: 'none', borderRadius: 6,
    padding: '4px 8px', color: '#fff', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1
  }),
  matchCard: {
    border: '1px solid #30363d', borderRadius: 6, padding: 8, marginBottom: 6,
    background: '#161b22'
  },
  matchScore: (score) => ({
    fontSize: 13, fontWeight: 600, padding: '1px 5px', borderRadius: 4,
    background: score > 0.8 ? '#238636' : score > 0.6 ? '#b08800' : '#484f58',
    color: '#fff'
  }),
  actionBtn: (color = '#30363d') => ({
    padding: '3px 8px', fontSize: 13, border: 'none', borderRadius: 4,
    background: color, color: '#e2e8f0', cursor: 'pointer'
  })
};

const CatalogAIPanel = ({ workspaceId, workspaceName, selectedNodes = [], mode = 'general', onPatternReplace }) => {
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streamBuffer, setStreamBuffer] = useState('');
  const [patterns, setPatterns] = useState([]);
  const [patternsLoading, setPatternsLoading] = useState(false);
  const [patternsError, setPatternsError] = useState(null);
  const messagesEndRef = useRef(null);
  const bufferRef = useRef('');

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  useEffect(scrollToBottom, [messages, streamBuffer]);

  // ── SSE Stream with reconnection ──────────────────────────────

  const {
    stream, abort, isStreaming: streaming, isReconnecting, reconnectInfo,
    error: streamError, clearError
  } = useSSEStream({
    maxRetries: 3,
    timeout: 120000,
    onEvent: (eventName, data) => {
      if (eventName === 'text' && data?.content) {
        bufferRef.current += data.content;
        setStreamBuffer(bufferRef.current);
      }
    },
    onComplete: () => {
      setStreamBuffer('');
      if (bufferRef.current) {
        setMessages(prev => [...prev, { role: 'assistant', content: bufferRef.current }]);
      }
      bufferRef.current = '';
    }
  });

  // ── AI Chat ────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setStreamBuffer('');
    bufferRef.current = '';
    clearError();

    const userMsg = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);

    await stream(`${API_BASE}/graph-catalog/assistant/chat`, {
      query: text,
      sessionHistory: messages,
      workspaceId: workspaceId || undefined,
      workspaceName: workspaceName || undefined,
      currentSelection: selectedNodes?.length > 0 ? selectedNodes : undefined,
      mode
    });
  }, [input, streaming, messages, workspaceId, workspaceName, selectedNodes, mode, stream, clearError]);

  // ── Pattern Scanning ───────────────────────────────────────────

  const scanPatterns = useCallback(async () => {
    if (!workspaceId) return;
    setPatternsLoading(true);
    setPatternsError(null);
    try {
      const resp = await fetch(`${API_BASE}/graph-catalog/patterns/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const { data } = await resp.json();
      setPatterns(data?.results || []);
    } catch (err) {
      setPatternsError(err.message);
    } finally {
      setPatternsLoading(false);
    }
  }, [workspaceId]);

  // Auto-scan on mount if workspace provided
  useEffect(() => {
    if (workspaceId && activeTab === 'patterns' && patterns.length === 0 && !patternsLoading) {
      scanPatterns();
    }
  }, [activeTab, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div style={S.root}>
      <div style={S.tabBar}>
        <div style={S.tab(activeTab === 'chat')} onClick={() => setActiveTab('chat')}>
          <Sparkles size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
          AI Suggest
        </div>
        {workspaceId && (
          <div style={S.tab(activeTab === 'patterns')} onClick={() => setActiveTab('patterns')}>
            <Layers size={12} style={{ verticalAlign: 'middle', marginRight: 3 }} />
            Patterns {patterns.length > 0 && `(${patterns.length})`}
          </div>
        )}
      </div>

      {activeTab === 'chat' ? (
        <>
          {isReconnecting && (
            <div style={{ padding: '4px 8px', background: '#3a2a00', borderBottom: '1px solid #30363d', fontSize: 13, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: 4 }}>
              <WifiOff size={10} />
              Reconnecting... (attempt {reconnectInfo?.attempt}/{reconnectInfo?.maxRetries})
            </div>
          )}
          {streamError && (
            <div style={{ padding: '4px 8px', background: '#3a1d1d', borderBottom: '1px solid #30363d', fontSize: 13, color: '#fca5a5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{streamError}</span>
              <button style={{ background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 13 }} onClick={clearError}>dismiss</button>
            </div>
          )}
          <div style={S.messages}>
            {messages.length === 0 && !streaming && (
              <div style={{ textAlign: 'center', color: '#484f58', padding: 16 }}>
                <Sparkles size={20} style={{ opacity: 0.3, marginBottom: 6 }} />
                <div>Ask me about tools, graph templates, or patterns</div>
                {workspaceId && <div style={{ fontSize: 13, marginTop: 4 }}>I can also analyze your workspace graph</div>}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={S.msg(m.role)}>{m.content}</div>
            ))}
            {streaming && streamBuffer && (
              <div style={S.msg('assistant')}>{streamBuffer}</div>
            )}
            {streaming && !streamBuffer && (
              <div style={{ padding: 8, color: '#8b949e', fontSize: 13 }}>Thinking…</div>
            )}
            <div ref={messagesEndRef} />
          </div>
          <div style={S.inputRow}>
            <textarea
              style={S.input}
              rows={1}
              placeholder="Describe what you need..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              disabled={streaming}
            />
            <button style={S.sendBtn(streaming || !input.trim())} onClick={handleSend} disabled={streaming || !input.trim()}>
              <Send size={12} />
            </button>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: 8, minHeight: 0 }}>
          {!workspaceId && (
            <div style={{ textAlign: 'center', color: '#484f58', padding: 16 }}>
              Pattern analysis requires a workspace context
            </div>
          )}
          {workspaceId && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: '#8b949e' }}>
                  {patternsLoading ? 'Scanning…' : `${patterns.length} pattern match${patterns.length !== 1 ? 'es' : ''}`}
                </span>
                <button style={S.actionBtn()} onClick={scanPatterns} disabled={patternsLoading}>
                  <RefreshCw size={10} style={{ marginRight: 3 }} /> Scan
                </button>
              </div>

              {patternsError && (
                <div style={{ padding: 6, background: '#3a1d1d', borderRadius: 4, color: '#fca5a5', fontSize: 13, marginBottom: 6 }}>
                  {patternsError}
                </div>
              )}

              {patterns.length === 0 && !patternsLoading && !patternsError && (
                <div style={{ textAlign: 'center', color: '#484f58', padding: 16, fontSize: 13 }}>
                  No pattern matches found. Your workspace subgraphs don't resemble existing catalog entries.
                </div>
              )}

              {patterns.map((result, i) => (
                <PatternMatchCard
                  key={i}
                  result={result}
                  onReplace={onPatternReplace}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};

const PatternMatchCard = ({ result, onReplace }) => {
  const [expanded, setExpanded] = useState(false);
  const sg = result.subgraph;
  const topMatch = result.matches?.[0];

  if (!topMatch) return null;

  return (
    <div style={S.matchCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
        <span style={S.matchScore(topMatch.score)}>{Math.round(topMatch.score * 100)}%</span>
        <span style={{ flex: 1, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {topMatch.catalogEntry.name}
        </span>
        <button
          style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 0 }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 4 }}>
        Your subgraph: {sg.nodeCount}n • Catalog: {topMatch.catalogEntry.nodeCount}n • {topMatch.matchReason}
      </div>

      {expanded && (
        <div style={{ fontSize: 13, marginBottom: 6 }}>
          <div style={{ color: '#8b949e', marginBottom: 2 }}>Subgraph: {sg.textSummary?.slice(0, 100)}</div>
          <div style={{ color: '#8b949e' }}>Catalog: {topMatch.catalogEntry.description?.slice(0, 100)}</div>
          <div style={{ marginTop: 4 }}>
            <span style={{ color: '#58a6ff' }}>Structural: {Math.round(topMatch.structuralScore * 100)}%</span>
            {' • '}
            <span style={{ color: '#a78bfa' }}>Text: {Math.round(topMatch.textScore * 100)}%</span>
            {' • '}
            <span style={{ color: '#2dd4bf' }}>Topology: {Math.round(topMatch.topologyScore * 100)}%</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          style={S.actionBtn('#238636')}
          onClick={() => onReplace?.({
            subgraphId: sg.id,
            catalogEntryId: topMatch.catalogEntry.id,
            catalogName: topMatch.catalogEntry.name,
            score: topMatch.score
          })}
        >
          <Replace size={10} style={{ marginRight: 3 }} /> Replace
        </button>
        {result.matches.length > 1 && (
          <span style={{ fontSize: 13, color: '#484f58', alignSelf: 'center' }}>
            +{result.matches.length - 1} more
          </span>
        )}
      </div>
    </div>
  );
};

export default CatalogAIPanel;
