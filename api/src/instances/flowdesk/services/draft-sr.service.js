'use strict';

/**
 * DraftSR service (C2) — production wrapper over the Contract-2 reference reducer.
 *
 * Adds Redis persistence (key draft:{sessionId}, TTL refreshed on every write)
 * and Memgraph materialization (submit → (:ServiceRequest), escalate →
 * (:Escalation)). All state semantics (provenance guard I1, transitive stale
 * cascade I2/RULE-078, TTL I3, submit validation I4) come from the reducer —
 * this layer never re-implements them (RULE-075).
 *
 * All external deps are injectable for testing; defaults wire the real Redis
 * service, the schema-graph driver, and the schema compiler.
 *
 * @module instances/flowdesk/services/draft-sr.service
 */

const reducer = require('../contracts/draft-sr.reducer');

const TTL_SECONDS = 24 * 60 * 60;
const KEY = (sessionId) => `draft:${sessionId}`;

// ── default deps ────────────────────────────────────────────────────────────

function defaultStore() {
  const redis = require('../../../services/redis.service');
  return {
    get: (k) => redis.get(k),
    set: (k, v, ttl) => redis.set(k, v, ttl),
  };
}

function defaultGraphWrite() {
  const { write } = require('../schema-graph/driver');
  return write;
}

function defaultLoadSnapshot() {
  const { compile } = require('../schema-graph/schema-compiler');
  return compile;
}

let _refCounter = 0;
/**
 * Generate a reference number. SR numbers MUST match the resolve.search ref
 * pattern `(SR|INC)-\d+` (Contract 3) so status lookups can detect them — hence
 * digits-only after the prefix.
 */
function defaultMakeRef(_draft, prefix = 'SR') {
  _refCounter = (_refCounter + 1) % 1000;
  const digits = `${Date.now()}${String(_refCounter).padStart(3, '0')}`;
  return `${prefix}-${digits}`;
}

// ── service ─────────────────────────────────────────────────────────────────

