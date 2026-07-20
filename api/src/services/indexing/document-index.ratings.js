'use strict';
/**
 * DocumentIndexRatings — per-source indexing-efficiency rating + pool-quota policy.
 *
 * Every harvested page reports an outcome (latency, docs processed, NEW docs,
 * ok/error). From a rolling per-source window we derive an EFFICIENCY SCORE
 * (0–100) and TIER (fast / normal / slow / stalled), then translate that into a
 * per-source QUOTA = the maximum number of pool slots (concurrent page-tasks)
 * that source may hold.
 *
 * Why: a few slow, unproductive sources (WAF 202-retry latency, timeouts, or
 * re-scanning already-indexed pages for 0 new docs) were occupying the worker
 * pool and starving fast, productive sources. Quota-by-efficiency caps the slow
 * ones at a single slot so they can still make progress but can never clog the
 * pool, while fast/high-yield sources are allowed many parallel pages.
 *
 * Pure in-memory + rolling (rebuilds within one window after a restart).
 */

function envInt(name, def) { const v = parseInt(process.env[name], 10); return Number.isFinite(v) ? v : def; }
function envFloat(name, def) { const v = parseFloat(process.env[name]); return Number.isFinite(v) ? v : def; }

const CFG = {
  windowMs:     envInt('DOCUMENT_INDEXER_RATING_WINDOW_MS', 30 * 60 * 1000), // rolling window
  maxSamples:   envInt('DOCUMENT_INDEXER_RATING_MAX_SAMPLES', 60),           // ring size per source
  minSamples:   envInt('DOCUMENT_INDEXER_RATING_MIN_SAMPLES', 4),            // below this → exploration quota
  baselineMs:   envInt('DOCUMENT_INDEXER_RATING_BASELINE_MS', 1500),         // a page at/under this = full speed score
  explorationCap: envInt('DOCUMENT_INDEXER_RATING_EXPLORATION_CAP', 3),      // quota for not-yet-rated sources
  // Score weights (sum ~1): productive yield dominates, then speed, then health.
  wYield:  envFloat('DOCUMENT_INDEXER_RATING_W_YIELD', 0.55),
  wSpeed:  envFloat('DOCUMENT_INDEXER_RATING_W_SPEED', 0.30),
  wHealth: envFloat('DOCUMENT_INDEXER_RATING_W_HEALTH', 0.15),
};

const TIERS = {
  fast:    { min: 66, label: 'Fast' },
  normal:  { min: 33, label: 'Normal' },
  slow:    { min: 0,  label: 'Slow' },
  stalled: { min: 0,  label: 'Stalled' },   // special: enough samples, 0 new docs
};

/** @type {Map<string, {name:string, samples:Array}>} sourceId → rolling samples */
const store = new Map();

function nowMs() { return Date.now(); }

/**
 * Record one page outcome.
 * @param {string} sourceId
 * @param {{name?:string, latencyMs:number, processed?:number, newNodes?:number, ok?:boolean}} s
 */
function record(sourceId, s = {}) {
  if (!sourceId) return;
  let rec = store.get(sourceId);
  if (!rec) { rec = { name: s.name || null, samples: [] }; store.set(sourceId, rec); }
  if (s.name) rec.name = s.name;
  rec.samples.push({
    at: nowMs(),
    latencyMs: Math.max(0, Number(s.latencyMs) || 0),
    processed: Math.max(0, Number(s.processed) || 0),
    newNodes:  Math.max(0, Number(s.newNodes)  || 0),
    ok: s.ok !== false,
  });
  // Trim by count and by age.
  const cutoff = nowMs() - CFG.windowMs;
  rec.samples = rec.samples.filter(x => x.at >= cutoff);
  if (rec.samples.length > CFG.maxSamples) rec.samples = rec.samples.slice(-CFG.maxSamples);
}

