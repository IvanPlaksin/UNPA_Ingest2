/**
 * GXE Runtime API E2E Tests
 *
 * Tests the runtime API endpoints with real AOPEG executors.
 * Requires a running API server or can start one for testing.
 *
 * @module tests/e2e/runtime-api.e2e.test
 */

const http = require('http');

// ═══════════════════════════════════════════════════════════════════════════
// TEST CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE_URL = process.env.API_URL || 'http://localhost:3010';
const RUNTIME_API = `${API_BASE_URL}/api/v1/runtime`;

// ═══════════════════════════════════════════════════════════════════════════
// TEST DAGS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Simple ingestion pipeline DAG
 * Parse → Sanitize → Detect Language
 */
const simpleIngestionDag = {
  id: 'test-simple-ingestion',
  version: 1,
  name: 'Simple Ingestion Pipeline',
  nodes: [
    {
      id: 'parse',
      executorType: 'ingestion.parse_document',
      parameters: { mimeType: 'text/plain' },
      displayName: 'Parse Document',
      position: { x: 100, y: 200 }
    },
    {
      id: 'sanitize',
      executorType: 'ingestion.sanitize',
      parameters: { removeHtml: true, normalizeWhitespace: true },
      displayName: 'Sanitize Text',
      position: { x: 300, y: 200 }
    },
    {
      id: 'detect-lang',
      executorType: 'ingestion.detect_language',
      parameters: {},
      displayName: 'Detect Language',
      position: { x: 500, y: 200 }
    }
  ],
  edges: [
    { id: 'e1', sourceNodeId: 'parse', targetNodeId: 'sanitize', condition: null, priority: 1 },
    { id: 'e2', sourceNodeId: 'sanitize', targetNodeId: 'detect-lang', condition: null, priority: 1 }
  ],
  entryNodeId: 'parse',
  exitNodeIds: ['detect-lang']
};

/**
 * Full text processing DAG
 * Parse → Sanitize → Chunk → Extract Entities → Classify
 */
const fullTextProcessingDag = {
  id: 'test-full-text-processing',
  version: 1,
  name: 'Full Text Processing Pipeline',
  nodes: [
    {
      id: 'parse',
      executorType: 'ingestion.parse_document',
      parameters: { mimeType: 'text/plain' },
      displayName: 'Parse Document',
      position: { x: 100, y: 200 }
    },
    {
      id: 'sanitize',
      executorType: 'ingestion.sanitize',
      parameters: { removeHtml: true, normalizeWhitespace: true, preserveCodeBlocks: true },
      displayName: 'Sanitize Text',
      position: { x: 250, y: 200 }
    },
    {
      id: 'chunk',
      executorType: 'ingestion.chunk_text',
      parameters: { maxTokens: 256, overlapTokens: 25 },
      displayName: 'Chunk Text',
      position: { x: 400, y: 200 }
    },
    {
      id: 'extract',
      executorType: 'ingestion.extract_entities',
      parameters: { useLLM: false, useRegex: true, minConfidence: 0.5 },
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
    { id: 'e1', sourceNodeId: 'parse', targetNodeId: 'sanitize', condition: null, priority: 1 },
    { id: 'e2', sourceNodeId: 'sanitize', targetNodeId: 'chunk', condition: null, priority: 1 },
    { id: 'e3', sourceNodeId: 'chunk', targetNodeId: 'extract', condition: null, priority: 1 },
    { id: 'e4', sourceNodeId: 'extract', targetNodeId: 'classify', condition: null, priority: 1 }
  ],
  entryNodeId: 'parse',
  exitNodeIds: ['classify']
};

/**
 * Single node DAG for basic testing
 */
const singleNodeDag = {
  id: 'test-single-node',
  version: 1,
  name: 'Single Node Test',
  nodes: [
    {
      id: 'parse-only',
      executorType: 'ingestion.parse_document',
      parameters: { mimeType: 'text/plain' },
      displayName: 'Parse Only',
      position: { x: 100, y: 200 }
    }
  ],
  edges: [],
  entryNodeId: 'parse-only',
  exitNodeIds: ['parse-only']
};

// ═══════════════════════════════════════════════════════════════════════════
// HTTP HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, RUNTIME_API);

    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, data: json });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEST RUNNER
// ═══════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

