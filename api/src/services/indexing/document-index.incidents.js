'use strict';
/**
 * DocumentIndexIncidents — problem register + remediation-action executor.
 *
 * An INCIDENT is a deduplicated problem for a source (or global), e.g. "UNHCR
 * Refworld — repeated CONFIG_MISSING errors". Each incident carries:
 *   - a deterministic diagnosis (category + response methodology),
 *   - proposed remediation ACTIONS (from the deterministic engine and/or the AI),
 *     each rated for criticality → auto-applied or escalated for admin approval,
 *   - an admin↔AI chat thread.
 *
 * The circuit breaker (in document-index.service) performs the immediate
 * protective action (pausing a spiking source); this module records the problem,
 * proposes remediations, executes approved/auto-approved actions, and is the data
 * source for the dashboard "Incidents & AI Response" section.
 */

const fs = require('fs');
const path = require('path');

const errorPolicy = require('./document-index.error-policy');
const criticality = require('./document-index.criticality');

const DIR  = process.env.DOCUMENT_INDEXER_LOG_DIR
  || path.join(__dirname, '..', '..', '..', 'data', 'document-index');
const FILE = path.join(DIR, 'incidents.json');
const MAX_INCIDENTS = 500;

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

/** @type {Map<string, Object>} id → incident */
const incidents = new Map();
let seq = 0;
let loaded = false;

function ensureDir() { try { fs.mkdirSync(DIR, { recursive: true }); } catch { /* ignore */ } }
function nowIso() { return new Date().toISOString(); }

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const arr = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const inc of arr) { incidents.set(inc.id, inc); seq = Math.max(seq, inc.seq || 0); }
  } catch { /* fresh */ }
}

function persist() {
  ensureDir();
  try {
    const arr = [...incidents.values()].sort((a, b) => (b.seq || 0) - (a.seq || 0)).slice(0, MAX_INCIDENTS);
    fs.writeFileSync(FILE, JSON.stringify(arr, null, 2));
  } catch { /* best-effort */ }
}

function keyOf({ scope, sourceId, category }) { return `${scope || 'source'}:${sourceId || 'global'}:${category || 'UNKNOWN'}`; }

// ── deterministic remediation proposals per category ──────────────

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function proposeForCategory(category, sourceId) {
  switch (category) {
    case 'CONFIG_MISSING':
      return [
        { type: 'set_source_config', params: { sourceId }, rationale: 'Source has no URL/endpoint configured — set the catalog URL / search template.' },
        { type: 'disable_source',    params: { sourceId }, rationale: 'If the source is obsolete, disable it to stop the error spam.' },
      ];
    case 'ACCESS_BLOCKED':
      return [
        { type: 'set_source_headers', params: { sourceId, headers: { 'User-Agent': BROWSER_UA } }, rationale: 'Retry with browser-like headers to get past bot/WAF filtering.' },
        { type: 'set_backoff',        params: { sourceId, ms: 300000 }, rationale: 'Back off 5 min before retrying a blocked source.' },
      ];
    case 'RATE_LIMITED':
      return [
        { type: 'set_backoff',        params: { sourceId, ms: 300000 }, rationale: 'Exponential backoff while the remote throttles us.' },
        { type: 'adjust_concurrency', params: { workers: 6 }, rationale: 'Lower worker count to reduce request pressure.' },
      ];
    case 'PARSE_ERROR':
      return [
        { type: 'pause_source',  params: { sourceId, ms: 600000 }, rationale: 'Pause while the adapter/parse bug is investigated.' },
        { type: 'notify_admin',  params: { sourceId }, rationale: 'Adapter parsing failed — likely needs a code fix.' },
      ];
    case 'NETWORK':
    case 'SERVER_ERROR':
      return [ { type: 'set_backoff', params: { sourceId, ms: 120000 }, rationale: 'Transient remote/network failure — short backoff and retry.' } ];
    case 'NOT_FOUND':
      return [ { type: 'notify_admin', params: { sourceId }, rationale: '404 on page 1 suggests a moved/broken endpoint.' } ];
    default:
      return [ { type: 'notify_admin', params: { sourceId }, rationale: 'Unclassified failure — review the error detail.' } ];
  }
}

function makeAction(tpl, source = 'system') {
  const crit = criticality.rate(tpl);
  return {
    id: `act_${++seq}`,
    type: tpl.type,
    params: tpl.params || {},
    rationale: tpl.rationale || '',
    criticality: crit,
    source,                                   // 'system' | 'ai' | 'admin'
    status: criticality.isAutoApplicable(tpl) ? 'auto_applicable' : 'pending_approval',
    createdAt: nowIso(),
    decidedBy: null, decidedAt: null, result: null,
  };
}

