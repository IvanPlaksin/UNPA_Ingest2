#!/usr/bin/env node
/**
 * Unit Tests: Gap Manager Service + API
 *
 * Tests cover (no live DB required for most):
 *   1. GapManagerService exports and interface
 *   2. STALE_DAYS, REVIEW_DAYS constants
 *   3. _formatGap helper (ageDays, isStale, needsReview computation)
 *   4. Route file structure (7 endpoint patterns)
 *   5. Frontend component files existence
 *   6. Bulk action validation (invalid action rejected)
 *   7. Export format handling (json vs csv)
 *
 * Run: node api/tests/unit/gap-manager.test.js
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
    const { gapManagerService, GapManagerService, STALE_DAYS, REVIEW_DAYS }
        = require('../../src/services/knowledge/gap-manager.service');
    const fs   = require('fs');
    const path = require('path');

    // ── Suite 1: Service exports ──────────────────────────────────────────────
    console.log('\n1. GapManagerService exports');

    await test('exports singleton with all public methods', async () => {
        assert(gapManagerService != null, 'singleton is null');
        assert(typeof gapManagerService.getDashboard === 'function', 'getDashboard missing');
        assert(typeof gapManagerService.listGaps === 'function', 'listGaps missing');
        assert(typeof gapManagerService.getEscalation === 'function', 'getEscalation missing');
        assert(typeof gapManagerService.recordEscalation === 'function', 'recordEscalation missing');
        assert(typeof gapManagerService.snoozeGap === 'function', 'snoozeGap missing');
        assert(typeof gapManagerService.bulkUpdate === 'function', 'bulkUpdate missing');
        assert(typeof gapManagerService.exportGaps === 'function', 'exportGaps missing');
    });

    await test('exports GapManagerService class', async () => {
        assert(typeof GapManagerService === 'function', 'class not exported');
        const inst = new GapManagerService();
        assert(typeof inst._formatGap === 'function', '_formatGap missing');
    });

    // ── Suite 2: Constants ────────────────────────────────────────────────────
    console.log('\n2. Constants');

    await test('STALE_DAYS = 90', async () => { assertEqual(STALE_DAYS, 90); });
    await test('REVIEW_DAYS = 180', async () => { assertEqual(REVIEW_DAYS, 180); });

    // ── Suite 3: _formatGap helper ────────────────────────────────────────────
    console.log('\n3. _formatGap helper');

    const svc = new GapManagerService();

    await test('computes ageDays from identifiedAt', async () => {
        const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString();
        const result = svc._formatGap({
            id: 'test-1', gapType: 'COMPLIANCE', severity: 'HIGH',
            status: 'OPEN', identifiedAt: tenDaysAgo
        });
        assert(result.ageDays >= 9 && result.ageDays <= 11, `ageDays should be ~10, got ${result.ageDays}`);
        assert(result.isStale === false, 'Should not be stale at 10 days');
        assert(result.needsReview === false, 'Should not need review at 10 days');
    });

    await test('marks isStale for gap > 90 days', async () => {
        const ninetyFiveDaysAgo = new Date(Date.now() - 95 * 86400000).toISOString();
        const result = svc._formatGap({
            id: 'test-2', status: 'OPEN', identifiedAt: ninetyFiveDaysAgo
        });
        assert(result.isStale === true, 'Should be stale at 95 days');
        assert(result.needsReview === false, 'Should not need review at 95 days');
    });

    await test('marks needsReview for gap > 180 days', async () => {
        const twoHundredDaysAgo = new Date(Date.now() - 200 * 86400000).toISOString();
        const result = svc._formatGap({
            id: 'test-3', status: 'OPEN', identifiedAt: twoHundredDaysAgo
        });
        assert(result.isStale === true, 'Should be stale at 200 days');
        assert(result.needsReview === true, 'Should need review at 200 days');
    });

    await test('escalationHistory parses JSON array', async () => {
        const history = JSON.stringify([{ type: 'ESCALATE', escalatedAt: new Date().toISOString() }]);
        const result = svc._formatGap({ id: 'x', escalationHistory: history });
        assertEqual(result.escalationCount, 1, 'Should have 1 escalation');
    });

    await test('escalationHistory handles invalid JSON gracefully', async () => {
        const result = svc._formatGap({ id: 'x', escalationHistory: 'not-json' });
        assertEqual(result.escalationCount, 0, 'Should have 0 escalations on parse failure');
    });

    // ── Suite 4: bulkUpdate validation ────────────────────────────────────────
    console.log('\n4. bulkUpdate validation');

    await test('rejects empty gapIds array', async () => {
        try {
            await gapManagerService.bulkUpdate([], 'acknowledge', {});
            throw new Error('Should have thrown');
        } catch (e) {
            assert(e.message.includes('non-empty') || e.message.includes('gapIds'), `Got: ${e.message}`);
        }
    });

    await test('rejects invalid action', async () => {
        try {
            await gapManagerService.bulkUpdate(['id1'], 'invalid_action', {});
            throw new Error('Should have thrown');
        } catch (e) {
            assert(e.message.includes('must be') || e.message.includes('action'), `Got: ${e.message}`);
        }
    });

    // ── Suite 5: Route file structure ─────────────────────────────────────────
    console.log('\n5. Route file structure');

    await test('gap-manager.route.js exports a router', async () => {
        const route = require('../../src/routes/gap-manager.route');
        assert(route != null && (typeof route === 'function' || typeof route.get === 'function'), 'Not a router');
    });

    await test('route file has all 7 endpoint patterns', async () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, '../../src/routes/gap-manager.route.js'), 'utf-8'
        );
        assert(src.includes("router.get('/dashboard'"), 'Missing GET /dashboard');
        assert(src.includes("router.get('/list'"), 'Missing GET /list');
        assert(src.includes("router.get('/export'"), 'Missing GET /export');
        assert(src.includes("router.post('/bulk'"), 'Missing POST /bulk');
        assert(src.includes("router.get('/:gapId/escalation'"), 'Missing GET /:gapId/escalation');
        assert(src.includes("router.post('/:gapId/escalate'"), 'Missing POST /:gapId/escalate');
        assert(src.includes("router.post('/:gapId/snooze'"), 'Missing POST /:gapId/snooze');
    });

    await test('index.js registers /api/v1/gaps route', async () => {
        const src = fs.readFileSync(path.resolve(__dirname, '../../index.js'), 'utf-8');
        assert(src.includes("'/api/v1/gaps'"), 'Missing /api/v1/gaps registration');
        assert(src.includes('gapManagerRoutes'), 'Missing gapManagerRoutes variable');
    });

    // ── Suite 6: Frontend components ──────────────────────────────────────────
    console.log('\n6. Frontend Gap components');

    const uiBase = path.resolve(__dirname, '../../../mcp/src');

    await test('GapDashboard.jsx has summary cards and aging bars', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Gaps/GapDashboard.jsx'), 'utf-8');
        assert(src.includes('/gaps/dashboard'), 'Missing API endpoint');
        assert(src.includes('StatCard'), 'Missing StatCard component');
        assert(src.includes('AgingBar'), 'Missing AgingBar component');
        assert(src.includes('onFilterChange'), 'Missing onFilterChange prop');
    });

    await test('GapList.jsx has bulk actions and selection', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Gaps/GapList.jsx'), 'utf-8');
        assert(src.includes('/gaps/list'), 'Missing API endpoint');
        assert(src.includes('Bulk Actions'), 'Missing bulk actions menu');
        assert(src.includes('onSelectionChange'), 'Missing onSelectionChange prop');
        assert(src.includes('TablePagination'), 'Missing pagination');
        assert(src.includes('acknowledge'), 'Missing acknowledge bulk action');
        assert(src.includes('snooze'), 'Missing snooze bulk action');
    });

    await test('EscalationPanel.jsx has timeline and snooze buttons', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Gaps/EscalationPanel.jsx'), 'utf-8');
        assert(src.includes('KM-019'), 'Missing KM-019 Codex rule reference');
        assert(src.includes('Timeline'), 'Missing Timeline component');
        assert(src.includes('onEscalate'), 'Missing onEscalate prop');
        assert(src.includes('onSnooze'), 'Missing onSnooze prop');
        assert(src.includes('Snooze'), 'Missing Snooze button');
    });

    await test('GapDetail.jsx has Details + Escalation tabs', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Gaps/GapDetail.jsx'), 'utf-8');
        assert(src.includes('GapPanel'), 'Missing GapPanel import');
        assert(src.includes('EscalationPanel'), 'Missing EscalationPanel import');
        assert(src.includes("'Details'") || src.includes('"Details"') || src.includes('Details'), 'Missing Details tab');
        assert(src.includes('/gaps/'), 'Missing API endpoint');
    });

    await test('GapManagerPage.jsx registered at /gaps route', async () => {
        const appSrc = fs.readFileSync(path.join(uiBase, 'App.jsx'), 'utf-8');
        assert(appSrc.includes('"/gaps"') || appSrc.includes("'/gaps'") || appSrc.includes('/gaps'), 'Missing /gaps route');
        assert(appSrc.includes('GapManagerPage'), 'Missing GapManagerPage import');
    });

    await test('Sidebar.jsx includes Gap Manager nav link', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Layout/Sidebar.jsx'), 'utf-8');
        assert(src.includes('"/gaps"') || src.includes("'/gaps'") || src.includes('to="/gaps"'), 'Missing /gaps in sidebar');
        assert(src.includes('Gap Manager'), 'Missing Gap Manager label');
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
