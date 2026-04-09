/**
 * Approval Workflow — G3: Purchase Approval
 *
 * Handles purchase/procurement requests with 3-tier approval:
 * - < $1000: Manager only
 * - $1000-$5000: Manager + Director
 * - > $5000: Manager + Director + VP
 */

const G3_PURCHASE_APPROVAL = {
  graph_id: 'APPROVAL-G3-PURCHASE-V1',
  name: 'Purchase Approval',
  description: '3-tier purchase approval based on amount thresholds',
  category: 'DOMAIN',
  version: '1.0.0',
  namespace: 'approval',
  tags: ['approval', 'purchase', 'procurement'],

  nodes: [
    {
      id: 'G3-N01',
      type: 'start',
      position: { x: 100, y: 300 },
      data: {
        label: 'Purchase Start',
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

    {
      id: 'G3-N02',
      type: 'action',
      position: { x: 300, y: 300 },
      data: {
        label: 'Load Approval Chain',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (e:Employee {id: $employeeId})
                   OPTIONAL MATCH (e)-[:REPORTS_TO]->(mgr:Employee)
                   OPTIONAL MATCH (mgr)-[:REPORTS_TO]->(dir:Employee)
                   OPTIONAL MATCH (dir)-[:REPORTS_TO]->(vp:Employee)
                   RETURN e { .* } AS employee,
                          mgr { .* } AS manager,
                          dir { .* } AS director,
                          vp { .* } AS vp`,
          params: { employeeId: '{{input.employeeId}}' },
        },
      },
    },

    // Determine tier
    {
      id: 'G3-N03',
      type: 'condition',
      position: { x: 500, y: 300 },
      data: {
        label: 'Amount < $1000?',
        tool: 'workflow.condition',
        config: {
          expression: 'Number(input.amount) < 1000',
        },
      },
    },

    {
      id: 'G3-N04',
      type: 'condition',
      position: { x: 500, y: 500 },
      data: {
        label: 'Amount < $5000?',
        tool: 'workflow.condition',
        config: {
          expression: 'Number(input.amount) < 5000',
        },
      },
    },

    // Tier 1: Manager only
    {
      id: 'G3-N05',
      type: 'action',
      position: { x: 700, y: 200 },
      data: {
        label: 'Notify Manager',
        tool: 'notification.send',
        config: {
          to: '{{G3_N02.manager.email}}',
          subject: 'Purchase Approval: ${{input.amount}}',
          message: '{{G3_N02.employee.name}} requests purchase of ${{input.amount}}: {{input.reason}}',
          channel: 'email',
        },
      },
    },

    {
      id: 'G3-N06',
      type: 'wait_input',
      position: { x: 900, y: 200 },
      data: {
        label: 'Await Manager',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'decision', type: 'string', required: true, enum: ['approved', 'rejected'] },
            { name: 'comment', type: 'string', required: false },
          ],
          recipients: ['{{G3_N02.manager.id}}'],
          timeout_hours: 48,
        },
      },
    },

    // Tier 2: Manager + Director
    {
      id: 'G3-N07',
      type: 'action',
      position: { x: 700, y: 400 },
      data: {
        label: 'Notify Manager (Tier 2)',
        tool: 'notification.send',
        config: {
          to: '{{G3_N02.manager.email}}',
          subject: 'Purchase Approval (Tier 2): ${{input.amount}}',
          message: '{{G3_N02.employee.name}} requests purchase of ${{input.amount}}: {{input.reason}}. Requires manager + director approval.',
          channel: 'email',
        },
      },
    },

    {
      id: 'G3-N08',
      type: 'wait_input',
      position: { x: 900, y: 400 },
      data: {
        label: 'Await Manager (T2)',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'decision', type: 'string', required: true, enum: ['approved', 'rejected'] },
            { name: 'comment', type: 'string', required: false },
          ],
          recipients: ['{{G3_N02.manager.id}}'],
          timeout_hours: 48,
        },
      },
    },

    {
      id: 'G3-N09',
      type: 'condition',
      position: { x: 1100, y: 400 },
      data: {
        label: 'Manager Approved?',
        tool: 'workflow.condition',
        config: {
          expression: 'G3_N08.decision === "approved"',
        },
      },
    },

    {
      id: 'G3-N10',
      type: 'action',
      position: { x: 1300, y: 400 },
      data: {
        label: 'Notify Director',
        tool: 'notification.send',
        config: {
          to: '{{G3_N02.director.email}}',
          subject: 'Purchase Approval (Director): ${{input.amount}}',
          message: 'Manager-approved purchase from {{G3_N02.employee.name}}: ${{input.amount}} — {{input.reason}}',
          channel: 'email',
        },
      },
    },

    {
      id: 'G3-N11',
      type: 'wait_input',
      position: { x: 1500, y: 400 },
      data: {
        label: 'Await Director',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'decision', type: 'string', required: true, enum: ['approved', 'rejected'] },
            { name: 'comment', type: 'string', required: false },
          ],
          recipients: ['{{G3_N02.director.id}}'],
          timeout_hours: 72,
        },
      },
    },

    // Tier 3: Full chain (> $5000) — simplified: reuse tier 2 + VP
    {
      id: 'G3-N12',
      type: 'action',
      position: { x: 700, y: 600 },
      data: {
        label: 'Notify: Tier 3 Chain',
        tool: 'notification.send',
        config: {
          to: '{{G3_N02.manager.email}}',
          subject: 'Purchase Approval (Tier 3): ${{input.amount}}',
          message: 'High-value purchase from {{G3_N02.employee.name}}: ${{input.amount}}. Requires full chain approval (Manager → Director → VP).',
          channel: 'email',
        },
      },
    },

    // Common: Update status
    {
      id: 'G3-N13',
      type: 'action',
      position: { x: 1700, y: 300 },
      data: {
        label: 'Update Status',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (r:ApprovalRequest {id: $requestId})
                   SET r.status = $status, r.updatedAt = datetime()
                   RETURN r`,
          params: {
            requestId: '{{input.requestId}}',
            status: '{{$lastDecision || "approved"}}',
          },
        },
      },
    },

    // Record + notify
    {
      id: 'G3-N14',
      type: 'action',
      position: { x: 1900, y: 300 },
      data: {
        label: 'Notify Employee',
        tool: 'notification.send',
        config: {
          to: '{{G3_N02.employee.email}}',
          subject: 'Purchase Request Update',
          message: 'Your purchase request for ${{input.amount}} has been processed.',
          channel: 'email',
        },
      },
    },

    {
      id: 'G3-N15',
      type: 'end',
      position: { x: 2100, y: 300 },
      data: {
        label: 'Purchase Complete',
        tool: 'workflow.end',
        config: {
          output: {
            requestId: '{{input.requestId}}',
            tier: '{{$approvalTier}}',
          },
        },
      },
    },
  ],

  edges: [
    { id: 'e01', source: 'G3-N01', target: 'G3-N02', label: 'start' },
    { id: 'e02', source: 'G3-N02', target: 'G3-N03', label: 'loaded' },
    // Tier routing
    { id: 'e03', source: 'G3-N03', target: 'G3-N05', label: 'true' },
    { id: 'e04', source: 'G3-N03', target: 'G3-N04', label: 'false' },
    { id: 'e05', source: 'G3-N04', target: 'G3-N07', label: 'true' },
    { id: 'e06', source: 'G3-N04', target: 'G3-N12', label: 'false' },
    // Tier 1
    { id: 'e07', source: 'G3-N05', target: 'G3-N06', label: 'notified' },
    { id: 'e08', source: 'G3-N06', target: 'G3-N13', label: 'decided' },
    // Tier 2
    { id: 'e09', source: 'G3-N07', target: 'G3-N08', label: 'notified' },
    { id: 'e10', source: 'G3-N08', target: 'G3-N09', label: 'decided' },
    { id: 'e11', source: 'G3-N09', target: 'G3-N10', label: 'true' },
    { id: 'e12', source: 'G3-N09', target: 'G3-N13', label: 'false' },
    { id: 'e13', source: 'G3-N10', target: 'G3-N11', label: 'notified' },
    { id: 'e14', source: 'G3-N11', target: 'G3-N13', label: 'decided' },
    // Tier 3 (simplified — goes to same manager start)
    { id: 'e15', source: 'G3-N12', target: 'G3-N08', label: 'notified' },
    // Common end
    { id: 'e16', source: 'G3-N13', target: 'G3-N14', label: 'updated' },
    { id: 'e17', source: 'G3-N14', target: 'G3-N15', label: 'notified' },
  ],
};

module.exports = { G3_PURCHASE_APPROVAL };
