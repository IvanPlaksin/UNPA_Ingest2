/**
 * FlowDesk Routing Rules Extractor
 *
 * Extracts routing logic: domain→handler mapping, scope-based routing,
 * queue assignment rules from graph-routing.js and config-loader.
 *
 * @module services/workspace/extraction/flowdesk/routing-rules
 */

'use strict';

const fs = require('fs');
const path = require('path');

const LOG_PREFIX = '[RoutingExtractor]';
const CATALOG_PATH = path.resolve(__dirname, '../../../../services/flowdesk/data/service-catalog.json');

// Default queue mappings (from config-loader.service.js)
const DEFAULT_QUEUE_MAP = {
  'IT-HW': 'hardware-support',
  'IT-SW': 'software-support',
  'IT-NET': 'network-support',
  'IT-ACC': 'access-management',
  'HR': 'hr-services',
  'FAC': 'facilities',
  'SEC': 'security',
  'COM': 'communications',
  'FIN': 'finance',
  'LOG': 'logistics'
};

/**
 * Extract routing rules → DraftBusinessRule
 */
async function extractRoutingRules(options = {}) {
  const log = [];
  const addLog = (msg) => log.push({ timestamp: new Date().toISOString(), step: 'ROUTING', message: msg });
  const rules = [];

  try {
    const catalog = JSON.parse(fs.readFileSync(options.catalogPath || CATALOG_PATH, 'utf-8'));
    const queueMap = options.queueMap || DEFAULT_QUEUE_MAP;

    // 1. Domain → Queue routing rules
    for (const [prefix, queue] of Object.entries(queueMap)) {
      rules.push({
        type: 'business_rule',
        name: `Route ${prefix} → ${queue}`,
        description: `Route service requests with code prefix ${prefix} to queue ${queue}`,
        confidence: 1.0,
        content: {
          ruleType: 'DERIVATION',
          condition: {
            expression: `request.serviceCode.startsWith('${prefix}')`,
            entities: ['ServiceRequest'], fields: ['serviceCode']
          },
          action: {
            type: 'SET_VALUE',
            target: 'request.assignedQueue',
            value: queue,
            description: `Assign to ${queue} queue`
          },
          enforcement: 'MANDATORY',
          scope: { domain: 'FLOWDESK', prefix }
        }
      });
    }
    addLog(`Extracted ${Object.keys(queueMap).length} queue routing rules`);

    // 2. Approval routing rules
    const approvalServices = catalog.filter(s => s.approval_required);
    for (const svc of approvalServices) {
      rules.push({
        type: 'business_rule',
        name: `Approval Required: ${svc.code}`,
        description: `${svc.name} requires manager approval before processing`,
        confidence: 1.0,
        content: {
          ruleType: 'AUTHORIZATION',
          condition: {
            expression: `request.serviceCode == '${svc.code}'`,
            entities: ['ServiceRequest']
          },
          action: {
            type: 'SEND_NOTIFICATION',
            target: 'request.approver',
            description: 'Route to manager for approval'
          },
          enforcement: 'MANDATORY',
          scope: { domain: svc.domain_code, serviceCode: svc.code }
        }
      });
    }
    addLog(`Extracted ${approvalServices.length} approval routing rules`);

    // 3. Scope-based routing rules (mission/regional/global)
    rules.push({
      type: 'business_rule',
      name: 'Scope Routing: Mission Level',
      description: 'Route to local handler when service available at mission/duty station level',
      confidence: 0.9,
      content: {
        ruleType: 'DERIVATION',
        condition: { expression: 'handler.scope == "MISSION" AND user.dutyStation == handler.location' },
        action: { type: 'SET_VALUE', target: 'request.handler', description: 'Assign to local mission handler' },
        enforcement: 'RECOMMENDED',
        metadata: { routingPriority: 1, scope: 'MISSION' }
      }
    });
    rules.push({
      type: 'business_rule',
      name: 'Scope Routing: Regional Level',
      description: 'Route to regional handler when no mission-level handler available',
      confidence: 0.9,
      content: {
        ruleType: 'DERIVATION',
        condition: { expression: 'handler.scope == "REGIONAL" AND user.region == handler.region' },
        action: { type: 'SET_VALUE', target: 'request.handler', description: 'Assign to regional handler' },
        enforcement: 'RECOMMENDED',
        metadata: { routingPriority: 2, scope: 'REGIONAL' }
      }
    });
    rules.push({
      type: 'business_rule',
      name: 'Scope Routing: Global Fallback',
      description: 'Route to HQ/global handler when no local or regional handler available',
      confidence: 0.9,
      content: {
        ruleType: 'DERIVATION',
        condition: { expression: 'NO mission handler AND NO regional handler' },
        action: { type: 'SET_VALUE', target: 'request.handler', description: 'Assign to global HQ handler' },
        enforcement: 'MANDATORY',
        metadata: { routingPriority: 3, scope: 'GLOBAL' }
      }
    });
    addLog('Extracted 3 scope-based routing rules');

    addLog(`Total routing rules: ${rules.length}`);

    return {
      success: true,
      rules,
      stats: {
        queueRules: Object.keys(queueMap).length,
        approvalRules: approvalServices.length,
        scopeRules: 3,
        totalRules: rules.length
      },
      log
    };
  } catch (error) {
    addLog(`ERROR: ${error.message}`);
    return { success: false, error: error.message, rules: [], log };
  }
}

module.exports = { extractRoutingRules, DEFAULT_QUEUE_MAP };
