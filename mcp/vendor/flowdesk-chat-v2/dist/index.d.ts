/**
 * Type definitions for @flowdesk/chat-v2.
 * Hand-written: the sources are JSX, so there is no tsc emit to generate them.
 */
import * as React from 'react';

// ── Domain types ────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system';

export type SessionStatus =
  | 'idle'
  | 'active'
  | 'draft'
  | 'confirmed'
  | 'submitted'
  | 'escalated';

export type SlotProvenance = 'extracted' | 'user_edited' | 'context' | 'resolved';

export type ChatErrorCode = 'NETWORK' | 'SERVER' | 'TIMEOUT' | 'SSE_DISCONNECT';

export type LanguageCode = 'en' | 'fr' | 'es' | 'ar' | 'ru' | 'zh';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  metadata: {
    choices?: unknown[] | null;
    responseType?: 'text' | 'confirm_or_choose' | string;
    preamble?: string | null;
    resolveChoices?: ResolveChoices | null;
    sources?: Source[];
    navigate?: NavigateTarget | null;
    executionLog?: Array<{ node: string; status?: string }> | null;
    srNumber?: string | null;
    isComplete?: boolean;
  } | null;
}

/**
 * Source reference for an answer ("Show sources"). Phase 1 MVP: light fields
 * only (no UN provenance yet). Forward-compatible — provenance fields are added
 * later without breaking this shape.
 */
export interface Source {
  id: string;
  title: string;
  collection: string;
  relevance: number;
  snippet?: string;
}

/**
 * SITE_NAVIGATE destination (Phase 5). The chat resolves a whitelisted target and
 * emits this; the host `onNavigate` wires `path` to its router and may spotlight
 * the `highlight` (a portal `data-tour` id).
 */
export interface NavigateTarget {
  path: string;
  highlight?: string;
}

export interface ResolveChoices {
  slotId: string;
  default?: unknown;
  alternatives?: unknown[];
  allowSearch?: boolean;
}

export interface SlotValue {
  value: unknown;
  provenance?: SlotProvenance;
  stale?: boolean;
}

export interface DraftSR {
  slots: Record<string, SlotValue>;
  beneficiary: {
    mode?: 'self' | 'other';
    userId?: string;
    resolvedProfile?: { name?: string; email?: string };
  } | null;
  patches: unknown[];
}

export interface SchemaSlot {
  slotId: string;
  type?: 'text' | 'enum' | string;
  phase?: string;
  required?: boolean;
  dependsOn?: string[];
  promptHint?: string;
  presentOptions?: Array<{ value: string; label: string }>;
}

export interface SchemaSnapshot {
  serviceId: string;
  metadata?: { title?: string };
  phases?: string[];
  slots?: SchemaSlot[];
}

export interface ChatSession {
  id: string;
  serviceId: string | null;
  schemaVersion: string | null;
  status: SessionStatus;
}

export interface SubmittedEvent {
  /** Service-request number as issued by the backend. */
  srNumber: string;
  sessionId: string;
  serviceId: string | null;
  /** Raw turn payload, for hosts that need more than the SR number. */
  result: unknown;
}

export interface ChatErrorInfo {
  code: ChatErrorCode;
  message: string;
}

// ── Component ───────────────────────────────────────────────────────────────

/** Payload the chat emits when it hands control to Altiora's request form. */
export interface OpenFormTarget {
  /** Our service code (e.g. "EO-HR-SA-EXT"). */
  serviceId: string;
  /** organizationUnitServiceId — lets the wizard load the schema without provider detection. */
  ousId?: number;
  /** Values gathered in the conversation, in the wizard's initialFormData shape. */
  prefill: Record<string, any>;
}

