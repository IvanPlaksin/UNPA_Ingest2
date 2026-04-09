/**
 * Entity Extraction Tests
 * Tests for extended technology pattern recognition
 */

const {
  extractAllEntities,
  extractExtendedTechnologyEntities,
  EXTENDED_TECHNOLOGY_PATTERNS
} = require('../src/config/un-entities.config');

const { EntityExtractor } = require('../src/services/extraction/entity-extractor');

// Test text simulating real pipeline documentation
const TEST_TEXT = `The UN ProjectAdvisor is an innovative knowledge management platform.
Memgraph serves as the graph database for storing entity relationships.
Qdrant provides vector storage for semantic search capabilities.
Redis handles caching through BullMQ for job queue management.
TEI (Text Embeddings Inference) generates embeddings for the documents.

The system uses LangChain for RAG pipelines and integrates with Ollama
for local LLM inference. The frontend is built with React and communicates
via REST API and WebSocket for real-time updates using SSE.

The MCP protocol enables Claude integration for AI-powered analysis.
OICT maintains the system according to ST/AI/2023/1 guidelines.`;

// Expected entities from the test text
const EXPECTED_ENTITIES = [
  { name: 'ProjectAdvisor', type: 'System' },
  { name: 'Memgraph', type: 'Database' },
  { name: 'Qdrant', type: 'Database' },
  { name: 'Redis', type: 'Database' },
  { name: 'BullMQ', type: 'Queue' },
  { name: 'TEI', type: 'AI' },
  { name: 'LangChain', type: 'AI' },
  { name: 'Ollama', type: 'AI' },
  { name: 'React', type: 'Framework' },
  { name: 'REST', type: 'Protocol' },
  { name: 'WebSocket', type: 'Protocol' },
  { name: 'SSE', type: 'Protocol' },
  { name: 'MCP', type: 'Protocol' },
  { name: 'OICT', type: 'Organization' }
];

// Run tests
console.log('='.repeat(60));
console.log('Entity Extraction Tests');
console.log('='.repeat(60));

// Test 1: extractExtendedTechnologyEntities
console.log('\n📊 Test 1: extractExtendedTechnologyEntities()');
console.log('-'.repeat(40));

const techResults = extractExtendedTechnologyEntities(TEST_TEXT);

console.log('\nDatabases found:', techResults.databases.length);
techResults.databases.forEach(e => console.log(`  ✓ ${e.name} (${e.subType || e.category})`));

console.log('\nQueues found:', techResults.queues.length);
techResults.queues.forEach(e => console.log(`  ✓ ${e.name}`));

console.log('\nAI Services found:', techResults.aiServices.length);
techResults.aiServices.forEach(e => console.log(`  ✓ ${e.name} (${e.subType || e.category})`));

console.log('\nFrameworks found:', techResults.frameworks.length);
techResults.frameworks.forEach(e => console.log(`  ✓ ${e.name}`));

console.log('\nProtocols found:', techResults.protocols.length);
techResults.protocols.forEach(e => console.log(`  ✓ ${e.name}`));

console.log('\nProject-specific found:', techResults.project.length);
techResults.project.forEach(e => console.log(`  ✓ ${e.name}`));

// Test 2: extractAllEntities (combined)
console.log('\n📊 Test 2: extractAllEntities() - Combined');
console.log('-'.repeat(40));

const allResults = extractAllEntities(TEST_TEXT);

console.log('\nTotal entities by category:');
console.log(`  Systems: ${allResults.systems.length}`);
console.log(`  Documents: ${allResults.documents.length}`);
console.log(`  Organizations: ${allResults.organizations.length}`);
console.log(`  Technologies: ${allResults.technologies.length}`);

// Test 3: EntityExtractor class
console.log('\n📊 Test 3: EntityExtractor.extractWithRegex()');
console.log('-'.repeat(40));

const extractor = new EntityExtractor({ useLLM: false, useRegex: true });
const extracted = extractor.extractWithRegex(TEST_TEXT);

console.log(`\nTotal entities extracted: ${extracted.length}`);

// Group by type
const byType = {};
extracted.forEach(e => {
  byType[e.type] = (byType[e.type] || []);
  byType[e.type].push(e.name);
});

Object.entries(byType).forEach(([type, names]) => {
  console.log(`\n  ${type}: ${names.length}`);
  names.forEach(n => console.log(`    - ${n}`));
});

// Test 4: Coverage check
console.log('\n📊 Test 4: Expected Entity Coverage');
console.log('-'.repeat(40));

const extractedNames = new Set(extracted.map(e => e.name.toLowerCase()));
let found = 0;
let missing = [];

EXPECTED_ENTITIES.forEach(expected => {
  const normalized = expected.name.toLowerCase();
  if (extractedNames.has(normalized)) {
    found++;
    console.log(`  ✅ ${expected.name}`);
  } else {
    missing.push(expected.name);
    console.log(`  ❌ ${expected.name} - MISSING`);
  }
});

const coverage = (found / EXPECTED_ENTITIES.length * 100).toFixed(1);
console.log(`\n📈 Coverage: ${found}/${EXPECTED_ENTITIES.length} (${coverage}%)`);

if (missing.length > 0) {
  console.log(`\n⚠️  Missing entities: ${missing.join(', ')}`);
}

// Summary
console.log('\n' + '='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log(`\n✓ Extended tech patterns: ${allResults.technologies.length} entities`);
console.log(`✓ Total regex entities: ${extracted.length}`);
console.log(`✓ Coverage: ${coverage}%`);

if (coverage >= 80) {
  console.log('\n✅ TEST PASSED: Coverage >= 80%');
  process.exit(0);
} else {
  console.log('\n❌ TEST FAILED: Coverage < 80%');
  process.exit(1);
}
