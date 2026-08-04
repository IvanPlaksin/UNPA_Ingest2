import React, { useState, useEffect, useRef } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import './styles/chat-v2.css';
import fdv2i18n, { currentDir, setLang } from './i18n';
import { useChatActions, useSession, useActiveStore, useMessages, ChatStoreProvider } from './store/chat-store';
import { configureChat } from './config/runtime-config';
import { useAIPrefs, setAIPrefs, hasStoredAIPrefs } from './prefs/ai-prefs';
import MessageList from './components/MessageList.jsx';
import Composer from './components/Composer.jsx';
import TypingIndicator from './components/TypingIndicator.jsx';
import DraftPanel from './components/DraftPanel.jsx';

function ChatShell({
  showDraftPanel,
  showLanguageSwitcher,
  showVoiceControls,
  showAttachments,
  className,
  serviceId,
  sessionId = null,
  emptyState,
  userProfile,
  userAvatar,
  assistantAvatar,
  anchorContext = null,
  compact = false,
  onNavigate,
  onVoiceActiveChange,
}) {
  const { t } = useTranslation();
  const actions = useChatActions();
  const session = useSession();
  const activeStore = useActiveStore(); // the storeId-scoped store (for .getState())
  const [dir, setDir] = useState(currentDir());

  // Adopt a host-owned session id BEFORE any auto-send (anchor explain / service
  // start below), so this chat shares ONE backend session with another surface —
  // e.g. the portal voice launcher points its text window AND its voice channel at
  // the same assistant session. Defined first so it runs before those effects.
  const adoptedRef = useRef(false);
  useEffect(() => {
    if (adoptedRef.current || !sessionId) return;
    adoptedRef.current = true;
    actions.adoptSession(sessionId);
    // VF1-005: hydrate the voice dialogue into this (shared) thread on open, so the
    // text window shows the whole voice conversation. Deduped against live pushes.
    if (actions.loadVoiceHistory) actions.loadVoiceHistory();
  }, [sessionId, actions]);

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
  // and seeds the greeting (by first name where known, in the selected language).
  // AltioraChat below falls back to a bare {userId} when the host passes no profile.
  useEffect(() => {
    if (userProfile && userProfile.userId) actions.setUser(userProfile);
  }, [userProfile, actions]);

  // Adopt a host-supplied serviceId, but only while the thread is still empty —
  // startSession() clears messages, and wiping a live conversation because the
  // host happened to re-render with a new prop would lose the user's work.
  const appliedServiceRef = useRef(false);
  useEffect(() => {
    if (appliedServiceRef.current || !serviceId) return;
    appliedServiceRef.current = true;
    if (session.serviceId === serviceId) return;
    if (activeStore.getState().messages.length > 0) return;
    actions.startSession(serviceId);
  }, [serviceId, session.serviceId, actions]);

  return (
    <div
      className={`fdv2-root${compact ? ' fdv2-compact' : ''}${className ? ` ${className}` : ''}`}
      data-feature="altiora-chat"
      dir={dir}
    >
      <main className="fdv2-main">
        <section className="fdv2-conversation" aria-label="Conversation">
          <MessageList emptyState={emptyState} onNavigate={onNavigate} userAvatar={userAvatar} assistantAvatar={assistantAvatar}>
            <TypingIndicator />
          </MessageList>
          <Composer showVoiceControls={showVoiceControls} showAttachments={showAttachments} showSettings={showLanguageSwitcher} onVoiceActiveChange={onVoiceActiveChange} />
        </section>

        {showDraftPanel && (
          <aside className="fdv2-draft" aria-label={t('draft.requestLabel')}>
            <DraftPanel />
          </aside>
        )}
      </main>
    </div>
  );
}

/**
 * AltioraChat — conversational service-request intake.
 *
 * Self-contained: brings its own i18next instance (6 UN languages, RTL for
 * Arabic) and Zustand store, and takes its styling from the host's shadcn /
 * Tailwind theme tokens (--primary, --background, --border, --radius …) with
 * built-in fallbacks, so it adapts to whichever app mounts it.
 *
 * The empty (pre-conversation) state is host-injectable: pass an `emptyState`
 * node — or nest one as children — to replace the default greeting. When none
 * is provided it shows a plain "How can I help?".
 *
 * See README.md for the full props specification.
 */