export interface AltioraChatProps {
  /**
   * REQUIRED. Base URL of the ProjectAdvisor API, including the version prefix
   * and excluding a trailing slash — e.g. "https://host/api/v1". The component
   * calls `${apiBaseUrl}/flowdesk/*` beneath it.
   */
  apiBaseUrl: string;
  /** Identity the request is raised for. Defaults to "fdv2-demo-user". */
  userId?: string;
  /**
   * The current user's profile. Identifies the acting user for every turn (ticket
   * listing, on-behalf, etc.) and drives the personalized greeting (by first name,
   * in the selected language). When present it supersedes `userId`.
   */
  userProfile?: {
    userId: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    name?: string;
    email?: string;
    [key: string]: unknown;
  };
  /** Extra headers per API call; may be async, so tokens can refresh lazily. */
  getAuthHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  /** Replacement fetch (auth, retry, tracing). Defaults to globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Replacement EventSource for the SSE progress channel. */
  eventSourceImpl?: typeof EventSource;
  /** Initial UI language. The in-UI switcher takes over afterwards. */
  lang?: LanguageCode;
  /** Pre-select a service. Ignored once the conversation has started. */
  serviceId?: string | null;
  /** Show the draft-request side panel. Default false. */
  showDraftPanel?: boolean;
  /** Show the language dropdown in the composer toolbar. Default true. */
  showLanguageSwitcher?: boolean;
  /** Show the Live Chat button in the composer toolbar. Default true. */
  showVoiceControls?: boolean;
  /** Extra class on the root element. */
  className?: string;
  /**
   * Pre-conversation (empty-state) content, shown until the first message.
   * May also be supplied as children. Falls back to a plain "How can I help?".
   */
  emptyState?: React.ReactNode;
  /** Alternative to `emptyState`: nest the pre-conversation content as children. */
  children?: React.ReactNode;
  /** Fired once a service request has been created. */
  onSubmitted?: (event: SubmittedEvent) => void;
  /** Fired on any turn failure, after the in-chat error message is shown. */
  onError?: (error: ChatErrorInfo) => void;
  /** Fired when a new session begins. */
  onSessionStart?: (session: ChatSession) => void;
  /** Phase 3: opening UI-anchor context when launched from the floating window. */
  anchorContext?: AnchorContext | null;
  /** Phase 3: tighter layout for the floating window (drops the side draft panel). */
  compact?: boolean;
  /** Phase 3: host close handler, invoked by the floating window wrapper. */
  onClose?: () => void;
  /** Phase 5: called when the user clicks "Go there" on a SITE_NAVIGATE message. */
  onNavigate?: (target: NavigateTarget) => void;
  /** P1: called when the chat hands off to Altiora's request form. The host opens the
   *  wizard prefilled with `prefill`; `ousId` lets it skip provider detection. */
  onOpenForm?: (form: OpenFormTarget) => void;
  /** Phase V1: isolate this chat's session/history under a named store. Default 'default' (Home). */
  storeId?: string;
  /** Phase V1.1: adopt an external backend session id so this chat shares ONE session with another surface (e.g. the portal voice channel). */
  sessionId?: string;
}

/**
 * AltioraChat — conversational service-request intake.
 *
 * The root element is absolutely positioned (inset: 0), so it fills the nearest
 * positioned ancestor: give it a wrapper with `position: relative` and a height.
 */
export declare const AltioraChat: React.FC<AltioraChatProps>;
export default AltioraChat;

/**
 * Context passed when opening the chat from a UI anchor ("Explain this").
 * Phase 3: plumbing only; Phase 4 uses `initialQuery` for zero-query explain.
 */
export interface AnchorContext {
  /** Stable id matching a UIAnchor graph node, e.g. "altiora.leave.request.form". */
  anchorId: string;
  /** Human-readable label for the anchored element (floating window header). */
  anchorTitle?: string;
  /** Pre-filled query to auto-send on open (Phase 4 zero-query explain). */
  initialQuery?: string;
}

/**
 * Floating "Explain this" chat window (Phase 3). Wrap the app with the provider
 * and render the window once; open it via `useFloatingChat().openChat(ctx?)` or
 * `window.dispatchEvent(new CustomEvent('openAltioraChat', { detail: ctx }))`.
 */
