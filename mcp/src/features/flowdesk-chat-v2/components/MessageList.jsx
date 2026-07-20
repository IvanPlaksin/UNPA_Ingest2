import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import MessageBubble from './MessageBubble.jsx';
import { useMessages } from '../store/chat-store';

/**
 * MessageList (F5) — scroll container with smart auto-scroll.
 * Scrolls to bottom when the user is already near the bottom, or when the newest
 * message is from the assistant (so the reply is always visible). If the user
 * scrolled up to read history, incoming user echoes don't yank them down.
 */
export default function MessageList({ children }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const containerRef = useRef(null);
  const endRef = useRef(null);
  const prevLenRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const grew = messages.length > prevLenRef.current;
    prevLenRef.current = messages.length;
    if (!grew) return;

    const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 120;
    const last = messages[messages.length - 1];
    if (nearBottom || last?.role === 'assistant' || last?.role === 'system') {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages]);

  return (
    <div className="fdv2-messages" ref={containerRef}>
      <div className="fdv2-messages-inner">
        {messages.length === 0 ? (
          <div className="fdv2-empty">
            <div className="fdv2-empty-icon">◆</div>
            <h2>{t('emptyTitle')}</h2>
            <p>{t('emptySub')}</p>
          </div>
        ) : (
          messages.map((m, i) => <MessageBubble key={m.id} message={m} isLast={i === messages.length - 1} />)
        )}
        {/* Typing indicator (F7) mounts here, before the scroll anchor */}
        {children}
        <div ref={endRef} />
      </div>
    </div>
  );
}
