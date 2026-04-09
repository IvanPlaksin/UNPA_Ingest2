/**
 * E2E Tests for Extraction Pattern Library
 *
 * Tests EntityPattern, RelationPattern, SubgraphPattern and PatternLibrary
 * for knowledge extraction.
 */

'use strict';

const {
    EntityPattern,
    RelationPattern,
    SubgraphPattern,
    PatternLibrary,
    createPatternLibrary,
    patternLibrary
} = require('../../src/services/patterns');

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
// ENTITY PATTERN TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function testEntityPattern() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing EntityPattern');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Basic instantiation
    test('EntityPattern instantiation', () => {
        const pattern = new EntityPattern({
            name: 'test_pattern',
            entityType: 'Person',
            namePatterns: ['[A-Z][a-z]+\\s+[A-Z][a-z]+'],
            contextKeywords: ['manager', 'director']
        });

        assert(pattern.id.startsWith('ep_'), 'ID should start with ep_');
        assertEqual(pattern.name, 'test_pattern', 'Name should match');
        assertEqual(pattern.entityType, 'Person', 'Entity type should match');
        assertEqual(pattern.confidence, 0.8, 'Default confidence should be 0.8');
    });

    // Test 2: Pattern matching
    test('EntityPattern matches text with name pattern', () => {
        const pattern = new EntityPattern({
            name: 'person_name',
            entityType: 'Person',
            namePatterns: ['[A-Z][a-z]+\\s+[A-Z][a-z]+'],
            contextKeywords: ['engineer', 'manager']
        });

        const result = pattern.matches('John Smith is a software engineer', {});
        assert(result.matches, 'Should match text with name pattern');
        assert(result.score >= 0.4, 'Score should be at least 0.4');
    });

    // Test 3: Pattern extraction
    test('EntityPattern extracts entities', () => {
        const pattern = new EntityPattern({
            name: 'work_item',
            entityType: 'WorkItem',
            namePatterns: ['Bug#\\d+', 'Task#\\d+']
        });

        const entities = pattern.extract('Bug#123 is assigned to John. Task#456 is pending.');
        assertEqual(entities.length, 2, 'Should extract 2 entities');
        assert(entities[0].name === 'Bug#123' || entities[0].name === 'Task#456', 'Should extract correct names');
    });

    // Test 4: JSON serialization
    test('EntityPattern toJSON/fromJSON', () => {
        const original = new EntityPattern({
            name: 'test',
            entityType: 'Test',
            namePatterns: ['test\\d+']
        });

        const json = original.toJSON();
        const restored = EntityPattern.fromJSON(json);

        assertEqual(restored.name, original.name, 'Name should match');
        assertEqual(restored.entityType, original.entityType, 'Entity type should match');
    });

    // Test 5: Feedback recording
    test('EntityPattern feedback recording', () => {
        const pattern = new EntityPattern({ name: 'test', entityType: 'Test' });

        pattern.recordFeedback(true);
        pattern.recordFeedback(true);
        pattern.recordFeedback(false);

        assertEqual(pattern.stats.successfulExtractions, 2, 'Should have 2 successes');
        assertEqual(pattern.stats.falsePositives, 1, 'Should have 1 false positive');
        assert(Math.abs(pattern.getSuccessRate() - 0.666) < 0.01, 'Success rate should be ~66%');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RELATION PATTERN TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function testRelationPattern() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing RelationPattern');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Basic instantiation
    test('RelationPattern instantiation', () => {
        const pattern = new RelationPattern({
            name: 'assigned_to',
            relationType: 'ASSIGNED_TO',
            subjectTypes: ['WorkItem'],
            objectTypes: ['Person'],
            verbPatterns: ['assigned\\s+to']
        });

        assert(pattern.id.startsWith('rp_'), 'ID should start with rp_');
        assertEqual(pattern.name, 'assigned_to', 'Name should match');
        assertEqual(pattern.relationType, 'ASSIGNED_TO', 'Relation type should match');
    });

    // Test 2: Pattern matching with entities
    test('RelationPattern matches text and entities', () => {
        const pattern = new RelationPattern({
            name: 'assigned_to',
            relationType: 'ASSIGNED_TO',
            subjectTypes: ['WorkItem'],
            objectTypes: ['Person'],
            verbPatterns: ['assigned\\s+to']
        });

        const entities = [
            { name: 'Bug#123', type: 'WorkItem' },
            { name: 'John Smith', type: 'Person' }
        ];

        const result = pattern.matches('Bug#123 is assigned to John Smith', entities, {});
        assert(result.matches, 'Should match text with verb pattern');
        assert(result.candidates.subjects.length > 0, 'Should have subject candidates');
        assert(result.candidates.objects.length > 0, 'Should have object candidates');
    });

    // Test 3: Relation extraction
    test('RelationPattern extracts relations', () => {
        const pattern = new RelationPattern({
            name: 'assigned_to',
            relationType: 'ASSIGNED_TO',
            subjectTypes: ['WorkItem'],
            objectTypes: ['Person'],
            verbPatterns: ['assigned\\s+to'],
            maxDistance: 50
        });

        const entities = [
            { name: 'Bug#123', type: 'WorkItem' },
            { name: 'John', type: 'Person' }
        ];

        const relations = pattern.extract('Bug#123 is assigned to John', entities, {});
        assertEqual(relations.length, 1, 'Should extract 1 relation');
        assertEqual(relations[0].subject, 'Bug#123', 'Subject should be Bug#123');
        assertEqual(relations[0].object, 'John', 'Object should be John');
        assertEqual(relations[0].predicate, 'ASSIGNED_TO', 'Predicate should be ASSIGNED_TO');
    });

    // Test 4: JSON serialization
    test('RelationPattern toJSON/fromJSON', () => {
        const original = new RelationPattern({
            name: 'test',
            relationType: 'TEST_REL',
            verbPatterns: ['test']
        });

        const json = original.toJSON();
        const restored = RelationPattern.fromJSON(json);

        assertEqual(restored.name, original.name, 'Name should match');
        assertEqual(restored.relationType, original.relationType, 'Relation type should match');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBGRAPH PATTERN TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function testSubgraphPattern() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing SubgraphPattern');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Basic instantiation
    test('SubgraphPattern instantiation', () => {
        const pattern = new SubgraphPattern({
            name: 'chain_pattern',
            structure: 'chain',
            minNodes: 3,
            maxNodes: 5
        });

        assert(pattern.id.startsWith('sp_'), 'ID should start with sp_');
        assertEqual(pattern.name, 'chain_pattern', 'Name should match');
        assertEqual(pattern.structure, 'chain', 'Structure should be chain');
    });

    // Test 2: Chain structure matching
    test('SubgraphPattern matches chain structure', () => {
        const pattern = new SubgraphPattern({
            name: 'chain',
            structure: 'chain',
            minNodes: 2,
            maxNodes: 10
        });

        const entities = [
            { name: 'A', type: 'Node' },
            { name: 'B', type: 'Node' },
            { name: 'C', type: 'Node' }
        ];

        const relations = [
            { subject: 'A', object: 'B', predicate: 'CONNECTS' },
            { subject: 'B', object: 'C', predicate: 'CONNECTS' }
        ];

        const result = pattern.matches(entities, relations, {});
        assert(result.matches, 'Should match chain structure');
    });

    // Test 3: Star structure matching
    test('SubgraphPattern matches star structure', () => {
        const pattern = new SubgraphPattern({
            name: 'star',
            structure: 'star',
            minNodes: 4,
            maxNodes: 10
        });

        const entities = [
            { name: 'Hub', type: 'Central' },
            { name: 'A', type: 'Node' },
            { name: 'B', type: 'Node' },
            { name: 'C', type: 'Node' },
            { name: 'D', type: 'Node' }
        ];

        const relations = [
            { subject: 'Hub', object: 'A', predicate: 'CONNECTS' },
            { subject: 'Hub', object: 'B', predicate: 'CONNECTS' },
            { subject: 'Hub', object: 'C', predicate: 'CONNECTS' },
            { subject: 'Hub', object: 'D', predicate: 'CONNECTS' }
        ];

        const result = pattern.matches(entities, relations, {});
        assert(result.matches, 'Should match star structure');
        assertEqual(result.details.hub, 'Hub', 'Hub should be identified');
    });

    // Test 4: Tree structure matching
    test('SubgraphPattern matches tree structure', () => {
        const pattern = new SubgraphPattern({
            name: 'tree',
            structure: 'tree',
            minNodes: 3,
            maxNodes: 10
        });

        const entities = [
            { name: 'Root', type: 'Node' },
            { name: 'Child1', type: 'Node' },
            { name: 'Child2', type: 'Node' }
        ];

        // Tree: 3 nodes, 2 edges (n-1)
        const relations = [
            { subject: 'Root', object: 'Child1', predicate: 'HAS' },
            { subject: 'Root', object: 'Child2', predicate: 'HAS' }
        ];

        const result = pattern.matches(entities, relations, {});
        assert(result.matches, 'Should match tree structure');
    });

    // Test 5: Size constraint validation
    test('SubgraphPattern rejects size mismatch', () => {
        const pattern = new SubgraphPattern({
            name: 'test',
            minNodes: 5,
            maxNodes: 10
        });

        const entities = [{ name: 'A', type: 'Node' }, { name: 'B', type: 'Node' }];
        const result = pattern.matches(entities, [], {});

        assert(!result.matches, 'Should not match when below minNodes');
        assertEqual(result.reason, 'size_mismatch', 'Reason should be size_mismatch');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATTERN LIBRARY TESTS
// ═══════════════════════════════════════════════════════════════════════════════

function testPatternLibrary() {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Testing PatternLibrary');
    console.log('═══════════════════════════════════════════════════════════════');

    // Test 1: Library instantiation
    test('PatternLibrary instantiation with default patterns', () => {
        const lib = createPatternLibrary();
        const stats = lib.getStats();

        assert(stats.entityPatterns > 0, 'Should have default entity patterns');
        assert(stats.relationPatterns > 0, 'Should have default relation patterns');
        assert(stats.subgraphPatterns > 0, 'Should have default subgraph patterns');
    });

    // Test 2: Pattern registration
    test('PatternLibrary pattern registration', () => {
        const lib = createPatternLibrary();
        const initialCount = lib.getStats().entityPatterns;

        lib.registerEntityPattern({
            name: 'custom_pattern',
            entityType: 'Custom',
            namePatterns: ['custom\\d+']
        });

        assertEqual(lib.getStats().entityPatterns, initialCount + 1, 'Should have one more pattern');
    });

    // Test 3: Entity extraction
    test('PatternLibrary extracts entities', () => {
        const lib = createPatternLibrary();

        const result = lib.extractEntities(
            'Bug#123 is assigned to John Smith. The system manager approved it.',
            { domain: 'devops' }
        );

        assert(result.entities.length > 0, 'Should extract entities');
        assert(result.patternsUsed.length > 0, 'Should track patterns used');
    });

    // Test 4: Full extraction
    test('PatternLibrary full extraction', () => {
        const lib = createPatternLibrary();

        const result = lib.extract(
            'Bug#123 is assigned to John Smith. Task#456 depends on Bug#123.',
            { domain: 'devops' }
        );

        assert(result.entities.length > 0, 'Should extract entities');
        assert(result.metadata.method === 'pattern_library', 'Method should be pattern_library');
    });

    // Test 5: Export/Import
    test('PatternLibrary export/import', () => {
        const lib1 = createPatternLibrary();

        lib1.registerEntityPattern({
            name: 'export_test',
            entityType: 'ExportTest',
            namePatterns: ['export\\d+']
        });

        const exported = lib1.export();

        const lib2 = createPatternLibrary();
        lib2.clear();
        const imported = lib2.import(exported);

        assert(imported.entities > 0, 'Should import entity patterns');
        assert(imported.relations > 0, 'Should import relation patterns');
    });

    // Test 6: Learning from extraction
    test('PatternLibrary learning', () => {
        const lib = createPatternLibrary({
            enableLearning: true,
            learningThreshold: 2
        });

        const initialStats = lib.getStats();

        // Simulate multiple extractions to trigger learning
        for (let i = 0; i < 3; i++) {
            lib.learnFromExtraction(
                `CustomEntity${i} is related to Test`,
                {
                    entities: [{ name: `CustomEntity${i}`, type: 'NewType' }],
                    relations: []
                }
            );
        }

        // Check learning buffer or new patterns
        const newStats = lib.getStats();
        assert(
            newStats.learningBuffer.entities > 0 || newStats.entityPatterns > initialStats.entityPatterns,
            'Should have learned patterns or buffered data'
        );
    });

    // Test 7: Get pattern by ID
    test('PatternLibrary getPattern', () => {
        const lib = createPatternLibrary();

        const pattern = lib.registerEntityPattern({
            name: 'get_test',
            entityType: 'Test'
        });

        const retrieved = lib.getPattern(pattern.id);
        assertEqual(retrieved.name, 'get_test', 'Should retrieve pattern by ID');
    });

    // Test 8: Clear library
    test('PatternLibrary clear', () => {
        const lib = createPatternLibrary();
        lib.clear();

        const stats = lib.getStats();
        assertEqual(stats.total, 0, 'Should have no patterns after clear');
    });

    // Test 9: Domain filtering
    test('PatternLibrary domain filtering', () => {
        const lib = createPatternLibrary();
        lib.clear();

        lib.registerEntityPattern({
            name: 'general_pattern',
            entityType: 'General',
            domain: 'general',
            namePatterns: ['general\\d+']
        });

        lib.registerEntityPattern({
            name: 'devops_pattern',
            entityType: 'DevOps',
            domain: 'devops',
            namePatterns: ['devops\\d+']
        });

        // Match with devops domain should include both devops and general
        const devopsMatches = lib.matchEntityPatterns('devops123 general456', { domain: 'devops' });
        assert(devopsMatches.length === 2, 'Should match both patterns in devops domain');

        // Match with general domain should only include general
        const generalMatches = lib.matchEntityPatterns('devops123 general456', { domain: 'general' });
        assert(generalMatches.length === 1, 'Should only match general pattern');
    });

    // Test 10: Singleton instance
    test('PatternLibrary singleton instance', () => {
        assert(patternLibrary instanceof PatternLibrary, 'Should have singleton instance');
        assert(patternLibrary.getStats().total > 0, 'Singleton should have default patterns');
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RUN ALL TESTS
// ═══════════════════════════════════════════════════════════════════════════════

async function runAllTests() {
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║          Extraction Pattern Library Tests                     ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');

    try {
        testEntityPattern();
        testRelationPattern();
        testSubgraphPattern();
        testPatternLibrary();

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
