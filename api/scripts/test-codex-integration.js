/**
 * Test Codex integration into agent system prompts
 */

const { agentBootstrapService, AgentBootstrapService } = require('../src/services/agents/AgentBootstrapService');

async function testAgentBootstrapIntegration() {
  console.log('Testing Codex → AgentBootstrap Integration\n');
  console.log('='.repeat(60));

  try {
    const service = agentBootstrapService;

    // Test 1: Scope resolution
    console.log('\nTest 1: Codex scope resolution...');
    const gxeScopes = service._resolveCodexScopes('agent-gxe-assistant-v1');
    console.log(`   agent-gxe-assistant-v1 → [${gxeScopes.join(', ')}]`);
    const extractionScopes = service._resolveCodexScopes('agent-extraction-sql');
    console.log(`   agent-extraction-sql → [${extractionScopes.join(', ')}]`);
    const unknownScopes = service._resolveCodexScopes('agent-unknown');
    console.log(`   agent-unknown → [${unknownScopes.join(', ')}]`);

    // Test 2: Full bootstrap with Codex
    console.log('\nTest 2: Full bootstrap (includes Codex)...');
    const result = await service.bootstrap('agent-gxe-assistant-v1');

    console.log(`   Agent: ${result.agentProfile.name}`);
    console.log(`   Knowledge sections: ${result.knowledgeSections.length}`);
    console.log(`   System context length: ${result.systemContext.length} chars`);

    // Check if Codex rules are in the system context
    const hasCodexRules = result.systemContext.includes('<codex_rules>');
    const hasCodexEnd = result.systemContext.includes('</codex_rules>');
    console.log(`   Contains <codex_rules>: ${hasCodexRules}`);
    console.log(`   Contains </codex_rules>: ${hasCodexEnd}`);

    if (hasCodexRules) {
      const codexStart = result.systemContext.indexOf('<codex_rules>');
      const codexEnd = result.systemContext.indexOf('</codex_rules>') + '</codex_rules>'.length;
      const codexBlock = result.systemContext.substring(codexStart, codexEnd);
      console.log(`   Codex block size: ${codexBlock.length} chars (~${Math.ceil(codexBlock.length / 4)} tokens)`);

      // Count rules in block
      const mustCount = (codexBlock.match(/\[CODEX-RULE/g) || []).length;
      console.log(`   Rules referenced: ${mustCount}`);
    }

    // Test 3: Graph builder prompt
    console.log('\nTest 3: Graph Builder prompt with Codex...');
    const { buildSystemPrompt } = require('../src/services/ai/prompts/graph-builder-system.prompt');
    const codexLoader = require('../src/services/codex/codex-loader.service');
    const codexResult = await codexLoader.loadForGxeAssistant();

    const prompt = buildSystemPrompt({
      executorCatalog: [],
      currentGraph: null,
      typeCatalog: [],
      codexRules: codexResult.prompt
    });

    const hasGovernance = prompt.includes('# GOVERNANCE RULES');
    console.log(`   Contains GOVERNANCE RULES section: ${hasGovernance}`);
    console.log(`   Total prompt length: ${prompt.length} chars (~${Math.ceil(prompt.length / 4)} tokens)`);

    console.log('\n' + '='.repeat(60));
    const allPassed = hasCodexRules && hasCodexEnd && hasGovernance;
    console.log(`Integration test: ${allPassed ? 'PASSED' : 'FAILED'}`);
    console.log('='.repeat(60));

    return allPassed;

  } catch (error) {
    console.error('\nTest FAILED:', error.message);
    console.error(error.stack);
    return false;
  }
}

if (require.main === module) {
  testAgentBootstrapIntegration()
    .then(passed => process.exit(passed ? 0 : 1))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { testAgentBootstrapIntegration };
