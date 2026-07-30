'use strict';

/**
 * Chat session sweeper (ADMIN P0) — the background job that makes silent failure
 * VISIBLE. Without it, a session the user simply walked away from leaves no
 * record at all (the Redis draft TTL-expires unobserved) — the single biggest
 * blind spot found in the admin-section research.
 *
 * Every sweep (default 15 min):
 *   1. ABANDONMENT (ratified: 2h inactivity, before the 24h draft TTL):
 *      non-terminal ChatSessions idle past the window → outcome 'abandoned'.
 *      The final DraftSR is snapshotted onto the session node while it is still
 *      in Redis, so the admin UI can show what state the user gave up in.
 *   2. PARKED_ABANDONED: 'parked' sessions never resumed within the draft TTL.
 *   3. RETENTION (ratified: 90 days): ChatTurn/ChatSession older than
 *      FLOWDESK_CHAT_LOG_RETENTION_DAYS are deleted; FlowdeskSyncEvent and
 *      FlowdeskCatalogSyncRun likewise.
 *   4. JSONL RETENTION: the logs/chat/chat-turns-*.jsonl firehose is aged out on
 *      the same horizon. Until this pass existed, retention deleted the graph
 *      copy while the JSONL kept the same personal data (user names, free-text
 *      utterances, the final draft) on disk forever — so the stated 90 days was
 *      only true of one of the two stores.
 *
 * All work is idempotent and best-effort — a sweep failure logs and waits for
 * the next tick.
 *
 * @module instances/flowdesk/services/chat-session-sweeper.service
 */

const fsDefault = require('fs');
const pathDefault = require('path');

const DEFAULTS = {
  intervalMinutes: 15,
  abandonMinutes: 120,   // ratified 2026-07-16
  parkedTtlHours: 24,    // = draft TTL
  retentionDays: 90,     // ratified 2026-07-16
};

function envNum(name, dflt) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
}

