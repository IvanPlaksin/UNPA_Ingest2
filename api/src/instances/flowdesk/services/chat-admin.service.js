'use strict';

/**
 * Chat Admin service (ADMIN P1–P4) — the query layer behind
 * /api/v1/flowdesk/admin/*. Reads the telemetry written by
 * chat-telemetry.service (ChatSession/ChatTurn), the schema registry,
 * the Qdrant catalog mirror and — where asked — live Altiora.
 *
 * Memgraph notes (project invariants): LIMIT/SKIP params must be neo4j.int();
 * plain numbers elsewhere; no MAGE.
 *
 * @module instances/flowdesk/services/chat-admin.service
 */

const { read, write, neo4j } = require('../schema-graph/driver');

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.FLOWDESK_SERVICE_COLLECTION || 'flowdesk_services';

const BAD_OUTCOMES = ['escalated', 'abandoned', 'parked_abandoned', 'submit_failed'];

const props = (row, key) => {
  const n = row.get(key);
  return n && n.properties ? n.properties : n;
};
const clampInt = (v, dflt, max) => neo4j.int(Math.min(Math.max(1, Number(v) || dflt), max));

// ── Sessions (P1) ─────────────────────────────────────────────────────────────

/**
 * Paged session list with filters.
 * @param {object} f {outcome, serviceId, userId, channel, from, to, q, repairMin,
 *                    flagged, qualityStatus, page, pageSize}
 */
