/**
 * FlowDesk: Assign handler via graph-based routing
 */

const { BaseExecutor } = require('../../plugin-base');

class AssignHandlerExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.assign_handler';
    this.displayName = 'Assign Handler';
    this.description = 'Resolve service handler using priority-based graph routing (mission → regional → global)';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        serviceCode: { type: 'string' },
        workOrderId: { type: 'string' },
      },
      required: ['userId', 'serviceCode'],
    };
  }

  async execute(parameters) {
    const routing = require('../../../../../services/flowdesk/graph-routing');
    await routing.init();

    const result = await routing.resolveServiceHandler(
      this.getRequiredParam(parameters, 'userId'),
      this.getRequiredParam(parameters, 'serviceCode')
    );

    const handler = result?.handler || { code: 'UNASSIGNED', name: 'Unassigned', scope: 'global' };
    console.log(`[FlowDesk] ${parameters.workOrderId || 'WO'} assigned to ${handler.code} (${handler.scope})`);

    return this.success({ handler, assignedAt: new Date().toISOString() });
  }
}

module.exports = { AssignHandlerExecutor };
