'use strict';
/**
 * DocumentIndexQuota — pool-share allocation for the indexer.
 *
 * Quotas are expressed as FRACTIONS (shares) of the worker pool, not raw slot
 * counts. Shares sum to 1.0 across the ACTIVE sources — enabled sources that
 * still have work: either an unknown final size, or `indexed < indexTotal`
 * (i.e. not complete/quarantined). A source's slot budget is `round(share ×
 * poolSize)`, so the whole pool is divided proportionally.
 *
 * Two modes:
 *   • AUTO  — shares are derived from live processing efficiency with a GUARANTEED
 *             floor so no active source starves:
 *                 share_i = g/N + (1-g) · eff_i / Σeff
 *             where N = active count, g = guaranteedFraction (split equally as the
 *             floor g/N), and the (1-g) surplus is distributed by efficiency. A
 *             source that slows down loses surplus; one that speeds up gains it,
 *             but every source keeps at least g/N.
 *   • MANUAL — the admin sets shares directly via the dashboard segmented slider;
 *             shares are stored and renormalised over whatever subset is active.
 *
 * Persisted to data/document-index/quota.json (survives restart).
 */

const fs = require('fs');
const path = require('path');

const DIR  = process.env.DOCUMENT_INDEXER_LOG_DIR
  || path.join(__dirname, '..', '..', '..', 'data', 'document-index');
const FILE = path.join(DIR, 'quota.json');

function envFloat(name, def) { const v = parseFloat(process.env[name]); return Number.isFinite(v) ? v : def; }

const CFG = {
  // Fraction reserved as an equally-split guaranteed floor (the rest is
  // distributed by efficiency). 0 = pure efficiency, 1 = pure equal split.
  guaranteedFraction: envFloat('DOCUMENT_INDEXER_QUOTA_GUARANTEED', 0.5),
  // Efficiency floor so a stalled (score 0) source still competes for surplus.
  minEff: 1,
};

let _state = null;   // { mode:'auto'|'manual', manualShares:{id:frac}, guaranteedFraction, updatedAt }
let _dirty = false;

function ensureDir() { try { fs.mkdirSync(DIR, { recursive: true }); } catch { /* ignore */ } }
function nowIso() { return new Date().toISOString(); }

function load() {
  if (_state) return _state;
  try {
    _state = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch { _state = {}; }
  _state.mode = _state.mode === 'manual' ? 'manual' : 'auto';
  _state.manualShares = _state.manualShares && typeof _state.manualShares === 'object' ? _state.manualShares : {};
  if (!Number.isFinite(_state.guaranteedFraction)) _state.guaranteedFraction = CFG.guaranteedFraction;
  return _state;
}
function persist() {
  if (!_dirty) return;
  ensureDir();
  try { fs.writeFileSync(FILE, JSON.stringify(load(), null, 2)); _dirty = false; } catch { /* best-effort */ }
}
function markDirty() { _dirty = true; load().updatedAt = nowIso(); }

// ── policy ────────────────────────────────────────────────────

function getMode() { return load().mode; }
function setMode(mode) {
  const s = load();
  s.mode = mode === 'manual' ? 'manual' : 'auto';
  markDirty(); persist();
  return s.mode;
}
function getGuaranteedFraction() { return load().guaranteedFraction; }
function setGuaranteedFraction(g) {
  const s = load();
  s.guaranteedFraction = Math.max(0, Math.min(1, Number(g)));
  markDirty(); persist();
  return s.guaranteedFraction;
}

/**
 * Set manual shares. Accepts a partial map { sourceId: fraction }; values are
 * normalised to sum to 1. Switches the policy to MANUAL.
 */
function setManualShares(shares = {}) {
  const s = load();
  const clean = {};
  let sum = 0;
  for (const [id, v] of Object.entries(shares)) {
    const f = Math.max(0, Number(v) || 0);
    clean[id] = f; sum += f;
  }
  if (sum > 0) for (const id of Object.keys(clean)) clean[id] /= sum;
  s.manualShares = clean;
  s.mode = 'manual';
  markDirty(); persist();
  return s.manualShares;
}

/**
 * Compute normalised shares over the active sources.
 * @param {Array<{id, name, efficiency, docsPerMin}>} active
 * @returns {Map<string, number>} sourceId → share (sums to 1)
 */
function computeShares(active) {
  const s = load();
  const n = active.length;
  const shares = new Map();
  if (!n) return shares;

  if (s.mode === 'manual') {
    // Use stored shares for active sources; sources without one get an equal
    // slice of the leftover so newly-active sources still run. Renormalise.
    let assigned = 0, missing = [];
    for (const src of active) {
      const v = s.manualShares[src.id];
      if (Number.isFinite(v) && v > 0) { shares.set(src.id, v); assigned += v; }
      else missing.push(src.id);
    }
    const leftover = Math.max(0, 1 - assigned);
    if (missing.length) { const each = (leftover || (1 / n)) / missing.length; for (const id of missing) shares.set(id, each); }
    normalise(shares);
    return shares;
  }

  // AUTO: guaranteed floor + efficiency-weighted surplus.
  const g = s.guaranteedFraction;
  const effs = active.map(a => Math.max(CFG.minEff, Number(a.efficiency) || CFG.minEff));
  const effSum = effs.reduce((a, b) => a + b, 0) || 1;
  active.forEach((src, i) => {
    const floor = g / n;
    const surplus = (1 - g) * (effs[i] / effSum);
    shares.set(src.id, floor + surplus);
  });
  normalise(shares);
  return shares;
}

function normalise(shares) {
  let sum = 0; for (const v of shares.values()) sum += v;
  if (sum > 0) for (const [k, v] of shares) shares.set(k, v / sum);
}

/**
 * Slot budget for a source: round(share × poolSize), at least 1 for an active
 * source (so it never fully starves). Returns 0 for a non-active source.
 */
function slotsFor(sourceId, poolSize, shares) {
  const share = shares.get(sourceId);
  if (share == null) return 0;
  return Math.max(1, Math.round(share * poolSize));
}

/** Full snapshot for the API / dashboard. */
function snapshot(active, poolSize) {
  const shares = computeShares(active);
  const rows = active.map(a => ({
    sourceId: a.id, name: a.name,
    share: Math.round((shares.get(a.id) || 0) * 1000) / 1000,
    slots: slotsFor(a.id, poolSize, shares),
    docsPerMin: Math.round(a.docsPerMin || 0),
    efficiency: a.efficiency != null ? Math.round(a.efficiency) : null,
  }));
  rows.sort((x, y) => y.share - x.share);
  return {
    mode: load().mode,
    guaranteedFraction: load().guaranteedFraction,
    poolSize,
    activeCount: active.length,
    sources: rows,
  };
}

load();
for (const sig of ['SIGINT', 'SIGTERM', 'beforeExit']) {
  try { process.once(sig, () => { try { persist(); } catch { /* */ } }); } catch { /* */ }
}

module.exports = {
  getMode, setMode, getGuaranteedFraction, setGuaranteedFraction,
  setManualShares, computeShares, slotsFor, snapshot, CFG,
};
