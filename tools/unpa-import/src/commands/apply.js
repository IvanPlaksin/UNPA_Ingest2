'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { loadConfig } = require('../config');
const { ugp, createMemgraphDriver, createQdrantClient } = require('../lib/targets');
const { computePlan } = require('../lib/planner');
const { ImportEngine, importVectors } = require('../lib/import-engine');
const { checkExistingImport, writeImportRecord } = require('../lib/import-record');
const pkgJson = require('../../package.json');

// Labels that must travel through the catalog API channel, never raw Cypher.
const CATALOG_LABELS = new Set(['GraphDefinition', 'GraphVersion', 'CatalogEntry']);
const isCatalogNode = (node) => (node.labels || []).some((l) => CATALOG_LABELS.has(l));

/**
 * `apply <file>` — import a UGP package into the target Memgraph (+ Qdrant).
 */
module.exports = async function apply(file, options = {}) {
    logger.setVerbose(options.verbose);

    if (options.dryRun) return require('./plan')(file, options);
    if (!fs.existsSync(file)) { logger.error(`File not found: ${file}`); process.exit(1); }

    const config = loadConfig(options);
    const TOTAL = 7;

    // 1 — validate integrity
    logger.step(1, TOTAL, 'Validating package integrity...');
    const reader = new ugp.UGPReader(file);
    const ck = await reader.verifyChecksums();
    if (!ck.valid) { logger.error(`Package failed integrity check: ${ck.errors.join('; ')}`); process.exit(1); }
    const { manifest } = await reader.readManifest();
    if (!manifest) { logger.error('Package has no valid manifest.'); process.exit(1); }
    const contentHash = await reader.getContentHash();

    // 2 — compute plan (reuses planner; vectors streamed later, not here)
    logger.step(2, TOTAL, 'Computing import plan...');
    logger.info(`Target Memgraph: ${config.memgraph.uri}`);
    const { nodes, rels, summary } = await computePlan(file, config, { includeVectors: false });

    // 3 — catalog channel
    logger.step(3, TOTAL, 'Resolving catalog channel...');
    let catalogSkipped = 0;
    if (manifest.containsExecutableGraphs) {
        if (config.catalogChannel === 'api') {
            logger.error('Catalog API channel is not yet implemented (TASK-EXP-009). Re-run with --catalog-channel=refuse to import non-catalog data only.');
            process.exit(1);
        }
        // refuse: skip catalog-label nodes (executable graphs must go via the API)
        for (const node of nodes) {
            if (isCatalogNode(node) && node._action !== 'SKIP') { node._action = 'SKIP'; catalogSkipped++; }
        }
        if (catalogSkipped) logger.warn(`Package contains executable graphs — skipping ${catalogSkipped} catalog node(s) (channel=refuse). Use --catalog-channel=api once TASK-EXP-009 lands.`);
    }

    // 4 — hard conflicts gate
    if (summary.hasHardConflicts && !options.yes) {
        logger.error(`${summary.nodes.conflict} hard conflict(s) detected. Re-run with --conflict=overwrite or --yes to force.`);
        process.exit(1);
    }

    // Connect target for import + provenance
    const { driver } = createMemgraphDriver(config.memgraph);
    const session = driver.session();

    let nodeStats, relStats, vectorStats = { upserted: 0, skipped: 0, failed: 0, byCollection: {} };
    try {
        // 4b — idempotency
        logger.step(4, TOTAL, 'Checking for a previous import...');
        const prior = await checkExistingImport(session, contentHash);
        if (prior && !options.yes) {
            logger.warn(`This package was already imported at ${prior.appliedAt} (importId ${prior.importId}). Re-run with --yes to import again.`);
            await session.close(); await driver.close();
            process.exit(0);
        }

        // 5 — graph: nodes then relationships (atomic per-batch transactions)
        logger.step(5, TOTAL, 'Importing graph...');
        const engine = new ImportEngine(driver, config);
        nodeStats = await engine.importNodes(nodes, (p, t) => logger.verbose(`nodes ${p}/${t}`));
        relStats = await engine.importRelationships(rels, (p, t) => logger.verbose(`rels ${p}/${t}`));

        // 6 — vectors AFTER graph (Canonical Write Order)
        logger.step(6, TOTAL, options.skipVectors ? 'Skipping vectors (--skip-vectors)...' : 'Importing vectors...');
        if (!options.skipVectors && manifest.vectorPolicy !== 'NONE') {
            const qdrant = createQdrantClient(config.qdrant);
            vectorStats = await importVectors(reader, manifest, qdrant, { ...config, skipVectors: false });
        }

        // 7 — provenance
        logger.step(7, TOTAL, 'Writing ImportRecord...');
        const stats = { nodes: nodeStats, relationships: relStats, vectors: vectorStats };
        var importId = await writeImportRecord(session, {
            sourceInstanceId: manifest.sourceInstanceId,
            contentHash,
            packageFile: path.basename(file),
            conflictPolicy: config.conflict,
            catalogChannel: config.catalogChannel,
            stats,
        }, pkgJson.version);
    } finally {
        await session.close();
        await driver.close();
    }

    // Summary
    logger.raw('');
    logger.success('Import completed');
    logger.raw('');
    logger.raw(`  Nodes:         ${nodeStats.created} created, ${nodeStats.updated} updated, ${nodeStats.skipped} skipped${catalogSkipped ? ` (incl. ${catalogSkipped} catalog)` : ''}, ${nodeStats.failed} failed`);
    logger.raw(`  Relationships: ${relStats.created} created, ${relStats.skipped} skipped, ${relStats.failed} failed`);
    logger.raw(`  Vectors:       ${vectorStats.upserted} upserted, ${vectorStats.skipped} skipped`);
    logger.raw(`  ImportRecord:  ${importId}`);

    if (options.output) {
        fs.writeFileSync(options.output, JSON.stringify({
            timestamp: new Date().toISOString(), packageFile: file, importId, contentHash,
            manifest, stats: { nodes: nodeStats, relationships: relStats, vectors: vectorStats }, catalogSkipped,
        }, null, 2));
        logger.info(`Report written to ${options.output}`);
    }
    process.exit((nodeStats.failed || relStats.failed) ? 1 : 0);
};