async function test(name, fn) {
  console.log(`\n▶ ${name}`);
  try {
    await fn();
  } catch (error) {
    failed++;
    console.log(`  ✗ Test error: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' GXE Runtime API E2E Tests');
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`Target: ${RUNTIME_API}`);

  // ─────────────────────────────────────────────────────────────────────────
  // Health Check
  // ─────────────────────────────────────────────────────────────────────────

  await test('GET /health - Runtime health check', async () => {
    const res = await makeRequest('GET', `${RUNTIME_API}/health`);

    assert(res.status === 200, `Status is 200 (got ${res.status})`);
    assert(res.data.success === true, 'Response has success: true');
    assert(res.data.status === 'healthy', 'Status is healthy');
    assert(typeof res.data.executorCount === 'number', 'Has executorCount');

    console.log(`    AOPEG: ${res.data.hasAOPEG ? 'connected' : 'not connected'}`);
    console.log(`    Executors: ${res.data.executorCount}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // List Executors
  // ─────────────────────────────────────────────────────────────────────────

  await test('GET /executors - List available executors', async () => {
    const res = await makeRequest('GET', `${RUNTIME_API}/executors`);

    assert(res.status === 200, `Status is 200 (got ${res.status})`);
    assert(res.data.success === true, 'Response has success: true');
    assert(Array.isArray(res.data.executors), 'Executors is an array');
    assert(res.data.count >= 0, `Count is valid: ${res.data.count}`);

    if (res.data.executors.length > 0) {
      console.log(`    Sample executors:`);
      res.data.executors.slice(0, 5).forEach(e => {
        console.log(`      - ${e.type}: ${e.displayName}`);
      });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Execute Single Node DAG
  // ─────────────────────────────────────────────────────────────────────────

  await test('POST /execute - Execute single node DAG', async () => {
    const res = await makeRequest('POST', `${RUNTIME_API}/execute`, {
      dag: singleNodeDag,
      inputData: { content: 'Hello, this is a test document!' }
    });

    assert(res.status === 200, `Status is 200 (got ${res.status})`);
    assert(res.data.success === true, 'Response has success: true');
    assert(typeof res.data.executionId === 'string', 'Has executionId');
    assert(res.data.streamUrl.includes(res.data.executionId), 'Stream URL contains executionId');

    console.log(`    Execution ID: ${res.data.executionId}`);

    // Wait and check status
    await new Promise(resolve => setTimeout(resolve, 500));

    const statusRes = await makeRequest('GET', `${RUNTIME_API}/execute/${res.data.executionId}/status`);
    assert(statusRes.status === 200 || statusRes.status === 404, 'Status endpoint responds');

    if (statusRes.status === 200) {
      console.log(`    Status: ${statusRes.data.status}`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Execute Simple Ingestion Pipeline
  // ─────────────────────────────────────────────────────────────────────────

  await test('POST /execute - Execute simple ingestion pipeline', async () => {
    const testContent = `
      <p>Это тестовый документ на русском языке.</p>
      <p>This is also an English paragraph for testing.</p>
      Project: UNPA-123
    `.trim();

    const res = await makeRequest('POST', `${RUNTIME_API}/execute`, {
      dag: simpleIngestionDag,
      inputData: { content: testContent }
    });

    assert(res.status === 200, `Status is 200 (got ${res.status})`);
    assert(res.data.success === true, 'Response has success: true');
    assert(typeof res.data.executionId === 'string', 'Has executionId');

    console.log(`    Execution ID: ${res.data.executionId}`);

    // Wait longer for multi-node pipeline
    await new Promise(resolve => setTimeout(resolve, 1000));

    const statusRes = await makeRequest('GET', `${RUNTIME_API}/execute/${res.data.executionId}/status`);
    if (statusRes.status === 200) {
      console.log(`    Status: ${statusRes.data.status}`);
      console.log(`    Duration: ${statusRes.data.duration}ms`);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // List Active Executions
  // ─────────────────────────────────────────────────────────────────────────

  await test('GET /executions/active - List active executions', async () => {
    const res = await makeRequest('GET', `${RUNTIME_API}/executions/active`);

    assert(res.status === 200, `Status is 200 (got ${res.status})`);
    assert(res.data.success === true, 'Response has success: true');
    assert(Array.isArray(res.data.executions), 'Executions is an array');
    assert(typeof res.data.count === 'number', 'Has count');

    console.log(`    Active executions: ${res.data.count}`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Execute Full Pipeline
  // ─────────────────────────────────────────────────────────────────────────

  await test('POST /execute - Execute full text processing pipeline', async () => {
    const testContent = `
      # Project Documentation

      ## Overview
      The UNPA system is designed to ingest documents from Azure DevOps
      and extract knowledge for the UN Secretariat.

      ## Components
      - Document Parser: Handles PDF, DOCX, and TXT files
      - Entity Extractor: Uses NLP to find named entities
      - Knowledge Graph: Stores entities and relationships in Memgraph

      ## Contact
      For questions, reach out to admin@un.org or call +1-212-555-1234.
    `.trim();

    const res = await makeRequest('POST', `${RUNTIME_API}/execute`, {
      dag: fullTextProcessingDag,
      inputData: { content: testContent }
    });

    assert(res.status === 200, `Status is 200 (got ${res.status})`);
    assert(res.data.success === true, 'Response has success: true');

    console.log(`    Execution ID: ${res.data.executionId}`);

    // Wait for pipeline to complete
    await new Promise(resolve => setTimeout(resolve, 2000));

    const statusRes = await makeRequest('GET', `${RUNTIME_API}/execute/${res.data.executionId}/status`);
    if (statusRes.status === 200) {
      console.log(`    Status: ${statusRes.data.status}`);
      console.log(`    Duration: ${statusRes.data.duration}ms`);

      if (statusRes.data.state) {
        console.log(`    Execution State: ${statusRes.data.state.executionState || 'N/A'}`);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Error Cases
  // ─────────────────────────────────────────────────────────────────────────

  await test('POST /execute - Invalid DAG (no nodes)', async () => {
    const res = await makeRequest('POST', `${RUNTIME_API}/execute`, {
      dag: { id: 'invalid' },
      inputData: {}
    });

    assert(res.status === 400, `Status is 400 (got ${res.status})`);
    assert(res.data.success === false, 'Response has success: false');
    assert(typeof res.data.error === 'string', 'Has error message');
  });

  await test('GET /execute/:id/status - Unknown execution', async () => {
    const res = await makeRequest('GET', `${RUNTIME_API}/execute/unknown-id-12345/status`);

    assert(res.status === 404, `Status is 404 (got ${res.status})`);
    assert(res.data.success === false, 'Response has success: false');
  });

  await test('POST /execute/:id/cancel - Unknown execution', async () => {
    const res = await makeRequest('POST', `${RUNTIME_API}/execute/unknown-id-12345/cancel`);

    assert(res.status === 404, `Status is 404 (got ${res.status})`);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────────────────

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total:  ${passed + failed}`);

  process.exit(failed > 0 ? 1 : 0);
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
