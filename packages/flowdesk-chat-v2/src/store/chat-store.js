import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { createContext, useContext, useMemo, createElement } from 'react';
import { chatClient, ChatError } from '../api/chat-client';
import { getConfig, emit } from '../config/runtime-config';
import fdv2i18n, { currentLang } from '../i18n';

/**
 * FlowDesk Chat V2 store (F2) — isolated Zustand store for the v2 chat feature.
 *
 * Holds the conversation, session, live DraftSR mirror, and UI state. Actions
 * are thin here; the real REST+SSE wiring lands in F4 (sendMessage/subscribe).
 * Only session.id is persisted (sessionStorage) so a refresh keeps the thread;
 * messages are intentionally NOT persisted (privacy).
 */

let _mid = 0;
export function makeMessage(role, content, metadata) {
  _mid += 1;
  return { id: `m${Date.now()}_${_mid}`, role, content, timestamp: new Date().toISOString(), metadata: metadata || null };
}

/**
 * User-facing text for a failed turn — never the raw HTTP/network detail (that goes
 * to the console for debugging, and — only when the HOST is running in dev, per
 * configureChat({ debug }) — is also carried in metadata.debugDetail so the bubble
 * can render it on its own line instead of run into the friendly sentence). Tagged
 * with metadata.kind so the bubble can show a matching icon instead of chat-v2's
 * generic warning glyph.
 */
function friendlyTurnError(e) {
  // eslint-disable-next-line no-console
  console.error('[flowdesk-chat-v2] turn failed:', e);
  const text = {
    NETWORK: "I'm having trouble reaching the server. Check your connection and try again.",
    TIMEOUT: 'That took too long to respond — please try again.',
    SSE_DISCONNECT: 'I lost the live connection, but you can keep chatting.',
  }[e.code] || "Something went wrong on my end. Please try again in a moment.";
  const debugDetail = getConfig().debug ? `${e.code} — ${e.message}` : null;
  return { text, metadata: { kind: 'chat-error', debugDetail } };
}

/** Assistant-message metadata from a turn result (shared by every send action). */
function assistantMeta(result) {
  return {
    choices: result.choices || null,
    // controls[] (I-3): the typed turn-contract; ControlRenderer prefers it, falling
    // back to resolveChoices during the deprecation window.
    controls: Array.isArray(result.controls) ? result.controls : null,
    // REQ-005 — rows the turn SHOWS (requests, tasks). A separate field from
    // `controls` because they collect nothing; see the backend contract.
    cards: Array.isArray(result.cards) ? result.cards : null,
    responseType: result.responseType || 'text',
    preamble: result.preamble || null,
    resolveChoices: result.resolveChoices || null,
    // sources[] (Phase 2 "Show sources") — KB origins of the answer, carried from
    // the backend turn response (top-level `sources`). Always an array so the
    // bubble can render a bottom-right icon only when there is at least one.
    sources: Array.isArray(result.sources) ? result.sources : [],
    // navigate (Phase 5 SITE_NAVIGATE) — {path, highlight?} destination; the bubble
    // renders a "Go there" link that calls the host onNavigate. Null when absent.
    navigate: result.navigate || null,
    // review (confirm-form) — grouped summary of collected values; the bubble renders
    // it as a table with a per-editable-row ✎ button.
    review: result.review || null,
    // Hand-off to Altiora's own request form (P1: the wizard opens prefilled).
    openForm: result.openForm || null,
    // sessionEnded — the backend saying, in as many words, that it closed its side of
    // this conversation. It travels with openForm today; carried separately so an
    // ending that is NOT a form hand-off needs no new client contract.
    sessionEnded: result.sessionEnded || null,
    executionLog: result.executionLog || null,
    srNumber: result.spawnResult?.requestId || result.state?.srNumber || null,
    isComplete: !!result.isComplete,
    // Chat-agent read intents: structured payloads a host chrome may render richly.
    ...(Array.isArray(result.tickets) ? { tickets: result.tickets, totalCount: result.totalCount } : {}),
    ...(Array.isArray(result.breadcrumb) ? { breadcrumb: result.breadcrumb } : {}),
  };
}