function createDraftSRService(deps = {}) {
  const store = deps.store || defaultStore();
  const graphWrite = deps.graphWrite || defaultGraphWrite();
  const loadSnapshot = deps.loadSnapshot || defaultLoadSnapshot();
  const now = deps.now || (() => Date.now());
  const makeRef = deps.makeRef || defaultMakeRef;
  const ttlSeconds = deps.ttlSeconds || TTL_SECONDS;
  const ttlMs = ttlSeconds * 1000;

  async function persist(draft) {
    await store.set(KEY(draft.sessionId), draft, ttlSeconds); // EX refreshes TTL (I3)
    return draft;
  }

  async function get(sessionId) {
    return store.get(KEY(sessionId));
  }

  async function create(sessionId, serviceId, schemaVersion, beneficiary, userId) {
    const existing = await get(sessionId);
    if (existing) return existing; // idempotent per session
    const draft = reducer.createDraft({ sessionId, serviceId, schemaVersion, beneficiary, userId, now: now(), ttlMs });
    return persist(draft);
  }

  async function patch(sessionId, patches) {
    const draft = await get(sessionId);
    if (!draft) throw new Error(`[draft-sr] no draft for session ${sessionId}`);
    const snapshot = await loadSnapshot(draft.serviceId);
    if (!snapshot) throw new Error(`[draft-sr] no SchemaSnapshot for ${draft.serviceId}`);
    const next = reducer.applyPatches(draft, patches, snapshot, now(), ttlMs);
    return persist(next);
  }

  // ── DialogueStack ops (F10b) — read-modify-write through the reducer. ───────
  async function syncTopSequence(sessionId, slotId) {
    const draft = await get(sessionId);
    if (!draft) return null;
    const next = reducer.syncTopSequence(draft, slotId, now(), ttlMs);
    return next === draft ? draft : persist(next);
  }
  async function closeSequence(sessionId) {
    const draft = await get(sessionId);
    if (!draft) return null;
    return persist(reducer.closeSequence(draft, now(), ttlMs));
  }
  async function bumpRepair(sessionId) {
    const draft = await get(sessionId);
    if (!draft) return { draft: null, count: 0 };
    const res = reducer.bumpRepair(draft, now(), ttlMs);
    await persist(res.draft);
    return res;
  }
  async function clearSequences(sessionId) {
    const draft = await get(sessionId);
    if (!draft) return null;
    return persist(reducer.clearSequences(draft, now(), ttlMs));
  }

  // ── Repair ladder + counters + pending action (F10c). ──────────────────────
  async function recordRepair(sessionId, slotId) {
    const draft = await get(sessionId);
    if (!draft) return { draft: null, perSlot: 0, session: 0, step: 0, ladder: 'TARGETED_REASK' };
    const res = reducer.recordRepair(draft, slotId, now(), ttlMs);
    await persist(res.draft);
    return res;
  }
  async function resetSlotRepair(sessionId, slotId) {
    const draft = await get(sessionId);
    if (!draft) return null;
    const next = reducer.resetSlotRepair(draft, slotId, now(), ttlMs);
    return next === draft ? draft : persist(next);
  }
  async function setLastQuestion(sessionId, text) {
    const draft = await get(sessionId);
    if (!draft || !text) return draft || null;
    return persist(reducer.setLastQuestion(draft, text, now(), ttlMs));
  }
  async function setPendingAction(sessionId, action) {
    const draft = await get(sessionId);
    if (!draft) return null;
    return persist(reducer.setPendingAction(draft, action, now(), ttlMs));
  }
  async function clearPendingAction(sessionId) {
    const draft = await get(sessionId);
    if (!draft || !draft.pendingAction) return draft || null;
    return persist(reducer.clearPendingAction(draft, now(), ttlMs));
  }
  const PARKED_KEY = (userId) => `parked:${userId}`;

  async function park(sessionId) {
    const draft = await get(sessionId);
    if (!draft) return null;
    const parked = reducer.park(draft, now(), ttlMs);
    await persist(parked);
    // Index the parked draft under its owner so it can be offered for resume.
    if (parked.userId) {
      const key = PARKED_KEY(parked.userId);
      const list = (await store.get(key)) || [];
      if (!list.includes(sessionId)) { list.push(sessionId); await store.set(key, list, ttlSeconds); }
    }
    return parked;
  }

  async function unpark(sessionId) {
    const draft = await get(sessionId);
    if (!draft) return null;
    const next = reducer.unpark(draft, now(), ttlMs);
    await persist(next);
    if (next.userId) {
      const key = PARKED_KEY(next.userId);
      const list = (await store.get(key)) || [];
      const filtered = list.filter((s) => s !== sessionId);
      if (filtered.length !== list.length) await store.set(key, filtered, ttlSeconds);
    }
    return next;
  }

  /** Free the live session slot (F10d switch): the current draft is discarded. */
  async function discard(sessionId) {
    await store.set(KEY(sessionId), null, 1);
    return true;
  }

  /**
   * Park the current draft under a distinct archive key so the live session slot
   * is freed for a new intent (F10d confirm-switch). The archive is indexed for
   * resume. Returns { archiveId, parked }.
   */
  async function parkArchive(sessionId) {
    const draft = await get(sessionId);
    if (!draft) return null;
    const archiveId = `${sessionId}::${draft.updatedAt || 'parked'}`;
    const parked = { ...reducer.park(draft, now(), ttlMs), sessionId: archiveId };
    await store.set(KEY(archiveId), parked, ttlSeconds);
    if (parked.userId) {
      const key = PARKED_KEY(parked.userId);
      const list = (await store.get(key)) || [];
      if (!list.includes(archiveId)) { list.push(archiveId); await store.set(key, list, ttlSeconds); }
    }
    await discard(sessionId);
    return { archiveId, parked };
  }

  /** Parked drafts owned by a user (self-healing: drops stale/non-parked entries). */
  async function getParkedByUser(userId) {
    if (!userId) return [];
    const key = PARKED_KEY(userId);
    const list = (await store.get(key)) || [];
    const out = [];
    const live = [];
    for (const sid of list) {
      const d = await get(sid);
      if (d && d.status === 'parked') {
        out.push(d);
        live.push(sid);
      }
    }
    if (live.length !== list.length) await store.set(key, live, ttlSeconds);
    return out;
  }

  async function setStatus(sessionId, status) {
    const draft = await get(sessionId);
    if (!draft) throw new Error(`[draft-sr] no draft for session ${sessionId}`);
    if (status === 'submitted' || status === 'escalated') {
      throw new Error(`[draft-sr] use submit()/escalate() to reach status '${status}'`);
    }
    const next = { ...draft, status, updatedAt: new Date(now()).toISOString() };
    return persist(next);
  }

  async function submit(sessionId) {
    const draft = await get(sessionId);
    if (!draft) throw new Error(`[draft-sr] no draft for session ${sessionId}`);
    const snapshot = await loadSnapshot(draft.serviceId);
    if (!snapshot) throw new Error(`[draft-sr] no SchemaSnapshot for ${draft.serviceId}`);

    const res = reducer.submit(draft, snapshot, { now: now(), makeRef });
    if (!res.ok) return res; // {error:{code:'INCOMPLETE', missing, stale}}

    // I-7: an Altiora-materialized service (snapshot carries altioraOusId) CAN submit
    // as a REAL Altiora ticket (POST /api/tickets) instead of a local Memgraph SR.
    // This writes to the ITSM of record, so it is OPT-IN and DORMANT by default —
    // Ivan flagged real ticket submit as "too early". It activates only when
    // FLOWDESK_SUBMIT_TARGET=altiora is set explicitly; otherwise every service
    // (including materialized ones) keeps the safe local materialization below.
    const altioraBacked = snapshot.metadata && snapshot.metadata.altioraOusId != null;
    const altioraSubmitEnabled = process.env.FLOWDESK_SUBMIT_TARGET === 'altiora';
    if (altioraBacked && altioraSubmitEnabled) {
      const ticketSvc = deps.ticketService || require('./altiora-ticket.service').getAltioraTicketService();
      const ticket = await ticketSvc.createTicket(draft, snapshot); // throws typed AltioraError on failure
      // Persist the standard submitted draft (keeps its schema-valid local ref);
      // the real Altiora TicketNumber is returned as the tracking reference.
      await persist(res.draft);
      return { srNumber: ticket.srNumber || res.srNumber, ticketId: ticket.ticketId, status: ticket.status, altiora: true };
    }

    // Materialize the SR in Memgraph (default / fixture services).
    await graphWrite(
      `MERGE (sr:ServiceRequest {srNumber:$srNumber})
       SET sr.serviceId=$serviceId, sr.sessionId=$sessionId, sr.status='submitted',
           sr.createdAt=$createdAt, sr.slotsJson=$slotsJson, sr.schemaVersion=$schemaVersion
       WITH sr
       OPTIONAL MATCH (svc:ServiceDef {serviceId:$serviceId})
       FOREACH (_ IN CASE WHEN svc IS NULL THEN [] ELSE [1] END |
         MERGE (sr)-[:FOR_SERVICE]->(svc))`,
      {
        srNumber: res.srNumber, serviceId: draft.serviceId, sessionId,
        createdAt: res.draft.updatedAt, schemaVersion: draft.schemaVersion,
        slotsJson: JSON.stringify(draft.slots),
      }
    );

    await persist(res.draft);
    return { srNumber: res.srNumber, nodeId: res.nodeId };
  }

  async function escalate(sessionId, reason, transcriptRef) {
    const draft = await get(sessionId);
    if (!draft) throw new Error(`[draft-sr] no draft for session ${sessionId}`);
    const res = reducer.escalate(draft, { reason, transcriptRef, now: now(), makeRef });

    await graphWrite(
      `MERGE (e:Escalation {escalationId:$escalationId})
       SET e.sessionId=$sessionId, e.serviceId=$serviceId, e.reason=$reason,
           e.transcriptRef=$transcriptRef, e.createdAt=$createdAt, e.draftJson=$draftJson`,
      {
        escalationId: res.escalationId, sessionId, serviceId: draft.serviceId,
        reason: reason || null, transcriptRef: transcriptRef || null,
        createdAt: res.draft.updatedAt, draftJson: JSON.stringify(draft),
      }
    );

    await persist(res.draft);
    return { escalationId: res.escalationId, nodeId: res.nodeId };
  }

  return { create, get, patch, setStatus, submit, escalate,
    syncTopSequence, closeSequence, bumpRepair, clearSequences,
    recordRepair, resetSlotRepair, setLastQuestion, setPendingAction, clearPendingAction, park, unpark, getParkedByUser,
    discard, parkArchive,
    KEY, TTL_SECONDS: ttlSeconds };
}

// Lazy singleton with default deps (used by the HTTP controller).
let _default;
function getDraftSRService() {
  if (!_default) _default = createDraftSRService();
  return _default;
}

module.exports = { createDraftSRService, getDraftSRService, TTL_SECONDS, KEY };