async function listSessions(f = {}) {
  const conds = [];
  const params = {};
  if (f.outcome) {
    if (f.outcome === 'active') conds.push('s.outcome IS NULL');
    else { conds.push('s.outcome = $outcome'); params.outcome = f.outcome; }
  }
  if (f.serviceId) { conds.push('s.serviceId = $serviceId'); params.serviceId = f.serviceId; }
  if (f.userId) { conds.push('(s.userId = $userId OR toLower(coalesce(s.userDisplayName,"")) CONTAINS toLower($userId))'); params.userId = f.userId; }
  if (f.channel) { conds.push('s.channel = $channel'); params.channel = f.channel; }
  if (f.from) { conds.push('s.startedAt >= $from'); params.from = f.from; }
  if (f.to) { conds.push('s.startedAt <= $to'); params.to = f.to; }
  if (f.repairMin) { conds.push('coalesce(s.repairSession,0) >= $repairMin'); params.repairMin = Number(f.repairMin); }
  if (f.qualityStatus) { conds.push('coalesce(s.qualityStatus,"new") = $qualityStatus'); params.qualityStatus = f.qualityStatus; }
  if (f.flagged === 'true' || f.flagged === true) {
    conds.push(`(s.outcome IN $badOutcomes OR coalesce(s.repairSession,0) >= 3
      OR coalesce(s.outOfScopeTurns,0) >= 2 OR coalesce(s.errorTurns,0) >= 1)`);
    params.badOutcomes = BAD_OUTCOMES;
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

  // Transcript full-text: join through turns only when q is present (costlier).
  const matchClause = f.q
    ? `MATCH (s:ChatSession)-[:HAS_TURN]->(t:ChatTurn)
       WHERE toLower(coalesce(t.userText,'') + ' ' + coalesce(t.agentText,'')) CONTAINS toLower($q)
       WITH DISTINCT s ${where}`
    : `MATCH (s:ChatSession) ${where}`;
  if (f.q) params.q = f.q;

  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = Math.min(Math.max(1, Number(f.pageSize) || 25), 200);
  params.skip = neo4j.int((page - 1) * pageSize);
  params.limit = neo4j.int(pageSize);

  const totalRows = await read(`${matchClause} RETURN count(s) AS n`, params);
  const total = totalRows[0] ? Number(totalRows[0].get('n')) : 0;

  const rows = await read(
    `${matchClause}
     RETURN s ORDER BY s.lastActivityAt DESC SKIP $skip LIMIT $limit`, params);
  return { total, page, pageSize, items: rows.map((r0) => sessionView(props(r0, 's'))) };
}

/** Attach derived quality flags to a raw session node. */
function sessionView(s) {
  if (!s) return null;
  const flags = [];
  if ((s.repairSession || 0) >= 3) flags.push('repair_heavy');
  if ((s.outOfScopeTurns || 0) >= 2) flags.push('out_of_scope_loop');
  if ((s.errorTurns || 0) >= 1) flags.push('error_turns');
  // No 'negative_csat' flag: nothing in FlowDesk ever writes ChatSession.rating —
  // there is no CSAT collection point in the chat, so the flag could never fire
  // (TASK-FLOWDESK-BUG-002). It also disagreed with the `flagged=true` Cypher
  // filter below, which never considered rating either: a session could carry the
  // flag in this view yet be absent from the negative feed. Restore both together
  // if CSAT collection is ever built.
  return { ...s, flags, negative: BAD_OUTCOMES.includes(s.outcome) || flags.length > 0 };
}

async function getSession(sessionId) {
  const rows = await read(`MATCH (s:ChatSession {sessionId:$sessionId}) RETURN s`, { sessionId });
  if (!rows.length) return null;
  const session = sessionView(props(rows[0], 's'));
  // Live draft (if still within its Redis TTL) enriches the detail view.
  let draft = null;
  try { draft = await require('./draft-sr.service').getDraftSRService().get(sessionId); } catch { /* optional */ }
  if (!draft && session.finalDraftJson) { try { draft = JSON.parse(session.finalDraftJson); } catch { /* raw */ } }
  return { session, draft };
}

/**
 * One recorded model call: the exact system prompt, conversation and reply.
 *
 * Kept in Redis for an hour by the agent loop (llm-call-store), so a missing
 * call is the ordinary case — the hour passed — not a failure. The reader is
 * told which, rather than being handed an empty object to puzzle over.
 */
async function getLlmCall(key) {
  const call = await require('./llm-call-store.service').getCall(key);
  return call || { missing: true, reason: 'Not in cache — recorded calls are kept for one hour.' };
}

async function getTurns(sessionId) {
  const rows = await read(
    `MATCH (:ChatSession {sessionId:$sessionId})-[:HAS_TURN]->(t:ChatTurn)
     RETURN t ORDER BY t.seq ASC`, { sessionId });
  const parse = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };
  const turns = rows.map((r0) => {
    const t = props(r0, 't');
    return {
      ...t,
      nodeTrace: parse(t.nodeTraceJson),
      llmCalls: parse(t.llmCallsJson),
      // Every timed operation of the turn — the Altiora round trips, the searches,
      // each model call — so a replay can say where the time actually went.
      spans: parse(t.spansJson),
      nodeTraceJson: undefined, llmCallsJson: undefined, spansJson: undefined,
    };
  });
  // Voice transcripts are the only raw-utterance store for the voice channel —
  // merge them in so replay covers both channels.
  let voice = [];
  try {
    const redis = require('../../../services/redis.service');
    voice = (await redis.get(`voice:transcript:${sessionId}`)) || [];
  } catch { /* optional */ }
  return { turns, voice };
}

