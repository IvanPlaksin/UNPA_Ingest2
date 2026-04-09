/**
 * FlowDesk: Create Work Order
 */

const { BaseExecutor } = require('../../plugin-base');
const crypto = require('crypto');

class CreateWorkOrderExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.create_work_order';
    this.displayName = 'Create Work Order';
    this.description = 'Create a work order linked to a service request';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        type: { type: 'string', default: 'GENERAL' },
        sla_hours: { type: 'number', default: 72 },
      },
    };
  }

  async execute(parameters) {
    const wo = {
      id: 'WO-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      requestId: parameters.requestId,
      type: this.getParam(parameters, 'type', 'GENERAL'),
      status: 'OPEN',
      slaHours: this.getParam(parameters, 'sla_hours', 72),
      dueDate: new Date(Date.now() + (parameters.sla_hours || 72) * 3600000).toISOString(),
      createdAt: new Date().toISOString(),
    };

    console.log(`[FlowDesk] WO created: ${wo.id} for ${wo.requestId} (SLA: ${wo.slaHours}h)`);
    return this.success({ workOrderId: wo.id, ...wo });
  }
}

module.exports = { CreateWorkOrderExecutor };
