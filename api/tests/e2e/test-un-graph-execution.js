/**
 * E2E test: UN Country Humanitarian Assessment Pipeline execution
 */
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });
require('dotenv').config();

async function test() {
  const { pluginRegistry } = require('../../src/core/aopeg/registry/plugin-registry');
  const { initializeAOPEG } = require('../../src/core/aopeg/index');
  const { AOPEGAdapter } = require('../../src/runtime/integration/AOPEGAdapter');
  const { RuntimeEngine } = require('../../src/runtime/RuntimeEngine');

  await initializeAOPEG({ loadPlugins: true, loadDomainPlugins: false, loadToolPlugins: true });

  const adapter = new AOPEGAdapter(pluginRegistry);
  const mcpRegistry = adapter.createMcpCompatibleRegistry();

  // Load graph from Memgraph
  const { graphCatalogService } = require('../../src/services/graphCatalog.service');
  const existing = await graphCatalogService.listGraphs({ search: 'UN Country Humanitarian' });
  if (!existing.data || existing.data.length === 0) {
    console.log('Graph not found in DB');
    process.exit(1);
  }
  const graph = existing.data[0];
  console.log('Graph:', graph.name, '(' + graph.id + ')');

  const nodes = typeof graph.nodes === 'string' ? JSON.parse(graph.nodes) : graph.nodes;
  const edges = typeof graph.edges === 'string' ? JSON.parse(graph.edges) : graph.edges;

  // Filter like execution.js does
  const executableNodes = nodes.filter(n => !n.data?.isToolRef);
  const dataFlowEdges = edges.filter(e => e.label !== 'USES_TOOL');

  console.log('Executable nodes:', executableNodes.length);
  console.log('Data flow edges:', dataFlowEdges.length);

  // Build DAG like execution.js
  const dag = {
    nodes: executableNodes.map(n => ({
      id: n.id,
      executorType: n.data?.executorType || n.data?.toolId || n.data?.kind || 'common.passthrough',
      parameters: n.data?.parameters || n.data?.params || {},
      data: n.data,
    })),
    edges: dataFlowEdges,
  };

  // Check edges format
  console.log('\nSample edge:', JSON.stringify(dag.edges[0]));
  console.log('Sample node:', dag.nodes[0].id, '->', dag.nodes[0].executorType);

  // Check all tools resolve
  console.log('\n--- Tool Resolution ---');
  for (const n of dag.nodes) {
    const tool = mcpRegistry.getTool(n.executorType);
    console.log('  ' + n.id + ' (' + n.executorType + '): ' + (tool ? 'OK' : 'NOT FOUND'));
  }

  // Execute
  const engine = new RuntimeEngine(mcpRegistry, {
    schedulingStrategy: 'SEQUENTIAL',
    errorStrategy: 'CONTINUE_ON_ERROR',
    nodeTimeoutMs: 120000,
    enableValidation: false,
  });

  engine.on('node:stateChange', (d) => {
    if (d.to === 'EXECUTING' || d.to === 'SUCCEEDED' || d.to === 'FAILED') {
      console.log('>> ' + d.nodeId + ': ' + d.to);
    }
  });
  engine.on('node:failed', (d) => console.log('!! FAILED ' + d.nodeId + ': ' + d.error));
  engine.on('execution:completed', () => console.log('>> EXECUTION COMPLETED'));
  engine.on('execution:failed', () => console.log('>> EXECUTION FAILED'));

  console.log('\nStarting execution...');
  const result = await engine.execute(dag, {
    reportPath: 'field-reports/south-sudan-assessment.txt',
    countryName: 'South Sudan'
  });

  console.log('\n=== RESULT ===');
  console.log('Status:', result.status);
  console.log('Succeeded:', result.metrics?.nodesSucceeded);
  console.log('Failed:', result.metrics?.nodesFailed);

  if (result.nodeResults) {
    for (const [nodeId, nr] of Object.entries(result.nodeResults)) {
      const preview = nr.output ? JSON.stringify(nr.output).substring(0, 120) : '';
      console.log('  ' + nodeId + ': ' + nr.status + (nr.error ? ' -> ' + nr.error : '') + (preview ? ' => ' + preview : ''));
    }
  }

  process.exit(0);
}

test().catch(e => {
  console.error('FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
