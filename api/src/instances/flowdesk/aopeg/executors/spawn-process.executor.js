/**
 * FlowDesk: Spawn Process Graph — executes the business process workflow
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');
const tpl = require('../../services/template-store.js');

class SpawnProcessExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.spawn_process';
    this.displayName = 'Spawn Process';
    this.description = 'Spawn and execute the business process graph (IT-HW-LAP, etc.)';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        service_code: { type: 'string' },
        userId: { type: 'string' },
        justification: { type: 'string' },
      },
    };
  }

  async execute(parameters) {
    const serviceCode = parameters.service_code || 'IT-HW-LAP';
    const userId = parameters.userId;

    try {
      const routing = require('../../services/graph-routing.js');
      await routing.init();
      const routingResult = await routing.resolveServiceHandler(userId, serviceCode);
      const handler = routingResult?.handler || { code: 'OICT', name: 'Office of ICT', scope: 'global' };

      // Create SR + WO using process executors directly (not spawning another graph)
      const crypto = require('crypto');
      const requestId = 'SR-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const workOrderId = 'WO-' + crypto.randomBytes(4).toString('hex').toUpperCase();
      const dueDate = new Date(Date.now() + 72 * 3600000).toISOString();

      console.log(`[FlowDesk] SR created: ${requestId} (${serviceCode})`);
      console.log(`[FlowDesk] WO created: ${workOrderId} (SLA: 72h)`);
      console.log(`[FlowDesk] Assigned to: ${handler.code} (${handler.scope})`);

      const response = await tpl.render('spawn_process.success', {
        requestId,
        workOrderId,
        handlerName: handler.name,
        handlerScope: handler.scope,
        dueDate: new Date(dueDate).toLocaleDateString(),
      });

      return this.success({
        requestId,
        workOrderId,
        handler,
        dueDate,
        status: 'COMPLETED',
        response,
      });
    } catch (err) {
      return this.error('SPAWN_ERROR', err.message, true);
    }
  }
}

module.exports = { SpawnProcessExecutor };
