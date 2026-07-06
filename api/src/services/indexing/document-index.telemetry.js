'use strict';
/**
 * DocumentIndexTelemetry — observability for the background document indexer.
 *
 * Two concerns, one cohesive module so the service has a single require:
 *
 *   1. Error/warning log — every harvest/enrich/probe failure is recorded with
 *      full context (source, phase, HTTP status, message) into an in-memory ring
 *      buffer (fast API serving) AND appended to a rotating JSONL file on disk
 *      (`api/data/document-index/errors.jsonl`) for later analysis.
 *
 *   2. Throughput — per-minute buckets of processed records / new nodes / errors,
 *      kept as a ring buffer, so the dashboard can chart "documents processed per
 *      minute" and see at a glance whether the worker is actually making progress.
 *
 * Pure in-process (no DB); survives restarts only via the JSONL file for #1.
 */

const fs = require('fs');
const path = require('path');
const errorPolicy = require('./document-index.error-policy');

// ── config ────────────────────────────────────────────────────

const LOG_DIR   = process.env.DOCUMENT_INDEXER_LOG_DIR
  || path.join(__dirname, '..', '..', '..', 'data', 'document-index');
const LOG_FILE  = path.join(LOG_DIR, 'errors.jsonl');
const MAX_FILE_BYTES = 10 * 1024 * 1024;           // rotate at 10 MB
const MEM_ERRORS = 500;                            // ring buffer size (errors+warnings)
// Throughput history is persisted and retained for 30 days (survives restarts).
const THROUGHPUT_RETENTION_DAYS = parseInt(process.env.DOCUMENT_INDEXER_THROUGHPUT_DAYS, 10) || 30;
const THROUGHPUT_RETENTION_MS = THROUGHPUT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
const THROUGHPUT_MAX_MINUTES = Math.floor(THROUGHPUT_RETENTION_MS / 60000);
const THROUGHPUT_FILE = path.join(LOG_DIR, 'throughput.json');
const THROUGHPUT_FLUSH_MS = 30000;                 // persist at most every 30s (when dirty)

// ── module state ──────────────────────────────────────────────

/** @type {Array<Object>} most-recent-last ring buffer of error/warn entries */
const errorBuf = [];
let errorSeq = 0;
const counts = { error: 0, warn: 0 };
/** sourceName → { count, lastAt, lastMessage } rollup for quick per-source view */
const bySource = new Map();

/** minute-epoch → { minute, processed, newNodes, enriched, errors } */
const buckets = new Map();
let _throughputDirty = false;

/** Load persisted throughput history on startup (pruned to the retention window). */
function loadThroughput() {
  try {
    const arr = JSON.parse(fs.readFileSync(THROUGHPUT_FILE, 'utf8'));
    const cutoff = minuteKey(Date.now()) - THROUGHPUT_RETENTION_MS;
    for (const b of arr) {
      if (!b || typeof b.minute !== 'number' || b.minute < cutoff) continue;
      buckets.set(b.minute, { minute: b.minute, processed: b.processed || 0, newNodes: b.newNodes || 0, enriched: b.enriched || 0, errors: b.errors || 0 });
    }
  } catch { /* no history yet */ }
}

/** Persist throughput history to disk (whole snapshot; ≤ ~43k small rows). */
function persistThroughput() {
  if (!_throughputDirty) return;
  ensureDir();
  try {
    const arr = [...buckets.values()].sort((a, b) => a.minute - b.minute);
    fs.writeFileSync(THROUGHPUT_FILE, JSON.stringify(arr));
    _throughputDirty = false;
  } catch { /* best-effort */ }
}

/** observers notified on each recorded error/warn (circuit breaker, incidents) */
const observers = [];
function onRecord(cb) { if (typeof cb === 'function') observers.push(cb); return () => { const i = observers.indexOf(cb); if (i >= 0) observers.splice(i, 1); }; }

let _dirReady = false;
function ensureDir() {
  if (_dirReady) return;
  try { fs.mkdirSync(LOG_DIR, { recursive: true }); _dirReady = true; } catch { /* ignore */ }
}

function rotateIfNeeded() {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size >= MAX_FILE_BYTES) {
      // Single-generation rotation: errors.jsonl → errors.1.jsonl (overwritten).
      fs.renameSync(LOG_FILE, path.join(LOG_DIR, 'errors.1.jsonl'));
    }
  } catch { /* file may not exist yet */ }
}

