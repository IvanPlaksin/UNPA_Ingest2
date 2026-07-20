'use strict';

/**
 * Migration: backfill ExportRecord.exportRequest for records created before
 * TASK-GT-001. Reconstructs a best-effort re-runnable snapshot from the legacy
 * flat fields (selectionMode, selectionSummary, boundaryPolicy, vectorPolicy).
 * The reconstruction is lossy — selectedCollections is unknown for old records,
 * so canRerun stays false for them (the API derives canRerun from a usable
 * selection, and a partial snapshot is flagged with _migrated).
 *
 * Run: node api/scripts/migrate-export-records.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const neo4j = require('neo4j-driver');

const URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph';
const PASS = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123';

function reconstruct(props) {
    const req = {
        selectionMode: props.selectionMode || null,
        namespacePrefixes: null,
        labels: null,
        cypher: null,
        graphIds: null,
        boundaryPolicy: props.boundaryPolicy || null,
        vectorPolicy: props.vectorPolicy || null,
        selectedCollections: null, // unknown for legacy records
        vectorFilters: null,
    };
    const summary = props.selectionSummary || '';
    // selectionSummary format: "<MODE>: a, b, c"
    const idx = summary.indexOf(':');
    const tail = idx >= 0 ? summary.slice(idx + 1).trim() : '';
    const list = tail ? tail.split(',').map((s) => s.trim()).filter(Boolean) : [];
    switch (props.selectionMode) {
        case 'NAMESPACE': req.namespacePrefixes = list.length ? list : null; break;
        case 'LABELS': req.labels = list.length ? list : null; break;
        case 'CATALOG_GRAPHS': req.graphIds = list.length ? list : null; break;
        case 'CYPHER': req.cypher = tail || null; break; // truncated in summary — lossy
    }
    return req;
}

async function main() {
    const driver = neo4j.driver(URI, neo4j.auth.basic(USER, PASS), { disableLosslessIntegers: true });
    const s = driver.session();
    let migrated = 0;
    try {
        const res = await s.run('MATCH (e:ExportRecord) WHERE e.exportRequest IS NULL RETURN e');
        console.log(`Found ${res.records.length} ExportRecord(s) without exportRequest.`);
        for (const rec of res.records) {
            const props = rec.get('e').properties;
            const req = reconstruct(props);
            await s.run(
                'MATCH (e:ExportRecord {id: $id}) SET e.exportRequest = $json, e._migrated = true',
                { id: props.id || props.exportId, json: JSON.stringify(req) }
            );
            migrated++;
        }
        console.log(`✓ Migrated ${migrated} ExportRecord(s).`);
    } finally {
        await s.close();
        await driver.close();
    }
}

main().catch((e) => { console.error('Migration failed:', e.message); process.exit(1); });
