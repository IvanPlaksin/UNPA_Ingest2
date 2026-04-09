/**
 * Approval Workflow — G2: Leave Approval
 *
 * Handles leave/vacation requests:
 * - Check available leave balance
 * - Route to manager for approval
 * - Update balance on approval
 */

const G2_LEAVE_APPROVAL = {
  graph_id: 'APPROVAL-G2-LEAVE-V1',
  name: 'Leave Approval',
  description: 'Processes leave requests: balance check, manager approval, balance update',
  category: 'DOMAIN',
  version: '1.0.0',
  namespace: 'approval',
  tags: ['approval', 'leave', 'hr'],

  nodes: [
    {
      id: 'G2-N01',
      type: 'start',
      position: { x: 100, y: 300 },
      data: {
        label: 'Leave Start',
        tool: 'workflow.start',
        config: {
          inputs: [
            { name: 'requestId', type: 'string', required: true },
            { name: 'employeeId', type: 'string', required: true },
            { name: 'days', type: 'number', required: true },
            { name: 'reason', type: 'string', required: true },
          ],
        },
      },
    },

    {
      id: 'G2-N02',
      type: 'action',
      position: { x: 300, y: 300 },
      data: {
        label: 'Load Employee',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (e:Employee {id: $employeeId})
                   OPTIONAL MATCH (e)-[:REPORTS_TO]->(m:Employee)
                   RETURN e { .*, managerId: m.id, managerName: m.name, managerEmail: m.email } AS employee`,
          params: { employeeId: '{{input.employeeId}}' },
        },
      },
    },

    // Check balance
    {
      id: 'G2-N03',
      type: 'condition',
      position: { x: 500, y: 300 },
      data: {
        label: 'Balance Sufficient?',
        tool: 'workflow.condition',
        config: {
          expression: 'Number(G2_N02.employee.leaveBalance) >= Number(input.days)',
        },
      },
    },

    // Insufficient balance
    {
      id: 'G2-N04',
      type: 'action',
      position: { x: 500, y: 500 },
      data: {
        label: 'Reject: No Balance',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (r:ApprovalRequest {id: $requestId})
                   SET r.status = 'rejected', r.updatedAt = datetime()
                   RETURN r`,
          params: { requestId: '{{input.requestId}}' },
        },
      },
    },

    {
      id: 'G2-N05',
      type: 'action',
      position: { x: 700, y: 500 },
      data: {
        label: 'Notify: Insufficient',
        tool: 'notification.send',
        config: {
          to: '{{G2_N02.employee.email}}',
          subject: 'Leave Request Rejected',
          message: 'Insufficient leave balance. Requested: {{input.days}} days, Available: {{G2_N02.employee.leaveBalance}} days.',
          channel: 'email',
        },
      },
    },

    // Manager approval
    {
      id: 'G2-N06',
      type: 'action',
      position: { x: 700, y: 300 },
      data: {
        label: 'Notify Manager',
        tool: 'notification.send',
        config: {
          to: '{{G2_N02.employee.managerEmail}}',
          subject: 'Leave Approval Needed',
          message: '{{G2_N02.employee.name}} requests {{input.days}} days leave: {{input.reason}}',
          channel: 'email',
        },
      },
    },

    {
      id: 'G2-N07',
      type: 'wait_input',
      position: { x: 900, y: 300 },
      data: {
        label: 'Await Decision',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'decision', type: 'string', required: true, enum: ['approved', 'rejected'] },
            { name: 'comment', type: 'string', required: false },
          ],
          recipients: ['{{G2_N02.employee.managerId}}'],
          timeout_hours: 48,
          timeout_action: 'escalate',
        },
      },
    },

    {
      id: 'G2-N08',
      type: 'condition',
      position: { x: 1100, y: 300 },
      data: {
        label: 'Approved?',
        tool: 'workflow.condition',
        config: {
          expression: 'G2_N07.decision === "approved"',
        },
      },
    },

    // Approved: update balance
    {
      id: 'G2-N09',
      type: 'action',
      position: { x: 1300, y: 200 },
      data: {
        label: 'Update Balance',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (e:Employee {id: $employeeId})
                   SET e.leaveBalance = e.leaveBalance - $days
                   WITH e
                   MATCH (r:ApprovalRequest {id: $requestId})
                   SET r.status = 'approved', r.updatedAt = datetime()
                   RETURN e.leaveBalance AS remainingBalance`,
          params: {
            employeeId: '{{input.employeeId}}',
            days: '{{input.days}}',
            requestId: '{{input.requestId}}',
          },
        },
      },
    },

    // Rejected
    {
      id: 'G2-N10',
      type: 'action',
      position: { x: 1300, y: 400 },
      data: {
        label: 'Set Rejected',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (r:ApprovalRequest {id: $requestId})
                   SET r.status = 'rejected', r.updatedAt = datetime()
                   RETURN r`,
          params: { requestId: '{{input.requestId}}' },
        },
      },
    },

    // Record decision
    {
      id: 'G2-N11',
      type: 'action',
      position: { x: 1500, y: 300 },
      data: {
        label: 'Record Decision',
        tool: 'graph.create_node',
        config: {
          label: 'Decision',
          namespace: 'PROJECT',
          properties: {
            requestId: '{{input.requestId}}',
            deciderId: '{{G2_N02.employee.managerId}}',
            decision: '{{G2_N07.decision}}',
            comment: '{{G2_N07.comment}}',
            decidedAt: '{{$now}}',
          },
        },
      },
    },

    // Notify
    {
      id: 'G2-N12',
      type: 'action',
      position: { x: 1700, y: 300 },
      data: {
        label: 'Notify Employee',
        tool: 'notification.send',
        config: {
          to: '{{G2_N02.employee.email}}',
          subject: 'Leave Request {{G2_N07.decision}}',
          message: 'Your leave request for {{input.days}} days was {{G2_N07.decision}}. {{G2_N07.comment}}',
          channel: 'email',
        },
      },
    },

    {
      id: 'G2-N13',
      type: 'end',
      position: { x: 1900, y: 300 },
      data: {
        label: 'Leave Complete',
        tool: 'workflow.end',
        config: {
          output: {
            requestId: '{{input.requestId}}',
            status: '{{G2_N07.decision || "rejected"}}',
          },
        },
      },
    },
  ],

  edges: [
    { id: 'e01', source: 'G2-N01', target: 'G2-N02', label: 'start' },
    { id: 'e02', source: 'G2-N02', target: 'G2-N03', label: 'loaded' },
    { id: 'e03', source: 'G2-N03', target: 'G2-N06', label: 'true' },
    { id: 'e04', source: 'G2-N03', target: 'G2-N04', label: 'false' },
    { id: 'e05', source: 'G2-N04', target: 'G2-N05', label: 'rejected' },
    { id: 'e06', source: 'G2-N05', target: 'G2-N13', label: 'notified' },
    { id: 'e07', source: 'G2-N06', target: 'G2-N07', label: 'notified' },
    { id: 'e08', source: 'G2-N07', target: 'G2-N08', label: 'decided' },
    { id: 'e09', source: 'G2-N08', target: 'G2-N09', label: 'true' },
    { id: 'e10', source: 'G2-N08', target: 'G2-N10', label: 'false' },
    { id: 'e11', source: 'G2-N09', target: 'G2-N11', label: 'updated' },
    { id: 'e12', source: 'G2-N10', target: 'G2-N11', label: 'updated' },
    { id: 'e13', source: 'G2-N11', target: 'G2-N12', label: 'recorded' },
    { id: 'e14', source: 'G2-N12', target: 'G2-N13', label: 'notified' },
  ],
};

module.exports = { G2_LEAVE_APPROVAL };