/** Dashboard aggregates over a trailing window (days). */
async function sessionStats({ days = 7 } = {}) {
  const from = new Date(Date.now() - Math.min(Math.max(1, Number(days) || 7), 90) * 86400 * 1000).toISOString();
  const p = { from };

  const [byOutcome, totals, byDay, byService] = await Promise.all([
    read(`MATCH (s:ChatSession) WHERE s.startedAt >= $from
          RETURN coalesce(s.outcome,'active') AS outcome, count(*) AS n`, p),
    read(`MATCH (s:ChatSession) WHERE s.startedAt >= $from
          RETURN count(*) AS sessions,
                 sum(coalesce(s.turns,0)) AS turns,
                 sum(coalesce(s.llmCostUsd,0.0)) AS cost,
                 sum(coalesce(s.llmCalls,0)) AS llmCalls,
                 sum(CASE WHEN s.serviceId IS NOT NULL THEN 1 ELSE 0 END) AS withService,
                 sum(CASE WHEN s.outcome='completed' THEN 1 ELSE 0 END) AS completed,
                 sum(CASE WHEN coalesce(s.repairSession,0) >= 3 THEN 1 ELSE 0 END) AS repairHeavy,
                 avg(coalesce(s.turns,0)) AS avgTurns`, p),
    read(`MATCH (s:ChatSession) WHERE s.startedAt >= $from
          RETURN substring(s.startedAt,0,10) AS day,
                 count(*) AS sessions,
                 sum(CASE WHEN s.outcome='completed' THEN 1 ELSE 0 END) AS completed,
                 sum(CASE WHEN s.outcome IN $bad THEN 1 ELSE 0 END) AS negative,
                 sum(coalesce(s.llmCostUsd,0.0)) AS cost
          ORDER BY day ASC`, { ...p, bad: BAD_OUTCOMES }),
    read(`MATCH (s:ChatSession) WHERE s.startedAt >= $from AND s.serviceId IS NOT NULL
          RETURN s.serviceId AS serviceId, count(*) AS sessions,
                 sum(CASE WHEN s.outcome='completed' THEN 1 ELSE 0 END) AS completed,
                 sum(CASE WHEN s.outcome IN $bad THEN 1 ELSE 0 END) AS negative
          ORDER BY sessions DESC LIMIT 20`, { ...p, bad: BAD_OUTCOMES }),
  ]);

  const t = totals[0];
  const num = (v) => (v == null ? 0 : Number(v));
  const sessions = t ? num(t.get('sessions')) : 0;
  const completed = t ? num(t.get('completed')) : 0;
  return {
    windowDays: Number(days) || 7,
    totals: {
      sessions,
      turns: t ? num(t.get('turns')) : 0,
      llmCostUsd: t ? num(t.get('cost')) : 0,
      llmCalls: t ? num(t.get('llmCalls')) : 0,
      completed,
      completionRate: sessions ? completed / sessions : 0,
      avgTurns: t ? num(t.get('avgTurns')) : 0,
      repairHeavy: t ? num(t.get('repairHeavy')) : 0,
    },
    funnel: {
      started: sessions,
      intentResolved: t ? num(t.get('withService')) : 0,
      submitted: completed,
    },
    byOutcome: byOutcome.map((r0) => ({ outcome: r0.get('outcome'), count: num(r0.get('n')) })),
    byDay: byDay.map((r0) => ({
      day: r0.get('day'), sessions: num(r0.get('sessions')),
      completed: num(r0.get('completed')), negative: num(r0.get('negative')), cost: num(r0.get('cost')),
    })),
    byService: byService.map((r0) => ({
      serviceId: r0.get('serviceId'), sessions: num(r0.get('sessions')),
      completed: num(r0.get('completed')), negative: num(r0.get('negative')),
    })),
  };
}

// ── Quality (P2) ──────────────────────────────────────────────────────────────

/** The negative-experience feed: bad outcomes OR quality flags. */
async function listNegativeSessions(f = {}) {
  return listSessions({ ...f, flagged: true });
}

const QUALITY_STATUSES = ['new', 'reviewed', 'actioned', 'dismissed'];
const ROOT_CAUSES = ['catalog_recall', 'schema_defect', 'llm_misroute', 'missing_service', 'dialogue_ux', 'integration_error', 'user_abandoned', 'other'];

async function triageSession(sessionId, { qualityStatus, rootCause, reviewNote, reviewedBy }) {
  if (qualityStatus && !QUALITY_STATUSES.includes(qualityStatus)) {
    throw Object.assign(new Error(`qualityStatus must be one of ${QUALITY_STATUSES.join(', ')}`), { status: 400 });
  }
  if (rootCause && !ROOT_CAUSES.includes(rootCause)) {
    throw Object.assign(new Error(`rootCause must be one of ${ROOT_CAUSES.join(', ')}`), { status: 400 });
  }
  const rows = await write(
    `MATCH (s:ChatSession {sessionId:$sessionId})
     SET s.qualityStatus=coalesce($qualityStatus, s.qualityStatus),
         s.rootCause=coalesce($rootCause, s.rootCause),
         s.reviewNote=coalesce($reviewNote, s.reviewNote),
         s.reviewedBy=coalesce($reviewedBy, s.reviewedBy),
         s.reviewedAt=$ts
     RETURN s`,
    { sessionId, qualityStatus: qualityStatus || null, rootCause: rootCause || null,
      reviewNote: reviewNote || null, reviewedBy: reviewedBy || null, ts: new Date().toISOString() });
  if (!rows.length) throw Object.assign(new Error('session not found'), { status: 404 });
  return sessionView(props(rows[0], 's'));
}

