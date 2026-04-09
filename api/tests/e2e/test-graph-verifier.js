/**
 * Test for PiVe-pattern Graph Verifier
 *
 * Tests the iterative verification and correction cycle:
 * Generate → Verify → Correct → Repeat
 */

'use strict';

const { createGraphVerifier } = require('../../src/services/graph/metrics/graph-verifier');
const { createIterativeRefinementPipeline } = require('../../src/services/graph/metrics/iterative-refinement');

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

const SOURCE_TEXT = `
The United Nations Department of Peace Operations (DPO) manages peacekeeping missions
worldwide. John Smith serves as Director of Mission Support, overseeing logistics and
resource allocation for all field operations. The department coordinates closely with
DPPA (Department of Political and Peacebuilding Affairs) on political strategies.

MINUSMA (UN Mission in Mali) was established in 2013 and currently has 13,000 personnel.
Maria Garcia leads the HR division and reports to John Smith. The mission's budget for
2024 is $1.2 billion.

UNMISS (UN Mission in South Sudan) is the largest peacekeeping operation with a budget
of $1.5 billion. Sarah Johnson manages the field operations team in South Sudan.

Security Council Resolution 2584 (2021) extended MINUSMA's mandate, emphasizing civilian
protection and political process support.
`;

// Extraction with intentional issues for testing correction
const EXTRACTION_WITH_ISSUES = {
    entities: [
        // Valid entities
        { name: 'DPO', type: 'Organization', id: 'org_dpo' },
        { name: 'John Smith', type: 'Person', role: 'Director', id: 'person_js' },
        { name: 'MINUSMA', type: 'Organization', id: 'org_minusma' },
        { name: 'Maria Garcia', type: 'Person', role: 'HR Lead', id: 'person_mg' },
        { name: 'UNMISS', type: 'Organization', id: 'org_unmiss' },
        { name: 'Sarah Johnson', type: 'Person', id: 'person_sj' },

        // Duplicate entity (same person, different ID)
        { name: 'John Smith', type: 'Person', role: 'Director of Support', id: 'person_js_dup' },

        // Hallucinated entities (not in source)
        { name: 'Robert Wilson', type: 'Person', role: 'Security Chief', id: 'person_fake' },
        { name: 'UNPROFOR', type: 'Organization', id: 'org_fake' },

        // Invalid entity type
        { name: 'Resolution 2584', type: 'LegalDocument', id: 'doc_res' } // Invalid type
    ],

    relations: [
        // Valid relations
        { subject: 'Maria Garcia', predicate: 'REPORTS_TO', object: 'John Smith' },
        { subject: 'DPO', predicate: 'MANAGES', object: 'MINUSMA' },
        { subject: 'John Smith', predicate: 'ASSIGNED_TO', object: 'DPO' },

        // Conflicting relations (same subject-object, different predicates)
        { subject: 'Sarah Johnson', predicate: 'MANAGES', object: 'UNMISS' },
        { subject: 'Sarah Johnson', predicate: 'OWNS', object: 'UNMISS' }, // Conflict!

        // Hallucinated relation
        { subject: 'Robert Wilson', predicate: 'LEADS', object: 'security operations' },

        // Ontology violation (invalid predicate)
        { subject: 'MINUSMA', predicate: 'INVENTED_BY', object: 'UN' } // Invalid predicate
    ],

    triples: [
        {
            subject: { name: 'MINUSMA', type: 'Organization' },
            predicate: 'ESTABLISHED_IN',
            object: { name: '2013', type: 'Date' }
        }
    ]
};

