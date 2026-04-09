/**
 * CC-031: Test StartupManager initialization
 *
 * Verifies that StartupManager correctly initializes OrphanDetector
 * and TombstoneExpirer, provides health status, and shuts down cleanly.
 *
 * Usage: node api/scripts/test-startup-manager.js
 */

'use strict';

async function main() {
  const checks = [];
  const check = (name, pass) => {
    checks.push({ name, pass });
    console.log(`  ${pass ? '✅' : '❌'} ${name}`);
  };

  console.log('=== CC-031: Test StartupManager ===\n');

  // 1. Import and create fresh instance
  console.log('Step 1: Creating StartupManager...');
  const { StartupManager } = require('../src/services/startup/StartupManager');
  const manager = new StartupManager(console);
  check('StartupManager instantiated', !!manager);

  // 2. Initialize
  console.log('\nStep 2: Initializing...');
  await manager.initialize();
  check('Initialized without error', manager._initialized === true);

  // 3. Check timers registered
  console.log('\nStep 3: Checking registered jobs...');
  check('Has scheduled jobs', manager.timers.length > 0);
  console.log(`  Jobs: ${manager.timers.map(t => t.name).join(', ')}`);

  const hasOrphan = manager.timers.some(t => t.name === 'OrphanDetector');
  const hasTombstone = manager.timers.some(t => t.name === 'TombstoneExpirer');
  check('OrphanDetector registered', hasOrphan);
  check('TombstoneExpirer registered', hasTombstone);

  // 4. Check strict validation
  console.log('\nStep 4: Checking strict validation...');
  check('strictValidation is boolean', typeof manager.strictValidation === 'boolean');

  // 5. Health status
  console.log('\nStep 5: Getting health status...');
  const health = manager.getHealthStatus();
  check('Health has initialized flag', health.initialized === true);
  check('Health has jobs array', Array.isArray(health.jobs));
  check('Health has strictValidation', typeof health.strictValidation === 'boolean');
  console.log('  Health:', JSON.stringify(health, null, 2));

  // 6. Double init protection
  console.log('\nStep 6: Double initialization protection...');
  const timersBefore = manager.timers.length;
  await manager.initialize();
  check('No duplicate timers on re-init', manager.timers.length === timersBefore);

  // 7. Shutdown
  console.log('\nStep 7: Shutdown...');
  await manager.shutdown();
  check('All timers cleared', manager.timers.length === 0);
  check('Initialized reset', manager._initialized === false);

  // Summary
  const passed = checks.filter(c => c.pass).length;
  const total = checks.length;
  console.log(`\n=== CC-031 Summary: ${passed}/${total} checks passed ===`);

  if (passed === total) {
    console.log('✅ ALL PASSED — StartupManager works correctly');
  } else {
    console.log('⚠️  Some checks failed — review output above');
  }

  process.exit(passed === total ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
