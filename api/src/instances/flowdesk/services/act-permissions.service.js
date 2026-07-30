'use strict';

/**
 * ACT permissions store (Phase 9 management) — a PERSISTENT, admin-manageable
 * supplement to the static `FLOWDESK_ACT_USERS` env allowlist.
 *
 * The env allowlist can't be mutated at runtime, so to let admins grant/revoke
 * ACT (side-effecting chat actions like submitting a real Altiora ticket) from
 * the admin UI, we persist per-user grants as `(:FlowdeskActPermission)` nodes in
 * Memgraph and keep an in-memory cache of the ENABLED keys. `act-authorization`
 * reads the UNION of the env allowlist and this cache — so the fail-closed gate
 * is unchanged when this store is empty, and additive when it's not.
 *
 * Identity key = lowercased Altiora userId (UUID) OR email — the same keys the
 * gate matches on (`isActAuthorized`).
 *
 * @module instances/flowdesk/services/act-permissions.service
 */

const LABEL = 'FlowdeskActPermission';
const DEFAULT_LABEL = 'FlowdeskPermissionDefault';

/**
 * Registry of gated permissions (side-effecting chat actions). Only
 * `submit_service_request` is wired to the gate today; approve/reject are speced.
 * Each can have a GLOBAL default that grants it to ALL users (bypassing the
 * per-user allowlist) when `enabledForAll` is true.
 */
const PERMISSIONS = [
  { key: 'submit_service_request', label: 'Submit service request', description: 'Create a real Altiora ticket from a chat draft.', wired: true },
];
const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));

let _driver = null;
function driver() { return _driver || (_driver = require('../schema-graph/driver')); }

const norm = (k) => String(k || '').trim().toLowerCase();
const kindOf = (k) => (String(k).includes('@') ? 'email' : 'userId');

// ── in-memory cache of ENABLED keys + per-permission global defaults ────────────
const _keys = new Set();
const _defaults = new Map(); // permission -> enabledForAll (bool)
let _loaded = false;

async function ensureIndexes() {
  const stmts = [
    `CREATE CONSTRAINT ON (p:${LABEL}) ASSERT p.key IS UNIQUE`,
    `CREATE INDEX ON :${LABEL}(enabled)`,
    `CREATE CONSTRAINT ON (d:${DEFAULT_LABEL}) ASSERT d.permission IS UNIQUE`,
  ];
  for (const s of stmts) { try { await driver().runAutocommit(s); } catch { /* already-exists/unsupported */ } }
}

/** Rebuild the enabled-keys + global-defaults caches from Memgraph. */
async function reload() {
  try {
    const rows = await driver().read(`MATCH (p:${LABEL}) WHERE p.enabled RETURN p.key AS key`);
    _keys.clear();
    for (const r of rows) { const k = norm(r.get('key')); if (k) _keys.add(k); }
    const drows = await driver().read(`MATCH (d:${DEFAULT_LABEL}) RETURN d.permission AS permission, d.enabledForAll AS enabledForAll`);
    _defaults.clear();
    for (const r of drows) { const p = String(r.get('permission') || ''); if (p) _defaults.set(p, Boolean(r.get('enabledForAll'))); }
    _loaded = true;
  } catch (e) {
    // Never let a store failure break the gate — env allowlist still applies.
    _loaded = true;
  }
  return [..._keys];
}

async function ensureLoaded() { if (!_loaded) await reload(); }

/** Synchronous accessor for the gate — the currently-cached enabled dynamic keys. */
function getDynamicKeys() { return [..._keys]; }

/** Synchronous accessor for the gate — is this permission globally enabled for ALL users? */
function getDefault(permission) { return _defaults.get(permission) === true; }

// ── CRUD (admin) ────────────────────────────────────────────────────────────────

async function list() {
  await ensureLoaded();
  const rows = await driver().read(`MATCH (p:${LABEL}) RETURN p ORDER BY p.addedAt DESC`);
  return rows.map((r) => {
    const n = r.get('p').properties;
    return {
      key: n.key, label: n.label || null, kind: n.kind || kindOf(n.key),
      enabled: Boolean(n.enabled), addedBy: n.addedBy || null, addedAt: n.addedAt || null, updatedAt: n.updatedAt || null,
    };
  });
}