function appendFile(entry) {
  ensureDir();
  rotateIfNeeded();
  try { fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n'); } catch { /* best-effort */ }
}

// ── error / warning log ───────────────────────────────────────

/**
 * Record a failure or warning from the indexer.
 * @param {'error'|'warn'} level
 * @param {Object} info { sourceId, sourceName, phase, message, status, detail }
 *   phase: 'harvest' | 'enrich' | 'download' | 'probe' | 'backoff' | 'dispatch' | 'refresh' | ...
 */
function record(level, info = {}) {
  const lvl = level === 'warn' ? 'warn' : 'error';
  const entry = {
    id: ++errorSeq,
    at: nowIso(),
    level: lvl,
    sourceId: info.sourceId || null,
    sourceName: info.sourceName || null,
    phase: info.phase || 'unknown',
    status: info.status != null ? info.status : null,   // HTTP status when applicable
    message: String(info.message || '').slice(0, 2000),
    detail: info.detail != null ? String(info.detail).slice(0, 4000) : null,
  };
  entry.category = errorPolicy.classify(entry);

  counts[lvl]++;
  errorBuf.push(entry);
  while (errorBuf.length > MEM_ERRORS) errorBuf.shift();

  if (entry.sourceName) {
    const cur = bySource.get(entry.sourceName) || { sourceName: entry.sourceName, count: 0, lastAt: null, lastMessage: null };
    cur.count++; cur.lastAt = entry.at; cur.lastMessage = entry.message;
    bySource.set(entry.sourceName, cur);
  }

  // Reflect real errors (not warnings) in the throughput errors series so the
  // dashboard chart can overlay error rate against processing rate.
  if (lvl === 'error') recordThroughput({ errors: 1 });

  appendFile(entry);
  // Notify observers (circuit breaker, incident engine) — never let one throw
  // break error recording.
  for (const cb of observers) { try { cb(entry); } catch { /* ignore */ } }
  return entry;
}

/** Count of error entries in the last `windowMs` (for rate-based triggers). */
function errorRate(windowMs = 60000) {
  const cutoff = Date.now() - windowMs;
  let n = 0;
  for (let i = errorBuf.length - 1; i >= 0; i--) {
    if (errorBuf[i].level !== 'error') continue;
    if (Date.parse(errorBuf[i].at) < cutoff) break;
    n++;
  }
  return n;
}

/** Per-category rollup of the buffered entries. */
function categories() { return errorPolicy.categorize(errorBuf); }

const recordError = (info) => record('error', info);
const recordWarn  = (info) => record('warn', info);

/** @param {{level?:string, sourceId?:string, limit?:number}} opts */
function listErrors(opts = {}) {
  const limit = Math.min(Math.max(parseInt(opts.limit, 10) || 100, 1), MEM_ERRORS);
  let rows = errorBuf;
  if (opts.level === 'error' || opts.level === 'warn') rows = rows.filter(e => e.level === opts.level);
  if (opts.sourceId) rows = rows.filter(e => e.sourceId === opts.sourceId);
  // most-recent-first, capped
  return rows.slice(-limit).reverse();
}

function errorSummary() {
  return {
    errors: counts.error,
    warnings: counts.warn,
    total: counts.error + counts.warn,
    buffered: errorBuf.length,
    logFile: LOG_FILE,
    bySource: [...bySource.values()].sort((a, b) => b.count - a.count).slice(0, 30),
  };
}

// ── throughput ────────────────────────────────────────────────

function minuteKey(ms) { return Math.floor(ms / 60000) * 60000; }

/**
 * Record work done during one harvested page.
 * @param {{processed?:number, newNodes?:number, enriched?:number, errors?:number}} delta
 */
function recordThroughput(delta = {}) {
  const key = minuteKey(Date.now());
  const b = buckets.get(key) || { minute: key, processed: 0, newNodes: 0, enriched: 0, errors: 0 };
  b.processed += delta.processed || 0;
  b.newNodes  += delta.newNodes  || 0;
  b.enriched  += delta.enriched  || 0;
  b.errors    += delta.errors    || 0;
  buckets.set(key, b);
  _throughputDirty = true;
  // Evict buckets older than the 30-day retention window.
  const cutoff = key - THROUGHPUT_RETENTION_MS;
  for (const k of buckets.keys()) { if (k < cutoff) buckets.delete(k); }
}

// Nice aggregation bucket sizes (minutes) — snap to one that keeps the series
// under ~500 points for long windows.
const NICE_BUCKETS = [1, 5, 10, 15, 30, 60, 120, 240, 360, 720, 1440];
function pickBucketMinutes(n) {
  for (const size of NICE_BUCKETS) if (Math.ceil(n / size) <= 500) return size;
  return Math.ceil(n / 500);
}

/**
 * Throughput series for the last `minutes` minutes (retained up to 30 days),
 * oldest-first. Windows ≤ 3h are per-minute; longer windows are aggregated into
 * coarser buckets (summed) so the payload stays chart-friendly. Each point
 * carries `bucketMinutes` so the client can label granularity.
 * @param {number} minutes
 */
function throughputSeries(minutes = 60) {
  const n = Math.min(Math.max(parseInt(minutes, 10) || 60, 1), THROUGHPUT_MAX_MINUTES);
  const end = minuteKey(Date.now());
  const bucketMinutes = n <= 180 ? 1 : pickBucketMinutes(n);
  const stepMs = bucketMinutes * 60000;
  const start = end - (n - 1) * 60000;
  // Align the aggregated bucket start to the step grid.
  const gridStart = Math.floor(start / stepMs) * stepMs;
  const out = [];
  for (let t = gridStart; t <= end; t += stepMs) {
    let processed = 0, newNodes = 0, enriched = 0, errors = 0;
    for (let k = t; k < t + stepMs; k += 60000) {
      const b = buckets.get(k);
      if (!b) continue;
      processed += b.processed; newNodes += b.newNodes; enriched += b.enriched; errors += b.errors;
    }
    out.push({ minute: new Date(t).toISOString(), bucketMinutes, processed, newNodes, enriched, errors });
  }
  return out;
}

// ── util ──────────────────────────────────────────────────────

// new Date() is fine in the API process (not a workflow script).
function nowIso() { return new Date().toISOString(); }

// ── init: load persisted history + periodic/at-exit persistence ──

loadThroughput();
const _flushTimer = setInterval(persistThroughput, THROUGHPUT_FLUSH_MS);
if (_flushTimer.unref) _flushTimer.unref();      // don't keep the process alive
for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
  try { process.once(sig, () => { try { persistThroughput(); } catch { /* */ } }); } catch { /* */ }
}

module.exports = {
  recordError, recordWarn,
  listErrors, errorSummary,
  recordThroughput, throughputSeries, persistThroughput,
  onRecord, errorRate, categories,
  LOG_FILE, THROUGHPUT_FILE, THROUGHPUT_RETENTION_DAYS,
};
