/**
 * E2E Tests for DSPy JavaScript Client
 *
 * Tests DSPyClient and DSPyService functionality.
 * Can run against mock or real DSPy service.
 */

'use strict';

const { DSPyClient, createDSPyClient } = require('../../src/services/dspy/dspy-client');
const { DSPyService, createDSPyService } = require('../../src/services/dspy/dspy.service');

// ═══════════════════════════════════════════════════════════════════════════════
// TEST UTILITIES
// ═══════════════════════════════════════════════════════════════════════════════

const testResults = {
    passed: 0,
    failed: 0,
    tests: []
};

function test(name, fn) {
    try {
        const result = fn();
        if (result instanceof Promise) {
            return result
                .then(() => {
                    console.log(`  ✓ ${name}`);
                    testResults.passed++;
                    testResults.tests.push({ name, status: 'passed' });
                })
                .catch(err => {
                    console.log(`  ✗ ${name}: ${err.message}`);
                    testResults.failed++;
                    testResults.tests.push({ name, status: 'failed', error: err.message });
                });
        }
        console.log(`  ✓ ${name}`);
        testResults.passed++;
        testResults.tests.push({ name, status: 'passed' });
    } catch (err) {
        console.log(`  ✗ ${name}: ${err.message}`);
        testResults.failed++;
        testResults.tests.push({ name, status: 'failed', error: err.message });
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected ${expected}, got ${actual}`);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DSPY CLIENT TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testDSPyClient() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing DSPyClient');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Client instantiation
    test('Client instantiation with default options', () => {
        const client = new DSPyClient();
        assert(client.options.baseUrl === 'http://localhost:5001', 'Default baseUrl');
        assert(client.options.timeout === 30000, 'Default timeout');
        assert(client.options.retries === 3, 'Default retries');
    });

    // Test 2: Client instantiation with custom options
    test('Client instantiation with custom options', () => {
        const client = createDSPyClient({
            baseUrl: 'http://custom:8000',
            timeout: 60000,
            retries: 5
        });
        assert(client.options.baseUrl === 'http://custom:8000', 'Custom baseUrl');
        assert(client.options.timeout === 60000, 'Custom timeout');
        assert(client.options.retries === 5, 'Custom retries');
    });

    // Test 3: Stats initialization
    test('Stats initialization', () => {
        const client = new DSPyClient();
        const stats = client.getStats();
        assert(stats.totalRequests === 0, 'Initial totalRequests');
        assert(stats.successfulRequests === 0, 'Initial successfulRequests');
        assert(stats.successRate === '0%', 'Initial successRate');
    });

    // Test 4: Stats reset
    test('Stats reset', () => {
        const client = new DSPyClient();
        client.stats.totalRequests = 10;
        client.stats.successfulRequests = 8;
        client.resetStats();
        assert(client.stats.totalRequests === 0, 'Reset totalRequests');
    });

    // Test 5: Triple conversion
    test('Triple conversion', () => {
        const client = new DSPyClient();
        const entities = [
            { name: 'Bug123', type: 'Bug' },
            { name: 'John', type: 'User' }
        ];
        const relations = [
            { source: 'Bug123', target: 'John', relation_type: 'ASSIGNED_TO', confidence: 0.9 }
        ];

        const triples = client._convertToTriples(entities, relations);
        assert(triples.length === 1, 'One triple created');
        assert(triples[0].subject.name === 'Bug123', 'Subject name');
        assert(triples[0].predicate === 'ASSIGNED_TO', 'Predicate');
        assert(triples[0].object.name === 'John', 'Object name');
    });

    // Test 6: Health check (will fail if service not running)
    await test('Health check (service may not be running)', async () => {
        const client = new DSPyClient({ timeout: 2000, retries: 1 });
        const healthy = await client.healthCheck();
        // This may be true or false depending on whether service is running
        assert(typeof healthy === 'boolean', 'Returns boolean');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DSPY SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testDSPyService() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing DSPyService');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Service instantiation
    test('Service instantiation with default options', () => {
        const service = new DSPyService();
        assert(service.options.useDSPy === true, 'Default useDSPy');
        assert(service.options.fallbackToLocal === true, 'Default fallbackToLocal');
        assert(service.options.cacheResults === true, 'Default cacheResults');
    });

    // Test 2: Service instantiation with custom options
    test('Service instantiation with custom options', () => {
        const service = createDSPyService({
            useDSPy: false,
            fallbackToLocal: true,
            cacheTTL: 7200000
        });
        assert(service.options.useDSPy === false, 'Custom useDSPy');
        assert(service.options.cacheTTL === 7200000, 'Custom cacheTTL');
    });

    // Test 3: Cache key generation
    test('Cache key generation', () => {
        const service = new DSPyService();
        const key1 = service._getCacheKey('entities', 'test text', { opt: 1 });
        const key2 = service._getCacheKey('entities', 'test text', { opt: 1 });
        const key3 = service._getCacheKey('entities', 'different text', { opt: 1 });

        assert(key1 === key2, 'Same input = same key');
        assert(key1 !== key3, 'Different input = different key');
    });

    // Test 4: Cache operations
    test('Cache operations', () => {
        const service = new DSPyService();
        const key = 'test_key';
        const data = { entities: [{ name: 'Test', type: 'Entity' }] };

        service._cacheResult(key, data);
        assert(service.cache.has(key), 'Cache stores data');

        const cached = service.cache.get(key);
        assert(cached.data.entities.length === 1, 'Cached data correct');

        service.clearCache();
        assert(service.cache.size === 0, 'Cache cleared');
    });

    // Test 5: Score to grade conversion
    test('Score to grade conversion', () => {
        const service = new DSPyService();
        assert(service._scoreToGrade(0.95) === 'A', 'Score 0.95 = A');
        assert(service._scoreToGrade(0.85) === 'B', 'Score 0.85 = B');
        assert(service._scoreToGrade(0.75) === 'C', 'Score 0.75 = C');
        assert(service._scoreToGrade(0.65) === 'D', 'Score 0.65 = D');
        assert(service._scoreToGrade(0.50) === 'F', 'Score 0.50 = F');
    });

    // Test 6: Simple entity extraction (fallback)
    test('Simple entity extraction (fallback patterns)', () => {
        const service = new DSPyService();
        const text = 'Bug123 is assigned to @john. Modified file test.js';

        const entities = service._simpleEntityExtraction(text);

        assert(entities.length >= 2, 'Extracts multiple entities');

        const bug = entities.find(e => e.name.includes('Bug'));
        assert(bug, 'Finds Bug entity');

        const file = entities.find(e => e.type === 'File');
        assert(file, 'Finds File entity');
    });

    // Test 7: Simple relation extraction (fallback)
    test('Simple relation extraction (fallback patterns)', () => {
        const service = new DSPyService();
        const text = 'Bug123 assigned to John. Task456 depends on Feature789.';
        const entities = [
            { name: 'Bug123', type: 'Bug' },
            { name: 'John', type: 'User' },
            { name: 'Task456', type: 'Task' },
            { name: 'Feature789', type: 'Feature' }
        ];

        const relations = service._simpleRelationExtraction(text, entities);
        assert(relations.length >= 1, 'Extracts relations');
    });

    // Test 8: Local plan extraction
    test('Local plan extraction', () => {
        const service = new DSPyService();

        // Short text
        const shortPlan = service._localPlanExtraction('Hello world');
        assert(shortPlan.textType === 'short_text', 'Short text detected');
        assert(shortPlan.complexity === 'low', 'Low complexity');

        // Code text
        const codePlan = service._localPlanExtraction('function test() { const x = 1; }');
        assert(codePlan.textType === 'code', 'Code detected');
        assert(codePlan.complexity === 'high', 'High complexity');

        // Structured text
        const structuredPlan = service._localPlanExtraction('# Heading\n\n## Section\n\n- Item 1\n- Item 2');
        assert(structuredPlan.textType === 'structured_document', 'Structured document detected');
    });

    // Test 9: Local verification
    test('Local verification', () => {
        const service = new DSPyService();
        const entities = [
            { name: 'Bug123', type: 'Bug' },
            { name: 'NonExistent', type: 'Entity' }
        ];
        const relations = [];
        const sourceText = 'Bug123 is a critical issue that needs fixing.';

        const result = service._localVerification(entities, relations, sourceText);

        assert(result.score > 0, 'Has score');
        assert(result.grade, 'Has grade');
        assert(typeof result.issueCount === 'number', 'Has issue count');
    });

    // Test 10: Extract with fallback (DSPy unavailable)
    await test('Extract entities with fallback (DSPy unavailable)', async () => {
        const service = createDSPyService({
            useDSPy: true,
            fallbackToLocal: true
        });

        // Force DSPy unavailable
        service.isAvailable = false;

        const result = await service.extractEntities(
            'Bug123 is assigned to @john',
            {}
        );

        assert(result.entities, 'Has entities');
        assert(result.source === 'local_simple' || result.source === 'local', 'Used fallback');
    });

    // Test 11: Extract knowledge graph with fallback
    await test('Extract knowledge graph with fallback', async () => {
        const service = createDSPyService({
            useDSPy: true,
            fallbackToLocal: true
        });

        service.isAvailable = false;

        const result = await service.extractKnowledgeGraph(
            'Bug123 is assigned to @john',
            {}
        );

        assert(result.entities, 'Has entities');
        assert(result.relations !== undefined, 'Has relations');
        assert(result.source === 'local_fallback', 'Used fallback');
    });

    // Test 12: Service stats
    test('Service stats', () => {
        const service = new DSPyService();
        const stats = service.getStats();

        assert(stats.clientStats, 'Has client stats');
        assert(typeof stats.cacheSize === 'number', 'Has cache size');
        assert(typeof stats.isAvailable === 'boolean' || stats.isAvailable === null, 'Has availability');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS (requires running DSPy service)
// ═══════════════════════════════════════════════════════════════════════════════

async function testIntegration() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing Integration (requires DSPy service at localhost:5001)');
    console.log('═══════════════════════════════════════════════════════════════');

    const service = createDSPyService({
        useDSPy: true,
        fallbackToLocal: true
    });

    const isAvailable = await service.isServiceAvailable();

    if (!isAvailable) {
        console.log('  ⚠ DSPy service not available, skipping integration tests');
        return;
    }

    console.log('  ✓ DSPy service is available');

    // Test: Full entity extraction via DSPy
    await test('Entity extraction via DSPy', async () => {
        const result = await service.extractEntities(
            'Bug123 is a critical bug assigned to John Smith. It affects the login.js file.',
            { useCoT: false }
        );

        assert(result.source === 'dspy', 'Used DSPy');
        assert(result.entities.length > 0, 'Extracted entities');
    });

    // Test: Full KG extraction via DSPy
    await test('Knowledge graph extraction via DSPy', async () => {
        const result = await service.extractKnowledgeGraph(
            'Task456 depends on Feature789. Both are assigned to the DevTeam.',
            { useCoT: false, verify: true }
        );

        assert(result.source === 'dspy', 'Used DSPy');
        assert(result.entities.length > 0, 'Extracted entities');
    });

    // Test: Planning via DSPy
    await test('Plan extraction via DSPy', async () => {
        const result = await service.planExtraction(
            'This is a work item description with acceptance criteria and story points.',
            {}
        );

        assert(result.textType, 'Has text type');
        assert(result.steps.length > 0, 'Has steps');
    });

    // Test: Service status
    await test('Get service status', async () => {
        const status = await service.getStatus();

        assert(status.available === true, 'Service available');
        assert(status.loadedModules, 'Has loaded modules');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║           DSPy JavaScript Client Tests                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    try {
        await testDSPyClient();
        await testDSPyService();
        await testIntegration();

        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log(`Results: ${testResults.passed} passed, ${testResults.failed} failed`);
        console.log('═══════════════════════════════════════════════════════════════');

        if (testResults.failed > 0) {
            console.log('\nFailed tests:');
            testResults.tests
                .filter(t => t.status === 'failed')
                .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
        }

        process.exit(testResults.failed > 0 ? 1 : 0);
    } catch (error) {
        console.error('\nTest suite error:', error);
        process.exit(1);
    }
}

// Run tests
runAllTests();
