/**
 * @flowdesk/chat-v2 — public API.
 *
 * The default export (AltioraChat) is all most hosts need. The rest is
 * escape-hatch surface: drive the chat from outside the component, or read its
 * state for a custom chrome (headers, drawers, telemetry).
 */

export { default as AltioraChat } from './AltioraChat.jsx';
export { default } from './AltioraChat.jsx';

// Floating "Explain this" chat window (Phase 3): wrap the app once with the
// provider + window, then open it from anywhere via useFloatingChat().openChat()
// or the window CustomEvent bridge ('openAltioraChat').
export { FloatingChatProvider, useFloatingChat } from './components/FloatingChatProvider.jsx';
export { default as FloatingChatWindow } from './components/FloatingChatWindow.jsx';

// "Explain this" UI anchors (Phase 8): drop `data-kb-anchor` on any element and
// call useKBAnchors(containerRef) to auto-inject the "?" trigger, or place
// <ExplainTrigger anchorId=… /> explicitly.
export { default as ExplainTrigger } from './components/ExplainTrigger.jsx';
export { useKBAnchors } from './components/useKBAnchors.js';

// Imperative / observational access to the conversation.
export {
  useChatStore,
  useChatActions,
  useMessages,
  useSession,
  useDraft,
  useSchema,
  useUI,
  // Instance-scoped stores (Phase V1): isolate a chat's session/history by storeId.
  getChatStore,
  ChatStoreProvider,
  useActiveStore,
} from './store/chat-store';

// Runtime configuration — only needed if you call the API client directly.
export { configureChat, getConfig } from './config/runtime-config';

// API client + error type, for custom flows outside the component.
export { chatClient, ChatError, SSE_EVENTS } from './api/chat-client';

// Documents attached in the chat. `linkStagedAttachments` is the one a host
// needs: a hand-off is terminal, so only the party that submits the wizard ever
// holds both the ticket id and the conversation the files were staged under.
export { uploadFile, linkAttachments, linkStagedAttachments } from './api/chat-client';

// i18n: add/override translations, or drive language from the host.
export { default as i18n, LANGUAGES, setLang, currentLang, currentDir, dirFor } from './i18n';

// CS-1: global AI preferences (language + voice) — one source of truth shared by
// the text chat AND the portal voice launcher.
export { useAIPrefs, getAIPrefs, setAIPrefs, hasStoredAIPrefs, DEFAULT_AI_PREFS, AI_PREFS_KEY, AI_PREFS_EVENT } from './prefs/ai-prefs';
export { VOICE_OPTIONS, getVoicesForLanguage, getDefaultVoice, isValidVoice, effectiveVoice } from './prefs/voice-options';
export { default as AISettingsDialog } from './components/AISettingsDialog.jsx';
