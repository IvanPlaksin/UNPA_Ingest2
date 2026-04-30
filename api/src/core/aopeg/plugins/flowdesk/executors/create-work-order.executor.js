/**
 * FlowDesk: Create Work Order
 *
 * Persists WO to Memgraph with FULFILLS edge to ServiceRequest.
 * BACKLOG-0041: Fixed to use Memgraph instead of in-memory only.
 */

const { BaseExecutor } = require('../../plugin-base');
const crypto = require('crypto');

// Lazy-load Memgraph
let _mg = null;
function mg() {
  if (!_mg) {
    try { _mg = require('../../../../../services/memgraph.service'); } catch(e) { console.warn('[FlowDesk] Memgraph require failed:', e.message); _mg = null; }
  }
  return _mg;
}

class CreateWorkOrderExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.create_work_order';
    this.displayName = 'Create Work Order';
    this.description = 'Create a work order linked to a service request in Memgraph';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        type: { type: 'string', default: 'GENERAL' },
        sla_hours: { type: 'number', default: 72 },
        handlerId: { type: 'string' },
        handlerName: { type: 'string' },
      },
    };
  }

  async execute(parameters, context) {
    const woId = 'WO-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    // requestId can come from: parameters, upstream node output, or execution context
    let requestId = parameters.requestId;
    if (!requestId && context?.executionContext) {
      // Look for requestId in any upstream node output
      const outputs = context.executionContext.nodeOutputs || {};
      for (const [, output] of Object.entries(outputs)) {
        if (output?.requestId) { requestId = output.requestId; break; }
      }
    }
    const slaHours = this.getParam(parameters, 'sla_hours', 72);

    const wo = {
      id: woId,
      requestId,
      type: this.getParam(parameters, 'type', 'GENERAL'),
      status: 'OPEN',
      slaHours,
      dueDate: new Date(Date.now() + slaHours * 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    // Persist to Memgraph with FULFILLS edge
    const memgraph = context?.executionContext?.memgraph || mg();
    if (memgraph && requestId) {
      try {
        await memgraph.executeQuery(`
          MATCH (sr:ServiceRequest {id: $requestId})
          CREATE (wo:WorkOrder {
            id: $woId, sr_id: $requestId, type: $type, status: "OPEN",
            sla_hours: $slaHours, due_date: $dueDate,
            namespace: "FLOWDESK", created_at: localDateTime()
          })-[:FULFILLS]->(sr)
          RETURN wo.id AS id
        `, {
          requestId,
          woId,
          type: wo.type,
          slaHours,
          dueDate: wo.dueDate
        });
        console.log(`[FlowDesk] WO created in Memgraph: ${woId} → FULFILLS → ${requestId}`);
      } catch (err) {
        console.warn(`[FlowDesk] Memgraph write failed for WO ${woId}:`, err.message);
      }
    } else {
      console.log(`[FlowDesk] WO created (no Memgraph): ${woId} for ${requestId}`);
    }

    return this.success({ workOrderId: woId, ...wo });
  }
}

module.exports = { CreateWorkOrderExecutor };
