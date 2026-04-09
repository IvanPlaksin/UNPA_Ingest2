/**
 * Integration test for Codex Governance workflow
 * Tests full proposal lifecycle: submit -> review -> approve -> apply
 */

const { codexService, codexGovernance, codexValidator } = require('../src/services/codex');

async function testGovernanceWorkflow() {
  console.log('Testing Codex Governance Workflow\n');
  console.log('='.repeat(50));

  try {
    // 1. Submit a proposal
    console.log('\nStep 1: Submit proposal...');
    const proposal = await codexGovernance.submitProposal({
      proposalType: 'CREATE',
      title: 'Test Pattern: Error Logging',
      summary: 'Standard pattern for error logging in services',
      rationale: 'Consistent error logging improves debugging and monitoring across all services',
      examples: ['logger.error({ code: "ERR001", message: "..." })'],
      agentConfidence: 0.85,
      proposedChanges: {
        nodeType: 'CodexPattern',
        title: 'Error Logging Pattern',
        summary: 'Standardized approach to error logging across all services',
        rationale: 'Consistent logging enables better debugging and monitoring',
        whyItExists: 'Agent identified inconsistent logging patterns across services',
        examples: [
          'Use structured logging with error codes',
          'Include context object with relevant state'
        ],
        implementsRule: 'CODEX-RULE-015',
        modality: 'SHOULD',
        scope: ['services', 'controllers'],
        tags: ['logging', 'error-handling', 'pattern']
      }
    }, { agentId: 'test-agent' });

    console.log(`   + Proposal created: ${proposal.proposal.codexId}`);
    console.log(`   Status: ${proposal.status}`);

    const proposalId = proposal.proposal.codexId;

    // 2. Check pending proposals
    console.log('\nStep 2: Check pending proposals...');
    const pending = await codexGovernance.getPendingProposals();
    console.log(`   + Pending proposals: ${pending.length}`);

    // 3. Start review
    console.log('\nStep 3: Start review...');
    const reviewed = await codexGovernance.startReview(proposalId, 'test-reviewer');
    console.log(`   + Status changed to: ${reviewed.reviewStatus}`);

    // 4. Approve proposal
    console.log('\nStep 4: Approve proposal...');
    const approved = await codexGovernance.approveProposal(
      proposalId,
      'test-reviewer',
      'Looks good, approved for testing'
    );
    console.log(`   + Status: APPROVED`);

    // 5. Apply proposal
    console.log('\nStep 5: Apply proposal...');
    const applied = await codexGovernance.applyProposal(proposalId, { adminId: 'test-admin' });
    const resultCodexId = applied.result?.codexId || applied.result?.properties?.codexId;
    console.log(`   + Applied! New node: ${resultCodexId}`);

    // 6. Verify new pattern exists
    console.log('\nStep 6: Verify new pattern...');
    const patterns = await codexService.getByType('CodexPattern');
    console.log(`   + Patterns found: ${patterns.length}`);

    // 7. Get stats
    console.log('\nStep 7: Proposal stats...');
    const stats = await codexGovernance.getProposalStats();
    console.log(`   Total proposals: ${stats.total}`);
    console.log(`   By status:`, JSON.stringify(stats.byStatus));

    // 8. Validate Codex
    console.log('\nStep 8: Validate Codex...');
    const validation = await codexValidator.validateCodex();
    console.log(`   Completeness Score: ${validation.completenessScore}`);
    console.log(`   Status: ${validation.summary.passed ? 'PASSED' : 'FAILED'}`);

    console.log('\n' + '='.repeat(50));
    console.log('Governance workflow test PASSED!');
    console.log('='.repeat(50));

    return true;

  } catch (error) {
    console.error('\nTest FAILED:', error.message);
    return false;
  }
}

async function testRejectionOfFrozenNode() {
  console.log('\nTesting Rejection of FROZEN Node\n');

  try {
    await codexGovernance.submitProposal({
      proposalType: 'MODIFY',
      targetCodexId: 'CODEX-PRINCIPLE-001',
      rationale: 'Testing rejection',
      agentConfidence: 0.5,
      proposedChanges: { title: 'Modified Title' }
    }, { agentId: 'test-agent' });

    console.log('   x Should have thrown error for FROZEN node');
    return false;

  } catch (error) {
    if (error.message.includes('FROZEN')) {
      console.log('   + Correctly rejected modification of FROZEN node');
      return true;
    }
    console.error('   x Unexpected error:', error.message);
    return false;
  }
}

async function runAllTests() {
  const results = {
    governance: await testGovernanceWorkflow(),
    frozenRejection: await testRejectionOfFrozenNode()
  };

  console.log('\nTest Results:');
  console.log(`   Governance workflow: ${results.governance ? 'PASS' : 'FAIL'}`);
  console.log(`   Frozen rejection:   ${results.frozenRejection ? 'PASS' : 'FAIL'}`);

  const allPassed = Object.values(results).every(r => r);
  process.exit(allPassed ? 0 : 1);
}

if (require.main === module) {
  runAllTests().catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { testGovernanceWorkflow, testRejectionOfFrozenNode };
