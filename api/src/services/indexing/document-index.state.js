'use strict';
/**
 * DocumentIndexState — durable, restart-surviving runtime state for the indexer.
 *
 * The circuit breaker, per-source backoff and (new) per-document quarantine used
 * to live only in memory on the service instance, so every API restart wiped
 * them: a permanently-blocked source (403/WAF, bad config) would immediately be
 * re-picked, fail, and re-trip — endlessly occupying worker slots with obvious
 * errors. This module persists that state to `data/document-index/state.json`
 * and rehydrates it on startup.
 *
 * Two granularities of quarantine:
 *   1. SOURCE quarantine — the whole source is skipped (mass errors / non-transient
 *      failure). Carries a `mode`:
 *        - 'auto'      → transient spike; exponential cooldown, self-heals on the
 *                        next clean page (half-open).
 *        - 'needs_fix' → non-transient (ACCESS_BLOCKED / CONFIG_MISSING / PARSE):
 *                        long cooldown, surfaced in the "needs intervention" list,
 *                        self-heal ONLY via a low-cadence re-probe.
 *        - 'manual'    → set by an admin/AI action.
 *   2. DOCUMENT quarantine — individual documents (by url) that repeatedly fail
 *      enrich/download are parked per-source so the rest of the source keeps
 *      flowing; retried again only after a cooldown (self-heal).
 *
 * Persisted shape:
 *   {
 *     sources: {
 *       "<sourceId>": {
 *         name, mode, openUntil, trips, reason, category, quarantinedAt, lastFailAt,
 *         backoffUntil,
 *         docs: { "<url>": { reason, fails, at, retryAfter } }
 *       }
 *     },
 *     updatedAt
 *   }
 */

const fs = require('fs');
const path = require('path');

const DIR  = process.env.DOCUMENT_INDEXER_LOG_DIR
  || path.join(__dirname, '..', '..', '..', 'data', 'document-index');
const FILE = path.join(DIR, 'state.json');
const FLUSH_MS = 10000;                 // debounced persistence

// Per-document quarantine: how many enrich/download failures before parking a
// document, and how long before it is retried (self-heal).
const DOC_FAIL_THRESHOLD = parseInt(process.env.DOCUMENT_INDEXER_DOC_FAIL_THRESHOLD, 10) || 3;
const DOC_RETRY_MS = parseInt(process.env.DOCUMENT_INDEXER_DOC_RETRY_MS, 10) || 24 * 60 * 60 * 1000;

// ── module state ──────────────────────────────────────────────

/** @type {Map<string, Object>} sourceId → durable per-source record */
const sources = new Map();
let _dirty = false;
let _loaded = false;

function nowIso() { return new Date().toISOString(); }
function ensureDir() { try { fs.mkdirSync(DIR, { recursive: true }); } catch { /* ignore */ } }

function load() {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const [id, rec] of Object.entries(raw.sources || {})) {
      sources.set(id, { docs: {}, ...rec });
    }
  } catch { /* fresh */ }
}

function persist() {
  if (!_dirty) return;
  ensureDir();
  try {
    const out = { sources: {}, updatedAt: nowIso() };
    for (const [id, rec] of sources.entries()) out.sources[id] = rec;
    fs.writeFileSync(FILE, JSON.stringify(out));
    _dirty = false;
  } catch { /* best-effort */ }
}

function markDirty() { _dirty = true; }

/** Get (creating if missing) the durable record for a source. */
function rec(sourceId) {
  load();
  let r = sources.get(sourceId);
  if (!r) { r = { docs: {} }; sources.set(sourceId, r); }
  if (!r.docs) r.docs = {};
  return r;
}

// ── source-level quarantine / circuit ─────────────────────────

/**
 * Open (or extend) a source quarantine.
 * @param {string} sourceId
 * @param {{ name?, mode?, openUntil, trips?, reason?, category? }} q
 */
function setCircuit(sourceId, q = {}) {
  const r = rec(sourceId);
  if (q.name) r.name = q.name;
  r.mode        = q.mode || r.mode || 'auto';
  r.openUntil   = q.openUntil;
  r.trips       = q.trips != null ? q.trips : (r.trips || 0);
  r.reason      = q.reason != null ? q.reason : r.reason;
  r.category    = q.category != null ? q.category : r.category;
  r.lastFailAt  = Date.now();
  if (!r.quarantinedAt) r.quarantinedAt = nowIso();
  markDirty();
  return r;
}

