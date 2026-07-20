'use strict';

/**
 * SchemaSyncService (IP-1e) — keeps the cached Altiora schemas current by
 * invalidating them when the source form changes upstream.
 *
 * Two tracks, because neither is sufficient alone (established in recon):
 *
 *   1. SignalR `ServiceFormChanged` — realtime, but Altiora broadcasts it ONLY on
 *      Create/Update of a distribution, NOT on publishing a different version
 *      (set-current). Its payload `serviceId` is actually the OrganizationUnitServiceId
 *      — our cache key — so an event maps straight to `registry.invalidate(ousId)`.
 *   2. Polling `/schema/version` — catches everything the event misses (notably
 *      set-current) by comparing the stored `contentHash` to the current one. This
 *      is the SOURCE OF TRUTH; SignalR is an optimistic accelerator on top.
 *
 * Degradation is built in: if the SignalR connection cannot be established (or the
 * client library is absent), the service runs polling-only — the guaranteed path —
 * and keeps trying to (re)connect. A single provider's poll failure never stops
 * the pass.
 *
 * Everything external is injected (the SignalR connection factory, the registry,
 * the schema client, the timer), so the dual-track logic is unit-tested with fakes;
 * the concrete `@microsoft/signalr` binding is a thin, optional adapter.
 *
 * @module instances/flowdesk/services/altiora-schema-sync
 */

const DEFAULT_POLL_MS = 5 * 60 * 1000; // 5 min

/**
 * `changedParts` values that actually alter the materialized snapshot (ratified
 * 2026-07-16: ServiceFormChanged structural parts only). Altiora emits the same
 * event family for availability / manager-only / tips changes; those do not change
 * the FORM, so they are ignored here — availability is the catalog sync's job.
 */
const RELEVANT_PARTS = new Set(['structure', 'required', 'rules', 'schema']);

/**
 * @param {object} deps
 * @param {object}   deps.registry        {listCached, markStale}
 * @param {object}   deps.schemaClient    {getSchemaVersion}
 * @param {Function} [deps.connectSignalR] async () => connection|null; connection has
 *   `.on(event, handler)`, `.onclose(handler)`, `.stop()`. Omit for polling-only.
 * @param {number}   [deps.pollIntervalMs=DEFAULT_POLL_MS]
 * @param {Function} [deps.onLog]         (info) => void
 * @param {object}   [deps.timers]        {setInterval, clearInterval} — injectable for tests
 */
function createSchemaSyncService(deps) {
  const {
    registry,
    schemaClient,
    connectSignalR = null,
    pollIntervalMs = DEFAULT_POLL_MS,
    onLog = () => {},
    timers = { setInterval, clearInterval },
  } = deps;

  let pollTimer = null;
  let connection = null;
  let running = false;

  /**
   * Mark one provider's cached form stale — LAZY invalidation (ratified): the form
   * is NOT deleted, so it keeps serving until the next `loadSnapshot` re-materializes
   * it (and a re-materialize failure never leaves a service with no schema). Safe to
   * call for an unknown ousId (markStale returns false).
   */
  async function markStaleOus(ousId, reason) {
    const flagged = await registry.markStale(ousId);
    onLog({ event: 'mark_stale', ousId, reason, flagged });
    return flagged;
  }

  /**
   * SignalR handler: `ServiceFormChanged` payload.serviceId IS the ousId. Only a
   * structural change (changedParts ∩ RELEVANT_PARTS, or an unspecified change)
   * invalidates — availability/manager-only/tips are ignored.
   */
  async function onServiceFormChanged(payload) {
    const ousId = payload && (payload.serviceId ?? payload.ServiceId);
    if (!Number.isInteger(ousId)) {
      onLog({ event: 'signalr_bad_payload', payload });
      return;
    }
    const raw = (payload && (payload.changedParts || payload.ChangedParts)) || [];
    const parts = Array.isArray(raw) ? raw.map((p) => String(p).toLowerCase()) : [];
    // Empty ⇒ can't tell what changed, refresh to be safe; else only structural parts.
    if (parts.length && !parts.some((p) => RELEVANT_PARTS.has(p))) {
      onLog({ event: 'signalr_ignored', ousId, parts });
      return;
    }
    try {
      await markStaleOus(ousId, 'signalr');
    } catch (err) {
      onLog({ event: 'mark_stale_error', ousId, source: 'signalr', message: err.message });
    }
  }

  /**
   * The guaranteed track: compare each cached schema's stored hash to Altiora's
   * current one, invalidating on mismatch. Returns a small summary for tests.
   */
  async function pollOnce() {
    let cached;
    try {
      cached = await registry.listCached();
    } catch (err) {
      onLog({ event: 'poll_list_error', message: err.message });
      return { checked: 0, stale: 0, errors: 1 };
    }

    let stale = 0;
    let errors = 0;
    for (const entry of cached) {
      try {
        const version = await schemaClient.getSchemaVersion(entry.ousId);
        // No published schema upstream any more, or the hash moved → stale.
        const currentHash = version && version.contentHash;
        if (currentHash !== entry.contentHash) {
          await markStaleOus(entry.ousId, 'poll');
          stale += 1;
        }
      } catch (err) {
        // One provider's failure must not abort the whole pass.
        errors += 1;
        onLog({ event: 'poll_check_error', ousId: entry.ousId, message: err.message });
      }
    }
    onLog({ event: 'poll_done', checked: cached.length, stale, errors });
    return { checked: cached.length, stale, errors };
  }

  async function tryConnectSignalR() {
    if (!connectSignalR) return; // polling-only by configuration
    try {
      connection = await connectSignalR();
      if (!connection) { onLog({ event: 'signalr_unavailable' }); return; }
      connection.on('ServiceFormChanged', (p) => { onServiceFormChanged(p); });
      if (typeof connection.onclose === 'function') {
        connection.onclose(() => {
          onLog({ event: 'signalr_closed' });
          connection = null;
          // Polling continues regardless; a reconnect is attempted on the next poll.
        });
      }
      onLog({ event: 'signalr_connected' });
    } catch (err) {
      connection = null;
      onLog({ event: 'signalr_connect_failed', message: err.message });
    }
  }

  async function start() {
    if (running) return;
    running = true;
    await tryConnectSignalR();
    pollTimer = timers.setInterval(() => {
      // Opportunistically (re)establish SignalR if it dropped; polling stands alone.
      if (connectSignalR && !connection) tryConnectSignalR();
      pollOnce();
    }, pollIntervalMs);
    onLog({ event: 'started', pollIntervalMs, signalr: !!connection });
  }

  async function stop() {
    if (!running) return;
    running = false;
    if (pollTimer) { timers.clearInterval(pollTimer); pollTimer = null; }
    if (connection && typeof connection.stop === 'function') {
      try { await connection.stop(); } catch { /* best effort */ }
    }
    connection = null;
    onLog({ event: 'stopped' });
  }

  return {
    start,
    stop,
    pollOnce,
    onServiceFormChanged, // exposed for tests + direct dispatch
    isRunning: () => running,
    signalrConnected: () => !!connection,
  };
}

