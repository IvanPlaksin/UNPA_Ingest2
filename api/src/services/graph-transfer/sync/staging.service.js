'use strict';

/**
 * Staging store for incoming sync packages.
 *
 * A pushed package is streamed to a staging file on local disk and only then
 * verified + applied. This decouples the (unreliable) network transfer from the
 * database write: a truncated/aborted upload fails the checksum step and never
 * reaches Memgraph/Qdrant. Staged files are addressed by an opaque stagingId
 * (uuid) and swept after a TTL so a client that never calls /apply cannot leak
 * disk.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');

const STAGING_DIR = process.env.GRAPH_SYNC_STAGING_DIR || path.join(os.tmpdir(), 'unpa-sync-staging');
const TTL_MS = parseInt(process.env.GRAPH_SYNC_STAGING_TTL_MS || String(2 * 60 * 60 * 1000), 10); // 2h
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const _meta = new Map(); // stagingId -> { contentHash, manifest, createdAt, size }

function ensureDir() { fs.mkdirSync(STAGING_DIR, { recursive: true }); return STAGING_DIR; }

/** Allocate a fresh staging slot. @returns {{stagingId, filePath}} */
function allocate() {
    ensureDir();
    const stagingId = randomUUID();
    return { stagingId, filePath: path.join(STAGING_DIR, `${stagingId}.ugp.tar.gz`) };
}

/** Resolve a stagingId to its file path, guarding against traversal. */
function getPath(stagingId) {
    if (!UUID_RE.test(String(stagingId || ''))) return null;
    const p = path.join(STAGING_DIR, `${stagingId}.ugp.tar.gz`);
    if (path.dirname(p) !== path.resolve(STAGING_DIR)) return null; // defense-in-depth
    return fs.existsSync(p) ? p : null;
}

function setMeta(stagingId, meta) { _meta.set(stagingId, { ...meta, createdAt: Date.now() }); }
function getMeta(stagingId) { return _meta.get(stagingId) || null; }

function remove(stagingId) {
    _meta.delete(stagingId);
    const p = path.join(STAGING_DIR, `${stagingId}.ugp.tar.gz`);
    try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* best-effort */ }
}

/** Delete staged files older than the TTL. */
function sweep() {
    ensureDir();
    let removed = 0;
    for (const f of fs.readdirSync(STAGING_DIR)) {
        const p = path.join(STAGING_DIR, f);
        try {
            const st = fs.statSync(p);
            if (Date.now() - st.mtimeMs > TTL_MS) { fs.unlinkSync(p); removed++; }
        } catch { /* ignore */ }
    }
    // drop stale meta
    for (const [id, m] of _meta) if (Date.now() - m.createdAt > TTL_MS) _meta.delete(id);
    return removed;
}

let _sweeper = null;
function startSweeper() {
    if (_sweeper) return _sweeper;
    _sweeper = setInterval(() => { try { sweep(); } catch { /* ignore */ } }, Math.min(TTL_MS, 15 * 60 * 1000));
    if (_sweeper.unref) _sweeper.unref();
    return _sweeper;
}
function stopSweeper() { if (_sweeper) { clearInterval(_sweeper); _sweeper = null; } }

module.exports = { STAGING_DIR, TTL_MS, ensureDir, allocate, getPath, setMeta, getMeta, remove, sweep, startSweeper, stopSweeper };