/** Fully clear a source quarantine + backoff (recovered / manual resume). */
function clearCircuit(sourceId) {
  const r = sources.get(sourceId);
  if (!r) return;
  r.mode = undefined; r.openUntil = 0; r.trips = 0; r.reason = null;
  r.category = null; r.quarantinedAt = undefined;
  markDirty();
}

function setBackoff(sourceId, until) { const r = rec(sourceId); r.backoffUntil = until; markDirty(); }
function clearBackoff(sourceId) { const r = sources.get(sourceId); if (r) { r.backoffUntil = 0; markDirty(); } }

function getSource(sourceId) { load(); return sources.get(sourceId) || null; }

/** Sources currently under a live quarantine (optionally filtered by mode). */
function listQuarantined(mode = null) {
  load();
  const now = Date.now();
  const out = [];
  for (const [id, r] of sources.entries()) {
    const open = (r.openUntil || 0) > now || r.mode === 'needs_fix' || r.mode === 'manual';
    if (!open) continue;
    if (mode && r.mode !== mode) continue;
    const docCount = r.docs ? Object.keys(r.docs).length : 0;
    out.push({
      sourceId: id, name: r.name || null, mode: r.mode || 'auto',
      openUntil: r.openUntil || 0, trips: r.trips || 0, reason: r.reason || null,
      category: r.category || null, quarantinedAt: r.quarantinedAt || null,
      quarantinedDocs: docCount,
    });
  }
  return out.sort((a, b) => (b.trips || 0) - (a.trips || 0));
}

// ── per-document quarantine ───────────────────────────────────

/** Is this document parked (and still inside its retry cooldown)? */
function isDocQuarantined(sourceId, url) {
  if (!url) return false;
  const r = sources.get(sourceId);
  const d = r?.docs?.[url];
  if (!d) return false;
  if (d.retryAfter && Date.now() >= d.retryAfter) return false;   // cooldown elapsed → eligible again
  return (d.fails || 0) >= DOC_FAIL_THRESHOLD;
}

/** Record a document failure; park it once it crosses the fail threshold. */
function noteDocFailure(sourceId, url, reason) {
  if (!url) return;
  const r = rec(sourceId);
  const d = r.docs[url] || { fails: 0 };
  d.fails = (d.fails || 0) + 1;
  d.reason = String(reason || '').slice(0, 300);
  d.at = nowIso();
  if (d.fails >= DOC_FAIL_THRESHOLD) d.retryAfter = Date.now() + DOC_RETRY_MS;
  r.docs[url] = d;
  markDirty();
}

/** A document succeeded → clear any quarantine record for it. */
function noteDocSuccess(sourceId, url) {
  if (!url) return;
  const r = sources.get(sourceId);
  if (r?.docs && r.docs[url]) { delete r.docs[url]; markDirty(); }
}

/** The set of currently-parked doc urls for a source (past threshold, pre-cooldown). */
function quarantinedDocUrls(sourceId) {
  const r = sources.get(sourceId);
  if (!r?.docs) return new Set();
  const now = Date.now();
  const s = new Set();
  for (const [url, d] of Object.entries(r.docs)) {
    if ((d.fails || 0) >= DOC_FAIL_THRESHOLD && !(d.retryAfter && now >= d.retryAfter)) s.add(url);
  }
  return s;
}

/** Manual clear of a source's document quarantine (retry them all). */
function clearDocQuarantine(sourceId) {
  const r = sources.get(sourceId);
  if (r) { r.docs = {}; markDirty(); }
}

// ── init: hydrate + periodic/at-exit persistence ──────────────

load();
const _flushTimer = setInterval(persist, FLUSH_MS);
if (_flushTimer.unref) _flushTimer.unref();
for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
  try { process.once(sig, () => { try { persist(); } catch { /* */ } }); } catch { /* */ }
}

module.exports = {
  setCircuit, clearCircuit, setBackoff, clearBackoff, getSource, listQuarantined,
  isDocQuarantined, noteDocFailure, noteDocSuccess, quarantinedDocUrls, clearDocQuarantine,
  persist, FILE, DOC_FAIL_THRESHOLD, DOC_RETRY_MS,
};
