'use strict';

/**
 * Metacognition Cycle Job
 *
 * Full cycle: DETECT → PROPOSE → EXECUTE (auto-approved)
 * Designed to be called via setInterval from StartupManager.
 * Recommended interval: 1 hour.
 */

const { getMetacognitionService } = require('../services/metacognition/metacognition.service');

function createMetacognitionCycleJob(logger) {
  const log = logger || console;

  async function run() {
    const svc = getMetacognitionService();

    try {
      // Phase 1: DETECT
      log.info('[MetacognitionCycle] Starting detection...');
      const issues = await svc.detectStructuralIssues();

      if (issues.length === 0) {
        log.info('[MetacognitionCycle] No issues found. KB is healthy.');
        return { issues: 0, proposals: 0, executed: 0 };
      }

      log.info(`[MetacognitionCycle] Found ${issues.length} issues`);

      // Phase 2: PROPOSE
      const proposals = await svc.createProposalsFromIssues(issues);
      log.info(`[MetacognitionCycle] Created ${proposals.length} proposals`);

      // Phase 3: EXECUTE auto-approved (L0, L1)
      const executed = await svc.executeAutoApproved();
      const successCount = executed.filter(r => r.status === 'executed').length;
      const failCount = executed.filter(r => r.status === 'failed').length;

      log.info(`[MetacognitionCycle] Executed: ${successCount} ok, ${failCount} failed, ${proposals.length - executed.length} pending review`);

      return {
        issues: issues.length,
        proposals: proposals.length,
        executed: successCount,
        failed: failCount,
        pendingReview: proposals.length - executed.length
      };
    } catch (err) {
      log.error(`[MetacognitionCycle] Failed: ${err.message}`);
      return null;
    }
  }

  function schedule(intervalMs) {
    // First run after 5 min (let services stabilize)
    setTimeout(run, 5 * 60 * 1000);
    return setInterval(run, intervalMs);
  }

  return { run, schedule };
}

module.exports = { createMetacognitionCycleJob };
