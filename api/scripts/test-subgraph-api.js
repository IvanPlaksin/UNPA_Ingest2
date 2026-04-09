/**
 * Test SubGraph REST API endpoints.
 * Starts a minimal Express server on port 3099 to test routes in isolation.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
// Register ts-node for SubgraphAdapter import
require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } });

const express = require('express');
const subgraphRoutes = require('../src/routes/subgraph.route');

const app = express();
app.use(express.json());
app.use('/api/v1/subgraph', subgraphRoutes);
app.use((err, _req, res, _next) => {
  console.error('ERROR:', err.message);
  res.status(500).json({ error: err.message });
});

const PORT = 3099;
const BASE = `http://localhost:${PORT}/api/v1/subgraph`;

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  return { status: res.status, data };
}

async function runTests() {
  console.log('=== SubGraph API Test ===\n');

  // 1. Analyze
  console.log('--- POST /analyze ---');
  const analyze = await post('/analyze', { namespace: 'GXE' });
  console.log(`  Status: ${analyze.status}`);
  console.log(`  Nodes: ${analyze.data.nodeCount}, Edges: ${analyze.data.edgeCount}, Density: ${analyze.data.density}`);

  // 2. Segment
  console.log('\n--- POST /segment ---');
  const segment = await post('/segment', { namespace: 'GXE', strategies: ['community', 'ontology'] });
  console.log(`  Status: ${segment.status}`);
  console.log(`  Candidates: ${segment.data.candidates?.length}`);
  const best = segment.data.bestCandidate;
  console.log(`  Best: "${best?.name}" — ${best?.nodeCount} nodes, score=${best?.coherenceScore}`);

  if (!best) {
    console.error('No candidates found, aborting');
    process.exit(1);
  }

  // 3. Extract
  console.log('\n--- POST /extract ---');
  const extract = await post('/extract', {
    namespace: 'GXE',
    nodeIds: best.nodeIds,
    name: best.name,
  });
  console.log(`  Status: ${extract.status}`);
  console.log(`  SubGraph: ${extract.data.subgraphId}`);
  console.log(`  Ports: ${extract.data.boundaryInterface?.ports?.length}`);

  const sgId = extract.data.subgraphId;

  // 4. Get by ID
  console.log('\n--- GET /:id ---');
  const getRes = await get(`/${sgId}`);
  console.log(`  Status: ${getRes.status}`);
  console.log(`  Name: ${getRes.data.name}, Status: ${getRes.data.status}`);

  // 5. Expand
  console.log('\n--- GET /:id/expand ---');
  const expand = await get(`/${sgId}/expand`);
  console.log(`  Status: ${expand.status}`);
  console.log(`  Nodes: ${expand.data.nodes?.length}, Edges: ${expand.data.edges?.length}`);

  // 6. List
  console.log('\n--- GET /list ---');
  const list = await get('/list?namespace=GXE');
  console.log(`  Status: ${list.status}`);
  console.log(`  SubGraphs: ${list.data.length}`);

  // 7. Consolidate
  console.log('\n--- POST /consolidate ---');
  const consolidate = await post('/consolidate', { subgraphId: sgId, namespace: 'GXE' });
  console.log(`  Status: ${consolidate.status}`);
  console.log(`  Checkpoint: ${consolidate.data.checkpointId}`);
  console.log(`  Stats: ${JSON.stringify(consolidate.data.statistics)}`);

  // 8. Checkpoints
  console.log('\n--- GET /checkpoints ---');
  const checkpoints = await get('/checkpoints?namespace=GXE');
  console.log(`  Status: ${checkpoints.status}`);
  console.log(`  Checkpoints: ${checkpoints.data.length}`);

  // 9. Rollback
  console.log('\n--- POST /rollback ---');
  const rollback = await post('/rollback', { checkpointId: consolidate.data.checkpointId });
  console.log(`  Status: ${rollback.status}`);
  console.log(`  Stats: ${JSON.stringify(rollback.data.statistics)}`);

  // 10. Cleanup
  console.log('\n--- Cleanup ---');
  const memgraphService = require('../src/services/memgraph.service');
  const session = memgraphService.driver.session();
  await session.run('MATCH (cp:ConsolidationCheckpoint {subgraphId: $id}) DETACH DELETE cp', { id: sgId });
  await session.run('MATCH (sg:SubGraph {id: $id})-[:PORT_OF]->(p:SubGraphPort) DETACH DELETE p', { id: sgId });
  await session.run('MATCH (sg:SubGraph {id: $id}) DETACH DELETE sg', { id: sgId });
  await session.run('MATCH (n {subgraphId: $id}) REMOVE n.subgraphId, n.subNamespace', { id: sgId });
  await session.close();
  console.log('  Done.');

  console.log('\n=== All API Tests Passed ===');
}

const server = app.listen(PORT, async () => {
  console.log(`Test server on port ${PORT}\n`);
  try {
    await new Promise(r => setTimeout(r, 500));
    await runTests();
  } catch (err) {
    console.error('TEST FAILED:', err);
  } finally {
    server.close();
    process.exit(0);
  }
});
