import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { I18nextProvider, useTranslation } from 'react-i18next';
import fdv2i18n from '../i18n';
import { useFloatingChat } from './FloatingChatProvider.jsx';
import FlowDeskChatV2 from '../FlowDeskChatV2.jsx';

/**
 * FloatingChatWindow (Phase 3) — an elevated, bottom-right chat window (bottom
 * sheet on mobile) that mounts the SAME chat component in compact mode. Rendered
 * via a portal to document.body so it escapes parent stacking/overflow contexts.
 *
 * Reads open/close + anchor state from FloatingChatProvider. `chatProps` are the
 * host's chat config (userProfile, etc.), forwarded to the chat unchanged.
 */
function WindowInner({ anchorContext, closeChat, chatProps, storeId }) {
  const { t } = useTranslation();

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeChat(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeChat]);

  const title = (anchorContext && anchorContext.anchorTitle) || t('floatingChat.defaultTitle');

  return (
    <div className="fdv2-floating-overlay">
      <div className="fdv2-floating-window" role="dialog" aria-modal="true" aria-label={title}>
        <header className="fdv2-floating-header">
          <span className="fdv2-floating-title">{title}</span>
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
          <FlowDeskChatV2 {...chatProps} storeId={storeId} anchorContext={anchorContext} compact onClose={closeChat} />
        </div>
      </div>
    </div>
  );
}

export default function FloatingChatWindow({ chatProps }) {
  const { isOpen, anchorContext, closeChat, storeId } = useFloatingChat();
  if (!isOpen) return null;
  // The header lives outside the chat's own I18nextProvider, so wrap it here to
  // resolve floatingChat.* strings (portal renders outside any parent provider).
  return createPortal(
    <I18nextProvider i18n={fdv2i18n}>
      <WindowInner anchorContext={anchorContext} closeChat={closeChat} chatProps={chatProps || {}} storeId={storeId} />
    </I18nextProvider>,
    document.body,
  );
}
