/**
 * Test Codex Self-Consistency Check
 */

const consistencyRunner = require('../src/services/codex/codex-consistency-runner');

async function testConsistencyCheck() {
  console.log('Testing Codex Self-Consistency Check\n');
  console.log('='.repeat(60));

  try {
    // Test 1: List available checks
    console.log('\nTest 1: Available checks...');
    const checks = consistencyRunner.getAvailableChecks();
    console.log(`   ${checks.length} checks: ${checks.join(', ')}`);

    // Test 2: Quick health check
    console.log('\nTest 2: Health check...');
    const health = await consistencyRunner.healthCheck();
    console.log(`   Status: ${health.status}`);
    console.log(`   Counts:`, JSON.stringify(health.counts));
    if (health.issues.length > 0) {
      console.log(`   Issues: ${health.issues.join(', ')}`);
    }

    // Test 3: Run individual check
    console.log('\nTest 3: Run validate-principles check...');
    const principlesResult = await consistencyRunner.runCheck('validate-principles');
    console.log(`   Passed: ${principlesResult.passed}`);
    console.log(`   Findings: ${principlesResult.findings.length}`);
    if (principlesResult.findings.length > 0) {
      principlesResult.findings.slice(0, 3).forEach(f => {
        console.log(`   - [${f.severity}] ${f.code}: ${f.message}`);
      });
    }

    // Test 4: Full consistency check (verbose)
    console.log('\nTest 4: Full consistency check...');
    const report = await consistencyRunner.run({ verbose: true });

    // Display report
    console.log('\n' + '='.repeat(60));
    console.log('CODEX CONSISTENCY REPORT');
    console.log('='.repeat(60));
    console.log(`Status:     ${report.status}`);
    console.log(`Duration:   ${report.durationMs}ms`);
    console.log(`Checks:     ${report.summary.passedChecks}/${report.summary.totalChecks} passed`);
    console.log(`Errors:     ${report.summary.errors}`);
    console.log(`Warnings:   ${report.summary.warnings}`);
    console.log(`Info:       ${report.summary.info}`);

    if (report.findings.length > 0) {
      console.log('\nFindings:');
      report.findings.forEach(f => {
        const icon = f.severity === 'ERROR' ? 'x' : f.severity === 'WARNING' ? '!' : 'i';
        console.log(`   [${icon}] ${f.severity} ${f.code}: ${f.message}`);
      });
    }

    if (report.recommendations.length > 0) {
      console.log('\nRecommendations:');
      report.recommendations.forEach(r => {
        console.log(`   [${r.priority}] ${r.action}`);
        if (r.script) console.log(`           Run: ${r.script}`);
      });
    }

    console.log('\nNode counts:', JSON.stringify(report.counts));

    console.log('\n' + '='.repeat(60));
    console.log(`Self-Consistency Check: ${report.status}`);
    console.log('='.repeat(60));

    return report.status !== 'FAILED';

  } catch (error) {
    console.error('\nTest FAILED:', error.message);
    console.error(error.stack);
    return false;
  }
}

if (require.main === module) {
  testConsistencyCheck()
    .then(passed => process.exit(passed ? 0 : 1))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { testConsistencyCheck };
