'use strict';

/**
 * AltioraClient (I-1) — the single HTTP client for OUTBOUND calls from the chat to
 * the Altiora .NET API (service catalog, distribution/detect, form schema, LOV,
 * directory, ticket creation).
 *
 * Direction matters. The proxy model covers the INBOUND leg only:
 *   User → Altiora Portal → embedded chat UI → /api/proxy/unpa/* → chat API,
 * where `UnpaProxyController` injects X-FlowDesk-User-* identity headers (consumed
 * by `middleware/flowdesk-user.middleware.js`). This client is the OTHER leg — the
 * chat calling back into Altiora — and that leg must authenticate itself.
 *
 * Altiora guards every /api request with TWO gates:
 *   1. `API-Key` header, validated against the API_Clients table;
 *   2. `[Authorize]` bearer whose claims must resolve to a real user (`oid`/`sub`).
 *      App-only tokens are rejected — there is always an acting user.
 *
 * The bearer therefore comes from a pluggable `tokenProvider`, because the right
 * acting identity depends on the caller:
 *   - in-turn calls (catalog search, detect, schema fetch, directory, ticket create)
 *     should act as the END USER, which keeps Altiora's permission scoping correct
 *     and lets a ticket be created by its own requester (no HelpdeskExecute needed);
 *   - background jobs (catalog→Qdrant sync, schema TTL refresh, SignalR) have no user
 *     request in flight and act as the service account.
 *
 * Pass `token` per call to override the provider for that request.
 *
 * @module instances/flowdesk/services/altiora-client
 */

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;
// Refresh a cached service token this long before it actually expires.
const TOKEN_SKEW_MS = 60_000;

/** Base error carrying the HTTP status and parsed Altiora body. */
class AltioraError extends Error {
  constructor(message, { status = null, body = null, code = 'ALTIORA_ERROR' } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.body = body;
    this.code = code;
  }
}
/** 401/403 — bad/absent API-Key, missing bearer, or a token with no user identity. */
class AltioraAuthError extends AltioraError {
  constructor(message, opts) { super(message, { ...opts, code: 'ALTIORA_AUTH' }); }
}
/** 400 — Altiora returns `{ ErrorCode, ClientErrorCode, Message }` on integration failure. */
class AltioraValidationError extends AltioraError {
  constructor(message, opts) { super(message, { ...opts, code: 'ALTIORA_VALIDATION' }); }
}
/** 404 — e.g. no published schema for an OrganizationUnitServiceId. */
class AltioraNotFoundError extends AltioraError {
  constructor(message, opts) { super(message, { ...opts, code: 'ALTIORA_NOT_FOUND' }); }
}
/** 5xx after retries. */
class AltioraServerError extends AltioraError {
  constructor(message, opts) { super(message, { ...opts, code: 'ALTIORA_SERVER' }); }
}
/** Network failure / timeout — Altiora unreachable. */
class AltioraUnavailableError extends AltioraError {
  constructor(message, opts) { super(message, { ...opts, code: 'ALTIORA_UNAVAILABLE' }); }
}

