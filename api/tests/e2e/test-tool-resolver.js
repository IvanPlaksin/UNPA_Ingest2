/**
 * Test for Tool Resolver - SDA Stage 2
 *
 * Tests the full pipeline:
 * [prompt] → [IntentClassifier(S1)] → [ToolResolver(S2)] → [ResolvedToolSet]
 */

'use strict';

const { createIntentClassifier } = require('../../src/services/graph/intent-classifier');
const { createToolResolver, TOOL_ROLES } = require('../../src/services/graph/tool-resolver');

// ═══════════════════════════════════════════════════════════════════════════
// MOCK MCP TOOLS (simulating real MCP registry)
// ═══════════════════════════════════════════════════════════════════════════

const MOCK_MCP_TOOLS = [
    // Text processing
    { id: 'text.sanitize', name: 'text.sanitize', description: 'Sanitize text input' },
    { id: 'text.normalize', name: 'text.normalize', description: 'Normalize text' },
    { id: 'text.chunk', name: 'text.chunk', description: 'Split text into chunks' },
    { id: 'text.tokenize', name: 'text.tokenize', description: 'Tokenize text' },
    { id: 'text.summarize', name: 'text.summarize', description: 'Summarize text' },
    { id: 'text.detect_language', name: 'text.detect_language', description: 'Detect text language' },

    // Extraction
    { id: 'extraction.entities', name: 'extraction.entities', description: 'Extract named entities' },
    { id: 'extraction.relations', name: 'extraction.relations', description: 'Extract relationships' },
    { id: 'extraction.keywords', name: 'extraction.keywords', description: 'Extract keywords' },
    { id: 'extraction.intent', name: 'extraction.intent', description: 'Classify intent' },
    { id: 'extraction.sentiment', name: 'extraction.sentiment', description: 'Analyze sentiment' },
    { id: 'extraction.topics', name: 'extraction.topics', description: 'Extract topics' },

    // Vector operations
    { id: 'vector.embed', name: 'vector.embed', description: 'Generate embeddings' },
    { id: 'vector.batch_embed', name: 'vector.batch_embed', description: 'Batch embeddings' },
    { id: 'vector.search', name: 'vector.search', description: 'Vector similarity search' },
    { id: 'vector.similarity', name: 'vector.similarity', description: 'Calculate similarity' },
    { id: 'vector.write', name: 'vector.write', description: 'Write to vector store' },
    { id: 'vector.delete', name: 'vector.delete', description: 'Delete from vector store' },

    // Graph operations
    { id: 'graph.query', name: 'graph.query', description: 'Query graph database' },
    { id: 'graph.traverse', name: 'graph.traverse', description: 'Traverse graph' },
    { id: 'graph.find_path', name: 'graph.find_path', description: 'Find path in graph' },
    { id: 'graph.create_node', name: 'graph.create_node', description: 'Create graph node' },
    { id: 'graph.create_edge', name: 'graph.create_edge', description: 'Create graph edge' },
    { id: 'graph.update_node', name: 'graph.update_node', description: 'Update graph node' },
    { id: 'graph.merge_nodes', name: 'graph.merge_nodes', description: 'Merge graph nodes' },
    { id: 'graph.delete_node', name: 'graph.delete_node', description: 'Delete graph node' },

    // AI/LLM
    { id: 'ai.generate', name: 'ai.generate', description: 'Generate text with AI' },
    { id: 'ai.chat', name: 'ai.chat', description: 'Chat completion' },
    { id: 'ai.classify', name: 'ai.classify', description: 'AI classification' },
    { id: 'ai.structured_output', name: 'ai.structured_output', description: 'Structured AI output' },
    { id: 'ai.gnn_predict_links', name: 'ai.gnn_predict_links', description: 'GNN link prediction' },
    { id: 'ai.gnn_classify_nodes', name: 'ai.gnn_classify_nodes', description: 'GNN node classification' },

    // Control flow
    { id: 'control.condition', name: 'control.condition', description: 'Conditional branch' },
    { id: 'control.switch', name: 'control.switch', description: 'Switch statement' },
    { id: 'control.parallel', name: 'control.parallel', description: 'Parallel execution' },
    { id: 'control.loop', name: 'control.loop', description: 'Loop execution' },
    { id: 'control.try_catch', name: 'control.try_catch', description: 'Error handling' },
    { id: 'control.if', name: 'control.if', description: 'If condition' },
    { id: 'control.fork', name: 'control.fork', description: 'Fork execution' },
    { id: 'control.join', name: 'control.join', description: 'Join parallel paths' },

    // Primitives
    { id: 'primitive.get_value', name: 'primitive.get_value', description: 'Get value' },
    { id: 'primitive.set_value', name: 'primitive.set_value', description: 'Set value' },
    { id: 'primitive.transform', name: 'primitive.transform', description: 'Transform data' },
    { id: 'primitive.filter', name: 'primitive.filter', description: 'Filter data' },
    { id: 'primitive.map', name: 'primitive.map', description: 'Map data' },
    { id: 'primitive.reduce', name: 'primitive.reduce', description: 'Reduce data' },
    { id: 'primitive.merge', name: 'primitive.merge', description: 'Merge data' },
    { id: 'primitive.log', name: 'primitive.log', description: 'Log message' },
    { id: 'primitive.checkpoint', name: 'primitive.checkpoint', description: 'Save checkpoint' },
    { id: 'primitive.emit_event', name: 'primitive.emit_event', description: 'Emit event' },

    // ADO specific
    { id: 'primitive.getWorkItem', name: 'primitive.getWorkItem', description: 'Get ADO work item' },
    { id: 'primitive.fetchAndIngestADO', name: 'primitive.fetchAndIngestADO', description: 'Fetch and ingest from ADO' },
    { id: 'ado.fetchWorkItems', name: 'ado.fetchWorkItems', description: 'Fetch work items' },
    { id: 'ado.createWorkItem', name: 'ado.createWorkItem', description: 'Create work item' },
    { id: 'ado.updateWorkItem', name: 'ado.updateWorkItem', description: 'Update work item' },

    // Data operations
    { id: 'data.save', name: 'data.save', description: 'Save data' },
    { id: 'data.load', name: 'data.load', description: 'Load data' }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════════════════

const TEST_CASES = [
    {
        prompt: 'Get work item #12345 from Azure DevOps',
        expectedDomain: 'devops',
        expectedIntent: 'read',
        expectedRoles: ['INPUT', 'SEARCH']
    },
    {
        prompt: 'Ingest all work items from ADO project UNPA',
        expectedDomain: 'devops',
        expectedIntent: 'ingest',
        expectedRoles: ['INPUT', 'PROCESS', 'STORE']
    },
    {
        prompt: 'Extract entities from the uploaded PDF',
        expectedDomain: 'knowledge',
        expectedIntent: 'extract',
        expectedRoles: ['INPUT', 'PROCESS']
    },
    {
        prompt: 'Search for documents about peacekeeping missions',
        expectedDomain: 'knowledge',
        expectedIntent: 'read',
        expectedRoles: ['SEARCH']
    },
    {
        prompt: 'Build knowledge graph from extracted entities',
        expectedDomain: 'knowledge',
        expectedIntent: 'create',
        expectedRoles: ['STORE']
    },
    {
        prompt: 'Analyze compliance with ST/SGB/2019/8',
        expectedDomain: 'legal',
        expectedIntent: 'analyze',
        expectedRoles: ['ANALYZE']
    },
    {
        prompt: 'Compare budget allocations between DPKO and DFS',
        expectedDomain: 'finance',
        expectedIntent: 'compare',
        expectedRoles: ['SEARCH', 'ANALYZE']
    }
];

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Tool Resolver Test Suite (SDA Stage 2)                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const classifier = createIntentClassifier(null);
    const resolver = createToolResolver(null);

    console.log('\n--- Available Roles ---');
    console.log(resolver.getAvailableRoles().join(', '));

    console.log('\n--- Available Capabilities ---');
    console.log(resolver.getAvailableCapabilities().join(', '));

    const stats = resolver.getCapabilityStats();
    console.log(`\n--- Capability Stats ---`);
    console.log(`Total capabilities: ${stats.totalCapabilities}`);
    console.log(`Total tool mappings: ${stats.totalToolMappings}`);

    let passed = 0;
    let failed = 0;

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('Full Pipeline Tests: Classify → Resolve');
    console.log('═══════════════════════════════════════════════════════════════\n');

    for (const test of TEST_CASES) {
        try {
            // Stage 1: Intent Classification
            const intent = await classifier.classify(test.prompt);

            // Stage 2: Tool Resolution
            const resolved = resolver.resolve(intent, MOCK_MCP_TOOLS);

            const hasExpectedRoles = test.expectedRoles.every(role =>
                resolved.byRole[role]?.length > 0
            );

            const status = hasExpectedRoles ? '✅' : '⚠️';

            console.log(`${status} "${test.prompt.substring(0, 50)}${test.prompt.length > 50 ? '...' : ''}"`);
            console.log(`   Intent: ${intent.domain}/${intent.intent} (confidence: ${(intent.confidence * 100).toFixed(0)}%)`);
            console.log(`   Resolved: ${resolved.totalResolved}/${resolved.totalAvailable} tools (${(resolved.filterRatio * 100).toFixed(0)}% of total)`);
            console.log(`   Completeness: ${resolved.completeness.complete ? 'COMPLETE' : 'INCOMPLETE'} (score: ${(resolved.completeness.score * 100).toFixed(0)}%)`);

            // Show tools by role
            const roleSummary = Object.entries(resolved.byRole)
                .filter(([_, tools]) => tools.length > 0)
                .map(([role, tools]) => `${role}:${tools.length}`)
                .join(', ');
            console.log(`   Roles: ${roleSummary}`);

            if (!resolved.completeness.complete) {
                console.log(`   Missing: ${resolved.missingCapabilities.join(', ')}`);
            }

            // Show expected roles check
            console.log(`   Expected roles [${test.expectedRoles.join(', ')}]: ${hasExpectedRoles ? '✓' : '✗'}`);
            console.log('');

            if (hasExpectedRoles && resolved.completeness.score >= 0.8) {
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

    // Test prompt formatting
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('Prompt Formatting Test');
    console.log('═══════════════════════════════════════════════════════════════\n');

    const sampleIntent = await classifier.classify('Ingest all work items from ADO');
    const sampleResolved = resolver.resolve(sampleIntent, MOCK_MCP_TOOLS);

    console.log('Generated LLM Prompt:');
    console.log('---');
    console.log(sampleResolved.forPrompt.substring(0, 1000) + (sampleResolved.forPrompt.length > 1000 ? '...' : ''));
    console.log('---\n');

    // Summary
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log(`║  Results: ${passed} passed, ${failed} failed                                  ║`);
    console.log(`║  Success Rate: ${((passed / TEST_CASES.length) * 100).toFixed(1)}%                                          ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    // Tool reduction analysis
    console.log('\n--- Tool Reduction Analysis ---');
    let totalReduction = 0;
    for (const test of TEST_CASES) {
        const intent = await classifier.classify(test.prompt);
        const resolved = resolver.resolve(intent, MOCK_MCP_TOOLS);
        totalReduction += (1 - resolved.filterRatio);
    }
    const avgReduction = (totalReduction / TEST_CASES.length) * 100;
    console.log(`Average tool reduction: ${avgReduction.toFixed(1)}%`);
    console.log(`Total mock tools: ${MOCK_MCP_TOOLS.length}`);

    return { passed, failed, total: TEST_CASES.length };
}

// Run tests
runTests()
    .then(({ passed, failed, total }) => {
        console.log(`\nTest completed: ${passed}/${total} passed`);
        process.exit(failed > total / 2 ? 1 : 0);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
