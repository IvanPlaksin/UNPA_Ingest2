/**
 * FlowDesk: SLA monitoring and automatic escalation
 *
 * Checks individual or all open tickets against SLA thresholds.
 * Auto-escalates breached tickets when enabled.
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');

// Fallback SLA definitions (used when KB unavailable)
const SLA_TARGETS_FALLBACK = {
  critical: { response: 1,  resolution: 4   },
  high:     { response: 4,  resolution: 24  },
  medium:   { response: 8,  resolution: 48  },
  low:      { response: 24, resolution: 168 } // 7 days
};

// KB-driven config loader (lazy init)
let _configLoader = null;
function getConfigLoader() {
  if (!_configLoader) {
    try {
      const { getFlowDeskConfigLoader } = require('../../services/config-loader.service.js');
      _configLoader = getFlowDeskConfigLoader();
    } catch { _configLoader = null; }
  }
  return _configLoader;
}

class CheckSLAExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.check_sla';
    this.displayName = 'Check SLA';
    this.description = 'Check SLA compliance for tickets and optionally auto-escalate breaches';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['check', 'checkAll', 'getBreached'],
          description: 'SLA operation'
        },
        ticketId: { type: 'string', description: 'Ticket ID for single check' },
        autoEscalate: { type: 'boolean', default: true, description: 'Automatically escalate breached tickets' }
      },
      required: ['operation']
    };
  }

  async execute(parameters, context) {
    const operation = this.getRequiredParam(parameters, 'operation');
    const memgraph = context?.executionContext?.memgraph || context?.memgraph;
    const autoEscalate = this.getParam(parameters, 'autoEscalate', true);

    switch (operation) {
      case 'check':
        return this._checkOne(this.getRequiredParam(parameters, 'ticketId'), memgraph, autoEscalate);
      case 'checkAll':
        return this._checkAll(memgraph, autoEscalate);
      case 'getBreached':
        return this._getBreached(memgraph);
      default:
        return this.error('INVALID_OP', `Unknown operation: ${operation}`);
    }
  }

  async _checkOne(ticketId, memgraph, autoEscalate) {
    let ticket;

    if (memgraph) {
      try {
        const result = await memgraph.runQuery(
          'MATCH (t:FlowDeskTicket {ticketId: $ticketId}) WHERE t.status <> "closed" RETURN t',
          { ticketId }
        );
        if (result.length > 0) ticket = result[0].t;
      } catch (err) { /* fallback */ }
    }

    // Fallback to in-memory
    if (!ticket) {
      const { ManageTicketExecutor } = require('./manage-ticket.executor.js');
      ticket = ManageTicketExecutor.getTicket(ticketId);
    }

    if (!ticket || ticket.status === 'closed') {
      return this.success({ ticketId, status: 'not_found_or_closed', branch: 'no_check_needed' });
    }

    // Load SLA config from KB (with fallback to hardcoded defaults)
    const loader = getConfigLoader();
    let slaConfig;
    if (loader) {
      try { slaConfig = await loader.getSLAConfig(ticket.priority); } catch {}
    }
    const sla = slaConfig
      ? { response: slaConfig.responseHours, resolution: slaConfig.resolutionHours }
      : (SLA_TARGETS_FALLBACK[ticket.priority] || SLA_TARGETS_FALLBACK.medium);
    const hoursOpen = (Date.now() - new Date(ticket.createdAt).getTime()) / (3600 * 1000);

    const result = {
      ticketId,
      priority: ticket.priority,
      hoursOpen: Math.round(hoursOpen * 10) / 10,
      responseTarget: sla.response,
      resolutionTarget: sla.resolution,
      responseBreached: hoursOpen > sla.response && !ticket.respondedAt,
      resolutionBreached: hoursOpen > sla.resolution,
      breached: false,
      escalated: false
    };

    result.breached = result.responseBreached || result.resolutionBreached;

    if (result.breached && autoEscalate && memgraph) {
      const breachType = result.resolutionBreached ? 'resolution' : 'response';
      try {
        await memgraph.runQuery(`
          MATCH (t:FlowDeskTicket {ticketId: $ticketId})
          SET t.slaBreached = true, t.slaBreachType = $breachType,
              t.slaBreachedAt = $now, t.updatedAt = $now
        `, { ticketId, breachType, now: new Date().toISOString() });
        result.escalated = true;
      } catch (err) {
        console.warn('[FlowDesk] SLA escalation write failed:', err.message);
      }
    }

    result.branch = result.breached ? 'sla_breached' : 'sla_ok';
    return this.success(result);
  }

  async _checkAll(memgraph, autoEscalate) {
    let openTickets = [];

    if (memgraph) {
      try {
        const result = await memgraph.runQuery(
          'MATCH (t:FlowDeskTicket) WHERE t.status <> "closed" RETURN t.ticketId AS ticketId'
        );
        openTickets = result.map(r => r.ticketId);
      } catch (err) {
        // Fallback to in-memory
        const { ManageTicketExecutor } = require('./manage-ticket.executor.js');
        openTickets = ManageTicketExecutor.getAllTickets()
          .filter(t => t.status !== 'closed')
          .map(t => t.ticketId);
      }
    } else {
      const { ManageTicketExecutor } = require('./manage-ticket.executor.js');
      openTickets = ManageTicketExecutor.getAllTickets()
        .filter(t => t.status !== 'closed')
        .map(t => t.ticketId);
    }

    const results = [];
    for (const ticketId of openTickets) {
      const check = await this._checkOne(ticketId, memgraph, autoEscalate);
      if (check.success) results.push(check.output);
    }

    const breachedCount = results.filter(r => r.breached).length;

    return this.success({
      checked: results.length,
      breached: breachedCount,
      results,
      branch: breachedCount > 0 ? 'has_breaches' : 'all_ok'
    });
  }

  async _getBreached(memgraph) {
    if (memgraph) {
      try {
        const result = await memgraph.runQuery(
          'MATCH (t:FlowDeskTicket) WHERE t.slaBreached = true AND t.status <> "closed" RETURN t ORDER BY t.slaBreachedAt'
        );
        return this.success({ tickets: result.map(r => r.t), count: result.length });
      } catch (err) { /* fallback */ }
    }

    const { ManageTicketExecutor } = require('./manage-ticket.executor.js');
    const breached = ManageTicketExecutor.getAllTickets().filter(t => t.slaBreached && t.status !== 'closed');
    return this.success({ tickets: breached, count: breached.length });
  }
}

module.exports = { CheckSLAExecutor };
