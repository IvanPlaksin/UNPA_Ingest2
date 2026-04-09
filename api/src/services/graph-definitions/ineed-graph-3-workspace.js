/**
 * iNeed Graph 3: Facilities Workspace Request
 *
 * 12 nodes. Double wait_input:
 *   1. User selects workspace from available options
 *   2. Facilities Officer confirms assignment
 *
 * Flow:
 *   START → Search Available Workspaces → Present Options → Wait User Choice
 *   → Create SR → Notify Facilities → Wait Facilities Confirmation
 *   → Assign Workspace → Notify User → Close SR → END
 */

// ====================================================================
// GRAPH 3: Facilities Workspace Request
// ====================================================================

const GRAPH_3_FACILITIES_WORKSPACE = {
  graph_id: 'INEED-G3-FACILITIES-WORKSPACE-V1',
  name: 'iNeed: Facilities Workspace Request',
  description: 'Process workspace/office requests with availability check and Facilities Officer confirmation',
  category: 'Facilities',
  subcategory: 'Workspace',
  version: '1.0.0',

  nodes: [
    // G3-N01: START
    {
      id: 'G3-N01',
      type: 'start',
      position: { x: 100, y: 300 },
      data: {
        label: 'Workspace Request Intake',
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

    // G3-N02: Search Available Workspaces
    {
      id: 'G3-N02',
      type: 'action',
      position: { x: 300, y: 300 },
      data: {
        label: 'Search Workspaces',
        tool: 'graph.query',
        config: {
          query: [
            'MATCH (w:Workspace)',
            "WHERE w.duty_station = $duty_station AND w.status = 'available'",
            'RETURN w ORDER BY w.building, w.floor, w.room',
            'LIMIT 10',
          ].join('\n'),
          params: {
            duty_station: '{{input.user_profile.duty_station}}',
          },
        },
      },
    },

    // G3-N03: Check Availability
    {
      id: 'G3-N03',
      type: 'condition',
      position: { x: 500, y: 300 },
      data: {
        label: 'Workspaces Available?',
        tool: 'workflow.condition',
        config: {
          expression: 'G3_N02.results && G3_N02.results.length > 0',
        },
      },
    },

    // G3-N04: Notify — No Availability
    {
      id: 'G3-N04',
      type: 'action',
      position: { x: 500, y: 500 },
      data: {
        label: 'Notify: No Availability',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}'],
          subject: 'No Workspaces Available',
          body: [
            'No workspaces are currently available at {{input.user_profile.duty_station}}.',
            '',
            'Your request has been added to the waiting list.',
            'You will be notified when a workspace becomes available.',
          ].join('\n'),
          priority: 'normal',
        },
      },
    },

    // G3-N05: END (No Availability)
    {
      id: 'G3-N05',
      type: 'end',
      position: { x: 700, y: 500 },
      data: {
        label: 'Complete (Waitlisted)',
        tool: 'workflow.end',
        config: {
          status: 'waitlisted',
          outputs: ['waitlist_position'],
        },
      },
    },

    // G3-N06: Wait for User Choice (WAIT_INPUT #1)
    {
      id: 'G3-N06',
      type: 'wait_input',
      position: { x: 700, y: 300 },
      data: {
        label: 'Await User Selection',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'selected_workspace_id', type: 'string', required: true },
            { name: 'preferred_move_date', type: 'date', required: false },
            { name: 'special_requirements', type: 'string', required: false },
          ],
          recipients: ['{{input.user_id}}'],
          timeout_hours: 72,
          timeout_action: 'cancel',
          prompt: 'Please select your preferred workspace from the available options:\n{{G3-N02.results}}',
        },
      },
    },

    // G3-N07: Create Service Request
    {
      id: 'G3-N07',
      type: 'action',
      position: { x: 900, y: 300 },
      data: {
        label: 'Create Service Request',
        tool: 'graph.create_node',
        config: {
          namespace: 'PROJECT',
          label: 'ServiceRequest',
          properties: {
            sr_id: '{{$uuid}}',
            category: 'Facilities',
            subcategory: 'Workspace',
            status: 'IN_PROGRESS',
            priority: 'P3',
            duty_station: '{{input.user_profile.duty_station}}',
            requestor_id: '{{input.user_id}}',
            selected_workspace: '{{G3-N06.selected_workspace_id}}',
            move_date: '{{G3-N06.preferred_move_date}}',
            special_requirements: '{{G3-N06.special_requirements}}',
            created_at: '{{$now}}',
          },
        },
      },
    },

    // G3-N08: Notify Facilities Officer
    {
      id: 'G3-N08',
      type: 'action',
      position: { x: 1100, y: 300 },
      data: {
        label: 'Notify Facilities',
        tool: 'notification.send',
        config: {
          channel: 'email',
          recipients: ['FAC-{{input.user_profile.duty_station}}'],
          subject: 'Workspace Assignment — Confirmation Required',
          body: [
            'Workspace assignment request:',
            '',
            'Staff: {{input.user_profile.full_name}} ({{input.user_profile.dept}})',
            'Requested Workspace: {{G3-N06.selected_workspace_id}}',
            'Preferred Move Date: {{G3-N06.preferred_move_date}}',
            'Special Requirements: {{G3-N06.special_requirements}}',
            '',
            'SR: {{G3-N07.sr_id}}',
            '',
            'Please confirm the workspace is ready for assignment.',
          ].join('\n'),
          priority: 'normal',
        },
      },
    },

    // G3-N09: Wait for Facilities Confirmation (WAIT_INPUT #2)
    {
      id: 'G3-N09',
      type: 'wait_input',
      position: { x: 1300, y: 300 },
      data: {
        label: 'Await Facilities Confirmation',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'confirmed', type: 'boolean', required: true },
            { name: 'actual_move_date', type: 'date', required: false },
            { name: 'key_card_number', type: 'string', required: false },
            { name: 'facilities_notes', type: 'string', required: false },
          ],
          recipients: ['FAC-{{input.user_profile.duty_station}}'],
          timeout_hours: 96,
          timeout_action: 'escalate',
          prompt: 'Confirm workspace {{G3-N06.selected_workspace_id}} assignment for {{input.user_profile.full_name}}',
        },
      },
    },

    // G3-N10: Assign Workspace in Memgraph
    {
      id: 'G3-N10',
      type: 'action',
      position: { x: 1500, y: 300 },
      data: {
        label: 'Assign Workspace',
        tool: 'graph.query',
        config: {
          query: [
            'MATCH (w:Workspace {workspace_id: $workspace_id})',
            'MATCH (u:UNStaffProfile {user_id: $user_id})',
            "SET w.status = 'occupied', w.assigned_to = $user_id, w.assigned_at = datetime()",
            'MERGE (u)-[:ASSIGNED_TO]->(w)',
            'RETURN w, u',
          ].join('\n'),
          params: {
            workspace_id: '{{G3-N06.selected_workspace_id}}',
            user_id: '{{input.user_id}}',
          },
        },
      },
    },

    // G3-N11: Notify User — Workspace Assigned
    {
      id: 'G3-N11',
      type: 'action',
      position: { x: 1700, y: 300 },
      data: {
        label: 'Notify: Assigned',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}'],
          subject: 'Workspace Assigned',
          body: [
            'Your workspace has been assigned.',
            '',
            'Workspace: {{G3-N06.selected_workspace_id}}',
            'Move Date: {{G3-N09.actual_move_date}}',
            'Key Card: {{G3-N09.key_card_number}}',
            '',
            '{{G3-N09.facilities_notes}}',
          ].join('\n'),
          priority: 'normal',
        },
      },
    },

    // G3-N12: Close SR + END
    {
      id: 'G3-N12',
      type: 'end',
      position: { x: 1900, y: 300 },
      data: {
        label: 'Complete',
        tool: 'workflow.end',
        config: {
          status: 'success',
          outputs: ['sr_id', 'workspace_id', 'move_date'],
        },
      },
    },
  ],

  edges: [
    { id: 'e01-02', source: 'G3-N01', target: 'G3-N02' },
    { id: 'e02-03', source: 'G3-N02', target: 'G3-N03' },

    // Availability check
    { id: 'e03-04', source: 'G3-N03', target: 'G3-N04', label: 'no_availability' },
    { id: 'e03-06', source: 'G3-N03', target: 'G3-N06', label: 'available' },

    // No availability path
    { id: 'e04-05', source: 'G3-N04', target: 'G3-N05' },

    // Main flow: user choice → SR → Facilities confirmation → assign
    { id: 'e06-07', source: 'G3-N06', target: 'G3-N07' },
    { id: 'e07-08', source: 'G3-N07', target: 'G3-N08' },
    { id: 'e08-09', source: 'G3-N08', target: 'G3-N09' },
    { id: 'e09-10', source: 'G3-N09', target: 'G3-N10' },
    { id: 'e10-11', source: 'G3-N10', target: 'G3-N11' },
    { id: 'e11-12', source: 'G3-N11', target: 'G3-N12' },
  ],
};

module.exports = { GRAPH_3_FACILITIES_WORKSPACE };
