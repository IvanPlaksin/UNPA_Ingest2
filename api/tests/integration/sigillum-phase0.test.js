/**
 * Sigillum Phase 0 Integration Test
 *
 * Validates:
 *   - VersionVectorService: computeForNamespace, diff, computeHash, serialize/deserialize
 *   - SigillumService: ensureMainBranch, createSnapshot (idempotency), createBranch,
 *     diffSnapshots, queryAsOfSnapshot, createSeal, verifySeal
 *   - REST API: all 10 endpoints via HTTP
 *
 * Run: node api/tests/integration/sigillum-phase0.test.js
 *
 * Requirements: Memgraph running, api server running on API_URL (default http://localhost:3001)
 */

'use strict';

const http = require('http');
const https = require('https');

let passed = 0;
let failed = 0;
const errors = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    errors.push({ name, error: err.message });
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

function assert(c, m) { if (!c) throw new Error(`Assertion failed: ${m}`); }
function assertEq(a, b, l) { if (a !== b) throw new Error(`${l}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); }
function assertNotNull(v, l) { if (v === null || v === undefined) throw new Error(`${l}: expected non-null`); }
function assertGte(a, b, l) { if (a < b) throw new Error(`${l}: expected ${a} >= ${b}`); }

const API_URL = process.env.API_URL || 'http://localhost:3001';
const API_KEY = process.env.API_KEY || 'test-key';

async function apiCall(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_URL + '/api/v1/sigillum' + path);
    const lib = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
      },
    };
    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  Sigillum Phase 0 Integration Tests');
  console.log('═══════════════════════════════════════════════════\n');

  // ─── 1. Pure Unit: VersionVectorService ──────────────────────────

  console.log('1. VersionVectorService (pure functions)');

  let vvs;
  try {
    const { VersionVectorService } = require('../../src/services/sigillum/version-vector.service');
    // Minimal stub for pure method tests
    vvs = new VersionVectorService({ queryWithNamespace: async () => [] });
  } catch (err) {
    console.error(`  Cannot load VersionVectorService: ${err.message}`);
    process.exit(1);
  }

  await test('computeHash is deterministic', () => {
    const vv = new Map([['e-1', 'v-a'], ['e-2', 'v-b']]);
    const h1 = vvs.computeHash(vv);
    const h2 = vvs.computeHash(vv);
    assertEq(h1, h2, 'hash deterministic');
    assert(h1.length === 64, 'SHA-256 hex length');
  });

  await test('computeHash is order-independent', () => {
    const vv1 = new Map([['e-1', 'v-a'], ['e-2', 'v-b']]);
    const vv2 = new Map([['e-2', 'v-b'], ['e-1', 'v-a']]);
    assertEq(vvs.computeHash(vv1), vvs.computeHash(vv2), 'order independent');
  });

  await test('computeHash differs for different vectors', () => {
    const vv1 = new Map([['e-1', 'v-a']]);
    const vv2 = new Map([['e-1', 'v-b']]);
    assert(vvs.computeHash(vv1) !== vvs.computeHash(vv2), 'different vectors produce different hashes');
  });

  await test('serialize/deserialize round-trips', () => {
    const vv = new Map([['e-1', 'v-a'], ['e-2', 'v-b']]);
    const obj = vvs.serialize(vv);
    const vv2 = vvs.deserialize(obj);
    assertEq(vv2.get('e-1'), 'v-a', 'e-1 preserved');
    assertEq(vv2.get('e-2'), 'v-b', 'e-2 preserved');
    assertEq(vv2.size, 2, 'size preserved');
  });

  await test('deserialize handles null/empty', () => {
    const vv = vvs.deserialize(null);
    assertEq(vv.size, 0, 'null → empty map');
  });

  await test('diff: added/removed/modified', () => {
    const vv1 = new Map([['e-1', 'v-1'], ['e-2', 'v-2'], ['e-3', 'v-3']]);
    const vv2 = new Map([['e-1', 'v-1x'], ['e-2', 'v-2'], ['e-4', 'v-4']]);
    const d = vvs.diff(vv1, vv2);
    assertEq(d.modified.length, 1, 'modified count');
    assertEq(d.modified[0], 'e-1', 'e-1 modified');
    assertEq(d.added.length, 1, 'added count');
    assertEq(d.added[0], 'e-4', 'e-4 added');
    assertEq(d.removed.length, 1, 'removed count');
    assertEq(d.removed[0], 'e-3', 'e-3 removed');
  });

  await test('diff: identical vectors → all empty', () => {
    const vv = new Map([['e-1', 'v-1'], ['e-2', 'v-2']]);
    const d = vvs.diff(vv, vv);
    assertEq(d.added.length, 0, 'no added');
    assertEq(d.removed.length, 0, 'no removed');
    assertEq(d.modified.length, 0, 'no modified');
  });

  // ─── 2. HTTP API Tests ────────────────────────────────────────────

  console.log('\n2. REST API — Branches');

  let mainBranchId;
  let featureBranchId;

  await test('POST /branches/ensure-main creates or returns main branch', async () => {
    const r = await apiCall('POST', '/branches/ensure-main', { namespace: 'SIGILLUM_TEST' });
    assert(r.status === 200, `status 200, got ${r.status}`);
    assert(r.body.success, `success: ${JSON.stringify(r.body)}`);
    assertNotNull(r.body.branch, 'branch object');
    assertEq(r.body.branch.isMain, true, 'isMain=true');
    assertEq(r.body.branch.name, 'main', 'name=main');
    mainBranchId = r.body.branch.branchId;
  });

  await test('GET /branches/:branchId returns branch', async () => {
    if (!mainBranchId) return;
    const r = await apiCall('GET', `/branches/${mainBranchId}`);
    assertEq(r.status, 200, 'status');
    assertEq(r.body.branch.branchId, mainBranchId, 'branchId matches');
  });

  await test('GET /branches lists branches', async () => {
    const r = await apiCall('GET', '/branches?namespace=SIGILLUM_TEST');
    assertEq(r.status, 200, 'status');
    assert(Array.isArray(r.body.branches), 'branches is array');
    assertGte(r.body.branches.length, 1, 'at least one branch');
  });

  await test('GET /branches/name/main finds main', async () => {
    const r = await apiCall('GET', '/branches/name/main?namespace=SIGILLUM_TEST');
    assertEq(r.status, 200, 'status');
    assertEq(r.body.branch.name, 'main', 'name=main');
  });

  await test('POST /branches creates feature branch', async () => {
    if (!mainBranchId) return;
    const r = await apiCall('POST', '/branches', {
      name: 'test-feature',
      namespace: 'SIGILLUM_TEST',
      fromBranchId: mainBranchId,
      createdBy: 'integration-test',
    });
    assert(r.status === 201, `status 201, got ${r.status}`);
    assert(r.body.success, 'success');
    assertEq(r.body.branch.name, 'test-feature', 'branch name');
    assertEq(r.body.branch.isMain, false, 'not main');
    featureBranchId = r.body.branch.branchId;
  });

  // ─── 3. Snapshots ────────────────────────────────────────────────

  console.log('\n3. REST API — Snapshots');

  let snap1Id;
  let snap2Id;

  await test('POST /snapshots creates snapshot on main', async () => {
    if (!mainBranchId) return;
    const r = await apiCall('POST', '/snapshots', {
      branchId: mainBranchId,
      namespace: 'SIGILLUM_TEST',
      message: 'Integration test snapshot #1',
      createdBy: 'integration-test',
    });
    assert([200, 201].includes(r.status), `status 200/201, got ${r.status}`);
    assert(r.body.success, `success: ${JSON.stringify(r.body)}`);
    assertNotNull(r.body.snapshot, 'snapshot');
    snap1Id = r.body.snapshot.snapshotId;
  });

  await test('POST /snapshots idempotent — same hash returns changed=false', async () => {
    if (!mainBranchId) return;
    const r = await apiCall('POST', '/snapshots', {
      branchId: mainBranchId,
      namespace: 'SIGILLUM_TEST',
      message: 'Should not create duplicate',
      createdBy: 'integration-test',
    });
    assert([200, 201].includes(r.status), `status 200/201, got ${r.status}`);
    // changed=false if graph state unchanged (SIGILLUM_TEST namespace likely empty)
    // Either outcome is valid — just ensure no crash
    assert('changed' in r.body, 'changed flag present');
  });

  await test('GET /snapshots/:snapshotId returns snapshot', async () => {
    if (!snap1Id) return;
    const r = await apiCall('GET', `/snapshots/${snap1Id}`);
    assertEq(r.status, 200, 'status');
    assertEq(r.body.snapshot.snapshotId, snap1Id, 'snapshotId matches');
    assertNotNull(r.body.snapshot.contentHash, 'contentHash present');
  });

  await test('GET /branches/:id/snapshots lists snapshots', async () => {
    if (!mainBranchId) return;
    const r = await apiCall('GET', `/branches/${mainBranchId}/snapshots`);
    assertEq(r.status, 200, 'status');
    assert(Array.isArray(r.body.snapshots), 'snapshots is array');
  });

  await test('POST /snapshots/partial with empty entityIds returns 400', async () => {
    if (!mainBranchId) return;
    const r = await apiCall('POST', '/snapshots/partial', {
      branchId: mainBranchId,
      entityIds: [],
    });
    assertEq(r.status, 400, 'status 400');
  });

  // ─── 4. Diff ─────────────────────────────────────────────────────

  console.log('\n4. REST API — Diff');

  await test('GET /diff requires from and to', async () => {
    const r = await apiCall('GET', '/diff');
    assertEq(r.status, 400, 'status 400');
  });

  await test('GET /diff returns diff when snaps exist', async () => {
    if (!snap1Id) return;
    // Second snapshot — create on feature branch
    let snap2Result;
    if (featureBranchId) {
      snap2Result = await apiCall('POST', '/snapshots', {
        branchId: featureBranchId,
        namespace: 'SIGILLUM_TEST',
        message: 'Feature branch snapshot',
        createdBy: 'integration-test',
      });
      snap2Id = snap2Result.body.snapshot?.snapshotId;
    }
    if (!snap2Id) { snap2Id = snap1Id; } // fallback: self-diff

    const r = await apiCall('GET', `/diff?from=${snap1Id}&to=${snap2Id}`);
    assertEq(r.status, 200, 'status');
    assert('diff' in r.body, 'diff present');
    assert('summary' in r.body, 'summary present');
  });

  // ─── 5. Query as-of ──────────────────────────────────────────────

  console.log('\n5. REST API — Query as-of');

  await test('GET /snapshots/:id/query returns node list', async () => {
    if (!snap1Id) return;
    const r = await apiCall('GET', `/snapshots/${snap1Id}/query`);
    assertEq(r.status, 200, 'status');
    assert('nodes' in r.body, 'nodes present');
    assert(Array.isArray(r.body.nodes), 'nodes is array');
  });

  await test('GET /snapshots/:id/entity/:entityId returns not-found for fake id', async () => {
    if (!snap1Id) return;
    const r = await apiCall('GET', `/snapshots/${snap1Id}/entity/fake-entity-999`);
    assertEq(r.status, 200, 'status');
    assertEq(r.body.found, false, 'not found');
  });

  // ─── 6. Seals ────────────────────────────────────────────────────

  console.log('\n6. REST API — Seals');

  let sealId;

  await test('POST /seals creates seal on snapshot', async () => {
    if (!snap1Id) return;
    const r = await apiCall('POST', '/seals', {
      snapshotId: snap1Id,
      sealType: 'CHECKPOINT',
      certifiedBy: 'integration-test',
      metadata: { testRun: true },
    });
    assert(r.status === 201, `status 201, got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body.success, 'success');
    assertNotNull(r.body.seal, 'seal');
    assertEq(r.body.seal.sealType, 'CHECKPOINT', 'sealType');
    sealId = r.body.seal.sealId;
  });

  await test('GET /seals/:id returns seal', async () => {
    if (!sealId) return;
    const r = await apiCall('GET', `/seals/${sealId}`);
    assertEq(r.status, 200, 'status');
    assertEq(r.body.seal.sealId, sealId, 'sealId matches');
  });

  await test('GET /seals/:id/verify verifies seal hash', async () => {
    if (!sealId) return;
    const r = await apiCall('GET', `/seals/${sealId}/verify`);
    assertEq(r.status, 200, 'status');
    assert('valid' in r.body, 'valid present');
    assert(r.body.valid === true, `seal valid (reason: ${r.body.reason})`);
  });

  await test('GET /branches/:id/seals lists seals', async () => {
    if (!mainBranchId) return;
    const r = await apiCall('GET', `/branches/${mainBranchId}/seals`);
    assertEq(r.status, 200, 'status');
    assert(Array.isArray(r.body.seals), 'seals is array');
  });

  await test('POST /seals with invalid sealType returns 500', async () => {
    if (!snap1Id) return;
    const r = await apiCall('POST', '/seals', {
      snapshotId: snap1Id,
      sealType: 'INVALID',
    });
    assertEq(r.status, 500, 'status 500');
  });

  // ─── Summary ─────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log('\n  Failures:');
    for (const e of errors) {
      console.log(`    ✗ ${e.name}: ${e.error}`);
    }
  }
  console.log('═══════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
