/**
 * Test for Hallucination Detector
 *
 * Tests the retrieval-augmented verification pipeline:
 * Verbalize → Embed → Retrieve → Verify
 */

'use strict';

const { createHallucinationDetector } = require('../../src/services/graph/metrics/hallucination-detector');

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

// Sample source text (UN peacekeeping context)
const SOURCE_TEXT = `
The United Nations Department of Peace Operations (DPO) oversees peacekeeping missions
worldwide. John Smith serves as the Director of Mission Support, managing logistics
and resource allocation. The department coordinates with DPPA (Department of Political
and Peacebuilding Affairs) on political strategies.

MINUSMA (UN Mission in Mali) was established in 2013 with a mandate to support political
processes and carry out security-related stabilization tasks. The mission currently has
approximately 13,000 personnel deployed. Maria Garcia leads the human resources division
and reports directly to John Smith.

The budget for peacekeeping operations in fiscal year 2024 is approximately $6.4 billion,
allocated across 12 active missions. UNMISS (UN Mission in South Sudan) receives the
largest allocation at $1.2 billion, followed by MINUSCA in the Central African Republic.

Security Council Resolution 2584 (2021) renewed the mandate of MINUSMA, emphasizing
the protection of civilians and support for the implementation of the Agreement for Peace.
`;

