/**
 * Runtime configuration for the packaged FlowDesk Chat V2 component.
 *
 * In its original home the API base URL arrived as a build-time import
 * (`config/api.config`), which cannot survive extraction into a distributable
 * package: the host app owns that value. Here it is injected at runtime from
 * <AltioraChat apiBaseUrl=… /> before the first request is issued.
 *
 * Module-level (not React context) on purpose: the Zustand store calls the API
 * client outside the React tree, so a context would not be reachable from it.
 */

const DEFAULTS = {
  apiBaseUrl: '',
  userId: 'fdv2-demo-user',
  getAuthHeaders: null,
  fetchImpl: null,
  eventSourceImpl: null,
  onSubmitted: null,
  onError: null,
  onSessionStart: null,
  // REQ-005 — the host opens its own detail dialog when a row in the chat is clicked.
  // Declared here because `configureChat` copies only the keys it already knows: a
  // callback the host passes and this list does not name is dropped without a word,
  // and the rows would simply never open.
  onReveal: null,
  // Host's own dev/prod flag (e.g. import.meta.env.DEV) — NOT this package's own build
  // mode, which is baked in as "production" once bundled regardless of who consumes it.
  debug: false,
};

let config = { ...DEFAULTS };

/** Replace the live config. Called by <AltioraChat> on every render (cheap, idempotent). */
export function configureChat(next = {}) {
  const merged = { ...DEFAULTS };
  for (const key of Object.keys(DEFAULTS)) {
    if (next[key] !== undefined && next[key] !== null) merged[key] = next[key];
  }
  config = merged;
}

export function getConfig() {
  return config;
}

/** Build an absolute endpoint URL. Trailing slashes on apiBaseUrl are tolerated. */
export function apiUrl(path) {
  const base = (config.apiBaseUrl || '').replace(/\/+$/, '');
  if (!base) {
    throw new Error(
      '[altiora-chat] apiBaseUrl is not configured. Pass it to <AltioraChat apiBaseUrl="https://host/api/v1" />.'
    );
  }
  return `${base}${path}`;
}

/** The fetch to use — the host may inject one that carries auth/retry/tracing. */
export function getFetch() {
  return config.fetchImpl || globalThis.fetch.bind(globalThis);
}

/**
 * Headers for an API call. getAuthHeaders may be sync or async so the host can
 * refresh a token lazily (MSAL et al. hand out promises).
 */
export async function buildHeaders(extra = {}) {
  const auth = typeof config.getAuthHeaders === 'function' ? await config.getAuthHeaders() : null;
  return { ...extra, ...(auth || {}) };
}

/** Fire a host callback without letting a consumer bug break the chat turn. */
export function emit(name, ...args) {
  const fn = config[name];
  if (typeof fn !== 'function') return;
  try {
    fn(...args);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`[flowdesk-chat-v2] ${name} callback threw:`, e);
  }
}
