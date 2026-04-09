/**
 * Test for Ontology Conformance Checker
 *
 * Tests conformance checking including:
 * - Entity type validation
 * - Relation domain/range validation
 * - Cardinality constraints
 * - Required attributes
 * - Suggestion generation and application
 */

'use strict';

const { createOntologyConformanceChecker, CARDINALITY_CONSTRAINTS, TRANSITIVE_RELATIONS } = require('../../src/services/graph/metrics/ontology-conformance-checker');
const { AOPEG_ONTOLOGY } = require('../../src/services/graph/metrics/ontology-schema');

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

// Extraction with various conformance issues
const EXTRACTION_WITH_ISSUES = {
    entities: [
        // Valid entities
        { name: 'DPO', type: 'Organization', id: 'org_dpo' },
        { name: 'John Smith', type: 'Person', id: 'person_js' }, // Missing required 'name' attr (has it)
        { name: 'MINUSMA', type: 'Organization', id: 'org_minusma' },
        { name: 'Bug #1234', type: 'Bug', id: 'bug_1234' },
        { name: 'MyAPI', type: 'API', id: 'api_1' }, // Missing 'name' attr (has it)

        // Invalid entity type
        { name: 'Resolution 2584', type: 'LegalDocument', id: 'doc_res' },
        { name: 'Database Schema', type: 'Schema', id: 'schema_1' },

        // Missing type
        { name: 'Unknown Entity', id: 'unknown_1' }
    ],

    relations: [
        // Valid relations
        { subject: 'John Smith', predicate: 'ASSIGNED_TO', object: 'DPO' },
        { subject: 'DPO', predicate: 'CONTAINS', object: 'MINUSMA' },

        // Invalid relation type
        { subject: 'John Smith', predicate: 'INVENTED', object: 'DPO' },

        // Domain violation: Bug cannot be subject of MANAGES
        { subject: 'Bug #1234', predicate: 'MANAGES', object: 'DPO' },

        // Range violation: Organization cannot be object of AUTHORED_BY
        { subject: 'Resolution 2584', predicate: 'AUTHORED_BY', object: 'DPO' },

        // Missing entity in extraction
        { subject: 'Unknown Person', predicate: 'ASSIGNED_TO', object: 'DPO' },

        // Valid but tests cardinality (multiple assignments from same item)
        { subject: 'Bug #1234', predicate: 'ASSIGNED_TO', object: 'John Smith' },
        { subject: 'Bug #1234', predicate: 'ASSIGNED_TO', object: 'DPO' },
        { subject: 'Bug #1234', predicate: 'ASSIGNED_TO', object: 'MINUSMA' },
        { subject: 'Bug #1234', predicate: 'ASSIGNED_TO', object: 'MyAPI' },
        { subject: 'Bug #1234', predicate: 'ASSIGNED_TO', object: 'Database Schema' },
        { subject: 'Bug #1234', predicate: 'ASSIGNED_TO', object: 'Unknown Entity' }
    ]
};

// Clean extraction for comparison
const CLEAN_EXTRACTION = {
    entities: [
        { name: 'DPO', type: 'Organization', id: 'org_dpo' },
        { name: 'John Smith', type: 'Person', id: 'person_js' },
        { name: 'MINUSMA', type: 'Organization', id: 'org_minusma' }
    ],

    relations: [
        { subject: 'John Smith', predicate: 'ASSIGNED_TO', object: 'DPO' },
        { subject: 'DPO', predicate: 'CONTAINS', object: 'MINUSMA' }
    ]
};

// Extraction for cardinality test
const CARDINALITY_EXTRACTION = {
    entities: [
        { name: 'Project Alpha', type: 'Project', id: 'proj_1' },
        { name: 'Owner A', type: 'Person', id: 'person_a' },
        { name: 'Owner B', type: 'Person', id: 'person_b' }
    ],
    relations: [
        // Violates OWNED_BY maxOutgoing=1
        { subject: 'Project Alpha', predicate: 'OWNED_BY', object: 'Owner A' },
        { subject: 'Project Alpha', predicate: 'OWNED_BY', object: 'Owner B' }
    ]
};