async function add({ key, label, addedBy } = {}) {
  const k = norm(key);
  if (!k) throw Object.assign(new Error('key (userId or email) is required'), { status: 400 });
  const now = new Date().toISOString();
  await driver().write(
    `MERGE (p:${LABEL} {key: $k})
     ON CREATE SET p.addedAt = $now, p.addedBy = $addedBy
     SET p.label = $label, p.kind = $kind, p.enabled = true, p.updatedAt = $now, p.namespace = 'FlowDesk'
     RETURN p`,
    { k, label: label || null, kind: kindOf(k), addedBy: addedBy || 'admin', now }
  );
  _keys.add(k);
  return { key: k, label: label || null, kind: kindOf(k), enabled: true, addedBy: addedBy || 'admin', addedAt: now };
}

async function remove(key) {
  const k = norm(key);
  await driver().write(`MATCH (p:${LABEL} {key: $k}) DETACH DELETE p`, { k });
  _keys.delete(k);
  return { removed: true, key: k };
}

async function setEnabled(key, enabled) {
  const k = norm(key);
  const now = new Date().toISOString();
  const rows = await driver().write(
    `MATCH (p:${LABEL} {key: $k}) SET p.enabled = $enabled, p.updatedAt = $now RETURN p`,
    { k, enabled: Boolean(enabled), now }
  );
  if (!rows.length) throw Object.assign(new Error('permission not found'), { status: 404 });
  if (enabled) _keys.add(k); else _keys.delete(k);
  return { key: k, enabled: Boolean(enabled) };
}

/** Permission registry + their current global defaults (for the admin UI). */
function listPermissions() {
  return PERMISSIONS.map((p) => ({ ...p, enabledForAll: getDefault(p.key) }));
}

/** Set a permission's GLOBAL default (enable/disable for ALL users). */
async function setDefault(permission, enabledForAll, updatedBy) {
  if (!PERMISSION_KEYS.has(permission)) throw Object.assign(new Error(`unknown permission '${permission}'`), { status: 400 });
  const now = new Date().toISOString();
  await driver().write(
    `MERGE (d:${DEFAULT_LABEL} {permission: $permission})
     SET d.enabledForAll = $enabledForAll, d.updatedBy = $updatedBy, d.updatedAt = $now, d.namespace = 'FlowDesk'
     RETURN d`,
    { permission, enabledForAll: Boolean(enabledForAll), updatedBy: updatedBy || 'admin', now }
  );
  _defaults.set(permission, Boolean(enabledForAll));
  return { permission, enabledForAll: Boolean(enabledForAll) };
}

/** Effective view for the admin UI: env (static) + dynamic (managed) + union + permission defaults. */
async function effective() {
  await ensureLoaded();
  const env = String(process.env.FLOWDESK_ACT_USERS || '')
    .split(',').map((s) => norm(s)).filter(Boolean);
  const dynamic = await list();
  const enabledDynamic = dynamic.filter((d) => d.enabled).map((d) => d.key);
  const union = [...new Set([...env, ...enabledDynamic])];
  const permissions = listPermissions();
  // "enabled for all" on the wired ACT permission means every authenticated user may act.
  const anyForAll = permissions.some((p) => p.wired && p.enabledForAll);
  return {
    env, // read-only (managed via env var / deploy)
    dynamic, // per-user managed grants
    effective: union,
    permissions, // global per-permission defaults (enabledForAll)
    failClosed: union.length === 0 && !anyForAll, // nobody may ACT
    gatedActions: PERMISSIONS.filter((p) => p.wired).map((p) => p.key),
  };
}

// Ensure the constraint/index then warm the cache shortly after load, so the
// gate sees dynamic grants without an admin call first (fire-and-forget; the
// gate stays fail-closed until it lands).
setImmediate(() => { ensureIndexes().then(reload).catch(() => {}); });

module.exports = {
  LABEL, PERMISSIONS, ensureIndexes, reload, ensureLoaded, getDynamicKeys, getDefault,
  list, add, remove, setEnabled, effective, listPermissions, setDefault,
};