/** Convert a triaged finding into a BACKLOG item (closes the improvement loop). */
async function createBacklogFromSession(sessionId, { title, description, rootCause, createdBy } = {}) {
  const detail = await getSession(sessionId);
  if (!detail) throw Object.assign(new Error('session not found'), { status: 404 });
  const s = detail.session;
  const turnsData = await getTurns(sessionId);
  const excerpt = turnsData.turns.slice(0, 12)
    .map((t) => `${t.seq}. [user] ${t.userText || ''}\n   [agent] ${(t.agentText || '').slice(0, 200)}`)
    .join('\n');

  const backlog = require('../../../services/backlog/backlog.service');
  const cause = rootCause || s.rootCause || 'other';
  const item = await backlog.create({
    title: title || `Chat quality: ${cause} in session ${sessionId.slice(0, 8)} (${s.serviceId || 'no service'})`,
    taskType: 'FIX',
    targetType: 'SERVICE',
    description: description ||
      `Negative chat session detected by FlowDesk Chat Admin.\n\n` +
      `Session: ${sessionId}\nOutcome: ${s.outcome || 'active'}\nService: ${s.serviceId || '-'}\n` +
      `Turns: ${s.turns || 0}, repair: ${s.repairSession || 0}, out-of-scope: ${s.outOfScopeTurns || 0}, errors: ${s.errorTurns || 0}\n` +
      `Root cause: ${cause}\nReview note: ${s.reviewNote || '-'}\n\n` +
      `Permalink: /flowdesk-admin/sessions/${sessionId}\n\nTranscript excerpt:\n${excerpt || '(no turns recorded)'}`,
    acceptanceCriteria: [
      `Root cause '${cause}' addressed so equivalent sessions succeed`,
      'Verified against the session replay in FlowDesk Chat Admin',
    ],
  }, { createdBy: createdBy || 'flowdesk-chat-admin' });

  await write(`MATCH (s:ChatSession {sessionId:$sessionId}) SET s.backlogId=$backlogId, s.qualityStatus='actioned'`,
    { sessionId, backlogId: item.backlogId });
  return item;
}

// ── Catalog (P3) ─────────────────────────────────────────────────────────────

async function qdrantScrollAll(filter) {
  const out = [];
  let offset = null;
  do {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, with_payload: true, filter, offset: offset || undefined }),
    }).then((r0) => r0.json());
    const pts = res.result?.points || [];
    out.push(...pts);
    offset = res.result?.next_page_offset || null;
  } while (offset && out.length < 2000);
  return out;
}

/** The mirrored Altiora catalog + per-service usage + materialization state. */
async function listCatalog() {
  const points = await qdrantScrollAll({ must: [{ key: 'source', match: { value: 'altiora' } }] });
  // The collection holds one CANONICAL point per service (id == catalog GUID)
  // plus I-2b utterance-variant points sharing the same service_code — dedupe
  // to one row per service, preferring the canonical point.
  const byCode = new Map();
  for (const p of points) {
    const svc = p.payload;
    if (!svc || !svc.service_code) continue;
    const canonical = String(p.id).toLowerCase() === String(svc.service_guid || '').toLowerCase();
    const cur = byCode.get(svc.service_code);
    if (!cur || (canonical && !cur.canonical)) byCode.set(svc.service_code, { svc, canonical });
  }
  const services = [...byCode.values()].map((e) => e.svc);

  // Usage join (sessions per serviceId) + materialization state (registry).
  const [usageRows, cachedRows] = await Promise.all([
    read(`MATCH (s:ChatSession) WHERE s.serviceId IS NOT NULL
          RETURN s.serviceId AS serviceId, count(*) AS sessions,
                 sum(CASE WHEN s.outcome='completed' THEN 1 ELSE 0 END) AS completed,
                 sum(CASE WHEN s.outcome IN $bad THEN 1 ELSE 0 END) AS negative`, { bad: BAD_OUTCOMES }),
    read(`MATCH (svc:ServiceDef) WHERE svc.namespace='Altiora'
          RETURN svc.serviceId AS serviceId, svc.altioraOusId AS ousId,
                 svc.contentHash AS contentHash, svc.needsRefresh AS needsRefresh`),
  ]);
  const usage = new Map(usageRows.map((r0) => [r0.get('serviceId'), {
    sessions: Number(r0.get('sessions')), completed: Number(r0.get('completed')), negative: Number(r0.get('negative')),
  }]));
  const cached = new Map(cachedRows.map((r0) => [r0.get('serviceId'), {
    ousId: r0.get('ousId') != null ? Number(r0.get('ousId')) : null,
    contentHash: r0.get('contentHash'), needsRefresh: !!r0.get('needsRefresh'),
  }]));

  return services
    .map((svc) => ({
      ...svc,
      usage: usage.get(svc.service_code) || { sessions: 0, completed: 0, negative: 0 },
      materialization: cached.has(svc.service_code)
        ? { state: cached.get(svc.service_code).needsRefresh ? 'stale' : 'cached', ...cached.get(svc.service_code) }
        : { state: 'never' },
    }))
    .sort((a, b) => String(a.service_code).localeCompare(String(b.service_code)));
}

