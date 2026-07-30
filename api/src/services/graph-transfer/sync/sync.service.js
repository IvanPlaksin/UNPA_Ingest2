'use strict';

/**
 * Sync service (SOURCE side) — a runnable API-API transfer:
 *
 *   export (build UGP for the selection)  → ingest (stage+verify on peer)
 *     → [plan (dry-run diff)]  → apply (idempotent, failure-consistent import)
 *
 * The package is transmitted as one artifact; the peer verifies its checksum
 * before any DB write, and apply is idempotent — so a failed transfer can be
 * retried safely (same content hash → no duplication). Nothing is deleted on the
 * source; the built package stays in Artefacts/Exports for audit/re-push.
 */

const fs = require('fs');
const path = require('path');
const { getExportService } = require('../export.service');
const { KEY_HEADER, SRC_HEADER } = require('../../../middleware/graph-sync-auth.middleware');

async function fileToBlob(filePath) {
    if (typeof fs.openAsBlob === 'function') return fs.openAsBlob(filePath); // Node 20+: no full-memory read
    return new Blob([fs.readFileSync(filePath)]);
}

function peerHeaders(conn) {
    const h = { [KEY_HEADER]: conn.key };
    if (conn.sourceInstanceId) h[SRC_HEADER] = conn.sourceInstanceId;
    return h;
}

async function postJson(url, conn, body) {
    const resp = await fetch(url, { method: 'POST', headers: { ...peerHeaders(conn), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await resp.text();
    let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { raw: text }; }
    if (!resp.ok) { const e = new Error(json.detail || json.error || `HTTP ${resp.status}`); e.status = resp.status; e.body = json; throw e; }
    return json;
}

/**
 * @param {object} params { request (export selection) OR stagingId (reuse a staged
 *                          package from a prior plan), peerConn {baseUrl,key,sourceInstanceId},
 *                          mode: 'plan'|'apply'|'plan-apply', conflict, catalogChannel, skipVectors, force }
 * @param {(evt)=>void} onProgress
 *
 * When `stagingId` is supplied the export+ingest steps are skipped and the given
 * already-staged package on the peer is (planned and/or) applied — this is what
 * powers the UI's review-then-apply: a `plan` job returns its stagingId, and the
 * subsequent `apply` reuses it so the exact reviewed package is what gets written.
 */
async function runSync(params, onProgress = () => {}) {
    const { request, peerConn, mode = 'plan-apply', conflict = 'skip', catalogChannel = 'refuse', skipVectors = false, force = false } = params;
    const base = peerConn.baseUrl.replace(/\/$/, '') + '/api/v1/graph-transfer/sync';
    const result = { mode };
    let stagingId = params.stagingId || null;

    if (!stagingId) {
        // 1 — build the package locally
        onProgress({ phase: 'export', progress: 5, message: 'Building package' });
        const svc = getExportService();
        const exp = await svc.executeExport(request, (pct, phase, msg) => onProgress({ phase: 'export', progress: 5 + Math.round((pct || 0) * 0.45), message: msg || phase }));
        const filePath = exp.filePath;
        if (!filePath || !fs.existsSync(filePath)) { const e = new Error('Export produced no package file'); e.code = 'ENOEXPORT'; throw e; }
        result.export = { filePath, fileName: path.basename(filePath), fileSize: fs.statSync(filePath).size, counts: exp.counts || exp.summary || null };

        // 2 — ingest (stage + integrity verify on peer; no DB write yet)
        onProgress({ phase: 'ingest', progress: 55, message: 'Uploading to peer' });
        const form = new FormData();
        form.append('package', await fileToBlob(filePath), result.export.fileName);
        const ingResp = await fetch(`${base}/ingest`, { method: 'POST', headers: peerHeaders(peerConn), body: form });
        const ingText = await ingResp.text();
        let ing; try { ing = JSON.parse(ingText); } catch { ing = { raw: ingText }; }
        if (!ingResp.ok) { const e = new Error(ing.detail || ing.error || `ingest HTTP ${ingResp.status}`); e.status = ingResp.status; e.body = ing; throw e; }
        result.ingest = ing; // { stagingId, contentHash, manifest }
        stagingId = ing.stagingId;
    } else {
        result.reusedStaging = true;
    }

    // 3 — plan (dry-run diff) if requested
    if (mode === 'plan' || mode === 'plan-apply') {
        onProgress({ phase: 'plan', progress: 65, message: 'Computing diff on peer' });
        result.plan = await postJson(`${base}/plan`, peerConn, { stagingId, conflict, catalogChannel });
        result.stagingId = stagingId; // surface for a follow-up apply
    }

    // 4 — apply (idempotent import) unless plan-only
    if (mode === 'apply' || mode === 'plan-apply') {
        onProgress({ phase: 'apply', progress: 75, message: 'Applying on peer' });
        result.apply = await postJson(`${base}/apply`, peerConn, { stagingId, conflict, catalogChannel, skipVectors, force });
    }

    onProgress({ phase: 'completed', progress: 100, message: 'Sync complete', result });
    return result;
}

/** Fetch a peer's ImportRecords via the resolved key (server-side proxy for the UI). */
async function peerRecords(peerConn, limit = 50) {
    const url = peerConn.baseUrl.replace(/\/$/, '') + `/api/v1/graph-transfer/sync/records?limit=${encodeURIComponent(limit)}`;
    const r = await fetch(url, { headers: peerHeaders(peerConn) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(body.error || `records HTTP ${r.status}`); e.status = r.status; throw e; }
    return body.records || [];
}

/** Fetch a peer's instance snapshot (label + collection counts) via the resolved key. */
async function peerSnapshot(peerConn) {
    const url = peerConn.baseUrl.replace(/\/$/, '') + '/api/v1/graph-transfer/sync/snapshot';
    const r = await fetch(url, { headers: peerHeaders(peerConn) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(body.error || `snapshot HTTP ${r.status}`); e.status = r.status; throw e; }
    return body;
}

/** Fetch a peer's receiver health via the resolved key. */
async function peerHealth(peerConn) {
    const url = peerConn.baseUrl.replace(/\/$/, '') + '/api/v1/graph-transfer/sync/health';
    const r = await fetch(url, { headers: peerHeaders(peerConn) });
    const body = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, ...body };
}

module.exports = { runSync, peerRecords, peerHealth, peerSnapshot };
