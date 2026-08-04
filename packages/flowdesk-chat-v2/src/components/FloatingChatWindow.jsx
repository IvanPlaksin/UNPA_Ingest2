import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import fdv2i18n from '../i18n';
import { useFloatingChat } from './FloatingChatProvider.jsx';
import AltioraChat from '../AltioraChat.jsx';

/** Matches the Portal Sparkles FAB — same AI cue in the Help chrome. */
function SparklesGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </svg>
  );
}

/**
 * FloatingChatWindow (Phase 3) — an elevated, bottom-right chat window (bottom
 * sheet on mobile) that mounts the SAME AltioraChat in compact mode. Rendered via
 * a portal to document.body so it escapes parent stacking/overflow contexts.
 *
 * Reads open/close + anchor state from FloatingChatProvider. `chatProps` are the
 * host's AltioraChat config (apiBaseUrl, userProfile, getAuthHeaders, lang, …),
 * forwarded to the chat unchanged.
 */
function WindowInner({ anchorContext, closeChat, chatProps, storeId }) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeChat(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeChat]);

  const anchorTitle = anchorContext && anchorContext.anchorTitle;
  // aria-label needs a plain string regardless of which title is showing; the visible
  // heading additionally brands "altiora" in its own font/color when there's no
  // anchor-specific title overriding it.
  const titleText = anchorTitle || 'Ask altiora AI';
  const titleNode = anchorTitle || (
    <>Ask <span className="fdv2-floating-title-brand">altiora</span> AI</>
  );

  return (
    <div className="fdv2-floating-overlay">
      <div className="fdv2-floating-window" role="dialog" aria-modal="true" aria-label={titleText}>
        <header className="fdv2-floating-header">
          <span className="fdv2-floating-title-group">
            <span className="fdv2-floating-icon" aria-hidden="true"><SparklesGlyph /></span>
            <span className="fdv2-floating-title">{titleNode}</span>
          </span>
          <button
            type="button"
            className="fdv2-floating-close"
            aria-label={t('floatingChat.close')}
            onClick={closeChat}
          >
            ×
          </button>
        </header>
        <div className="fdv2-floating-body">
          <AltioraChat {...chatProps} storeId={storeId} anchorContext={anchorContext} compact onClose={closeChat} />
        </div>
      </div>
    </div>
  );
}

export default function FloatingChatWindow({ chatProps }) {
  const { isOpen, anchorContext, closeChat, storeId } = useFloatingChat();
  if (!isOpen) return null;
  return createPortal(
    <I18nextProvider i18n={fdv2i18n}>
      <WindowInner anchorContext={anchorContext} closeChat={closeChat} chatProps={chatProps || {}} storeId={storeId} />
    </I18nextProvider>,
    document.body,
  );
}
