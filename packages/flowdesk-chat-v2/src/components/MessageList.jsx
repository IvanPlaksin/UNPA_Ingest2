import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import MessageBubble from './MessageBubble.jsx';
import { useMessages, useChatActions } from '../store/chat-store';

/**
 * MessageList (F5) — scroll container with smart auto-scroll.
 * Scrolls to bottom when the user is already near the bottom, or when the newest
 * message is from the assistant (so the reply is always visible). If the user
 * scrolled up to read history, incoming user echoes don't yank them down.
 *
 * Also hosts the floating "New Chat" action, pinned to the bottom-right of the
 * conversation area (above the composer). It only appears once a conversation
 * exists — an empty thread has nothing to start over from.
 */
export default function MessageList({ children, emptyState, onNavigate, userAvatar, assistantAvatar }) {
  const { t } = useTranslation();
  const messages = useMessages();
  const actions = useChatActions();
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

  const onNewChat = () => {
    // eslint-disable-next-line no-alert
    if (window.confirm(t('resetConfirm'))) actions.resetSession();
  };

  return (
    <div className="fdv2-messages-wrap">
      <div className="fdv2-messages" ref={containerRef}>
        <div className="fdv2-messages-inner">
          {messages.length === 0 ? (
            // Host-injectable pre-conversation slot; falls back to a bare greeting.
            emptyState != null ? (
              <div className="fdv2-empty fdv2-empty-custom">{emptyState}</div>
            ) : (
              <div className="fdv2-empty">
                <div className="fdv2-empty-icon">◆</div>
                <h2>{t('emptyTitle')}</h2>
              </div>
            )
          ) : (
            messages.map((m, i) => <MessageBubble key={m.id} message={m} isLast={i === messages.length - 1} onNavigate={onNavigate} userAvatar={userAvatar} assistantAvatar={assistantAvatar} />)
          )}
          {/* Typing indicator (F7) mounts here, before the scroll anchor */}
          {children}
          <div ref={endRef} />
        </div>
      </div>

      {messages.length > 0 && (
        <button
          type="button"
          className="fdv2-newchat"
          onClick={onNewChat}
          title={t('newChat')}
          aria-label={t('newChat')}
        >
          {/* new-chat glyph: compose (pencil on a panel) */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          <span className="fdv2-newchat-label">{t('newChat')}</span>
        </button>
      )}
    </div>
  );
}