export declare const FloatingChatProvider: React.FC<{ children?: React.ReactNode; storeId?: string }>;
/** Instance-scoped store registry (Phase V1). */
/** The subset of store actions a host may drive. Widened to any store shape via getState. */
export interface ChatStoreActions {
  /** Signal a system event to the chat (e.g. 'request_created' from the form). */
  notifyFormEvent: (formEvent: string, userId?: string) => Promise<void>;
  [action: string]: (...args: any[]) => any;
}
export interface ChatStoreApi {
  getState: () => { actions: ChatStoreActions; [k: string]: any };
  subscribe: (listener: (...args: any[]) => void) => () => void;
}
export declare function getChatStore(storeId?: string): ChatStoreApi;
export declare const ChatStoreProvider: React.FC<{ children?: React.ReactNode; storeId?: string }>;

/** CS-1: global AI preferences (language + voice) — shared by the text chat + voice launcher. */
export interface AIPrefs { language: string; voice: string | null }
export declare function getAIPrefs(): AIPrefs;
export declare function setAIPrefs(update: Partial<AIPrefs>): AIPrefs;
export declare function hasStoredAIPrefs(): boolean;
export declare function useAIPrefs(): [AIPrefs, (update: Partial<AIPrefs>) => void];
export declare const DEFAULT_AI_PREFS: AIPrefs;
export declare const AI_PREFS_KEY: string;
export declare const AI_PREFS_EVENT: string;
export interface VoiceOption { id: string; label: string; default?: boolean }
export declare const VOICE_OPTIONS: Record<string, VoiceOption[]>;
export declare function getVoicesForLanguage(lang: string): VoiceOption[];
export declare function getDefaultVoice(lang: string): string | null;
export declare function isValidVoice(voice: string | null | undefined, lang: string): boolean;
export declare function effectiveVoice(prefs: AIPrefs, lang?: string): string | null;
export declare const AISettingsDialog: React.FC<{ open: boolean; onClose: () => void }>;
export declare function useFloatingChat(): {
  isOpen: boolean;
  anchorContext: AnchorContext | null;
  openChat: (ctx?: AnchorContext | null) => void;
  closeChat: () => void;
};
export declare const FloatingChatWindow: React.FC<{ chatProps?: Partial<AltioraChatProps> }>;

/**
 * "Explain this" UI anchors (Phase 8). Place <ExplainTrigger anchorId=… /> in a
 * React tree, or call useKBAnchors(ref) to auto-inject the "?" trigger into every
 * `[data-kb-anchor]` element under a container. Clicking opens the floating chat
 * and fires the zero-query explain for that anchor.
 */
export declare const ExplainTrigger: React.FC<{ anchorId: string; anchorTitle?: string; className?: string }>;
export declare function useKBAnchors(containerRef: React.RefObject<HTMLElement>): void;

// ── Store (escape hatch) ────────────────────────────────────────────────────

export interface ChatUIState {
  loading: boolean;
  error: ChatErrorInfo | null;
  currentNode: string | null;
  composerDisabled: boolean;
  draftPanelOpen: boolean;
}

export interface ChatActions {
  addMessage(role: ChatRole, content: string, metadata?: unknown): ChatMessage;
  sendMessage(text: string, userId?: string, signal?: AbortSignal): Promise<void>;
  sendChoice(choice: unknown, echoLabel?: string, userId?: string): Promise<void>;
  /** Reply to a controls[] control (I-3). */
  sendControlAction(controlAction: unknown, echoLabel?: string, userId?: string): Promise<void>;
  /** Phase 4: zero-query explain from a UI anchor (no user bubble). */
  sendAnchorExplain(anchorContext: AnchorContext, userId?: string): Promise<void>;
  /** Phase 3/4: remember the UI anchor the chat was opened from. */
  setAnchorContext(anchorContext: AnchorContext | null): void;
  /** Set the current user profile (identity + personalized greeting). */
  setUser(profile: { userId: string; firstName?: string; displayName?: string; [key: string]: unknown }): void;
  /** Seed the greeting for the current user into an empty thread. */
  seedGreeting(): void;
  startSession(serviceId?: string | null): void;
  resetSession(): void;
  applyTurnResult(result: unknown): void;
  updateDraft(draft: DraftSR | null): void;
  patchSlot(slotId: string, value: unknown): Promise<void>;
  setCurrentNode(node: string | null): void;
  setLoading(loading: boolean): void;
  setError(error: ChatErrorInfo | null): void;
  clearError(): void;
  toggleDraftPanel(): void;
}