/** Reads `exp` out of a JWT payload without verifying it (we only need the lifetime). */
function readJwtExpiryMs(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const { exp } = JSON.parse(json);
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function buildUrl(baseUrl, path, query) {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${String(path).replace(/^\/+/, '')}`);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function errorFor(status, message, body) {
  if (status === 401 || status === 403) return new AltioraAuthError(message, { status, body });
  if (status === 404) return new AltioraNotFoundError(message, { status, body });
  if (status >= 500) return new AltioraServerError(message, { status, body });
  return new AltioraValidationError(message, { status, body });
}

/**
 * Service-account bearer provider (dev: LocalJwt). Logs in via
 * `POST /api/auth/login {email,password}` and caches the token until just before
 * it expires. Used ONLY by background work with no user request in flight.
 */
function createServiceTokenProvider({
  baseUrl = process.env.ALTIORA_API_BASE,
  apiKey = process.env.ALTIORA_API_KEY,
  email = process.env.ALTIORA_SERVICE_EMAIL,
  password = process.env.ALTIORA_SERVICE_PASSWORD,
  fetchImpl = globalThis.fetch,
} = {}) {
  let cached = null;      // { token, expiresAtMs }
  let inFlight = null;    // de-dupe concurrent logins
  let keyOnly = false;    // login endpoint absent (Release) → send API-Key only
  let keyOnlyWarned = false;
  // A pre-supplied bearer (e.g. an Azure-AD token for the remote Altiora) skips login.
  const staticToken = (process.env.ALTIORA_API_TOKEN || '').trim() || null;

  async function login() {
    const res = await fetchImpl(buildUrl(baseUrl, '/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'API-Key': apiKey },
      body: JSON.stringify({ email, password }),
    });
    // Release Altiora compiles /api/auth/login under #if DEBUG → it is absent (404).
    // The shared API-Key authenticates on its own (ApiKeyMiddleware issues a service
    // principal), so drop to key-only: return no bearer instead of failing.
    if (res.status === 404) {
      keyOnly = true;
      if (!keyOnlyWarned) {
        keyOnlyWarned = true;
        console.warn('[altiora-client] /api/auth/login not found (404) — authenticating with API-Key only (no bearer).');
      }
      return null;
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      throw errorFor(res.status, `Altiora service login failed (${res.status})`, body);
    }
    const token = body && body.token;
    if (!token) throw new AltioraAuthError('Altiora login returned no token', { status: res.status, body });

    const expMs = readJwtExpiryMs(token);
    cached = { token, expiresAtMs: expMs ? expMs - TOKEN_SKEW_MS : Date.now() + 60_000 };
    return token;
  }

  return async function getServiceToken() {
    if (staticToken) return staticToken;
    if (keyOnly) return null; // key-only mode: client sends API-Key without a bearer
    if (cached && Date.now() < cached.expiresAtMs) return cached.token;
    if (!inFlight) inFlight = login().finally(() => { inFlight = null; });
    return inFlight;
  };
}

/**
 * @param {object} deps
 * @param {string} deps.baseUrl        Altiora origin, e.g. http://localhost:5000 (paths include /api/...)
 * @param {string} deps.apiKey         Gate 1 — sent as `API-Key` on every request
 * @param {Function} [deps.tokenProvider] async () => bearer; omit to send no bearer by default
 */
function createAltioraClient({
  baseUrl = process.env.ALTIORA_API_BASE,
  apiKey = process.env.ALTIORA_API_KEY,
  tokenProvider = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
} = {}) {
  if (!baseUrl) throw new Error('AltioraClient: baseUrl (ALTIORA_API_BASE) is required');

  /**
   * DOC-1-003 added two shapes this originally could not express, and both are
   * about files.
   *
   * `formData` — a multipart upload. The Content-Type is NOT set here on
   * purpose: multipart needs a boundary, fetch derives one from the FormData
   * instance, and a hand-written `multipart/form-data` header loses it and
   * makes the server fail to parse a request that looks correct.
   *
   * `raw` — a response that is bytes, not JSON. The default path calls
   * `res.text()`, which decodes as UTF-8 and silently corrupts a PDF.
   *
   * Both ride THROUGH here rather than around it so uploads and downloads get
   * the same timeout, the same typed errors and the same telemetry as every
   * other Altiora call — the alternative was a second `fetch` path whose
   * failures would be invisible in exactly the traffic most likely to fail.
   */
  async function once(method, path, { query, body, token, signal, formData, raw } = {}) {
    const headers = { Accept: raw ? '*/*' : 'application/json' };
    if (apiKey) headers['API-Key'] = apiKey;

    const bearer = token !== undefined ? token : (tokenProvider ? await tokenProvider() : null);
    if (bearer) headers.Authorization = `Bearer ${bearer}`;
    if (body !== undefined && !formData) headers['Content-Type'] = 'application/json';

    // Own timeout, but honour a caller's abort too.
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const onAbort = () => ctl.abort();
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    let res;
    try {
      res = await fetchImpl(buildUrl(baseUrl, path, query), {
        method,
        headers,
        body: formData !== undefined ? formData
          : (body === undefined ? undefined : JSON.stringify(body)),
        signal: ctl.signal,
      });
    } catch (err) {
      throw new AltioraUnavailableError(
        `Altiora unreachable: ${method} ${path} — ${err.message}`, { body: null });
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    // A failed binary request still carries a text explanation, so the error
    // path reads the body as text either way and only a 2xx is taken as bytes.
    if (raw && res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      return buf;
    }

    const text = await res.text().catch(() => '');
    let parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }

    if (!res.ok) {
      const msg = (parsed && (parsed.Message || parsed.message || parsed.error)) || `HTTP ${res.status}`;
      throw errorFor(res.status, `Altiora ${method} ${path} failed: ${msg}`, parsed);
    }
    return parsed;
  }

  /**
   * Retries only what is safe to replay: transient transport/5xx failures on
   * idempotent methods. A 4xx is a verdict, not a blip — never retried. POST
   * (ticket creation) is never auto-replayed, to avoid duplicate tickets.
   */
  /**
   * Every Altiora round trip is timed into the turn in flight (best-effort, and
   * only when there IS one). This is the single place they all pass through, so
   * instrumenting it here is what makes "where did the turn go" answerable
   * without threading a timer through a dozen services.
   *
   * The name is the method plus the first two path segments — enough to tell
   * `GET /api/Schema` from `POST /api/tickets`, without turning every record id
   * into its own row.
   */
  function spanName(method, path) {
    const clean = String(path || '').split('?')[0].split('/').filter(Boolean).slice(0, 2).join('/');
    return `${method} /${clean}`;
  }

  async function request(method, path, opts = {}) {
    const idempotent = method === 'GET' || method === 'HEAD';
    const attempts = idempotent ? retries + 1 : 1;

    let lastErr;
    for (let i = 0; i < attempts; i++) {
      const t0 = Date.now();
      try {
        const out = await once(method, path, opts);
        try {
          require('./chat-telemetry.service').recordSpan({
            kind: 'altiora', name: spanName(method, path), durationMs: Date.now() - t0, status: 'success',
          });
        } catch { /* telemetry never breaks a request */ }
        return out;
      } catch (err) {
        try {
          require('./chat-telemetry.service').recordSpan({
            kind: 'altiora', name: spanName(method, path), durationMs: Date.now() - t0,
            status: 'error', detail: err && err.message,
          });
        } catch { /* as above */ }
        lastErr = err;
        const transient = err instanceof AltioraUnavailableError || err instanceof AltioraServerError;
        if (!transient || i === attempts - 1) throw err;
        await new Promise((r) => setTimeout(r, 200 * 2 ** i)); // 200ms, 400ms
      }
    }
    throw lastErr;
  }

  /**
   * DOC-1-003 — attachments.
   *
   * Four calls against Altiora's own `AttachmentsController`, deliberately the
   * multipart route rather than the base64-in-JSON one that `POST /api/tickets`
   * also accepts. Only the multipart route runs Altiora's validation: extension
   * allow-list, magic-number check, unsafe-SVG check, and rejection of a PDF
   * carrying JavaScript. The JSON route persists whatever it is handed. We are
   * putting user-supplied files into a UN ticketing system; taking the checked
   * door is not optional, even though Altiora's own frontend does not.
   *
   * NONE OF THESE ARE RETRIED, and that is correct rather than an oversight.
   * `request` replays GET/HEAD only. An upload is a POST whose handler runs
   * `Guid.NewGuid()` per call, so a replayed upload does not overwrite — it
   * creates a SECOND attachment with the same bytes. Since a transport failure
   * cannot be distinguished from a lost response, retrying trades a visible
   * error for a silent duplicate on the user's ticket. Telemetry and typed
   * errors still apply, because these go through `request`.
   */
  const ATTACHMENT_KIND = Object.freeze({
    Ticket: 1, Task: 2, Message: 3, Avatar: 4, Template: 5, Chat: 6,
  });

  /** Accepts 'Chat' or 6; the route wants the numeric enum value. */
  function kindValue(kind) {
    if (typeof kind === 'number') return kind;
    const v = ATTACHMENT_KIND[kind];
    if (!v) throw new Error(`AltioraClient: unknown attachment kind "${kind}"`);
    return v;
  }

  /**
   * Upload a file. For chat staging use kind 'Chat' with the sessionId as
   * `ownerId` — the owner need not exist yet, which is how a file can be
   * attached before the ticket it will belong to has been created.
   *
   * @param {string|null} token acting-user bearer; null falls back to the provider
   * @param {{kind:string|number, ownerId:string, file:Buffer, fileName:string,
   *          contentType:string, notes?:string, tag?:string, signal?:AbortSignal}} o
   * @returns {Promise<object>} the created FileAttachment (no FileData)
   */
  function uploadAttachment(token, o = {}) {
    const { kind, ownerId, file, fileName, contentType, notes, tag, signal } = o;
    if (!Buffer.isBuffer(file)) throw new Error('AltioraClient.uploadAttachment: file must be a Buffer');
    if (!fileName) throw new Error('AltioraClient.uploadAttachment: fileName is required');
    if (!ownerId) throw new Error('AltioraClient.uploadAttachment: ownerId is required');

    // Native FormData/Blob (Node 18+) — no `form-data` package needed. The field
    // names match UploadFileDto's properties; ASP.NET binds them case-insensitively.
    const form = new FormData();
    form.append('File', new Blob([file], { type: contentType || 'application/octet-stream' }), fileName);
    if (notes) form.append('Notes', notes);

    return request('POST', `/api/Attachments/${kindValue(kind)}/${encodeURIComponent(ownerId)}`, {
      formData: form,
      ...(tag ? { query: { tag } } : {}),
      token,
      signal,
    });
  }

  /**
   * Re-own an existing attachment — the step that moves a chat-staged file onto
   * the ticket once it exists. Altiora COPIES the bytes to a new attachment
   * rather than moving them, so the staged original survives and is still
   * reachable until the session's staging is cleaned up.
   *
   * @param {string|null} token
   * @param {{kind:string|number, ownerId:string, sourceAttachmentId:string, signal?:AbortSignal}} o
   */
  function linkAttachment(token, o = {}) {
    const { kind, ownerId, sourceAttachmentId, signal } = o;
    if (!ownerId) throw new Error('AltioraClient.linkAttachment: ownerId is required');
    if (!sourceAttachmentId) throw new Error('AltioraClient.linkAttachment: sourceAttachmentId is required');

    return request(
      'POST',
      `/api/Attachments/${kindValue(kind)}/${encodeURIComponent(ownerId)}/link/${encodeURIComponent(sourceAttachmentId)}`,
      { token, signal },
    );
  }

  /**
   * Fetch the bytes back — what extraction reads before building a content
   * block. Returns a Buffer; see `raw` in `once` for why that is not the
   * default path.
   */
  function downloadAttachment(token, attachmentId, o = {}) {
    if (!attachmentId) throw new Error('AltioraClient.downloadAttachment: attachmentId is required');
    return request('GET', `/api/Attachments/${encodeURIComponent(attachmentId)}/content`, {
      raw: true, token, signal: o.signal,
    });
  }

  /**
   * Retire an attachment.
   *
   * SOFT delete on Altiora's side: `IsDeleted = 1` with `DeletedBy`/`DeletedAt`
   * stamped from the bearer (AttachmentRepository.DeleteAsync). The row and its
   * bytes stay in the table, so this hides a file from listings and records who
   * hid it — it does NOT reclaim storage. Anything that needs the space back
   * needs a change on Altiora's side.
   *
   * Not retried: DELETE is not GET/HEAD, so `request` runs it once. A repeat
   * would answer 404 anyway, the row already being marked.
   */
  function deleteAttachment(token, attachmentId, o = {}) {
    if (!attachmentId) throw new Error('AltioraClient.deleteAttachment: attachmentId is required');
    return request('DELETE', `/api/Attachments/${encodeURIComponent(attachmentId)}`, {
      token, signal: o.signal,
    });
  }

  /**
   * Altiora's live upload limits: allowed extensions and per-type max size.
   *
   * Read rather than hardcoded because the underlying `AllowedFileTypes` table
   * is editable in Altiora — a limit copied into our code is a limit that goes
   * stale silently. The endpoint is `[AllowAnonymous]`, hence `token: null`.
   */
  function getAttachmentConfig(o = {}) {
    return request('GET', '/api/Attachments/config', { token: null, signal: o.signal });
  }

  return {
    request,
    get:   (path, opts)       => request('GET', path, opts),
    post:  (path, body, opts) => request('POST', path, { ...opts, body }),
    put:   (path, body, opts) => request('PUT', path, { ...opts, body }),
    patch: (path, body, opts) => request('PATCH', path, { ...opts, body }),
    del:   (path, opts)       => request('DELETE', path, opts),

    // DOC-1-003
    ATTACHMENT_KIND,
    uploadAttachment,
    linkAttachment,
    downloadAttachment,
    getAttachmentConfig,
    // DOC-1-005
    deleteAttachment,
  };
}

/**
 * Picks the acting identity automatically: the end user's own bearer when a request is in
 * flight (injected by Altiora's proxy — see acting-user.context), otherwise the service
 * account for background work.
 *
 * The fallback is deliberate, not a safety net: background jobs legitimately have no user.
 * Anything that MUST act as a specific identity should pass `token` per call instead of
 * relying on ambient context.
 */
function createActingTokenProvider(serviceTokenProvider = createServiceTokenProvider()) {
  // Required lazily: this module is also used by the middleware's dependency chain.
  const { getActingToken } = require('./acting-user.context');
  return async function getToken() {
    return getActingToken() || serviceTokenProvider();
  };
}

let singleton = null;
/**
 * Process-wide client. Acts as the end user inside a request, as the service account
 * outside one.
 */
function getAltioraClient() {
  if (!singleton) {
    singleton = createAltioraClient({ tokenProvider: createActingTokenProvider() });
  }
  return singleton;
}

module.exports = {
  createAltioraClient,
  createServiceTokenProvider,
  createActingTokenProvider,
  getAltioraClient,
  AltioraError,
  AltioraAuthError,
  AltioraValidationError,
  AltioraNotFoundError,
  AltioraServerError,
  AltioraUnavailableError,
};
