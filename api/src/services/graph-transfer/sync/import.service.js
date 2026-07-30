'use strict';

/**
 * Server-side import orchestration for API-API sync (Phase 1).
 *
 * Wraps the shared engine (api/src/lib/ugp-import) with the failure-consistency
 * guarantees required for a runnable transfer between instances:
 *
 *   1. INTEGRITY   — verify package checksums; reject a corrupt/truncated
 *                    transfer BEFORE touching the databases.
 *   2. IDEMPOTENCY — a `completed` ImportRecord for the same contentHash
 *                    short-circuits (skip), so at-least-once delivery is safe.
 *   3. PLAN        — compute the diff without writing (dry-run available).
 *   4. GUARDED     — hard conflicts require an explicit overwrite/force.
 *   5. LEDGER      — write an `in_progress` ImportRecord, import in Canonical
 *                    Write Order (nodes → rels → vectors, all idempotent MERGE),
 *                    then finalize `completed`; on any error finalize `failed`.
 *                    A crash mid-transfer leaves a consistent, resumable state:
 *                    re-running the same package converges (no duplicates, no
 *                    dangling edges) and marks completed.
 *
 * The package is always a fully-received, checksum-verified file on local disk
 * (the receiver stages the upload first), so a network failure during transfer
 * can never leave the databases half-written.
 */

const fs = require('fs');
const path = require('path');
const {
    ugp, createMemgraphDriver, createQdrantClient,
    computePlan, ImportEngine, importVectors,
    checkExistingImport, beginImportRecord, finalizeImportRecord,
} = require('../../../lib/ugp-import');

const TOOL_VERSION = (() => { try { return require('../../../../package.json').version; } catch { return 'api'; } })();

// Catalog labels normally travel via the catalog API channel, never raw Cypher.
const CATALOG_LABELS = new Set(['GraphDefinition', 'GraphVersion', 'CatalogEntry']);
const isCatalogNode = (node) => (node.labels || []).some((l) => CATALOG_LABELS.has(l));

/** Resolve target DB config from the api environment. */
function buildConfig(overrides = {}) {
    return {
        memgraph: {
            uri: process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687',
            user: process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph',
            password: process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123',
        },
        qdrant: { url: process.env.QDRANT_URL || 'http://localhost:6333', apiKey: process.env.QDRANT_API_KEY || undefined },
        conflict: overrides.conflict || 'skip',
        catalogChannel: overrides.catalogChannel || 'refuse', // 'refuse' | 'raw'
        batchSize: overrides.batchSize || 500,
    };
}

/** Open + verify a staged package. @returns {reader, manifest, contentHash} */
async function openVerified(file) {
    if (!fs.existsSync(file)) { const e = new Error('Package file not found'); e.code = 'ENOENT'; throw e; }
    const reader = new ugp.UGPReader(file);
    const ck = await reader.verifyChecksums();
    if (!ck.valid) { const e = new Error(`Package failed integrity check: ${(ck.errors || []).join('; ')}`); e.code = 'EINTEGRITY'; throw e; }
    const { manifest } = await reader.readManifest();
    if (!manifest) { const e = new Error('Package has no valid manifest'); e.code = 'EMANIFEST'; throw e; }
    const contentHash = await reader.getContentHash();
    return { reader, manifest, contentHash };
}

/**
 * Dry-run: verify + compute the diff. No writes.
 * @returns {{manifest, contentHash, summary, plan, catalogSkipped}}
 */
async function planPackage(file, options = {}) {
    const config = buildConfig(options);
    const { manifest, contentHash } = await openVerified(file);
    const { plan, summary, nodes } = await computePlan(file, config, { includeVectors: true });

    let catalogSkipped = 0;
    if (manifest.containsExecutableGraphs && config.catalogChannel === 'refuse') {
        for (const node of nodes) if (isCatalogNode(node) && node._action !== 'SKIP') catalogSkipped++;
    }
    return { manifest, contentHash, summary, plan, catalogSkipped };
}

/**
 * Apply a staged package with full failure-consistency + idempotency.
 * @param {string} file staged, checksum-verified package path
 * @param {object} options { conflict, catalogChannel, skipVectors, batchSize, force,
 *                           sourceInstanceId, transport, onProgress }
 * @returns {{importId, status, idempotent, stats, catalogSkipped, summary}}
 */
