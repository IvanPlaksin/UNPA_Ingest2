'use strict';

/**
 * Prompt overlays (ADMIN P5 — session-analysis agent) — operator-applied prompt
 * guidance that tunes the chat WITHOUT code changes, at two scopes:
 *
 *   - scope 'global'  → appended to the ROUTER / INFO_ANSWER / QUESTION_PLANNER
 *                       prompts for EVERY conversation (general functionality).
 *   - scope 'service' → appended to QUESTION_PLANNER only when the active
 *                       SchemaSnapshot's serviceId matches (schema-specific
 *                       wording problems, field-clarity fixes).
 *
 * Stored as (:FlowdeskPromptOverlay) nodes in Memgraph — deliberately SEPARATE
 * from the schema-graph, so a re-materialization of an Altiora form (which
 * regenerates ServiceDef/SlotDef) can never wipe an applied overlay.
 *
 * Multiple active overlays per scope are concatenated oldest-first; guidance is
 * length-capped so a pile of overlays can't blow up the turn prompts. The
 * getGuidance() read path is cached (30s) because it runs on every turn.
 *
 * @module instances/flowdesk/services/prompt-overlay.service
 */

const crypto = require('crypto');

const SCOPES = ['global', 'service'];
const MAX_TEXT = 2000;          // per-overlay cap
const MAX_GUIDANCE = 4000;      // per-scope concatenated cap
const CACHE_MS = 30 * 1000;

let _write = null;
let _read = null;
function w() { if (!_write) _write = require('../schema-graph/driver').write; return _write; }
function r() { if (!_read) _read = require('../schema-graph/driver').read; return _read; }

let _cache = { at: 0, byKey: new Map() }; // key: 'global' | `service:${serviceId}`

function invalidateCache() { _cache = { at: 0, byKey: new Map() }; }

const props = (row, key) => row.get(key).properties;

/**
 * Apply (create) an overlay. Returns the stored overlay.
 * @param {object} p {scope, serviceId?, text, rationale?, sourceSessionId?, updatedBy?}
 */
async function applyOverlay(p) {
  const { scope, serviceId, text, rationale, sourceSessionId, updatedBy } = p || {};
  if (!SCOPES.includes(scope)) throw Object.assign(new Error(`scope must be one of ${SCOPES.join(', ')}`), { status: 400 });
  if (scope === 'service' && !serviceId) throw Object.assign(new Error('serviceId is required for scope=service'), { status: 400 });
  const body = String(text || '').trim();
  if (body.length < 10) throw Object.assign(new Error('text must be at least 10 characters'), { status: 400 });
  if (body.length > MAX_TEXT) throw Object.assign(new Error(`text exceeds ${MAX_TEXT} characters`), { status: 400 });

  const overlay = {
    overlayId: `POV-${crypto.randomUUID().slice(0, 8)}`,
    scope, serviceId: scope === 'service' ? serviceId : null,
    text: body, rationale: rationale || null,
    sourceSessionId: sourceSessionId || null,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || 'admin',
  };
  await w()(
    `CREATE (o:FlowdeskPromptOverlay {overlayId:$overlayId, scope:$scope, serviceId:$serviceId,
       text:$text, rationale:$rationale, sourceSessionId:$sourceSessionId, active:$active,
       createdAt:$createdAt, updatedAt:$updatedAt, updatedBy:$updatedBy})`,
    overlay
  );
  invalidateCache();
  return overlay;
}

/** List overlays (newest first). Filters: scope, serviceId, active. */
async function listOverlays({ scope, serviceId, active } = {}) {
  const conds = [];
  const params = {};
  if (scope) { conds.push('o.scope = $scope'); params.scope = scope; }
  if (serviceId) { conds.push('o.serviceId = $serviceId'); params.serviceId = serviceId; }
  if (active !== undefined && active !== null && active !== '') {
    conds.push('o.active = $active'); params.active = active === true || active === 'true';
  }
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
  const rows = await r()(
    `MATCH (o:FlowdeskPromptOverlay) ${where} RETURN o ORDER BY o.createdAt DESC LIMIT 200`, params);
  return rows.map((row) => props(row, 'o'));
}

