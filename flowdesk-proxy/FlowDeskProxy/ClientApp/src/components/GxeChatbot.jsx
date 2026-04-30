import { useState, useEffect, useRef, useCallback } from 'react';
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr';
import './GxeChatbot.css';

const DEFAULT_GRAPH_ID = '934e9016-6157-4f76-8dbe-c0f8c9dd08a2';

/**
 * GxeChatbot — React component for the FlowDesk AI assistant.
 *
 * Shows a blocking start screen on mount. The user enters a graph ID and clicks
 * "Start"; the component fetches graph info, shows a static welcome message, then
 * initialises the SignalR session lazily on the first user message.
 *
 * Props:
 *   userId      — authenticated user ID
 *   proxyBase   — proxy base URL (default: '')
 *   onComplete  — callback(result) fired when graph reaches end node
 */
export function GxeChatbot({ userId, proxyBase = '', onComplete }) {
  // ── Start-screen state ────────────────────────────────────────────────
  const [phase, setPhase] = useState('start'); // 'start' | 'chat'
  const [graphIdInput, setGraphIdInput] = useState(DEFAULT_GRAPH_ID);
  const [startError, setStartError] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [graphInfo, setGraphInfo] = useState(null);

  // ── Chat state ────────────────────────────────────────────────────────
  const [messages, setMessages] = useState([]);
  const [choices, setChoices] = useState(null);
  const [inputValue, setInputValue] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const connRef = useRef(null);
  const initializingRef = useRef(false);
  const messagesEndRef = useRef(null);
  // Refs keep stable references for SignalR closures
  const graphIdRef = useRef(null);
  const sessionIdRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Cleanup on unmount
  useEffect(() => () => { connRef.current?.stop(); }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Start screen ──────────────────────────────────────────────────────
  const handleStart = async () => {
    const gid = graphIdInput.trim();
    if (!gid) return;
    setIsStarting(true);
    setStartError('');
    try {
      const res = await fetch(`${proxyBase}/api/v1/graph-catalog/${gid}`);
      if (!res.ok) throw new Error(`Graph not found (HTTP ${res.status})`);
      const data = await res.json();
      const info = data.data || data;
      if (!info?.id && !info?.name) throw new Error('Invalid graph response');

      graphIdRef.current = gid;
      setGraphInfo(info);
      setPhase('chat');
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Graph loaded: **${info.name || gid}** (${info.namespace || '?'}, ${info.nodeCount || '?'} nodes, v${info.currentVersion || 1}).\n\nHow can I help you?`,
        ts: new Date().toLocaleTimeString(),
      }]);
    } catch (err) {
      setStartError(err.message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleStartKeyDown = (e) => {
    if (e.key === 'Enter') handleStart();
  };

  // ── SignalR message handler (stable via ref) ──────────────────────────
  const handleServerMessage = useCallback((data) => {
    setIsThinking(false);
    if (data.response) {
      setMessages(prev => [...prev, {
        id: `${Date.now()}-${Math.random()}`,
        role: 'assistant',
        content: data.response,
        ts: new Date().toLocaleTimeString(),
      }]);
    }
    if (data.choices?.length) setChoices(data.choices);
    else setChoices(null);

    if (data.isComplete) {
      setIsComplete(true);
      if (data.recommendation || data.requestId) {
        onCompleteRef.current?.({ recommendation: data.recommendation, requestId: data.requestId, phase: data.phase });
      }
    }
  }, []);

  // ── Lazy SignalR init (on first user message) ─────────────────────────
  const ensureConnected = useCallback(async () => {
    if (connRef.current?.state === 'Connected') {
      return { conn: connRef.current, sid: sessionIdRef.current };
    }
    if (initializingRef.current) {
      // Wait for concurrent init to finish
      await new Promise(resolve => setTimeout(resolve, 2000));
      return { conn: connRef.current, sid: sessionIdRef.current };
    }

    initializingRef.current = true;
    try {
      // Create session
      const res = await fetch(`${proxyBase}/proxy/chat/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, graphKey: graphIdRef.current }),
      });
      if (!res.ok) throw new Error('Failed to create session');
      const { sessionId: sid } = await res.json();
      sessionIdRef.current = sid;
      setSessionId(sid);

      // Build SignalR connection
      const conn = new HubConnectionBuilder()
        .withUrl(`${proxyBase}/hubs/chat`)
        .withAutomaticReconnect()
        .configureLogging(LogLevel.Warning)
        .build();

      conn.on('ReceiveMessage', handleServerMessage);
      conn.on('Error', (err) => {
        setIsThinking(false);
        setMessages(prev => [...prev, {
          id: `err-${Date.now()}`,
          role: 'system',
          content: `Error: ${err}`,
          ts: new Date().toLocaleTimeString(),
        }]);
      });
      conn.onreconnecting(() => setIsConnected(false));
      conn.onreconnected(() => setIsConnected(true));
      conn.onclose(() => setIsConnected(false));

      await conn.start();
      await conn.invoke('SubscribeToSession', sid);
      connRef.current = conn;
      setIsConnected(true);
      return { conn, sid };
    } finally {
      initializingRef.current = false;
    }
  }, [userId, proxyBase, handleServerMessage]);

  // ── Send ──────────────────────────────────────────────────────────────
  async function sendMessage(text) {
    if (!text.trim() || isThinking || isComplete) return;

    setMessages(prev => [...prev, {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      ts: new Date().toLocaleTimeString(),
    }]);
    setInputValue('');
    setChoices(null);
    setIsThinking(true);

    try {
      const { conn, sid } = await ensureConnected();

      if (conn?.state === 'Connected') {
        await conn.invoke('SendMessage', sid, userId, text, graphIdRef.current);
      } else {
        // HTTP fallback
        const res = await fetch(`${proxyBase}/proxy/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid, userId, message: text, graphId: graphIdRef.current }),
        });
        const data = await res.json();
        handleServerMessage(data);
      }
    } catch (err) {
      setIsThinking(false);
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`,
        role: 'system',
        content: `Send failed: ${err.message}`,
        ts: new Date().toLocaleTimeString(),
      }]);
    }
  }

  function handleChoiceClick(value) { sendMessage(value); }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="gxe-chatbot">
      {/* Blocking start screen */}
      {phase === 'start' && (
        <div className="gxe-start-screen">
          <div className="gxe-start-card">
            <div className="gxe-start-logo">GXE</div>
            <h2 className="gxe-start-title">FlowDesk AI Assistant</h2>
            <p className="gxe-start-subtitle">Enter the graph ID to begin</p>

            <label className="gxe-start-label">Graph ID</label>
            <input
              className="gxe-start-input"
              type="text"
              value={graphIdInput}
              onChange={e => setGraphIdInput(e.target.value)}
              onKeyDown={handleStartKeyDown}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              disabled={isStarting}
              autoFocus
            />

            {startError && (
              <div className="gxe-start-error">{startError}</div>
            )}

            <button
              className="gxe-start-btn"
              onClick={handleStart}
              disabled={isStarting || !graphIdInput.trim()}
            >
              {isStarting ? 'Loading graph…' : 'Start'}
            </button>
          </div>
        </div>
      )}

      {/* Chat UI */}
      <div className="gxe-chatbot__header">
        <div className="gxe-chatbot__title">
          {graphInfo?.name || 'FlowDesk AI Assistant'}
        </div>
        {phase === 'chat' && (
          <div className={`gxe-chatbot__status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? 'Connected' : sessionId ? 'Reconnecting…' : 'Ready'}
          </div>
        )}
      </div>

      <div className="gxe-chatbot__messages">
        {messages.map(msg => (
          <div key={msg.id} className={`gxe-message gxe-message--${msg.role}`}>
            {msg.role !== 'user' && (
              <div className="gxe-message__avatar">
                {msg.role === 'assistant' ? 'AI' : '⚙'}
              </div>
            )}
            <div className="gxe-message__bubble">
              <div className="gxe-message__content">{renderContent(msg.content)}</div>
              <div className="gxe-message__time">{msg.ts}</div>
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="gxe-message gxe-message--assistant">
            <div className="gxe-message__avatar">AI</div>
            <div className="gxe-message__bubble gxe-message__bubble--thinking">
              <span /><span /><span />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {choices && !isComplete && (
        <div className="gxe-chatbot__choices">
          {choices.map((c, i) => (
            <button
              key={i}
              className="gxe-choice-btn"
              onClick={() => handleChoiceClick(c.value ?? c)}
            >
              {c.label ?? c}
            </button>
          ))}
        </div>
      )}

      {phase === 'chat' && !isComplete && (
        <div className="gxe-chatbot__input-row">
          <textarea
            className="gxe-chatbot__input"
            placeholder="Type your message…"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isThinking}
          />
          <button
            className="gxe-chatbot__send-btn"
            onClick={() => sendMessage(inputValue)}
            disabled={isThinking || !inputValue.trim()}
          >
            Send
          </button>
        </div>
      )}

      {isComplete && (
        <div className="gxe-chatbot__complete">
          <p>Request submitted successfully.</p>
          <button onClick={() => window.location.reload()}>Start New Request</button>
        </div>
      )}
    </div>
  );
}

function renderContent(text) {
  if (!text) return null;
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>
  );
}