function createChatSessionSweeper(deps = {}) {
  const write = deps.write || require('../schema-graph/driver').write;
  const read = deps.read || require('../schema-graph/driver').read;
  const getDraft = deps.getDraft || ((sessionId) => require('./draft-sr.service').getDraftSRService().get(sessionId));
  const now = deps.now || (() => Date.now());
  const timers = deps.timers || { setInterval, clearInterval };
  const log = deps.log || ((...a) => console.log('[chat-sweeper]', ...a));
  const fs = deps.fs || fsDefault;
  // Must match where chat-telemetry appends the firehose, or the pass sweeps nothing.
  const logDir = deps.logDir || pathDefault.join(process.cwd(), 'logs', 'chat');

  let timer = null;
  let running = false;
  let lastRun = null;

  const iso = (ms) => new Date(ms).toISOString();

  async function sweepOnce() {
    const t = now();
    const abandonCutoff = iso(t - envNum('FLOWDESK_CHAT_ABANDON_MINUTES', DEFAULTS.abandonMinutes) * 60 * 1000);
    const parkedCutoff = iso(t - envNum('FLOWDESK_CHAT_PARKED_TTL_HOURS', DEFAULTS.parkedTtlHours) * 3600 * 1000);
    const retentionDays = envNum('FLOWDESK_CHAT_LOG_RETENTION_DAYS', DEFAULTS.retentionDays);
    const retentionCutoff = iso(t - retentionDays * 86400 * 1000);
    const summary = { abandoned: 0, parkedAbandoned: 0, turnsDeleted: 0, sessionsDeleted: 0, jsonlDeleted: 0, errors: 0 };

    // 1. Abandonment — snapshot the draft (still in Redis) BEFORE stamping.
    try {
      const rows = await read(
        `MATCH (s:ChatSession) WHERE s.outcome IS NULL AND s.lastActivityAt < $cutoff
         RETURN s.sessionId AS sessionId LIMIT 500`,
        { cutoff: abandonCutoff }
      );
      for (const row of rows) {
        const sessionId = row.get('sessionId');
        let draftJson = null;
        try {
          const draft = await getDraft(sessionId);
          if (draft) draftJson = JSON.stringify(draft);
        } catch { /* draft may already be gone — abandonment is still real */ }
        await write(
          `MATCH (s:ChatSession {sessionId:$sessionId}) WHERE s.outcome IS NULL
           SET s.outcome='abandoned', s.endedAt=coalesce(s.lastActivityAt, $ts),
               s.finalDraftJson=coalesce($draftJson, s.finalDraftJson)`,
          { sessionId, ts: iso(t), draftJson }
        );
        summary.abandoned += 1;
      }
    } catch (err) { summary.errors += 1; log('abandon pass failed:', err.message); }

    // 2. Parked → parked_abandoned once the draft TTL horizon passed unresumed.
    try {
      const rows = await write(
        `MATCH (s:ChatSession) WHERE s.outcome='parked' AND s.lastActivityAt < $cutoff
         SET s.outcome='parked_abandoned' RETURN count(s) AS n`,
        { cutoff: parkedCutoff }
      );
      summary.parkedAbandoned = rows[0] ? Number(rows[0].get('n')) : 0;
    } catch (err) { summary.errors += 1; log('parked pass failed:', err.message); }

    // 3. Retention (ratified 90d) — turns first, then sessions, then telemetry events.
    try {
      const t1 = await write(
        `MATCH (t:ChatTurn) WHERE t.ts < $cutoff WITH t LIMIT 5000 DETACH DELETE t RETURN count(*) AS n`,
        { cutoff: retentionCutoff }
      );
      summary.turnsDeleted = t1[0] ? Number(t1[0].get('n')) : 0;
      const s1 = await write(
        `MATCH (s:ChatSession) WHERE s.startedAt < $cutoff AND NOT (s)-[:HAS_TURN]->()
         WITH s LIMIT 1000 DETACH DELETE s RETURN count(*) AS n`,
        { cutoff: retentionCutoff }
      );
      summary.sessionsDeleted = s1[0] ? Number(s1[0].get('n')) : 0;
      await write(`MATCH (e:FlowdeskSyncEvent) WHERE e.ts < $cutoff WITH e LIMIT 5000 DETACH DELETE e`, { cutoff: retentionCutoff });
      await write(`MATCH (r:FlowdeskCatalogSyncRun) WHERE r.startedAt < $cutoff WITH r LIMIT 1000 DETACH DELETE r`, { cutoff: retentionCutoff });
    } catch (err) { summary.errors += 1; log('retention pass failed:', err.message); }

    // 4. JSONL retention — the firehose ages out with the graph, so "90 days"
    // means 90 days in BOTH stores. FLOWDESK_CHAT_JSONL_RETENTION_DAYS can only
    // SHORTEN the window (clamped below): letting it run longer would quietly
    // reinstate the very gap this pass closes, and disk copies of personal data
    // are exactly what a retention policy is for.
    try {
      const jsonlDays = Math.min(
        envNum('FLOWDESK_CHAT_JSONL_RETENTION_DAYS', retentionDays),
        retentionDays
      );
      // The filename carries the day the turns belong to; mtime would instead
      // report the last append, which is the same day — but the name is the
      // record's own claim about itself, so trust it.
      const cutoffDay = iso(t - jsonlDays * 86400 * 1000).slice(0, 10);
      let names = [];
      try { names = fs.readdirSync(logDir); }
      catch { names = []; } // no log dir yet (nothing written, or a fresh deploy)
      for (const name of names) {
        const m = /^chat-turns-(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
        if (!m || m[1] >= cutoffDay) continue;
        try { fs.unlinkSync(pathDefault.join(logDir, name)); summary.jsonlDeleted += 1; }
        catch (err) { summary.errors += 1; log(`could not delete ${name}:`, err.message); }
      }
    } catch (err) { summary.errors += 1; log('jsonl retention pass failed:', err.message); }

    lastRun = { at: iso(t), ...summary };
    if (summary.abandoned || summary.parkedAbandoned || summary.turnsDeleted || summary.jsonlDeleted || summary.errors) {
      log(JSON.stringify(lastRun));
    }
    return summary;
  }

  async function start() {
    if (running) return;
    running = true;
    try { await require('./chat-telemetry.service').ensureIndexes(); } catch { /* best-effort */ }
    const intervalMs = envNum('FLOWDESK_CHAT_SWEEP_INTERVAL_MINUTES', DEFAULTS.intervalMinutes) * 60 * 1000;
    timer = timers.setInterval(() => { sweepOnce().catch((e) => log('sweep failed:', e.message)); }, intervalMs);
    // First pass shortly after boot (give Memgraph a moment).
    setTimeout(() => { sweepOnce().catch((e) => log('initial sweep failed:', e.message)); }, 15 * 1000).unref?.();
    log(`started (every ${intervalMs / 60000} min)`);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (timer) { timers.clearInterval(timer); timer = null; }
    log('stopped');
  }

  return { start, stop, sweepOnce, isRunning: () => running, lastRun: () => lastRun };
}

let _default;
function getChatSessionSweeper() {
  if (!_default) _default = createChatSessionSweeper();
  return _default;
}

module.exports = { createChatSessionSweeper, getChatSessionSweeper, DEFAULTS };
