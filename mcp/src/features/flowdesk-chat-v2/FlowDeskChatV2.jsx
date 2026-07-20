import React, { useState, useEffect } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import './styles/chat-v2.css';
import fdv2i18n, { currentDir } from './i18n';
import { useChatActions, useSession } from './store/chat-store';
import MessageList from './components/MessageList.jsx';
import Composer from './components/Composer.jsx';
import TypingIndicator from './components/TypingIndicator.jsx';
import DraftPanel from './components/DraftPanel.jsx';
import LanguageSwitcher from './components/LanguageSwitcher.jsx';
import { TtsToggle } from './components/VoiceControls.jsx';

function ChatShell({ userProfile }) {
  const { t } = useTranslation();
  const actions = useChatActions();
  const session = useSession();
  const [dir, setDir] = useState(currentDir());

  // Re-render + set text direction (RTL for Arabic) when the language changes.
  useEffect(() => {
    const onLang = () => setDir(currentDir());
    fdv2i18n.on('languageChanged', onLang);
    return () => fdv2i18n.off('languageChanged', onLang);
  }, []);

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
    <div className="fdv2-root" data-feature="flowdesk-chat-v2" dir={dir}>
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
          <MessageList>
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
 */
export default function FlowDeskChatV2({ userProfile }) {
  return (
    <I18nextProvider i18n={fdv2i18n}>
      <ChatShell userProfile={userProfile} />
    </I18nextProvider>
  );
}
