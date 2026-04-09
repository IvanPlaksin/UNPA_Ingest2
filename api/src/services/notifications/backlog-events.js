/**
 * BackLog Event Handlers — wires backlog events to notification system.
 *
 * Listens to: backlogService.on('change'), cycleService.on('change'),
 * circuitBreaker.on('breaker')
 */

'use strict';

const notificationService = require('./notification.service');

function setupBacklogEventHandlers() {
  // BackLog task changes
  try {
    const backlogService = require('../backlog/backlog.service');
    backlogService.on('change', ({ event, data }) => {
      if (event === 'task_created') {
        notificationService.notifyTaskStatus(data.backlogId, '-', data.status, data.title);
      } else if (event === 'task_updated' && data.previousStatus) {
        notificationService.notifyTaskStatus(data.backlogId, data.previousStatus, data.status, data.title);
      }
    });
  } catch { /* service not ready */ }

  // Execution cycle changes
  try {
    const cycleService = require('../backlog/execution-cycle.service');
    cycleService.on('change', ({ event, data }) => {
      if (event === 'phase_changed') {
        notificationService.notifyCyclePhase(data.cycleId, data.backlogId, data.phase, data.iteration || 0);
      }
      if (event === 'review_submitted') {
        notificationService.notifyReviewVerdict(data.cycleId, data.backlogId, data.verdict);
      }
    });
  } catch { /* service not ready */ }

  // Circuit breaker alerts
  try {
    const circuitBreaker = require('../backlog/circuit-breaker.service');
    circuitBreaker.on('breaker', ({ level, cycleId, tokens, threshold }) => {
      notificationService.notifyTokenAlert(cycleId, level, tokens || 0, threshold || 0);
    });
  } catch { /* service not ready */ }

  console.log('[Notifications] BackLog event handlers registered');
}

module.exports = { setupBacklogEventHandlers };