async function applyPackage(file, options = {}) {
    const config = buildConfig(options);
    const { reader, manifest, contentHash } = await openVerified(file);

    const { driver } = createMemgraphDriver(config.memgraph);
    const session = driver.session();
    let importId = null;
    try {
        // 2 — idempotency: a completed import of this exact package is a no-op
        if (!options.force) {
            const prior = await checkExistingImport(session, contentHash);
            if (prior) return { importId: prior.importId, status: 'completed', idempotent: true, stats: null, prior };
        }

        // 3 — plan (vectors streamed separately during apply)
        const { nodes, rels, summary } = await computePlan(file, config, { includeVectors: false });

        // catalog channel — refuse skips catalog-label nodes; raw imports them as plain nodes
        let catalogSkipped = 0;
        if (manifest.containsExecutableGraphs && config.catalogChannel === 'refuse') {
            for (const node of nodes) if (isCatalogNode(node) && node._action !== 'SKIP') { node._action = 'SKIP'; catalogSkipped++; }
        }

        // 4 — hard-conflict guard
        if (summary.hasHardConflicts && config.conflict !== 'overwrite' && !options.force) {
            const e = new Error(`${summary.nodes.conflict} hard conflict(s) — re-run with conflict=overwrite or force=true`);
            e.code = 'ECONFLICT'; e.summary = summary; throw e;
        }

        // 5 — ledger: in_progress BEFORE any write
        importId = await beginImportRecord(session, {
            transport: options.transport || 'api',
            sourceInstanceId: options.sourceInstanceId || manifest.sourceInstanceId,
            contentHash, packageFile: path.basename(file),
            conflictPolicy: config.conflict, catalogChannel: config.catalogChannel,
        }, TOOL_VERSION);

        let stats;
        try {
            const engine = new ImportEngine(driver, config);
            const nodeStats = await engine.importNodes(nodes, (p, t) => options.onProgress?.({ phase: 'nodes', done: p, total: t }));
            const relStats = await engine.importRelationships(rels, (p, t) => options.onProgress?.({ phase: 'relationships', done: p, total: t }));
            let vectorStats = { upserted: 0, skipped: 0, failed: 0, byCollection: {} };
            if (!options.skipVectors && manifest.vectorPolicy !== 'NONE') {
                const qdrant = createQdrantClient(config.qdrant);
                options.onProgress?.({ phase: 'vectors', done: 0, total: 1 });
                vectorStats = await importVectors(reader, manifest, qdrant, { ...config, skipVectors: false });
            }
            stats = { nodes: nodeStats, relationships: relStats, vectors: vectorStats };

            // fail the record if any batch failed — leaves it non-completed so a re-run retries
            const hadFailures = (nodeStats.failed || 0) + (relStats.failed || 0) > 0;
            await finalizeImportRecord(session, importId, hadFailures ? 'failed' : 'completed', { stats });
            options.onProgress?.({ phase: 'done', done: 1, total: 1 });
            return { importId, status: hadFailures ? 'failed' : 'completed', idempotent: false, stats, catalogSkipped, summary };
        } catch (err) {
            await finalizeImportRecord(session, importId, 'failed', { stats: stats || {}, error: err.message }).catch(() => {});
            throw err;
        }
    } finally {
        await session.close();
        await driver.close();
    }
}

/** Recent ImportRecords on this target (provenance / observability). */
async function listRecords(limit = 50) {
    const config = buildConfig();
    const { driver } = createMemgraphDriver(config.memgraph);
    const session = driver.session();
    try {
        const res = await session.run(
            `MATCH (ir:ImportRecord) RETURN ir ORDER BY coalesce(ir.finishedAt, ir.appliedAt, ir.startedAt) DESC LIMIT $limit`,
            { limit: require('neo4j-driver').int(Math.max(1, Math.min(limit, 500))) }
        );
        return res.records.map((r) => r.get('ir').properties);
    } finally {
        await session.close();
        await driver.close();
    }
}

module.exports = { planPackage, applyPackage, buildConfig, openVerified, listRecords };
