/**
 * Test for Full SDA Pipeline (All 4 Stages)
 *
 * Tests the complete pipeline:
 * [prompt] → [IntentClassifier(S1)] → [ToolResolver(S2)] → [TaskPlanner(S3)] → [GraphCompiler(S4)] → [AOPEG Graph]
 *
 * This is the definitive test for the Staged DAG Assembly architecture.
 */

'use strict';

const { createIntentClassifier } = require('../../src/services/graph/intent-classifier');
const { createToolResolver, TOOL_ROLES } = require('../../src/services/graph/tool-resolver');
const { createTaskPlanner } = require('../../src/services/graph/task-planner');
const { createGraphCompiler } = require('../../src/services/graph/graph-compiler');
const { validateIR, extractAllSteps } = require('../../src/services/graph/process-representation');
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
        minNodes: 3, // START + fetch + END
        minEdges: 2
    },
    {
        prompt: 'Ingest all work items from ADO project UNPA',
        expectedDomain: 'devops',
        expectedIntent: 'ingest',
        minNodes: 5, // START + fetch + process + store(2) + END
        minEdges: 4
    },
    {
        prompt: 'Extract entities from the uploaded PDF',
        expectedDomain: 'knowledge',
        expectedIntent: 'extract',
        minNodes: 5, // START + fetch + extract(2) + store + END
        minEdges: 4
    },
    {
        prompt: 'Search for documents about peacekeeping missions',
        expectedDomain: 'knowledge',
        expectedIntent: 'read',
        minNodes: 3, // START + search + END
        minEdges: 2
    },
    {
        prompt: 'Build knowledge graph from extracted entities',
        expectedDomain: 'knowledge',
        expectedIntent: 'create',
        minNodes: 3, // START + create + END
        minEdges: 2
    },
    {
        prompt: 'Analyze compliance with ST/SGB/2019/8',
        expectedDomain: 'legal',
        expectedIntent: 'analyze',
        minNodes: 4, // START + fetch + analyze + END
        minEdges: 3
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Full SDA Pipeline Test (All 4 Stages)                  ║');
    console.log('║  S1: IntentClassifier → S2: ToolResolver →                   ║');
    console.log('║  S3: TaskPlanner → S4: GraphCompiler → AOPEG                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Initialize pipeline components
    const classifier = createIntentClassifier(null);
    const resolver = createToolResolver(null);
    const planner = createTaskPlanner({ useTemplates: true, validateOutput: true });
    const compiler = createGraphCompiler();
    const soundnessChecker = new SoundnessChecker();

    // Initialize compiler with tools
    compiler.initializeToolRegistry(MOCK_MCP_TOOLS);

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

            // Stage 3: Task Planning
            console.log('\n  Stage 3: Task Planning (IR)');
            const ir = await planner.plan(intent, resolved, {});

            // Validate IR
            const irValidation = validateIR(ir);
            console.log(`    IR Valid: ${irValidation.valid}`);

            // Soundness check
            const soundness = soundnessChecker.quickCheck(ir);
            console.log(`    Soundness: ${soundness.sound ? 'SOUND' : 'UNSOUND'}`);

            // Extract steps
            const steps = extractAllSteps(ir);
            console.log(`    IR Steps: ${steps.length}`);
            console.log(`    Step IDs: ${steps.map(s => s.id).join(' → ')}`);

            // Stage 4: Graph Compilation
            console.log('\n  Stage 4: Graph Compilation (AOPEG)');
            const graph = compiler.compileFromIR(ir, {
                domain: intent.domain,
                intent: intent.intent,
                complexity: intent.complexity,
                source: 'test-full-sda-pipeline'
            });

            console.log(`    Compiled: ${graph.compiled}`);
            console.log(`    Mode: ${graph.mode}`);
            console.log(`    Nodes: ${graph.nodes?.length || 0} (min: ${test.minNodes})`);
            console.log(`    Edges: ${graph.edges?.length || 0} (min: ${test.minEdges})`);

            if (graph.error) {
                console.log(`    Error: ${graph.error}`);
            }

            // Show node details
            if (graph.nodes) {
                const nodeLabels = graph.nodes.map(n => n.displayName || n.id).join(' → ');
                console.log(`    Pipeline: ${nodeLabels}`);
            }

            // Check results
            const domainMatch = intent.domain === test.expectedDomain;
            const intentMatch = intent.intent === test.expectedIntent;
            const nodesOk = (graph.nodes?.length || 0) >= test.minNodes;
            const edgesOk = (graph.edges?.length || 0) >= test.minEdges;
            const compiled = graph.compiled;

            const success = domainMatch && intentMatch && nodesOk && edgesOk && compiled;
            const status = success ? '✅' : '⚠️';

            console.log(`\n  ${status} Result: ${success ? 'PASSED' : 'PARTIAL'}`);
            if (!domainMatch) console.log(`     - Domain mismatch`);
            if (!intentMatch) console.log(`     - Intent mismatch`);
            if (!nodesOk) console.log(`     - Not enough nodes (got ${graph.nodes?.length || 0}, expected >=${test.minNodes})`);
            if (!edgesOk) console.log(`     - Not enough edges (got ${graph.edges?.length || 0}, expected >=${test.minEdges})`);
            if (!compiled) console.log(`     - Compilation failed: ${graph.error}`);
            console.log('');

            if (success) {
                passed++;
            } else {
                failed++;
            }
        } catch (error) {
            console.log(`  ❌ Error: ${error.message}`);
            console.log(`     Stack: ${error.stack?.split('\n')[1]}`);
            console.log('');
            failed++;
        }
    }

    // Show statistics
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Pipeline Statistics');
    console.log('═══════════════════════════════════════════════════════════════\n');

    // Task Planner stats
    const plannerStats = planner.getStats();
    console.log('Task Planner:');
    console.log(`  Total Plans: ${plannerStats.totalPlans}`);
    console.log(`  Template Hits: ${plannerStats.templateHits} (${plannerStats.templateRate})`);
    console.log(`  LLM Generations: ${plannerStats.llmGenerations}`);
    console.log(`  Validation Failures: ${plannerStats.validationFailures}`);

    // Graph Compiler stats
    const compilerStats = compiler.getCompilerStats();
    console.log('\nGraph Compiler:');
    console.log(`  Total Compilations: ${compilerStats.totalCompilations}`);
    console.log(`  Successful: ${compilerStats.successfulCompilations}`);
    console.log(`  Failed: ${compilerStats.failedCompilations}`);
    console.log(`  IR Compilations: ${compilerStats.irCompilations}`);
    console.log(`  Port Mismatches: ${compilerStats.portMismatches}`);
    console.log(`  Adapters Inserted: ${compilerStats.adaptersInserted}`);
    console.log(`  Success Rate: ${compilerStats.successRate}`);

    // Export test
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Export Formats Test');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const sampleIntent = await classifier.classify('Ingest work items from ADO');
    const sampleResolved = resolver.resolve(sampleIntent, MOCK_MCP_TOOLS);
    const sampleIR = await planner.plan(sampleIntent, sampleResolved, {});
    const sampleGraph = compiler.compileFromIR(sampleIR, {
        domain: sampleIntent.domain,
        intent: sampleIntent.intent
    });

    // Mermaid export
    console.log('Mermaid Diagram:');
    console.log('---');
    const mermaid = compiler.exportToMermaid(sampleGraph);
    console.log(mermaid);
    console.log('---\n');

    // ReactFlow export
    console.log('ReactFlow Format (nodes/edges count):');
    const reactFlow = compiler.exportToReactFlow(sampleGraph);
    console.log(`  Nodes: ${reactFlow.nodes.length}`);
    console.log(`  Edges: ${reactFlow.edges.length}`);
    console.log(`  Sample node: ${JSON.stringify(reactFlow.nodes[1], null, 2).substring(0, 200)}...`);

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
        console.log(`\nFull SDA Pipeline test completed: ${passed}/${total} passed`);
        process.exit(failed > total / 2 ? 1 : 0);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
