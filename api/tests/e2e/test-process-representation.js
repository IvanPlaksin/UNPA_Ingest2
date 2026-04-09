/**
 * Test for POWL-like Process Representation (IR)
 *
 * Demonstrates the creation and validation of an Intermediate Representation
 * for a simple ingestion pipeline.
 */

'use strict';

const {
    createTaskStep,
    createSequence,
    createChoice,
    createParallel,
    createLoop,
    validateIR,
    topologicalSort,
    extractAllSteps,
    getExecutionLevels,
    getIRStats,
    serializeIR,
    deserializeIR,
    CAPABILITY_CATEGORIES
} = require('../../src/services/graph/process-representation');

const { SoundnessChecker } = require('../../src/services/graph/soundness-checker');

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE: Simple Ingestion Pipeline IR
// ═══════════════════════════════════════════════════════════════════════════

function createSimpleIngestionPipeline() {
    console.log('\n=== Creating Simple Ingestion Pipeline IR ===\n');

    // Step 1: Fetch data from source
    const fetchStep = createTaskStep({
        id: 'fetch_data',
        intent: 'Retrieve work items from Azure DevOps',
        capability: CAPABILITY_CATEGORIES.DATA_FETCH,
        inputs: ['START'],
        outputs: ['raw_workitems'],
        metadata: {
            outputType: 'json',
            suggestedTool: 'primitive.getWorkItem'
        }
    });

    // Step 2: Sanitize text
    const sanitizeStep = createTaskStep({
        id: 'sanitize_text',
        intent: 'Remove HTML and PII from text fields',
        capability: CAPABILITY_CATEGORIES.DATA_TRANSFORM,
        inputs: ['raw_workitems'],
        outputs: ['sanitized_text'],
        metadata: {
            inputType: 'json',
            outputType: 'text'
        }
    });

    // Step 3: Extract entities
    const extractStep = createTaskStep({
        id: 'extract_entities',
        intent: 'Extract named entities and concepts from text',
        capability: CAPABILITY_CATEGORIES.EXTRACTION,
        inputs: ['sanitized_text'],
        outputs: ['entities'],
        metadata: {
            inputType: 'text',
            outputType: 'entities'
        }
    });

    // Step 4 (parallel): Generate embeddings AND store to graph
    const embedStep = createTaskStep({
        id: 'generate_embeddings',
        intent: 'Create vector embeddings for entities',
        capability: CAPABILITY_CATEGORIES.EMBEDDING,
        inputs: ['entities'],
        outputs: ['vectors'],
        metadata: {
            inputType: 'entities',
            outputType: 'vector'
        }
    });

    const graphStep = createTaskStep({
        id: 'store_graph',
        intent: 'Store entities and relationships in graph database',
        capability: CAPABILITY_CATEGORIES.DATA_STORE,
        inputs: ['entities'],
        outputs: ['graph_result'],
        metadata: {
            inputType: 'entities',
            outputType: 'json'
        }
    });

    // Step 5: Store vectors
    const vectorStoreStep = createTaskStep({
        id: 'store_vectors',
        intent: 'Store embeddings in Qdrant',
        capability: CAPABILITY_CATEGORIES.DATA_STORE,
        inputs: ['vectors'],
        outputs: ['vector_result'],
        metadata: {
            inputType: 'vector',
            outputType: 'json'
        }
    });

    // Create the pipeline structure
    const pipeline = createSequence([
        fetchStep,
        sanitizeStep,
        extractStep,
        createParallel([
            createSequence([embedStep, vectorStoreStep]),
            graphStep
        ], 'parallel_storage')
    ], 'ingestion_pipeline');

    return pipeline;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE: Pipeline with Conditional Branch
// ═══════════════════════════════════════════════════════════════════════════

function createConditionalPipeline() {
    console.log('\n=== Creating Conditional Pipeline IR ===\n');

    const inputStep = createTaskStep({
        id: 'input',
        intent: 'Receive document for processing',
        capability: CAPABILITY_CATEGORIES.DATA_FETCH,
        inputs: ['START'],
        outputs: ['document']
    });

    const classifyStep = createTaskStep({
        id: 'classify',
        intent: 'Classify document type',
        capability: CAPABILITY_CATEGORIES.ANALYSIS,
        inputs: ['document'],
        outputs: ['classification']
    });

    // Branch for technical documents
    const techBranch = createSequence([
        createTaskStep({
            id: 'extract_code',
            intent: 'Extract code snippets',
            capability: CAPABILITY_CATEGORIES.EXTRACTION,
            inputs: ['document'],
            outputs: ['code_entities']
        }),
        createTaskStep({
            id: 'analyze_code',
            intent: 'Analyze code structure',
            capability: CAPABILITY_CATEGORIES.ANALYSIS,
            inputs: ['code_entities'],
            outputs: ['code_analysis']
        })
    ], 'tech_branch');

    // Branch for business documents
    const bizBranch = createSequence([
        createTaskStep({
            id: 'extract_business',
            intent: 'Extract business concepts',
            capability: CAPABILITY_CATEGORIES.EXTRACTION,
            inputs: ['document'],
            outputs: ['biz_entities']
        }),
        createTaskStep({
            id: 'analyze_business',
            intent: 'Analyze business rules',
            capability: CAPABILITY_CATEGORIES.ANALYSIS,
            inputs: ['biz_entities'],
            outputs: ['biz_analysis']
        })
    ], 'biz_branch');

    const choice = createChoice(
        [techBranch, bizBranch],
        {
            type: 'expression',
            expression: 'classification.type === "technical"',
            description: 'Route based on document classification'
        },
        'doc_type_choice'
    );

    const pipeline = createSequence([
        inputStep,
        classifyStep,
        choice
    ], 'conditional_pipeline');

    return pipeline;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXAMPLE: Pipeline with Loop
// ═══════════════════════════════════════════════════════════════════════════

function createLoopPipeline() {
    console.log('\n=== Creating Loop Pipeline IR ===\n');

    const initStep = createTaskStep({
        id: 'init_batch',
        intent: 'Initialize batch processing',
        capability: CAPABILITY_CATEGORIES.CONTROL_FLOW,
        inputs: ['START'],
        outputs: ['initial_state']
    });

    const fetchBatchStep = createTaskStep({
        id: 'fetch_batch',
        intent: 'Fetch next batch of items',
        capability: CAPABILITY_CATEGORIES.DATA_FETCH,
        inputs: ['initial_state'],
        outputs: ['batch_items']
    });

    const processStep = createTaskStep({
        id: 'process_batch',
        intent: 'Process batch items',
        capability: CAPABILITY_CATEGORIES.DATA_TRANSFORM,
        inputs: ['batch_items'],
        outputs: ['processed_batch']
    });

    const updateStateStep = createTaskStep({
        id: 'update_state',
        intent: 'Update batch state with progress',
        capability: CAPABILITY_CATEGORIES.CONTROL_FLOW,
        inputs: ['processed_batch'],
        outputs: ['updated_state']
    });

    const loopBody = createSequence([
        fetchBatchStep,
        processStep,
        updateStateStep
    ], 'batch_loop_body');

    const batchLoop = createLoop(
        loopBody,
        {
            type: 'expression',
            expression: 'updated_state.hasMore === true',
            maxIterations: 100,
            description: 'Continue while there are more batches'
        },
        'batch_processing_loop'
    );

    const finalizeStep = createTaskStep({
        id: 'finalize',
        intent: 'Finalize batch processing',
        capability: CAPABILITY_CATEGORIES.CONTROL_FLOW,
        inputs: ['updated_state'],
        outputs: ['final_result']
    });

    const pipeline = createSequence([
        initStep,
        batchLoop,
        finalizeStep
    ], 'batch_pipeline');

    return pipeline;
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║       Process Representation (IR) Test Suite                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');

    const checker = new SoundnessChecker();
    let passed = 0;
    let failed = 0;

    // Test 1: Simple Ingestion Pipeline
    console.log('\n--- Test 1: Simple Ingestion Pipeline ---');
    try {
        const pipeline = createSimpleIngestionPipeline();

        console.log('Steps extracted:', extractAllSteps(pipeline).map(s => s.id));

        const validation = validateIR(pipeline);
        console.log('Validation result:', validation.valid ? 'VALID' : 'INVALID');
        if (!validation.valid) {
            console.log('Errors:', validation.errors);
        }
        if (validation.warnings.length > 0) {
            console.log('Warnings:', validation.warnings);
        }

        const sorted = topologicalSort(pipeline);
        console.log('Topological order:', sorted.map(s => s.id));

        const levels = getExecutionLevels(pipeline);
        console.log('Execution levels:', levels.map(l => l.map(s => s.id)));

        const stats = getIRStats(pipeline);
        console.log('Stats:', stats);

        const soundness = checker.check(pipeline);
        console.log('Soundness:', soundness.sound ? 'SOUND' : 'UNSOUND');
        console.log('Metrics:', soundness.metrics);

        if (validation.valid && soundness.sound) {
            console.log('✅ Test 1 PASSED');
            passed++;
        } else {
            console.log('❌ Test 1 FAILED');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 1 ERROR:', error.message);
        failed++;
    }

    // Test 2: Conditional Pipeline
    console.log('\n--- Test 2: Conditional Pipeline ---');
    try {
        const pipeline = createConditionalPipeline();

        const validation = validateIR(pipeline);
        console.log('Validation result:', validation.valid ? 'VALID' : 'INVALID');
        if (validation.warnings.length > 0) {
            console.log('Warnings:', validation.warnings.map(w => w.message));
        }

        const soundness = checker.check(pipeline);
        console.log('Soundness:', soundness.sound ? 'SOUND' : 'UNSOUND');

        const stats = getIRStats(pipeline);
        console.log('Stats:', stats);

        if (validation.valid) {
            console.log('✅ Test 2 PASSED');
            passed++;
        } else {
            console.log('❌ Test 2 FAILED');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 2 ERROR:', error.message);
        failed++;
    }

    // Test 3: Loop Pipeline
    console.log('\n--- Test 3: Loop Pipeline ---');
    try {
        const pipeline = createLoopPipeline();

        const validation = validateIR(pipeline);
        console.log('Validation result:', validation.valid ? 'VALID' : 'INVALID');

        const soundness = checker.check(pipeline);
        console.log('Soundness:', soundness.sound ? 'SOUND' : 'UNSOUND');

        const stats = getIRStats(pipeline);
        console.log('Stats:', stats);

        if (validation.valid && soundness.sound) {
            console.log('✅ Test 3 PASSED');
            passed++;
        } else {
            console.log('❌ Test 3 FAILED');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 3 ERROR:', error.message);
        failed++;
    }

    // Test 4: Serialization/Deserialization
    console.log('\n--- Test 4: Serialization ---');
    try {
        const pipeline = createSimpleIngestionPipeline();
        const serialized = serializeIR(pipeline);
        console.log('Serialized length:', serialized.length, 'bytes');

        const deserialized = deserializeIR(serialized);
        const validation = validateIR(deserialized);

        if (validation.valid) {
            console.log('✅ Test 4 PASSED');
            passed++;
        } else {
            console.log('❌ Test 4 FAILED');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 4 ERROR:', error.message);
        failed++;
    }

    // Test 5: Invalid IR Detection
    console.log('\n--- Test 5: Invalid IR Detection ---');
    try {
        // Create an invalid step (missing required fields)
        const invalidStep = {
            id: 'invalid',
            // Missing intent and capability
            inputs: ['START'],
            outputs: ['result'],
            _type: 'TaskStep'
        };

        const invalidPipeline = createSequence([invalidStep]);
        const validation = validateIR(invalidPipeline);

        if (!validation.valid && validation.errors.length > 0) {
            console.log('Correctly detected errors:', validation.errors.map(e => e.type));
            console.log('✅ Test 5 PASSED');
            passed++;
        } else {
            console.log('❌ Test 5 FAILED - should have detected errors');
            failed++;
        }
    } catch (error) {
        console.log('❌ Test 5 ERROR:', error.message);
        failed++;
    }

    // Test 6: Quick Check
    console.log('\n--- Test 6: Quick Check Performance ---');
    try {
        const pipeline = createSimpleIngestionPipeline();

        const startTime = Date.now();
        for (let i = 0; i < 100; i++) {
            checker.quickCheck(pipeline);
        }
        const duration = Date.now() - startTime;

        console.log(`100 quick checks completed in ${duration}ms (avg: ${duration / 100}ms)`);
        console.log('✅ Test 6 PASSED');
        passed++;
    } catch (error) {
        console.log('❌ Test 6 ERROR:', error.message);
        failed++;
    }

    // Summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log(`║  Results: ${passed} passed, ${failed} failed                                  ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    return failed === 0;
}

// Run tests
runTests()
    .then(success => {
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Test suite error:', error);
        process.exit(1);
    });
