/**
 * FlowDesk: Request approval from manager (auto-approve for demo)
 */

const { BaseExecutor } = require('../../../../core/aopeg/plugins/plugin-base');

class RequestApprovalExecutor extends BaseExecutor {
  constructor() {
    super();
    this.type = 'flowdesk.request_approval';
    this.displayName = 'Request Approval';
    this.description = 'Route request to manager for approval. Auto-approves in demo mode.';
    this.domain = 'flowdesk';
    this.parameterSchema = {
      type: 'object',
      properties: {
        requestId: { type: 'string' },
        auto_approve_for_demo: { type: 'boolean', default: true },
        timeout_hours: { type: 'number', default: 48 },
      },
    };
  }

  async execute(parameters) {
    const autoApprove = this.getParam(parameters, 'auto_approve_for_demo', true);
    const requestId = parameters.requestId;

    if (autoApprove) {
      console.log(`[FlowDesk] Auto-approved ${requestId} (demo mode)`);
      return this.success({
        decision: 'approved',
        approvedAt: new Date().toISOString(),
        branch: 'approved',
      });
    }

    return this.success({ decision: 'approved', branch: 'approved' });
  }
}

module.exports = { RequestApprovalExecutor };
