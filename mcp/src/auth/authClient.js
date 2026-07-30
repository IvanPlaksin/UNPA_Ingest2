/**
 * authClient — framework-agnostic token/session core for the SPA login gate.
 *
 * Stores access + refresh JWTs in localStorage, refreshes proactively (timer)
 * and reactively (on 401, via authGlobal interceptors), and exposes a tiny
 * pub-sub so React can subscribe with useSyncExternalStore.
 *
 * Auth network calls use the ORIGINAL fetch captured at module load, so they are
 * never intercepted by the global token-injecting fetch wrapper in authGlobal.
 */

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3010/api/v1').replace(/\/$/, '');
const LS_ACCESS = 'unpa_access';
const LS_REFRESH = 'unpa_refresh';
const SKEW_MS = 10_000;

const rawFetch = window.fetch.bind(window);

let state = { status: 'loading', user: null }; // status: loading | anon | authed
const listeners = new Set();
let refreshTimer = null;
let refreshPromise = null;

function emit() {
  for (const l of listeners) l();
}
function setState(next) {
  state = { ...state, ...next };
  emit();
}
function subscribe(l) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function getSnapshot() {
  return state;
}

// ── token helpers ────────────────────────────────────────────────────
function decodePayload(token) {
  try {
    const seg = token.split('.')[1];
    const json = atob(seg.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function expMs(token) {
  const p = decodePayload(token);
  return p && p.exp ? p.exp * 1000 : 0;
}
function getAccess() {
  return localStorage.getItem(LS_ACCESS) || '';
}
function getRefresh() {
  return localStorage.getItem(LS_REFRESH) || '';
}
function accessValid() {
  const t = getAccess();
  return !!t && expMs(t) - Date.now() > SKEW_MS;
}

function setTokens(data) {
  if (data.accessToken) localStorage.setItem(LS_ACCESS, data.accessToken);
  if (data.refreshToken) localStorage.setItem(LS_REFRESH, data.refreshToken);
  const p = decodePayload(getAccess());
  setState({ status: 'authed', user: { username: (p && p.sub) || 'user' } });
  scheduleRefresh();
}

function clearTokens() {
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_REFRESH);
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  setState({ status: 'anon', user: null });
}

// ── refresh scheduling ───────────────────────────────────────────────
function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const t = getAccess();
  if (!t) return;
  const lead = expMs(t) - Date.now() - 60_000; // refresh ~60s before expiry
  if (lead <= 0) {
    refresh().catch(() => {});
    return;
  }
  refreshTimer = setTimeout(() => refresh().catch(() => {}), Math.min(lead, 2 ** 31 - 1));
}

// ── network ──────────────────────────────────────────────────────────
async function login(username, password) {
  const res = await rawFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    let msg = 'Login failed';
    try {
      msg = (await res.json()).error || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  setTokens(await res.json());
  return true;
}

async function doRefresh() {
  const rt = getRefresh();
  if (!rt) throw new Error('no refresh token');
  const res = await rawFetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: rt }),
  });
  if (!res.ok) throw new Error('refresh failed');
  const data = await res.json();
  setTokens(data);
  return data.accessToken;
}

/** Deduplicated refresh — concurrent callers share one in-flight request. */
function refresh() {
  if (!refreshPromise) {
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

/** Return a valid access token, refreshing if needed; null if unauthenticated. */
async function ensureFresh() {
  if (accessValid()) return getAccess();
  if (!getRefresh()) return null;
  try {
    return await refresh();
  } catch {
    return null;
  }
}

async function logout() {
  try {
    await rawFetch(`${API_BASE}/auth/logout`, { method: 'POST' });
  } catch {
    /* best-effort */
  }
  clearTokens();
}

/** Restore session on app load: use a valid access token, else try refresh. */
async function bootstrap() {
  if (accessValid()) {
    const p = decodePayload(getAccess());
    setState({ status: 'authed', user: { username: (p && p.sub) || 'user' } });
    scheduleRefresh();
    return;
  }
  if (getRefresh()) {
    try {
      await refresh();
      return;
    } catch {
      /* fall through to anon */
    }
  }
  clearTokens();
}

/** Should the Authorization header be attached to this URL? (only our API) */
function isApiUrl(url) {
  if (!url) return false;
  if (url.startsWith('/')) return true; // same-origin relative
  try {
    const target = new URL(url, window.location.origin);
    const apiOrigin = new URL(API_BASE, window.location.origin).origin;
    return target.origin === apiOrigin;
  } catch {
    return false;
  }
}

export default {
  API_BASE,
  subscribe,
  getSnapshot,
  login,
  logout,
  refresh,
  ensureFresh,
  accessValid,
  getAccess,
  isApiUrl,
  bootstrap,
};