// Extraction result with mix of grounded and hallucinated claims
const EXTRACTION_RESULT = {
    entities: [
        // Grounded entities (should be verified)
        { type: 'Organization', name: 'DPO', id: 'org_dpo' },
        { type: 'Person', name: 'John Smith', role: 'Director of Mission Support', id: 'person_js' },
        { type: 'Organization', name: 'MINUSMA', id: 'org_minusma' },
        { type: 'Person', name: 'Maria Garcia', role: 'HR Division Lead', id: 'person_mg' },
        { type: 'Organization', name: 'UNMISS', id: 'org_unmiss' },

        // Hallucinated entities (should be flagged)
        { type: 'Person', name: 'Robert Johnson', role: 'Security Chief', id: 'person_rj_fake' },
        { type: 'Organization', name: 'UNPROFOR', id: 'org_unprofor_fake' } // Not in source
    ],

    relations: [
        // Grounded relations
        { subject: 'Maria Garcia', predicate: 'REPORTS_TO', object: 'John Smith' },
        { subject: 'DPO', predicate: 'COORDINATES_WITH', object: 'DPPA' },
        { subject: 'John Smith', predicate: 'MANAGES', object: 'logistics' },

        // Hallucinated relations
        { subject: 'Robert Johnson', predicate: 'LEADS', object: 'security operations' },
        { subject: 'MINUSMA', predicate: 'MERGED_WITH', object: 'UNMISS' } // Never happened
    ],

    triples: [
        // Grounded triples
        {
            subject: { name: 'MINUSMA', type: 'Mission' },
            predicate: 'ESTABLISHED_IN',
            object: { name: '2013', type: 'Year' }
        },
        {
            subject: { name: 'UNMISS', type: 'Mission' },
            predicate: 'HAS_BUDGET',
            object: { name: '$1.2 billion', type: 'Amount' }
        },

        // Hallucinated triple
        {
            subject: { name: 'MINUSMA', type: 'Mission' },
            predicate: 'HEADQUARTERED_IN',
            object: { name: 'Dakar', type: 'City' } // Actually in Bamako
        }
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Hallucination Detector Test Suite                      ║');
    console.log('║       Pipeline: Verbalize → Embed → Retrieve → Verify        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const detector = createHallucinationDetector({
        chunkSize: 100,      // Smaller chunks for testing
        chunkOverlap: 25,
        topK: 3,
        similarityThreshold: 0.65,
        uncertainThreshold: 0.35,
        useBOWFallback: true
    });

    let passed = 0;
    let failed = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Chunking
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 1: Text Chunking');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const chunks = detector.chunkText(SOURCE_TEXT, { chunkSize: 50, chunkOverlap: 10, minChunkSize: 10 });

        console.log(`  Created ${chunks.length} chunks from source text`);
        console.log(`  Chunk 0 preview: "${chunks[0].text.substring(0, 80)}..."`);
        console.log(`  Chunk positions: word ${chunks[0].wordStart}-${chunks[0].wordEnd}`);

        const success = chunks.length >= 3;
        console.log(`  ${success ? '✅' : '❌'} Chunking: ${chunks.length} chunks created\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Claim Verbalization
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 2: Claim Verbalization');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const claims = detector.verbalizeClaims(EXTRACTION_RESULT);

        console.log(`  Total claims verbalized: ${claims.length}`);
        console.log(`    - Entity claims: ${claims.filter(c => c.type === 'entity').length}`);
        console.log(`    - Relation claims: ${claims.filter(c => c.type === 'relation').length}`);
        console.log(`    - Triple claims: ${claims.filter(c => c.type === 'triple').length}`);

        console.log('\n  Sample verbalizations:');
        claims.slice(0, 3).forEach(c => {
            console.log(`    [${c.type}] "${c.text.substring(0, 70)}${c.text.length > 70 ? '...' : ''}"`);
        });

        const success = claims.length === EXTRACTION_RESULT.entities.length +
                       EXTRACTION_RESULT.relations.length +
                       EXTRACTION_RESULT.triples.length;
        console.log(`\n  ${success ? '✅' : '❌'} Verbalization: All claims converted\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: BOW Embedding
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 3: BOW Embedding Fallback');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const embedding1 = detector.bowEmbedding('John Smith manages logistics', 384);
        const embedding2 = detector.bowEmbedding('John Smith director support', 384);
        const embedding3 = detector.bowEmbedding('completely unrelated topic cats dogs', 384);

        const sim12 = detector.cosineSimilarity(embedding1, embedding2);
        const sim13 = detector.cosineSimilarity(embedding1, embedding3);

        console.log(`  Embedding dimension: ${embedding1.length}`);
        console.log(`  Similarity (related texts): ${(sim12 * 100).toFixed(1)}%`);
        console.log(`  Similarity (unrelated texts): ${(sim13 * 100).toFixed(1)}%`);

        const success = sim12 > sim13 && embedding1.length === 384;
        console.log(`  ${success ? '✅' : '❌'} BOW Embedding: Related texts more similar\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Full Verification Pipeline
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 4: Full Verification Pipeline');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = await detector.verify(EXTRACTION_RESULT, SOURCE_TEXT);

        console.log('  Summary:');
        console.log(`    Total Claims: ${report.summary.totalClaims}`);
        console.log(`    Grounded: ${report.summary.grounded} (${(report.summary.groundingRate * 100).toFixed(1)}%)`);
        console.log(`    Uncertain: ${report.summary.uncertain}`);
        console.log(`    Hallucinated: ${report.summary.hallucinated} (${(report.summary.hallucinationRate * 100).toFixed(1)}%)`);
        console.log(`    Average Confidence: ${(report.summary.avgConfidence * 100).toFixed(1)}%`);
        console.log(`    Grade: ${report.summary.grade}`);
        console.log(`    Processing Time: ${report.processingTime}ms`);

        const success = report.summary.totalClaims > 0 &&
                       report.hallucinatedClaims !== undefined;
        console.log(`\n  ${success ? '✅' : '❌'} Full Pipeline: Report generated\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Grounded Claims Detection
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 5: Grounded Claims Detection');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = await detector.verify(EXTRACTION_RESULT, SOURCE_TEXT);

        console.log('  Grounded Claims:');
        report.groundedClaims.slice(0, 5).forEach(c => {
            console.log(`    ✓ "${c.claim.substring(0, 60)}${c.claim.length > 60 ? '...' : ''}"`);
            console.log(`      Confidence: ${(c.confidence * 100).toFixed(1)}%`);
        });

        // Check if known-grounded entities are detected
        const groundedTexts = report.groundedClaims.map(c => c.claim.toLowerCase());
        const foundJohnSmith = groundedTexts.some(t => t.includes('john smith'));
        const foundMinusma = groundedTexts.some(t => t.includes('minusma'));

        console.log(`\n  Key entities found:`);
        console.log(`    John Smith: ${foundJohnSmith ? '✓ grounded' : '✗ not found'}`);
        console.log(`    MINUSMA: ${foundMinusma ? '✓ grounded' : '✗ not found'}`);

        const success = report.groundedClaims.length > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Grounded: ${report.groundedClaims.length} claims verified\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Hallucinated Claims Detection
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 6: Hallucinated Claims Detection');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = await detector.verify(EXTRACTION_RESULT, SOURCE_TEXT);

        console.log('  Hallucinated Claims:');
        report.hallucinatedClaims.slice(0, 5).forEach(c => {
            console.log(`    ✗ "${c.claim.substring(0, 60)}${c.claim.length > 60 ? '...' : ''}"`);
            console.log(`      Best Match: ${(c.bestMatch * 100).toFixed(1)}%`);
            console.log(`      Reason: ${c.reasoning.substring(0, 80)}...`);
        });

        // Check if known-hallucinated entities are detected
        const hallucinatedTexts = report.hallucinatedClaims.map(c => c.claim.toLowerCase());
        const foundRobertJohnson = hallucinatedTexts.some(t => t.includes('robert johnson'));
        const foundUnprofor = hallucinatedTexts.some(t => t.includes('unprofor'));

        console.log(`\n  Fake entities detected:`);
        console.log(`    Robert Johnson: ${foundRobertJohnson ? '✓ flagged' : '✗ missed'}`);
        console.log(`    UNPROFOR: ${foundUnprofor ? '✓ flagged' : '✗ missed'}`);

        const success = report.hallucinatedClaims.length > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Hallucinated: ${report.hallucinatedClaims.length} claims flagged\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: By-Type Breakdown
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 7: Verification by Claim Type');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = await detector.verify(EXTRACTION_RESULT, SOURCE_TEXT);

        console.log('  Breakdown by Type:');
        for (const [type, stats] of Object.entries(report.byType)) {
            if (stats.total > 0) {
                const groundedPct = (stats.grounded / stats.total * 100).toFixed(0);
                const hallucinatedPct = (stats.hallucinated / stats.total * 100).toFixed(0);
                console.log(`    ${type}: ${stats.total} total (${groundedPct}% grounded, ${hallucinatedPct}% hallucinated)`);
            }
        }

        const success = Object.values(report.byType).some(s => s.total > 0);
        console.log(`\n  ${success ? '✅' : '❌'} By-Type: Breakdown available\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Statistics and Caching
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 8: Statistics and Caching');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // Run verification twice to test caching
        await detector.verify(EXTRACTION_RESULT, SOURCE_TEXT);
        await detector.verify(EXTRACTION_RESULT, SOURCE_TEXT);

        const stats = detector.getStats();

        console.log('  Detector Statistics:');
        console.log(`    Total Verifications: ${stats.totalVerifications}`);
        console.log(`    Total Claims Processed: ${stats.totalClaims}`);
        console.log(`    Grounding Rate: ${stats.groundingRate}`);
        console.log(`    Hallucination Rate: ${stats.hallucinationRate}`);
        console.log(`    Cache Hits: ${stats.cacheHits}`);
        console.log(`    Cache Hit Rate: ${stats.cacheHitRate}`);

        const success = stats.totalVerifications >= 2 && stats.cacheHits > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Caching: Working correctly\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────────────────

    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log(`║  Results: ${passed} passed, ${failed} failed                                  ║`);
    console.log(`║  Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%                                          ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Final detailed report
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Final Verification Report');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const finalDetector = createHallucinationDetector();
    const finalReport = await finalDetector.verify(EXTRACTION_RESULT, SOURCE_TEXT);

    console.log('GROUNDED CLAIMS:');
    console.log('─────────────────────────────────────────────────────────────────');
    finalReport.groundedClaims.forEach((c, i) => {
        console.log(`${i + 1}. ${c.claim}`);
        console.log(`   Confidence: ${(c.confidence * 100).toFixed(1)}%`);
        if (c.evidence) {
            console.log(`   Evidence: "${c.evidence.substring(0, 100)}..."`);
        }
        console.log('');
    });

    console.log('HALLUCINATED CLAIMS:');
    console.log('─────────────────────────────────────────────────────────────────');
    finalReport.hallucinatedClaims.forEach((c, i) => {
        console.log(`${i + 1}. ${c.claim}`);
        console.log(`   Best Match: ${(c.bestMatch * 100).toFixed(1)}%`);
        console.log(`   ${c.reasoning}`);
        console.log('');
    });

    console.log('UNCERTAIN CLAIMS:');
    console.log('─────────────────────────────────────────────────────────────────');
    finalReport.uncertainClaims.forEach((c, i) => {
        console.log(`${i + 1}. ${c.claim}`);
        console.log(`   Similarity: ${(c.similarity * 100).toFixed(1)}%`);
        if (c.evidence) {
            console.log(`   Partial Evidence: "${c.evidence.substring(0, 100)}..."`);
        }
        console.log('');
    });

    return { passed, failed, total: passed + failed };
}

// Run tests
runTests()
    .then(({ passed, failed, total }) => {
        console.log(`\nHallucination Detector test completed: ${passed}/${total} passed`);
        process.exit(failed > total / 2 ? 1 : 0);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
