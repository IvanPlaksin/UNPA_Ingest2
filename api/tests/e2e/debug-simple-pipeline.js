/**
 * Debug pipeline execution - stress test DAG
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { RuntimeEngine, DEFAULT_CONFIG } = require('../../src/runtime');
const { AOPEGAdapter } = require('../../src/runtime/integration');
const { initializeAOPEG, pluginRegistry } = require('../../src/core/aopeg/index');

async function test() {
  await initializeAOPEG({ loadPlugins: true, loadDomainPlugins: true });

  const adapter = new AOPEGAdapter(pluginRegistry);
  const mcpRegistry = adapter.createMcpCompatibleRegistry();

  // Stress test DAG with parallel branches
  const dag = {
    id: 'stress-test-ingestion-pipeline',
    nodes: [
      { id: 'parse', executorType: 'ingestion.parse_document', parameters: { mimeType: 'text/html' } },
      { id: 'sanitize', executorType: 'ingestion.sanitize', parameters: { removeHtml: true, normalizeWhitespace: true } },
      { id: 'detect-lang', executorType: 'ingestion.detect_language', parameters: {} },
      { id: 'chunk', executorType: 'ingestion.chunk_text', parameters: { maxTokens: 512, overlapTokens: 50 } },
      { id: 'extract', executorType: 'ingestion.extract_entities', parameters: { useLLM: false, useRegex: true } },
      { id: 'classify', executorType: 'ingestion.classify_content', parameters: {} }
    ],
    edges: [
      { id: 'e1', sourceNodeId: 'parse', targetNodeId: 'sanitize' },
      { id: 'e2', sourceNodeId: 'sanitize', targetNodeId: 'detect-lang' },
      { id: 'e3', sourceNodeId: 'sanitize', targetNodeId: 'chunk' },
      { id: 'e4', sourceNodeId: 'chunk', targetNodeId: 'extract' },
      { id: 'e5', sourceNodeId: 'extract', targetNodeId: 'classify' }
    ],
    entryNodeId: 'parse',
    exitNodeIds: ['detect-lang', 'classify']
  };

  const engine = new RuntimeEngine(mcpRegistry, {
    ...DEFAULT_CONFIG,
    maxConcurrency: 4,
    enableValidation: false
  });

  // Listen for events with more detail
  engine.on('node:completed', (data) => {
    console.log('[node:completed]', data.nodeId, JSON.stringify(data.output).substring(0, 150));
  });
  engine.on('node:failed', (data) => {
    console.log('[node:failed]', data.nodeId, data.error);
    console.log('  Details:', JSON.stringify(data.details).substring(0, 300));
  });

  const testContent = `
    <h1>Security Council Resolution 2024/001</h1>
    <p>The Security Council, recalling its previous resolutions.</p>
    <p>Contact: security-council@un.org, Tel: +1-212-963-1234</p>
  `;

  console.log('Starting execution...');
  const result = await engine.execute(dag, { content: testContent });

  console.log('\nResult:');
  console.log('  Status:', result.status);

  for (const [nodeId, nodeRes] of Object.entries(result.nodeResults || {})) {
    console.log('  ' + nodeId + ': ' + nodeRes.status + ' - ' + (nodeRes.error || 'ok'));
    if (nodeRes.output) {
      console.log('    Output:', JSON.stringify(nodeRes.output).substring(0, 100));
    }
  }
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
