'use strict';

const fs = require('fs');
const logger = require('../utils/logger');
const ugp = require('../lib/ugp-adapter');

/**
 * `validate <file>` — check package integrity WITHOUT any DB connection.
 *
 * Steps:
 *   1. File exists & readable
 *   2. Package opens (valid tar.gz)
 *   3. Checksums (SHA-256) match
 *   4. Manifest present & schema-valid
 *   5. Nodes parse; identity present on each; collect identities
 *   6. Relationships parse; endpoints resolve against node identities (dangling check)
 *   7. Vectors parse; dimensions consistent with manifest.embedding.dims
 *
 * Exit 0 = valid (warnings allowed). Exit 1 = validation errors.
 */
async function validate(file, options = {}) {
    logger.setVerbose(options.verbose);
    const chalk = logger.chalk;

    logger.info(`Validating package: ${file}`);

    const errors = [];
    const warnings = [];
    let manifest = null;

    // Step 1 — file exists
    logger.step(1, 7, 'Checking file...');
    if (!fs.existsSync(file)) {
        logger.error(`File not found: ${file}`);
        process.exit(1);
    }
    const stats = fs.statSync(file);
    logger.verbose(`File size: ${(stats.size / 1024).toFixed(1)} KB`);

    // Step 2 — open
    logger.step(2, 7, 'Opening package...');
    let reader;
    try {
        reader = new ugp.UGPReader(file);
    } catch (err) {
        logger.error(`Failed to open package: ${err.message}`);
        process.exit(1);
    }

    // Step 3 — checksums (also the first point where a corrupt gzip surfaces)
    logger.step(3, 7, 'Verifying checksums...');
    try {
        const ck = await reader.verifyChecksums();
        if (!ck.valid) ck.errors.forEach((e) => errors.push(`Checksum: ${e}`));
        else logger.verbose('All checksums valid');
    } catch (err) {
        errors.push(`Checksum/gzip verification failed: ${err.message}`);
    }

    // Step 4 — manifest
    logger.step(4, 7, 'Validating manifest...');
    try {
        const mr = await reader.readManifest();
        if (!mr.valid) (mr.errors || []).forEach((e) => errors.push(`Manifest: ${e}`));
        if (mr.manifest) {
            manifest = mr.manifest;
            logger.verbose(`UGP ${manifest.ugpVersion}, created ${manifest.createdAt}, selection ${manifest.selection?.mode}`);
        }
    } catch (err) {
        errors.push(`Manifest read failed: ${err.message}`);
    }

    // Step 5 — nodes
    logger.step(5, 7, 'Validating nodes...');
    let nodeCount = 0;
    let stubCount = 0;
    let nodesWithoutIdentity = 0;
    const nodeIdentities = new Set();
    try {
        for await (const node of reader.readNodes()) {
            nodeCount++;
            if (node.stub) stubCount++;
            if (!node._identity || node._identity.value === undefined || node._identity.value === null) {
                nodesWithoutIdentity++;
                if (nodesWithoutIdentity <= 5) warnings.push(`Node without identity: labels=${(node.labels || []).join(',')}`);
            } else {
                nodeIdentities.add(`${node._identity.property}:${node._identity.value}`);
            }
        }
        logger.verbose(`Nodes parsed: ${nodeCount} (stubs: ${stubCount})`);
        if (nodesWithoutIdentity > 0) warnings.push(`${nodesWithoutIdentity} node(s) without identity`);
    } catch (err) {
        errors.push(`Node parsing failed: ${err.message}`);
    }

    // Step 6 — relationships
    logger.step(6, 7, 'Validating relationships...');
    let relCount = 0;
    let danglingRels = 0;
    const edgeTypeCounts = {};
    try {
        for await (const rel of reader.readRelationships()) {
            relCount++;
            edgeTypeCounts[rel.type] = (edgeTypeCounts[rel.type] || 0) + 1;
            const fromKey = rel.from ? `${rel.from.property}:${rel.from.value}` : null;
            const toKey = rel.to ? `${rel.to.property}:${rel.to.value}` : null;
            if (!fromKey || !toKey || !nodeIdentities.has(fromKey) || !nodeIdentities.has(toKey)) {
                danglingRels++;
                if (danglingRels <= 3) logger.verbose(`Dangling relationship: ${rel.type} ${fromKey} → ${toKey}`);
            }
        }
        logger.verbose(`Relationships parsed: ${relCount}`);
        if (danglingRels > 0) {
            // Dangling within a package is an error: every endpoint (incl. stubs) must be present.
            errors.push(`${danglingRels} relationship(s) reference an endpoint absent from the package`);
        }
    } catch (err) {
        errors.push(`Relationship parsing failed: ${err.message}`);
    }

    // Step 7 — vectors
    logger.step(7, 7, 'Validating vectors...');
    let vectorCount = 0;
    let dimMismatches = 0;
    const collections = new Set();
    const expectedDims = manifest?.embedding?.dims || null;
    try {
        for await (const { collection, point } of reader.readVectors()) {
            vectorCount++;
            collections.add(collection);
            if (expectedDims) {
                const dims = Array.isArray(point.vector)
                    ? point.vector.length
                    : (point.vectors ? (Object.values(point.vectors)[0] || []).length : null);
                if (dims && dims !== expectedDims) {
                    dimMismatches++;
                    if (dimMismatches <= 3) warnings.push(`Vector dim mismatch in ${collection}: expected ${expectedDims}, got ${dims}`);
                }
            }
        }
        logger.verbose(`Vectors parsed: ${vectorCount} across ${collections.size} collection(s)`);
    } catch (err) {
        errors.push(`Vector parsing failed: ${err.message}`);
    }

    // Manifest count reconciliation (warn-only — informational drift check)
    if (manifest?.counts) {
        if (typeof manifest.counts.nodes === 'number' && manifest.counts.nodes + (manifest.counts.stubNodes || 0) !== nodeCount) {
            warnings.push(`Manifest nodes (${manifest.counts.nodes}+${manifest.counts.stubNodes || 0} stubs) != parsed ${nodeCount}`);
        }
        if (typeof manifest.counts.relationships === 'number' && manifest.counts.relationships !== relCount) {
            warnings.push(`Manifest relationships (${manifest.counts.relationships}) != parsed ${relCount}`);
        }
    }

    // Summary
    logger.raw('');
    logger.raw('─'.repeat(52));
    if (errors.length === 0) {
        logger.success('Package is valid');
        logger.raw('');
        if (manifest) {
            logger.info('Package summary:');
            logger.raw(`  UGP version:    ${manifest.ugpVersion}`);
            logger.raw(`  Created:        ${manifest.createdAt}`);
            logger.raw(`  Source:         ${manifest.sourceInstanceId}`);
            logger.raw(`  Selection:      ${manifest.selection?.mode}`);
            logger.raw(`  Boundary:       ${manifest.boundaryPolicy}`);
            logger.raw(`  Vectors:        ${manifest.vectorPolicy}`);
            logger.raw(`  Exec graphs:    ${manifest.containsExecutableGraphs ? 'yes' : 'no'}`);
            logger.raw('');
            logger.raw(`  Nodes:          ${nodeCount} (stubs: ${stubCount})`);
            logger.raw(`  Relationships:  ${relCount}`);
            logger.raw(`  Vector points:  ${vectorCount}`);
            logger.raw(`  Collections:    ${[...collections].join(', ') || 'none'}`);
        }
        const edgeTypes = Object.entries(edgeTypeCounts).sort((a, b) => b[1] - a[1]);
        if (edgeTypes.length) {
            logger.raw('');
            logger.raw(`  Edge types (${edgeTypes.length}): ${edgeTypes.map(([t, c]) => `${t}×${c}`).join(', ')}`);
        }
        if (warnings.length) {
            logger.raw('');
            logger.warn(`${warnings.length} warning(s):`);
            warnings.forEach((w) => logger.bullet(w, 'yellow'));
        }
        process.exit(0);
    } else {
        logger.error('Package validation FAILED');
        logger.raw('');
        errors.forEach((e) => logger.bullet(e, 'red'));
        if (warnings.length) {
            logger.raw('');
            warnings.forEach((w) => logger.bullet(w, 'yellow'));
        }
        process.exit(1);
    }
}

module.exports = validate;
