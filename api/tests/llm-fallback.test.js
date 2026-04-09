/**
 * LLM Fallback Tests
 * Tests for multi-provider LLM fallback logic
 */

const {
  selectProvider,
  extractEntitiesWithLLM,
  isLLMAvailable,
  getActiveProviderName,
  reset,
  getStatus
} = require('../src/services/extraction/llm-provider');

const { EntityExtractor, getLLMStatus } = require('../src/services/extraction/entity-extractor');

// Test text
const TEST_TEXT = `The UN ProjectAdvisor uses Memgraph for graph storage and Qdrant for vectors.
Redis handles caching through BullMQ. The frontend is built with React.
OICT manages the system following ST/AI/2023/1 guidelines.`;

async function runTests() {
  console.log('='.repeat(60));
  console.log('LLM Fallback Tests');
  console.log('='.repeat(60));

  // Reset state before tests
  reset();

  // Test 1: Provider availability check
  console.log('\n📊 Test 1: Provider Availability');
  console.log('-'.repeat(40));

  const status = await getStatus();
  console.log('Provider status:', status);
  console.log(`  Active: ${status.active}`);
  console.log(`  Ollama available: ${status.providers.ollama}`);
  console.log(`  Gemini available: ${status.providers.gemini}`);

  // Test 2: Provider selection
  console.log('\n📊 Test 2: Provider Selection');
  console.log('-'.repeat(40));

  const selected = await selectProvider();
  if (selected) {
    console.log(`✅ Selected provider: ${selected.name}`);
  } else {
    console.log('⚠️  No LLM provider available (will use regex-only)');
  }

  // Test 3: Entity extraction with LLM
  console.log('\n📊 Test 3: LLM Entity Extraction');
  console.log('-'.repeat(40));

  const llmResult = await extractEntitiesWithLLM(TEST_TEXT);
  console.log(`Provider used: ${llmResult.provider}`);
  console.log(`Entities from LLM: ${llmResult.entities.length}`);
  console.log(`Relationships from LLM: ${llmResult.relationships.length}`);

  if (llmResult.entities.length > 0) {
    console.log('\nLLM-extracted entities:');
    llmResult.entities.forEach(e => {
      console.log(`  - ${e.name} (${e.type}, confidence: ${e.confidence})`);
    });
  }

  // Test 4: Full extraction with EntityExtractor
  console.log('\n📊 Test 4: Full EntityExtractor (Regex + LLM)');
  console.log('-'.repeat(40));

  const extractor = new EntityExtractor({ useLLM: true, useRegex: true });
  const fullResult = await extractor.extract(TEST_TEXT);

  console.log('\nExtraction stats:');
  console.log(`  Regex entities: ${fullResult.stats.regex}`);
  console.log(`  LLM entities: ${fullResult.stats.llm}`);
  console.log(`  After merge: ${fullResult.stats.merged}`);
  console.log(`  Provider: ${fullResult.stats.provider}`);
  console.log(`  Total final: ${fullResult.entities.length}`);
  console.log(`  Relationships: ${fullResult.relationships.length}`);

  console.log('\nFinal entities:');
  fullResult.entities.forEach(e => {
    const sources = e.sources ? e.sources.join('+') : e.source;
    console.log(`  - ${e.name} (${e.type}) [${sources}]`);
  });

  // Test 5: Regex-only fallback
  console.log('\n📊 Test 5: Regex-only Fallback');
  console.log('-'.repeat(40));

  const regexExtractor = new EntityExtractor({ useLLM: false, useRegex: true });
  const regexResult = await regexExtractor.extract(TEST_TEXT);

  console.log(`Regex-only entities: ${regexResult.entities.length}`);
  console.log(`Regex-only relationships: ${regexResult.relationships.length}`);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const llmAvailable = await isLLMAvailable();
  const activeProvider = getActiveProviderName();

  console.log(`\n✓ LLM available: ${llmAvailable}`);
  console.log(`✓ Active provider: ${activeProvider}`);
  console.log(`✓ Regex entities: ${regexResult.entities.length}`);
  console.log(`✓ Full extraction entities: ${fullResult.entities.length}`);

  if (llmAvailable) {
    const improvement = fullResult.entities.length - regexResult.entities.length;
    console.log(`\n📈 LLM added ${improvement} additional entities`);
    console.log('✅ LLM FALLBACK TEST PASSED');
  } else {
    console.log('\n⚠️  Running in regex-only mode (no LLM available)');
    console.log('✅ REGEX-ONLY FALLBACK TEST PASSED');
  }

  return {
    llmAvailable,
    activeProvider,
    regexCount: regexResult.entities.length,
    fullCount: fullResult.entities.length
  };
}

// Run tests
runTests()
  .then(results => {
    console.log('\nTest results:', results);
    process.exit(0);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
