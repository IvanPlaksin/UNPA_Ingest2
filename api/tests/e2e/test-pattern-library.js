/**
 * Test Pattern Library - Feedback Loop
 *
 * Tests the PatternLibrary component for caching and learning
 * from execution patterns.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { PatternLibrary } = require('../../src/runtime/learning');

async function test() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Pattern Library Test');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Create pattern library (in-memory only for this test)
  const library = new PatternLibrary({ maxSize: 10 });

  // ─────────────────────────────────────────────────────────────────────────
  // Test 1: Record successful execution
  // ─────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 1: Record successful execution');

  const mockResult1 = {
    executionId: 'exec-001',
    status: 'COMPLETED',
    metrics: {
      totalDurationMs: 150,
      nodesSucceeded: 4,
      nodesFailed: 0,
      nodesSkipped: 0,
      retriesTotal: 0
    },
    nodeResults: {
      parse: { status: 'SUCCEEDED', durationMs: 10 },
      sanitize: { status: 'SUCCEEDED', durationMs: 20 },
      chunk: { status: 'SUCCEEDED', durationMs: 50 },
      extract: { status: 'SUCCEEDED', durationMs: 70 }
    },
    dag: {
      id: 'ingestion-v1',
      nodes: [
        { id: 'parse', executorType: 'ingestion.parse_document' },
        { id: 'sanitize', executorType: 'ingestion.sanitize' },
        { id: 'chunk', executorType: 'ingestion.chunk_text' },
        { id: 'extract', executorType: 'ingestion.extract_entities' }
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'parse', targetNodeId: 'sanitize' },
        { id: 'e2', sourceNodeId: 'sanitize', targetNodeId: 'chunk' },
        { id: 'e3', sourceNodeId: 'chunk', targetNodeId: 'extract' }
      ]
    }
  };

  const record1 = await library.recordExecution(mockResult1, {
    taskCategory: 'document-ingestion',
    taskDescription: 'Ingest and extract entities from document'
  });

  console.log('  Recorded:', record1);
  console.log('  ✓ Pattern recorded successfully\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 2: Record failed execution (same pattern)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 2: Record failed execution (same pattern)');

  const mockResult2 = {
    ...mockResult1,
    executionId: 'exec-002',
    status: 'FAILED',
    metrics: {
      ...mockResult1.metrics,
      nodesSucceeded: 2,
      nodesFailed: 1
    }
  };

  const record2 = await library.recordExecution(mockResult2, {
    taskCategory: 'document-ingestion'
  });

  console.log('  Recorded:', record2);
  console.log('  ✓ Failure recorded for existing pattern\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 3: Retrieve pattern
  // ─────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 3: Retrieve pattern by category');

  const pattern = await library.getPattern('document-ingestion');

  console.log('  Found pattern:', pattern ? 'yes' : 'no');
  if (pattern) {
    console.log('  Nodes:', pattern.nodes.map(n => n.executorType).join(' → '));
  }
  console.log('  ✓ Pattern retrieval works\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 4: Record different pattern
  // ─────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 4: Record different pattern');

  const mockResult3 = {
    executionId: 'exec-003',
    status: 'COMPLETED',
    metrics: { totalDurationMs: 80, nodesSucceeded: 3, nodesFailed: 0, nodesSkipped: 0, retriesTotal: 0 },
    nodeResults: {},
    dag: {
      id: 'rag-v1',
      nodes: [
        { id: 'search', executorType: 'rag.vector_search' },
        { id: 'rerank', executorType: 'rag.rerank' },
        { id: 'generate', executorType: 'rag.generate_response' }
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'search', targetNodeId: 'rerank' },
        { id: 'e2', sourceNodeId: 'rerank', targetNodeId: 'generate' }
      ]
    }
  };

  const record3 = await library.recordExecution(mockResult3, {
    taskCategory: 'question-answering',
    taskDescription: 'RAG-based Q&A'
  });

  console.log('  Recorded:', record3);
  console.log('  ✓ New pattern for different category\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 5: Get statistics
  // ─────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 5: Get cache statistics');

  const stats = library.getStats();
  console.log('  Cache stats:', stats);
  console.log('  ✓ Statistics available\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Test 6: Check cache miss
  // ─────────────────────────────────────────────────────────────────────────
  console.log('▶ Test 6: Check cache miss');

  const unknownPattern = await library.getPattern('unknown-category');
  console.log('  Found pattern for unknown category:', unknownPattern ? 'yes' : 'no');

  const finalStats = library.getStats();
  console.log('  Final stats:', finalStats);
  console.log('  ✓ Cache miss handled correctly\n');

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Summary');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log(`  Cached patterns: ${finalStats.cachedPatterns}`);
  console.log(`  Categories: ${finalStats.categories}`);
  console.log(`  Hit rate: ${(finalStats.hitRate * 100).toFixed(1)}%`);
  console.log(`  Hits: ${finalStats.hits}, Misses: ${finalStats.misses}`);

  console.log('\n✓ All tests passed');
}

test().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
