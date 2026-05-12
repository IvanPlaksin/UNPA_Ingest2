'use strict';

module.exports = {
  id: 'flowdesk.request-approval',
  name: 'Request Approval',

  async execute(context, config) {
    const sr = context.state['N3-CREATE-SR'] || {};
    const userCtx = context.state['N2-CONTEXT'] || {};

    // MVP: auto-approve for demo. In production: create approval task and wait.
    const autoApprove = config.auto_approve_for_demo !== false;

    if (autoApprove) {
      console.log(`[FlowDesk] Auto-approved SR ${sr.requestId} (demo mode)`);
      return {
        success: true,
        output: {
          requestId: sr.requestId,
          decision: 'approved',
          approver: userCtx.displayName ? `Manager of ${userCtx.displayName}` : 'Auto-approved',
          approvedAt: new Date().toISOString(),
          note: 'Auto-approved in demo mode',
        },
        condition: 'approved',
      };
    }

    // Production: would create an approval task
    return {
      success: true,
      output: {
        requestId: sr.requestId,
        approvalTaskId: 'APPR-' + Date.now(),
        status: 'PENDING',
        approverRole: config.approver_role,
        timeoutHours: config.timeout_hours,
      },
      condition: 'approved', // placeholder
    };
  },
};