/** Aggregate a source's rolling window into metrics. */
function statsFor(sourceId) {
  const rec = store.get(sourceId);
  const samples = rec ? rec.samples.filter(x => x.at >= nowMs() - CFG.windowMs) : [];
  const pages = samples.length;
  let processed = 0, newNodes = 0, latencyMs = 0, errors = 0;
  for (const x of samples) {
    processed += x.processed; newNodes += x.newNodes; latencyMs += x.latencyMs;
    if (!x.ok) errors++;
  }
  const avgLatencyMs = pages ? latencyMs / pages : 0;
  const workSec = latencyMs / 1000;
  const newPerMin = workSec > 0 ? (newNodes / workSec) * 60 : 0;   // new docs per minute of slot-work
  const docsPerMin = workSec > 0 ? (processed / workSec) * 60 : 0;
  const newRatio = processed ? newNodes / processed : 0;
  const errorRate = pages ? errors / pages : 0;
  return { name: rec?.name || null, pages, processed, newNodes, avgLatencyMs, newPerMin, docsPerMin, newRatio, errorRate };
}

/** Efficiency score 0–100 + tier for a source. */
function scoreFor(sourceId) {
  const m = statsFor(sourceId);
  if (m.pages < CFG.minSamples) {
    return { ...m, score: null, tier: 'unrated' };
  }
  const yieldF = Math.max(0, Math.min(1, m.newRatio));
  const speedF = Math.max(0, Math.min(1, m.avgLatencyMs > 0 ? CFG.baselineMs / m.avgLatencyMs : 1));
  const healthF = Math.max(0, 1 - Math.min(1, m.errorRate));
  let score = 100 * (CFG.wYield * yieldF + CFG.wSpeed * speedF + CFG.wHealth * healthF);
  score = Math.round(Math.max(0, Math.min(100, score)));
  // Stalled: enough samples but zero productive output — the source is churning.
  const stalled = m.newNodes === 0;
  let tier = 'slow';
  if (stalled) tier = 'stalled';
  else if (score >= TIERS.fast.min) tier = 'fast';
  else if (score >= TIERS.normal.min) tier = 'normal';
  return { ...m, score, tier, stalled };
}

/**
 * Per-source pool quota (max concurrent page-tasks). Slow/stalled → 1 (can still
 * progress, never clogs); fast/high-yield → up to maxCap. Unrated sources get a
 * small exploration quota so a new source has a chance to prove itself.
 */
function quotaFor(sourceId, maxCap) {
  const cap = Math.max(1, parseInt(maxCap, 10) || 1);
  const r = scoreFor(sourceId);
  if (r.tier === 'unrated') return Math.min(CFG.explorationCap, cap);
  if (r.tier === 'stalled') return 1;
  // Linear map score→quota, floored at 1.
  const q = 1 + Math.round((cap - 1) * (r.score / 100));
  return Math.max(1, Math.min(cap, q));
}

/** All rated sources (for the API / dashboard), sorted best-first. */
function list(maxCap = 8) {
  const rows = [];
  for (const id of store.keys()) {
    const r = scoreFor(id);
    rows.push({
      sourceId: id, name: r.name,
      score: r.score, tier: r.tier,
      pages: r.pages, processed: r.processed, newNodes: r.newNodes,
      avgLatencyMs: Math.round(r.avgLatencyMs),
      newPerMin: Math.round(r.newPerMin * 10) / 10,
      docsPerMin: Math.round(r.docsPerMin),
      newRatio: Math.round(r.newRatio * 100) / 100,
      errorRate: Math.round(r.errorRate * 100) / 100,
      quota: quotaFor(id, maxCap),
    });
  }
  // Rated first (by score desc), then unrated, then stalled last.
  const rank = (t) => t === 'stalled' ? -1 : t === 'unrated' ? 0.5 : 1;
  return rows.sort((a, b) => (rank(b.tier) - rank(a.tier)) || ((b.score ?? -1) - (a.score ?? -1)));
}

function reset(sourceId) { if (sourceId) store.delete(sourceId); else store.clear(); }

/** Wall-clock throughput for a source over the last `windowMs` (default 60s). */
function recentRate(sourceId, windowMs = 60000) {
  const rec = store.get(sourceId);
  if (!rec) return { processedPerMin: 0, newPerMin: 0 };
  const cutoff = nowMs() - windowMs;
  let processed = 0, newNodes = 0;
  for (const s of rec.samples) { if (s.at >= cutoff) { processed += s.processed; newNodes += s.newNodes; } }
  const scale = 60000 / windowMs;
  return { processedPerMin: Math.round(processed * scale), newPerMin: Math.round(newNodes * scale) };
}

module.exports = { record, statsFor, scoreFor, quotaFor, recentRate, list, reset, CFG, TIERS };
