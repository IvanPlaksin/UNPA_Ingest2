'use strict';

const { randomUUID } = require('crypto');

/**
 * ImportRecord — provenance of an import on the TARGET server. Also the
 * idempotency ledger: an import is keyed by the package content hash.
 */

/**
 * Find the most recent completed import of a given package content hash.
 * @returns {Promise<object|null>} record properties, or null
 */
async function checkExistingImport(session, contentHash) {
    if (!contentHash) return null;
    const res = await session.run(
        `MATCH (ir:ImportRecord {contentHash: $h}) RETURN ir ORDER BY ir.appliedAt DESC LIMIT 1`,
        { h: contentHash }
    );
    return res.records.length ? res.records[0].get('ir').properties : null;
}

/**
 * Write an ImportRecord node to the target. @returns {Promise<string>} importId
 */
async function writeImportRecord(session, record, toolVersion) {
    const importId = randomUUID();
    const s = record.stats;
    await session.run(
        `CREATE (ir:ImportRecord:CORE {
            id: $importId, importId: $importId, namespace: 'CORE',
            appliedAt: $appliedAt, status: $status,
            sourceInstanceId: $sourceInstanceId, contentHash: $contentHash, packageFile: $packageFile,
            conflictPolicy: $conflictPolicy, catalogChannel: $catalogChannel,
            counts_nodesCreated: $nc, counts_nodesUpdated: $nu, counts_nodesSkipped: $ns, counts_nodesFailed: $nf,
            counts_relsCreated: $rc, counts_relsSkipped: $rs, counts_relsFailed: $rf,
            counts_vectorsUpserted: $vu, counts_vectorsSkipped: $vs,
            toolVersion: $toolVersion
        }) RETURN ir.id AS id`,
        {
            importId,
            appliedAt: new Date().toISOString(),
            status: record.status || 'completed',
            sourceInstanceId: record.sourceInstanceId || 'unknown',
            contentHash: record.contentHash || null,
            packageFile: record.packageFile || null,
            conflictPolicy: record.conflictPolicy || 'skip',
            catalogChannel: record.catalogChannel || 'refuse',
            nc: s.nodes.created || 0, nu: s.nodes.updated || 0, ns: s.nodes.skipped || 0, nf: s.nodes.failed || 0,
            rc: s.relationships.created || 0, rs: s.relationships.skipped || 0, rf: s.relationships.failed || 0,
            vu: s.vectors.upserted || 0, vs: s.vectors.skipped || 0,
            toolVersion: toolVersion || 'unknown',
        }
    );
    return importId;
}

module.exports = { checkExistingImport, writeImportRecord };