// Clean extraction for comparison
const CLEAN_EXTRACTION = {
    entities: [
        { name: 'DPO', type: 'Organization', id: 'org_dpo' },
        { name: 'John Smith', type: 'Person', role: 'Director', id: 'person_js' },
        { name: 'MINUSMA', type: 'Organization', id: 'org_minusma' },
        { name: 'Maria Garcia', type: 'Person', role: 'HR Lead', id: 'person_mg' }
    ],

    relations: [
        { subject: 'Maria Garcia', predicate: 'REPORTS_TO', object: 'John Smith' },
        { subject: 'John Smith', predicate: 'ASSIGNED_TO', object: 'DPO' }
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       PiVe-pattern Graph Verifier Test Suite                 ║');
    console.log('║       Pipeline: Generate → Verify → Correct → Repeat         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const verifier = createGraphVerifier({
        maxIterations: 3,
        qualityThreshold: 0.85,
        improvementThreshold: 0.02,
        checkHallucinations: true,
        checkOntology: true,
        checkCompleteness: true,
        checkConsistency: true
    });

    let passed = 0;
    let failed = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Single Verification Pass
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 1: Single Verification Pass');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const verification = await verifier.verify(EXTRACTION_WITH_ISSUES, SOURCE_TEXT);

        console.log('  Verification Result:');
        console.log(`    Overall Score: ${(verification.overallScore * 100).toFixed(1)}%`);
        console.log(`    Grade: ${verification.grade}`);
        console.log('');
        console.log('  Metrics:');
        console.log(`    Hallucination: rate=${(verification.metrics.hallucination?.rate * 100 || 0).toFixed(1)}%`);
        console.log(`    Ontology: conformance=${(verification.metrics.ontology?.conformanceRate * 100 || 0).toFixed(1)}%`);
        console.log(`    Completeness: score=${(verification.metrics.completeness?.score * 100 || 0).toFixed(1)}%`);
        console.log(`    Consistency: score=${(verification.metrics.consistency?.score * 100 || 0).toFixed(1)}%`);
        console.log('');
        console.log('  Issues Found:');
        console.log(`    High: ${verification.issuesBySeverity.high}`);
        console.log(`    Medium: ${verification.issuesBySeverity.medium}`);
        console.log(`    Low: ${verification.issuesBySeverity.low}`);
        console.log(`    Total: ${verification.issues.length}`);

        const success = verification.overallScore > 0 && verification.issues.length > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Single verification completed\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Issue Detection — Hallucinations
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 2: Hallucination Detection');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const verification = await verifier.verify(EXTRACTION_WITH_ISSUES, SOURCE_TEXT);
        const hallucinationIssues = verification.issues.filter(i => i.type === 'hallucination');

        console.log(`  Hallucination issues found: ${hallucinationIssues.length}`);
        hallucinationIssues.slice(0, 3).forEach(issue => {
            console.log(`    - ${issue.description.substring(0, 70)}...`);
        });

        const success = hallucinationIssues.length > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Hallucinations detected: ${hallucinationIssues.length}\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Issue Detection — Duplicates
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 3: Duplicate Detection');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const verification = await verifier.verify(EXTRACTION_WITH_ISSUES, SOURCE_TEXT);
        const duplicateIssues = verification.issues.filter(i => i.type === 'duplicate');

        console.log(`  Duplicate issues found: ${duplicateIssues.length}`);
        duplicateIssues.forEach(issue => {
            console.log(`    - ${issue.description}`);
        });

        const success = duplicateIssues.length > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Duplicates detected: ${duplicateIssues.length}\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Issue Detection — Conflicts
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 4: Conflict Detection');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const verification = await verifier.verify(EXTRACTION_WITH_ISSUES, SOURCE_TEXT);
        const conflictIssues = verification.issues.filter(i => i.type === 'conflict');

        console.log(`  Conflict issues found: ${conflictIssues.length}`);
        conflictIssues.forEach(issue => {
            console.log(`    - ${issue.description}`);
        });

        const success = conflictIssues.length > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Conflicts detected: ${conflictIssues.length}\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Iterative Refinement
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 5: Iterative Refinement (PiVe Cycle)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = await verifier.verifyAndRefine(EXTRACTION_WITH_ISSUES, SOURCE_TEXT);

        console.log('  Refinement Result:');
        console.log(`    Final Score: ${(report.finalScore * 100).toFixed(1)}%`);
        console.log(`    Final Grade: ${report.finalGrade}`);
        console.log(`    Iterations: ${report.iterations.count}`);
        console.log(`    Stop Reason: ${report.iterations.stopReason}`);
        console.log(`    Improvement: ${report.iterations.improvementPercent}`);
        console.log('');
        console.log('  Issues Resolution:');
        console.log(`    Initial Issues: ${report.issues.initial}`);
        console.log(`    Final Issues: ${report.issues.final}`);
        console.log(`    Resolved: ${report.issues.resolved}`);
        console.log('');
        console.log('  Iteration History:');
        report.iterations.history.forEach(iter => {
            console.log(`    Iter ${iter.iteration}: score=${(iter.score * 100).toFixed(1)}%, grade=${iter.grade}, issues=${iter.issues?.length || 0}`);
        });

        const success = report.iterations.count >= 1 && report.finalScore > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Iterative refinement completed\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Clean Extraction (Higher Score Expected)
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 6: Clean Extraction Verification');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const verification = await verifier.verify(CLEAN_EXTRACTION, SOURCE_TEXT);

        console.log('  Clean Extraction Result:');
        console.log(`    Overall Score: ${(verification.overallScore * 100).toFixed(1)}%`);
        console.log(`    Grade: ${verification.grade}`);
        console.log(`    Issues: ${verification.issues.length}`);
        console.log('');
        console.log('  Metrics:');
        console.log(`    Hallucination: ${(verification.metrics.hallucination?.rate * 100 || 0).toFixed(1)}%`);
        console.log(`    Ontology: ${(verification.metrics.ontology?.conformanceRate * 100 || 0).toFixed(1)}%`);
        console.log(`    Consistency: ${(verification.metrics.consistency?.score * 100 || 0).toFixed(1)}%`);

        // Clean extraction should score higher than one with issues
        const cleanVerify = await verifier.verify(CLEAN_EXTRACTION, SOURCE_TEXT);
        const dirtyVerify = await verifier.verify(EXTRACTION_WITH_ISSUES, SOURCE_TEXT);

        const success = cleanVerify.overallScore > dirtyVerify.overallScore;
        console.log(`\n  Clean score (${(cleanVerify.overallScore * 100).toFixed(1)}%) vs Dirty score (${(dirtyVerify.overallScore * 100).toFixed(1)}%)`);
        console.log(`  ${success ? '✅' : '❌'} Clean extraction scores higher\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Iterative Refinement Pipeline
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 7: Iterative Refinement Pipeline');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // Create pipeline without extractor (pass extraction directly)
        const pipeline = createIterativeRefinementPipeline(null, {
            autoRefine: true,
            logProgress: true
        });

        const result = await pipeline.refineExisting(EXTRACTION_WITH_ISSUES, SOURCE_TEXT);

        console.log('');
        console.log('  Pipeline Result:');
        console.log(`    Refined: ${result.refined}`);
        console.log(`    Initial Score: ${(result.initialScore * 100).toFixed(1)}%`);
        console.log(`    Final Score: ${(result.finalScore * 100).toFixed(1)}%`);
        console.log(`    Grade: ${result.grade}`);
        console.log(`    Iterations: ${result.iterations}`);
        console.log(`    Issues Resolved: ${result.issuesResolved}`);
        console.log(`    Stop Reason: ${result.stopReason}`);

        const success = result.refined && result.finalScore > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Pipeline refinement completed\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Verifier Statistics
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 8: Verifier Statistics');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const stats = verifier.getStats();

        console.log('  Verifier Statistics:');
        console.log(`    Total Verifications: ${stats.totalVerifications}`);
        console.log(`    Iterations Performed: ${stats.iterationsPerformed}`);
        console.log(`    Avg Iterations: ${stats.avgIterations}`);
        console.log(`    Successful Corrections: ${stats.successfulCorrections}`);
        console.log(`    Correction Success Rate: ${stats.correctionSuccessRate}`);
        console.log(`    Early Stops: ${stats.earlyStops}`);
        console.log(`    Threshold Reached: ${stats.thresholdReached}`);

        const success = stats.totalVerifications > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Statistics tracking working\n`);

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
    console.log('Final Refinement Report (Detailed)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const finalVerifier = createGraphVerifier();
    const finalReport = await finalVerifier.verifyAndRefine(EXTRACTION_WITH_ISSUES, SOURCE_TEXT);

    console.log('ITERATION HISTORY:');
    console.log('─────────────────────────────────────────────────────────────────');
    for (const iter of finalReport.iterations.history) {
        console.log(`Iteration ${iter.iteration}:`);
        console.log(`  Score: ${(iter.score * 100).toFixed(1)}% (${iter.grade})`);
        console.log(`  Issues: ${iter.issues?.length || 0} (high: ${iter.issuesBySeverity?.high || 0}, medium: ${iter.issuesBySeverity?.medium || 0}, low: ${iter.issuesBySeverity?.low || 0})`);
        if (iter.metrics) {
            console.log(`  Metrics:`);
            console.log(`    - Hallucination rate: ${((iter.metrics.hallucination?.rate || 0) * 100).toFixed(1)}%`);
            console.log(`    - Ontology conformance: ${((iter.metrics.ontology?.conformanceRate || 0) * 100).toFixed(1)}%`);
            console.log(`    - Consistency: ${((iter.metrics.consistency?.score || 0) * 100).toFixed(1)}%`);
        }
        console.log('');
    }

    console.log('FINAL RESULT:');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log(`Stop Reason: ${finalReport.iterations.stopReason}`);
    console.log(`Improvement: ${finalReport.iterations.improvementPercent}`);
    console.log(`Issues Resolved: ${finalReport.issues.resolved} of ${finalReport.issues.initial}`);
    console.log(`Final Entity Count: ${finalReport.finalResult.entities?.length || 0}`);
    console.log(`Final Relation Count: ${finalReport.finalResult.relations?.length || 0}`);
    console.log(`Processing Time: ${finalReport.duration}ms`);

    return { passed, failed, total: passed + failed };
}

// Run tests
runTests()
    .then(({ passed, failed, total }) => {
        console.log(`\nGraph Verifier test completed: ${passed}/${total} passed`);
        process.exit(failed > total / 2 ? 1 : 0);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
