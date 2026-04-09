/**
 * iNeed Graph 1: IT Hardware Request
 *
 * The most complex business process graph — 22 nodes.
 * Features:
 *   - Inventory check (Qdrant vector search)
 *   - Conditional approval loop (cost > $5K)
 *   - 2x wait_input: manager approval (48h) + delivery confirmation (7d)
 *   - Service Request + Work Order creation in Memgraph
 *   - CSAT survey and SR close
 */

// ====================================================================
// GRAPH 1: IT Hardware Request
// ====================================================================

const GRAPH_1_IT_HARDWARE = {
  graph_id: 'INEED-G1-IT-HARDWARE-V1',
  name: 'iNeed: IT Hardware Request',
  description: 'Process IT hardware requests with inventory check, approval workflow, and delivery tracking',
  category: 'IT',
  subcategory: 'Hardware',
  version: '1.0.0',

  nodes: [
    // G1-N01: START
    {
      id: 'G1-N01',
      type: 'start',
      position: { x: 100, y: 300 },
      data: {
        label: 'Hardware Request Intake',
        tool: 'workflow.start',
        config: {
          inputs: [
            { name: 'user_id', type: 'string', required: true },
            { name: 'user_profile', type: 'object', required: true },
            { name: 'extracted_intent', type: 'object', required: true },
            { name: 'raw_text', type: 'string', required: true },
          ],
        },
      },
    },

    // G1-N02: Set Variables
    {
      id: 'G1-N02',
      type: 'action',
      position: { x: 250, y: 300 },
      data: {
        label: 'Initialize Variables',
        tool: 'workflow.set_variable',
        config: {
          variables: [
            { name: 'equipment_type', value: '{{input.extracted_intent.params.equipment_type}}', scope: 'graph' },
            { name: 'specs', value: '{{input.extracted_intent.params.specs}}', scope: 'graph' },
            { name: 'urgency', value: '{{input.extracted_intent.urgency}}', scope: 'graph' },
            { name: 'duty_station', value: '{{input.user_profile.duty_station}}', scope: 'graph' },
          ],
        },
      },
    },

    // G1-N03: Normalize Equipment (LLM)
    {
      id: 'G1-N03',
      type: 'ai_node',
      position: { x: 400, y: 300 },
      data: {
        label: 'Normalize Equipment',
        tool: 'ai.generate',
        config: {
          model: 'gemini-2.0-flash',
          system_prompt: [
            'Normalize IT equipment request to standard UN categories.',
            'Return JSON:',
            '{',
            '  "equipment_category": "laptop|desktop|monitor|phone|headset|docking_station|printer|other",',
            '  "standard_specs": "string describing standard specs",',
            '  "is_standard": true/false,',
            '  "estimated_cost": number,',
            '  "justification_required": true/false',
            '}',
          ].join('\n'),
          user_prompt: 'Equipment: {{equipment_type}}\nSpecs: {{specs}}\nJustification: {{input.raw_text}}',
          output_format: 'json',
        },
      },
    },

    // G1-N04: Search Inventory
    {
      id: 'G1-N04',
      type: 'action',
      position: { x: 550, y: 300 },
      data: {
        label: 'Search Inventory',
        tool: 'vector.search',
        config: {
          collection: 'un_inventory',
          query: '{{equipment_type}} {{G1-N03.standard_specs}}',
          filter: {
            type: '{{G1-N03.equipment_category}}',
            status: 'available',
            location: '{{duty_station}}',
          },
          limit: 5,
        },
      },
    },

    // G1-N05: Check Stock
    {
      id: 'G1-N05',
      type: 'condition',
      position: { x: 700, y: 300 },
      data: {
        label: 'In Stock?',
        tool: 'workflow.condition',
        config: {
          expression: 'G1_N04.results && G1_N04.results.length > 0',
        },
      },
    },

    // G1-N06: Reserve Equipment (IN STOCK path)
    {
      id: 'G1-N06',
      type: 'action',
      position: { x: 850, y: 200 },
      data: {
        label: 'Reserve Equipment',
        tool: 'graph.create_node',
        config: {
          namespace: 'PROJECT',
          label: 'EquipmentReservation',
          properties: {
            item_id: '{{G1-N04.results[0].payload.item_id}}',
            reserved_for: '{{input.user_id}}',
            reserved_at: '{{$now}}',
            status: 'RESERVED',
          },
        },
      },
    },

    // G1-N07: Request Procurement (NOT IN STOCK path)
    {
      id: 'G1-N07',
      type: 'action',
      position: { x: 850, y: 400 },
      data: {
        label: 'Create Procurement Request',
        tool: 'graph.create_node',
        config: {
          namespace: 'PROJECT',
          label: 'ProcurementRequest',
          properties: {
            equipment_category: '{{G1-N03.equipment_category}}',
            specs: '{{G1-N03.standard_specs}}',
            estimated_cost: '{{G1-N03.estimated_cost}}',
            requested_by: '{{input.user_id}}',
            duty_station: '{{duty_station}}',
            status: 'PENDING',
          },
        },
      },
    },

    // G1-N08: Calculate Priority
    {
      id: 'G1-N08',
      type: 'action',
      position: { x: 1000, y: 300 },
      data: {
        label: 'Calculate SLA',
        tool: 'workflow.set_variable',
        config: {
          name: 'priority_info',
          value: {
            priority: '{{urgency === "critical" ? "P1" : urgency === "high" ? "P2" : "P3"}}',
            sla_hours: '{{urgency === "critical" ? 4 : urgency === "high" ? 24 : 72}}',
            approval_required: '{{G1-N03.estimated_cost > 5000 || !G1-N03.is_standard}}',
          },
          scope: 'graph',
        },
      },
    },

    // G1-N09: Check Approval Required
    {
      id: 'G1-N09',
      type: 'condition',
      position: { x: 1150, y: 300 },
      data: {
        label: 'Approval Required?',
        tool: 'workflow.condition',
        config: {
          expression: 'priority_info.approval_required === true',
        },
      },
    },

    // G1-N10: Send Approval Request
    {
      id: 'G1-N10',
      type: 'action',
      position: { x: 1300, y: 150 },
      data: {
        label: 'Request Manager Approval',
        tool: 'notification.send',
        config: {
          channel: 'email',
          recipients: ['{{input.user_profile.manager_id}}'],
          subject: 'Approval Required: IT Hardware Request',
          body: [
            'Equipment request requires your approval:',
            '',
            'Requestor: {{input.user_profile.full_name}}',
            'Equipment: {{G1-N03.equipment_category}}',
            'Specs: {{G1-N03.standard_specs}}',
            'Estimated Cost: ${{G1-N03.estimated_cost}}',
            'Justification: {{input.raw_text}}',
            '',
            'Please approve or reject this request.',
          ].join('\n'),
          priority: 'high',
        },
      },
    },

    // G1-N11: Wait for Approval
    {
      id: 'G1-N11',
      type: 'wait_input',
      position: { x: 1450, y: 150 },
      data: {
        label: 'Await Manager Approval',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'decision', type: 'enum', values: ['approved', 'rejected'], required: true },
            { name: 'manager_comment', type: 'string', required: false },
          ],
          recipients: ['{{input.user_profile.manager_id}}'],
          timeout_hours: 48,
          timeout_action: 'auto_approve',
          prompt: 'Approve hardware request for {{input.user_profile.full_name}}?',
        },
      },
    },

    // G1-N12: Check Approval Decision
    {
      id: 'G1-N12',
      type: 'condition',
      position: { x: 1600, y: 150 },
      data: {
        label: 'Approved?',
        tool: 'workflow.condition',
        config: {
          expression: 'G1_N11.decision === "approved"',
        },
      },
    },

    // G1-N13: Create Service Request
    {
      id: 'G1-N13',
      type: 'action',
      position: { x: 1600, y: 300 },
      data: {
        label: 'Create Service Request',
        tool: 'graph.create_node',
        config: {
          namespace: 'PROJECT',
          label: 'ServiceRequest',
          properties: {
            sr_id: '{{$uuid}}',
            category: 'IT',
            subcategory: 'Hardware',
            status: 'IN_PROGRESS',
            priority: '{{priority_info.priority}}',
            duty_station: '{{duty_station}}',
            requestor_id: '{{input.user_id}}',
            sla_target: '{{priority_info.sla_hours}}',
            created_at: '{{$now}}',
            equipment_type: '{{G1-N03.equipment_category}}',
            estimated_cost: '{{G1-N03.estimated_cost}}',
          },
        },
      },
    },

    // G1-N14: Create Work Order
    {
      id: 'G1-N14',
      type: 'action',
      position: { x: 1750, y: 300 },
      data: {
        label: 'Create Work Order',
        tool: 'graph.create_node',
        config: {
          namespace: 'PROJECT',
          label: 'WorkOrder',
          properties: {
            wo_id: '{{$uuid}}',
            sr_id: '{{G1-N13.sr_id}}',
            assigned_group: 'ICTS-{{duty_station}}-HW',
            status: 'ASSIGNED',
            work_type: 'equipment_delivery',
            created_at: '{{$now}}',
          },
        },
      },
    },

    // G1-N15: Notify User — SR Created
    {
      id: 'G1-N15',
      type: 'action',
      position: { x: 1900, y: 300 },
      data: {
        label: 'Notify: SR Created',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}'],
          subject: 'Service Request Created',
          body: [
            'Your IT hardware request has been approved and created.',
            '',
            'SR Number: {{G1-N13.sr_id}}',
            'Work Order: {{G1-N14.wo_id}}',
            'Equipment: {{G1-N03.equipment_category}}',
            'Expected Delivery: Within {{priority_info.sla_hours}} hours',
            '',
            'You will be notified when your equipment is ready for pickup.',
          ].join('\n'),
          priority: 'normal',
        },
      },
    },

    // G1-N16: Wait for Delivery Confirmation
    {
      id: 'G1-N16',
      type: 'wait_input',
      position: { x: 2050, y: 300 },
      data: {
        label: 'Await Delivery Confirmation',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'received', type: 'boolean', required: true },
            { name: 'delivery_date', type: 'date', required: false },
            { name: 'condition', type: 'enum', values: ['good', 'damaged', 'wrong_item'], required: true },
          ],
          recipients: ['{{input.user_id}}'],
          timeout_hours: 168,
          timeout_action: 'auto_approve',
          prompt: 'Please confirm receipt of your equipment.',
        },
      },
    },

    // G1-N17: Update SR — Resolved
    {
      id: 'G1-N17',
      type: 'action',
      position: { x: 2200, y: 300 },
      data: {
        label: 'Resolve SR',
        tool: 'graph.query',
        config: {
          query: [
            'MATCH (sr:ServiceRequest {sr_id: $sr_id})',
            "SET sr.status = 'RESOLVED', sr.resolved_at = datetime(), sr.delivery_confirmed = true",
            'RETURN sr',
          ].join('\n'),
          params: { sr_id: '{{G1-N13.sr_id}}' },
        },
      },
    },

    // G1-N18: Send CSAT Survey
    {
      id: 'G1-N18',
      type: 'action',
      position: { x: 2350, y: 300 },
      data: {
        label: 'Send CSAT Survey',
        tool: 'notification.send',
        config: {
          channel: 'email',
          recipients: ['{{input.user_id}}'],
          subject: 'How was your service experience?',
          body: 'Please rate your experience with SR {{G1-N13.sr_id}}.',
          priority: 'low',
        },
      },
    },

    // G1-N19: Close SR
    {
      id: 'G1-N19',
      type: 'action',
      position: { x: 2500, y: 300 },
      data: {
        label: 'Close SR',
        tool: 'graph.query',
        config: {
          query: [
            'MATCH (sr:ServiceRequest {sr_id: $sr_id})',
            "SET sr.status = 'CLOSED', sr.closed_at = datetime()",
            'RETURN sr',
          ].join('\n'),
          params: { sr_id: '{{G1-N13.sr_id}}' },
        },
      },
    },

    // G1-N20: END Success
    {
      id: 'G1-N20',
      type: 'end',
      position: { x: 2650, y: 300 },
      data: {
        label: 'Complete',
        tool: 'workflow.end',
        config: {
          status: 'success',
          outputs: ['sr_id', 'wo_id', 'resolution_time'],
        },
      },
    },

    // G1-N21: Notify Rejection
    {
      id: 'G1-N21',
      type: 'action',
      position: { x: 1750, y: 50 },
      data: {
        label: 'Notify: Rejected',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}'],
          subject: 'Hardware Request Rejected',
          body: [
            'Your hardware request has been rejected by your manager.',
            '',
            'Equipment: {{G1-N03.equipment_category}}',
            'Reason: {{G1-N11.manager_comment}}',
            '',
            'Please contact your manager for more information.',
          ].join('\n'),
          priority: 'normal',
        },
      },
    },

    // G1-N22: END Rejected
    {
      id: 'G1-N22',
      type: 'end',
      position: { x: 1900, y: 50 },
      data: {
        label: 'Complete (Rejected)',
        tool: 'workflow.end',
        config: {
          status: 'rejected',
          outputs: ['rejection_reason'],
        },
      },
    },
  ],

  edges: [
    { id: 'e01-02', source: 'G1-N01', target: 'G1-N02' },
    { id: 'e02-03', source: 'G1-N02', target: 'G1-N03' },
    { id: 'e03-04', source: 'G1-N03', target: 'G1-N04' },
    { id: 'e04-05', source: 'G1-N04', target: 'G1-N05' },

    // Stock check branching
    { id: 'e05-06', source: 'G1-N05', target: 'G1-N06', label: 'in_stock' },
    { id: 'e05-07', source: 'G1-N05', target: 'G1-N07', label: 'out_of_stock' },

    // Converge to priority calculation
    { id: 'e06-08', source: 'G1-N06', target: 'G1-N08' },
    { id: 'e07-08', source: 'G1-N07', target: 'G1-N08' },

    // Approval check branching
    { id: 'e08-09', source: 'G1-N08', target: 'G1-N09' },
    { id: 'e09-10', source: 'G1-N09', target: 'G1-N10', label: 'approval_needed' },
    { id: 'e09-13', source: 'G1-N09', target: 'G1-N13', label: 'no_approval_needed' },

    // Approval workflow
    { id: 'e10-11', source: 'G1-N10', target: 'G1-N11' },
    { id: 'e11-12', source: 'G1-N11', target: 'G1-N12' },
    { id: 'e12-13', source: 'G1-N12', target: 'G1-N13', label: 'approved' },
    { id: 'e12-21', source: 'G1-N12', target: 'G1-N21', label: 'rejected' },

    // Main flow
    { id: 'e13-14', source: 'G1-N13', target: 'G1-N14' },
    { id: 'e14-15', source: 'G1-N14', target: 'G1-N15' },
    { id: 'e15-16', source: 'G1-N15', target: 'G1-N16' },
    { id: 'e16-17', source: 'G1-N16', target: 'G1-N17' },
    { id: 'e17-18', source: 'G1-N17', target: 'G1-N18' },
    { id: 'e18-19', source: 'G1-N18', target: 'G1-N19' },
    { id: 'e19-20', source: 'G1-N19', target: 'G1-N20' },

    // Rejection path
    { id: 'e21-22', source: 'G1-N21', target: 'G1-N22' },
  ],
};

module.exports = { GRAPH_1_IT_HARDWARE };