// ── incident lifecycle ────────────────────────────────────────────

/**
 * Create or update (dedup) an incident.
 * @returns the incident.
 */
function raise({ scope = 'source', sourceId, sourceName, category = 'UNKNOWN', title, description, source = 'system', proposals } = {}) {
  load();
  const key = keyOf({ scope, sourceId, category });
  let inc = [...incidents.values()].find(i => i.key === key && i.status !== 'resolved' && i.status !== 'auto_resolved');
  const cat = errorPolicy.CATEGORIES[category] || errorPolicy.CATEGORIES.UNKNOWN;

  if (!inc) {
    inc = {
      id: `inc_${++seq}`, seq, key, scope, sourceId: sourceId || null, sourceName: sourceName || null,
      category, severity: cat.severity, methodology: cat.methodology,
      title: title || `${sourceName || 'Global'} — ${cat.label}`,
      description: description || '',
      status: cat.transient === false ? 'escalated' : 'open',
      errorCount: 1, firstSeen: nowIso(), lastSeen: nowIso(),
      proposedActions: [], appliedActions: [], chat: [], aiDiagnosis: null,
      createdBy: source, updatedAt: nowIso(),
    };
    incidents.set(inc.id, inc);
  } else {
    inc.errorCount++; inc.lastSeen = nowIso(); inc.updatedAt = nowIso();
    if (sourceName) inc.sourceName = sourceName;
  }

  // Attach deterministic proposals (dedup by type) unless the incident already
  // has proposals of that type.
  const tpls = proposals || proposeForCategory(category, sourceId);
  for (const tpl of tpls) {
    if (inc.proposedActions.some(a => a.type === tpl.type && a.status !== 'rejected')) continue;
    inc.proposedActions.push(makeAction(tpl, source));
  }
  persist();
  return inc;
}

/** Called by the circuit breaker when a source is quarantined. */
function onCircuitOpen({ sourceId, sourceName, category, trips, openUntil }) {
  const inc = raise({
    scope: 'source', sourceId, sourceName, category: (errorPolicy.CATEGORIES[category] ? category : 'UNKNOWN'),
    description: `Circuit breaker quarantined this source (trip ${trips}) until ${new Date(openUntil).toISOString()} after an error spike.`,
    source: 'system',
  });
  // Autonomously apply the safe (auto-applicable) remediations right away;
  // higher-criticality actions stay escalated for admin approval.
  autoApply(inc.id).catch(() => {});
  return inc;
}

/** Called when a source produces a clean page (recovered). */
function onSourceRecovered(sourceId) {
  load();
  let changed = false;
  for (const inc of incidents.values()) {
    if (inc.sourceId === sourceId && (inc.status === 'open' || inc.status === 'escalated')) {
      // Only auto-resolve transient categories; config/access issues need a real fix.
      const cat = errorPolicy.CATEGORIES[inc.category];
      if (cat && cat.transient) { inc.status = 'auto_resolved'; inc.updatedAt = nowIso(); changed = true; }
    }
  }
  if (changed) persist();
}

function list({ status, limit = 200 } = {}) {
  load();
  let rows = [...incidents.values()].sort((a, b) => (b.seq || 0) - (a.seq || 0));
  if (status) rows = rows.filter(i => i.status === status);
  return rows.slice(0, limit);
}

function get(id) { load(); return incidents.get(id) || null; }

function summary() {
  load();
  const all = [...incidents.values()];
  const open = all.filter(i => i.status === 'open' || i.status === 'escalated');
  const pendingApprovals = all.reduce((n, i) => n + i.proposedActions.filter(a => a.status === 'pending_approval').length, 0);
  return {
    total: all.length,
    open: open.length,
    escalated: all.filter(i => i.status === 'escalated').length,
    pendingApprovals,
    bySeverity: ['high', 'medium', 'low'].map(s => ({ severity: s, count: open.filter(i => i.severity === s).length })),
  };
}

// ── action execution ──────────────────────────────────────────────

function svc() { return require('./document-index.service').getDocumentIndexService(); }
function catalog() { return require('../knowledge/source-catalog.service').sourceCatalogService; }

