/**
 * E2E Tests for Pattern Matcher Integration
 *
 * Tests PatternEnhancedExtractor and UnifiedExtractor functionality.
 */

'use strict';

const {
    PatternEnhancedExtractor,
    createPatternEnhancedExtractor,
    patternEnhancedExtractor,
    UnifiedExtractor,
    createUnifiedExtractor,
    unifiedExtractor
} = require('../../src/services/extraction');

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
// PATTERN-ENHANCED EXTRACTOR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testPatternEnhancedExtractor() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing PatternEnhancedExtractor');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Basic instantiation
    test('PatternEnhancedExtractor instantiation', () => {
        const extractor = new PatternEnhancedExtractor();
        assertEqual(extractor.options.mode, 'hybrid', 'Default mode should be hybrid');
        assert(extractor.options.enableLearning === true, 'Learning should be enabled by default');
    });

    // Test 2: Custom options
    test('PatternEnhancedExtractor with custom options', () => {
        const extractor = createPatternEnhancedExtractor({
            mode: 'pattern_only',
            enableLearning: false,
            patternConfidenceThreshold: 0.9
        });

        assertEqual(extractor.options.mode, 'pattern_only', 'Mode should be pattern_only');
        assertEqual(extractor.options.enableLearning, false, 'Learning should be disabled');
        assertEqual(extractor.options.patternConfidenceThreshold, 0.9, 'Confidence threshold should be 0.9');
    });

    // Test 3: Pattern-only extraction
    await test('Pattern-only extraction', async () => {
        const extractor = createPatternEnhancedExtractor({ mode: 'pattern_only' });

        const result = await extractor.extract(
            'Bug#123 is assigned to John Smith. Task#456 depends on Bug#123.',
            { domain: 'devops' }
        );

        assert(result.entities.length > 0, 'Should extract entities');
        assertEqual(result.metadata.mode, 'pattern_only', 'Mode should be pattern_only');
    });

    // Test 4: Pattern hints preparation
    test('Pattern hints preparation', () => {
        const extractor = new PatternEnhancedExtractor();

        const entities = [
            { name: 'Bug#123', type: 'WorkItem', confidence: 0.9 },
            { name: 'John', type: 'Person', confidence: 0.5 }
        ];

        const relations = [
            { subject: 'Bug#123', predicate: 'ASSIGNED_TO', object: 'John', confidence: 0.8 }
        ];

        const hints = extractor._preparePatternHints(entities, relations);

        // Should have hints for high-confidence entities
        assert(hints.some(h => h.type === 'known_entities'), 'Should have entity hints');
        assert(hints.some(h => h.type === 'known_relations'), 'Should have relation hints');
    });

    // Test 5: Entity merging
    test('Entity merging from pattern and LLM', () => {
        const extractor = new PatternEnhancedExtractor();

        const patternEntities = [
            { name: 'Bug#123', type: 'WorkItem', confidence: 0.9 }
        ];

        const llmEntities = [
            { name: 'Bug#123', type: 'Bug', confidence: 0.7, attributes: { priority: 'high' } },
            { name: 'John Smith', type: 'Person', confidence: 0.7 }
        ];

        const merged = extractor._mergeEntities(patternEntities, llmEntities);

        assertEqual(merged.length, 2, 'Should have 2 merged entities');

        const bug = merged.find(e => e.name === 'Bug#123');
        assert(bug, 'Bug#123 should exist');
        assertEqual(bug.source, 'both', 'Bug#123 should be from both sources');
        assert(bug.confidence > 0.9, 'Confidence should be boosted');
    });

    // Test 6: Relation merging
    test('Relation merging from pattern and LLM', () => {
        const extractor = new PatternEnhancedExtractor();

        const patternRelations = [
            { subject: 'Bug#123', predicate: 'ASSIGNED_TO', object: 'John', confidence: 0.8 }
        ];

        const llmRelations = [
            { subject: 'Bug#123', predicate: 'ASSIGNED_TO', object: 'John', confidence: 0.7 },
            { subject: 'Task#456', predicate: 'DEPENDS_ON', object: 'Bug#123', confidence: 0.7 }
        ];

        const entities = [
            { name: 'Bug#123', type: 'WorkItem' },
            { name: 'John', type: 'Person' },
            { name: 'Task#456', type: 'WorkItem' }
        ];

        const merged = extractor._mergeRelations(patternRelations, llmRelations, entities);

        assertEqual(merged.length, 2, 'Should have 2 merged relations');

        const assigned = merged.find(r => r.predicate === 'ASSIGNED_TO');
        assert(assigned, 'ASSIGNED_TO should exist');
        assertEqual(assigned.source, 'both', 'ASSIGNED_TO should be from both sources');
    });

    // Test 7: Statistics tracking
    test('Statistics tracking', () => {
        const extractor = new PatternEnhancedExtractor();
        extractor.resetStats();

        // Manually update stats for testing
        extractor.stats.totalExtractions = 10;
        extractor.stats.entitiesFromPatterns = 50;
        extractor.stats.entitiesFromLLM = 30;

        const stats = extractor.getStats();

        assertEqual(stats.totalExtractions, 10, 'Total extractions should be 10');
        assert(stats.patternLibrary, 'Should include pattern library stats');
    });

    // Test 8: Singleton instance
    test('Singleton instance available', () => {
        assert(patternEnhancedExtractor instanceof PatternEnhancedExtractor,
            'Should have singleton instance');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED EXTRACTOR TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function testUnifiedExtractor() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing UnifiedExtractor');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Basic instantiation
    test('UnifiedExtractor instantiation', () => {
        const extractor = new UnifiedExtractor();
        assertEqual(extractor.options.defaultMethod, 'hybrid', 'Default method should be hybrid');
        assert(extractor.options.enableVerification === true, 'Verification should be enabled by default');
    });

    // Test 2: Custom options
    test('UnifiedExtractor with custom options', () => {
        const extractor = createUnifiedExtractor({
            defaultMethod: 'pattern',
            enableVerification: false,
            verificationThreshold: 0.8
        });

        assertEqual(extractor.options.defaultMethod, 'pattern', 'Method should be pattern');
        assertEqual(extractor.options.enableVerification, false, 'Verification should be disabled');
        assertEqual(extractor.options.verificationThreshold, 0.8, 'Threshold should be 0.8');
    });

    // Test 3: Pattern extraction via unified
    await test('Pattern extraction via UnifiedExtractor', async () => {
        const extractor = createUnifiedExtractor({ enableVerification: false });

        const result = await extractor.extract(
            'Bug#123 is assigned to John Smith.',
            { method: 'pattern' }
        );

        assert(result.entities.length > 0, 'Should extract entities');
        assertEqual(result.metadata.method, 'pattern', 'Method should be pattern');
    });

    // Test 4: Hybrid extraction via unified
    await test('Hybrid extraction via UnifiedExtractor', async () => {
        const extractor = createUnifiedExtractor({ enableVerification: false });

        const result = await extractor.extract(
            'Bug#123 is assigned to John Smith.',
            { method: 'hybrid' }
        );

        assertEqual(result.metadata.method, 'hybrid', 'Method should be hybrid');
        assert(result.metadata.timestamp, 'Should have timestamp');
        assert(typeof result.metadata.duration === 'number', 'Should have duration');
    });

    // Test 5: Get available methods
    test('Get available methods', () => {
        const extractor = new UnifiedExtractor();
        const methods = extractor.getAvailableMethods();

        assert(methods.includes('pattern'), 'Should include pattern');
        assert(methods.includes('hybrid'), 'Should include hybrid');
    });

    // Test 6: Batch extraction
    await test('Batch extraction', async () => {
        const extractor = createUnifiedExtractor({ enableVerification: false });

        const texts = [
            'Bug#1 is critical.',
            'Task#2 is pending.',
            'Feature#3 is completed.'
        ];

        let progressCalled = false;
        const results = await extractor.extractBatch(texts, {
            method: 'pattern',
            batchSize: 2,
            onProgress: (current, total) => {
                progressCalled = true;
            }
        });

        assertEqual(results.length, 3, 'Should return 3 results');
        assert(progressCalled, 'Progress callback should be called');
    });

    // Test 7: Statistics tracking
    test('Statistics tracking', () => {
        const extractor = new UnifiedExtractor();
        extractor.resetStats();

        extractor.stats.totalExtractions = 20;
        extractor.stats.verified = 15;
        extractor.stats.verificationPassed = 12;
        extractor.stats.byMethod = { pattern: 8, hybrid: 12 };

        const stats = extractor.getStats();

        assertEqual(stats.totalExtractions, 20, 'Total should be 20');
        assertEqual(stats.verificationPassRate, '80.0%', 'Pass rate should be 80%');
        assertEqual(stats.byMethod.hybrid, 12, 'Hybrid count should be 12');
    });

    // Test 8: Error handling
    await test('Error handling', async () => {
        const extractor = createUnifiedExtractor({ enableVerification: false });

        // Should not throw on empty text
        const result = await extractor.extract('', { method: 'pattern' });
        assert(Array.isArray(result.entities), 'Should return empty entities array');
    });

    // Test 9: Singleton instance
    test('Singleton instance available', () => {
        assert(unifiedExtractor instanceof UnifiedExtractor,
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

    // Test 1: Full extraction workflow
    await test('Full extraction workflow', async () => {
        const extractor = createUnifiedExtractor({ enableVerification: false });

        const text = `Bug#789 is a critical issue in the PaymentSystem.
        It was created by John Smith and assigned to the DevOps Team.
        This bug depends on Task#456 which needs to be completed first.`;

        const result = await extractor.extract(text, {
            method: 'pattern',
            domain: 'devops'
        });

        assert(result.entities.length > 0, 'Should extract entities');
        assert(result.metadata, 'Should have metadata');
    });

    // Test 2: Module exports
    test('Module exports correctly', () => {
        const extraction = require('../../src/services/extraction');

        assert(extraction.PatternEnhancedExtractor, 'Should export PatternEnhancedExtractor');
        assert(extraction.createPatternEnhancedExtractor, 'Should export factory');
        assert(extraction.patternEnhancedExtractor, 'Should export singleton');
        assert(extraction.UnifiedExtractor, 'Should export UnifiedExtractor');
        assert(extraction.createUnifiedExtractor, 'Should export factory');
        assert(extraction.unifiedExtractor, 'Should export singleton');
    });

    // Test 3: Pattern library integration
    test('Pattern library integration', () => {
        const extractor = new PatternEnhancedExtractor();
        const stats = extractor.getStats();

        assert(stats.patternLibrary, 'Should have pattern library stats');
        assert(stats.patternLibrary.total > 0, 'Pattern library should have patterns');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║         Pattern Matcher Integration Tests                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    try {
        await testPatternEnhancedExtractor();
        await testUnifiedExtractor();
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
