/**
 * Task 9.3 — Export Formats Tests
 *
 * Tests: GraphExportService (Cypher, GraphML, JSON-LD, GEXF, CSV, JSON)
 *        + Export Routes + filtering/limits + edge cases
 */

const assert = require('assert');
const http = require('http');
const express = require('express');

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

let passed = 0;
let failed = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    results.push({ name, status: 'PASS' });
    console.log(`  \u2705 ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, status: 'FAIL', error: err.message });
    console.log(`  \u274C ${name}: ${err.message}`);
  }
}

function section(name) {
  console.log(`\n\u2501\u2501\u2501 ${name} \u2501\u2501\u2501`);
}

function createTestGraphCache() {
  const nodes = new Map();
  const edges = new Map();

  nodes.set('n1', { name: 'ServiceA', type: 'System', attributes: { lang: 'JS', version: '2.0' } });
  nodes.set('n2', { name: 'ServiceB', type: 'System', attributes: { lang: 'Python' } });
  nodes.set('n3', { name: 'John', type: 'Person', attributes: {} });
  nodes.set('n4', { name: 'Doc1', type: 'Document', attributes: { format: 'PDF' } });
  nodes.set('n5', { name: 'API GW', type: 'API', attributes: {} });
  nodes.set('n6', { name: 'UserDB', type: 'Database', attributes: { engine: 'PostgreSQL' } });

  edges.set('e1', { source: 'n1', target: 'n2', type: 'USES' });
  edges.set('e2', { source: 'n1', target: 'n6', type: 'DEPENDS_ON' });
  edges.set('e3', { source: 'n3', target: 'n4', type: 'AUTHORED_BY' });
  edges.set('e4', { source: 'n5', target: 'n1', type: 'CONTAINS' });
  edges.set('e5', { source: 'n2', target: 'n6', type: 'USES' });

  return { nodes, edges, adjacency: new Map() };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CYPHER EXPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testCypher() {
  section('1. Cypher Export');

  const { GraphExportService } = require('../../src/services/visualization/export.service');

  await test('Cypher: basic export', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCypher();

    assert.strictEqual(result.format, 'cypher');
    assert.strictEqual(result.nodes, 6);
    assert.strictEqual(result.edges, 5);
    assert.strictEqual(result.statements, 11); // 6 nodes + 5 edges
    assert.ok(result.content.includes('CREATE'));
    assert.ok(result.contentType);
    assert.ok(result.metadata.generatedAt);
  });

  await test('Cypher: node labels sanitized', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCypher();

    assert.ok(result.content.includes(':SYSTEM'));
    assert.ok(result.content.includes(':PERSON'));
    assert.ok(result.content.includes(':DOCUMENT'));
  });

  await test('Cypher: properties escaped', () => {
    const cache = createTestGraphCache();
    cache.nodes.set('q1', { name: "O'Brien", type: 'Person', attributes: {} });
    const svc = new GraphExportService({ graphCache: cache });
    const result = svc.toCypher();

    assert.ok(result.content.includes("O\\'Brien"));
  });

  await test('Cypher: relationship statements with MATCH', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCypher();

    assert.ok(result.content.includes('MATCH (a {id:'));
    assert.ok(result.content.includes('CREATE (a)-[:USES'));
    assert.ok(result.content.includes('CREATE (a)-[:DEPENDS_ON'));
  });

  await test('Cypher: node attributes included', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCypher();

    assert.ok(result.content.includes("lang: 'JS'"));
    assert.ok(result.content.includes("version: '2.0'"));
  });

  await test('Cypher: empty graph', () => {
    const svc = new GraphExportService({
      graphCache: { nodes: new Map(), edges: new Map(), adjacency: new Map() }
    });
    const result = svc.toCypher();

    assert.strictEqual(result.nodes, 0);
    assert.strictEqual(result.edges, 0);
    assert.strictEqual(result.statements, 0);
    assert.strictEqual(result.content, '');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. GRAPHML EXPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testGraphML() {
  section('2. GraphML Export');

  const { GraphExportService } = require('../../src/services/visualization/export.service');

  await test('GraphML: valid XML structure', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGraphML();

    assert.strictEqual(result.format, 'graphml');
    assert.strictEqual(result.contentType, 'application/xml');
    assert.ok(result.content.startsWith('<?xml version="1.0"'));
    assert.ok(result.content.includes('<graphml'));
    assert.ok(result.content.includes('</graphml>'));
    assert.ok(result.content.includes('<graph id="G"'));
  });

  await test('GraphML: correct node count', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGraphML();

    assert.strictEqual(result.nodes, 6);
    const nodeMatches = result.content.match(/<node id="/g);
    assert.strictEqual(nodeMatches.length, 6);
  });

  await test('GraphML: correct edge count', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGraphML();

    assert.strictEqual(result.edges, 5);
    const edgeMatches = result.content.match(/<edge id="/g);
    assert.strictEqual(edgeMatches.length, 5);
  });

  await test('GraphML: attribute keys defined', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGraphML();

    assert.ok(result.content.includes('<key id="name"'));
    assert.ok(result.content.includes('<key id="type"'));
    assert.ok(result.content.includes('<key id="edge_type"'));
    assert.ok(result.content.includes('<key id="lang"'));
  });

  await test('GraphML: node data populated', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGraphML();

    assert.ok(result.content.includes('<data key="name">ServiceA</data>'));
    assert.ok(result.content.includes('<data key="type">System</data>'));
    assert.ok(result.content.includes('<data key="lang">JS</data>'));
  });

  await test('GraphML: XML special characters escaped', () => {
    const cache = createTestGraphCache();
    cache.nodes.set('x1', { name: 'A<B&C', type: 'Test', attributes: {} });
    const svc = new GraphExportService({ graphCache: cache });
    const result = svc.toGraphML();

    assert.ok(result.content.includes('A&lt;B&amp;C'));
  });

  await test('GraphML: edge types included', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGraphML();

    assert.ok(result.content.includes('<data key="edge_type">USES</data>'));
    assert.ok(result.content.includes('<data key="edge_type">DEPENDS_ON</data>'));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. JSON-LD EXPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testJSONLD() {
  section('3. JSON-LD Export');

  const { GraphExportService } = require('../../src/services/visualization/export.service');

  await test('JSON-LD: valid structure with @context and @graph', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSONLD();

    assert.strictEqual(result.format, 'json-ld');
    assert.strictEqual(result.contentType, 'application/ld+json');
    const parsed = JSON.parse(result.content);
    assert.ok(parsed['@context']);
    assert.ok(parsed['@graph']);
    assert.strictEqual(parsed['@graph'].length, 6);
  });

  await test('JSON-LD: entity @id and @type', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSONLD();
    const parsed = JSON.parse(result.content);

    const n1 = parsed['@graph'].find(e => e['@id'].includes('n1'));
    assert.ok(n1);
    assert.strictEqual(n1['@type'], 'System');
    assert.strictEqual(n1.name, 'ServiceA');
  });

  await test('JSON-LD: custom baseUri', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSONLD({ baseUri: 'http://unpa.org/graph/' });

    assert.strictEqual(result.metadata.baseUri, 'http://unpa.org/graph/');
    const parsed = JSON.parse(result.content);
    assert.ok(parsed['@context']['@vocab'].startsWith('http://unpa.org/'));
    assert.ok(parsed['@graph'][0]['@id'].startsWith('http://unpa.org/'));
  });

  await test('JSON-LD: relationships as properties', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSONLD();
    const parsed = JSON.parse(result.content);

    const n1 = parsed['@graph'].find(e => e['@id'].includes('n1'));
    // n1 has edges: USES -> n2, DEPENDS_ON -> n6
    assert.ok(n1.uses);
    assert.ok(n1.dependsOn);
    assert.strictEqual(n1.uses.length, 1);
    assert.ok(n1.uses[0]['@id'].includes('n2'));
  });

  await test('JSON-LD: node attributes included', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSONLD();
    const parsed = JSON.parse(result.content);

    const n1 = parsed['@graph'].find(e => e['@id'].includes('n1'));
    assert.strictEqual(n1.lang, 'JS');
    assert.strictEqual(n1.version, '2.0');
  });

  await test('JSON-LD: context vocabulary', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSONLD();
    const parsed = JSON.parse(result.content);

    assert.strictEqual(parsed['@context'].type, '@type');
    assert.strictEqual(parsed['@context'].id, '@id');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. GEXF EXPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testGEXF() {
  section('4. GEXF Export');

  const { GraphExportService } = require('../../src/services/visualization/export.service');

  await test('GEXF: valid XML structure', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGEXF();

    assert.strictEqual(result.format, 'gexf');
    assert.strictEqual(result.contentType, 'application/xml');
    assert.ok(result.content.startsWith('<?xml'));
    assert.ok(result.content.includes('<gexf'));
    assert.ok(result.content.includes('</gexf>'));
    assert.ok(result.content.includes('version="1.2"'));
  });

  await test('GEXF: meta section', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGEXF();

    assert.ok(result.content.includes('<creator>ProjectAdvisor</creator>'));
    assert.ok(result.content.includes('<description>Knowledge Graph Export</description>'));
    assert.ok(result.content.includes('lastmodifieddate='));
  });

  await test('GEXF: node count and labels', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGEXF();

    assert.strictEqual(result.nodes, 6);
    assert.ok(result.content.includes('label="ServiceA"'));
    assert.ok(result.content.includes('label="John"'));
  });

  await test('GEXF: node type attributes', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGEXF();

    assert.ok(result.content.includes('<attvalue for="0" value="System"'));
    assert.ok(result.content.includes('<attvalue for="0" value="Person"'));
  });

  await test('GEXF: edge labels', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGEXF();

    assert.strictEqual(result.edges, 5);
    assert.ok(result.content.includes('label="USES"'));
    assert.ok(result.content.includes('label="DEPENDS_ON"'));
  });

  await test('GEXF: directed graph', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toGEXF();

    assert.ok(result.content.includes('defaultedgetype="directed"'));
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. CSV EXPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testCSV() {
  section('5. CSV Export');

  const { GraphExportService } = require('../../src/services/visualization/export.service');

  await test('CSV: two file output (nodes + edges)', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCSV();

    assert.strictEqual(result.format, 'csv');
    assert.ok(result.files);
    assert.ok(result.files.nodes);
    assert.ok(result.files.edges);
    assert.strictEqual(result.files.nodes.filename, 'nodes.csv');
    assert.strictEqual(result.files.edges.filename, 'edges.csv');
    assert.strictEqual(result.files.nodes.contentType, 'text/csv');
  });

  await test('CSV: nodes header row', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCSV();
    const lines = result.files.nodes.content.split('\n');

    assert.ok(lines[0].startsWith('id,name,type'));
    // Should have attribute columns
    assert.ok(lines[0].includes('lang'));
    assert.ok(lines[0].includes('version'));
    assert.ok(lines[0].includes('engine'));
  });

  await test('CSV: nodes data rows', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCSV();
    const lines = result.files.nodes.content.split('\n');

    assert.strictEqual(lines.length, 7); // header + 6 nodes
    assert.ok(lines[1].includes('ServiceA'));
    assert.ok(lines[1].includes('System'));
  });

  await test('CSV: edges header and data', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCSV();
    const lines = result.files.edges.content.split('\n');

    assert.strictEqual(lines[0], 'source,target,type');
    assert.strictEqual(lines.length, 6); // header + 5 edges
    assert.ok(lines[1].includes('USES') || lines[1].includes('DEPENDS_ON'));
  });

  await test('CSV: special characters escaped', () => {
    const cache = createTestGraphCache();
    cache.nodes.set('csv1', { name: 'Hello, World', type: 'Test', attributes: {} });
    cache.nodes.set('csv2', { name: 'Line\nBreak', type: 'Test', attributes: {} });
    const svc = new GraphExportService({ graphCache: cache });
    const result = svc.toCSV();

    assert.ok(result.files.nodes.content.includes('"Hello, World"'));
    assert.ok(result.files.nodes.content.includes('"Line\nBreak"'));
  });

  await test('CSV: empty attributes fill with blank', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toCSV();
    const lines = result.files.nodes.content.split('\n');

    // n3 (John/Person) has no attributes, should have blanks for lang, version etc
    const johnLine = lines.find(l => l.includes('John'));
    assert.ok(johnLine);
    // Count commas - should match header columns
    const headerCommas = lines[0].split(',').length - 1;
    const johnCommas = johnLine.split(',').length - 1;
    assert.strictEqual(johnCommas, headerCommas);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. JSON EXPORT
// ═══════════════════════════════════════════════════════════════════════════

async function testJSON() {
  section('6. JSON Export');

  const { GraphExportService } = require('../../src/services/visualization/export.service');

  await test('JSON: valid structure', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSON();

    assert.strictEqual(result.format, 'json');
    assert.strictEqual(result.contentType, 'application/json');
    const parsed = JSON.parse(result.content);
    assert.ok(Array.isArray(parsed.nodes));
    assert.ok(Array.isArray(parsed.edges));
    assert.strictEqual(parsed.nodes.length, 6);
    assert.strictEqual(parsed.edges.length, 5);
  });

  await test('JSON: node structure', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSON();
    const parsed = JSON.parse(result.content);

    const n1 = parsed.nodes.find(n => n.id === 'n1');
    assert.ok(n1);
    assert.strictEqual(n1.name, 'ServiceA');
    assert.strictEqual(n1.type, 'System');
    assert.deepStrictEqual(n1.attributes, { lang: 'JS', version: '2.0' });
  });

  await test('JSON: edge structure', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.toJSON();
    const parsed = JSON.parse(result.content);

    const e1 = parsed.edges.find(e => e.source === 'n1' && e.target === 'n2');
    assert.ok(e1);
    assert.strictEqual(e1.type, 'USES');
  });

  await test('JSON: defaults for missing attributes', () => {
    const cache = { nodes: new Map(), edges: new Map(), adjacency: new Map() };
    cache.nodes.set('bare', {});
    const svc = new GraphExportService({ graphCache: cache });
    const result = svc.toJSON();
    const parsed = JSON.parse(result.content);

    assert.strictEqual(parsed.nodes[0].name, 'bare');
    assert.strictEqual(parsed.nodes[0].type, 'Entity');
    assert.deepStrictEqual(parsed.nodes[0].attributes, {});
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. UNIFIED EXPORT API
// ═══════════════════════════════════════════════════════════════════════════

async function testUnifiedExport() {
  section('7. Unified Export API');

  const { GraphExportService } = require('../../src/services/visualization/export.service');

  await test('export() dispatches to correct format', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });

    assert.strictEqual(svc.export('cypher').format, 'cypher');
    assert.strictEqual(svc.export('graphml').format, 'graphml');
    assert.strictEqual(svc.export('json-ld').format, 'json-ld');
    assert.strictEqual(svc.export('jsonld').format, 'json-ld');
    assert.strictEqual(svc.export('gexf').format, 'gexf');
    assert.strictEqual(svc.export('csv').format, 'csv');
    assert.strictEqual(svc.export('json').format, 'json');
  });

  await test('export() case-insensitive', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });

    assert.strictEqual(svc.export('CYPHER').format, 'cypher');
    assert.strictEqual(svc.export('GraphML').format, 'graphml');
    assert.strictEqual(svc.export('JSON-LD').format, 'json-ld');
  });

  await test('export() throws on unsupported format', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });

    assert.throws(() => svc.export('xlsx'), /Unsupported export format/);
  });

  await test('export() tracks stats', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    svc.export('cypher');
    svc.export('cypher');
    svc.export('json');

    const stats = svc.getStats();
    assert.strictEqual(stats.totalExports, 3);
    assert.strictEqual(stats.byFormat.cypher, 2);
    assert.strictEqual(stats.byFormat.json, 1);
  });

  await test('getAvailableFormats() returns all 6 formats', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const formats = svc.getAvailableFormats();

    assert.strictEqual(formats.length, 6);
    const names = formats.map(f => f.name);
    assert.ok(names.includes('cypher'));
    assert.ok(names.includes('graphml'));
    assert.ok(names.includes('json-ld'));
    assert.ok(names.includes('gexf'));
    assert.ok(names.includes('csv'));
    assert.ok(names.includes('json'));
    // Each has description and extension
    for (const f of formats) {
      assert.ok(f.description);
      assert.ok(f.extension.startsWith('.'));
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. FILTERING & LIMITS
// ═══════════════════════════════════════════════════════════════════════════

async function testFiltering() {
  section('8. Filtering & Limits');

  const { GraphExportService } = require('../../src/services/visualization/export.service');

  await test('Filter by nodeTypes', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.export('json', { nodeTypes: ['System'] });

    assert.strictEqual(result.nodes, 2); // n1, n2
    const parsed = JSON.parse(result.content);
    assert.ok(parsed.nodes.every(n => n.type === 'System'));
  });

  await test('Filter by nodeTypes (case-insensitive)', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.export('json', { nodeTypes: ['system'] });

    assert.strictEqual(result.nodes, 2);
  });

  await test('Filter by edgeTypes', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.export('json', { edgeTypes: ['USES'] });

    const parsed = JSON.parse(result.content);
    assert.ok(parsed.edges.length > 0);
    assert.ok(parsed.edges.every(e => e.type === 'USES'));
  });

  await test('Limit nodes', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.export('json', { limit: 3 });

    assert.strictEqual(result.nodes, 3);
  });

  await test('Edges filtered to match included nodes', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.export('json', { nodeTypes: ['Person', 'Document'] });

    const parsed = JSON.parse(result.content);
    assert.strictEqual(result.nodes, 2); // n3 (Person), n4 (Document)
    // Only e3 (n3 -> n4) should be included
    assert.strictEqual(result.edges, 1);
    assert.strictEqual(parsed.edges[0].type, 'AUTHORED_BY');
  });

  await test('Combined nodeTypes + edgeTypes filter', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.export('json', {
      nodeTypes: ['System', 'Database'],
      edgeTypes: ['USES']
    });

    const parsed = JSON.parse(result.content);
    // Nodes: n1, n2 (System), n6 (Database) = 3
    assert.strictEqual(result.nodes, 3);
    // USES edges among these: n1->n2, n2->n6 = 2
    assert.strictEqual(result.edges, 2);
    assert.ok(parsed.edges.every(e => e.type === 'USES'));
  });

  await test('Empty filter returns no results', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const result = svc.export('json', { nodeTypes: ['NonExistent'] });

    assert.strictEqual(result.nodes, 0);
    assert.strictEqual(result.edges, 0);
  });

  await test('Filtering works across all formats', () => {
    const svc = new GraphExportService({ graphCache: createTestGraphCache() });
    const opts = { nodeTypes: ['System'] };

    assert.strictEqual(svc.export('cypher', opts).nodes, 2);
    assert.strictEqual(svc.export('graphml', opts).nodes, 2);
    assert.strictEqual(svc.export('json-ld', opts).nodes, 2);
    assert.strictEqual(svc.export('gexf', opts).nodes, 2);
    assert.strictEqual(svc.export('csv', opts).nodes, 2);
    assert.strictEqual(svc.export('json', opts).nodes, 2);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 9. EXPORT ROUTES
// ═══════════════════════════════════════════════════════════════════════════

async function testExportRoutes() {
  section('9. Export Routes');

  const { graphExportService } = require('../../src/services/visualization');
  graphExportService._graphCache = createTestGraphCache();
  graphExportService._explicit = new Set(['graphCache']);

  const exportRoutes = require('../../src/routes/export.routes');
  const app = express();
  app.use(express.json());
  app.use('/api/v1/export', exportRoutes);

  let server, baseUrl;
  await new Promise(resolve => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });

  const fetchJson = async (url, options = {}) => {
    const response = await fetch(`${baseUrl}${url}`, {
      headers: { 'Content-Type': 'application/json' },
      ...options
    });
    return { status: response.status, data: await response.json(), response };
  };

  const fetchRaw = async (url) => {
    const response = await fetch(`${baseUrl}${url}`);
    return { status: response.status, text: await response.text(), headers: response.headers };
  };

  await test('GET /formats returns all formats', async () => {
    const { status, data } = await fetchJson('/api/v1/export/formats');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.formats.length, 6);
  });

  await test('POST /cypher returns Cypher export', async () => {
    const { status, data } = await fetchJson('/api/v1/export/cypher', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.format, 'cypher');
    assert.strictEqual(data.nodes, 6);
    assert.ok(data.content.includes('CREATE'));
  });

  await test('POST /graphml returns GraphML', async () => {
    const { status, data } = await fetchJson('/api/v1/export/graphml', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 200);
    assert.ok(data.content.includes('<graphml'));
  });

  await test('POST /json-ld returns JSON-LD', async () => {
    const { status, data } = await fetchJson('/api/v1/export/json-ld', {
      method: 'POST',
      body: JSON.stringify({ baseUri: 'http://test.org/' })
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.format, 'json-ld');
    assert.ok(data.metadata.baseUri === 'http://test.org/');
  });

  await test('POST /gexf returns GEXF', async () => {
    const { status, data } = await fetchJson('/api/v1/export/gexf', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 200);
    assert.ok(data.content.includes('<gexf'));
  });

  await test('POST /csv returns CSV', async () => {
    const { status, data } = await fetchJson('/api/v1/export/csv', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.format, 'csv');
    assert.ok(data.files.nodes);
    assert.ok(data.files.edges);
  });

  await test('POST /json returns JSON', async () => {
    const { status, data } = await fetchJson('/api/v1/export/json', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.format, 'json');
  });

  await test('POST with nodeTypes filter', async () => {
    const { status, data } = await fetchJson('/api/v1/export/json', {
      method: 'POST',
      body: JSON.stringify({ nodeTypes: ['System'] })
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.nodes, 2);
  });

  await test('POST unsupported format returns 400', async () => {
    const { status, data } = await fetchJson('/api/v1/export/xlsx', {
      method: 'POST',
      body: JSON.stringify({})
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.success, false);
  });

  await test('GET /cypher/download returns file', async () => {
    const { status, text, headers } = await fetchRaw('/api/v1/export/cypher/download');
    assert.strictEqual(status, 200);
    assert.ok(headers.get('content-disposition').includes('graph.cypher'));
    assert.ok(text.includes('CREATE'));
  });

  await test('GET /csv/download returns nodes CSV file', async () => {
    const { status, text, headers } = await fetchRaw('/api/v1/export/csv/download');
    assert.strictEqual(status, 200);
    assert.ok(headers.get('content-type').includes('text/csv'));
    assert.ok(headers.get('content-disposition').includes('nodes.csv'));
    assert.ok(text.includes('id,name,type'));
  });

  await test('GET /json/download with query filters', async () => {
    const { status, text } = await fetchRaw('/api/v1/export/json/download?nodeTypes=System&limit=2');
    assert.strictEqual(status, 200);
    const parsed = JSON.parse(text);
    assert.ok(parsed.nodes.length <= 2);
  });

  await test('GET /stats returns export statistics', async () => {
    const { status, data } = await fetchJson('/api/v1/export/stats');
    assert.strictEqual(status, 200);
    assert.strictEqual(data.success, true);
    assert.ok(data.stats.totalExports > 0);
  });

  server.close();
}

// ═══════════════════════════════════════════════════════════════════════════
// 10. MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

async function testModuleExports() {
  section('10. Module Exports');

  await test('visualization/index.js exports GraphExportService', () => {
    const mod = require('../../src/services/visualization');
    assert.ok(mod.GraphExportService);
    assert.ok(mod.graphExportService);
    assert.ok(mod.graphExportService instanceof mod.GraphExportService);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// RUN ALL
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  console.log('\u2551  Task 9.3 \u2014 Export Formats                     \u2551');
  console.log('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');

  await testCypher();
  await testGraphML();
  await testJSONLD();
  await testGEXF();
  await testCSV();
  await testJSON();
  await testUnifiedExport();
  await testFiltering();
  await testExportRoutes();
  await testModuleExports();

  console.log('\n\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log('\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550');

  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