export interface ChatState {
  session: ChatSession;
  messages: ChatMessage[];
  draft: DraftSR;
  schema: SchemaSnapshot | null;
  ui: ChatUIState;
  actions: ChatActions;
}

export declare const useChatStore: {
  <T>(selector: (state: ChatState) => T): T;
  getState(): ChatState;
  setState(partial: Partial<ChatState>): void;
  subscribe(listener: (state: ChatState, prev: ChatState) => void): () => void;
};

export declare function useChatActions(): ChatActions;
export declare function useMessages(): ChatMessage[];
export declare function useSession(): ChatSession;
export declare function useDraft(): DraftSR;
export declare function useSchema(): SchemaSnapshot | null;
export declare function useUI(): ChatUIState;

// ── Runtime config / API client ─────────────────────────────────────────────

export interface ChatRuntimeConfig {
  apiBaseUrl: string;
  userId: string;
  getAuthHeaders: AltioraChatProps['getAuthHeaders'] | null;
  fetchImpl: typeof fetch | null;
  eventSourceImpl: typeof EventSource | null;
  onSubmitted: ((event: SubmittedEvent) => void) | null;
  onError: ((error: ChatErrorInfo) => void) | null;
  onSessionStart: ((session: ChatSession) => void) | null;
}

export declare function configureChat(config: Partial<ChatRuntimeConfig>): void;
export declare function getConfig(): ChatRuntimeConfig;

export declare class ChatError extends Error {
  constructor(code: ChatErrorCode, message: string);
  code: ChatErrorCode;
}

export interface TurnResult {
  response: string;
  choices?: unknown[] | null;
  responseType?: string;
  preamble?: string | null;
  resolveChoices?: ResolveChoices | null;
  sources?: Source[];
  state?: { serviceId?: string; status?: SessionStatus; srNumber?: string };
  executionLog?: Array<{ node: string; status?: string }> | null;
  spawnResult?: { requestId?: string } | null;
  isComplete?: boolean;
  version?: string;
  draft: DraftSR | null;
}

export interface ProgressHandlers {
  onConnected?: (data: unknown) => void;
  onTurnStart?: (data: unknown) => void;
  onNode?: (node: string, phase: 'start' | 'done', data: unknown) => void;
  onTurnDone?: (data: unknown) => void;
  onError?: (error: ChatError) => void;
}

export declare const chatClient: {
  sendMessage(
    sessionId: string,
    userId: string,
    message: string | null,
    opts?: { signal?: AbortSignal; choice?: unknown; lang?: string }
  ): Promise<TurnResult>;
  getDraft(sessionId: string): Promise<DraftSR | null>;
  getSchema(serviceId: string): Promise<SchemaSnapshot | null>;
  patchDraft(sessionId: string, patches: unknown[]): Promise<DraftSR>;
  subscribeProgress(
    sessionId: string,
    handlers?: ProgressHandlers,
    opts?: { EventSourceImpl?: typeof EventSource }
  ): () => void;
};

export declare const SSE_EVENTS: readonly string[];

// ── i18n ────────────────────────────────────────────────────────────────────

export interface LanguageDef {
  code: LanguageCode;
  label: string;
  dir: 'ltr' | 'rtl';
}

export declare const LANGUAGES: LanguageDef[];
export declare function setLang(code: LanguageCode): void;
export declare function currentLang(): string;
export declare function currentDir(): 'ltr' | 'rtl';
export declare function dirFor(code: string): 'ltr' | 'rtl';

/**
 * The component's private i18next instance — add or override translations.
 * Structurally typed rather than `import('i18next')`: i18next is bundled into
 * the package, so a consumer has no i18next types to resolve against.
 */
export interface ChatI18n {
  language: string;
  t(key: string, options?: Record<string, unknown>): string;
  changeLanguage(code: string): Promise<unknown>;
  addResourceBundle(
    lng: string,
    ns: string,
    resources: Record<string, unknown>,
    deep?: boolean,
    overwrite?: boolean
  ): unknown;
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener?: (...args: unknown[]) => void): void;
}

export declare const i18n: ChatI18n;
