'use strict';

/**
 * Peer registry for API-API sync (source side). A peer is another UNPA instance
 * this one can push to. Only non-secret metadata is persisted (baseUrl, name);
 * the shared sync key is NEVER stored — it is read at push time from the env var
 * named by `keyEnv` (default GRAPH_SYNC_KEY, the symmetric key both peers share).
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const STORE = process.env.GRAPH_SYNC_PEERS_FILE || path.resolve(process.cwd(), 'Artefacts', 'graph-sync-peers.json');
const HTTP_RE = /^https?:\/\/[^\s]+$/i;

function _load() {
    try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return []; }
}
function _save(list) {
    fs.mkdirSync(path.dirname(STORE), { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify(list, null, 2));
}

function list() { return _load().map(_public); }
function get(id) { const p = _load().find((x) => x.id === id); return p ? _public(p) : null; }
function _raw(id) { return _load().find((x) => x.id === id) || null; }

function upsert(peer) {
    if (!peer || !HTTP_RE.test(String(peer.baseUrl || ''))) { const e = new Error('baseUrl must be an http(s) URL'); e.code = 'EVALIDATION'; throw e; }
    const list = _load();
    const id = peer.id || randomUUID();
    const rec = {
        id,
        name: String(peer.name || peer.baseUrl).slice(0, 120),
        baseUrl: peer.baseUrl.replace(/\/$/, ''),
        keyEnv: peer.keyEnv || 'GRAPH_SYNC_KEY',
        sourceInstanceId: peer.sourceInstanceId || process.env.INSTANCE_ID || 'unpa',
        createdAt: peer.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
    // Per-peer key (optional): stored server-side only, never returned to the
    // browser. If omitted on update, the existing stored key is preserved; if
    // never set, resolveConnection falls back to the keyEnv env var.
    if (typeof peer.key === 'string' && peer.key.trim()) rec.key = peer.key.trim();
    const i = list.findIndex((x) => x.id === id);
    const merged = i >= 0 ? { ...list[i], ...rec } : rec;
    if (i >= 0) list[i] = merged; else list.push(merged);
    _save(list);
    return _public(merged);
}

function remove(id) { const list = _load(); const next = list.filter((x) => x.id !== id); _save(next); return next.length !== list.length; }

/** Resolve the connection details used to push (includes the resolved key). */
function resolveConnection(id) {
    const p = _raw(id);
    if (!p) { const e = new Error('Unknown peer'); e.code = 'ENOPEER'; throw e; }
    const key = p.key || process.env[p.keyEnv] || ''; // stored per-peer key wins, else env
    if (!key) { const e = new Error(`No sync key for this peer — set one when editing the peer, or set env "${p.keyEnv}"`); e.code = 'ENOKEY'; throw e; }
    return { baseUrl: p.baseUrl, key, sourceInstanceId: p.sourceInstanceId };
}

function _public(p) { const { keyEnv, key, ...rest } = p; return { ...rest, keyEnv, keyConfigured: !!(key || process.env[keyEnv || 'GRAPH_SYNC_KEY']) }; }

module.exports = { list, get, upsert, remove, resolveConnection, STORE };
