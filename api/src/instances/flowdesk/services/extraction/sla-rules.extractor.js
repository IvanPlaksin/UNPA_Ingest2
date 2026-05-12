/**
 * FlowDesk SLA Rules Extractor
 *
 * Extracts SLA definitions from config-loader and service catalog.
 * Creates DraftBusinessRule nodes for response/resolution/escalation rules.
 *
 * @module services/workspace/extraction/flowdesk/sla-rules
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[SLARulesExtractor]';

// Default SLA matrix (from config-loader.service.js)
const DEFAULT_SLA = {
  CRITICAL: { responseHours: 1, resolutionHours: 4 },
  HIGH:     { responseHours: 2, resolutionHours: 8 },
  MEDIUM:   { responseHours: 4, resolutionHours: 24 },
  LOW:      { responseHours: 8, resolutionHours: 72 }
};

const ESCALATION_THRESHOLDS = [
  { percent: 50, action: 'NOTIFY_HANDLER' },
  { percent: 75, action: 'NOTIFY_MANAGER' },
  { percent: 90, action: 'ESCALATE_TO_MANAGER' },
  { percent: 100, action: 'BREACH_ALERT' }
];

/**
 * Extract SLA rules → DraftBusinessRule
 * @param {Object} [options]
 * @param {Object} [options.slaMatrix] - Override SLA matrix
 * @returns {Promise<{success, rules[], stats, log[]}>}
 */
async function extractSLARules(options = {}) {
  const log = [];
  const addLog = (msg) => log.push({ timestamp: new Date().toISOString(), step: 'SLA_RULES', message: msg });

  const slaMatrix = options.slaMatrix || DEFAULT_SLA;
  const priorities = Object.keys(slaMatrix);
  addLog(`Extracting SLA rules for ${priorities.length} priority levels`);

  const rules = [];

  for (const priority of priorities) {
    const sla = slaMatrix[priority];

    // Response time rule
    rules.push({
      type: 'business_rule',
      name: `SLA ${priority} Response Time`,
      description: `Tickets with ${priority} priority must receive initial response within ${sla.responseHours}h`,
      confidence: 1.0,
      content: {
        ruleType: 'CONSTRAINT',
        condition: { expression: `ticket.priority == '${priority}'`, entities: ['Ticket'], fields: ['priority'] },
        action: { type: 'SET_VALUE', target: 'ticket.slaResponseDeadline', description: `${sla.responseHours} hours from creation` },
        enforcement: 'MANDATORY',
        priority: priorityToNum(priority),
        scope: { domain: 'FLOWDESK', systems: ['TicketSystem'] },
        metadata: { slaType: 'RESPONSE', hours: sla.responseHours }
      }
    });

    // Resolution time rule
    rules.push({
      type: 'business_rule',
      name: `SLA ${priority} Resolution Time`,
      description: `Tickets with ${priority} priority must be resolved within ${sla.resolutionHours}h`,
      confidence: 1.0,
      content: {
        ruleType: 'CONSTRAINT',
        condition: { expression: `ticket.priority == '${priority}'`, entities: ['Ticket'], fields: ['priority'] },
        action: { type: 'SET_VALUE', target: 'ticket.slaResolutionDeadline', description: `${sla.resolutionHours} hours from creation` },
        enforcement: 'MANDATORY',
        priority: priorityToNum(priority),
        scope: { domain: 'FLOWDESK', systems: ['TicketSystem'] },
        metadata: { slaType: 'RESOLUTION', hours: sla.resolutionHours }
      }
    });

    // Escalation rules
    for (const threshold of ESCALATION_THRESHOLDS) {
      rules.push({
        type: 'business_rule',
        name: `SLA ${priority} Escalation at ${threshold.percent}%`,
        description: `Trigger ${threshold.action} when ${threshold.percent}% of ${priority} SLA consumed`,
        confidence: 1.0,
        content: {
          ruleType: 'TRIGGER',
          condition: {
            expression: `ticket.priority == '${priority}' AND ticket.slaPercentUsed >= ${threshold.percent}`,
            entities: ['Ticket'], fields: ['priority', 'slaPercentUsed']
          },
          action: {
            type: threshold.action.startsWith('ESCALATE') ? 'ESCALATE' : 'SEND_NOTIFICATION',
            description: threshold.action.replace(/_/g, ' ').toLowerCase(),
            target: threshold.action
          },
          enforcement: 'MANDATORY',
          priority: priorityToNum(priority),
          scope: { domain: 'FLOWDESK', systems: ['TicketSystem', 'NotificationSystem'] },
          metadata: { slaPriority: priority, thresholdPercent: threshold.percent }
        }
      });
    }
  }

  addLog(`Extracted ${rules.length} SLA rules (${priorities.length} priorities × 2 SLA + 4 escalation)`);

  return {
    success: true,
    rules,
    stats: { priorities: priorities.length, totalRules: rules.length },
    log
  };
}

function priorityToNum(p) {
  return { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 }[p] || 3;
}

module.exports = { extractSLARules, DEFAULT_SLA, ESCALATION_THRESHOLDS };
