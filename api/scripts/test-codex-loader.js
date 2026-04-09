/**
 * Test Codex Loader functionality
 */

const { codexLoader } = require('../src/services/codex');

async function testCodexLoader() {
  console.log('Testing Codex Loader\n');
  console.log('='.repeat(50));

  try {
    // Test 1: Load for GXE Assistant
    console.log('\nTest 1: Load for GXE Assistant...');
    const gxeResult = await codexLoader.loadForGxeAssistant();
    console.log(`   Token estimate: ~${gxeResult.tokenEstimate}`);
    console.log(`   Principles: ${gxeResult.metadata.counts.principles}`);
    console.log(`   Rules: ${gxeResult.metadata.counts.rules}`);
    console.log(`   Patterns: ${gxeResult.metadata.counts.patterns}`);
    console.log(`   Anti-patterns: ${gxeResult.metadata.counts.antiPatterns}`);
    console.log('\n   Preview (first 500 chars):');
    console.log('   ' + gxeResult.prompt.substring(0, 500).replace(/\n/g, '\n   '));

    // Test 2: Load for specific scopes
    console.log('\n\nTest 2: Load for scopes [crud, versioning]...');
    const scopedResult = await codexLoader.loadForScope(['crud', 'versioning'], {
      format: 'prompt',
      includeAntiPatterns: true
    });
    console.log(`   Token estimate: ~${scopedResult.tokenEstimate}`);
    console.log(`   Rules loaded: ${scopedResult.metadata.counts.rules}`);

    // Test 3: Load full as JSON
    console.log('\nTest 3: Load full as JSON...');
    const jsonResult = await codexLoader.loadFull();
    console.log(`   Principles: ${jsonResult.principles.length}`);
    console.log(`   Rules: ${jsonResult.rules.length}`);
    console.log(`   Patterns: ${jsonResult.patterns.length}`);

    // Test 4: Get specific rule
    console.log('\nTest 4: Get specific rule CODEX-RULE-001...');
    const ruleResult = await codexLoader.getRule('CODEX-RULE-001');
    if (ruleResult) {
      console.log(`   Rule: ${ruleResult.rule.title}`);
      console.log(`   Anti-patterns: ${ruleResult.antiPatterns.length}`);
    }

    // Test 5: Cache test
    console.log('\nTest 5: Cache test...');
    codexLoader.clearCache();
    const start1 = Date.now();
    await codexLoader.loadForGxeAssistant();
    const time1 = Date.now() - start1;

    const start2 = Date.now();
    await codexLoader.loadForGxeAssistant();
    const time2 = Date.now() - start2;

    console.log(`   First load: ${time1}ms`);
    console.log(`   Cached load: ${time2}ms`);
    console.log(`   Cache works: ${time2 <= time1 ? 'YES' : 'NO'}`);

    console.log('\n' + '='.repeat(50));
    console.log('Codex Loader tests PASSED!');
    console.log('='.repeat(50));

    return true;

  } catch (error) {
    console.error('\nTest FAILED:', error.message);
    console.error(error.stack);
    return false;
  }
}

if (require.main === module) {
  testCodexLoader()
    .then(passed => process.exit(passed ? 0 : 1))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { testCodexLoader };
