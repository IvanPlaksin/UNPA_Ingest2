/**
 * E2E Tests for GNN-Enhanced Extractor
 *
 * Tests the full pipeline: Retrieve → Extract → Link → Update → Learn
 */

'use strict';

const {
    GNNEnhancedExtractor,
    createGNNEnhancedExtractor,
    gnnEnhancedExtractor
} = require('../../src/services/extraction');

const { createGNNRAGService } = require('../../src/services/gnn');

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

// Sample graph for testing
const sampleGraph = {
    nodes: [
        { id: 'bug1', name: 'Bug #123', type: 'Bug', attributes: { priority: 'high' } },
        { id: 'user1', name: 'John Smith', type: 'Person', attributes: { role: 'developer' } },
        { id: 'system1', name: 'PaymentSystem', type: 'System', attributes: { version: '2.0' } }
    ],
    edges: [
        { source: 'bug1', target: 'user1', type: 'ASSIGNED_TO' },
        { source: 'bug1', target: 'system1', type: 'AFFECTS' }
    ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// GNN-ENHANCED EXTRACTOR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testGNNEnhancedExtractor() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing GNNEnhancedExtractor');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Basic instantiation
    test('GNNEnhancedExtractor instantiation', () => {
        const extractor = new GNNEnhancedExtractor();
        assert(extractor.options.enableRetrieval === true, 'Retrieval should be enabled by default');
        assert(extractor.options.enableGraphUpdate === true, 'Graph update should be enabled by default');
        assert(extractor.options.enableLearning === true, 'Learning should be enabled by default');
    });

    // Test 2: Custom options
    test('GNNEnhancedExtractor with custom options', () => {
        const extractor = createGNNEnhancedExtractor({
            enableRetrieval: false,
            extractionMode: 'pattern_only',
            updateBatchSize: 5
        });

        assertEqual(extractor.options.enableRetrieval, false, 'Retrieval should be disabled');
        assertEqual(extractor.options.extractionMode, 'pattern_only', 'Mode should be pattern_only');
        assertEqual(extractor.options.updateBatchSize, 5, 'Batch size should be 5');
    });

    // Test 3: Initialize with graph
    await test('Initialize with graph data', async () => {
        const gnnRAG = createGNNRAGService();
        const extractor = createGNNEnhancedExtractor({ gnnRAG });

        await extractor.initializeGraph(sampleGraph);

        const state = extractor.getGraphState();
        assertEqual(state.nodes, 3, 'Should have 3 nodes');
        assertEqual(state.edges, 2, 'Should have 2 edges');
    });

    // Test 4: Basic extraction without graph
    await test('Extract without graph', async () => {
        const gnnRAG = createGNNRAGService();
        const extractor = createGNNEnhancedExtractor({
            gnnRAG,
            enableRetrieval: false
        });

        const result = await extractor.extract(
            'Bug#456 is assigned to Jane Doe. It affects the OrderSystem.',
            { domain: 'devops' }
        );

        assert(result.entities, 'Should have entities');
        assert(result.relations !== undefined, 'Should have relations');
        assert(result.metadata, 'Should have metadata');
    });

    // Test 5: Extraction with graph retrieval
    await test('Extract with graph retrieval', async () => {
        const gnnRAG = createGNNRAGService({ minSimilarity: 0.01 });
        gnnRAG.updateGraph(sampleGraph);

        const extractor = createGNNEnhancedExtractor({ gnnRAG });

        const result = await extractor.extract(
            'Bug #123 requires urgent attention from the team.',
            { domain: 'devops' }
        );

        assert(result.metadata, 'Should have metadata');
        // If retrieval worked, should have retrieval metadata
    });

    // Test 6: Entity linking
    test('Entity linking to existing graph', () => {
        const gnnRAG = createGNNRAGService();
        gnnRAG.updateGraph(sampleGraph);

        const extractor = createGNNEnhancedExtractor({ gnnRAG });

        const extraction = {
            entities: [
                { name: 'Bug #123', type: 'Bug', confidence: 0.9 },
                { name: 'NewEntity', type: 'Entity', confidence: 0.8 }
            ],
            relations: []
        };

        const linked = extractor._linkToExistingGraph(extraction);

        // Bug #123 should be linked
        const linkedBug = linked.entities.find(e => e.name === 'Bug #123');
        assert(linkedBug.linkedTo === 'bug1', 'Bug #123 should be linked to bug1');

        // NewEntity should not be linked
        const newEntity = linked.entities.find(e => e.name === 'NewEntity');
        assert(!newEntity.linkedTo, 'NewEntity should not be linked');
    });

    // Test 7: Graph update queueing
    test('Graph update queueing', () => {
        const gnnRAG = createGNNRAGService();
        const extractor = createGNNEnhancedExtractor({ gnnRAG });

        const extraction = {
            entities: [
                { name: 'NewBug', type: 'Bug', confidence: 0.9 }
            ],
            relations: [
                { subject: 'NewBug', predicate: 'AFFECTS', object: 'System', confidence: 0.8 }
            ]
        };

        extractor._queueGraphUpdates(extraction, 'Test text');

        assertEqual(extractor.pendingUpdates.nodes.length, 1, 'Should have 1 pending node');
        assertEqual(extractor.pendingUpdates.edges.length, 1, 'Should have 1 pending edge');
    });

    // Test 8: Flush graph updates
    await test('Flush graph updates', async () => {
        const gnnRAG = createGNNRAGService();
        const extractor = createGNNEnhancedExtractor({ gnnRAG });

        extractor.pendingUpdates.nodes = [
            { id: 'new1', name: 'NewNode', type: 'Entity' }
        ];

        await extractor._flushGraphUpdates();

        assertEqual(extractor.pendingUpdates.nodes.length, 0, 'Pending nodes should be cleared');
        assertEqual(gnnRAG.graphCache.nodes.size, 1, 'Graph should have 1 node');
    });

    // Test 9: Incremental extraction
    await test('Incremental extraction', async () => {
        const gnnRAG = createGNNRAGService();
        const extractor = createGNNEnhancedExtractor({
            gnnRAG,
            enableRetrieval: false
        });

        const initialNodes = gnnRAG.graphCache.nodes.size;

        await extractor.incrementalExtract('Bug#999 is a new critical issue.');

        // Should have flushed updates immediately
        assertEqual(extractor.pendingUpdates.nodes.length, 0, 'No pending nodes after incremental');
    });

    // Test 10: Batch extraction
    await test('Batch extraction', async () => {
        const gnnRAG = createGNNRAGService();
        const extractor = createGNNEnhancedExtractor({
            gnnRAG,
            enableRetrieval: false
        });

        const texts = [
            'Bug#1 is critical.',
            'Task#2 is pending.',
            'Feature#3 is done.'
        ];

        let progressCalled = false;
        const result = await extractor.extractBatch(texts, {
            onProgress: (current, total) => {
                progressCalled = true;
            }
        });

        assertEqual(result.results.length, 3, 'Should have 3 results');
        assert(progressCalled, 'Progress callback should be called');
        assert(result.summary, 'Should have summary');
    });

    // Test 11: Export graph
    test('Export graph', () => {
        const gnnRAG = createGNNRAGService();
        gnnRAG.updateGraph(sampleGraph);

        const extractor = createGNNEnhancedExtractor({ gnnRAG });
        const exported = extractor.exportGraph();

        assertEqual(exported.nodes.length, 3, 'Should export 3 nodes');
        assertEqual(exported.edges.length, 2, 'Should export 2 edges');
        assert(exported.exportedAt, 'Should have timestamp');
    });

    // Test 12: Statistics
    test('Statistics tracking', () => {
        const extractor = new GNNEnhancedExtractor();
        extractor.resetStats();

        extractor.stats.totalExtractions = 10;
        extractor.stats.withRetrieval = 8;
        extractor.stats.nodesAdded = 25;

        const stats = extractor.getStats();

        assertEqual(stats.totalExtractions, 10, 'Total should be 10');
        assertEqual(stats.withRetrieval, 8, 'With retrieval should be 8');
        assertEqual(stats.nodesAdded, 25, 'Nodes added should be 25');
    });

    // Test 13: Singleton instance
    test('Singleton instance available', () => {
        assert(gnnEnhancedExtractor instanceof GNNEnhancedExtractor,
            'Should have singleton instance');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testIntegration() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing Integration');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Full pipeline
    await test('Full extraction pipeline', async () => {
        const gnnRAG = createGNNRAGService({ minSimilarity: 0.01 });
        gnnRAG.updateGraph(sampleGraph);

        const extractor = createGNNEnhancedExtractor({ gnnRAG });

        const result = await extractor.extract(
            'Bug #123 was fixed by John Smith. The PaymentSystem is now stable.',
            { domain: 'devops' }
        );

        assert(result.entities, 'Should have entities');
        assert(result.metadata, 'Should have metadata');
        assert(typeof result.metadata.duration === 'number', 'Should have duration');
    });

    // Test 2: Module exports
    test('Module exports correctly', () => {
        const extraction = require('../../src/services/extraction');

        assert(extraction.GNNEnhancedExtractor, 'Should export GNNEnhancedExtractor');
        assert(extraction.createGNNEnhancedExtractor, 'Should export factory');
        assert(extraction.gnnEnhancedExtractor, 'Should export singleton');
    });

    // Test 3: Context enrichment
    test('Context enrichment', () => {
        const extractor = new GNNEnhancedExtractor();

        const enriched = extractor._enrichTextWithContext(
            'Original text',
            'Context from graph'
        );

        assert(enriched.includes('CONTEXT FROM KNOWLEDGE GRAPH'), 'Should have context header');
        assert(enriched.includes('Original text'), 'Should have original text');
        assert(enriched.includes('Context from graph'), 'Should have context');
    });

    // Test 4: Fuzzy matching
    test('Fuzzy entity matching', () => {
        const gnnRAG = createGNNRAGService();
        gnnRAG.updateGraph({
            nodes: [{ id: 'payment', name: 'PaymentSystem', type: 'System' }],
            edges: []
        });

        const extractor = createGNNEnhancedExtractor({ gnnRAG });

        // Should match "Payment" to "PaymentSystem"
        const match = extractor._findMatchingNode({ name: 'Payment', type: 'System' });
        assert(match, 'Should find fuzzy match');
        assertEqual(match.match, 'fuzzy', 'Should be fuzzy match');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║           GNN-Enhanced Extractor Tests                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    try {
        await testGNNEnhancedExtractor();
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
