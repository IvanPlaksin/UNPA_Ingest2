/**
 * FlowDesk: Ticket lifecycle management (create, update, close, escalate, assign)
 *
 * Uses Memgraph for persistence via executionContext.
 * Falls back to in-memory store when Memgraph is unavailable.
 */

const { BaseExecutor } = require('../../plugin-base');
const crypto = require('crypto');

// In-memory fallback store
const tickets = new Map();

class ManageTicketExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.manage_ticket';
    this.displayName = 'Manage Ticket';
    this.description = 'Create, update, close, escalate, or assign a FlowDesk ticket';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['create', 'update', 'close', 'escalate', 'assign', 'get', 'list'],
          description: 'Ticket operation to perform'
        },
        ticketId: { type: 'string', description: 'Ticket ID (required for update/close/escalate/assign/get)' },
        title: { type: 'string' },
        description: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        category: { type: 'string' },
        requester: { type: 'string' },
        assignee: { type: 'string' },
        reason: { type: 'string', description: 'Reason for escalation or closure' },
        status: { type: 'string', description: 'Filter for list operation' }
      },
      required: ['operation']
    };
  }

  static getTicket(id) { return tickets.get(id); }
  static getAllTickets() { return [...tickets.values()]; }

  async execute(parameters, context) {
    const operation = this.getRequiredParam(parameters, 'operation');
    const memgraph = context?.executionContext?.memgraph || context?.memgraph;

    switch (operation) {
      case 'create':  return this._create(parameters, memgraph);
      case 'update':  return this._update(parameters, memgraph);
      case 'close':   return this._close(parameters, memgraph);
      case 'escalate':return this._escalate(parameters, memgraph);
      case 'assign':  return this._assign(parameters, memgraph);
      case 'get':     return this._get(parameters, memgraph);
      case 'list':    return this._list(parameters, memgraph);
      default:
        return this.error('INVALID_OP', `Unknown operation: ${operation}`);
    }
  }

  async _create(params, memgraph) {
    const ticketId = 'TKT-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    const now = new Date().toISOString();

    const ticket = {
      ticketId,
      title: this.getRequiredParam(params, 'title'),
      description: this.getParam(params, 'description', ''),
      priority: this.getParam(params, 'priority', 'medium'),
      category: this.getParam(params, 'category', 'general'),
      requester: this.getParam(params, 'requester', 'unknown'),
      assignee: this.getParam(params, 'assignee', null),
      status: 'open',
      queue: null,
      createdAt: now,
      updatedAt: now,
      history: [{ action: 'CREATED', at: now }]
    };

    tickets.set(ticketId, ticket);

    if (memgraph) {
      try {
        await memgraph.runQuery(`
          CREATE (t:FlowDeskTicket {
            ticketId: $ticketId, title: $title, description: $description,
            priority: $priority, category: $category, status: 'open',
            requester: $requester, assignee: $assignee,
            createdAt: $now, updatedAt: $now, namespace: 'FLOWDESK'
          })
        `, { ticketId, title: ticket.title, description: ticket.description,
             priority: ticket.priority, category: ticket.category,
             requester: ticket.requester, assignee: ticket.assignee, now });
      } catch (err) {
        console.warn('[FlowDesk] Memgraph write failed, using in-memory:', err.message);
      }
    }

    console.log(`[FlowDesk] Ticket created: ${ticketId}`);
    return this.success({ ticketId, ...ticket, branch: 'ticket_created' });
  }

  async _update(params, memgraph) {
    const ticketId = this.getRequiredParam(params, 'ticketId');
    const now = new Date().toISOString();
    const ticket = tickets.get(ticketId);
    if (!ticket) return this.error('NOT_FOUND', `Ticket ${ticketId} not found`);

    const updates = {};
    for (const field of ['title', 'description', 'priority', 'category', 'assignee', 'status']) {
      if (params[field] !== undefined) {
        ticket[field] = params[field];
        updates[field] = params[field];
      }
    }
    ticket.updatedAt = now;
    ticket.history.push({ action: 'UPDATED', fields: Object.keys(updates), at: now });

    if (memgraph && Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map(k => `t.${k} = $${k}`).join(', ');
      try {
        await memgraph.runQuery(
          `MATCH (t:FlowDeskTicket {ticketId: $ticketId}) SET ${setClauses}, t.updatedAt = $now`,
          { ticketId, ...updates, now }
        );
      } catch (err) {
        console.warn('[FlowDesk] Memgraph update failed:', err.message);
      }
    }

    return this.success({ ticketId, updated: Object.keys(updates), branch: 'ticket_updated' });
  }

  async _close(params, memgraph) {
    const ticketId = this.getRequiredParam(params, 'ticketId');
    const reason = this.getParam(params, 'reason', 'Resolved');
    const now = new Date().toISOString();
    const ticket = tickets.get(ticketId);
    if (!ticket) return this.error('NOT_FOUND', `Ticket ${ticketId} not found`);

    ticket.status = 'closed';
    ticket.closedAt = now;
    ticket.closureReason = reason;
    ticket.updatedAt = now;
    ticket.history.push({ action: 'CLOSED', reason, at: now });

    if (memgraph) {
      try {
        await memgraph.runQuery(`
          MATCH (t:FlowDeskTicket {ticketId: $ticketId})
          SET t.status = 'closed', t.closedAt = $now, t.closureReason = $reason, t.updatedAt = $now
        `, { ticketId, now, reason });
      } catch (err) {
        console.warn('[FlowDesk] Memgraph close failed:', err.message);
      }
    }

    return this.success({ ticketId, status: 'closed', branch: 'ticket_closed' });
  }

  async _escalate(params, memgraph) {
    const ticketId = this.getRequiredParam(params, 'ticketId');
    const reason = this.getParam(params, 'reason', 'Manual escalation');
    const now = new Date().toISOString();
    const ticket = tickets.get(ticketId);
    if (!ticket) return this.error('NOT_FOUND', `Ticket ${ticketId} not found`);

    ticket.priority = 'critical';
    ticket.escalatedAt = now;
    ticket.escalationReason = reason;
    ticket.updatedAt = now;
    ticket.history.push({ action: 'ESCALATED', reason, at: now });

    if (memgraph) {
      try {
        await memgraph.runQuery(`
          MATCH (t:FlowDeskTicket {ticketId: $ticketId})
          SET t.priority = 'critical', t.escalatedAt = $now,
              t.escalationReason = $reason, t.updatedAt = $now
        `, { ticketId, now, reason });
      } catch (err) {
        console.warn('[FlowDesk] Memgraph escalate failed:', err.message);
      }
    }

    return this.success({ ticketId, priority: 'critical', branch: 'ticket_escalated' });
  }

  async _assign(params, memgraph) {
    const ticketId = this.getRequiredParam(params, 'ticketId');
    const assignee = this.getRequiredParam(params, 'assignee');
    const now = new Date().toISOString();
    const ticket = tickets.get(ticketId);
    if (!ticket) return this.error('NOT_FOUND', `Ticket ${ticketId} not found`);

    ticket.assignee = assignee;
    ticket.assignedAt = now;
    ticket.updatedAt = now;
    ticket.history.push({ action: 'ASSIGNED', assignee, at: now });

    if (memgraph) {
      try {
        await memgraph.runQuery(`
          MATCH (t:FlowDeskTicket {ticketId: $ticketId})
          SET t.assignee = $assignee, t.assignedAt = $now, t.updatedAt = $now
        `, { ticketId, assignee, now });
      } catch (err) {
        console.warn('[FlowDesk] Memgraph assign failed:', err.message);
      }
    }

    return this.success({ ticketId, assignee, branch: 'ticket_assigned' });
  }

  async _get(params, memgraph) {
    const ticketId = this.getRequiredParam(params, 'ticketId');

    // Try memgraph first
    if (memgraph) {
      try {
        const result = await memgraph.runQuery(
          'MATCH (t:FlowDeskTicket {ticketId: $ticketId}) RETURN t',
          { ticketId }
        );
        if (result.length > 0) {
          return this.success({ ticket: result[0].t, source: 'memgraph' });
        }
      } catch (err) { /* fallback */ }
    }

    const ticket = tickets.get(ticketId);
    if (!ticket) return this.error('NOT_FOUND', `Ticket ${ticketId} not found`);
    return this.success({ ticket, source: 'memory' });
  }

  async _list(params, memgraph) {
    const statusFilter = this.getParam(params, 'status', null);

    if (memgraph) {
      try {
        const cypher = statusFilter
          ? 'MATCH (t:FlowDeskTicket {status: $status}) RETURN t ORDER BY t.createdAt DESC LIMIT 100'
          : 'MATCH (t:FlowDeskTicket) RETURN t ORDER BY t.createdAt DESC LIMIT 100';
        const result = await memgraph.runQuery(cypher, { status: statusFilter });
        return this.success({ tickets: result.map(r => r.t), count: result.length, source: 'memgraph' });
      } catch (err) { /* fallback */ }
    }

    let all = [...tickets.values()];
    if (statusFilter) all = all.filter(t => t.status === statusFilter);
    return this.success({ tickets: all, count: all.length, source: 'memory' });
  }
}

module.exports = { ManageTicketExecutor };
