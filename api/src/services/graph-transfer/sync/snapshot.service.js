'use strict';

/**
 * Instance snapshot — per-label node counts (Memgraph) + per-collection point
 * counts (Qdrant). The basis for the cross-instance Compare view: the source
 * takes its own snapshot and fetches the peer's, then groups both by domain.
 */

const { createMemgraphDriver } = require('../../../lib/ugp-import');
const { buildConfig } = require('./import.service');

async function snapshot() {
    const config = buildConfig();
    const out = { labels: {}, collections: {}, takenAt: new Date().toISOString() };

    const { driver } = createMemgraphDriver(config.memgraph);
    const session = driver.session();
    try {
        const r = await session.run('MATCH (n) UNWIND labels(n) AS l RETURN l AS label, count(*) AS c');
        for (const rec of r.records) out.labels[rec.get('label')] = Number(rec.get('c'));
    } finally { await session.close(); await driver.close(); }

    // Qdrant via raw REST (proven shape; avoids client version drift)
    try {
        const base = (config.qdrant.url || 'http://localhost:6333').replace(/\/$/, '');
        const headers = config.qdrant.apiKey ? { 'api-key': config.qdrant.apiKey } : {};
        const list = await (await fetch(`${base}/collections`, { headers })).json();
        for (const c of (list.result?.collections || [])) {
            try {
                const info = await (await fetch(`${base}/collections/${encodeURIComponent(c.name)}`, { headers })).json();
                out.collections[c.name] = info.result?.points_count ?? 0;
            } catch { out.collections[c.name] = 0; }
        }
    } catch (e) { out.qdrantError = e.message; }

    return out;
}

module.exports = { snapshot };