/** Live provider resolution for a catalog service (detect + our re-ranking). */
async function catalogProviders(code, { locationPath } = {}) {
  const entries = await qdrantScrollAll({ must: [
    { key: 'source', match: { value: 'altiora' } },
    { key: 'service_code', match: { value: code } },
  ] });
  const entry = entries[0]?.payload;
  if (!entry) throw Object.assign(new Error(`service ${code} not in catalog`), { status: 404 });
  const { getAltioraSchemaClient } = require('./altiora-schema-client');
  const providers = await getAltioraSchemaClient().detectProviders(entry.service_guid, { locationPath });
  return { service: entry, providers };
}

async function runCatalogSync({ purgeStale = false, trigger = 'admin' } = {}) {
  const adminTel = require('./admin-telemetry.service');
  const startedAt = new Date().toISOString();
  try {
    const { syncCatalog } = require('./altiora-catalog-sync');
    const { fetched, upserted, purged } = await syncCatalog({ purgeStale });
    const run = { startedAt, finishedAt: new Date().toISOString(), fetched, upserted, purged, trigger };
    adminTel.recordCatalogSyncRun(run);
    return run;
  } catch (err) {
    adminTel.recordCatalogSyncRun({ startedAt, finishedAt: new Date().toISOString(), error: err.message, trigger });
    throw err;
  }
}

/** Intent-resolution diagnostics: what would the chat resolve `q` to? */
async function resolveIntent(q) {
  const { getResolveSearch } = require('./resolve-search.service');
  const hits = await getResolveSearch()(q, {});
  return hits;
}

// ── Schemas (P3) ─────────────────────────────────────────────────────────────

async function listSchemas() {
  const registry = require('./altiora-schema-registry');
  const cached = await registry.listCached();
  // Enrich with freshness flags from the graph.
  const rows = await read(
    `MATCH (svc:ServiceDef) WHERE svc.namespace='Altiora'
     OPTIONAL MATCH (svc)-[:HAS_SLOT]->(sl:SlotDef)
     RETURN svc.altioraOusId AS ousId, svc.serviceId AS serviceId, svc.title AS title,
            svc.contentHash AS contentHash, svc.needsRefresh AS needsRefresh,
            svc.approvalRequired AS approvalRequired, count(sl) AS slotCount`);
  const toInt = (v) => (v && typeof v.toNumber === 'function' ? v.toNumber() : Number(v) || 0);
  const byOus = new Map(rows.map((r0) => [Number(r0.get('ousId')), {
    title: r0.get('title'), needsRefresh: !!r0.get('needsRefresh'),
    approvalRequired: !!r0.get('approvalRequired'), slotCount: toInt(r0.get('slotCount')),
  }]));
  // ADMIN P7: which services already have an AI description (for the list badge).
  let described = new Set();
  try {
    const dr = await read(`MATCH (d:ServiceDescription) RETURN d.serviceId AS serviceId`);
    described = new Set(dr.map((r0) => r0.get('serviceId')));
  } catch { /* optional */ }
  return cached.map((c) => ({
    ...c,
    ...(byOus.get(Number(c.ousId)) || {}),
    state: byOus.get(Number(c.ousId))?.needsRefresh ? 'stale' : 'cached',
    hasDescription: described.has(c.serviceId),
  }));
}

