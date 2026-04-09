/**
 * FlowDesk: Create Service Request in memory store
 */

const { BaseExecutor } = require('../../plugin-base');
const crypto = require('crypto');

// In-memory store (shared across instances)
const serviceRequests = new Map();

class CreateServiceRequestExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.create_service_request';
    this.displayName = 'Create Service Request';
    this.description = 'Create a new service request record';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        serviceCode: { type: 'string' },
        justification: { type: 'string' },
        initial_status: { type: 'string', default: 'PENDING_APPROVAL' },
      },
      required: ['userId', 'serviceCode'],
    };
  }

  static getRequest(id) { return serviceRequests.get(id); }
  static getAllRequests() { return [...serviceRequests.values()]; }

  async execute(parameters) {
    const sr = {
      id: 'SR-' + crypto.randomBytes(4).toString('hex').toUpperCase(),
      serviceCode: this.getRequiredParam(parameters, 'serviceCode'),
      status: this.getParam(parameters, 'initial_status', 'PENDING_APPROVAL'),
      userId: this.getRequiredParam(parameters, 'userId'),
      justification: this.getParam(parameters, 'justification', ''),
      createdAt: new Date().toISOString(),
      history: [{ action: 'CREATED', timestamp: new Date().toISOString() }],
    };

    serviceRequests.set(sr.id, sr);
    console.log(`[FlowDesk] SR created: ${sr.id} (${sr.serviceCode})`);

    return this.success({ requestId: sr.id, ...sr });
  }
}

module.exports = { CreateServiceRequestExecutor };
