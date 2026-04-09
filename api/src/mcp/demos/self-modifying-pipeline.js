/**
 * GXE Self-Modifying Pipeline Demo
 *
 * This demo showcases the self-evolving capabilities of GXE:
 * 1. System introspects its own capabilities
 * 2. Creates a new custom tool dynamically
 * 3. Builds an optimized pipeline
 * 4. Executes and monitors the pipeline
 * 5. Adapts based on results
 */

const { createGXEServer } = require('../index.js');
const { ToolExecutionContext } = require('../server/ToolExecutionContext.js');

async function runSelfModifyingDemo() {
  console.log('\n=== GXE Self-Modifying Pipeline Demo ===\n');

  // Initialize server
  const server = await createGXEServer();
  const context = new ToolExecutionContext();

  console.log(`Initialized with ${server.registry.listTools().length} tools\n`);

  // ========================================
  // Phase 1: System Introspection
  // ========================================
  console.log('--- Phase 1: System Introspection ---\n');

  const introspectTool = server.registry.getTool('meta.introspect');
  const capabilitiesResult = await introspectTool.execute({
    target: 'capabilities'
  }, context, server);

  console.log('System Capabilities:');
  console.log(`  Categories: ${capabilitiesResult.data.data.categories.join(', ')}`);
  console.log(`  Levels: ${capabilitiesResult.data.data.levels.join(', ')}`);
  console.log(`  Has AI: ${capabilitiesResult.data.data.features.hasAI}`);
  console.log(`  Has Graph: ${capabilitiesResult.data.data.features.hasGraph}`);
  console.log(`  Has Vector: ${capabilitiesResult.data.data.features.hasVector}`);
  console.log(`  Can Self-Modify: ${capabilitiesResult.data.data.features.canSelfModify}\n`);

  // ========================================
  // Phase 2: Dynamic Tool Creation
  // ========================================
  console.log('--- Phase 2: Dynamic Tool Creation ---\n');

  const createToolTool = server.registry.getTool('meta.create_tool');

  // Create a custom text analyzer tool
  const newToolResult = await createToolTool.execute({
    definition: {
      id: 'text.analyze_sentiment',
      name: 'Sentiment Analyzer',
      description: 'Analyze text sentiment using keyword matching',
      category: 'text'
    },
    implementation: {
      type: 'pipeline',
      pipeline: [
        { tool: 'text.normalize', args: { operations: ['lowercase'] } },
        { tool: 'text.tokenize', args: { mode: 'words' } },
        { tool: 'text.extract_keywords', args: {} }
      ]
    }
  }, context, server);

  console.log(`Created new tool: ${newToolResult.data.toolId}`);
  console.log(`Registered: ${newToolResult.data.registered}\n`);

  // Verify tool was created
  const updatedCount = server.registry.listTools().length;
  console.log(`Total tools now: ${updatedCount}\n`);

  // ========================================
  // Phase 3: Pipeline Definition & Optimization
  // ========================================
  console.log('--- Phase 3: Pipeline Optimization ---\n');

  const optimizeTool = server.registry.getTool('meta.optimize');

  // Define a complex pipeline
  const pipeline = [
    { id: 'input_normalize', tool: 'text.normalize', inputs: [], args: { operations: ['lowercase', 'trim'] } },
    { id: 'extract_keywords', tool: 'text.extract_keywords', inputs: ['input_normalize'] },
    { id: 'generate_hash', tool: 'text.hash', inputs: ['input_normalize'] },
    { id: 'tokenize', tool: 'text.tokenize', inputs: ['input_normalize'], args: { mode: 'words' } },
    { id: 'ai_analyze', tool: 'ai.classify', inputs: ['extract_keywords'], args: { categories: ['positive', 'negative', 'neutral'] } }
  ];

  const optimizationResult = await optimizeTool.execute({
    pipeline,
    optimizations: ['parallelize', 'dedupe', 'cache', 'reorder']
  }, context, server);

  console.log('Pipeline Analysis:');
  console.log(`  Original stages: ${optimizationResult.data.original.stages}`);
  console.log(`  Parallel groups: ${optimizationResult.data.analysis.parallelGroups}`);
  console.log(`  Max parallelism: ${optimizationResult.data.analysis.maxParallelism}`);
  console.log(`  Estimated speedup: ${optimizationResult.data.estimatedSpeedup}x`);
  console.log('\nOptimizations Applied:');
  optimizationResult.data.improvements.forEach(imp => {
    console.log(`  - ${imp.type}: ${imp.description} (Impact: ${imp.impactEstimate})`);
  });
  console.log();

  // ========================================
  // Phase 4: Execute Optimized Pipeline
  // ========================================
  console.log('--- Phase 4: Pipeline Execution ---\n');

  const pipelineTool = server.registry.getTool('pattern.pipeline');
  const testText = '  The new product launch was AMAZING! Customers loved it and sales exceeded expectations.  ';

  console.log(`Input text: "${testText.trim()}"\n`);

  const executionResult = await pipelineTool.execute({
    stages: [
      { id: 'normalize', tool: 'text.normalize', args: { text: testText, operations: ['lowercase', 'trim'] }, inputs: [] },
      { id: 'keywords', tool: 'text.extract_keywords', args: { text: testText.toLowerCase().trim() }, inputs: ['normalize'] },
      { id: 'hash', tool: 'text.hash', args: { text: testText.toLowerCase().trim() }, inputs: ['normalize'] },
      { id: 'tokens', tool: 'text.tokenize', args: { text: testText.toLowerCase().trim(), mode: 'words' }, inputs: ['normalize'] }
    ],
    input: { text: testText }
  }, context, server);

  console.log('Execution Results:');
  console.log(`  Execution order: ${executionResult.data.executionOrder.join(' -> ')}`);
  console.log(`  Duration: ${executionResult.data.stats.durationMs}ms`);
  console.log(`  Normalized: "${executionResult.data.stageOutputs.normalize.text}"`);
  console.log(`  Keywords: ${executionResult.data.stageOutputs.keywords.keywords.slice(0, 5).join(', ')}`);
  console.log(`  Hash: ${executionResult.data.stageOutputs.hash.hash.substring(0, 16)}...`);
  console.log(`  Token count: ${executionResult.data.stageOutputs.tokens.tokens.length}\n`);

  // ========================================
  // Phase 5: Tool Composition
  // ========================================
  console.log('--- Phase 5: Tool Composition ---\n');

  const composeTool = server.registry.getTool('meta.compose');

  // Compose tools for parallel analysis
  const composeResult = await composeTool.execute({
    name: 'parallel-text-analysis',
    tools: [
      { tool: 'text.hash', args: { text: 'test composition' } },
      { tool: 'text.tokenize', args: { text: 'test composition', mode: 'words' } },
      { tool: 'text.extract_keywords', args: { text: 'test composition analysis' } }
    ],
    mode: 'parallel'
  }, context, server);

  console.log('Composition Result:');
  console.log(`  Tools composed: ${composeResult.data.toolCount}`);
  console.log(`  Results: ${Object.keys(composeResult.data.result || {}).join(', ')}\n`);

  // ========================================
  // Phase 6: Sandboxed Execution
  // ========================================
  console.log('--- Phase 6: Sandboxed Execution ---\n');

  const sandboxTool = server.registry.getTool('meta.sandbox');

  const sandboxResult = await sandboxTool.execute({
    tool: 'text.normalize',
    args: { text: 'SANDBOX TEST', operations: ['lowercase'] },
    isolation: 'full',
    timeout: 5000,
    captureOutput: true
  }, context, server);

  console.log('Sandbox Execution:');
  console.log(`  Isolated: ${sandboxResult.data.sandbox.isolated}`);
  console.log(`  Duration: ${sandboxResult.data.sandbox.duration}ms`);
  console.log(`  Result: "${sandboxResult.data.result.text}"`);
  console.log(`  State changes: ${sandboxResult.data.sandbox.stateChanges.length}\n`);

  // ========================================
  // Phase 7: Validate Tool Definition
  // ========================================
  console.log('--- Phase 7: Tool Validation ---\n');

  const validateTool = server.registry.getTool('meta.validate_tool');

  const validationResult = await validateTool.execute({
    definition: {
      id: 'test.custom_tool',
      name: 'Custom Tool',
      version: '1.0.0',
      level: 2,
      category: 'text',
      description: 'A custom tool definition',
      inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
      outputSchema: { type: 'object' },
      safetyLevel: 'AUTO',
      sideEffects: []
    }
  }, context, server);

  console.log('Validation Result:');
  console.log(`  Valid: ${validationResult.data.valid}`);
  console.log(`  Errors: ${validationResult.data.errors.length}`);
  console.log(`  Warnings: ${validationResult.data.warnings.length}\n`);

  // ========================================
  // Summary
  // ========================================
  console.log('=== Demo Complete ===\n');
  console.log('This demo showcased GXE\'s self-modifying capabilities:');
  console.log('  1. Introspected system to understand capabilities');
  console.log('  2. Dynamically created a new tool at runtime');
  console.log('  3. Optimized a pipeline for parallel execution');
  console.log('  4. Executed the pipeline and collected results');
  console.log('  5. Composed tools for parallel analysis');
  console.log('  6. Ran tools in isolated sandbox');
  console.log('  7. Validated tool definitions');
  console.log('\nGXE can adapt and evolve its capabilities during runtime!');
}

// Run demo
runSelfModifyingDemo()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Demo failed:', error);
    process.exit(1);
  });