async function getSchemaDetail(ousId, { includeSource = false } = {}) {
  const registry = require('./altiora-schema-registry');
  const snapshot = await registry.getSchema(Number(ousId));
  if (!snapshot) throw Object.assign(new Error(`no cached schema for ousId ${ousId}`), { status: 404 });

  const detail = { ousId: Number(ousId), snapshot };
  // ADMIN P7: the AI-generated service + field descriptions attached to this schema.
  try { detail.enrichment = await require('./schema-enrichment.service').getStored(snapshot.serviceId); }
  catch { detail.enrichment = null; }
  // Live version probe + (optionally) the raw Altiora SchemaJson for the diff view.
  try {
    const { getAltioraSchemaClient } = require('./altiora-schema-client');
    const sc = getAltioraSchemaClient();
    detail.liveVersion = await sc.getSchemaVersion(Number(ousId));
    detail.fresh = detail.liveVersion?.contentHash === snapshot.metadata?.contentHash;
    if (includeSource) {
      const raw = await sc.getSchema(Number(ousId));
      const schemaJson = raw && (raw.schemaJson || raw.SchemaJson || raw);
      detail.sourceSchemaJson = typeof schemaJson === 'string' ? JSON.parse(schemaJson) : schemaJson;
    }
  } catch (err) {
    detail.liveError = err.message;
  }
  return detail;
}

async function invalidateSchema(ousId) {
  const registry = require('./altiora-schema-registry');
  return { invalidated: await registry.invalidate(Number(ousId)) };
}

/**
 * Re-materialize a service from live Altiora (reuses the I-4b script's logic).
 * Accepts an ousId of an already-cached schema OR a raw service code (for
 * first-time materialization from the Catalog tab).
 */
async function rematerializeSchema(ousIdOrCode) {
  let code = String(ousIdOrCode);
  if (/^\d+$/.test(code)) {
    const rows = await read(
      `MATCH (svc:ServiceDef) WHERE svc.namespace='Altiora' AND svc.altioraOusId=$ousId
       RETURN svc.serviceId AS serviceId`, { ousId: Number(code) });
    if (!rows.length) throw Object.assign(new Error(`no cached schema for ousId ${code}`), { status: 404 });
    code = rows[0].get('serviceId');
  }

  const { materializeOne, catalogEntries } = require('../../../../scripts/materialize-altiora-service');
  const { getAltioraSchemaClient } = require('./altiora-schema-client');
  const entries = await catalogEntries([code]);
  if (!entries.length) throw Object.assign(new Error(`service ${code} not in Qdrant catalog — run catalog sync`), { status: 409 });
  const result = await materializeOne(getAltioraSchemaClient(), entries[0]);
  if (result.skipped) throw Object.assign(new Error(`skipped: ${result.skipped}`), { status: 409 });
  return result;
}

// ── Sync status (P3) ──────────────────────────────────────────────────────────

function envFlagsSnapshot() {
  const pick = (k) => process.env[k] || null;
  return {
    FLOWDESK_CHAT_V2: pick('FLOWDESK_CHAT_V2'),
    FLOWDESK_SCHEMA_PROVIDER: pick('FLOWDESK_SCHEMA_PROVIDER') || 'graph',
    FLOWDESK_SUBMIT_TARGET: pick('FLOWDESK_SUBMIT_TARGET'),
    FLOWDESK_DIRECTORY_PROVIDER: pick('FLOWDESK_DIRECTORY_PROVIDER') || 'mock',
    FLOWDESK_LLM_PROVIDER: pick('FLOWDESK_LLM_PROVIDER') || 'anthropic-api',
    FLOWDESK_LLM_MODEL: pick('FLOWDESK_LLM_MODEL') || 'claude-haiku-4-5-20251001',
    FLOWDESK_CHAT_TELEMETRY: pick('FLOWDESK_CHAT_TELEMETRY') || 'true',
    FLOWDESK_CHAT_LOG_PROMPTS: pick('FLOWDESK_CHAT_LOG_PROMPTS') || 'false',
    FLOWDESK_CHAT_LOG_RETENTION_DAYS: pick('FLOWDESK_CHAT_LOG_RETENTION_DAYS') || '90',
    FLOWDESK_CHAT_ABANDON_MINUTES: pick('FLOWDESK_CHAT_ABANDON_MINUTES') || '120',
    ALTIORA_API_BASE: pick('ALTIORA_API_BASE') || 'http://localhost:5000',
  };
}

