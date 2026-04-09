/**
 * E2E Tests for GNN-RAG Integration
 *
 * Tests GNNRAGService and HybridRetriever functionality.
 */

'use strict';

const {
    GNNRAGService,
    createGNNRAGService,
    gnnRAGService,
    HybridRetriever,
    createHybridRetriever,
    hybridRetriever
} = require('../../src/services/gnn');

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

// Sample graph data for testing
const sampleGraphData = {
    nodes: [
        { id: 'bug1', name: 'Bug #123', type: 'Bug', attributes: { priority: 'high' } },
        { id: 'task1', name: 'Task #456', type: 'Task', attributes: { status: 'open' } },
        { id: 'user1', name: 'John Smith', type: 'Person', attributes: { role: 'developer' } },
        { id: 'system1', name: 'PaymentSystem', type: 'System', attributes: { version: '2.0' } },
        { id: 'api1', name: 'Payment API', type: 'API', attributes: { protocol: 'REST' } }
    ],
    edges: [
        { source: 'bug1', target: 'user1', type: 'ASSIGNED_TO' },
        { source: 'task1', target: 'bug1', type: 'DEPENDS_ON' },
        { source: 'system1', target: 'api1', type: 'USES' },
        { source: 'bug1', target: 'system1', type: 'AFFECTS' }
    ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// GNN-RAG SERVICE TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testGNNRAGService() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing GNNRAGService');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Basic instantiation
    test('GNNRAGService instantiation', () => {
        const service = new GNNRAGService();
        assertEqual(service.options.topK, 10, 'Default topK should be 10');
        assertEqual(service.options.maxHops, 2, 'Default maxHops should be 2');
        assertEqual(service.options.semanticWeight, 0.6, 'Default semantic weight should be 0.6');
    });

    // Test 2: Custom options
    test('GNNRAGService with custom options', () => {
        const service = createGNNRAGService({
            topK: 20,
            maxHops: 3,
            semanticWeight: 0.7,
            structuralWeight: 0.3
        });

        assertEqual(service.options.topK, 20, 'topK should be 20');
        assertEqual(service.options.maxHops, 3, 'maxHops should be 3');
        assertEqual(service.options.semanticWeight, 0.7, 'semanticWeight should be 0.7');
    });

    // Test 3: Initialize with graph data
    await test('Initialize with graph data', async () => {
        const service = createGNNRAGService();
        await service.initialize(sampleGraphData);

        assert(service.initialized, 'Service should be initialized');
        assertEqual(service.graphCache.nodes.size, 5, 'Should have 5 nodes');
        assertEqual(service.graphCache.edges.size, 4, 'Should have 4 edges');
    });

    // Test 4: Update graph
    test('Update graph', () => {
        const service = createGNNRAGService();
        service.updateGraph(sampleGraphData);

        assertEqual(service.graphCache.nodes.size, 5, 'Should have 5 nodes');
        assert(service.graphCache.lastUpdated, 'Should have lastUpdated timestamp');
    });

    // Test 5: Add nodes
    test('Add nodes', () => {
        const service = createGNNRAGService();
        service.updateGraph({ nodes: [], edges: [] });

        service.addNodes([
            { id: 'new1', name: 'New Node', type: 'Entity' }
        ]);

        assertEqual(service.graphCache.nodes.size, 1, 'Should have 1 node');
    });

    // Test 6: Add edges
    test('Add edges', () => {
        const service = createGNNRAGService();
        service.updateGraph({
            nodes: [
                { id: 'a', name: 'A' },
                { id: 'b', name: 'B' }
            ],
            edges: []
        });

        service.addEdges([
            { source: 'a', target: 'b', type: 'CONNECTS' }
        ]);

        assertEqual(service.graphCache.edges.size, 1, 'Should have 1 edge');
        assert(service.graphCache.adjacency.get('a').has('b'), 'Adjacency should be updated');
    });

    // Test 7: Simple BOW embedding
    test('Simple BOW embedding', () => {
        const service = createGNNRAGService({ embeddingDim: 128 });
        const embedding = service._simpleBOWEmbedding('test word embedding');

        assertEqual(embedding.length, 128, 'Embedding should have 128 dimensions');

        // Check normalization
        const norm = Math.sqrt(embedding.reduce((sum, x) => sum + x * x, 0));
        assert(Math.abs(norm - 1) < 0.01, 'Embedding should be normalized');
    });

    // Test 8: Cosine similarity
    test('Cosine similarity', () => {
        const service = createGNNRAGService();

        const a = [1, 0, 0];
        const b = [1, 0, 0];
        const c = [0, 1, 0];
        const d = [-1, 0, 0];

        assertEqual(service._cosineSimilarity(a, b), 1, 'Same vectors should have similarity 1');
        assertEqual(service._cosineSimilarity(a, c), 0, 'Orthogonal vectors should have similarity 0');
        assertEqual(service._cosineSimilarity(a, d), -1, 'Opposite vectors should have similarity -1');
    });

    // Test 9: Retrieve with graph
    await test('Retrieve with graph', async () => {
        const service = createGNNRAGService({ minSimilarity: 0.01 });
        service.updateGraph(sampleGraphData);

        const result = await service.retrieve('bug payment', { topK: 3 });

        assert(result.results, 'Should have results');
        assert(result.context, 'Should have context');
        assert(result.metadata, 'Should have metadata');
        assertEqual(result.metadata.method, 'gnn-rag', 'Method should be gnn-rag');
    });

    // Test 10: Multi-hop query
    await test('Multi-hop query', async () => {
        const service = createGNNRAGService({ minSimilarity: 0.01 });
        service.updateGraph(sampleGraphData);

        const result = await service.multiHopQuery('bug', { maxHops: 2 });

        assert(result.hops, 'Should have hops');
        assert(result.results, 'Should have results');
        assert(result.metadata.totalHops >= 1, 'Should have at least 1 hop');
    });

    // Test 11: Statistics
    test('Statistics tracking', () => {
        const service = createGNNRAGService();
        service.resetStats();

        service.stats.totalQueries = 10;
        service.stats.cacheHits = 3;

        const stats = service.getStats();

        assertEqual(stats.totalQueries, 10, 'Total queries should be 10');
        assertEqual(stats.cacheHitRate, '30.0%', 'Cache hit rate should be 30%');
    });

    // Test 12: Clear cache
    test('Clear cache', () => {
        const service = createGNNRAGService();
        service.embeddingsCache.set('test', { embedding: [1, 2, 3], timestamp: Date.now() });

        service.clearCache();

        assertEqual(service.embeddingsCache.size, 0, 'Cache should be empty');
    });

    // Test 13: Singleton instance
    test('Singleton instance available', () => {
        assert(gnnRAGService instanceof GNNRAGService, 'Should have singleton instance');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// HYBRID RETRIEVER TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testHybridRetriever() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing HybridRetriever');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Basic instantiation
    test('HybridRetriever instantiation', () => {
        const retriever = new HybridRetriever();
        assertEqual(retriever.options.fusionMethod, 'rrf', 'Default fusion method should be rrf');
        assert(retriever.options.strategies.includes('semantic'), 'Should include semantic strategy');
        assert(retriever.options.strategies.includes('structural'), 'Should include structural strategy');
        assert(retriever.options.strategies.includes('gnn'), 'Should include gnn strategy');
    });

    // Test 2: Custom options
    test('HybridRetriever with custom options', () => {
        const retriever = createHybridRetriever({
            fusionMethod: 'weighted',
            strategies: ['semantic', 'gnn'],
            strategyWeights: { semantic: 0.6, gnn: 0.4 }
        });

        assertEqual(retriever.options.fusionMethod, 'weighted', 'Fusion method should be weighted');
        assertEqual(retriever.options.strategies.length, 2, 'Should have 2 strategies');
    });

    // Test 3: RRF fusion
    test('Reciprocal Rank Fusion', () => {
        const retriever = new HybridRetriever();

        const resultsByStrategy = {
            semantic: [
                { nodeId: 'a', score: 0.9 },
                { nodeId: 'b', score: 0.8 },
                { nodeId: 'c', score: 0.7 }
            ],
            structural: [
                { nodeId: 'b', score: 0.85 },
                { nodeId: 'd', score: 0.75 },
                { nodeId: 'a', score: 0.65 }
            ]
        };

        const fused = retriever._reciprocalRankFusion(resultsByStrategy, 3);

        assert(fused.length <= 3, 'Should return at most 3 results');
        assert(fused[0].fusedScore > fused[1].fusedScore, 'Results should be sorted by score');
        assertEqual(fused[0].fusionMethod, 'rrf', 'Fusion method should be rrf');
    });

    // Test 4: Weighted fusion
    test('Weighted score fusion', () => {
        const retriever = createHybridRetriever({
            strategyWeights: { semantic: 0.6, structural: 0.4 }
        });

        const resultsByStrategy = {
            semantic: [{ nodeId: 'a', score: 1.0 }],
            structural: [{ nodeId: 'a', score: 0.5 }]
        };

        const fused = retriever._weightedFusion(resultsByStrategy, 1);

        assertEqual(fused.length, 1, 'Should return 1 result');
        assertEqual(fused[0].fusionMethod, 'weighted', 'Fusion method should be weighted');
        // Expected: 0.6 * 1.0 + 0.4 * 0.5 = 0.8
        assert(Math.abs(fused[0].fusedScore - 0.8) < 0.01, 'Score should be 0.8');
    });

    // Test 5: Max fusion
    test('Max score fusion', () => {
        const retriever = new HybridRetriever();

        const resultsByStrategy = {
            semantic: [{ nodeId: 'a', score: 0.7 }],
            structural: [{ nodeId: 'a', score: 0.9 }]
        };

        const fused = retriever._maxFusion(resultsByStrategy, 1);

        assertEqual(fused.length, 1, 'Should return 1 result');
        assertEqual(fused[0].fusionMethod, 'max', 'Fusion method should be max');
        assertEqual(fused[0].fusedScore, 0.9, 'Score should be max of 0.9');
    });

    // Test 6: Retrieve with graph
    await test('Retrieve with graph', async () => {
        // Create GNN-RAG with graph
        const gnnRAG = createGNNRAGService({ minSimilarity: 0.01 });
        gnnRAG.updateGraph(sampleGraphData);

        const retriever = createHybridRetriever({ gnnRAG });

        const result = await retriever.retrieve('bug system', { topK: 3 });

        assert(result.results, 'Should have results');
        assert(result.byStrategy, 'Should have results by strategy');
        assert(result.metadata, 'Should have metadata');
    });

    // Test 7: Available strategies
    test('Get available strategies', () => {
        const retriever = new HybridRetriever();
        const strategies = retriever.getAvailableStrategies();

        assert(strategies.includes('semantic'), 'Should include semantic');
        assert(strategies.includes('structural'), 'Should include structural');
        assert(strategies.includes('gnn'), 'Should include gnn');
    });

    // Test 8: Available fusion methods
    test('Get available fusion methods', () => {
        const retriever = new HybridRetriever();
        const methods = retriever.getAvailableFusionMethods();

        assert(methods.includes('rrf'), 'Should include rrf');
        assert(methods.includes('weighted'), 'Should include weighted');
        assert(methods.includes('max'), 'Should include max');
    });

    // Test 9: Statistics
    test('Statistics tracking', () => {
        const retriever = new HybridRetriever();
        retriever.resetStats();

        retriever.stats.totalQueries = 5;
        retriever.stats.byStrategy = { semantic: 5, gnn: 5 };

        const stats = retriever.getStats();

        assertEqual(stats.totalQueries, 5, 'Total queries should be 5');
        assertEqual(stats.byStrategy.semantic, 5, 'Semantic count should be 5');
    });

    // Test 10: Singleton instance
    test('Singleton instance available', () => {
        assert(hybridRetriever instanceof HybridRetriever, 'Should have singleton instance');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTEGRATION TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testIntegration() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing Integration');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Full workflow
    await test('Full retrieval workflow', async () => {
        // Initialize GNN-RAG with graph
        const gnnRAG = createGNNRAGService({ minSimilarity: 0.01 });
        gnnRAG.updateGraph(sampleGraphData);

        // Create hybrid retriever
        const retriever = createHybridRetriever({
            gnnRAG,
            fusionMethod: 'rrf'
        });

        // Perform retrieval
        const result = await retriever.retrieve('payment bug', { topK: 5 });

        assert(result.results, 'Should have results');
        assert(result.metadata.duration > 0, 'Should have duration');
    });

    // Test 2: Module exports
    test('Module exports correctly', () => {
        const gnn = require('../../src/services/gnn');

        assert(gnn.GNNRAGService, 'Should export GNNRAGService');
        assert(gnn.createGNNRAGService, 'Should export factory');
        assert(gnn.gnnRAGService, 'Should export singleton');
        assert(gnn.HybridRetriever, 'Should export HybridRetriever');
        assert(gnn.createHybridRetriever, 'Should export factory');
        assert(gnn.hybridRetriever, 'Should export singleton');
    });

    // Test 3: Context building
    await test('Context building', async () => {
        const gnnRAG = createGNNRAGService({ minSimilarity: 0.01 });
        gnnRAG.updateGraph(sampleGraphData);

        const result = await gnnRAG.retrieve('bug', { topK: 2 });

        assert(typeof result.context === 'string', 'Context should be a string');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║               GNN-RAG Integration Tests                       ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    try {
        await testGNNRAGService();
        await testHybridRetriever();
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