export default function AltioraChat({
  apiBaseUrl,
  userId,
  userProfile,
  userAvatar,
  assistantAvatar,
  getAuthHeaders,
  fetchImpl,
  eventSourceImpl,
  lang,
  serviceId = null,
  showDraftPanel = false,
  showLanguageSwitcher = true,
  showVoiceControls = true,
  showAttachments = true,
  className,
  emptyState,
  children,
  onSubmitted,
  onError,
  onSessionStart,
  anchorContext = null,
  compact = false,
  // eslint-disable-next-line no-unused-vars -- Phase 3: host close handler, consumed by the floating window wrapper
  onClose,
  onNavigate,
  onOpenForm,
  // REQ-005: the host opens its own detail dialog when a row in the chat is clicked.
  // Absent, the rows still read — they simply do not offer to open.
  onReveal,
  storeId = 'default',
  sessionId = null,
  debug = false,
  onVoiceActiveChange,
}) {
  /**
   * Hand-off to Altiora's request form — and the end of the conversation.
   *
   * A HAND-OFF IS TERMINAL. Assisted composition is over the moment the wizard opens:
   * the request now lives in the form, and anything still on screen here belongs to a
   * conversation that has finished. So the component returns to its opening state —
   * a NEW session and an empty thread — rather than leaving the old exchange behind a
   * locked composer.
   *
   * A RESTORED HAND-OFF IS HISTORY, NOT AN INSTRUCTION. This package deliberately
   * persists nothing, but a HOST may: the Altiora portal mirrors `{messages, session}`
   * into localStorage and rehydrates before first paint. That put the hand-off message
   * back on screen after every reload, and this effect obligingly re-opened the wizard
   * — sometimes throwing hard enough to take the host SPA down with it. Messages that
   * were already present when this component mounted are therefore snapshotted and
   * never acted on; finding one means the previous conversation ended at the gate, and
   * the right response is to start a fresh one, not to reopen its form.
   */
  const handedOffRef = useRef(null);
  const restoredIdsRef = useRef(null);
  const msgs = useMessages();
  const chatActions = useChatActions();
  useEffect(() => {
    if (!Array.isArray(msgs)) return;

    // Taken on the first run of THIS mount, so it captures whatever a host rehydrated
    // (its useLayoutEffect runs before ours) and nothing that arrives afterwards.
    if (restoredIdsRef.current === null) restoredIdsRef.current = new Set(msgs.map((m) => m.id));
    if (!msgs.length) return;

    // Two ways a conversation ends, and the reset below is owed to both: the hand-off to
    // the request form, and the backend saying outright that it closed its side
    // (`sessionEnded`). The latter travels with `openForm` today, so this reads as one
    // condition — but an ending that is not a hand-off already terminates correctly, and
    // does so without a host handler, which is why the handler is no longer a
    // precondition for noticing that the conversation is over.
    const ending = [...msgs].reverse().find((m) => m.metadata && (m.metadata.openForm || m.metadata.sessionEnded));
    if (!ending || handedOffRef.current === ending.id) return;
    handedOffRef.current = ending.id;

    if (restoredIdsRef.current.has(ending.id)) {
      // A finished conversation is not resumed. No form, no history.
      chatActions.resetSession();
      return;
    }

    if (ending.metadata.openForm && onOpenForm) onOpenForm(ending.metadata.openForm);
    // New session, empty thread, opening greeting: what the user comes back to after
    // the wizard is a fresh chat, not the exchange they just completed.
    chatActions.resetSession();
  }, [msgs, onOpenForm, chatActions]);

  // Applied during render rather than in an effect: the store issues requests
  // from child effects, which run before this component's own effect would.
  configureChat({
    apiBaseUrl,
    userId,
    getAuthHeaders,
    fetchImpl,
    eventSourceImpl,
    onSubmitted,
    onError,
    onSessionStart,
    onReveal,
    debug,
  });

  // Who is asking. A host that knows the identity but passes no profile still gets
  // the opening message: the Portal passes `userId` as its own prop and never
  // `userProfile`, so the effect downstream saw nothing, setUser was never called,
  // and the message listing what the assistant can do simply never appeared
  // (fdv2-7200be16). Visible behaviour must not hang on an OPTIONAL prop — some host
  // will always turn out to be the one that does not pass it. Without a name the
  // greeting uses its nameless variant; the capabilities under it are the point.
  const effectiveProfile = (userProfile && userProfile.userId)
    ? userProfile
    : (userId ? { userId } : null);

  // CS-1: language is now a GLOBAL user preference (AI Settings), the single
  // source of truth for BOTH the text UI and the voice assistant. A host-provided
  // `lang` seeds the pref ONCE (first ever load, nothing stored); thereafter the
  // user's AI-Settings choice wins. `prefs.language` drives the i18n language.
  const [aiPrefs] = useAIPrefs();
  useEffect(() => {
    if (lang && !hasStoredAIPrefs()) setAIPrefs({ language: lang });
  }, [lang]);
  useEffect(() => { setLang(aiPrefs.language); }, [aiPrefs.language]);

  return (
    <I18nextProvider i18n={fdv2i18n}>
      <ChatStoreProvider storeId={storeId}>
        <ChatShell
          showDraftPanel={showDraftPanel}
          showLanguageSwitcher={showLanguageSwitcher}
          showVoiceControls={showVoiceControls}
          showAttachments={showAttachments}
          className={className}
          serviceId={serviceId}
          sessionId={sessionId}
          emptyState={emptyState ?? children}
          userProfile={effectiveProfile}
          userAvatar={userAvatar}
          assistantAvatar={assistantAvatar}
          anchorContext={anchorContext}
          compact={compact}
          onNavigate={onNavigate}
          onVoiceActiveChange={onVoiceActiveChange}
        />
      </ChatStoreProvider>
    </I18nextProvider>
  );
}
