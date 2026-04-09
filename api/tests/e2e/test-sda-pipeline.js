/**
 * Test for Full SDA Pipeline (Staged DAG Assembly)
 *
 * Tests the complete pipeline:
 * [prompt] → [IntentClassifier(S1)] → [ToolResolver(S2)] → [TaskPlanner(S3)] → [ProcessRepresentation]
 */

'use strict';

const { createIntentClassifier } = require('../../src/services/graph/intent-classifier');
const { createToolResolver, TOOL_ROLES } = require('../../src/services/graph/tool-resolver');
const { createTaskPlanner } = require('../../src/services/graph/task-planner');
const { validateIR, serializeIR, extractAllSteps, getIRStats } = require('../../src/services/graph/process-representation');
const { SoundnessChecker } = require('../../src/services/graph/soundness-checker');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK MCP TOOLS
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_MCP_TOOLS = [
    // Text processing
    { id: 'text.sanitize', name: 'text.sanitize', description: 'Sanitize text input' },
    { id: 'text.normalize', name: 'text.normalize', description: 'Normalize text' },
    { id: 'text.chunk', name: 'text.chunk', description: 'Split text into chunks' },

    // Extraction
    { id: 'extraction.entities', name: 'extraction.entities', description: 'Extract named entities' },
    { id: 'extraction.relations', name: 'extraction.relations', description: 'Extract relationships' },
    { id: 'extraction.keywords', name: 'extraction.keywords', description: 'Extract keywords' },

    // Vector operations
    { id: 'vector.embed', name: 'vector.embed', description: 'Generate embeddings' },
    { id: 'vector.search', name: 'vector.search', description: 'Vector similarity search' },
    { id: 'vector.write', name: 'vector.write', description: 'Write to vector store' },

    // Graph operations
    { id: 'graph.query', name: 'graph.query', description: 'Query graph database' },
    { id: 'graph.traverse', name: 'graph.traverse', description: 'Traverse graph' },
    { id: 'graph.create_node', name: 'graph.create_node', description: 'Create graph node' },
    { id: 'graph.create_edge', name: 'graph.create_edge', description: 'Create graph edge' },

    // AI/LLM
    { id: 'ai.generate', name: 'ai.generate', description: 'Generate text with AI' },
    { id: 'ai.classify', name: 'ai.classify', description: 'AI classification' },

    // Control flow
    { id: 'control.condition', name: 'control.condition', description: 'Conditional branch' },
    { id: 'control.parallel', name: 'control.parallel', description: 'Parallel execution' },

    // Primitives
    { id: 'primitive.get_value', name: 'primitive.get_value', description: 'Get value' },
    { id: 'primitive.set_value', name: 'primitive.set_value', description: 'Set value' },
    { id: 'primitive.transform', name: 'primitive.transform', description: 'Transform data' },

    // ADO specific
    { id: 'primitive.getWorkItem', name: 'primitive.getWorkItem', description: 'Get ADO work item' },
    { id: 'ado.fetchWorkItems', name: 'ado.fetchWorkItems', description: 'Fetch work items' },

    // Data operations
    { id: 'data.load', name: 'data.load', description: 'Load data' },
    { id: 'data.save', name: 'data.save', description: 'Save data' }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════════════

const TEST_CASES = [
    {
        prompt: 'Get work item #12345 from Azure DevOps',
        expectedDomain: 'devops',
        expectedIntent: 'read',
        minSteps: 1
    },
    {
        prompt: 'Ingest all work items from ADO project UNPA',
        expectedDomain: 'devops',
        expectedIntent: 'ingest',
        minSteps: 2
    },
    {
        prompt: 'Extract entities from the uploaded PDF',
        expectedDomain: 'knowledge',
        expectedIntent: 'extract',
        minSteps: 2
    },
    {
        prompt: 'Search for documents about peacekeeping missions',
        expectedDomain: 'knowledge',
        expectedIntent: 'read',
        minSteps: 1
    },
    {
        prompt: 'Build knowledge graph from extracted entities',
        expectedDomain: 'knowledge',
        expectedIntent: 'create',
        minSteps: 1
    },
    {
        prompt: 'Analyze compliance with ST/SGB/2019/8',
        expectedDomain: 'legal',
        expectedIntent: 'analyze',
        minSteps: 1
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Full SDA Pipeline Test Suite                           ║');
    console.log('║  Stage 1: IntentClassifier → Stage 2: ToolResolver →         ║');
    console.log('║  Stage 3: TaskPlanner → ProcessRepresentation (IR)           ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Initialize pipeline components
    const classifier = createIntentClassifier(null);
    const resolver = createToolResolver(null);
    const planner = createTaskPlanner({ useTemplates: true, validateOutput: true });
    const soundnessChecker = new SoundnessChecker();

    let passed = 0;
    let failed = 0;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Full Pipeline Tests');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const test of TEST_CASES) {
        try {
            console.log(`━━━ Testing: "${test.prompt.substring(0, 50)}${test.prompt.length > 50 ? '...' : ''}" ━━━\n`);

            // Stage 1: Intent Classification
            console.log('  Stage 1: Intent Classification');
            const intent = await classifier.classify(test.prompt);
            console.log(`    Domain: ${intent.domain} (expected: ${test.expectedDomain})`);
            console.log(`    Intent: ${intent.intent} (expected: ${test.expectedIntent})`);
            console.log(`    Confidence: ${(intent.confidence * 100).toFixed(0)}%`);

            // Stage 2: Tool Resolution
            console.log('\n  Stage 2: Tool Resolution');
            const resolved = resolver.resolve(intent, MOCK_MCP_TOOLS);
            console.log(`    Resolved: ${resolved.totalResolved}/${resolved.totalAvailable} tools`);
            console.log(`    Completeness: ${resolved.completeness.complete ? 'COMPLETE' : 'INCOMPLETE'}`);

            const roleSummary = Object.entries(resolved.byRole)
                .filter(([_, tools]) => tools.length > 0)
                .map(([role, tools]) => `${role}:${tools.length}`)
                .join(', ');
            console.log(`    Roles: ${roleSummary}`);

            // Stage 3: Task Planning
            console.log('\n  Stage 3: Task Planning');
            const ir = await planner.plan(intent, resolved, {});

            // Validate IR
            const validation = validateIR(ir);
            console.log(`    IR Valid: ${validation.valid}`);

            // Soundness check
            const soundness = soundnessChecker.quickCheck(ir);
            console.log(`    Soundness: ${soundness.sound ? 'SOUND' : 'UNSOUND'}`);

            // Get IR stats
            const stats = getIRStats(ir);
            console.log(`    Steps: ${stats.taskCount}`);
            console.log(`    Has Parallel: ${stats.hasParallel}`);
            console.log(`    Max Depth: ${stats.maxDepth}`);

            // Extract steps for display
            const allSteps = extractAllSteps(ir);
            console.log(`    Step IDs: ${allSteps.map(s => s.id).join(' → ')}`);

            // Check results
            const domainMatch = intent.domain === test.expectedDomain;
            const intentMatch = intent.intent === test.expectedIntent;
            const stepsOk = stats.taskCount >= test.minSteps;
            const irValid = validation.valid && soundness.sound;

            const success = domainMatch && intentMatch && stepsOk && irValid;
            const status = success ? '✅' : '⚠️';

            console.log(`\n  ${status} Result: ${success ? 'PASSED' : 'PARTIAL'}`);
            if (!domainMatch) console.log(`     - Domain mismatch`);
            if (!intentMatch) console.log(`     - Intent mismatch`);
            if (!stepsOk) console.log(`     - Not enough steps (got ${stats.taskCount}, expected >=${test.minSteps})`);
            if (!irValid) console.log(`     - IR validation failed`);
            console.log('');

            if (success) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
            console.log('');
            failed++;
        }
    }

    // Show planner statistics
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Task Planner Statistics');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const plannerStats = planner.getStats();
    console.log(`Total Plans: ${plannerStats.totalPlans}`);
    console.log(`Template Hits: ${plannerStats.templateHits} (${plannerStats.templateRate})`);
    console.log(`LLM Generations: ${plannerStats.llmGenerations}`);
    console.log(`Validation Failures: ${plannerStats.validationFailures}`);
    console.log(`Average Steps: ${plannerStats.avgSteps.toFixed(1)}`);

    // Show sample serialized IR
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Sample IR Serialization');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const sampleIntent = await classifier.classify('Ingest work items from ADO');
    const sampleResolved = resolver.resolve(sampleIntent, MOCK_MCP_TOOLS);
    const sampleIR = await planner.plan(sampleIntent, sampleResolved, {});
    const serialized = serializeIR(sampleIR);

    console.log('Serialized IR:');
    console.log(serialized.substring(0, 800) + (serialized.length > 800 ? '...' : ''));

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log(`║  Results: ${passed} passed, ${failed} failed                                  ║`);
    console.log(`║  Success Rate: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%                                          ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    return { passed, failed, total: TEST_CASES.length };
}

// Run tests
runTests()
    .then(({ passed, failed, total }) => {
        console.log(`\nSDA Pipeline test completed: ${passed}/${total} passed`);
        process.exit(failed > total / 2 ? 1 : 0);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