/** Activate/deactivate one overlay (deactivation = soft revert of an applied change). */
async function setOverlayActive(overlayId, active) {
  const rows = await w()(
    `MATCH (o:FlowdeskPromptOverlay {overlayId:$overlayId})
     SET o.active=$active, o.updatedAt=$ts RETURN o`,
    { overlayId, active: !!active, ts: new Date().toISOString() });
  if (!rows.length) throw Object.assign(new Error('overlay not found'), { status: 404 });
  invalidateCache();
  return props(rows[0], 'o');
}

/**
 * The active overlays for one scope, as {text, ids}. Cached 30s.
 * `text` is what actually reaches the model (post-truncation); `ids` lists every
 * contributing overlay, including any whose tail the MAX_GUIDANCE cap cut off —
 * so a diagnosis can tell "which overlays were in play" apart from "what the
 * model actually read".
 */
async function activeOverlays(scope, serviceId) {
  const key = scope === 'global' ? 'global' : `service:${serviceId}`;
  const now = Date.now();
  if (now - _cache.at > CACHE_MS) _cache = { at: now, byKey: new Map() };
  if (_cache.byKey.has(key)) return _cache.byKey.get(key);

  const params = scope === 'global' ? { scope } : { scope, serviceId };
  const rows = await r()(
    `MATCH (o:FlowdeskPromptOverlay {scope:$scope}) WHERE o.active = true
       ${scope === 'service' ? 'AND o.serviceId = $serviceId' : ''}
     RETURN o.overlayId AS overlayId, o.text AS text ORDER BY o.createdAt ASC`, params);
  let joined = rows.map((row) => `- ${row.get('text')}`).join('\n');
  if (joined.length > MAX_GUIDANCE) joined = joined.slice(0, MAX_GUIDANCE);
  const out = { text: joined || null, ids: rows.map((row) => row.get('overlayId')).filter(Boolean) };
  _cache.byKey.set(key, out);
  return out;
}

async function activeTexts(scope, serviceId) {
  return (await activeOverlays(scope, serviceId)).text;
}

/**
 * The per-turn read path: guidance for the engine's LLM nodes. NEVER throws —
 * an overlay-store failure must not break a chat turn.
 * @returns {Promise<{global: string|null, service: string|null}>}
 */
async function getGuidance(serviceId) {
  try {
    const [global, service] = await Promise.all([
      activeTexts('global'),
      serviceId ? activeTexts('service', serviceId) : Promise.resolve(null),
    ]);
    return { global, service };
  } catch (err) {
    console.warn('[prompt-overlay] getGuidance failed:', err.message);
    return { global: null, service: null };
  }
}

/**
 * Provenance of the overlays that shaped one turn (SUADA-PREREQ-001.1). Overlays
 * are the SECOND independent lever on chat behavior: an operator can change the
 * chat without touching the prompt-graph, so a turn attributed only by
 * promptTextHash can silently mean two different things. Uses the same 30s cache
 * the engine already reads per turn — no extra query. NEVER throws.
 *
 * The hash covers the guidance as the model actually received it: global first,
 * then the service-scoped block (the order the engine joins them in). A turn with
 * no active overlays gets a null hash and an empty id list — distinguishable from
 * a telemetry failure only by the fact that this function does not fail.
 * @returns {Promise<{overlayHash:string|null, overlayIds:string[]}>}
 */
async function getProvenance(serviceId) {
  try {
    const [global, service] = await Promise.all([
      activeOverlays('global'),
      serviceId ? activeOverlays('service', serviceId) : Promise.resolve({ text: null, ids: [] }),
    ]);
    const effective = [global.text, service.text].filter(Boolean).join('\n');
    return {
      overlayHash: effective ? crypto.createHash('sha256').update(effective).digest('hex') : null,
      overlayIds: [...global.ids, ...service.ids],
    };
  } catch (err) {
    console.warn('[prompt-overlay] getProvenance failed:', err.message);
    return { overlayHash: null, overlayIds: [] };
  }
}

/** Test seam. */
function _setDeps({ write, read } = {}) { _write = write || null; _read = read || null; invalidateCache(); }

module.exports = {
  applyOverlay, listOverlays, setOverlayActive, getGuidance, getProvenance,
  invalidateCache, SCOPES, MAX_TEXT, MAX_GUIDANCE, _setDeps,
};
