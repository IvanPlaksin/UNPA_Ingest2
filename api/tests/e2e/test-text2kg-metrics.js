/**
 * Test for Text2KGBench Metrics
 *
 * Tests the complete metrics suite:
 * - Hallucination Rate
 * - Ontology Conformance
 * - Faithfulness Score
 * - Entity Precision/Recall/F1
 * - Relation Precision/Recall/F1
 * - Graph Edit Distance
 */

'use strict';

const {
    Text2KGMetrics,
    createText2KGMetrics,
    AOPEG_ONTOLOGY,
    validateTriple,
    validateEntity,
    getValidRelations,
    getOntologyStats
} = require('../../src/services/graph/metrics');

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

const SOURCE_TEXT = `
The United Nations Department of Peace Operations (DPO) manages 12 peacekeeping missions worldwide.
John Smith is the Chief of Staff assigned to MINUSMA in Mali.
The Security Council Resolution S/RES/2100 established MINUSMA in April 2013.
MINUSMA depends on logistics support from UNLB in Brindisi, Italy.
The mission budget for 2024 is $1.2 billion, approved by the Fifth Committee.
`;

const EXTRACTION_RESULT = {
    entities: [
        { name: 'United Nations', type: 'Organization' },
        { name: 'DPO', type: 'Organization' },
        { name: 'John Smith', type: 'Person' },
        { name: 'MINUSMA', type: 'Project' },
        { name: 'Mali', type: 'Organization' }, // Intentional error - should be Location
        { name: 'Security Council', type: 'Organization' },
        { name: 'S/RES/2100', type: 'Document' },
        { name: 'UNLB', type: 'Organization' },
        { name: 'Fifth Committee', type: 'Team' }
    ],
    relations: [
        { subject: { name: 'DPO', type: 'Organization' }, predicate: 'PART_OF', object: { name: 'United Nations', type: 'Organization' } },
        { subject: { name: 'John Smith', type: 'Person' }, predicate: 'ASSIGNED_TO', object: { name: 'MINUSMA', type: 'Project' } },
        { subject: { name: 'Security Council', type: 'Organization' }, predicate: 'PRODUCES', object: { name: 'S/RES/2100', type: 'Document' } },
        { subject: { name: 'MINUSMA', type: 'Project' }, predicate: 'DEPENDS_ON', object: { name: 'UNLB', type: 'Organization' } },
        // Hallucinated relation (not in source)
        { subject: { name: 'John Smith', type: 'Person' }, predicate: 'AUTHORED_BY', object: { name: 'S/RES/2100', type: 'Document' } }
    ]
};

