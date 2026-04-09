/**
 * GXE Runtime Stress Test
 *
 * Real-world test with live services:
 * - Memgraph (knowledge graph)
 * - Qdrant (vector store)
 * - AOPEG executors (ingestion domain)
 *
 * Collects metrics:
 * - Latency per node
 * - Total pipeline duration
 * - Memory usage
 * - Error rates
 *
 * @module tests/e2e/runtime-stress-test
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ═══════════════════════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════════════════════

const { RuntimeEngine, DEFAULT_CONFIG } = require('../../src/runtime');
const { AOPEGAdapter } = require('../../src/runtime/integration');

// ═══════════════════════════════════════════════════════════════════════════
// TEST DATA
// ═══════════════════════════════════════════════════════════════════════════

const TEST_DOCUMENTS = [
  {
    id: 'doc-1',
    name: 'UN Security Council Resolution',
    content: `
      <h1>Security Council Resolution 2024/001</h1>

      <p>The Security Council, recalling its previous resolutions concerning
      peacekeeping operations, and taking note of the report of the Secretary-General
      dated 15 January 2024,</p>

      <p>Decides to extend the mandate of the United Nations Mission in the
      Central African Republic (MINUSCA) until 15 November 2024;</p>

      <p>Requests the Secretary-General to report to the Council every three months
      on the implementation of the mandate;</p>

      <p>Contact: security-council@un.org, Tel: +1-212-963-1234</p>

      <h2>Key Entities</h2>
      <ul>
        <li>MINUSCA - UN Mission</li>
        <li>Central African Republic - Location</li>
        <li>Secretary-General António Guterres</li>
        <li>Work Item: UNPA-2024-001</li>
      </ul>
    `
  },
  {
    id: 'doc-2',
    name: 'Technical Architecture Document',
    content: `
      # UNPA System Architecture v2.0

      ## Overview
      The UN ProjectAdvisor (UNPA) system implements a knowledge management
      pipeline with the following components:

      ## Core Services
      - **Memgraph**: Graph database for entity relationships (bolt://memgraph:7687)
      - **Qdrant**: Vector store for semantic search (http://qdrant:6333)
      - **Redis**: Caching and session management
      - **TEI**: Text Embeddings Inference service

      ## Data Flow
      1. Documents ingested via Azure DevOps API
      2. Text sanitized and chunked (512 tokens, 50 overlap)
      3. Entities extracted using LLM + regex patterns
      4. Knowledge graph updated in Memgraph
      5. Embeddings stored in Qdrant for RAG

      ## API Endpoints
      - POST /api/v1/runtime/execute - Start pipeline execution
      - GET /api/v1/runtime/health - Health check

      Contact: dev-team@un.org
      Project: UNPA-ARCH-2024
    `
  },
  {
    id: 'doc-3',
    name: 'Multilingual Test Document',
    content: `
      Этот документ содержит текст на русском языке для тестирования
      многоязычной обработки в системе UNPA.

      项目名称：联合国项目顾问系统

      This paragraph is in English to test language detection switching.

      المادة الأولى: الأمم المتحدة منظمة دولية

      Reference: UNPA-MULTI-001
      Email: translations@un.org
    `
  }
];

/**
 * Full ingestion pipeline DAG
 */
const INGESTION_PIPELINE_DAG = {
  id: 'stress-test-ingestion-pipeline',
  version: 1,
  name: 'Full Ingestion Pipeline',

  nodes: [
    {
      id: 'parse',
      executorType: 'ingestion.parse_document',
      parameters: { mimeType: 'text/html' },
      displayName: 'Parse Document',
      position: { x: 100, y: 200 }
    },
    {
      id: 'sanitize',
      executorType: 'ingestion.sanitize',
      parameters: {
        removeHtml: true,
        normalizeWhitespace: true,
        removePII: false,
        preserveCodeBlocks: true
      },
      displayName: 'Sanitize Text',
      position: { x: 250, y: 200 }
    },
    {
      id: 'detect-lang',
      executorType: 'ingestion.detect_language',
      parameters: {},
      displayName: 'Detect Language',
      position: { x: 400, y: 100 }
    },
    {
      id: 'chunk',
      executorType: 'ingestion.chunk_text',
      parameters: {
        maxTokens: 512,
        overlapTokens: 50,
        preserveParagraphs: true,
        detectHeaders: true
      },
      displayName: 'Chunk Text',
      position: { x: 400, y: 300 }
    },
    {
      id: 'extract',
      executorType: 'ingestion.extract_entities',
      parameters: {
        useLLM: false,  // Disable LLM for stress test (use regex only)
        useRegex: true,
        minConfidence: 0.5,
        maxEntities: 50
      },
      displayName: 'Extract Entities',
      position: { x: 550, y: 200 }
    },
    {
      id: 'classify',
      executorType: 'ingestion.classify_content',
      parameters: {},
      displayName: 'Classify Content',
      position: { x: 700, y: 200 }
    }
  ],

  edges: [
    { id: 'e1', sourceNodeId: 'parse', targetNodeId: 'sanitize', priority: 1 },
    { id: 'e2', sourceNodeId: 'sanitize', targetNodeId: 'detect-lang', priority: 1 },
    { id: 'e3', sourceNodeId: 'sanitize', targetNodeId: 'chunk', priority: 1 },
    { id: 'e4', sourceNodeId: 'chunk', targetNodeId: 'extract', priority: 1 },
    { id: 'e5', sourceNodeId: 'extract', targetNodeId: 'classify', priority: 1 }
  ],

  entryNodeId: 'parse',
  exitNodeIds: ['detect-lang', 'classify']
};

