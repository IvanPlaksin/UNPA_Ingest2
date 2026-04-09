/**
 * FlowDesk: Ticket routing — rule-based and AI-powered
 *
 * Routes tickets to the appropriate queue/assignee based on:
 * - Category mapping (default)
 * - Custom routing rules (rule-based)
 * - AI classification (Claude-powered, opt-in)
 */

const { BaseExecutor } = require('../../plugin-base');

// Fallback queue mappings (used when KB unavailable)
const DEFAULT_QUEUES_FALLBACK = {
  'IT-HW':       'hardware-support',
  'IT-SW':       'software-support',
  'IT-NET':      'network-ops',
  'IT-SEC':      'security-team',
  'IT-ACC':      'access-mgmt',
  'HR':          'hr-services',
  'FACILITIES':  'facilities-mgmt',
  'GENERAL':     'general-support'
};

let _configLoader = null;
function getConfigLoader() {
  if (!_configLoader) {
    try {
      const { getFlowDeskConfigLoader } = require('../../../../../services/flowdesk/config-loader.service');
      _configLoader = getFlowDeskConfigLoader();
    } catch { _configLoader = null; }
  }
  return _configLoader;
}

class RouteTicketExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.route_ticket';
    this.displayName = 'Route Ticket';
    this.description = 'Route a ticket to the appropriate queue based on rules, category, or AI';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        ticketId: { type: 'string', description: 'Ticket ID to route' },
        category: { type: 'string', description: 'Ticket category for default routing' },
        title: { type: 'string', description: 'Ticket title (for AI routing)' },
        description: { type: 'string', description: 'Ticket description (for AI routing)' },
        priority: { type: 'string' },
        rules: {
          type: 'array',
          description: 'Custom routing rules [{condition, targetQueue, targetAssignee, priority}]',
          items: { type: 'object' }
        },
        useAI: { type: 'boolean', default: false, description: 'Use Claude for intelligent routing' }
      },
      required: []
    };
  }

  async execute(parameters, context) {
    const ticketId = this.getParam(parameters, 'ticketId', null);
    const rules = this.getParam(parameters, 'rules', null);
    const useAI = this.getParam(parameters, 'useAI', false);

    let routingDecision;

    if (rules && rules.length > 0) {
      routingDecision = this._ruleBasedRouting(parameters, rules);
    } else if (useAI && context?.executionContext?.llm) {
      routingDecision = await this._aiRouting(parameters, context);
    } else {
      routingDecision = this._defaultRouting(parameters);
    }

    // Apply routing to ticket in Memgraph if ticketId provided
    const memgraph = context?.executionContext?.memgraph || context?.memgraph;
    if (ticketId && memgraph) {
      try {
        await memgraph.runQuery(`
          MATCH (t:FlowDeskTicket {ticketId: $ticketId})
          SET t.queue = $queue, t.routedAt = $now, t.routingMethod = $method, t.updatedAt = $now
        `, {
          ticketId,
          queue: routingDecision.queue,
          now: new Date().toISOString(),
          method: routingDecision.method
        });
      } catch (err) {
        console.warn('[FlowDesk] Memgraph routing update failed:', err.message);
      }
    }

    console.log(`[FlowDesk] Routed ${ticketId || 'ticket'} → ${routingDecision.queue} (${routingDecision.method})`);

    return this.success({
      ticketId,
      queue: routingDecision.queue,
      assignee: routingDecision.assignee,
      method: routingDecision.method,
      matchedRule: routingDecision.matchedRule || null,
      reasoning: routingDecision.reasoning || null,
      branch: 'routed'
    });
  }

  async _defaultRouting(params) {
    const category = this.getParam(params, 'category', 'GENERAL');
    const prefix = category.split('-').slice(0, 2).join('-');

    // Try KB-driven queue mappings first
    const loader = getConfigLoader();
    let queueMap = DEFAULT_QUEUES_FALLBACK;
    if (loader) {
      try { queueMap = await loader.getQueueMapping() || DEFAULT_QUEUES_FALLBACK; } catch {}
    }

    const queue = queueMap[prefix] || queueMap[category] || 'general-support';
    return { queue, assignee: null, method: 'category-default' };
  }

  _ruleBasedRouting(params, rules) {
    const sorted = [...rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    for (const rule of sorted) {
      if (this._evalCondition(rule.condition, params)) {
        return {
          queue: rule.targetQueue,
          assignee: rule.targetAssignee || null,
          method: 'rule-based',
          matchedRule: rule.condition
        };
      }
    }

    return this._defaultRouting(params);
  }

  _evalCondition(condition, params) {
    if (!condition) return false;
    // Format: "field:op:value" e.g. "priority:eq:critical"
    const [field, op, value] = condition.split(':');
    const actual = params[field];
    switch (op) {
      case 'eq':         return actual === value;
      case 'ne':         return actual !== value;
      case 'contains':   return typeof actual === 'string' && actual.includes(value);
      case 'startsWith': return typeof actual === 'string' && actual.startsWith(value);
      default: return false;
    }
  }

  async _aiRouting(params, context) {
    try {
      const llm = context.executionContext.llm;
      const title = this.getParam(params, 'title', '');
      const description = this.getParam(params, 'description', '');
      const queues = Object.values(DEFAULT_QUEUES).join(', ');

      const response = await llm.chat([
        { role: 'system', content: `You are a ticket routing AI for UN IT service desk. Route the ticket to one of these queues: ${queues}. Respond with JSON only: {"queue":"<queue>","reasoning":"<1 sentence>"}` },
        { role: 'user', content: `Title: ${title}\nDescription: ${description}\nCategory: ${params.category || 'unknown'}` }
      ], { max_tokens: 200 });

      const result = JSON.parse(response);
      return { queue: result.queue, assignee: null, method: 'ai-routing', reasoning: result.reasoning };
    } catch (err) {
      console.warn('[FlowDesk] AI routing failed, falling back:', err.message);
      return this._defaultRouting(params);
    }
  }
}

module.exports = { RouteTicketExecutor };
