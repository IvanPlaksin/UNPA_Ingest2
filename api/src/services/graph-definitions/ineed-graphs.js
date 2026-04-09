/**
 * iNeed Business Process Graphs
 *
 * Format: ReactFlow-compatible DAG structure
 * - nodes[] with id, type, position, data
 * - edges[] with id, source, target, label
 *
 * Graph 0: META-GRAPH — AI Intake Agent (dispatcher)
 */

// ====================================================================
// GRAPH 0: META-GRAPH — AI Intake Agent
// ====================================================================

const GRAPH_0_META = {
  graph_id: 'INEED-G0-META-INTAKE-V1',
  name: 'iNeed: AI Intake Agent',
  description: 'Receives free-text requests, extracts intent, finds matching business graph, spawns execution',
  category: 'META',
  version: '1.0.0',

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
            { name: 'user_id', type: 'string', required: true },
            { name: 'raw_text', type: 'string', required: true },
            { name: 'channel', type: 'string', default: 'web' },
          ],
        },
      },
    },

    // --- LOAD USER PROFILE ---
    {
      id: 'G0-N02',
      type: 'action',
      position: { x: 300, y: 300 },
      data: {
        label: 'Load User Profile',
        tool: 'graph.query_profile',
        config: {
          user_id: '{{input.user_id}}',
          include_manager: true,
        },
      },
    },

    // --- EXTRACT INTENT (LLM) ---
    {
      id: 'G0-N03',
      type: 'ai_node',
      position: { x: 500, y: 300 },
      data: {
        label: 'Extract Intent',
        tool: 'ai.generate',
        config: {
          model: 'gemini-2.0-flash',
          system_prompt: [
            'You are an iNeed Service Request intake agent for the United Nations.',
            'Extract structured data from the user request.',
            '',
            'User profile:',
            '- Name: {{G0-N02.profile.full_name}}',
            '- Department: {{G0-N02.profile.dept}}',
            '- Duty Station: {{G0-N02.profile.duty_station}}',
            '- Role: {{G0-N02.profile.role}}',
            '',
            'Return ONLY valid JSON:',
            '{',
            '  "intent": "hardware_request|access_request|workspace_request|incident|other",',
            '  "category": "IT|HR|Facilities|Finance|Legal|Other",',
            '  "subcategory": "string",',
            '  "urgency": "low|medium|high|critical",',
            '  "impact": "individual|team|department|organization",',
            '  "params": {},',
            '  "missing_params": [],',
            '  "confidence": 0.0-1.0',
            '}',
          ].join('\n'),
          user_prompt: '{{input.raw_text}}',
          output_format: 'json',
        },
      },
    },

    // --- CHECK CONFIDENCE ---
    {
      id: 'G0-N04',
      type: 'condition',
      position: { x: 700, y: 300 },
      data: {
        label: 'Confidence Check',
        tool: 'workflow.condition',
        config: {
          expression: 'G0_N03.confidence >= 0.7 && G0_N03.missing_params.length === 0',
        },
      },
    },

    // --- ASK CLARIFYING QUESTIONS (LLM) ---
    {
      id: 'G0-N05',
      type: 'ai_node',
      position: { x: 700, y: 150 },
      data: {
        label: 'Generate Questions',
        tool: 'ai.generate',
        config: {
          model: 'gemini-2.0-flash',
          system_prompt: [
            'Generate clarifying questions to fill missing parameters.',
            'Missing: {{G0-N03.missing_params}}',
            'Be concise, ask maximum 3 questions.',
            'Return as JSON array of strings.',
          ].join('\n'),
          user_prompt: 'Original request: {{input.raw_text}}',
        },
      },
    },

    // --- WAIT FOR USER RESPONSE ---
    {
      id: 'G0-N06',
      type: 'wait_input',
      position: { x: 900, y: 150 },
      data: {
        label: 'Await Clarification',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'user_response', type: 'string', required: true },
          ],
          recipients: ['{{input.user_id}}'],
          timeout_hours: 24,
          timeout_action: 'cancel',
          prompt: '{{G0-N05.output}}',
        },
      },
    },

    // --- SEARCH MATCHING GRAPH ---
    {
      id: 'G0-N07',
      type: 'action',
      position: { x: 900, y: 300 },
      data: {
        label: 'Find Business Graph',
        tool: 'vector.search',
        config: {
          collection: 'business_process_graphs',
          query: '{{G0-N03.intent}} {{G0-N03.category}} {{G0-N03.subcategory}}',
          filter: {
            is_active: true,
          },
          limit: 3,
          score_threshold: 0.65,
        },
      },
    },

    // --- CHECK GRAPH FOUND ---
    {
      id: 'G0-N08',
      type: 'condition',
      position: { x: 1100, y: 300 },
      data: {
        label: 'Graph Found?',
        tool: 'workflow.condition',
        config: {
          expression: 'G0_N07.results && G0_N07.results.length > 0 && G0_N07.results[0].score >= 0.7',
        },
      },
    },

    // --- VALIDATE USER PERMISSIONS ---
    {
      id: 'G0-N09',
      type: 'action',
      position: { x: 1300, y: 300 },
      data: {
        label: 'Validate Permissions',
        tool: 'workflow.validate',
        config: {
          user_id: '{{input.user_id}}',
          action: 'submit_sr',
          resource: {
            category: '{{G0-N03.category}}',
            duty_station: '{{G0-N02.profile.duty_station}}',
          },
        },
      },
    },

    // --- CHECK VALID ---
    {
      id: 'G0-N10',
      type: 'condition',
      position: { x: 1500, y: 300 },
      data: {
        label: 'Permissions Valid?',
        tool: 'workflow.condition',
        config: {
          expression: 'G0_N09.valid === true',
        },
      },
    },

    // --- SPAWN BUSINESS GRAPH ---
    {
      id: 'G0-N11',
      type: 'action',
      position: { x: 1700, y: 300 },
      data: {
        label: 'Spawn Business Graph',
        tool: 'workflow.spawn_graph',
        config: {
          graph_id: '{{G0-N07.results[0].payload.graph_id}}',
          params: {
            user_id: '{{input.user_id}}',
            user_profile: '{{G0-N02.profile}}',
            extracted_intent: '{{G0-N03}}',
            raw_text: '{{input.raw_text}}',
          },
          mode: 'async',
        },
      },
    },

    // --- NOTIFY USER: REQUEST ACCEPTED ---
    {
      id: 'G0-N12',
      type: 'action',
      position: { x: 1900, y: 300 },
      data: {
        label: 'Notify: Accepted',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}'],
          subject: 'Service Request Initiated',
          body: [
            'Your request has been received and is being processed.',
            '',
            'Category: {{G0-N03.category}}',
            'Type: {{G0-N03.intent}}',
            'Execution ID: {{G0-N11.child_execution_id}}',
            '',
            'You will receive updates as your request progresses.',
          ].join('\n'),
          priority: 'normal',
        },
      },
    },

    // --- END SUCCESS ---
    {
      id: 'G0-N13',
      type: 'end',
      position: { x: 2100, y: 300 },
      data: {
        label: 'Complete',
        tool: 'workflow.end',
        config: {
          outputs: ['child_execution_id', 'category', 'intent'],
        },
      },
    },

    // --- ERROR: NO GRAPH FOUND ---
    {
      id: 'G0-N14',
      type: 'action',
      position: { x: 1100, y: 500 },
      data: {
        label: 'Notify: Manual Review',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}', 'SERVICE-DESK-{{G0-N02.profile.duty_station}}'],
          subject: 'Request Requires Manual Review',
          body: 'Your request could not be automatically categorized. A service desk agent will contact you shortly.',
          priority: 'high',
        },
      },
    },

    // --- ERROR: PERMISSION DENIED ---
    {
      id: 'G0-N15',
      type: 'action',
      position: { x: 1500, y: 500 },
      data: {
        label: 'Notify: Permission Denied',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}'],
          subject: 'Request Cannot Be Processed',
          body: 'Your request could not be processed due to permission restrictions:\n{{G0-N09.violations}}',
          priority: 'normal',
        },
      },
    },

    // --- END ERROR ---
    {
      id: 'G0-N16',
      type: 'end',
      position: { x: 1700, y: 500 },
      data: {
        label: 'Complete (Error)',
        tool: 'workflow.end',
        config: {
          status: 'error',
          outputs: ['error_reason'],
        },
      },
    },
  ],

  edges: [
    { id: 'e01-02', source: 'G0-N01', target: 'G0-N02' },
    { id: 'e02-03', source: 'G0-N02', target: 'G0-N03' },
    { id: 'e03-04', source: 'G0-N03', target: 'G0-N04' },

    // Confidence check branching
    { id: 'e04-05', source: 'G0-N04', target: 'G0-N05', label: 'low_confidence' },
    { id: 'e04-07', source: 'G0-N04', target: 'G0-N07', label: 'high_confidence' },

    // Clarification loop
    { id: 'e05-06', source: 'G0-N05', target: 'G0-N06' },
    { id: 'e06-03', source: 'G0-N06', target: 'G0-N03', label: 'retry_extraction' },

    // Graph search result
    { id: 'e07-08', source: 'G0-N07', target: 'G0-N08' },
    { id: 'e08-09', source: 'G0-N08', target: 'G0-N09', label: 'found' },
    { id: 'e08-14', source: 'G0-N08', target: 'G0-N14', label: 'not_found' },

    // Permission check
    { id: 'e09-10', source: 'G0-N09', target: 'G0-N10' },
    { id: 'e10-11', source: 'G0-N10', target: 'G0-N11', label: 'valid' },
    { id: 'e10-15', source: 'G0-N10', target: 'G0-N15', label: 'invalid' },

    // Success path
    { id: 'e11-12', source: 'G0-N11', target: 'G0-N12' },
    { id: 'e12-13', source: 'G0-N12', target: 'G0-N13' },

    // Error paths
    { id: 'e14-16', source: 'G0-N14', target: 'G0-N16' },
    { id: 'e15-16', source: 'G0-N15', target: 'G0-N16' },
  ],
};

module.exports = { GRAPH_0_META };