function newSessionId() {
  const rnd = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `fdv2-${rnd}`;
}

const initialSession = () => ({ id: newSessionId(), serviceId: null, schemaVersion: null, status: 'idle' });
const initialDraft = () => ({ slots: {}, beneficiary: null, patches: [] });
const initialUI = () => ({ loading: false, error: null, currentNode: null, composerDisabled: false, draftPanelOpen: true, completed: false , uploading: false });

function createChatStore(storeId) {
  // Per-store SSE subscription (kept out of state — not serializable). Closure-
  // scoped (Phase V1) so two chat instances never fight over one progress stream.
  let _progress = { sessionId: null, unsub: null };
  function ensureProgress(sessionId, onNode, onTurnDone) {
    if (_progress.sessionId === sessionId && _progress.unsub) return;
    if (_progress.unsub) { try { _progress.unsub(); } catch { /* ignore */ } }
    const unsub = chatClient.subscribeProgress(sessionId, {
      onNode: (node, phase) => onNode(phase === 'start' ? node : null),
      onTurnDone: () => onTurnDone(),
    });
    _progress = { sessionId, unsub };
  }
  function stopProgress() {
    if (_progress.unsub) { try { _progress.unsub(); } catch { /* ignore */ } }
    _progress = { sessionId: null, unsub: null };
  }

  return create(
  persist(
    (set, get) => ({
      session: initialSession(),
      messages: [],
      // DOC-3 — documents attached to this conversation, staged server-side and
      // waiting to follow the request onto its ticket. Not persisted: the ids
      // are meaningless without the session they were staged under.
      attachments: [],
      draft: initialDraft(),
      schema: null, // compiled SchemaSnapshot for the active service (labels/phases/dependsOn)
      user: null, // the current user profile (from the host) — identity + greeting
      anchorContext: null, // Phase 3: UI-anchor the chat was opened from (Phase 4 zero-query source)
      ui: initialUI(),

      actions: {
        /** Append a message (any role). Returns the created message. */
        addMessage: (role, content, metadata) => {
          const msg = makeMessage(role, content, metadata);
          set((s) => ({ messages: [...s.messages, msg] }));
          return msg;
        },

        /**
         * Set the current user profile (host prop). Idempotent for the same userId.
         *
         * Does NOT seed the greeting. It used to, and that meant a chat panel put a
         * conversation on screen as soon as the page loaded — before the user had
         * shown any interest in it — which collapsed the host's own empty state and
         * changed the look of the landing page. The greeting is seeded when the user
         * focuses the composer instead: identity is known at mount, but the opening
         * message belongs to the moment they turn towards the chat.
         */
        setUser: (profile) => {
          if (!profile || !profile.userId) return;
          if (get().user && get().user.userId === profile.userId) return;
          set(() => ({ user: profile }));
        },

        /** Seed the first assistant message: greeting by FIRST name, in the selected language. */
        seedGreeting: () => {
          const u = get().user;
          if (!u || get().messages.length > 0) return;
          // Phase 4: an anchor open leads with a contextual explanation, not a greeting.
          if (get().anchorContext) return;
          // The host may know only WHO is asking and not their name — the Portal
          // passes a userId and no profile. A greeting is still worth having: the
          // capabilities below it are the point, and "Hello, !" is worse than no
          // name at all, so there is a nameless variant in every locale.
          const name = u.firstName || (u.displayName ? String(u.displayName).split(/\s+/)[0] : '') || u.name || '';
          const hello = name ? fdv2i18n.t('greeting', { name }) : fdv2i18n.t('greetingNoName');
          // Greeting AND what the assistant can actually do. Someone opening a chat
          // panel does not know what it is for, and "how can I help you today?" asks
          // them to guess — the commonest opening in the recorded sessions is a bare
          // service name, from the people who already knew what to type.
          //
          // A TEMPLATE on purpose: no model call, so it arrives with the panel rather
          // than a second later, and it cannot offer a capability that does not exist.
          // The living, generated help is a separate thing, produced when asked for.
          const text = `${hello}\n\n${fdv2i18n.t('capabilities')}`;
          get().actions.addMessage('assistant', text, { responseType: 'greeting' });
        },

        /**
         * DOC-3 — attach a document to the conversation.
         *
         * The upload is its own step, not a turn: nothing is sent to the model
         * here. The assistant reads the file only when the conversation reaches
         * a point where reading it helps, which needs a chosen service — so a
         * file attached before that is staged and waits, and saying "attached"
         * is the whole of the feedback the user gets now.
         *
         * `canExtract` comes back from the server and is NOT the same as "the
         * upload worked": Altiora accepts .docx and .xlsx, which travel with the
         * request but which the assistant cannot open. The message says which
         * happened, so nobody is left expecting the contents to be understood.
         */
        uploadAttachment: async (file, { signal } = {}) => {
          const { actions } = get();
          const sessionId = get().session.id;
          if (!file || !sessionId || get().ui.uploading) return null;

          set((s) => ({ ui: { ...s.ui, uploading: true, error: null } }));
          try {
            const record = await chatClient.uploadFile(sessionId, file, { signal });
            set((s) => ({ attachments: [...(s.attachments || []).filter((a) => a.attachmentId !== record.attachmentId), record] }));
            actions.addMessage('system', fdv2i18n.t(
              record.canExtract ? 'upload.attachedReadable' : 'upload.attached',
              { fileName: record.fileName },
            ), { attachment: record });
            return record;
          } catch (e) {
            // The server's text is Altiora's own verdict on the file and is
            // meant for the person who chose it; only a bare network failure
            // gets a generic line.
            const message = e.code === 'NETWORK' ? fdv2i18n.t('upload.failed') : e.message;
            actions.setError({ code: e.code, message });
            actions.addMessage('system', `⚠️ ${message}`);
            return null;
          } finally {
            set((s) => ({ ui: { ...s.ui, uploading: false } }));
          }
        },

        /**
         * DOC-5 — the documents follow the request onto its ticket.
         *
         * Called once the form reports what it created. Deliberately quiet: the
         * request is already submitted, so a failure here is not the user's
         * problem to solve mid-flow — it is logged, the server keeps the staged
         * copies, and nothing about the submission is undone.
         */
        linkAttachments: async (ticketId) => {
          const sessionId = get().session.id;
          if (!ticketId || !sessionId) return null;
          if (!(get().attachments || []).length) return null;
          try {
            return await chatClient.linkAttachments(sessionId, ticketId);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[fdv2] attaching the documents to the request failed:', e.message);
            return null;
          }
        },

        /** Send a turn: optimistic user message → SSE progress + POST → assistant
         *  reply + draft refresh. SSE stays open across turns for the session. */
        sendMessage: async (text, userId, signal) => {
          const trimmed = (text || '').trim();
          if (!trimmed || get().ui.loading) return;
          const { actions } = get();
          const sessionId = get().session.id;
          const uid = get().user?.userId || userId || getConfig().userId;
          actions.addMessage('user', trimmed);
          set((s) => ({ ui: { ...s.ui, loading: true, error: null, currentNode: null } }));

          ensureProgress(sessionId, actions.setCurrentNode, () => actions.setCurrentNode(null));

          try {
            const result = await chatClient.sendMessage(sessionId, uid, trimmed, { signal, lang: currentLang(), userContext: get().user || undefined });
            actions.addMessage('assistant', result.response, assistantMeta(result));
            if (result.draft) actions.updateDraft(result.draft);
            actions.applyTurnResult(result);
            // Load the SchemaSnapshot once the service is known (for the DraftPanel).
            const svcId = result?.state?.serviceId;
            if (svcId && get().schema?.serviceId !== svcId) {
              try { const schema = await chatClient.getSchema(svcId); if (schema) set(() => ({ schema })); } catch { /* panel degrades to slotIds */ }
            }
          } catch (err) {
            // User pressed Stop → soft cancel, no scary error.
            if (signal?.aborted) {
              set((s) => ({ ui: { ...s.ui, loading: false, currentNode: null } }));
              actions.addMessage('system', fdv2i18n.t('stopped'));
              return;
            }
            const e = err instanceof ChatError ? err : new ChatError('SERVER', err.message);
            actions.setError({ code: e.code, message: e.message });
            const { text, metadata } = friendlyTurnError(e);
            actions.addMessage('system', text, metadata);
          }
        },

        /** Phase 4: zero-query explain from a UI anchor. No user bubble — the
         *  assistant opens with context-aware help as the first message. */
        sendAnchorExplain: async (anchorContext, userId) => {
          const anchor = anchorContext
            ? { id: anchorContext.anchorId, title: anchorContext.anchorTitle, initialQuery: anchorContext.initialQuery }
            : null;
          if (!anchor || !anchor.id || get().ui.loading) return;
          const { actions } = get();
          const sessionId = get().session.id;
          const uid = get().user?.userId || userId || getConfig().userId;
          actions.setAnchorContext(anchorContext);
          set((s) => ({ ui: { ...s.ui, loading: true, error: null, currentNode: null } }));
          ensureProgress(sessionId, actions.setCurrentNode, () => actions.setCurrentNode(null));
          try {
            const result = await chatClient.sendMessage(sessionId, uid, null, { anchor, lang: currentLang(), userContext: get().user || undefined });
            actions.addMessage('assistant', result.response, assistantMeta(result));
            actions.applyTurnResult(result);
          } catch (err) {
            const e = err instanceof ChatError ? err : new ChatError('SERVER', err.message);
            actions.setError({ code: e.code, message: e.message });
            const { text, metadata } = friendlyTurnError(e);
            actions.addMessage('system', text, metadata);
          }
        },

        /** Send a structured confirm-or-choose selection (F9.1f). */
        sendChoice: async (choice, echoLabel, userId) => {
          if (get().ui.loading) return;
          const { actions } = get();
          const sessionId = get().session.id;
          const uid = get().user?.userId || userId || getConfig().userId;
          actions.addMessage('user', echoLabel || choice.value || fdv2i18n.t('choice.yes'));
          set((s) => ({ ui: { ...s.ui, loading: true, error: null, currentNode: null } }));
          ensureProgress(sessionId, actions.setCurrentNode, () => actions.setCurrentNode(null));
          try {
            const result = await chatClient.sendMessage(sessionId, uid, null, { choice, lang: currentLang(), userContext: get().user || undefined });
            actions.addMessage('assistant', result.response, assistantMeta(result));
            if (result.draft) actions.updateDraft(result.draft);
            actions.applyTurnResult(result);
            const svcId = result?.state?.serviceId;
            if (svcId && get().schema?.serviceId !== svcId) {
              try { const schema = await chatClient.getSchema(svcId); if (schema) set(() => ({ schema })); } catch { /* optional */ }
            }
          } catch (err) {
            const e = err instanceof ChatError ? err : new ChatError('SERVER', err.message);
            actions.setError({ code: e.code, message: e.message });
            const { text, metadata } = friendlyTurnError(e);
            actions.addMessage('system', text, metadata);
          }
        },

        /** Send a controls[] reply (I-3). Mirrors sendChoice; POSTs {controlAction}. */
        sendControlAction: async (controlAction, echoLabel, userId) => {
          if (get().ui.loading) return;
          const { actions } = get();
          const sessionId = get().session.id;
          const uid = get().user?.userId || userId || getConfig().userId;
          actions.addMessage('user', echoLabel || controlAction.value || fdv2i18n.t('choice.yes'));
          set((s) => ({ ui: { ...s.ui, loading: true, error: null, currentNode: null } }));
          ensureProgress(sessionId, actions.setCurrentNode, () => actions.setCurrentNode(null));
          try {
            const result = await chatClient.sendMessage(sessionId, uid, null, { controlAction, lang: currentLang(), userContext: get().user || undefined });
            actions.addMessage('assistant', result.response, assistantMeta(result));
            if (result.draft) actions.updateDraft(result.draft);
            actions.applyTurnResult(result);
            const svcId = result?.state?.serviceId;
            if (svcId && get().schema?.serviceId !== svcId) {
              try { const schema = await chatClient.getSchema(svcId); if (schema) set(() => ({ schema })); } catch { /* optional */ }
            }
          } catch (err) {
            const e = err instanceof ChatError ? err : new ChatError('SERVER', err.message);
            actions.setError({ code: e.code, message: e.message });
            const { text, metadata } = friendlyTurnError(e);
            actions.addMessage('system', text, metadata);
          }
        },

        // P1 — a system signal from the host, not something the user typed. The form
        // reporting a created request is the case today: the assistant closes the draft
        // and offers what to do next. No user bubble is added — nothing was said.
        notifyFormEvent: async (formEvent, userId) => {
          if (!formEvent || get().ui.loading) return;
          const { actions } = get();
          const sessionId = get().session.id;
          const uid = get().user?.userId || userId || getConfig().userId;
          set((s) => ({ ui: { ...s.ui, loading: true, error: null, currentNode: null } }));
          ensureProgress(sessionId, actions.setCurrentNode, () => actions.setCurrentNode(null));
          try {
            const result = await chatClient.sendMessage(sessionId, uid, null, { formEvent, lang: currentLang(), userContext: get().user || undefined });
            actions.addMessage('assistant', result.response, assistantMeta(result));
            if (result.draft) actions.updateDraft(result.draft);
            actions.applyTurnResult(result);
          } catch (err) {
            const e = err instanceof ChatError ? err : new ChatError('SERVER', err.message);
            actions.setError({ code: e.code, message: e.message });
            const { text, metadata } = friendlyTurnError(e);
            actions.addMessage('system', text, metadata);
          } finally {
            set((s) => ({ ui: { ...s.ui, loading: false } }));
          }
        },

        startSession: (serviceId = null) => {
          stopProgress();
          set(() => ({
            session: { ...initialSession(), serviceId },
            messages: [],
            attachments: [],
            draft: initialDraft(),
            schema: null,
            ui: initialUI(),
          }));
          get().actions.seedGreeting(); // user is preserved; re-greet the fresh thread
        },

        resetSession: () => {
          stopProgress();
          // `anchorContext` is cleared too: it belongs to the conversation being
          // discarded. Left behind, the fresh session would still claim it was opened
          // from an anchor — which suppresses the greeting and colours the next turn
          // with a context the user never asked for.
          set(() => ({
            session: initialSession(), messages: [], draft: initialDraft(),
            schema: null, ui: initialUI(), anchorContext: null,
          }));
          get().actions.seedGreeting();
        },

        /**
         * Addition 4 — the request has been created (the Altiora wizard was submitted
         * after a hand-off): post a closing "glad to help" message and end assisted
         * composition. The draft/service is cleared and the composer is locked; a new
         * request begins a fresh session on the next load. Idempotent within a session.
         */
        completeWithThanks: (srNumber = null) => {
          if (get().ui.completed) return;
          get().actions.addMessage('assistant', fdv2i18n.t('thanks'), { responseType: 'thanks', ...(srNumber ? { srNumber } : {}) });
          set((s) => ({
            session: { ...s.session, serviceId: null, status: 'submitted' },
            draft: initialDraft(),
            ui: { ...s.ui, loading: false, currentNode: null, completed: true, composerDisabled: true },
          }));
        },

        /**
         * Adopt an externally-owned session id (Phase V1.1) so this chat shares ONE
         * backend session with another surface — e.g. the portal voice launcher
         * makes its text window and its voice channel the SAME assistant session
         * (shared DraftSR + history + server-side turn context). Idempotent; a
         * no-op when the id already matches. Keeps the current thread (messages are
         * mount-fresh, so there is nothing to lose) and re-points progress.
         */
        adoptSession: (id) => {
          if (!id || get().session.id === id) return;
          stopProgress();
          set((s) => ({ session: { ...s.session, id } }));
        },

        /**
         * VF1-004: append a VOICE-originated turn to the thread — no API call, no
         * controls, just the spoken line rendered as text (voice+text are one
         * session). Deduped against the immediately-preceding message so a live
         * push can't double a turn.
         */
        addVoiceTranscript: ({ role, content, timestamp } = {}) => {
          if (!content || (role !== 'user' && role !== 'assistant')) return;
          const msgs = get().messages;
          const last = msgs[msgs.length - 1];
          if (last && last.role === role && last.content === content) return;
          const meta = { source: 'voice', ...(timestamp ? { clientTimestamp: timestamp } : {}) };
          set((s) => ({ messages: [...s.messages, makeMessage(role, content, meta)] }));
        },

        /**
         * VF1-005: merge a server-persisted voice transcript into the thread,
         * skipping turns already present (dedup by role+content) so hydration on
         * open never duplicates lines the live bridge already pushed.
         */
        hydrateTranscripts: (transcripts) => {
          if (!Array.isArray(transcripts) || transcripts.length === 0) return;
          set((s) => {
            const seen = new Set(s.messages.map((m) => `${m.role}\0${m.content}`));
            const add = [];
            for (const t of transcripts) {
              if (!t || (t.role !== 'user' && t.role !== 'assistant') || !t.content) continue;
              const key = `${t.role}\0${t.content}`;
              if (seen.has(key)) continue;
              seen.add(key);
              add.push(makeMessage(t.role, t.content, { source: (t.metadata && t.metadata.source) || 'voice' }));
            }
            return add.length ? { messages: [...s.messages, ...add] } : {};
          });
        },

        /** VF1-005: fetch this session's persisted voice transcript and hydrate it. */
        loadVoiceHistory: async () => {
          const sessionId = get().session.id;
          try {
            const messages = await chatClient.getVoiceTranscript(sessionId);
            get().actions.hydrateTranscripts(messages);
          } catch { /* best-effort — no voice history is fine */ }
        },

        /** Merge a server turn result into session + draft. */
        applyTurnResult: (result) => {
          set((s) => ({
            session: {
              ...s.session,
              serviceId: result?.state?.serviceId ?? s.session.serviceId,
              status: result?.state?.status ?? (result?.isComplete ? 'submitted' : 'active'),
            },
            ui: { ...s.ui, loading: false, currentNode: null },
          }));
          // Tell the host an SR was raised, so it can navigate/refresh its list.
          const srNumber = result?.spawnResult?.requestId || result?.state?.srNumber || null;
          if (srNumber) {
            // DOC-5 — the documents follow the request onto its ticket.
            //
            // This is the only moment the ticket id exists AND the chat still
            // knows which files were staged for this conversation, so it is the
            // only place the two can be joined. Fired before the host callback
            // and deliberately not awaited: the request is already created, the
            // host is waiting to navigate, and a slow link must not hold that up.
            // Failure is swallowed inside the action — the staged copies survive
            // and nothing about the submission is undone.
            const ticketId = result?.spawnResult?.ticketId || result?.state?.ticketId || srNumber;
            get().actions.linkAttachments(ticketId);
            emit('onSubmitted', { srNumber, sessionId: get().session.id, serviceId: get().session.serviceId, result });
          }
        },

        updateDraft: (draft) => set(() => ({ draft: { ...initialDraft(), ...(draft || {}) } })),

        /** Inline slot edit from the DraftPanel: optimistic → patchDraft → reconcile. */
        patchSlot: async (slotId, value) => {
          const sessionId = get().session.id;
          const prev = get().draft;
          // optimistic
          set((s) => ({ draft: { ...s.draft, slots: { ...s.draft.slots, [slotId]: { ...(s.draft.slots[slotId] || {}), value, provenance: 'user_edited', stale: false } } } }));
          try {
            const updated = await chatClient.patchDraft(sessionId, [{ op: 'set', slotId, value, provenance: 'user_edited' }]);
            if (updated && updated.slots) set(() => ({ draft: { ...initialDraft(), ...updated } }));
          } catch (err) {
            set(() => ({ draft: prev })); // revert
            get().actions.setError({ code: err.code || 'SERVER', message: err.message });
          }
        },
        /** Phase 3: remember the UI anchor the chat was opened from (floating window). */
        setAnchorContext: (anchorContext) => set(() => ({ anchorContext: anchorContext || null })),
        setCurrentNode: (node) => set((s) => ({ ui: { ...s.ui, currentNode: node } })),
        setLoading: (loading) => set((s) => ({ ui: { ...s.ui, loading } })),
        setError: (error) => {
          set((s) => ({ ui: { ...s.ui, error, loading: false, currentNode: null } }));
          emit('onError', error);
        },
        clearError: () => set((s) => ({ ui: { ...s.ui, error: null } })),
        toggleDraftPanel: () => set((s) => ({ ui: { ...s.ui, draftPanelOpen: !s.ui.draftPanelOpen } })),
      },
    }),
    {
      // Store-scoped key: each storeId keeps its OWN session id (the 'assistant'
      // window and the Home 'default' chat must not clobber each other's thread).
      name: storeId === 'default' ? 'fdv2-chat' : `fdv2-chat-${storeId}`,
      storage: createJSONStorage(() => sessionStorage),
      // A fresh chat every load: the session id is intentionally NOT persisted, so a
      // page (re)load always begins a NEW chat session rather than resuming a stale
      // thread. In-tab interactions keep the same in-memory session (the store is a
      // singleton); only a full reload starts anew. Messages are never persisted.
      partialize: () => ({}),
      merge: (_persisted, current) => ({ ...current }),
    }
  )
  );
}

