/**
 * Approval Workflow System — Business Process Graphs
 *
 * PoC: Demonstrates GXE-powered approval workflow with
 * orchestrator + domain-specific child graphs.
 *
 * Format: ReactFlow-compatible DAG structure
 * - nodes[] with id, type, position, data
 * - edges[] with id, source, target, label
 *
 * Graph 0: G0-APPROVAL-ORCHESTRATOR — Routes requests to domain graphs
 */

// ====================================================================
// GRAPH 0: APPROVAL ORCHESTRATOR
// ====================================================================

const G0_APPROVAL_ORCHESTRATOR = {
  graph_id: 'APPROVAL-G0-ORCHESTRATOR-V1',
  name: 'Approval Orchestrator',
  description: 'Receives approval requests, validates requester, classifies type, routes to domain graph',
  category: 'META',
  version: '1.0.0',
  namespace: 'approval',
  tags: ['approval', 'orchestrator', 'workflow'],

  nodes: [
    // --- START ---
    {
      id: 'G0-N01',
      type: 'start',
      position: { x: 100, y: 300 },
      data: {
        label: 'Request Intake',
        tool: 'workflow.start',
        config: {
          inputs: [
            { name: 'requesterId', type: 'string', required: true },
            { name: 'type', type: 'string', required: false },
            { name: 'payload', type: 'object', required: true },
          ],
        },
      },
    },

    // --- LOAD EMPLOYEE ---
    {
      id: 'G0-N02',
      type: 'action',
      position: { x: 300, y: 300 },
      data: {
        label: 'Load Employee',
        tool: 'graph.query',
        config: {
          cypher: `MATCH (e:Employee {id: $requesterId})
                   OPTIONAL MATCH (e)-[:REPORTS_TO]->(m:Employee)
                   OPTIONAL MATCH (e)-[:WORKS_IN]->(d:Department)
                   RETURN e { .*, manager: m { .* }, department: d { .* } } AS employee`,
          params: { requesterId: '{{input.requesterId}}' },
        },
      },
    },

    // --- EMPLOYEE EXISTS? ---
    {
      id: 'G0-N03',
      type: 'condition',
      position: { x: 500, y: 300 },
      data: {
        label: 'Employee Exists?',
        tool: 'workflow.condition',
        config: {
          expression: 'G0_N02.employee !== null',
        },
      },
    },

    // --- CLASSIFY REQUEST TYPE (LLM) ---
    {
      id: 'G0-N04',
      type: 'ai_node',
      position: { x: 700, y: 300 },
      data: {
        label: 'Classify Request',
        tool: 'ai.generate',
        config: {
          model: 'gemini-2.0-flash',
          system_prompt: [
            'Classify this approval request into one of these types:',
            '- expense: Travel, purchases, reimbursements',
            '- leave: Vacation, sick leave, personal days',
            '- purchase: Equipment, software, supplies over $500',
            '',
            'If the type is already provided, validate and confirm it.',
            '',
            'Return ONLY valid JSON:',
            '{',
            '  "type": "expense|leave|purchase",',
            '  "confidence": 0.0-1.0,',
            '  "summary": "brief summary of request"',
            '}',
          ].join('\n'),
          user_prompt: 'Type hint: {{input.type}}\nRequest: {{input.payload.reason || input.payload.description}}',
          output_format: 'json',
        },
      },
    },

    // --- CONFIDENCE CHECK ---
    {
      id: 'G0-N05',
      type: 'condition',
      position: { x: 900, y: 300 },
      data: {
        label: 'Confidence ≥ 0.7?',
        tool: 'workflow.condition',
        config: {
          expression: 'G0_N04.confidence >= 0.7',
        },
      },
    },

    // --- CREATE APPROVAL REQUEST ---
    {
      id: 'G0-N06',
      type: 'action',
      position: { x: 1100, y: 300 },
      data: {
        label: 'Create Request',
        tool: 'graph.create_node',
        config: {
          label: 'ApprovalRequest',
          namespace: 'PROJECT',
          properties: {
            type: '{{G0_N04.type}}',
            status: 'pending',
            requesterId: '{{input.requesterId}}',
            amount: '{{input.payload.amount}}',
            days: '{{input.payload.days}}',
            reason: '{{input.payload.reason}}',
            summary: '{{G0_N04.summary}}',
            createdAt: '{{$now}}',
          },
        },
      },
    },

    // --- ROUTE: EXPENSE ---
    {
      id: 'G0-N07',
      type: 'condition',
      position: { x: 1300, y: 200 },
      data: {
        label: 'Type = Expense?',
        tool: 'workflow.condition',
        config: {
          expression: 'G0_N04.type === "expense"',
        },
      },
    },

    // --- ROUTE: LEAVE ---
    {
      id: 'G0-N08',
      type: 'condition',
      position: { x: 1300, y: 400 },
      data: {
        label: 'Type = Leave?',
        tool: 'workflow.condition',
        config: {
          expression: 'G0_N04.type === "leave"',
        },
      },
    },

    // --- SPAWN EXPENSE GRAPH ---
    {
      id: 'G0-N09',
      type: 'action',
      position: { x: 1500, y: 100 },
      data: {
        label: 'Spawn Expense Flow',
        tool: 'workflow.spawn_graph',
        config: {
          graph_id: 'APPROVAL-G1-EXPENSE-V1',
          input: {
            requestId: '{{G0_N06.id}}',
            employeeId: '{{input.requesterId}}',
            amount: '{{input.payload.amount}}',
            reason: '{{input.payload.reason}}',
          },
          async: true,
        },
      },
    },

    // --- SPAWN LEAVE GRAPH ---
    {
      id: 'G0-N10',
      type: 'action',
      position: { x: 1500, y: 300 },
      data: {
        label: 'Spawn Leave Flow',
        tool: 'workflow.spawn_graph',
        config: {
          graph_id: 'APPROVAL-G2-LEAVE-V1',
          input: {
            requestId: '{{G0_N06.id}}',
            employeeId: '{{input.requesterId}}',
            days: '{{input.payload.days}}',
            reason: '{{input.payload.reason}}',
          },
          async: true,
        },
      },
    },

    // --- SPAWN PURCHASE GRAPH (fallback for purchase or unknown) ---
    {
      id: 'G0-N11',
      type: 'action',
      position: { x: 1500, y: 500 },
      data: {
        label: 'Spawn Purchase Flow',
        tool: 'workflow.spawn_graph',
        config: {
          graph_id: 'APPROVAL-G3-PURCHASE-V1',
          input: {
            requestId: '{{G0_N06.id}}',
            employeeId: '{{input.requesterId}}',
            amount: '{{input.payload.amount}}',
            reason: '{{input.payload.reason}}',
          },
          async: true,
        },
      },
    },

    // --- SUCCESS END ---
    {
      id: 'G0-N12',
      type: 'end',
      position: { x: 1700, y: 300 },
      data: {
        label: 'Request Submitted',
        tool: 'workflow.end',
        config: {
          output: {
            requestId: '{{G0_N06.id}}',
            type: '{{G0_N04.type}}',
            status: 'submitted',
          },
        },
      },
    },

    // --- CLARIFY (low confidence) ---
    {
      id: 'G0-N13',
      type: 'wait_input',
      position: { x: 900, y: 150 },
      data: {
        label: 'Request Clarification',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'type', type: 'string', required: true },
          ],
          prompt: 'Could not determine request type. Please specify: expense, leave, or purchase.',
          timeout_hours: 24,
          timeout_action: 'cancel',
        },
      },
    },

    // --- ERROR END ---
    {
      id: 'G0-N14',
      type: 'end',
      position: { x: 500, y: 500 },
      data: {
        label: 'Error: Not Found',
        tool: 'workflow.end',
        config: {
          output: {
            error: 'Employee not found',
            requesterId: '{{input.requesterId}}',
          },
          status: 'error',
        },
      },
    },
  ],

  edges: [
    { id: 'e01', source: 'G0-N01', target: 'G0-N02', label: 'start' },
    { id: 'e02', source: 'G0-N02', target: 'G0-N03', label: 'loaded' },
    { id: 'e03', source: 'G0-N03', target: 'G0-N04', label: 'true' },
    { id: 'e04', source: 'G0-N03', target: 'G0-N14', label: 'false' },
    { id: 'e05', source: 'G0-N04', target: 'G0-N05', label: 'classified' },
    { id: 'e06', source: 'G0-N05', target: 'G0-N06', label: 'true' },
    { id: 'e07', source: 'G0-N05', target: 'G0-N13', label: 'false' },
    { id: 'e08', source: 'G0-N13', target: 'G0-N04', label: 'retry_classification' },
    { id: 'e09', source: 'G0-N06', target: 'G0-N07', label: 'created' },
    { id: 'e10', source: 'G0-N07', target: 'G0-N09', label: 'true' },
    { id: 'e11', source: 'G0-N07', target: 'G0-N08', label: 'false' },
    { id: 'e12', source: 'G0-N08', target: 'G0-N10', label: 'true' },
    { id: 'e13', source: 'G0-N08', target: 'G0-N11', label: 'false' },
    { id: 'e14', source: 'G0-N09', target: 'G0-N12', label: 'spawned' },
    { id: 'e15', source: 'G0-N10', target: 'G0-N12', label: 'spawned' },
    { id: 'e16', source: 'G0-N11', target: 'G0-N12', label: 'spawned' },
  ],
};

module.exports = { G0_APPROVAL_ORCHESTRATOR };
