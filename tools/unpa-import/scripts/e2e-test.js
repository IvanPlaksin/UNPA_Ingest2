#!/usr/bin/env node
'use strict';

/**
 * End-to-end test: export (via graph-transfer API) → validate → plan → apply →
 * verify, against the local dev stack. To prove real transfer semantics, the
 * source nodes are DELETED after export (simulating a clean target), then apply
 * re-materializes them.
 *
 * Prereqs: UNPA API on :3010, Memgraph on :7687, (Qdrant on :6333).
 * Data is namespaced by a unique run prefix and cleaned up (incl. on failure).
 *
 * Usage: npm run e2e
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
require('dotenv').config();

const { loadConfig } = require('../src/config');
const { createMemgraphDriver } = require('../src/lib/targets');

const API_BASE = process.env.API_BASE || 'http://localhost:3010';
const CLI = path.resolve(__dirname, '../bin/unpa-import.js');
const PKG = path.resolve(__dirname, '../e2e-test-package.ugp.tar.gz');
const PREFIX = `E2E_${Date.now()}`;
const LABEL = 'E2ETestNode';

const config = loadConfig({});
const { driver } = createMemgraphDriver(config.memgraph);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpJson(method, url, body) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = http.request(
            { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { 'Content-Type': 'application/json' } },
            (res) => { let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(d); } }); }
        );
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function cypher(query) {
    const s = driver.session();
    try { const r = await s.run(query); return r.records; } finally { await s.close(); }
}

function cli(args) {
    console.log(`  $ unpa-import ${args.join(' ')}`);
    execFileSync('node', [CLI, ...args], { stdio: 'inherit', env: process.env });
}

async function cleanup() {
    await cypher(`MATCH (n:${LABEL} {testRun: '${PREFIX}'}) DETACH DELETE n`);
    await cypher(`MATCH (ir:ImportRecord {packageFile: 'e2e-test-package.ugp.tar.gz'}) DELETE ir`);
    if (fs.existsSync(PKG)) fs.unlinkSync(PKG);
}

async function main() {
    console.log('═'.repeat(60));
    console.log(`E2E TEST: export → import  (run ${PREFIX})`);
    console.log('═'.repeat(60));

    // 1 — source data
    console.log('[1/8] Creating source data...');
    await cypher(`
        CREATE (a:${LABEL} {id: '${PREFIX}_A', name: 'NodeA', testRun: '${PREFIX}'})
        CREATE (b:${LABEL} {id: '${PREFIX}_B', name: 'NodeB', testRun: '${PREFIX}'})
        CREATE (a)-[:E2E_TEST_REL {weight: 42}]->(b)`);
    console.log('  2 nodes + 1 relationship created');

    // 2 — export via API
    console.log('[2/8] Exporting via graph-transfer API...');
    const start = await httpJson('POST', `${API_BASE}/api/v1/graph-transfer/jobs`, {
        selectionMode: 'CYPHER',
        cypher: `MATCH (n:${LABEL}) WHERE n.testRun = '${PREFIX}' RETURN n`,
        boundaryPolicy: 'STUB', vectorPolicy: 'NONE', selectedCollections: {},
    });
    if (!start.jobId) throw new Error(`export enqueue failed: ${JSON.stringify(start)}`);
    console.log(`  job ${start.jobId}`);

    let filePath = null;
    for (let i = 0; i < 120; i++) {
        await sleep(500);
        const j = await httpJson('GET', `${API_BASE}/api/v1/graph-transfer/jobs/${start.jobId}`);
        const st = j.job?.status;
        if (st === 'completed') { filePath = j.job.filePath; break; }
        if (st === 'failed') throw new Error(`export failed: ${j.job?.error}`);
    }
    if (!filePath) throw new Error('export timeout');

    // 3 — download
    console.log('[3/8] Downloading package...');
    await new Promise((resolve, reject) => {
        const f = fs.createWriteStream(PKG);
        http.get(`${API_BASE}/api/v1/graph-transfer/jobs/${start.jobId}/download`, (res) => {
            if (res.statusCode !== 200) return reject(new Error(`download HTTP ${res.statusCode}`));
            res.pipe(f); f.on('finish', () => f.close(resolve));
        }).on('error', reject);
    });
    console.log(`  ${fs.statSync(PKG).size} bytes`);

    // 4 — simulate clean target: delete source nodes
    console.log('[4/8] Deleting source nodes (simulating clean target)...');
    await cypher(`MATCH (n:${LABEL} {testRun: '${PREFIX}'}) DETACH DELETE n`);
    const gone = await cypher(`MATCH (n:${LABEL} {testRun: '${PREFIX}'}) RETURN count(n) AS c`);
    if (Number(gone[0].get('c')) !== 0) throw new Error('source nodes not deleted');

    // 5 — validate
    console.log('[5/8] validate');
    cli(['validate', PKG]);

    // 6 — plan (should be all CREATE now)
    console.log('[6/8] plan');
    cli(['plan', PKG, '--conflict=skip']);

    // 7 — apply
    console.log('[7/8] apply');
    cli(['apply', PKG, '--conflict=skip', '--yes']);

    // 8 — verify re-materialization
    console.log('[8/8] Verifying import...');
    const v = await cypher(`
        MATCH (n:${LABEL} {testRun: '${PREFIX}'})
        OPTIONAL MATCH (n)-[r:E2E_TEST_REL]->()
        RETURN count(DISTINCT n) AS nodes, count(r) AS rels`);
    const nodes = Number(v[0].get('nodes'));
    const rels = Number(v[0].get('rels'));
    const props = await cypher(`MATCH (n:${LABEL} {id: '${PREFIX}_A'}) RETURN n.name AS name`);
    const nameOk = props[0]?.get('name') === 'NodeA';
    const relW = await cypher(`MATCH (:${LABEL} {id:'${PREFIX}_A'})-[r:E2E_TEST_REL]->() RETURN r.weight AS w`);
    const weightOk = Number(relW[0]?.get('w')) === 42;

    console.log(`  nodes=${nodes} rels=${rels} nameOk=${nameOk} weightOk=${weightOk}`);
    if (nodes !== 2) throw new Error(`expected 2 nodes, got ${nodes}`);
    if (rels !== 1) throw new Error(`expected 1 rel, got ${rels}`);
    if (!nameOk) throw new Error('node property not preserved');
    if (!weightOk) throw new Error('relationship property not preserved');

    console.log('');
    console.log('═'.repeat(60));
    console.log('✓ E2E TEST PASSED');
    console.log('═'.repeat(60));
}

main()
    .then(async () => { await cleanup(); await driver.close(); process.exit(0); })
    .catch(async (err) => {
        console.error('\n✗ E2E TEST FAILED:', err.message);
        try { await cleanup(); } catch (e) { console.error('cleanup error:', e.message); }
        await driver.close();
        process.exit(1);
    });
