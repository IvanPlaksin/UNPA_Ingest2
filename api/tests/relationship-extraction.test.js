/**
 * Relationship Extraction Tests
 * Tests for pattern-based and co-occurrence relationship extraction
 */

const {
  extractRelationships,
  getRelationshipStats,
  DEPENDENCY_PATTERNS
} = require('../src/services/extraction/relationship-extractor');

const { EntityExtractor } = require('../src/services/extraction/entity-extractor');

// Test text with explicit relationships
const TEST_TEXT = `The UN ProjectAdvisor uses Memgraph for graph storage and Qdrant for vector search.
Memgraph serves as the primary graph database for storing entity relationships.
Redis handles caching through BullMQ for job queue management.
The frontend is built with React and communicates via REST API.
TEI generates embeddings that are stored in Qdrant.
OICT manages the system following ST/AI/2023/1 guidelines.`;

// Entities extracted (simulating prior extraction)
const TEST_ENTITIES = [
  { name: 'ProjectAdvisor', type: 'SYSTEM' },
  { name: 'Memgraph', type: 'DATABASE' },
  { name: 'Qdrant', type: 'DATABASE' },
  { name: 'Redis', type: 'DATABASE' },
  { name: 'BullMQ', type: 'TECHNOLOGY' },
  { name: 'React', type: 'TECHNOLOGY' },
  { name: 'TEI', type: 'TECHNOLOGY' },
  { name: 'OICT', type: 'ORGANIZATION' },
];

// Expected relationships
const EXPECTED_RELATIONSHIPS = [
  { source: 'ProjectAdvisor', target: 'Memgraph', type: 'USES' },
  { source: 'Memgraph', target: 'database', type: 'IS_A' },
  { source: 'Redis', target: 'caching', type: 'HANDLES' },
  { source: 'TEI', target: 'embeddings', type: 'GENERATES' },
];

console.log('='.repeat(60));
console.log('Relationship Extraction Tests');
console.log('='.repeat(60));

// Test 1: Dependency patterns
console.log('\n📊 Test 1: Dependency Patterns');
console.log('-'.repeat(40));

console.log(`Total dependency patterns: ${DEPENDENCY_PATTERNS.length}`);
DEPENDENCY_PATTERNS.forEach((p, i) => {
  console.log(`  ${i + 1}. ${p.type} (confidence: ${p.confidence})`);
});

// Test 2: Pattern-based extraction
console.log('\n📊 Test 2: Pattern-based Relationship Extraction');
console.log('-'.repeat(40));

const relationships = extractRelationships(TEST_TEXT, TEST_ENTITIES, {
  includeCoOccurrence: false,
  minConfidence: 0.5
});

console.log(`\nPattern-based relationships found: ${relationships.length}`);
relationships.forEach(r => {
  console.log(`  ${r.source} --[${r.type}]--> ${r.target}`);
  console.log(`    Confidence: ${r.confidence}, Evidence: "${r.evidence.substring(0, 50)}..."`);
});

// Test 3: Co-occurrence extraction
console.log('\n📊 Test 3: Co-occurrence Relationship Extraction');
console.log('-'.repeat(40));

const coOccurrenceRels = extractRelationships(TEST_TEXT, TEST_ENTITIES, {
  includeCoOccurrence: true,
  minConfidence: 0.5
});

const patternOnly = coOccurrenceRels.filter(r => r.extractionMethod === 'pattern');
const coOccurrenceOnly = coOccurrenceRels.filter(r => r.extractionMethod === 'co-occurrence');

console.log(`Pattern-based: ${patternOnly.length}`);
console.log(`Co-occurrence: ${coOccurrenceOnly.length}`);
console.log(`Total: ${coOccurrenceRels.length}`);

console.log('\nCo-occurrence relationships:');
coOccurrenceOnly.slice(0, 5).forEach(r => {
  console.log(`  ${r.source} <--[${r.type}]--> ${r.target} (conf: ${r.confidence.toFixed(2)})`);
});

// Test 4: Full EntityExtractor with relationships
console.log('\n📊 Test 4: Full EntityExtractor with Relationships');
console.log('-'.repeat(40));

async function testFullExtraction() {
  const extractor = new EntityExtractor({
    useLLM: false,  // Disable LLM to test regex-only
    useRegex: true,
    extractRelationships: true,
    minConfidence: 0.5
  });

  const result = await extractor.extract(TEST_TEXT);

  console.log('\nExtraction Results:');
  console.log(`  Entities: ${result.entities.length}`);
  console.log(`  Relationships: ${result.relationships.length}`);
  console.log(`  Stats:`, result.stats);

  console.log('\nEntities:');
  result.entities.forEach(e => {
    console.log(`  - ${e.name} (${e.type})`);
  });

  console.log('\nRelationships:');
  result.relationships.forEach(r => {
    console.log(`  ${r.source} --[${r.type}]--> ${r.target} (conf: ${r.confidence.toFixed(2)})`);
  });

  // Statistics
  const stats = getRelationshipStats(result.relationships);
  console.log('\nRelationship Statistics:');
  console.log(`  Total: ${stats.count}`);
  console.log(`  By Type:`, stats.byType);
  console.log(`  By Method:`, stats.byMethod);
  console.log(`  Avg Confidence: ${stats.avgConfidence}`);

  return result;
}

// Test 5: Check expected relationships
console.log('\n📊 Test 5: Expected Relationship Coverage');
console.log('-'.repeat(40));

function checkExpectedRelationships(relationships) {
  let found = 0;
  const missing = [];

  EXPECTED_RELATIONSHIPS.forEach(expected => {
    const match = relationships.find(r =>
      r.source.toLowerCase().includes(expected.source.toLowerCase()) &&
      r.type === expected.type
    );

    if (match) {
      found++;
      console.log(`  ✅ ${expected.source} --[${expected.type}]--> ${expected.target}`);
    } else {
      missing.push(expected);
      console.log(`  ❌ ${expected.source} --[${expected.type}]--> ${expected.target} - MISSING`);
    }
  });

  const coverage = (found / EXPECTED_RELATIONSHIPS.length * 100).toFixed(1);
  console.log(`\n📈 Coverage: ${found}/${EXPECTED_RELATIONSHIPS.length} (${coverage}%)`);

  return { found, missing, coverage };
}

// Run async tests
testFullExtraction()
  .then(result => {
    const coverage = checkExpectedRelationships(result.relationships);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    console.log(`\n✓ Entities extracted: ${result.entities.length}`);
    console.log(`✓ Relationships extracted: ${result.relationships.length}`);
    console.log(`✓ Expected relationship coverage: ${coverage.coverage}%`);

    if (result.relationships.length > 0) {
      console.log('\n✅ RELATIONSHIP EXTRACTION TEST PASSED');
      process.exit(0);
    } else {
      console.log('\n⚠️  No relationships extracted');
      process.exit(1);
    }
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
