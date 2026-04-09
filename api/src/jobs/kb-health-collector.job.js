'use strict';

/**
 * KB Health Collector Job
 *
 * Periodically computes KB health metrics and stores them in Redis.
 * Designed to be called via setInterval from StartupManager.
 * Recommended interval: 15 minutes.
 */

const { getKBHealthService } = require('../services/kb-health/kb-health.service');

function createKBHealthCollector(logger) {
  const log = logger || console;

  async function run() {
    try {
      const svc = getKBHealthService();
      const result = await svc.computeHealthMetrics();

      log.info(`[KBHealthCollector] Score: ${result.healthScore} (${result.status}) — ${result.computeTimeMs}ms`);

      if (result.status === 'critical' || result.status === 'failing') {
        log.warn(`[KBHealthCollector] KB health degraded! Score: ${result.healthScore}, Status: ${result.status}`);
      }

      return result;
    } catch (err) {
      log.error(`[KBHealthCollector] Failed: ${err.message}`);
      return null;
    }
  }

  function schedule(intervalMs) {
    // Run once immediately, then on interval
    run();
    return setInterval(run, intervalMs);
  }

  return { run, schedule };
}

module.exports = { createKBHealthCollector };
