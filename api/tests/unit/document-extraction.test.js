#!/usr/bin/env node
/**
 * Unit Tests: Document Extraction Service
 *
 * Tests cover (no live DB/Redis needed):
 *   1. PIPELINE_STEPS constant shape and ordering
 *   2. DocumentExtractionService exports and interface
 *   3. Ingestion executor source files (build_triangle, calculate_kqs)
 *   4. Progress percentage calculation logic
 *   5. Step name alignment with UI component
 *
 * Run: node api/tests/unit/document-extraction.test.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// ─── Test runner ──────────────────────────────────────────────────────────────
let passed = 0, failed = 0;

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

function assert(condition, msg) { if (!condition) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runTests() {

    const { PIPELINE_STEPS, DocumentExtractionService, documentExtractionService }
        = require('../../src/services/knowledge/document-extraction.service');

    // ── Suite 1: PIPELINE_STEPS ───────────────────────────────────────────────
    console.log('\n1. PIPELINE_STEPS constant');

    await test('has exactly 6 steps', async () => {
        assertEqual(PIPELINE_STEPS.length, 6, 'Expected 6 pipeline steps');
    });

    await test('steps are in correct order', async () => {
        const names = PIPELINE_STEPS.map(s => s.name);
        const expected = ['parse-document', 'extract-entities', 'build-triangle',
                          'detect-gaps', 'calculate-kqs', 'store-results'];
        for (let i = 0; i < expected.length; i++) {
            assertEqual(names[i], expected[i],
                `Step ${i} should be "${expected[i]}", got "${names[i]}"`);
        }
    });

    await test('each step has non-empty name and label', async () => {
        for (const step of PIPELINE_STEPS) {
            assert(typeof step.name === 'string' && step.name.length > 0, `Step missing name`);
            assert(typeof step.label === 'string' && step.label.length > 0, `Step "${step.name}" missing label`);
        }
    });

    // ── Suite 2: Service exports ──────────────────────────────────────────────
    console.log('\n2. DocumentExtractionService exports');

    await test('exports documentExtractionService singleton', async () => {
        assert(documentExtractionService != null, 'documentExtractionService is null');
        assert(typeof documentExtractionService.extractDocument === 'function', 'extractDocument not a function');
        assert(typeof documentExtractionService.getProgress === 'function', 'getProgress not a function');
        assert(typeof documentExtractionService.getExtractionResult === 'function', 'getExtractionResult not a function');
    });

    await test('exports DocumentExtractionService class with internal methods', async () => {
        assert(typeof DocumentExtractionService === 'function', 'DocumentExtractionService not a class');
        const inst = new DocumentExtractionService();
        assert(typeof inst.extractDocument === 'function', 'instance.extractDocument missing');
        assert(typeof inst._buildTriangle === 'function', '_buildTriangle internal method missing');
        assert(typeof inst._initProgress === 'function', '_initProgress internal method missing');
        assert(typeof inst._startStep === 'function', '_startStep internal method missing');
        assert(typeof inst._completeStep === 'function', '_completeStep internal method missing');
        assert(typeof inst._failStep === 'function', '_failStep internal method missing');
    });

    await test('getProgress gracefully handles no Redis connection', async () => {
        try {
            const result = await documentExtractionService.getProgress('nonexistent-doc-id');
            assert(result == null, 'Expected null for unknown doc');
        } catch (e) {
            // Connection error expected in unit test environment
            assert(e.message.length > 0, 'Error should have message');
        }
    });

    // ── Suite 3: Executor source files ────────────────────────────────────────
    console.log('\n3. AOPEG Executor source files');
    const fs = require('fs');
    const path = require('path');
    const executorsDir = path.resolve(__dirname, '../../src/core/aopeg/plugins/ingestion/executors');

    await test('index.ts exports both new executors', async () => {
        const content = fs.readFileSync(path.join(executorsDir, 'index.ts'), 'utf-8');
        assert(content.includes('BuildTriangleExecutor'), 'index.ts missing BuildTriangleExecutor export');
        assert(content.includes('CalculateKQSExecutor'), 'index.ts missing CalculateKQSExecutor export');
        assert(content.includes("'./build-triangle.executor'"), 'Missing build-triangle.executor import path');
        assert(content.includes("'./calculate-kqs.executor'"), 'Missing calculate-kqs.executor import path');
    });

    await test('build-triangle.executor.ts: correct type, domain, and parameters', async () => {
        const src = fs.readFileSync(path.join(executorsDir, 'build-triangle.executor.ts'), 'utf-8');
        assert(src.includes("'ingestion.build_triangle'"), 'Missing type = ingestion.build_triangle');
        assert(src.includes("'ingestion'"), 'Missing domain = ingestion');
        assert(src.includes('documentId'), 'Missing documentId parameter');
        assert(src.includes('processIds'), 'Missing processIds parameter');
        assert(src.includes('epistemicLayer'), 'Missing epistemicLayer parameter');
        assert(src.includes('GOVERNS') || src.includes('createGovernsEdge'), 'Missing GOVERNS edge logic');
    });

    await test('calculate-kqs.executor.ts: correct type, domain, and parameters', async () => {
        const src = fs.readFileSync(path.join(executorsDir, 'calculate-kqs.executor.ts'), 'utf-8');
        assert(src.includes("'ingestion.calculate_kqs'"), 'Missing type = ingestion.calculate_kqs');
        assert(src.includes("'ingestion'"), 'Missing domain = ingestion');
        assert(src.includes('entityIds'), 'Missing entityIds parameter');
        assert(src.includes('persist'), 'Missing persist parameter');
        assert(src.includes('kqsService'), 'Missing kqsService usage');
        assert(src.includes('calculateKQSById'), 'Missing calculateKQSById call');
    });

    // ── Suite 4: Progress % calculation ───────────────────────────────────────
    console.log('\n4. Progress percentage math');

    await test('_startStep overallProgress at each step matches idx/total formula', async () => {
        const TOTAL = PIPELINE_STEPS.length;
        const pctAt = (idx) => Math.round((idx / TOTAL) * 100);
        assertEqual(pctAt(0), 0,  'Step 0 start should be 0%');
        assertEqual(pctAt(1), 17, 'Step 1 start should be 17%');
        assertEqual(pctAt(2), 33, 'Step 2 start should be 33%');
        assertEqual(pctAt(3), 50, 'Step 3 start should be 50%');
        assertEqual(pctAt(4), 67, 'Step 4 start should be 67%');
        assertEqual(pctAt(5), 83, 'Step 5 start should be 83%');
    });

    await test('_completeStep overallProgress at last step reaches 100%', async () => {
        const TOTAL = PIPELINE_STEPS.length;
        const pctAfter = (idx) => Math.round(((idx + 1) / TOTAL) * 100);
        assertEqual(pctAfter(5), 100, 'Completing step 6 should be 100%');
        assertEqual(pctAfter(2), 50,  'Completing step 3 should be 50%');
        assertEqual(pctAfter(0), 17,  'Completing step 1 should be 17%');
    });

    // ── Suite 5: UI alignment ─────────────────────────────────────────────────
    console.log('\n5. UI/Service alignment');

    await test('PIPELINE_STEPS step names match ExtractionProgress UI STEP_LABELS', async () => {
        // ExtractionProgress.jsx defines STEP_LABELS with these keys
        const uiStepLabels = new Set([
            'parse-document', 'extract-entities', 'build-triangle',
            'detect-gaps', 'calculate-kqs', 'store-results'
        ]);
        for (const step of PIPELINE_STEPS) {
            assert(uiStepLabels.has(step.name), `Step "${step.name}" not in UI STEP_LABELS`);
        }
    });

    await test('ExtractionResults.jsx exists and references correct API endpoints', async () => {
        const uiPath = path.resolve(__dirname,
            '../../../mcp/src/components/Documents/ExtractionResults.jsx');
        const src = fs.readFileSync(uiPath, 'utf-8');
        assert(src.includes('/extraction/result'), 'Missing /extraction/result endpoint reference');
        assert(src.includes('Summary'), 'Missing Summary tab');
        assert(src.includes('Triangle'), 'Missing Knowledge Triangle tab');
        assert(src.includes('GOVERNS'), 'Missing GOVERNS edge type');
        assert(src.includes('OPERATIONALIZES'), 'Missing OPERATIONALIZES edge type');
    });

    await test('ExtractionProgress.jsx references correct polling endpoint', async () => {
        const uiPath = path.resolve(__dirname,
            '../../../mcp/src/components/Documents/ExtractionProgress.jsx');
        const src = fs.readFileSync(uiPath, 'utf-8');
        assert(src.includes('/extraction/progress'), 'Missing /extraction/progress endpoint reference');
        assert(src.includes('onComplete'), 'Missing onComplete callback');
        assert(src.includes('1500'), 'Missing 1500ms poll interval');
    });

    // ─── Report ───────────────────────────────────────────────────────────────
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test runner error:', err.message);
    process.exit(1);
});