async function syncStatus() {
  const { getActiveSyncService } = require('./altiora-schema-sync');
  const svc = getActiveSyncService();
  const sweeper = (() => { try { return require('./chat-session-sweeper.service').getChatSessionSweeper(); } catch { return null; } })();
  return {
    schemaSync: svc
      ? { running: svc.isRunning(), signalrConnected: svc.signalrConnected() }
      : { running: false, reason: 'FLOWDESK_SCHEMA_PROVIDER != altiora (poller not started)' },
    sweeper: sweeper ? { running: sweeper.isRunning(), lastRun: sweeper.lastRun() } : { running: false },
    env: envFlagsSnapshot(),
  };
}

async function syncPollNow() {
  const { getActiveSyncService, createDefaultSchemaSyncService } = require('./altiora-schema-sync');
  const svc = getActiveSyncService() || createDefaultSchemaSyncService();
  return svc.pollOnce();
}

// ── Tickets (P4) ─────────────────────────────────────────────────────────────

const _ticketCache = new Map(); // ticketId -> {at, data}
const TICKET_CACHE_MS = 60 * 1000;

async function listTickets(f = {}) {
  const conds = ['(s.srNumber IS NOT NULL OR s.ticketId IS NOT NULL)'];
  const params = {};
  if (f.from) { conds.push('s.endedAt >= $from'); params.from = f.from; }
  if (f.to) { conds.push('s.endedAt <= $to'); params.to = f.to; }
  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = Math.min(Math.max(1, Number(f.pageSize) || 25), 200);
  params.skip = neo4j.int((page - 1) * pageSize);
  params.limit = neo4j.int(pageSize);

  const totalRows = await read(`MATCH (s:ChatSession) WHERE ${conds.join(' AND ')} RETURN count(s) AS n`, params);
  const rows = await read(
    `MATCH (s:ChatSession) WHERE ${conds.join(' AND ')}
     RETURN s ORDER BY s.endedAt DESC SKIP $skip LIMIT $limit`, params);
  return {
    total: totalRows[0] ? Number(totalRows[0].get('n')) : 0, page, pageSize,
    items: rows.map((r0) => sessionView(props(r0, 's'))),
  };
}

/** Live Altiora ticket passthrough (service account; 60s cache; graceful 401/403). */
async function getTicketLive(ticketId) {
  const hit = _ticketCache.get(String(ticketId));
  if (hit && Date.now() - hit.at < TICKET_CACHE_MS) return hit.data;
  const { getAltioraClient } = require('./altiora-client');
  const data = await getAltioraClient().get(`/api/tickets/${ticketId}`);
  _ticketCache.set(String(ticketId), { at: Date.now(), data });
  return data;
}

// ── LLM telemetry (P4) ────────────────────────────────────────────────────────