/**
 * Pipeline with graph/vector write (requires live services)
 */
const FULL_PIPELINE_WITH_STORAGE_DAG = {
  id: 'stress-test-full-pipeline',
  version: 1,
  name: 'Full Pipeline with Storage',

  nodes: [
    ...INGESTION_PIPELINE_DAG.nodes,
    {
      id: 'write-graph',
      executorType: 'ingestion.write_graph',
      parameters: { namespace: 'stress-test' },
      displayName: 'Write to Graph',
      position: { x: 850, y: 150 }
    },
    {
      id: 'write-vector',
      executorType: 'ingestion.write_vector',
      parameters: { namespace: 'stress-test', collection: 'stress-test' },
      displayName: 'Write to Vector',
      position: { x: 850, y: 250 }
    }
  ],

  edges: [
    ...INGESTION_PIPELINE_DAG.edges.filter(e => !['detect-lang', 'classify'].includes(e.targetNodeId) || e.sourceNodeId !== 'extract'),
    { id: 'e5', sourceNodeId: 'extract', targetNodeId: 'classify', priority: 1 },
    { id: 'e6', sourceNodeId: 'classify', targetNodeId: 'write-graph', priority: 1 },
    { id: 'e7', sourceNodeId: 'chunk', targetNodeId: 'write-vector', priority: 1 }
  ],

  entryNodeId: 'parse',
  exitNodeIds: ['detect-lang', 'write-graph', 'write-vector']
};

// ═══════════════════════════════════════════════════════════════════════════
// METRICS COLLECTION
// ═══════════════════════════════════════════════════════════════════════════

class MetricsCollector {
  constructor() {
    this.executions = [];
    this.nodeMetrics = new Map();
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
  }

  startRun() {
    this.startTime = Date.now();
  }

  endRun() {
    this.endTime = Date.now();
  }

  recordExecution(executionId, result, duration) {
    this.executions.push({
      executionId,
      status: result.status,
      duration,
      nodeCount: result.nodeResults ? Object.keys(result.nodeResults).length : 0,
      timestamp: new Date().toISOString()
    });

    // Record per-node metrics (nodeResults is an Object, not a Map)
    if (result.nodeResults && typeof result.nodeResults === 'object') {
      for (const [nodeId, nodeResult] of Object.entries(result.nodeResults)) {
        if (!this.nodeMetrics.has(nodeId)) {
          this.nodeMetrics.set(nodeId, []);
        }
        this.nodeMetrics.get(nodeId).push({
          duration: nodeResult.durationMs || 0,
          status: nodeResult.status,
          retries: nodeResult.attempts || 0
        });
      }
    }
  }

  recordError(error, context) {
    this.errors.push({
      message: error.message,
      context,
      timestamp: new Date().toISOString()
    });
  }