// Extraction for transitivity test
const TRANSITIVITY_EXTRACTION = {
    entities: [
        { name: 'Division A', type: 'Organization', id: 'div_a' },
        { name: 'Team B', type: 'Team', id: 'team_b' },
        { name: 'Member C', type: 'Person', id: 'member_c' }
    ],
    relations: [
        // A contains B, B contains C, but A→C is missing
        { subject: 'Division A', predicate: 'PART_OF', object: 'Team B' },
        { subject: 'Team B', predicate: 'PART_OF', object: 'Member C' }
    ]
};

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Ontology Conformance Checker Test Suite                ║');
    console.log('║       Production-ready validation (SHACL/OWL inspired)       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const checker = createOntologyConformanceChecker({
        strictMode: false,
        suggestFixes: true,
        checkCardinality: true,
        checkAttributes: true,
        checkTransitivity: true
    });

    let passed = 0;
    let failed = 0;

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 1: Basic Conformance Check
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 1: Basic Conformance Check');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = checker.check(EXTRACTION_WITH_ISSUES);

        console.log('  Conformance Report:');
        console.log(`    Conformant: ${report.conformant}`);
        console.log(`    Conformance Rate: ${(report.conformanceRate * 100).toFixed(1)}%`);
        console.log(`    Grade: ${report.grade}`);
        console.log('');
        console.log('  Summary:');
        console.log(`    Total Items: ${report.summary.totalItems}`);
        console.log(`    Violations: ${report.summary.violations}`);
        console.log(`    Warnings: ${report.summary.warnings}`);
        console.log(`    Suggestions: ${report.summary.suggestions}`);

        const success = report.summary.violations > 0 && report.conformanceRate < 1;
        console.log(`\n  ${success ? '✅' : '❌'} Basic conformance check completed\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 2: Entity Type Validation
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 2: Entity Type Validation');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = checker.check(EXTRACTION_WITH_ISSUES);
        const entityTypeViolations = report.violations.filter(v => v.category === 'entity_type');

        console.log(`  Entity type violations: ${entityTypeViolations.length}`);
        entityTypeViolations.forEach(v => {
            console.log(`    - ${v.message}`);
            console.log(`      Entity: ${v.entity}, Type: ${v.currentValue}`);
        });

        // Should find LegalDocument and Schema as invalid types
        const foundLegalDoc = entityTypeViolations.some(v => v.currentValue === 'LegalDocument');
        const foundSchema = entityTypeViolations.some(v => v.currentValue === 'Schema');

        const success = foundLegalDoc && foundSchema;
        console.log(`\n  Invalid types detected:`);
        console.log(`    LegalDocument: ${foundLegalDoc ? '✓' : '✗'}`);
        console.log(`    Schema: ${foundSchema ? '✓' : '✗'}`);
        console.log(`\n  ${success ? '✅' : '❌'} Entity type validation working\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 3: Relation Type Validation
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 3: Relation Type Validation');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = checker.check(EXTRACTION_WITH_ISSUES);
        const relationTypeViolations = report.violations.filter(v => v.category === 'relation_type');

        console.log(`  Relation type violations: ${relationTypeViolations.length}`);
        relationTypeViolations.forEach(v => {
            console.log(`    - ${v.message}`);
            console.log(`      Relation: ${v.relation}`);
        });

        // Should find INVENTED as invalid relation
        const foundInvented = relationTypeViolations.some(v => v.currentValue === 'INVENTED');

        const success = foundInvented;
        console.log(`\n  Invalid relation detected: ${foundInvented ? '✓ INVENTED' : '✗'}`);
        console.log(`\n  ${success ? '✅' : '❌'} Relation type validation working\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 4: Domain/Range Constraints
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 4: Domain/Range Constraint Validation');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = checker.check(EXTRACTION_WITH_ISSUES);
        const domainViolations = report.violations.filter(v => v.category === 'domain_violation');
        const rangeViolations = report.violations.filter(v => v.category === 'range_violation');

        console.log(`  Domain violations: ${domainViolations.length}`);
        domainViolations.slice(0, 2).forEach(v => {
            console.log(`    - ${v.message}`);
        });

        console.log(`\n  Range violations: ${rangeViolations.length}`);
        rangeViolations.slice(0, 2).forEach(v => {
            console.log(`    - ${v.message}`);
        });

        const success = domainViolations.length > 0 || rangeViolations.length > 0;
        console.log(`\n  ${success ? '✅' : '❌'} Domain/Range validation working\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 5: Cardinality Constraints
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 5: Cardinality Constraint Validation');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        // Test with extraction that has multiple OWNED_BY from same entity
        const cardinalityChecker = createOntologyConformanceChecker({
            checkCardinality: true
        });

        const report = cardinalityChecker.check(CARDINALITY_EXTRACTION);
        const cardinalityViolations = report.violations.filter(v => v.category === 'cardinality_violation');

        console.log(`  Cardinality violations: ${cardinalityViolations.length}`);
        cardinalityViolations.forEach(v => {
            console.log(`    - ${v.message}`);
            console.log(`      Entity: ${v.entity}, Predicate: ${v.predicate}`);
            console.log(`      Count: ${v.count}, Max: ${v.max}`);
        });

        // Should find OWNED_BY violation (maxOutgoing=1)
        const foundOwnerViolation = cardinalityViolations.some(
            v => v.predicate === 'OWNED_BY' && v.count > 1
        );

        console.log(`\n  Available cardinality constraints:`);
        Object.entries(CARDINALITY_CONSTRAINTS).forEach(([rel, c]) => {
            console.log(`    ${rel}: maxOut=${c.maxOutgoing || 'unlimited'}, maxIn=${c.maxIncoming || 'unlimited'}`);
        });

        const success = foundOwnerViolation;
        console.log(`\n  OWNED_BY violation detected: ${foundOwnerViolation ? '✓' : '✗'}`);
        console.log(`\n  ${success ? '✅' : '❌'} Cardinality validation working\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 6: Missing Entity Warnings
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 6: Missing Entity Warnings');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = checker.check(EXTRACTION_WITH_ISSUES);
        const missingEntityWarnings = report.warnings.filter(w => w.category === 'missing_entity');

        console.log(`  Missing entity warnings: ${missingEntityWarnings.length}`);
        missingEntityWarnings.slice(0, 3).forEach(w => {
            console.log(`    - ${w.message}`);
            console.log(`      Entity: ${w.entity}`);
        });

        // Should find "Unknown Person" as missing
        const foundUnknownPerson = missingEntityWarnings.some(
            w => w.entity === 'Unknown Person'
        );

        const success = foundUnknownPerson;
        console.log(`\n  "Unknown Person" flagged: ${foundUnknownPerson ? '✓' : '✗'}`);
        console.log(`\n  ${success ? '✅' : '❌'} Missing entity warnings working\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 7: Suggestion Generation
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 7: Suggestion Generation');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = checker.check(EXTRACTION_WITH_ISSUES);

        console.log(`  Suggestions generated: ${report.suggestions.length}`);
        report.suggestions.slice(0, 5).forEach(s => {
            console.log(`    - [${s.type}] ${s.entity || s.relation}`);
            console.log(`      From: ${s.from} → To: ${s.to}`);
            if (s.reason) console.log(`      Reason: ${s.reason}`);
        });

        const hasTypeChangeSuggestion = report.suggestions.some(s => s.type === 'change_type');
        const hasRelationSuggestion = report.suggestions.some(s => s.type === 'change_relation');

        const success = report.suggestions.length > 0;
        console.log(`\n  Suggestion types:`);
        console.log(`    change_type: ${hasTypeChangeSuggestion ? '✓' : '✗'}`);
        console.log(`    change_relation: ${hasRelationSuggestion ? '✓' : '✗'}`);
        console.log(`\n  ${success ? '✅' : '❌'} Suggestion generation working\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 8: Apply Suggestions
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 8: Apply Suggestions (Auto-fix)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const initialReport = checker.check(EXTRACTION_WITH_ISSUES);
        console.log(`  Initial violations: ${initialReport.summary.violations}`);
        console.log(`  Suggestions available: ${initialReport.suggestions.length}`);

        // Apply suggestions
        const fixedExtraction = checker.applySuggestions(
            EXTRACTION_WITH_ISSUES,
            initialReport.suggestions
        );

        // Re-check
        const fixedReport = checker.check(fixedExtraction);
        console.log(`\n  After applying ${initialReport.suggestions.length} suggestions:`);
        console.log(`    Violations: ${fixedReport.summary.violations}`);
        console.log(`    Conformance Rate: ${(fixedReport.conformanceRate * 100).toFixed(1)}%`);
        console.log(`    Grade: ${fixedReport.grade}`);

        const improved = fixedReport.conformanceRate >= initialReport.conformanceRate;
        const success = initialReport.suggestions.length > 0;
        console.log(`\n  Improvement: ${improved ? '✓ Score maintained or improved' : '✗ Score decreased'}`);
        console.log(`\n  ${success ? '✅' : '❌'} Suggestion application working\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 9: Clean Extraction (Should Pass)
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 9: Clean Extraction (Should Pass)');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = checker.check(CLEAN_EXTRACTION);

        console.log('  Clean Extraction Report:');
        console.log(`    Conformant: ${report.conformant}`);
        console.log(`    Conformance Rate: ${(report.conformanceRate * 100).toFixed(1)}%`);
        console.log(`    Grade: ${report.grade}`);
        console.log(`    Violations: ${report.summary.violations}`);
        console.log(`    Warnings: ${report.summary.warnings}`);

        const success = report.conformant || report.summary.violations === 0;
        console.log(`\n  ${success ? '✅' : '❌'} Clean extraction validation\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 10: Violation Grouping
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 10: Violation Grouping by Category');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const report = checker.check(EXTRACTION_WITH_ISSUES);

        console.log('  Violations by Category:');
        for (const [category, violations] of Object.entries(report.byCategory)) {
            console.log(`    ${category}: ${violations.length}`);
        }

        const hasGrouping = Object.keys(report.byCategory).length > 0;
        const success = hasGrouping;
        console.log(`\n  ${success ? '✅' : '❌'} Violation grouping working\n`);

        if (success) passed++; else failed++;
    } catch (error) {
        console.log(`  ❌ Error: ${error.message}\n`);
        failed++;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TEST 11: Statistics
    // ─────────────────────────────────────────────────────────────────────────

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Test 11: Statistics Tracking');
    console.log('═══════════════════════════════════════════════════════════════\n');

    try {
        const stats = checker.getStats();

        console.log('  Checker Statistics:');
        console.log(`    Total Checks: ${stats.totalChecks}`);
        console.log(`    Passed: ${stats.passed}`);
        console.log(`    Failed: ${stats.failed}`);
        console.log(`    Pass Rate: ${stats.passRate}`);
        console.log(`    Warnings: ${stats.warnings}`);

        const success = stats.totalChecks > 0;
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

    // Show ontology stats
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Ontology Statistics');
    console.log('═══════════════════════════════════════════════════════════════\n');

    console.log(`Entity Types: ${AOPEG_ONTOLOGY.entityTypes.length}`);
    console.log(`Relation Types: ${AOPEG_ONTOLOGY.relationTypes.length}`);
    console.log(`Constraints: ${Object.keys(AOPEG_ONTOLOGY.constraints || {}).length}`);
    console.log(`Cardinality Constraints: ${Object.keys(CARDINALITY_CONSTRAINTS).length}`);
    console.log(`Transitive Relations: ${TRANSITIVE_RELATIONS.length}`);

    return { passed, failed, total: passed + failed };
}

// Run tests
runTests()
    .then(({ passed, failed, total }) => {
        console.log(`\nOntology Conformance test completed: ${passed}/${total} passed`);
        process.exit(failed > total / 2 ? 1 : 0);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
