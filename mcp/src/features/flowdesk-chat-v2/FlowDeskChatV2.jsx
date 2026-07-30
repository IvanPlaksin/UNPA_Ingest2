import React, { useState, useEffect, useRef } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import './styles/chat-v2.css';
import fdv2i18n, { currentDir } from './i18n';
import { useChatActions, useSession, useMessages, ChatStoreProvider } from './store/chat-store';
import MessageList from './components/MessageList.jsx';
import Composer from './components/Composer.jsx';
import TypingIndicator from './components/TypingIndicator.jsx';
import DraftPanel from './components/DraftPanel.jsx';
import LanguageSwitcher from './components/LanguageSwitcher.jsx';
import { TtsToggle } from './components/VoiceControls.jsx';

function ChatShell({ userProfile, anchorContext = null, compact = false, onNavigate }) {
  const { t } = useTranslation();
  const actions = useChatActions();
  const session = useSession();
  const msgs = useMessages();
  const [dir, setDir] = useState(currentDir());

  // When the assistant hands off to the Altiora wizard (a turn carrying
  // `openForm`), assisted composition is over: the wizard owns the request and
  // the chat cannot touch it again. So the thread is closed and a NEW session is
  // opened behind it — the backend closes its side on the same turn — instead of
  // leaving the user on a dead thread with a locked composer.
  //
  // Guarded by the hand-off message id, so a re-render, or the closing messages
  // this appends, cannot fire it twice.
  const closedRef = useRef(null);
  useEffect(() => {
    if (!Array.isArray(msgs) || !msgs.length) return;
    const ended = [...msgs].reverse().find((m) => m.metadata && (m.metadata.sessionEnded || m.metadata.openForm));
    if (ended && closedRef.current !== ended.id) {
      closedRef.current = ended.id;
      actions.endThread({ reason: ended.metadata.sessionEnded || 'form_handoff', key: ended.id });
    }
  }, [msgs, actions]);

  // Re-render + set text direction (RTL for Arabic) when the language changes.
  useEffect(() => {
    const onLang = () => setDir(currentDir());
    fdv2i18n.on('languageChanged', onLang);
    return () => fdv2i18n.off('languageChanged', onLang);
  }, []);

  // Phase 4: stash the opening anchor (runs BEFORE the greeting effect so the
  // greeting is suppressed for an anchor open — see store seedGreeting) and
  // auto-send a zero-query explain exactly once, so the explanation is the first
  // assistant message.
  const explainSentRef = useRef(false);
  useEffect(() => {
    if (actions.setAnchorContext) actions.setAnchorContext(anchorContext || null);
    if (anchorContext && anchorContext.anchorId && !explainSentRef.current) {
      explainSentRef.current = true;
      actions.sendAnchorExplain(anchorContext);
    }
  }, [anchorContext, actions]);

  // Adopt the host-provided user profile: sets the acting identity for every turn
  // and seeds the personalized greeting (by first name, in the selected language).
  useEffect(() => {
    if (userProfile && userProfile.userId) actions.setUser(userProfile);
  }, [userProfile, actions]);

  const onReset = () => {
    // eslint-disable-next-line no-alert
    if (window.confirm(t('resetConfirm'))) actions.resetSession();
  };

  return (
    <div className={`fdv2-root${compact ? ' fdv2-compact' : ''}`} data-feature="flowdesk-chat-v2" dir={dir}>
      <header className="fdv2-header">
        <div className="fdv2-header-title">
          <span className="fdv2-logo" aria-hidden="true">◆</span>
          <span>{t('appTitle')}</span>
          <span className="fdv2-badge">v2</span>
        </div>
        <div className="fdv2-header-actions">
          <LanguageSwitcher />
          <TtsToggle />
          <button type="button" className="fdv2-icon-btn fdv2-reset" onClick={onReset} title={t('reset')} aria-label={t('reset')} disabled={session.status === 'idle'}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
            </svg>
          </button>
        </div>
      </header>

      <main className="fdv2-main">
        <section className="fdv2-conversation" aria-label="Conversation">
          <MessageList onNavigate={onNavigate}>
            <TypingIndicator />
          </MessageList>
          <Composer />
        </section>

        <aside className="fdv2-draft" aria-label={t('draft.requestLabel')}>
          <DraftPanel />
        </aside>
      </main>
    </div>
  );
}

/**
 * FlowDesk Chat V2 — route entry (/flowdesk-v2). Wraps the isolated feature in its
 * own i18next provider (English default, 6 UN languages, RTL for Arabic).
 *
 * @param {Object}  [props]
 * @param {Object}  [props.userProfile] - the current user: { userId, firstName, lastName?, displayName?, email?, ... }.
 *   Identifies the acting user for every turn (ticket listing, on-behalf, etc.) and
 *   drives the personalized greeting. Optional — without it the chat runs anonymously.
 * @param {Object}  [props.anchorContext] - Phase 3: opening UI-anchor context
 *   { anchorId, anchorTitle?, initialQuery? } when launched from the floating window.
 * @param {boolean} [props.compact] - Phase 3: tighter layout for the floating window.
 * @param {Function}[props.onClose] - Phase 3: host close handler (floating window).
 */
export default function FlowDeskChatV2({ userProfile, anchorContext = null, compact = false, onClose, onNavigate, storeId = 'default' }) {
  return (
    <I18nextProvider i18n={fdv2i18n}>
      <ChatStoreProvider storeId={storeId}>
        <ChatShell userProfile={userProfile} anchorContext={anchorContext} compact={compact} onClose={onClose} onNavigate={onNavigate} />
      </ChatStoreProvider>
    </I18nextProvider>
  );
}
