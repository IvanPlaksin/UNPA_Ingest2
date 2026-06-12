#!/usr/bin/env node
/**
 * Unit Tests: Knowledge Health Service + API
 *
 * Tests cover (no live DB required):
 *   1. KnowledgeHealthService exports and interface
 *   2. Health score calculation formula
 *   3. Health level thresholds
 *   4. Route file structure (5 endpoint patterns)
 *   5. index.js registers /api/v1/knowledge-health
 *   6. Frontend components existence and key content
 *
 * Run: node api/tests/unit/knowledge-health.test.js
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

// Inline health score formula (mirrors service implementation)
function healthScore({ avgCompleteness, classifiedPct, avgKQS, openHighGaps, totalProcesses }) {
    const complScore = Math.min(avgCompleteness / 0.70, 1) * 30;
    const classScore = (classifiedPct / 100) * 25;
    const kqsScore   = Math.min(avgKQS / 0.70, 1) * 25;
    const gapRatio   = totalProcesses > 0 ? Math.min(openHighGaps / Math.max(totalProcesses, 1), 1) : 0;
    const gapScore   = (1 - gapRatio) * 20;
    return Math.round(complScore + classScore + kqsScore + gapScore);
}

function healthLevel(score) {
    if (score >= 90) return 'EXCELLENT';
    if (score >= 70) return 'GOOD';
    if (score >= 50) return 'FAIR';
    if (score >= 30) return 'POOR';
    return 'CRITICAL';
}

async function runTests() {
    const { KnowledgeHealthService, knowledgeHealthService }
        = require('../../src/services/knowledge/knowledge-health.service');
    const fs   = require('fs');
    const path = require('path');

    // ── Suite 1: Service exports ──────────────────────────────────────────────
    console.log('\n1. KnowledgeHealthService exports');

    await test('exports singleton with all public methods', async () => {
        assert(knowledgeHealthService != null, 'singleton is null');
        assert(typeof knowledgeHealthService.getSystemHealth   === 'function', 'getSystemHealth missing');
        assert(typeof knowledgeHealthService.getNamespaces     === 'function', 'getNamespaces missing');
        assert(typeof knowledgeHealthService.getNamespaceDetail === 'function', 'getNamespaceDetail missing');
        assert(typeof knowledgeHealthService.getActivity       === 'function', 'getActivity missing');
        assert(typeof knowledgeHealthService.exportNamespace   === 'function', 'exportNamespace missing');
    });

    await test('exports KnowledgeHealthService class', async () => {
        assert(typeof KnowledgeHealthService === 'function', 'class not exported');
        const inst = new KnowledgeHealthService();
        assert(typeof inst._getNamespacesSummary === 'function', '_getNamespacesSummary missing');
    });

    // ── Suite 2: Health score calculation ─────────────────────────────────────
    console.log('\n2. Health score calculation');

    await test('perfect conditions → EXCELLENT (≥90)', async () => {
        const score = healthScore({
            avgCompleteness: 1.0, classifiedPct: 100, avgKQS: 1.0,
            openHighGaps: 0, totalProcesses: 10
        });
        assert(score >= 90, `Expected ≥90, got ${score}`);
        assertEqual(healthLevel(score), 'EXCELLENT');
    });

    await test('moderate conditions → GOOD or FAIR (50-89)', async () => {
        const score = healthScore({
            avgCompleteness: 0.50, classifiedPct: 70, avgKQS: 0.50,
            openHighGaps: 2, totalProcesses: 10
        });
        assert(score >= 50 && score < 90, `Expected 50-89, got ${score}`);
        const lvl = healthLevel(score);
        assert(lvl === 'GOOD' || lvl === 'FAIR', `Expected GOOD or FAIR, got ${lvl}`);
    });

    await test('poor conditions → POOR (<50)', async () => {
        const score = healthScore({
            avgCompleteness: 0.2, classifiedPct: 30, avgKQS: 0.3,
            openHighGaps: 8, totalProcesses: 10
        });
        assert(score < 50, `Expected <50, got ${score}`);
    });

    await test('zero processes → no gap penalty', async () => {
        const score = healthScore({
            avgCompleteness: 0.7, classifiedPct: 100, avgKQS: 0.7,
            openHighGaps: 0, totalProcesses: 0
        });
        assert(score >= 70, `Expected ≥70, got ${score}`);
    });

    await test('30% weight for completeness (max contribution)', async () => {
        // Perfect completeness with everything else zero
        const score = healthScore({
            avgCompleteness: 1.0, classifiedPct: 0, avgKQS: 0,
            openHighGaps: 0, totalProcesses: 0
        });
        // complScore(30) + gapScore(20) = 50 (classified and KQS both 0)
        assertEqual(score, 50, `Expected 50, got ${score}`);
    });

    await test('25% weight for classification (max contribution)', async () => {
        const score = healthScore({
            avgCompleteness: 0, classifiedPct: 100, avgKQS: 0,
            openHighGaps: 0, totalProcesses: 0
        });
        // classScore(25) + gapScore(20) = 45
        assertEqual(score, 45, `Expected 45, got ${score}`);
    });

    // ── Suite 3: Health level thresholds ──────────────────────────────────────
    console.log('\n3. Health level thresholds');

    const levels = [
        [90, 'EXCELLENT'],
        [89, 'GOOD'],
        [70, 'GOOD'],
        [69, 'FAIR'],
        [50, 'FAIR'],
        [49, 'POOR'],
        [30, 'POOR'],
        [29, 'CRITICAL'],
        [0,  'CRITICAL']
    ];
    for (const [score, expected] of levels) {
        await test(`score ${score} → ${expected}`, async () => {
            assertEqual(healthLevel(score), expected);
        });
    }

    // ── Suite 4: Route file structure ─────────────────────────────────────────
    console.log('\n4. Route file structure');

    await test('knowledge-health.route.js exports a router', async () => {
        const route = require('../../src/routes/knowledge-health.route');
        assert(route != null && (typeof route === 'function' || typeof route.get === 'function'),
            'Not a router');
    });

    await test('route file has all 5 endpoint patterns', async () => {
        const src = fs.readFileSync(
            path.resolve(__dirname, '../../src/routes/knowledge-health.route.js'), 'utf-8'
        );
        assert(src.includes("router.get('/system'"),              'Missing GET /system');
        assert(src.includes("router.get('/namespaces'"),          'Missing GET /namespaces');
        assert(src.includes("router.get('/namespaces/:ns'"),      'Missing GET /namespaces/:ns');
        assert(src.includes("router.get('/namespaces/:ns/activity'"), 'Missing GET /namespaces/:ns/activity');
        assert(src.includes("router.get('/namespaces/:ns/export'"),   'Missing GET /namespaces/:ns/export');
    });

    // ── Suite 5: index.js registration ───────────────────────────────────────
    console.log('\n5. index.js registration');

    await test('index.js registers /api/v1/knowledge-health route', async () => {
        const src = fs.readFileSync(path.resolve(__dirname, '../../index.js'), 'utf-8');
        assert(src.includes("'/api/v1/knowledge-health'"), 'Missing /api/v1/knowledge-health registration');
        assert(src.includes('knowledgeHealthRoutes'), 'Missing knowledgeHealthRoutes variable');
    });

    // ── Suite 6: Frontend components ─────────────────────────────────────────
    console.log('\n6. Frontend Dashboard components');

    const uiBase = path.resolve(__dirname, '../../../mcp/src');

    await test('SystemHealthCard.jsx has Ring, MetricCard, and health levels', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Dashboard/SystemHealthCard.jsx'), 'utf-8');
        assert(src.includes('LEVEL_COLOR'), 'Missing LEVEL_COLOR map');
        assert(src.includes('EXCELLENT'),   'Missing EXCELLENT level');
        assert(src.includes('Ring'),        'Missing Ring component');
        assert(src.includes('MetricCard'),  'Missing MetricCard component');
        assert(src.includes('healthScore'), 'Missing healthScore prop');
        assert(src.includes('healthLevel'), 'Missing healthLevel prop');
    });

    await test('NamespaceHealthTable.jsx has sortable columns and health icons', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Dashboard/NamespaceHealthTable.jsx'), 'utf-8');
        assert(src.includes('TableSortLabel'), 'Missing TableSortLabel');
        assert(src.includes('completeness'),   'Missing completeness column');
        assert(src.includes('healthScore'),    'Missing healthScore column');
        assert(src.includes('LEVEL_EMOJI'),    'Missing health emoji map');
        assert(src.includes('LinearProgress'), 'Missing LinearProgress bars');
    });

    await test('NamespaceDetail.jsx has 4 tabs and calls /knowledge-health API', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Dashboard/NamespaceDetail.jsx'), 'utf-8');
        assert(src.includes('/knowledge-health/namespaces'), 'Missing API endpoint');
        assert(src.includes("'Overview'") || src.includes('"Overview"') || src.includes('Overview'), 'Missing Overview tab');
        assert(src.includes('Processes'),  'Missing Processes tab');
        assert(src.includes('Activity'),   'Missing Activity tab');
        assert(src.includes('ActivityFeed'), 'Missing ActivityFeed import');
        assert(src.includes('onNavigate'), 'Missing onNavigate prop');
    });

    await test('ActivityFeed.jsx has event types and timeline', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Dashboard/ActivityFeed.jsx'), 'utf-8');
        assert(src.includes('EVENT_META'), 'Missing EVENT_META map');
        assert(src.includes('UPLOAD'),     'Missing UPLOAD event type');
        assert(src.includes('CLASSIFY'),   'Missing CLASSIFY event type');
        assert(src.includes('GAP_OPEN'),   'Missing GAP_OPEN event type');
        assert(src.includes('GAP_CLOSED'), 'Missing GAP_CLOSED event type');
    });

    await test('KnowledgeHealthPage.jsx registered at /knowledge-health route', async () => {
        const appSrc = fs.readFileSync(path.join(uiBase, 'App.jsx'), 'utf-8');
        assert(appSrc.includes('/knowledge-health'), 'Missing /knowledge-health route');
        assert(appSrc.includes('KnowledgeHealthPage'), 'Missing KnowledgeHealthPage import');
    });

    await test('Sidebar.jsx includes Health Dashboard nav link', async () => {
        const src = fs.readFileSync(path.join(uiBase, 'components/Layout/Sidebar.jsx'), 'utf-8');
        assert(src.includes('/knowledge-health'), 'Missing /knowledge-health in sidebar');
        assert(src.includes('Health Dashboard') || src.includes('Knowledge Health'), 'Missing Health nav label');
        assert(src.includes('HeartPulse'), 'Missing HeartPulse icon');
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
