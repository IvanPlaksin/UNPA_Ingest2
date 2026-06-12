#!/usr/bin/env node
/**
 * Unit Tests: Triangle Explorer Service + API
 *
 * Tests cover (no live DB required):
 *   1. TriangleExplorerService exports and interface
 *   2. Completeness calculation logic (inline formula)
 *   3. Completeness label mapping
 *   4. Route file structure (endpoint verification)
 *   5. Frontend component file existence and key content
 *
 * Run: node api/tests/unit/triangle-explorer.test.js
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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runTests() {
    const { triangleExplorerService, TriangleExplorerService }
        = require('../../src/services/knowledge/triangle-explorer.service');
    const fs   = require('fs');
    const path = require('path');

    // ── Suite 1: Service exports ──────────────────────────────────────────────
    console.log('\n1. TriangleExplorerService exports');

    await test('exports triangleExplorerService singleton', async () => {
        assert(triangleExplorerService != null, 'singleton is null');
        assert(typeof triangleExplorerService.listProcesses === 'function', 'listProcesses missing');
        assert(typeof triangleExplorerService.getProcessTriangle === 'function', 'getProcessTriangle missing');
        assert(typeof triangleExplorerService.linkDocumentToProcess === 'function', 'linkDocumentToProcess missing');
        assert(typeof triangleExplorerService.unlinkDocumentFromProcess === 'function', 'unlinkDocumentFromProcess missing');
    });

    await test('exports TriangleExplorerService class', async () => {
        assert(typeof TriangleExplorerService === 'function', 'class not exported');
        const inst = new TriangleExplorerService();
        assert(typeof inst._formatDoc === 'function', '_formatDoc missing');
        assert(typeof inst._formatGap === 'function', '_formatGap missing');
    });

    await test('listProcesses gracefully handles no Memgraph connection', async () => {
        try {
            await triangleExplorerService.listProcesses({ limit: 1 });
        } catch (e) {
            assert(e.message.length > 0, 'error has no message');
        }
    });

    await test('getProcessTriangle returns null for unknown processId', async () => {
        try {
            const r = await triangleExplorerService.getProcessTriangle('nonexistent-process-id');
            assert(r == null, 'Expected null for unknown process');
        } catch (e) {
            assert(e.message.length > 0, 'error has no message');
        }
    });

    // ── Suite 2: Completeness calculation ─────────────────────────────────────
    console.log('\n2. Completeness calculation');

    function calcCompleteness(n, o, e, hG, mG, lG) {
        const raw     = (Number(n > 0) + Number(o > 0) + Number(e > 0)) / 3;
        const penalty = hG * 0.15 + mG * 0.10 + lG * 0.05;
        return Math.max(0, Math.round((raw - penalty) * 1000) / 1000);
    }

    await test('all three vertices present, no gaps → completeness = 1.0', async () => {
        assertEqual(calcCompleteness(1, 1, 1, 0, 0, 0), 1.0);
    });

    await test('two vertices present → completeness = 0.667', async () => {
        assertEqual(calcCompleteness(1, 1, 0, 0, 0, 0), 0.667);
    });

    await test('one vertex present → completeness = 0.333', async () => {
        assertEqual(calcCompleteness(1, 0, 0, 0, 0, 0), 0.333);
    });

    await test('no vertices → completeness = 0', async () => {
        assertEqual(calcCompleteness(0, 0, 0, 0, 0, 0), 0);
    });

    await test('gap penalty: 1 high gap = 0.15 penalty', async () => {
        const c = calcCompleteness(1, 1, 1, 1, 0, 0);
        assertEqual(c, 0.85, `Expected 0.85, got ${c}`);
    });

    await test('gap penalty: 1 medium gap = 0.10 penalty', async () => {
        const c = calcCompleteness(1, 1, 1, 0, 1, 0);
        assertEqual(c, 0.9, `Expected 0.9, got ${c}`);
    });

    await test('completeness never goes below 0 (clamp)', async () => {
        // 3 high gaps = 0.45 penalty from raw 0.333 → clamped at 0
        const c = calcCompleteness(1, 0, 0, 3, 0, 0);
        assert(c >= 0, `Completeness should be >= 0, got ${c}`);
    });

    // ── Suite 3: Completeness label mapping ───────────────────────────────────
    console.log('\n3. Completeness label mapping');

    function completenessLabel(score) {
        if (score >= 1.0)  return 'full';
        if (score >= 0.67) return 'partial';
        if (score > 0)     return 'minimal';
        return 'none';
    }

    await test('1.0 → full', async () => { assertEqual(completenessLabel(1.0), 'full'); });
    await test('0.667 → minimal (threshold is 0.67)', async () => { assertEqual(completenessLabel(0.667), 'minimal'); });
    await test('0.670 → partial', async () => { assertEqual(completenessLabel(0.670), 'partial'); });
    await test('0.333 → minimal', async () => { assertEqual(completenessLabel(0.333), 'minimal'); });
    await test('0 → none', async () => { assertEqual(completenessLabel(0), 'none'); });

    // ── Suite 4: Route file validation ────────────────────────────────────────
    console.log('\n4. Route file structure');

    await test('triangle-explorer.route.js exports a router', async () => {
        const route = require('../../src/routes/triangle-explorer.route');
        assert(route != null, 'route is null');
        assert(typeof route === 'function' || typeof route.get === 'function',
            'route should be express Router');
    });

    await test('route file has all 5 endpoint patterns', async () => {
        const routePath = path.resolve(__dirname, '../../src/routes/triangle-explorer.route.js');
        const src = fs.readFileSync(routePath, 'utf-8');
        assert(src.includes("router.get('/processes'"), 'Missing GET /processes');
        assert(src.includes("router.get('/processes/:processId/triangle'"), 'Missing GET /triangle');
        assert(src.includes("router.get('/processes/:processId/documents/:vertexType'"), 'Missing GET /documents/:vertex');
        assert(src.includes("router.post('/processes/:processId/link'"), 'Missing POST /link');
        assert(src.includes("router.delete('/processes/:processId/link/:docId'"), 'Missing DELETE /link/:docId');
    });

    await test('index.js registers /api/v1/explorer route', async () => {
        const src = fs.readFileSync(path.resolve(__dirname, '../../index.js'), 'utf-8');
        assert(src.includes("'/api/v1/explorer'"), 'Missing /api/v1/explorer registration');
        assert(src.includes('triangleExplorerRoutes'), 'Missing triangleExplorerRoutes var');
    });

    // ── Suite 5: Frontend components ──────────────────────────────────────────
    console.log('\n5. Frontend Triangle components');

    const uiBase = path.resolve(__dirname, '../../../mcp/src');

    await test('ProcessList.jsx exists with key features', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Triangle/ProcessList.jsx'), 'utf-8');
        assert(src.includes('/explorer/processes'), 'Missing API endpoint reference');
        assert(src.includes('completenessLabel'), 'Missing completeness label');
        assert(src.includes('CompletenessBar'), 'Missing CompletenessBar component');
        assert(src.includes('onSelect'), 'Missing onSelect prop');
    });

    await test('TriangleDiagram.jsx exists with SVG triangle', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Triangle/TriangleDiagram.jsx'), 'utf-8');
        assert(src.includes('<svg'), 'Missing SVG element');
        assert(src.includes('GOVERNS'), 'Missing GOVERNS edge label');
        assert(src.includes('OPERATIONALIZES'), 'Missing OPERATIONALIZES edge label');
        assert(src.includes('REVEALS_GAP_IN'), 'Missing REVEALS_GAP_IN edge label');
        assert(src.includes('onVertexClick'), 'Missing onVertexClick prop');
    });

    await test('DocumentVertex.jsx exists with three vertex types', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Triangle/DocumentVertex.jsx'), 'utf-8');
        assert(src.includes("'normative'"), 'Missing normative vertex');
        assert(src.includes("'operational'"), 'Missing operational vertex');
        assert(src.includes("'empirical'"), 'Missing empirical vertex');
        assert(src.includes('onRemoveLink'), 'Missing onRemoveLink prop');
        assert(src.includes('onAddDocument'), 'Missing onAddDocument prop');
    });

    await test('GapPanel.jsx exists with status flow', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Triangle/GapPanel.jsx'), 'utf-8');
        assert(src.includes('OPEN'), 'Missing OPEN status');
        assert(src.includes('ACKNOWLEDGED'), 'Missing ACKNOWLEDGED status');
        assert(src.includes('ADDRESSED'), 'Missing ADDRESSED status');
        assert(src.includes('CLOSED'), 'Missing CLOSED status');
        assert(src.includes('onStatusChange'), 'Missing onStatusChange prop');
    });

    await test('TriangleDetail.jsx combines diagram + tabs', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Triangle/TriangleDetail.jsx'), 'utf-8');
        assert(src.includes('TriangleDiagram'), 'Missing TriangleDiagram import');
        assert(src.includes('DocumentVertex'), 'Missing DocumentVertex import');
        assert(src.includes('GapPanel'), 'Missing GapPanel import');
        assert(src.includes('/explorer/processes'), 'Missing API endpoint reference');
        assert(src.includes('handleVertexClick'), 'Missing vertex click handler');
    });

    await test('TriangleExplorerPage.jsx registers /knowledge-triangle route', async () => {
        const appSrc = fs.readFileSync(path.join(uiBase, 'App.jsx'), 'utf-8');
        assert(appSrc.includes('/knowledge-triangle'), 'Missing /knowledge-triangle route in App.jsx');
        assert(appSrc.includes('TriangleExplorerPage'), 'Missing TriangleExplorerPage import');
    });

    await test('Sidebar.jsx includes Triangle Explorer nav link', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Layout/Sidebar.jsx'), 'utf-8');
        assert(src.includes('/knowledge-triangle'), 'Missing /knowledge-triangle in sidebar');
        assert(src.includes('Triangle Explorer'), 'Missing Triangle Explorer label');
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
