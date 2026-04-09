/**
 * Approval Workflow — G1: Expense Approval
 *
 * Handles expense reimbursement requests:
 * - Auto-approve if amount < employee's expense limit
 * - Route to manager for approval if amount >= limit
 * - Record decision and notify requester
 */

const G1_EXPENSE_APPROVAL = {
  graph_id: 'APPROVAL-G1-EXPENSE-V1',
  name: 'Expense Approval',
  description: 'Processes expense requests with auto-approval for small amounts and manager approval for larger ones',
  category: 'DOMAIN',
  version: '1.0.0',
  namespace: 'approval',
  tags: ['approval', 'expense', 'finance'],

  nodes: [
    // --- START ---
    {
      id: 'G1-N01',
      type: 'start',
      position: { x: 100, y: 300 },
      data: {
        label: 'Expense Start',
        tool: 'workflow.start',
        config: {
          inputs: [
            { name: 'requestId', type: 'string', required: true },
            { name: 'employeeId', type: 'string', required: true },
            { name: 'amount', type: 'number', required: true },
            { name: 'reason', type: 'string', required: true },
          ],
        },
      },
    },

    // --- LOAD EMPLOYEE + MANAGER ---
    {
      id: 'G1-N02',
      type: 'action',
      position: { x: 300, y: 300 },
      data: {
        label: 'Load Employee & Manager',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (e:Employee {id: $employeeId})
                   OPTIONAL MATCH (e)-[:REPORTS_TO]->(m:Employee)
                   RETURN e { .*, managerId: m.id, managerName: m.name, managerEmail: m.email } AS employee`,
          params: { employeeId: '{{input.employeeId}}' },
        },
      },
    },

    // --- LOAD RULES ---
    {
      id: 'G1-N03',
      type: 'action',
      position: { x: 500, y: 300 },
      data: {
        label: 'Load Approval Rules',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (r:ApprovalRule {type: 'expense'})
                   RETURN r ORDER BY r.priority ASC`,
        },
      },
    },

    // --- CHECK AUTO-APPROVE THRESHOLD ---
    {
      id: 'G1-N04',
      type: 'condition',
      position: { x: 700, y: 300 },
      data: {
        label: 'Amount < Limit?',
        tool: 'workflow.condition',
        config: {
          expression: 'Number(input.amount) < Number(G1_N02.employee.expenseLimit || 100)',
        },
      },
    },

    // --- AUTO-APPROVE ---
    {
      id: 'G1-N05',
      type: 'action',
      position: { x: 900, y: 150 },
      data: {
        label: 'Auto-Approve',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (r:ApprovalRequest {id: $requestId})
                   SET r.status = 'auto_approved', r.updatedAt = datetime()
                   RETURN r`,
          params: { requestId: '{{input.requestId}}' },
        },
      },
    },

    // --- CREATE AUTO-APPROVE DECISION ---
    {
      id: 'G1-N06',
      type: 'action',
      position: { x: 1100, y: 150 },
      data: {
        label: 'Record Auto-Decision',
        tool: 'graph.create_node',
        config: {
          label: 'Decision',
          namespace: 'PROJECT',
          properties: {
            requestId: '{{input.requestId}}',
            deciderId: 'SYSTEM',
            decision: 'approved',
            comment: 'Auto-approved: amount below threshold',
            decidedAt: '{{$now}}',
          },
          relationships: [
            { type: 'FOR_REQUEST', targetId: '{{input.requestId}}' },
          ],
        },
      },
    },

    // --- NOTIFY REQUESTER (auto) ---
    {
      id: 'G1-N07',
      type: 'action',
      position: { x: 1300, y: 150 },
      data: {
        label: 'Notify: Auto-Approved',
        tool: 'notification.send',
        config: {
          to: '{{G1_N02.employee.email}}',
          subject: 'Expense Auto-Approved',
          message: 'Your expense request for ${{input.amount}} ({{input.reason}}) was automatically approved.',
          channel: 'email',
        },
      },
    },

    // --- NOTIFY MANAGER ---
    {
      id: 'G1-N08',
      type: 'action',
      position: { x: 900, y: 450 },
      data: {
        label: 'Notify Manager',
        tool: 'notification.send',
        config: {
          to: '{{G1_N02.employee.managerEmail}}',
          subject: 'Expense Approval Needed',
          message: '{{G1_N02.employee.name}} requests expense approval for ${{input.amount}}: {{input.reason}}',
          channel: 'email',
        },
      },
    },

    // --- WAIT FOR MANAGER DECISION ---
    {
      id: 'G1-N09',
      type: 'wait_input',
      position: { x: 1100, y: 450 },
      data: {
        label: 'Await Manager Decision',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'decision', type: 'string', required: true, enum: ['approved', 'rejected'] },
            { name: 'comment', type: 'string', required: false },
          ],
          recipients: ['{{G1_N02.employee.managerId}}'],
          timeout_hours: 48,
          timeout_action: 'escalate',
          prompt: 'Approve or reject expense request for ${{input.amount}} from {{G1_N02.employee.name}}?',
        },
      },
    },

    // --- CHECK DECISION ---
    {
      id: 'G1-N10',
      type: 'condition',
      position: { x: 1300, y: 450 },
      data: {
        label: 'Approved?',
        tool: 'workflow.condition',
        config: {
          expression: 'G1_N09.decision === "approved"',
        },
      },
    },

    // --- UPDATE STATUS: APPROVED ---
    {
      id: 'G1-N11',
      type: 'action',
      position: { x: 1500, y: 350 },
      data: {
        label: 'Set Approved',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (r:ApprovalRequest {id: $requestId})
                   SET r.status = 'approved', r.updatedAt = datetime()
                   RETURN r`,
          params: { requestId: '{{input.requestId}}' },
        },
      },
    },

    // --- UPDATE STATUS: REJECTED ---
    {
      id: 'G1-N12',
      type: 'action',
      position: { x: 1500, y: 550 },
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

    // --- RECORD MANAGER DECISION ---
    {
      id: 'G1-N13',
      type: 'action',
      position: { x: 1700, y: 450 },
      data: {
        label: 'Record Decision',
        tool: 'graph.create_node',
        config: {
          label: 'Decision',
          namespace: 'PROJECT',
          properties: {
            requestId: '{{input.requestId}}',
            deciderId: '{{G1_N02.employee.managerId}}',
            decision: '{{G1_N09.decision}}',
            comment: '{{G1_N09.comment}}',
            decidedAt: '{{$now}}',
          },
          relationships: [
            { type: 'FOR_REQUEST', targetId: '{{input.requestId}}' },
            { type: 'MADE_BY', targetId: '{{G1_N02.employee.managerId}}' },
          ],
        },
      },
    },

    // --- NOTIFY REQUESTER (decision) ---
    {
      id: 'G1-N14',
      type: 'action',
      position: { x: 1900, y: 450 },
      data: {
        label: 'Notify: Decision',
        tool: 'notification.send',
        config: {
          to: '{{G1_N02.employee.email}}',
          subject: 'Expense Request {{G1_N09.decision}}',
          message: 'Your expense request for ${{input.amount}} was {{G1_N09.decision}}. {{G1_N09.comment}}',
          channel: 'email',
        },
      },
    },

    // --- END ---
    {
      id: 'G1-N15',
      type: 'end',
      position: { x: 2100, y: 300 },
      data: {
        label: 'Expense Complete',
        tool: 'workflow.end',
        config: {
          output: {
            requestId: '{{input.requestId}}',
            status: '{{G1_N09.decision || "auto_approved"}}',
          },
        },
      },
    },
  ],

  edges: [
    { id: 'e01', source: 'G1-N01', target: 'G1-N02', label: 'start' },
    { id: 'e02', source: 'G1-N02', target: 'G1-N03', label: 'loaded' },
    { id: 'e03', source: 'G1-N03', target: 'G1-N04', label: 'rules_loaded' },
    // Auto-approve path
    { id: 'e04', source: 'G1-N04', target: 'G1-N05', label: 'true' },
    { id: 'e05', source: 'G1-N05', target: 'G1-N06', label: 'updated' },
    { id: 'e06', source: 'G1-N06', target: 'G1-N07', label: 'recorded' },
    { id: 'e07', source: 'G1-N07', target: 'G1-N15', label: 'notified' },
    // Manager approval path
    { id: 'e08', source: 'G1-N04', target: 'G1-N08', label: 'false' },
    { id: 'e09', source: 'G1-N08', target: 'G1-N09', label: 'notified' },
    { id: 'e10', source: 'G1-N09', target: 'G1-N10', label: 'decided' },
    { id: 'e11', source: 'G1-N10', target: 'G1-N11', label: 'true' },
    { id: 'e12', source: 'G1-N10', target: 'G1-N12', label: 'false' },
    { id: 'e13', source: 'G1-N11', target: 'G1-N13', label: 'updated' },
    { id: 'e14', source: 'G1-N12', target: 'G1-N13', label: 'updated' },
    { id: 'e15', source: 'G1-N13', target: 'G1-N14', label: 'recorded' },
    { id: 'e16', source: 'G1-N14', target: 'G1-N15', label: 'notified' },
  ],
};

module.exports = { G1_EXPENSE_APPROVAL };
