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
    executionLog?: Array<{ node: string; status?: string }> | null;
    srNumber?: string | null;
    isComplete?: boolean;
  } | null;
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
}

/**
 * AltioraChat — conversational service-request intake.
 *
 * The root element is absolutely positioned (inset: 0), so it fills the nearest
 * positioned ancestor: give it a wrapper with `position: relative` and a height.
 */
export declare const AltioraChat: React.FC<AltioraChatProps>;
export default AltioraChat;

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