  getReport() {
    const totalDuration = this.endTime - this.startTime;
    const successful = this.executions.filter(e => e.status === 'COMPLETED').length;
    const failed = this.executions.filter(e => e.status === 'FAILED').length;

    // Calculate node statistics
    const nodeStats = {};
    for (const [nodeId, metrics] of this.nodeMetrics) {
      const durations = metrics.map(m => m.duration);
      nodeStats[nodeId] = {
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        totalRuns: metrics.length,
        failureRate: metrics.filter(m => m.status === 'FAILED').length / metrics.length
      };
    }

    // Sort by avg duration to find bottlenecks
    const bottlenecks = Object.entries(nodeStats)
      .sort((a, b) => b[1].avgDuration - a[1].avgDuration)
      .slice(0, 5);

    return {
      summary: {
        totalExecutions: this.executions.length,
        successful,
        failed,
        successRate: (successful / this.executions.length * 100).toFixed(1) + '%',
        totalDuration: totalDuration + 'ms',
        avgExecutionTime: (this.executions.reduce((a, e) => a + e.duration, 0) / this.executions.length).toFixed(0) + 'ms',
        throughput: (this.executions.length / (totalDuration / 1000)).toFixed(2) + ' exec/sec'
      },
      nodeStats,
      bottlenecks: bottlenecks.map(([nodeId, stats]) => ({
        nodeId,
        avgDuration: stats.avgDuration.toFixed(0) + 'ms'
      })),
      errors: this.errors,
      memoryUsage: process.memoryUsage()
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STRESS TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

async function runStressTest() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' GXE Runtime Stress Test');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const metrics = new MetricsCollector();

  // ─────────────────────────────────────────────────────────────────────────
  // Initialize AOPEG
  // ─────────────────────────────────────────────────────────────────────────

  console.log('▶ Initializing AOPEG...');

  let mcpRegistry;
  let aopegAdapter;

  try {
    const aopegModule = require('../../src/core/aopeg/index');

    if (!aopegModule.isAOPEGInitialized()) {
      await aopegModule.initializeAOPEG({
        loadPlugins: true,
        loadDomainPlugins: true
      });
    }

    aopegAdapter = new AOPEGAdapter(aopegModule.pluginRegistry);
    mcpRegistry = aopegAdapter.createMcpCompatibleRegistry();

    const executors = aopegAdapter.listExecutors();
    console.log(`  ✓ AOPEG initialized with ${executors.length} executors`);

    // List available executors
    console.log('  Available executor types:');
    executors.slice(0, 10).forEach(e => {
      console.log(`    - ${e.type}`);
    });
    if (executors.length > 10) {
      console.log(`    ... and ${executors.length - 10} more`);
    }

  } catch (error) {
    console.error('  ✗ Failed to initialize AOPEG:', error.message);
    console.log('  Using mock registry...');

    mcpRegistry = {
      hasTool: () => false,
      callTool: async (name) => ({ success: false, error: `Mock: ${name}` }),
      listTools: () => []
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Check Service Connectivity
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n▶ Checking service connectivity...');

  // Check Memgraph
  try {
    const memgraphService = require('../../src/services/memgraph.service');
    const connected = await memgraphService.healthCheck().catch(() => false);
    console.log(`  ${connected ? '✓' : '✗'} Memgraph: ${connected ? 'connected' : 'not available'}`);
  } catch (e) {
    console.log(`  ✗ Memgraph: ${e.message}`);
  }

  // Check Qdrant
  try {
    const qdrantService = require('../../src/services/qdrant.service');
    const health = await qdrantService.healthCheck().catch(() => null);
    console.log(`  ${health ? '✓' : '✗'} Qdrant: ${health ? 'connected' : 'not available'}`);
  } catch (e) {
    console.log(`  ✗ Qdrant: ${e.message}`);
  }

  // Check Redis
  try {
    const redisService = require('../../src/services/redis.service');
    const pong = await redisService.ping().catch(() => null);
    console.log(`  ${pong ? '✓' : '✗'} Redis: ${pong ? 'connected' : 'not available'}`);
  } catch (e) {
    console.log(`  ✗ Redis: ${e.message}`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Run Basic Pipeline Test (no storage writes)
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n▶ Running basic pipeline test (no storage writes)...');

  metrics.startRun();

  for (const doc of TEST_DOCUMENTS) {
    console.log(`\n  Processing: ${doc.name}`);

    const engine = new RuntimeEngine(mcpRegistry, {
      ...DEFAULT_CONFIG,
      maxConcurrency: 4,
      nodeTimeoutMs: 30000,
      enableValidation: true  // Validation now fixed to handle AOPEG format
    });

    const startTime = Date.now();

    try {
      const result = await engine.execute(
        INGESTION_PIPELINE_DAG,
        { content: doc.content },
        { executionId: `stress-${doc.id}-${Date.now()}` }
      );

      const duration = Date.now() - startTime;
      metrics.recordExecution(doc.id, result, duration);

      console.log(`    Status: ${result.status}`);
      console.log(`    Duration: ${duration}ms`);

      if (result.status === 'COMPLETED') {
        // Show some output stats (output is an Object with exit node outputs)
        const outputs = result.output || {};
        const nodeResults = result.nodeResults || {};

        // Get outputs from nodeResults for non-exit nodes
        const chunkResult = nodeResults['chunk'];
        const extractResult = nodeResults['extract'];
        const classifyOutput = outputs['classify'] || nodeResults['classify']?.output || {};

        console.log(`    Chunks: ${chunkResult?.output?.totalChunks || 'N/A'}`);
        console.log(`    Entities: ${extractResult?.output?.entities?.length || 'N/A'}`);
        console.log(`    Classification: ${classifyOutput?.classification?.category || classifyOutput?.category || 'N/A'}`);

        // Show metrics
        if (result.metrics) {
          console.log(`    Nodes: ${result.metrics.nodesSucceeded}/${result.metrics.nodesTotal} succeeded`);
        }
      } else {
        console.log(`    Error: ${result.error || 'Unknown'}`);
        // Show which nodes failed with detailed errors
        if (result.nodeResults) {
          const failedNodes = Object.entries(result.nodeResults)
            .filter(([_, r]) => r.status === 'FAILED');
          if (failedNodes.length > 0) {
            console.log(`    Failed nodes:`);
            for (const [id, r] of failedNodes) {
              console.log(`      - ${id}: ${r.error || 'unknown'}`);
              // Show details for debugging
              if (r.details) {
                const details = typeof r.details === 'string' ? r.details : JSON.stringify(r.details).substring(0, 200);
                console.log(`        Details: ${details}`);
              }
            }
          }
        }
      }

    } catch (error) {
      const duration = Date.now() - startTime;
      metrics.recordError(error, { docId: doc.id });
      metrics.recordExecution(doc.id, { status: 'FAILED' }, duration);
      console.log(`    ✗ Error: ${error.message}`);
    }
  }

  metrics.endRun();

  // ─────────────────────────────────────────────────────────────────────────
  // Throughput Test
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n▶ Running throughput test (10 parallel executions)...');

  const throughputMetrics = new MetricsCollector();
  throughputMetrics.startRun();

  const parallelPromises = [];
  for (let i = 0; i < 10; i++) {
    const doc = TEST_DOCUMENTS[i % TEST_DOCUMENTS.length];
    const engine = new RuntimeEngine(mcpRegistry, DEFAULT_CONFIG);

    const promise = (async () => {
      const start = Date.now();
      try {
        const result = await engine.execute(
          INGESTION_PIPELINE_DAG,
          { content: doc.content },
          { executionId: `throughput-${i}-${Date.now()}` }
        );
        return { success: true, duration: Date.now() - start, result };
      } catch (error) {
        return { success: false, duration: Date.now() - start, error };
      }
    })();

    parallelPromises.push(promise);
  }

  const parallelResults = await Promise.all(parallelPromises);
  throughputMetrics.endRun();

  const successCount = parallelResults.filter(r => r.success).length;
  const avgDuration = parallelResults.reduce((a, r) => a + r.duration, 0) / parallelResults.length;

  console.log(`  Completed: ${successCount}/10`);
  console.log(`  Average duration: ${avgDuration.toFixed(0)}ms`);
  console.log(`  Total time: ${throughputMetrics.endTime - throughputMetrics.startTime}ms`);

  // ─────────────────────────────────────────────────────────────────────────
  // Report
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Stress Test Report');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const report = metrics.getReport();

  console.log('Summary:');
  console.log(`  Total Executions: ${report.summary.totalExecutions}`);
  console.log(`  Successful: ${report.summary.successful}`);
  console.log(`  Failed: ${report.summary.failed}`);
  console.log(`  Success Rate: ${report.summary.successRate}`);
  console.log(`  Total Duration: ${report.summary.totalDuration}`);
  console.log(`  Avg Execution Time: ${report.summary.avgExecutionTime}`);

  if (report.bottlenecks.length > 0) {
    console.log('\nBottlenecks (slowest nodes):');
    report.bottlenecks.forEach((b, i) => {
      console.log(`  ${i + 1}. ${b.nodeId}: ${b.avgDuration}`);
    });
  }

  if (report.errors.length > 0) {
    console.log('\nErrors:');
    report.errors.forEach(e => {
      console.log(`  - ${e.context?.docId || 'unknown'}: ${e.message}`);
    });
  }

  console.log('\nMemory Usage:');
  const mem = report.memoryUsage;
  console.log(`  Heap Used: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  Heap Total: ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  RSS: ${(mem.rss / 1024 / 1024).toFixed(1)} MB`);

  // ─────────────────────────────────────────────────────────────────────────
  // Recommendations
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Recommendations');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (report.summary.failed > 0) {
    console.log('⚠️  Some executions failed. Check error logs above.');
  }

  if (report.bottlenecks.length > 0) {
    const slowest = report.bottlenecks[0];
    if (parseInt(slowest.avgDuration) > 1000) {
      console.log(`⚠️  Node "${slowest.nodeId}" is slow (${slowest.avgDuration}). Consider:`);
      console.log('    - Adding caching');
      console.log('    - Optimizing executor implementation');
      console.log('    - Running in parallel with other nodes');
    }
  }

  if (mem.heapUsed > 500 * 1024 * 1024) {
    console.log('⚠️  High memory usage. Consider streaming large documents.');
  }

  console.log('\n✓ Stress test complete');
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

runStressTest().catch(err => {
  console.error('Stress test failed:', err);
  process.exit(1);
});
