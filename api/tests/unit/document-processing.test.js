#!/usr/bin/env node
/**
 * Unit Tests: Document Processing Service + API
 *
 * Tests DocumentProcessingService lifecycle:
 *   upload → classify → override → list → getStatus
 *
 * Requires Memgraph with seeded DocumentType nodes.
 * All Document nodes created here have _test=true and are cleaned up.
 *
 * Run: node api/tests/unit/document-processing.test.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function test(name, fn) {
  process.stdout.write(`  ▶ ${name} ... `);
  try {
    await fn();
    console.log('✅ PASS');
    passed++;
  } catch (err) {
    console.log(`❌ FAIL\n     ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'Assertion failed');
}

// ─── Deps ─────────────────────────────────────────────────────────────────────
const { documentProcessingService: svc, DOC_STATUSES } = require('../../src/services/knowledge/document-processing.service');
const path = require('path');
const fs   = require('fs');

const UPLOADED_IDS = [];

async function cleanupDocs() {
  if (!UPLOADED_IDS.length) return;
  const mg = require('../../src/services/memgraph.service');
  await mg.runQuery(
    `MATCH (d:Document) WHERE d.id IN $ids DETACH DELETE d`,
    { ids: UPLOADED_IDS }
  );
  // Remove test files from disk
  for (const id of UPLOADED_IDS) {
    try {
      const dir = path.join(process.cwd(), 'Artefacts', 'Documents', 'TEST_DP');
      const files = fs.readdirSync(dir).filter(f => f.startsWith(id));
      files.forEach(f => fs.unlinkSync(path.join(dir, f)));
    } catch { /* ignore */ }
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────
async function runTests() {
  console.log('\n🔬 Document Processing Service Tests\n');

  console.log('Suite 1: DOC_STATUSES constant');

  await test('DOC_STATUSES contains all expected states', () => {
    const expected = ['UPLOADED', 'CLASSIFYING', 'CLASSIFIED', 'NEEDS_REVIEW', 'EXTRACTING', 'COMPLETED', 'FAILED'];
    for (const s of expected) {
      assert(DOC_STATUSES.includes(s), `Missing status: ${s}`);
    }
  });

  console.log('\nSuite 2: Upload flow');

  let docId;

  await test('uploadDocument creates a Document node in Memgraph', async () => {
    const buf = Buffer.from('ST/SGB/2024/1 Secretary-General Bulletin on procurement policy');
    const result = await svc.uploadDocument(buf, 'test-doc.txt', 'text/plain', 'TEST_DP');
    assert(result.documentId, 'documentId returned');
    assert(result.status === 'UPLOADED', `Initial status should be UPLOADED, got ${result.status}`);
    assert(result.namespace === 'TEST_DP', 'namespace matches');
    docId = result.documentId;
    UPLOADED_IDS.push(docId);
  });

  await test('getDocumentStatus returns uploaded document', async () => {
    const doc = await svc.getDocumentStatus(docId);
    assert(doc, 'document returned');
    assert(doc.id === docId, 'id matches');
    assert(doc.originalname === 'test-doc.txt', `originalname should be test-doc.txt, got ${doc.originalname}`);
  });

  await test('getDocumentStatus returns null for nonexistent document', async () => {
    const doc = await svc.getDocumentStatus('nonexistent-doc-id-xyz');
    assert(doc === null, 'should return null for missing doc');
  });

  console.log('\nSuite 3: Classification');

  await test('classifyDocument runs and updates status', async () => {
    // Wait for auto-classify from upload, or force it
    // Give auto-classify a moment to complete
    await new Promise(r => setTimeout(r, 500));
    const doc = await svc.getDocumentStatus(docId);
    // It may have already been classified by auto-classify; if not, classify now
    if (doc.status === 'UPLOADED' || doc.status === 'CLASSIFYING') {
      await svc.classifyDocument(docId);
    }
    const updated = await svc.getDocumentStatus(docId);
    assert(
      ['CLASSIFIED', 'NEEDS_REVIEW'].includes(updated.status),
      `status after classification should be CLASSIFIED or NEEDS_REVIEW, got ${updated.status}`
    );
    assert(typeof updated.classificationConfidence === 'number', 'confidence is a number');
  });

  await test('overrideClassification sets CLASSIFIED status with given type', async () => {
    await svc.overrideClassification(docId, 'ST_SGB', 'Test override');
    const doc = await svc.getDocumentStatus(docId);
    assert(doc.status === 'CLASSIFIED', `status should be CLASSIFIED, got ${doc.status}`);
    assert(doc.documentType === 'ST_SGB', `documentType should be ST_SGB, got ${doc.documentType}`);
    assert(doc.classificationOverridden === true, 'classificationOverridden should be true');
  });

  console.log('\nSuite 4: Listing');

  // Create a second doc in the same namespace
  let docId2;
  await test('upload second document for listing tests', async () => {
    const buf2 = Buffer.from('SOP-2024-001 Standard Operating Procedure for travel');
    const result2 = await svc.uploadDocument(buf2, 'sop-travel.txt', 'text/plain', 'TEST_DP');
    docId2 = result2.documentId;
    UPLOADED_IDS.push(docId2);
    assert(docId2, 'second doc created');
  });

  await test('listDocuments returns documents in namespace', async () => {
    const docs = await svc.listDocuments({ namespace: 'TEST_DP', limit: 100 });
    assert(Array.isArray(docs), 'should return array');
    assert(docs.length >= 2, `should have at least 2 docs, got ${docs.length}`);
    const ids = docs.map(d => d.id);
    assert(ids.includes(docId),  'first doc in list');
    assert(ids.includes(docId2), 'second doc in list');
  });

  await test('listDocuments filter by status works', async () => {
    const classified = await svc.listDocuments({ namespace: 'TEST_DP', status: 'CLASSIFIED', limit: 100 });
    const ids = classified.map(d => d.id);
    assert(ids.includes(docId), 'overridden doc should appear in CLASSIFIED filter');
  });

  await test('getStats returns total and byStatus array', async () => {
    const stats = await svc.getStats('TEST_DP');
    assert(typeof stats.total === 'number', 'total is a number');
    assert(Array.isArray(stats.byStatus), 'byStatus is array');
    assert(stats.total >= 2, `total should be >= 2, got ${stats.total}`);
  });

  console.log('\nSuite 5: extractDocument validation');

  await test('extractDocument throws if doc is not CLASSIFIED', async () => {
    // docId2 should be in UPLOADED or CLASSIFYING state still
    const doc2 = await svc.getDocumentStatus(docId2);
    if (['CLASSIFIED', 'NEEDS_REVIEW'].includes(doc2.status)) {
      // already classified — skip this validation test
      console.log('     (skipped — doc already classified)');
      return;
    }
    let threw = false;
    try { await svc.extractDocument(docId2); }
    catch (e) { threw = true; assert(e.message.includes('must be'), `Wrong error: ${e.message}`); }
    assert(threw, 'should throw for unclassified doc');
  });

  await test('extractDocument throws for nonexistent doc', async () => {
    let threw = false;
    try { await svc.extractDocument('no-such-doc'); }
    catch (e) { threw = true; assert(e.message.includes('not found'), `Wrong error: ${e.message}`); }
    assert(threw, 'should throw not found');
  });

  // ─── Cleanup ────────────────────────────────────────────────────────────────
  await cleanupDocs();

  // ─── Summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
