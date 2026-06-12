#!/usr/bin/env node
/**
 * Integration Tests: Iteration 16 — Cross-page navigation + DocumentPicker
 *
 * Tests cover (no live DB required):
 *   1. DocumentPicker component structure + layer constraints
 *   2. TriangleExplorerPage uses DocumentPicker (no alert)
 *   3. DocumentProcessingPage reads namespace from URL
 *   4. GapManagerPage reads namespace from URL
 *   5. KnowledgeHealthPage navigation handlers
 *   6. All services export correct interface (regression)
 *
 * Run: node api/tests/unit/iteration16-integration.test.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

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

function assert(cond, msg) { if (!cond) throw new Error(msg || 'Assertion failed'); }
function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(msg || `Expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

async function runTests() {
    const fs   = require('fs');
    const path = require('path');

    const uiBase  = path.resolve(__dirname, '../../../mcp/src');
    const apiBase = path.resolve(__dirname, '../../src');

    // ── Suite 1: DocumentPicker component ─────────────────────────────────────
    console.log('\n1. DocumentPicker component');

    await test('DocumentPicker.jsx exists and has correct structure', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Triangle/DocumentPicker.jsx'), 'utf-8');
        assert(src.includes('VERTEX_META'), 'Missing VERTEX_META');
        assert(src.includes('normative'),   'Missing normative vertex');
        assert(src.includes('operational'), 'Missing operational vertex');
        assert(src.includes('empirical'),   'Missing empirical vertex');
        assert(src.includes('GOVERNS'),          'Missing GOVERNS edge type');
        assert(src.includes('OPERATIONALIZES'),  'Missing OPERATIONALIZES edge type');
        assert(src.includes('REVEALS_GAP_IN'),   'Missing REVEALS_GAP_IN edge type');
    });

    await test('DocumentPicker layer constraints are correct', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Triangle/DocumentPicker.jsx'), 'utf-8');
        // normative → L0, L1, L2
        assert(src.includes("layers: ['L0','L1','L2']"), "Normative should have L0/L1/L2 layers");
        // operational → L3
        assert(src.includes("layers: ['L3']"), "Operational should have L3 layer");
        // empirical → L4
        assert(src.includes("layers: ['L4']"), "Empirical should have L4 layer");
    });

    await test('DocumentPicker has search, radio selection, and layer filtering', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Triangle/DocumentPicker.jsx'), 'utf-8');
        assert(src.includes('RadioGroup'),  'Missing RadioGroup for single selection');
        assert(src.includes('search'),      'Missing search state');
        assert(src.includes('meta.layers'), 'Missing layer filtering');
        assert(src.includes('onConfirm'),   'Missing onConfirm prop');
        assert(src.includes('onClose'),     'Missing onClose prop');
    });

    // ── Suite 2: TriangleExplorerPage navigation fix ──────────────────────────
    console.log('\n2. TriangleExplorerPage navigation');

    await test('TriangleExplorerPage imports DocumentPicker', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/TriangleExplorerPage.jsx'), 'utf-8');
        assert(src.includes("import DocumentPicker"), 'Missing DocumentPicker import');
        assert(src.includes('<DocumentPicker'), 'DocumentPicker not rendered in JSX');
    });

    await test('TriangleExplorerPage has no alert() placeholder', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/TriangleExplorerPage.jsx'), 'utf-8');
        assert(!src.includes("alert(`Link"), 'Still has alert() placeholder — should use DocumentPicker');
        assert(!src.includes("alert('Link"), 'Still has alert() placeholder — should use DocumentPicker');
    });

    await test('TriangleExplorerPage reads namespace from URL params', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/TriangleExplorerPage.jsx'), 'utf-8');
        assert(src.includes("params.get('namespace')"), 'Missing URL namespace param reading');
    });

    await test('TriangleExplorerPage has handlePickerConfirm calling API', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/TriangleExplorerPage.jsx'), 'utf-8');
        assert(src.includes('handlePickerConfirm'), 'Missing handlePickerConfirm function');
        assert(src.includes('/explorer/processes/'), 'Missing explorer API call');
        assert(src.includes('setDetailKey'), 'Missing detail refresh after link');
    });

    // ── Suite 3: DocumentProcessingPage URL namespace ─────────────────────────
    console.log('\n3. DocumentProcessingPage URL namespace');

    await test('DocumentProcessingPage imports useSearchParams', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/DocumentProcessingPage.jsx'), 'utf-8');
        assert(src.includes('useSearchParams'), 'Missing useSearchParams import');
    });

    await test('DocumentProcessingPage reads namespace from URL', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/DocumentProcessingPage.jsx'), 'utf-8');
        assert(src.includes("searchParams.get('namespace')") || src.includes('searchParams.get("namespace")'),
            'Missing URL namespace param reading');
    });

    // ── Suite 4: GapManagerPage URL namespace ────────────────────────────────
    console.log('\n4. GapManagerPage URL namespace');

    await test('GapManagerPage reads namespace from URL params', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/GapManagerPage.jsx'), 'utf-8');
        assert(src.includes("params.get('namespace')") || src.includes('params.get("namespace")'),
            'Missing URL namespace param reading');
    });

    // ── Suite 5: KnowledgeHealthPage navigation ───────────────────────────────
    console.log('\n5. KnowledgeHealthPage navigation');

    await test('KnowledgeHealthPage has handleNavigate for cross-page links', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/KnowledgeHealthPage.jsx'), 'utf-8');
        assert(src.includes('handleNavigate'), 'Missing handleNavigate function');
        assert(src.includes('onNavigate'),     'Missing onNavigate prop pass-through');
    });

    await test('KnowledgeHealthPage passes onNavigate to NamespaceDetail', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'pages/KnowledgeHealthPage.jsx'), 'utf-8');
        assert(src.includes('onNavigate={handleNavigate}'), 'NamespaceDetail missing onNavigate prop');
    });

    await test('NamespaceDetail has navigation links to documents, triangle, gaps', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Dashboard/NamespaceDetail.jsx'), 'utf-8');
        assert(src.includes("'gaps'"),              "Missing gaps navigation target");
        assert(src.includes("'knowledge-triangle'"), "Missing knowledge-triangle navigation target");
        assert(src.includes("'documents'"),          "Missing documents navigation target");
    });

    // ── Suite 6: Service interface regression ─────────────────────────────────
    console.log('\n6. Service interface regression');

    await test('All knowledge services export singletons', async () => {
        const { gapManagerService } = require('../../src/services/knowledge/gap-manager.service');
        const { knowledgeHealthService } = require('../../src/services/knowledge/knowledge-health.service');
        assert(gapManagerService        != null, 'gapManagerService missing');
        assert(knowledgeHealthService   != null, 'knowledgeHealthService missing');
    });

    await test('GapManagerService has all 7 public methods', async () => {
        const { gapManagerService } = require('../../src/services/knowledge/gap-manager.service');
        const methods = ['getDashboard','listGaps','getEscalation','recordEscalation','snoozeGap','bulkUpdate','exportGaps'];
        for (const m of methods) {
            assert(typeof gapManagerService[m] === 'function', `Missing method: ${m}`);
        }
    });

    await test('KnowledgeHealthService has all 5 public methods', async () => {
        const { knowledgeHealthService } = require('../../src/services/knowledge/knowledge-health.service');
        const methods = ['getSystemHealth','getNamespaces','getNamespaceDetail','getActivity','exportNamespace'];
        for (const m of methods) {
            assert(typeof knowledgeHealthService[m] === 'function', `Missing method: ${m}`);
        }
    });

    await test('All 4 new routes registered in index.js', async () => {
        const src = fs.readFileSync(path.resolve(__dirname, '../../index.js'), 'utf-8');
        assert(src.includes("'/api/v1/explorer'"),          'Missing /explorer route');
        assert(src.includes("'/api/v1/gaps'"),              'Missing /gaps route');
        assert(src.includes("'/api/v1/knowledge-health'"),  'Missing /knowledge-health route');
        assert(src.includes("'/api/v1/documents'"),         'Missing /documents route');
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
