import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { chatClient, ChatError } from '../api/chat-client';
import fdv2i18n, { currentLang } from '../i18n';

// Module-level SSE subscription (kept out of state — not serializable).
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

/** Assistant-message metadata from a turn result (shared by every send action). */
function assistantMeta(result) {
  return {
    choices: result.choices || null,
    // controls[] (I-3): the typed turn-contract; ControlRenderer prefers it, falling
    // back to resolveChoices during the deprecation window.
    controls: Array.isArray(result.controls) ? result.controls : null,
    responseType: result.responseType || 'text',
    preamble: result.preamble || null,
    resolveChoices: result.resolveChoices || null,
    executionLog: result.executionLog || null,
    srNumber: result.spawnResult?.requestId || result.state?.srNumber || null,
    isComplete: !!result.isComplete,
  };
}

function newSessionId() {
  const rnd = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `fdv2-${rnd}`;
}

const initialSession = () => ({ id: newSessionId(), serviceId: null, schemaVersion: null, status: 'idle' });
const initialDraft = () => ({ slots: {}, beneficiary: null, patches: [] });
const initialUI = () => ({ loading: false, error: null, currentNode: null, composerDisabled: false, draftPanelOpen: true });

export const useChatStore = create(
  persist(
    (set, get) => ({
      session: initialSession(),
      messages: [],
      draft: initialDraft(),
      schema: null, // compiled SchemaSnapshot for the active service (labels/phases/dependsOn)
      user: null, // the current user profile (from the host via props) — identity + greeting
      ui: initialUI(),

      actions: {
        /**
         * Set the current user profile (host prop). Seeds a personalized greeting on
         * first set when the thread is empty. Idempotent for the same userId.
         */
        setUser: (profile) => {
          if (!profile || !profile.userId) return;
          if (get().user && get().user.userId === profile.userId) return;
          set(() => ({ user: profile }));
          const { actions } = get();
          if (get().messages.length === 0) actions.seedGreeting();
        },

        /** Seed the first assistant message: greeting by FIRST name, in the selected language. */
        seedGreeting: () => {
          const u = get().user;
          if (!u || get().messages.length > 0) return;
          const name = u.firstName || (u.displayName ? String(u.displayName).split(/\s+/)[0] : '') || u.name || '';
          const text = fdv2i18n.t('greeting', { name });
          get().actions.addMessage('assistant', text, { responseType: 'greeting' });
        },

        /** Append a message (any role). Returns the created message. */
        addMessage: (role, content, metadata) => {
          const msg = makeMessage(role, content, metadata);
          set((s) => ({ messages: [...s.messages, msg] }));
          return msg;
        },

        /** Send a turn: optimistic user message → SSE progress + POST → assistant
         *  reply + draft refresh. SSE stays open across turns for the session. */
        sendMessage: async (text, userId = 'fdv2-demo-user', signal) => {
          const trimmed = (text || '').trim();
          if (!trimmed || get().ui.loading) return;
          const { actions } = get();
          const sessionId = get().session.id;
          actions.addMessage('user', trimmed);
          set((s) => ({ ui: { ...s.ui, loading: true, error: null, currentNode: null } }));

          ensureProgress(sessionId, actions.setCurrentNode, () => actions.setCurrentNode(null));

          try {
            const u = get().user;
            const result = await chatClient.sendMessage(sessionId, u?.userId || userId, trimmed, { signal, lang: currentLang(), userContext: u || undefined });
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
            actions.addMessage('system', `⚠️ ${e.message}`);
          }
        },

        /** Send a structured confirm-or-choose selection (F9.1f). */
        sendChoice: async (choice, echoLabel, userId = 'fdv2-demo-user') => {
          if (get().ui.loading) return;
          const { actions } = get();
          const sessionId = get().session.id;
          actions.addMessage('user', echoLabel || choice.value || fdv2i18n.t('choice.yes'));
          set((s) => ({ ui: { ...s.ui, loading: true, error: null, currentNode: null } }));
          ensureProgress(sessionId, actions.setCurrentNode, () => actions.setCurrentNode(null));
          try {
            const u = get().user;
            const result = await chatClient.sendMessage(sessionId, u?.userId || userId, null, { choice, lang: currentLang(), userContext: u || undefined });
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
            actions.addMessage('system', `⚠️ ${e.message}`);
          }
        },

        /** Send a controls[] reply (I-3). Mirrors sendChoice; POSTs {controlAction}. */
        sendControlAction: async (controlAction, echoLabel, userId = 'fdv2-demo-user') => {
          if (get().ui.loading) return;
          const { actions } = get();
          const sessionId = get().session.id;
          actions.addMessage('user', echoLabel || controlAction.value || fdv2i18n.t('choice.yes'));
          set((s) => ({ ui: { ...s.ui, loading: true, error: null, currentNode: null } }));
          ensureProgress(sessionId, actions.setCurrentNode, () => actions.setCurrentNode(null));
          try {
            const u = get().user;
            const result = await chatClient.sendMessage(sessionId, u?.userId || userId, null, { controlAction, lang: currentLang(), userContext: u || undefined });
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
            actions.addMessage('system', `⚠️ ${e.message}`);
          }
        },

        startSession: (serviceId = null) => {
          stopProgress();
          set(() => ({
            session: { ...initialSession(), serviceId },
            messages: [],
            draft: initialDraft(),
            schema: null,
            ui: initialUI(),
          }));
          get().actions.seedGreeting(); // user is preserved; re-greet the fresh thread
        },

        resetSession: () => {
          stopProgress();
          set(() => ({ session: initialSession(), messages: [], draft: initialDraft(), schema: null, ui: initialUI() }));
          get().actions.seedGreeting();
        },

        /** Merge a server turn result into session + draft. */
        applyTurnResult: (result) =>
          set((s) => ({
            session: {
              ...s.session,
              serviceId: result?.state?.serviceId ?? s.session.serviceId,
              status: result?.state?.status ?? (result?.isComplete ? 'submitted' : 'active'),
            },
            ui: { ...s.ui, loading: false, currentNode: null },
          })),

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
        setCurrentNode: (node) => set((s) => ({ ui: { ...s.ui, currentNode: node } })),
        setLoading: (loading) => set((s) => ({ ui: { ...s.ui, loading } })),
        setError: (error) => set((s) => ({ ui: { ...s.ui, error, loading: false, currentNode: null } })),
        clearError: () => set((s) => ({ ui: { ...s.ui, error: null } })),
        toggleDraftPanel: () => set((s) => ({ ui: { ...s.ui, draftPanelOpen: !s.ui.draftPanelOpen } })),
      },
    }),
    {
      name: 'fdv2-chat',
      storage: createJSONStorage(() => sessionStorage),
      // Persist ONLY the session id (thread continuity across refresh); no messages.
      partialize: (s) => ({ session: { id: s.session.id } }),
      merge: (persisted, current) => ({
        ...current,
        session: { ...current.session, id: persisted?.session?.id || current.session.id },
      }),
    }
  )
);

// ── Selectors (shallow-compared to avoid needless re-renders) ────────────────
export const useMessages = () => useChatStore((s) => s.messages);
export const useSession = () => useChatStore(useShallow((s) => s.session));
export const useDraft = () => useChatStore(useShallow((s) => s.draft));
export const useSchema = () => useChatStore((s) => s.schema);
export const useUI = () => useChatStore(useShallow((s) => s.ui));
export const useChatActions = () => useChatStore((s) => s.actions);
