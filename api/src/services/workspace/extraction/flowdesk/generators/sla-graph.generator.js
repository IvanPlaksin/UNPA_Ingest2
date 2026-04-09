/**
 * SLA Decision Graph Generator
 *
 * Generates executable GXE graphs for SLA decision logic.
 * Input: ticket priority → Output: response/resolution times + escalation rules
 *
 * @module services/workspace/extraction/flowdesk/generators/sla-graph
 */

'use strict';

const { GxeGraphBuilder } = require('../gxe-builder');

/**
 * Generate SLA decision graph from extracted rules
 * @param {Array} slaRules - DraftBusinessRule items from SLA extractor
 * @returns {Object} GXE graph definition
 */
function generateSLADecisionGraph(slaRules) {
  const byPriority = {};

  for (const rule of slaRules) {
    const meta = rule.content?.metadata;
    if (!meta?.slaPriority) continue;
    const p = meta.slaPriority;
    if (!byPriority[p]) byPriority[p] = { response: null, resolution: null, escalations: [] };

    if (meta.slaType === 'RESPONSE') byPriority[p].response = meta;
    else if (meta.slaType === 'RESOLUTION') byPriority[p].resolution = meta;
    else if (rule.content?.ruleType === 'TRIGGER') byPriority[p].escalations.push(meta);
  }

  const cases = Object.entries(byPriority).map(([priority, data]) => ({
    value: priority,
    label: priority,
    assignments: [
      { target: 'sla.responseTime', value: data.response?.originalValue || data.response?.hours + 'h' || '24h' },
      { target: 'sla.resolutionTime', value: data.resolution?.originalValue || data.resolution?.hours + 'h' || '72h' },
      { target: 'sla.responseMinutes', expression: String(timeToMinutes(data.response?.hours)) },
      { target: 'sla.resolutionMinutes', expression: String(timeToMinutes(data.resolution?.hours)) },
      { target: 'sla.escalationThresholds', value: data.escalations.map(e => ({ percent: e.thresholdPercent, action: e.escalationAction })) }
    ]
  }));

  return GxeGraphBuilder.createDecisionTableGraph(
    'flowdesk.sla.decision',
    { switchOn: 'ticket.priority', cases, actions: {} },
    {
      namespace: 'FLOWDESK',
      description: 'SLA decision graph — determines response/resolution times based on ticket priority',
      inputs: [{ name: 'ticket.priority', type: 'string', required: true }],
      defaultAssignments: [
        { target: 'sla.responseTime', value: '8h' },
        { target: 'sla.resolutionTime', value: '72h' },
        { target: 'sla.responseMinutes', expression: '480' },
        { target: 'sla.resolutionMinutes', expression: '4320' }
      ],
      metadata: { generatedFrom: 'sla-rules', ruleCount: slaRules.length }
    }
  );
}

/**
 * Generate SLA escalation check graph
 */
function generateSLAEscalationGraph() {
  const b = new GxeGraphBuilder({ namespace: 'FLOWDESK', metadata: { generatedFrom: 'sla-escalation-rules' } });
  const start = b.addStartNode('Check SLA', {
    inputs: [{ name: 'ticket.slaPercentUsed', type: 'number', required: true }, { name: 'ticket.priority', type: 'string', required: true }]
  });

  const thresholds = [100, 90, 75, 50];
  const actions = { 100: 'BREACH_ALERT', 90: 'ESCALATE_TO_MANAGER', 75: 'NOTIFY_MANAGER', 50: 'NOTIFY_HANDLER' };
  let prev = start;

  for (const t of thresholds) {
    const cond = b.addConditionNode(`SLA >= ${t}%?`, `ticket.slaPercentUsed >= ${t}`);
    b.connect(prev.id, cond.id);
    const action = b.addActionNode(`Escalation: ${actions[t]}`, 'flowdesk.escalate', { threshold: t, action: actions[t] });
    b.connect(cond.id, action.id, 'true', 'true');
    prev = cond;
  }

  const endEsc = b.addEndNode('Escalation Triggered');
  const endNo = b.addEndNode('No Escalation Needed');
  b.connect(prev.id, endNo.id, 'false', 'false');

  b.autoLayout();
  return b.build('flowdesk.sla.escalation', 'SLA escalation check — triggers escalation based on SLA consumption percentage');
}

function timeToMinutes(hours) {
  if (!hours) return 1440;
  return (typeof hours === 'number' ? hours : parseInt(hours)) * 60;
}

module.exports = { generateSLADecisionGraph, generateSLAEscalationGraph };
