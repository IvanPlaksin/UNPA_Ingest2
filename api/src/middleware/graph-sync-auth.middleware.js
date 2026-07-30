'use strict';

/**
 * Graph-sync authentication — shared-secret gate for the API-API sync receiver
 * (/api/v1/graph-transfer/sync/*), which can WRITE into Memgraph + Qdrant.
 *
 * Because the surface mutates data across instances, it is FAIL-CLOSED: with no
 * GRAPH_SYNC_KEY configured every request is rejected. Set GRAPH_SYNC_KEY on both
 * peers (the source sends it as `X-Unpa-Sync-Key`). An optional allowlist of
 * source instance ids (GRAPH_SYNC_PEERS, comma-separated) further restricts who
 * may push; the source declares itself via `X-Unpa-Source-Instance`.
 *
 * For local dev / integration tests set GRAPH_SYNC_ALLOW_INSECURE=true to bypass.
 *
 * @module middleware/graph-sync-auth.middleware
 */

const crypto = require('crypto');

const KEY_HEADER = 'x-unpa-sync-key';
const SRC_HEADER = 'x-unpa-source-instance';

function timingSafeEqual(a, b) {
    const ab = Buffer.from(String(a));
    const bb = Buffer.from(String(b));
    if (ab.length !== bb.length) return false;
    return crypto.timingSafeEqual(ab, bb);
}

function graphSyncAuthMiddleware(req, res, next) {
    // health/preflight always open
    if (req.method === 'OPTIONS') return next();
    if (req.path === '/health' || req.path.endsWith('/health')) return next();

    if (process.env.GRAPH_SYNC_ALLOW_INSECURE === 'true') return next();

    const expected = process.env.GRAPH_SYNC_KEY || '';
    if (!expected) {
        return res.status(503).json({
            error: 'Graph sync receiver disabled',
            detail: 'GRAPH_SYNC_KEY is not configured on this instance (fail-closed). Set it on both peers to enable API-API sync.',
        });
    }

    const provided = req.headers[KEY_HEADER] || '';
    if (!provided || !timingSafeEqual(provided, expected)) {
        return res.status(401).json({ error: 'Invalid or missing X-Unpa-Sync-Key' });
    }

    // optional peer allowlist
    const peers = (process.env.GRAPH_SYNC_PEERS || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (peers.length) {
        const src = String(req.headers[SRC_HEADER] || '');
        if (!src || !peers.includes(src)) {
            return res.status(403).json({ error: 'Source instance not in GRAPH_SYNC_PEERS allowlist', source: src || null });
        }
    }
    req.syncSourceInstance = req.headers[SRC_HEADER] || null;
    return next();
}

module.exports = { graphSyncAuthMiddleware, KEY_HEADER, SRC_HEADER };
