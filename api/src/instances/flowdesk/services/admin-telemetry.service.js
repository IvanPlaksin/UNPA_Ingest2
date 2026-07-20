'use strict';

/**
 * Admin telemetry (ADMIN P0) — durable history for the integration-health views.
 * The schema-sync service's rich onLog events and catalog-sync run results were
 * ephemeral console lines; the admin section needs them queryable.
 *
 * Nodes (Memgraph, pruned by the chat-session sweeper's retention pass):
 *   (:FlowdeskSyncEvent {ts, event, ousId?, reason?, detail})
 *   (:FlowdeskCatalogSyncRun {startedAt, finishedAt, fetched, upserted, purged, error?, trigger})
 *
 * Every write is best-effort — telemetry must never break the sync it observes.
 *
 * @module instances/flowdesk/services/admin-telemetry.service
 */

let _write = null;
let _read = null;
function w() { if (!_write) _write = require('../schema-graph/driver').write; return _write; }
function r() { if (!_read) _read = require('../schema-graph/driver').read; return _read; }

const enabled = () => String(process.env.FLOWDESK_CHAT_TELEMETRY || 'true') !== 'false';

/** Persist one schema-sync onLog event (mark_stale, poll_done, signalr_*, …). */
async function recordSyncEvent(info) {
  if (!enabled() || !info || !info.event) return;
  try {
    const { event, ousId, reason, ...rest } = info;
    await w()(
      `CREATE (:FlowdeskSyncEvent {ts:$ts, event:$event, ousId:$ousId, reason:$reason, detail:$detail})`,
      {
        ts: new Date().toISOString(), event: String(event),
        ousId: ousId != null ? Number(ousId) : null,
        reason: reason || null,
        detail: Object.keys(rest).length ? JSON.stringify(rest).slice(0, 2000) : null,
      }
    );
  } catch (err) {
    console.warn('[admin-telemetry] recordSyncEvent failed:', err.message);
  }
}

/** Persist a catalog-sync run result ({fetched, upserted, purged} or an error). */
async function recordCatalogSyncRun({ startedAt, finishedAt, fetched, upserted, purged, error, trigger }) {
  if (!enabled()) return;
  try {
    await w()(
      `CREATE (:FlowdeskCatalogSyncRun {startedAt:$startedAt, finishedAt:$finishedAt,
         fetched:$fetched, upserted:$upserted, purged:$purged, error:$error, trigger:$trigger})`,
      {
        startedAt: startedAt || new Date().toISOString(),
        finishedAt: finishedAt || new Date().toISOString(),
        fetched: fetched ?? null, upserted: upserted ?? null, purged: purged ?? null,
        error: error || null, trigger: trigger || 'manual',
      }
    );
  } catch (err) {
    console.warn('[admin-telemetry] recordCatalogSyncRun failed:', err.message);
  }
}

/** Query sync events, newest first. */
async function listSyncEvents({ event, from, to, limit = 200 } = {}) {
  const { neo4j } = require('../schema-graph/driver');
  const conds = [];
  const params = { limit: neo4j.int(Math.min(Math.max(1, Number(limit) || 200), 1000)) };
  if (event) { conds.push('e.event = $event'); params.event = event; }
  if (from) { conds.push('e.ts >= $from'); params.from = from; }
  if (to) { conds.push('e.ts <= $to'); params.to = to; }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await r()(
    `MATCH (e:FlowdeskSyncEvent) ${where}
     RETURN e ORDER BY e.ts DESC LIMIT $limit`, params);
  return rows.map((row) => {
    const p = row.get('e').properties;
    return { ...p, detail: p.detail ? safeParse(p.detail) : null };
  });
}

/** Query catalog-sync runs, newest first. */
async function listCatalogSyncRuns({ limit = 50 } = {}) {
  const { neo4j } = require('../schema-graph/driver');
  const rows = await r()(
    `MATCH (c:FlowdeskCatalogSyncRun) RETURN c ORDER BY c.startedAt DESC LIMIT $limit`,
    { limit: neo4j.int(Math.min(Math.max(1, Number(limit) || 50), 500)) });
  return rows.map((row) => row.get('c').properties);
}

function safeParse(s) { try { return JSON.parse(s); } catch { return s; } }

/** Test seam. */
function _setDeps({ write, read } = {}) { _write = write || null; _read = read || null; }

module.exports = { recordSyncEvent, recordCatalogSyncRun, listSyncEvents, listCatalogSyncRuns, _setDeps };