// ── default (production) bindings ─────────────────────────────────────────────

/**
 * Build a SignalR connection to Altiora's notification hub, or return null when
 * the client library is not installed (→ the service runs polling-only). Any
 * construction/handshake failure → null (polling is the guaranteed track).
 *
 * Auth (ratified): a BACKGROUND connection has no acting user, so it presents the
 * SERVICE-account bearer via `accessTokenFactory`. With WebSocket transport +
 * skipNegotiation the client rides the token as `?access_token=`, which Altiora's
 * `AllowsQueryToken` permits for `/api/notificationHub`. (The prior binding used
 * `getActingToken()`, which is empty off-request — the hub is `[Authorize]`, so
 * that connection could never authenticate.)
 */
function defaultConnectSignalR() {
  let signalR;
  try {
    // Optional dependency: absent in environments not deployed behind Altiora.
    // eslint-disable-next-line global-require, import/no-unresolved
    signalR = require('@microsoft/signalr');
  } catch {
    return null;
  }
  const base = process.env.ALTIORA_API_BASE || 'http://localhost:5000';
  const hubUrl = `${base.replace(/\/+$/, '')}/api/notificationHub`;
  try {
    const { createServiceTokenProvider } = require('./altiora-client');
    const getServiceToken = createServiceTokenProvider();
    const conn = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => getServiceToken(),
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();
    return conn.start().then(() => conn);
  } catch {
    return null;
  }
}

/** Wire the sync service to the real registry, schema client and Altiora hub. */
function createDefaultSchemaSyncService() {
  const registry = require('./altiora-schema-registry');
  const { getAltioraSchemaClient } = require('./altiora-schema-client');
  const pollSeconds = Number(process.env.FLOWDESK_SCHEMA_SYNC_POLL_INTERVAL || 300);
  const signalrEnabled = String(process.env.FLOWDESK_SCHEMA_SYNC_SIGNALR_ENABLED || 'true') !== 'false';

  const svc = createSchemaSyncService({
    registry: { listCached: registry.listCached, markStale: registry.markStale },
    schemaClient: getAltioraSchemaClient(),
    connectSignalR: signalrEnabled ? defaultConnectSignalR : null,
    pollIntervalMs: Math.max(30, pollSeconds) * 1000,
    onLog: (info) => {
      console.log('[schema-sync]', JSON.stringify(info));
      // ADMIN P0: the events were console-only — persist them so the admin
      // section's Sync history is real. Best-effort by contract.
      try { require('./admin-telemetry.service').recordSyncEvent(info); } catch { /* optional */ }
    },
  });
  _active = svc; // ADMIN P0: expose the running instance to the admin API
  return svc;
}

// ── active-instance registry (ADMIN P0) ──────────────────────────────────────
// index.js creates the sync service as a local variable; the admin endpoints
// (GET /admin/sync/status, POST /admin/sync/poll) need to reach it.
let _active = null;
function getActiveSyncService() { return _active; }
function setActiveSyncService(svc) { _active = svc; }

module.exports = {
  createSchemaSyncService, createDefaultSchemaSyncService, DEFAULT_POLL_MS,
  getActiveSyncService, setActiveSyncService,
};