// ── Store registry (instance-scoped sessions, Phase V1) ──────────────────────
// Each storeId is an isolated store: its own session id, message history and SSE
// progress. Home chat uses 'default'; the assistant uses 'assistant', so their
// sessions are independent. Same storeId → same store (singleton per id).
const _registry = new Map();
export function getChatStore(storeId = 'default') {
  if (!_registry.has(storeId)) _registry.set(storeId, createChatStore(storeId));
  return _registry.get(storeId);
}
/** Test seam — drop all isolated stores but keep 'default' (== useChatStore). */
export function clearChatStores() {
  const def = _registry.get('default');
  _registry.clear();
  if (def) _registry.set('default', def);
}

// Backward-compatible default store hook (keeps .getState()/.setState()).
export const useChatStore = getChatStore('default');

// ── Active-store context ─────────────────────────────────────────────────────
// Selectors resolve the ACTIVE store from context, so components need NO changes:
// <ChatStoreProvider storeId="assistant"> swaps the whole subtree to an isolated
// store. No provider → the default store (backward compatible).
const ChatStoreContext = createContext(null);
export function ChatStoreProvider({ storeId = 'default', children }) {
  const store = useMemo(() => getChatStore(storeId), [storeId]);
  return createElement(ChatStoreContext.Provider, { value: store }, children);
}
/** Resolve the active store hook (has .getState()) from context, for effects. */
export function useActiveStore() { return useContext(ChatStoreContext) || useChatStore; }

// ── Selectors (shallow-compared to avoid needless re-renders) ────────────────
export const useMessages = () => useActiveStore()((s) => s.messages);
export const useSession = () => useActiveStore()(useShallow((s) => s.session));
export const useDraft = () => useActiveStore()(useShallow((s) => s.draft));
export const useSchema = () => useActiveStore()((s) => s.schema);
export const useUI = () => useActiveStore()(useShallow((s) => s.ui));
export const useChatActions = () => useActiveStore()((s) => s.actions);