async function llmStats({ days = 7 } = {}) {
  const from = new Date(Date.now() - Math.min(Math.max(1, Number(days) || 7), 90) * 86400 * 1000).toISOString();

  const [byDay, slowest, turnsRows] = await Promise.all([
    read(`MATCH (t:ChatTurn) WHERE t.ts >= $from
          RETURN substring(t.ts,0,10) AS day, count(*) AS turns,
                 sum(coalesce(t.llmCostUsd,0.0)) AS cost,
                 sum(coalesce(t.llmTokens,0)) AS tokens,
                 avg(coalesce(t.llmLatencyMs,0)) AS avgLlmLatencyMs,
                 avg(coalesce(t.durationMs,0)) AS avgTurnMs
          ORDER BY day ASC`, { from }),
    read(`MATCH (t:ChatTurn) WHERE t.ts >= $from AND t.durationMs IS NOT NULL
          RETURN t.sessionId AS sessionId, t.seq AS seq, t.route AS route,
                 t.durationMs AS durationMs, t.llmLatencyMs AS llmLatencyMs, t.ts AS ts
          ORDER BY t.durationMs DESC LIMIT 20`, { from }),
    read(`MATCH (t:ChatTurn) WHERE t.ts >= $from
          RETURN t.llmCallsJson AS calls LIMIT 2000`, { from }),
  ]);

  // Per-model / per-method breakdown from the stored call records (JS-side; the
  // JSON lives on the turn nodes and Memgraph has no JSON functions).
  const pricing = require('../../../services/ai/llm-pricing');
  const byModel = new Map();
  for (const row of turnsRows) {
    let calls = [];
    try { calls = JSON.parse(row.get('calls') || '[]'); } catch { /* skip */ }
    for (const c of calls) {
      const key = `${c.model || 'unknown'}|${c.method || '?'}`;
      const agg = byModel.get(key) || { model: c.model || 'unknown', method: c.method || '?', calls: 0, costUsd: 0, tokens: 0, latencyMs: 0, errors: 0 };
      // Historical anthropic-api calls stored costUsd=0 (tokens only). Price them
      // from the stored token count so the breakdown isn't $0.00 (see llm-pricing).
      const cost = c.costUsd || (c.tokens ? pricing.costForCombined(c.model, c.tokens) : 0);
      agg.calls += 1; agg.costUsd += cost; agg.tokens += c.tokens || 0; agg.latencyMs += c.latencyMs || 0;
      if (c.error) agg.errors += 1;
      byModel.set(key, agg);
    }
  }

  // Platform AIUsageMonitor summary rides along when available.
  let monitor = null;
  try { monitor = require('../../../services/ai/ai-usage-monitor.service').getAIUsageMonitor().getUsageStats(); } catch { /* optional */ }

  return {
    windowDays: Number(days) || 7,
    byDay: byDay.map((r0) => ({
      day: r0.get('day'), turns: Number(r0.get('turns')), costUsd: Number(r0.get('cost')),
      tokens: Number(r0.get('tokens')),
      avgLlmLatencyMs: Number(r0.get('avgLlmLatencyMs')), avgTurnMs: Number(r0.get('avgTurnMs')),
    })),
    byModel: [...byModel.values()].map((a) => ({ ...a, avgLatencyMs: a.calls ? a.latencyMs / a.calls : 0 })),
    slowestTurns: slowest.map((r0) => ({
      sessionId: r0.get('sessionId'), seq: Number(r0.get('seq')), route: r0.get('route'),
      durationMs: Number(r0.get('durationMs')), llmLatencyMs: Number(r0.get('llmLatencyMs') || 0), ts: r0.get('ts'),
    })),
    monitor,
  };
}

// ── Composite health (P4) ─────────────────────────────────────────────────────

async function adminHealth() {
  const out = { ts: new Date().toISOString() };
  const probe = async (name, fn) => {
    try { const t0 = Date.now(); const detail = await fn(); out[name] = { ok: true, latencyMs: Date.now() - t0, ...(detail || {}) }; }
    catch (err) { out[name] = { ok: false, error: err.message }; }
  };
  await Promise.all([
    probe('memgraph', async () => { await read('RETURN 1 AS ok'); }),
    probe('redis', async () => { await require('../../../services/redis.service').get('__admin_probe__'); }),
    probe('qdrant', async () => {
      const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`).then((r0) => r0.json());
      return { points: res.result?.points_count ?? null };
    }),
    probe('altiora', async () => {
      const { getAltioraClient } = require('./altiora-client');
      await getAltioraClient().get('/api/health');
    }),
  ]);
  const sync = await syncStatus();
  return { ...out, sync: sync.schemaSync, sweeper: sync.sweeper, env: sync.env };
}

module.exports = {
  sessionView, // pure — exported so the derived-flag contract is directly testable
  listSessions, getSession, getTurns, sessionStats,
  listNegativeSessions, triageSession, createBacklogFromSession,
  QUALITY_STATUSES, ROOT_CAUSES, BAD_OUTCOMES,
  listCatalog, catalogProviders, runCatalogSync, resolveIntent,
  listSchemas, getSchemaDetail, invalidateSchema, rematerializeSchema,
  syncStatus, syncPollNow, envFlagsSnapshot,
  listTickets, getTicketLive, llmStats, adminHealth,
  getLlmCall,
};