const REFERENCE_GRAPH = {
    entities: [
        { name: 'United Nations', type: 'Organization' },
        { name: 'DPO', type: 'Organization' },
        { name: 'John Smith', type: 'Person' },
        { name: 'MINUSMA', type: 'Project' },
        { name: 'Mali' }, // No type in reference
        { name: 'Security Council', type: 'Organization' },
        { name: 'S/RES/2100', type: 'Document' },
        { name: 'UNLB', type: 'Organization' },
        { name: 'Fifth Committee', type: 'Team' },
        { name: 'Brindisi', type: 'Organization' } // In source but missed by extraction
    ],
    relations: [
        { subject: { name: 'DPO', type: 'Organization' }, predicate: 'PART_OF', object: { name: 'United Nations', type: 'Organization' } },
        { subject: { name: 'John Smith', type: 'Person' }, predicate: 'ASSIGNED_TO', object: { name: 'MINUSMA', type: 'Project' } },
        { subject: { name: 'Security Council', type: 'Organization' }, predicate: 'PRODUCES', object: { name: 'S/RES/2100', type: 'Document' } },
        { subject: { name: 'MINUSMA', type: 'Project' }, predicate: 'DEPENDS_ON', object: { name: 'UNLB', type: 'Organization' } },
        { subject: { name: 'UNLB', type: 'Organization' }, predicate: 'PART_OF', object: { name: 'Brindisi', type: 'Organization' } }
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Text2KGBench Metrics Test Suite                        ║');
    console.log('║  Testing: Hallucination, Conformance, Faithfulness, P/R/F1   ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // Create metrics instance
    const metrics = createText2KGMetrics({
        faithfulnessThreshold: 0.6, // Lower threshold for testing
        useSemanticMatching: true
    });

    let passed = 0;
    let failed = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // Test 1: Ontology Schema Functions
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 1: Ontology Schema Functions');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // Test ontology stats
        const stats = getOntologyStats();
        console.log('Ontology Statistics:');
        console.log(`  Entity Types: ${stats.entityTypeCount}`);
        console.log(`  Relation Types: ${stats.relationTypeCount}`);
        console.log(`  Constraints: ${stats.constraintCount}`);
        console.log(`  Avg Domain Size: ${stats.avgDomainSize.toFixed(1)}`);
        console.log(`  Avg Range Size: ${stats.avgRangeSize.toFixed(1)}`);

        // Test getValidRelations
        const validRels = getValidRelations('Person', 'Team');
        console.log(`\nValid relations Person → Team: ${validRels.join(', ')}`);

        // Test validateTriple
        const validTriple = {
            subject: { name: 'John', type: 'Person' },
            predicate: 'ASSIGNED_TO',
            object: { name: 'Task1', type: 'Task' }
        };
        const tripleResult = validateTriple(validTriple);
        console.log(`\nValidate "John ASSIGNED_TO Task1": ${tripleResult.valid ? 'VALID' : 'INVALID'}`);

        const invalidTriple = {
            subject: { name: 'John', type: 'Person' },
            predicate: 'INVALID_RELATION',
            object: { name: 'Doc1', type: 'Document' }
        };
        const invalidResult = validateTriple(invalidTriple);
        console.log(`Validate "John INVALID_RELATION Doc1": ${invalidResult.valid ? 'VALID' : 'INVALID'}`);
        console.log(`  Errors: ${invalidResult.errors.join(', ')}`);

        console.log('\n  ✅ Ontology schema functions working\n');
        passed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 2: Hallucination Rate
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 2: Hallucination Rate');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // Normalize triples from extraction result
        const triples = EXTRACTION_RESULT.relations.map(r => ({
            subject: r.subject,
            predicate: r.predicate,
            object: r.object
        }));

        const hallucinationResult = await metrics.computeHallucinationRate(triples, SOURCE_TEXT);

        console.log('Hallucination Rate Results:');
        console.log(`  Rate: ${(hallucinationResult.rate * 100).toFixed(1)}%`);
        console.log(`  Hallucinated: ${hallucinationResult.hallucinated}/${hallucinationResult.total}`);
        console.log(`  Grounded: ${hallucinationResult.grounded}/${hallucinationResult.total}`);
        console.log(`  Threshold: ${hallucinationResult.threshold}`);

        if (hallucinationResult.details.length > 0) {
            console.log('\n  Hallucinated Triples:');
            for (const detail of hallucinationResult.details.slice(0, 3)) {
                console.log(`    - "${detail.triple}" (similarity: ${detail.similarity})`);
            }
        }

        const hallucinationOk = hallucinationResult.rate < 0.5; // Less than 50% hallucinated
        console.log(`\n  ${hallucinationOk ? '✅' : '⚠️'} Hallucination rate ${hallucinationOk ? 'acceptable' : 'high'}\n`);
        if (hallucinationOk) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 3: Ontology Conformance
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 3: Ontology Conformance');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const triples = EXTRACTION_RESULT.relations;
        const conformanceResult = metrics.computeOntologyConformance(triples, AOPEG_ONTOLOGY);

        console.log('Ontology Conformance Results:');
        console.log(`  Conformance Rate: ${(conformanceResult.conformanceRate * 100).toFixed(1)}%`);
        console.log(`  Conforming: ${conformanceResult.conforming}/${conformanceResult.total}`);
        console.log(`  Non-conforming: ${conformanceResult.nonConforming}/${conformanceResult.total}`);

        if (conformanceResult.violations.length > 0) {
            console.log('\n  Violations:');
            for (const violation of conformanceResult.violations.slice(0, 3)) {
                console.log(`    - "${violation.triple}"`);
                console.log(`      Errors: ${violation.errors.join(', ') || 'none'}`);
                console.log(`      Warnings: ${violation.warnings.join(', ') || 'none'}`);
            }
        }

        const conformanceOk = conformanceResult.conformanceRate >= 0.7;
        console.log(`\n  ${conformanceOk ? '✅' : '⚠️'} Conformance ${conformanceOk ? 'acceptable' : 'low'}\n`);
        if (conformanceOk) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 4: Faithfulness Score
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 4: Faithfulness Score');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const triples = EXTRACTION_RESULT.relations;
        const faithfulnessResult = await metrics.computeFaithfulness(triples, SOURCE_TEXT);

        console.log('Faithfulness Results:');
        console.log(`  Score: ${faithfulnessResult.score}`);
        console.log(`  Min: ${faithfulnessResult.min}`);
        console.log(`  Max: ${faithfulnessResult.max}`);
        console.log(`  Threshold: ${faithfulnessResult.threshold}`);
        console.log('\n  Distribution:');
        for (const [bucket, count] of Object.entries(faithfulnessResult.distribution)) {
            console.log(`    ${bucket}: ${count}`);
        }

        const faithfulnessOk = faithfulnessResult.score >= 0.5;
        console.log(`\n  ${faithfulnessOk ? '✅' : '⚠️'} Faithfulness ${faithfulnessOk ? 'acceptable' : 'low'}\n`);
        if (faithfulnessOk) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 5: Entity Metrics (P/R/F1)
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 5: Entity Metrics (P/R/F1)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const entityResult = metrics.computeEntityMetrics(
            EXTRACTION_RESULT.entities,
            REFERENCE_GRAPH.entities
        );

        console.log('Entity Metrics:');
        console.log(`  Precision: ${entityResult.precision}`);
        console.log(`  Recall: ${entityResult.recall}`);
        console.log(`  F1: ${entityResult.f1}`);
        console.log(`  True Positives: ${entityResult.truePositives}`);
        console.log(`  False Positives: ${entityResult.falsePositives}`);
        console.log(`  False Negatives: ${entityResult.falseNegatives}`);
        console.log(`  Extracted: ${entityResult.extractedCount}`);
        console.log(`  Reference: ${entityResult.referenceCount}`);

        if (entityResult.missed.length > 0) {
            console.log(`\n  Missed: ${entityResult.missed.join(', ')}`);
        }
        if (entityResult.extra.length > 0) {
            console.log(`  Extra: ${entityResult.extra.join(', ')}`);
        }

        const entityOk = entityResult.f1 >= 0.6;
        console.log(`\n  ${entityOk ? '✅' : '⚠️'} Entity F1 ${entityOk ? 'acceptable' : 'low'}\n`);
        if (entityOk) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 6: Relation Metrics (P/R/F1)
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 6: Relation Metrics (P/R/F1)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const relationResult = metrics.computeRelationMetrics(
            EXTRACTION_RESULT.relations,
            REFERENCE_GRAPH.relations
        );

        console.log('Relation Metrics:');
        console.log(`  Precision: ${relationResult.precision}`);
        console.log(`  Recall: ${relationResult.recall}`);
        console.log(`  F1: ${relationResult.f1}`);
        console.log(`  True Positives: ${relationResult.truePositives}`);
        console.log(`  False Positives: ${relationResult.falsePositives}`);
        console.log(`  False Negatives: ${relationResult.falseNegatives}`);
        console.log(`  Extracted: ${relationResult.extractedCount}`);
        console.log(`  Reference: ${relationResult.referenceCount}`);

        const relationOk = relationResult.f1 >= 0.5;
        console.log(`\n  ${relationOk ? '✅' : '⚠️'} Relation F1 ${relationOk ? 'acceptable' : 'low'}\n`);
        if (relationOk) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 7: Graph Edit Distance
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 7: Graph Edit Distance (GED)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const gedResult = metrics.computeGED(EXTRACTION_RESULT, REFERENCE_GRAPH);

        console.log('GED Results:');
        console.log(`  Total Distance: ${gedResult.distance}`);
        console.log(`  Normalized Distance: ${gedResult.normalizedDistance}`);
        console.log(`  Similarity: ${gedResult.similarity}`);
        console.log('\n  Operations:');
        console.log(`    Node Additions: ${gedResult.operations.nodeAdditions}`);
        console.log(`    Node Deletions: ${gedResult.operations.nodeDeletions}`);
        console.log(`    Edge Additions: ${gedResult.operations.edgeAdditions}`);
        console.log(`    Edge Deletions: ${gedResult.operations.edgeDeletions}`);
        console.log('\n  Sizes:');
        console.log(`    Extracted Nodes: ${gedResult.sizes.extractedNodes}`);
        console.log(`    Reference Nodes: ${gedResult.sizes.referenceNodes}`);
        console.log(`    Extracted Edges: ${gedResult.sizes.extractedEdges}`);
        console.log(`    Reference Edges: ${gedResult.sizes.referenceEdges}`);

        const gedOk = gedResult.similarity >= 0.5;
        console.log(`\n  ${gedOk ? '✅' : '⚠️'} GED similarity ${gedOk ? 'acceptable' : 'low'}\n`);
        if (gedOk) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Test 8: Full Metrics Report
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 8: Full Metrics Report (computeAll)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const fullReport = await metrics.computeAll(
            EXTRACTION_RESULT,
            SOURCE_TEXT,
            AOPEG_ONTOLOGY,
            REFERENCE_GRAPH
        );

        console.log('Full Metrics Report:');
        console.log(`  Timestamp: ${fullReport.timestamp}`);
        console.log(`  Duration: ${fullReport.duration}ms`);
        console.log(`\nSummary:`);
        console.log(`  Overall Score: ${fullReport.summary.overallScore}`);
        console.log(`  Grade: ${fullReport.summary.grade}`);
        console.log(`\nComponents:`);
        for (const comp of fullReport.summary.components) {
            console.log(`    ${comp.name}: ${comp.score} (weight: ${comp.weight})`);
        }
        console.log(`\nStats:`);
        console.log(`  Entities Extracted: ${fullReport.stats.entitiesExtracted}`);
        console.log(`  Relations Extracted: ${fullReport.stats.relationsExtracted}`);
        console.log(`  Triples Evaluated: ${fullReport.stats.triplesEvaluated}`);

        const fullOk = fullReport.summary.overallScore >= 0.5;
        console.log(`\n  ${fullOk ? '✅' : '⚠️'} Overall ${fullOk ? 'acceptable' : 'needs improvement'}\n`);
        if (fullOk) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Metrics Service Stats
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Metrics Service Statistics');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const serviceStats = metrics.getStats();
    console.log(`Total Evaluations: ${serviceStats.totalEvaluations}`);
    console.log(`Cache Hits: ${serviceStats.cacheHits}`);
    console.log(`Cache Misses: ${serviceStats.cacheMisses}`);
    console.log(`Cache Size: ${serviceStats.cacheSize}`);
    console.log(`Cache Hit Rate: ${serviceStats.cacheHitRate}`);

    // ─────────────────────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────────────────────

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log(`║  Results: ${passed} passed, ${failed} failed                                  ║`);
    console.log(`║  Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%                                          ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    return { passed, failed, total: passed + failed };
}

// Run tests
runTests()
    .then(({ passed, failed, total }) => {
        console.log(`\nText2KGBench metrics test completed: ${passed}/${total} passed`);
        process.exit(failed > 0 ? 1 : 0);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
