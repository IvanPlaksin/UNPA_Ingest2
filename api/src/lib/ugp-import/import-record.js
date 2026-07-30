'use strict';

const { randomUUID } = require('crypto');

/**
 * ImportRecord — provenance + idempotency ledger on the TARGET, with an explicit
 * status lifecycle for failure-consistency:
 *
 *   begin(in_progress) → [import nodes/rels/vectors] → finalize(completed|failed)
 *
 * Idempotency is keyed by the package content hash but ONLY a `completed` record
 * short-circuits a re-run. A crash between begin and finalize leaves an
 * `in_progress`/`failed` record (visible, non-blocking) and, because every write
 * is an idempotent MERGE, re-running the same package safely converges and then
 * marks `completed`. This is what protects against partial/failed transfers.
 */

/** Most recent COMPLETED import of a content hash (idempotency short-circuit). */
async function checkExistingImport(session, contentHash) {
    if (!contentHash) return null;
    const res = await session.run(
        `MATCH (ir:ImportRecord {contentHash: $h, status: 'completed'})
         RETURN ir ORDER BY ir.appliedAt DESC LIMIT 1`,
        { h: contentHash }
    );
    return res.records.length ? res.records[0].get('ir').properties : null;
}

/** Create an in_progress ImportRecord BEFORE any data write. @returns importId */
async function beginImportRecord(session, meta, toolVersion) {
    const importId = randomUUID();
    await session.run(
        `CREATE (ir:ImportRecord:CORE {
            id: $importId, importId: $importId, namespace: 'CORE',
            startedAt: $startedAt, appliedAt: $startedAt, status: 'in_progress',
            transport: $transport,
            sourceInstanceId: $sourceInstanceId, contentHash: $contentHash, packageFile: $packageFile,
            conflictPolicy: $conflictPolicy, catalogChannel: $catalogChannel,
            toolVersion: $toolVersion
        }) RETURN ir.id AS id`,
        {
            importId,
            startedAt: new Date().toISOString(),
            transport: meta.transport || 'cli',
            sourceInstanceId: meta.sourceInstanceId || 'unknown',
            contentHash: meta.contentHash || null,
            packageFile: meta.packageFile || null,
            conflictPolicy: meta.conflictPolicy || 'skip',
            catalogChannel: meta.catalogChannel || 'refuse',
            toolVersion: toolVersion || 'unknown',
        }
    );
    return importId;
}

/** Finalize an ImportRecord to completed|failed with stats. */
async function finalizeImportRecord(session, importId, status, record) {
    const s = record.stats || { nodes: {}, relationships: {}, vectors: {} };
    await session.run(
        `MATCH (ir:ImportRecord {id: $importId})
         SET ir.status = $status, ir.finishedAt = $finishedAt, ir.appliedAt = $finishedAt,
             ir.error = $error,
             ir.counts_nodesCreated = $nc, ir.counts_nodesUpdated = $nu, ir.counts_nodesSkipped = $ns, ir.counts_nodesFailed = $nf,
             ir.counts_relsCreated = $rc, ir.counts_relsSkipped = $rs, ir.counts_relsFailed = $rf,
             ir.counts_vectorsUpserted = $vu, ir.counts_vectorsSkipped = $vs`,
        {
            importId, status, finishedAt: new Date().toISOString(),
            error: record.error || null,
            nc: s.nodes?.created || 0, nu: s.nodes?.updated || 0, ns: s.nodes?.skipped || 0, nf: s.nodes?.failed || 0,
            rc: s.relationships?.created || 0, rs: s.relationships?.skipped || 0, rf: s.relationships?.failed || 0,
            vu: s.vectors?.upserted || 0, vs: s.vectors?.skipped || 0,
        }
    );
}

/**
 * One-shot record (compat with the CLI apply.js writer) — used when a caller
 * wants the legacy "write once at the end" behaviour.
 */
async function writeImportRecord(session, record, toolVersion) {
    const importId = await beginImportRecord(session, { ...record, transport: record.transport || 'cli' }, toolVersion);
    await finalizeImportRecord(session, importId, record.status || 'completed', record);
    return importId;
}

module.exports = { checkExistingImport, beginImportRecord, finalizeImportRecord, writeImportRecord };