/** Execute one remediation action. Returns { ok, detail }. */
async function applyAction(action) {
  const p = action.params || {};
  const sid = p.sourceId || action.sourceId;
  try {
    switch (action.type) {
      case 'pause_source':       return ok(svc().pauseSource(sid, p.ms, action.rationale || 'incident'));
      case 'set_backoff':        return ok(svc().pauseSource(sid, p.ms || 120000, 'backoff'));
      case 'resume_source':      return ok(svc().resumeSource(sid));
      case 'reindex_source':     return ok(await svc().reindexSource(sid));
      case 'adjust_concurrency': return ok({ concurrency: svc().setConcurrency(p.workers) });
      case 'disable_source':     await catalog().update(sid, { enabled: false }); svc()._sourcesLoadedAt = 0; return ok({ disabled: sid });
      case 'enable_source':      await catalog().update(sid, { enabled: true });  svc()._sourcesLoadedAt = 0; return ok({ enabled: sid });
      case 'set_source_headers': {
        const src = await catalog().get(sid);
        const cfg = { ...(src?.config || {}), headers: { ...((src?.config || {}).headers || {}), ...(p.headers || {}) } };
        await catalog().update(sid, { config: cfg }); svc()._sourcesLoadedAt = 0;
        return ok({ headersSet: Object.keys(p.headers || {}) });
      }
      case 'set_source_config': {
        if (!p.config || typeof p.config !== 'object') return { ok: false, detail: 'no config provided — set url/template manually' };
        const src = await catalog().get(sid);
        await catalog().update(sid, { config: { ...(src?.config || {}), ...p.config } }); svc()._sourcesLoadedAt = 0;
        return ok({ configKeys: Object.keys(p.config) });
      }
      case 'extend_policy':      return ok(criticality.updatePolicy(p.patch || p, action.source || 'ai'));
      case 'notify_admin':       return ok({ notified: true });
      default:                   return { ok: false, detail: `unknown action type: ${action.type}` };
    }
  } catch (e) {
    return { ok: false, detail: e.message };
  }
}
function ok(detail) { return { ok: true, detail }; }

/** Auto-apply all auto-applicable proposed actions of an incident (autonomous). */
async function autoApply(incidentId) {
  const inc = get(incidentId);
  if (!inc) return [];
  const done = [];
  for (const a of inc.proposedActions) {
    if (a.status !== 'auto_applicable') continue;
    const r = await applyAction(a);
    a.status = r.ok ? 'auto_applied' : 'failed';
    a.decidedBy = 'auto'; a.decidedAt = nowIso(); a.result = r.detail;
    if (r.ok) inc.appliedActions.push(a.id);
    done.push({ action: a, result: r });
  }
  inc.updatedAt = nowIso();
  persist();
  return done;
}

/** Admin decision on a single escalated action. */
async function decide(incidentId, actionId, decision, by = 'admin') {
  const inc = get(incidentId);
  if (!inc) throw new Error('incident not found');
  const a = inc.proposedActions.find(x => x.id === actionId);
  if (!a) throw new Error('action not found');
  if (decision === 'reject') {
    a.status = 'rejected'; a.decidedBy = by; a.decidedAt = nowIso();
  } else if (decision === 'approve') {
    const r = await applyAction(a);
    a.status = r.ok ? 'approved' : 'failed';
    a.decidedBy = by; a.decidedAt = nowIso(); a.result = r.detail;
    if (r.ok) inc.appliedActions.push(a.id);
  } else {
    throw new Error('decision must be approve|reject');
  }
  inc.updatedAt = nowIso();
  // Resolve the incident once nothing is left pending.
  if (!inc.proposedActions.some(x => x.status === 'pending_approval' || x.status === 'auto_applicable')) {
    if (inc.status !== 'resolved') inc.status = 'acknowledged';
  }
  persist();
  return inc;
}

function resolve(id, by = 'admin') {
  const inc = get(id); if (!inc) throw new Error('incident not found');
  inc.status = 'resolved'; inc.resolvedBy = by; inc.resolvedAt = nowIso(); inc.updatedAt = nowIso();
  persist(); return inc;
}

/** Attach an AI diagnosis + AI-proposed actions to an incident. */
function attachAiResult(incidentId, { diagnosis, actions = [] } = {}) {
  const inc = get(incidentId); if (!inc) return null;
  if (diagnosis) inc.aiDiagnosis = diagnosis;
  for (const tpl of actions) {
    if (inc.proposedActions.some(a => a.type === tpl.type && a.status !== 'rejected')) continue;
    inc.proposedActions.push(makeAction(tpl, 'ai'));
  }
  inc.updatedAt = nowIso();
  persist();
  return inc;
}

function addChat(incidentId, role, text) {
  const inc = get(incidentId); if (!inc) throw new Error('incident not found');
  const msg = { role, text: String(text || '').slice(0, 8000), at: nowIso() };
  inc.chat.push(msg); inc.updatedAt = nowIso();
  persist();
  return msg;
}

module.exports = {
  raise, onCircuitOpen, onSourceRecovered,
  list, get, summary,
  applyAction, autoApply, decide, resolve,
  attachAiResult, addChat, proposeForCategory, makeAction,
  FILE,
};
