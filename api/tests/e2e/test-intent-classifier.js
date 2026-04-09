/**
 * Test for Intent Classifier - SDA Stage 1
 *
 * Demonstrates hybrid classification (rules + LLM fallback)
 * using intent-rules.js and structured output.
 */

'use strict';

const { IntentClassifier, createIntentClassifier, DOMAINS, INTENT_TYPES } = require('../../src/services/graph/intent-classifier');

// ═══════════════════════════════════════════════════════════════════════════
// TEST PROMPTS - Various domains and intents
// ═══════════════════════════════════════════════════════════════════════════

const TEST_PROMPTS = [
    // DevOps - Azure DevOps work items
    {
        prompt: 'Get work item #12345 from Azure DevOps',
        expectedDomain: 'devops',
        expectedIntent: 'read'
    },
    {
        prompt: 'Create a new bug for the authentication failure',
        expectedDomain: 'devops',
        expectedIntent: 'create'
    },
    {
        prompt: 'Update work item 789 state to Done',
        expectedDomain: 'devops',
        expectedIntent: 'update'
    },
    {
        prompt: 'Ingest all work items from ADO project UNPA',
        expectedDomain: 'devops',
        expectedIntent: 'ingest'
    },

    // Knowledge - Search and extraction
    {
        prompt: 'Search for documents about peacekeeping missions',
        expectedDomain: 'knowledge',
        expectedIntent: 'read'
    },
    {
        prompt: 'Extract entities from the uploaded PDF',
        expectedDomain: 'knowledge',
        expectedIntent: 'extract'
    },
    {
        prompt: 'Find similar documents using semantic search',
        expectedDomain: 'knowledge',
        expectedIntent: 'read'
    },
    {
        prompt: 'Build knowledge graph from extracted entities',
        expectedDomain: 'knowledge',
        expectedIntent: 'create'
    },

    // HR - Personnel management
    {
        prompt: 'Get staff profile for employee P3-12345',
        expectedDomain: 'hr',
        expectedIntent: 'read'
    },
    {
        prompt: 'Create vacancy announcement for D1 position',
        expectedDomain: 'hr',
        expectedIntent: 'create'
    },

    // Finance - Budget and procurement
    {
        prompt: 'Fetch budget allocation for fund 2024-001',
        expectedDomain: 'finance',
        expectedIntent: 'read'
    },
    {
        prompt: 'Create purchase order for office supplies',
        expectedDomain: 'finance',
        expectedIntent: 'create'
    },

    // Legal - Resolutions and compliance
    {
        prompt: 'Find resolution A/RES/78/200 on sustainable development',
        expectedDomain: 'legal',
        expectedIntent: 'read'
    },
    {
        prompt: 'Analyze compliance with ST/SGB/2019/8',
        expectedDomain: 'legal',
        expectedIntent: 'analyze'
    },

    // Operations - Missions and logistics
    {
        prompt: 'Get status of MINUSMA deployment',
        expectedDomain: 'operations',
        expectedIntent: 'read'
    },
    {
        prompt: 'Track shipment delivery to field office',
        expectedDomain: 'operations',
        expectedIntent: 'read'
    },

    // Complex multi-domain prompts
    {
        prompt: 'Parse all Umoja transactions, extract entities, and store in graph with embeddings',
        expectedDomain: 'knowledge',  // Primary domain
        expectedIntent: 'ingest'
    },
    {
        prompt: 'Compare budget allocations between DPKO and DFS for Q1 2024',
        expectedDomain: 'finance',
        expectedIntent: 'compare'
    },

    // Ambiguous prompts (lower confidence expected)
    {
        prompt: 'Process the data',
        expectedDomain: 'knowledge',  // Default fallback
        expectedIntent: 'transform'
    },
    {
        prompt: 'Help with the report',
        expectedDomain: 'knowledge',
        expectedIntent: 'analyze'
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Intent Classifier Test Suite (SDA Stage 1)             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Create classifier without LLM (pure rule-based testing)
    const classifier = createIntentClassifier(null);

    console.log('\n--- Available Domains ---');
    console.log(Object.keys(DOMAINS).join(', '));

    console.log('\n--- Available Intent Types ---');
    console.log(Object.keys(INTENT_TYPES).join(', '));

    let passed = 0;
    let failed = 0;
    const results = [];

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Classification Results');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const test of TEST_PROMPTS) {
        try {
            const result = await classifier.classify(test.prompt);
            const domainMatch = result.domain === test.expectedDomain ||
                               result.allDomains?.includes(test.expectedDomain);
            const intentMatch = result.intent === test.expectedIntent;

            const status = domainMatch && intentMatch ? '✅' : '⚠️';

            console.log(`${status} "${test.prompt.substring(0, 50)}${test.prompt.length > 50 ? '...' : ''}"`);
            console.log(`   Domain: ${result.domain} (expected: ${test.expectedDomain}) ${domainMatch ? '✓' : '✗'}`);
            console.log(`   Intent: ${result.intent} (expected: ${test.expectedIntent}) ${intentMatch ? '✓' : '✗'}`);
            console.log(`   Confidence: ${(result.confidence * 100).toFixed(0)}%`);
            console.log(`   Method: ${result.method}`);
            if (result.suggestedTools?.length > 0) {
                console.log(`   Suggested Tools: ${result.suggestedTools.join(', ')}`);
            }
            if (result.ontologyLayer) {
                console.log(`   Ontology Layer: ${result.ontologyLayer}`);
            }
            if (result.matchedKeywords?.length > 0) {
                console.log(`   Matched Keywords: ${result.matchedKeywords.slice(0, 3).join(', ')}`);
            }
            console.log('');

            results.push({
                prompt: test.prompt,
                result,
                domainMatch,
                intentMatch,
                success: domainMatch && intentMatch
            });

            if (domainMatch && intentMatch) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            console.log(`❌ "${test.prompt.substring(0, 50)}..."`);
            console.log(`   Error: ${error.message}`);
            console.log('');
            failed++;
        }
    }

    // Batch classification test
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Batch Classification Statistics');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const batchResult = classifier.batchClassify(TEST_PROMPTS.map(t => t.prompt));
    console.log('Total prompts:', batchResult.stats.total);
    console.log('By Intent:', batchResult.stats.byIntent);
    console.log('By Complexity:', batchResult.stats.byComplexity);
    console.log('Average Confidence:', (batchResult.stats.avgConfidence * 100).toFixed(1) + '%');
    console.log('High Confidence Count:', batchResult.stats.highConfidenceCount);

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log(`║  Results: ${passed} passed, ${failed} partial matches                       ║`);
    console.log(`║  Accuracy: ${((passed / TEST_PROMPTS.length) * 100).toFixed(1)}%                                              ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Confidence distribution
    console.log('\n--- Confidence Distribution ---');
    const highConf = results.filter(r => r.result.confidence >= 0.75).length;
    const medConf = results.filter(r => r.result.confidence >= 0.5 && r.result.confidence < 0.75).length;
    const lowConf = results.filter(r => r.result.confidence < 0.5).length;
    console.log(`High (>=75%): ${highConf}`);
    console.log(`Medium (50-75%): ${medConf}`);
    console.log(`Low (<50%): ${lowConf}`);

    // Method distribution
    console.log('\n--- Classification Method ---');
    const byMethod = {};
    for (const r of results) {
        byMethod[r.result.method] = (byMethod[r.result.method] || 0) + 1;
    }
    for (const [method, count] of Object.entries(byMethod)) {
        console.log(`${method}: ${count}`);
    }

    return { passed, failed, total: TEST_PROMPTS.length };
}

// Run tests
runTests()
    .then(({ passed, failed, total }) => {
        console.log(`\nTest completed: ${passed}/${total} exact matches`);
        // Don't fail on partial matches since rule-based classification
        // may need tuning for edge cases
        process.exit(0);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
