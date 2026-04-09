/**
 * iNeed Graph 2: HR Access / Badge Request
 *
 * 13 nodes. Security Office clearance with wait_input (5 business days).
 * Flow:
 *   START → Load Profile → Determine Access Type → Check Clearance Level
 *   → Create SR → Notify Security Office → Wait for Security Approval
 *   → Create/Update Badge → Notify User → Close SR → END
 */

// ====================================================================
// GRAPH 2: HR Access / Badge Request
// ====================================================================

const GRAPH_2_HR_ACCESS = {
  graph_id: 'INEED-G2-HR-ACCESS-V1',
  name: 'iNeed: HR Access/Badge Request',
  description: 'Process building access and badge requests with Security Office clearance workflow',
  category: 'HR',
  subcategory: 'Access',
  version: '1.0.0',

  nodes: [
    // G2-N01: START
    {
      id: 'G2-N01',
      type: 'start',
      position: { x: 100, y: 300 },
      data: {
        label: 'Access Request Intake',
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

    // G2-N02: Determine Access Type (LLM)
    {
      id: 'G2-N02',
      type: 'ai_node',
      position: { x: 300, y: 300 },
      data: {
        label: 'Determine Access Type',
        tool: 'ai.generate',
        config: {
          model: 'gemini-2.0-flash',
          system_prompt: [
            'Classify the UN building access request.',
            'User profile:',
            '- Name: {{input.user_profile.full_name}}',
            '- Dept: {{input.user_profile.dept}}',
            '- Duty Station: {{input.user_profile.duty_station}}',
            '- Current Clearance: {{input.user_profile.clearance_level}}',
            '',
            'Return JSON:',
            '{',
            '  "access_type": "new_badge|replacement|upgrade|visitor|temporary",',
            '  "building": "string",',
            '  "zones": ["public","restricted","secure","vip"],',
            '  "required_clearance": "basic|confidential|secret|top_secret",',
            '  "duration": "permanent|temporary",',
            '  "temporary_days": number or null,',
            '  "justification": "string"',
            '}',
          ].join('\n'),
          user_prompt: '{{input.raw_text}}',
          output_format: 'json',
        },
      },
    },

    // G2-N03: Check Clearance Level
    {
      id: 'G2-N03',
      type: 'condition',
      position: { x: 500, y: 300 },
      data: {
        label: 'Clearance Sufficient?',
        tool: 'workflow.condition',
        config: {
          expression: [
            '(function() {',
            '  const levels = { basic: 1, confidential: 2, secret: 3, top_secret: 4 };',
            '  const current = levels[input.user_profile.clearance_level] || 0;',
            '  const required = levels[G2_N02.required_clearance] || 0;',
            '  return current >= required;',
            '})()',
          ].join('\n'),
        },
      },
    },

    // G2-N04: Notify — Clearance Upgrade Required
    {
      id: 'G2-N04',
      type: 'action',
      position: { x: 500, y: 500 },
      data: {
        label: 'Notify: Upgrade Required',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}'],
          subject: 'Clearance Upgrade Required',
          body: [
            'Your current clearance ({{input.user_profile.clearance_level}}) is insufficient.',
            'Required: {{G2-N02.required_clearance}}',
            '',
            'Please contact your HR representative to request a clearance upgrade.',
          ].join('\n'),
          priority: 'normal',
        },
      },
    },

    // G2-N05: END (Insufficient Clearance)
    {
      id: 'G2-N05',
      type: 'end',
      position: { x: 700, y: 500 },
      data: {
        label: 'Complete (Denied)',
        tool: 'workflow.end',
        config: {
          status: 'denied',
          outputs: ['denial_reason'],
        },
      },
    },

    // G2-N06: Create Service Request
    {
      id: 'G2-N06',
      type: 'action',
      position: { x: 700, y: 300 },
      data: {
        label: 'Create Service Request',
        tool: 'graph.create_node',
        config: {
          namespace: 'PROJECT',
          label: 'ServiceRequest',
          properties: {
            sr_id: '{{$uuid}}',
            category: 'HR',
            subcategory: 'Access',
            status: 'IN_PROGRESS',
            priority: 'P3',
            duty_station: '{{input.user_profile.duty_station}}',
            requestor_id: '{{input.user_id}}',
            access_type: '{{G2-N02.access_type}}',
            building: '{{G2-N02.building}}',
            zones: '{{G2-N02.zones}}',
            created_at: '{{$now}}',
          },
        },
      },
    },

    // G2-N07: Notify Security Office
    {
      id: 'G2-N07',
      type: 'action',
      position: { x: 900, y: 300 },
      data: {
        label: 'Notify Security Office',
        tool: 'notification.send',
        config: {
          channel: 'email',
          recipients: ['SEC-{{input.user_profile.duty_station}}'],
          subject: 'Access Request — Security Review Required',
          body: [
            'New access request requires security review:',
            '',
            'Requestor: {{input.user_profile.full_name}} ({{input.user_profile.dept}})',
            'Access Type: {{G2-N02.access_type}}',
            'Building: {{G2-N02.building}}',
            'Zones: {{G2-N02.zones}}',
            'Clearance: {{input.user_profile.clearance_level}}',
            'Duration: {{G2-N02.duration}}',
            '',
            'SR: {{G2-N06.sr_id}}',
          ].join('\n'),
          priority: 'high',
        },
      },
    },

    // G2-N08: Wait for Security Approval (5 business days)
    {
      id: 'G2-N08',
      type: 'wait_input',
      position: { x: 1100, y: 300 },
      data: {
        label: 'Await Security Clearance',
        tool: 'workflow.wait_input',
        config: {
          expected_inputs: [
            { name: 'decision', type: 'enum', values: ['approved', 'rejected', 'requires_interview'], required: true },
            { name: 'badge_number', type: 'string', required: false },
            { name: 'security_notes', type: 'string', required: false },
            { name: 'approved_zones', type: 'string', required: false },
          ],
          recipients: ['SEC-{{input.user_profile.duty_station}}'],
          timeout_hours: 120,
          timeout_action: 'escalate',
          prompt: 'Review access request for {{input.user_profile.full_name}}',
        },
      },
    },

    // G2-N09: Check Security Decision
    {
      id: 'G2-N09',
      type: 'condition',
      position: { x: 1300, y: 300 },
      data: {
        label: 'Approved?',
        tool: 'workflow.condition',
        config: {
          expression: 'G2_N08.decision === "approved"',
        },
      },
    },

    // G2-N10: Create/Update Badge Record
    {
      id: 'G2-N10',
      type: 'action',
      position: { x: 1500, y: 300 },
      data: {
        label: 'Issue Badge',
        tool: 'graph.query',
        config: {
          query: [
            'MATCH (u:UNStaffProfile {user_id: $user_id})',
            'MERGE (b:Badge {badge_number: $badge_number})',
            'SET b.access_type = $access_type, b.zones = $zones, b.issued_at = datetime(),',
            '    b.building = $building, b.status = "ACTIVE"',
            'MERGE (u)-[:HAS_BADGE]->(b)',
            'RETURN b',
          ].join('\n'),
          params: {
            user_id: '{{input.user_id}}',
            badge_number: '{{G2-N08.badge_number}}',
            access_type: '{{G2-N02.access_type}}',
            zones: '{{G2-N08.approved_zones}}',
            building: '{{G2-N02.building}}',
          },
        },
      },
    },

    // G2-N11: Notify User — Badge Ready
    {
      id: 'G2-N11',
      type: 'action',
      position: { x: 1700, y: 300 },
      data: {
        label: 'Notify: Badge Ready',
        tool: 'notification.send',
        config: {
          channel: 'ineed_activity',
          recipients: ['{{input.user_id}}'],
          subject: 'Badge Ready for Pickup',
          body: [
            'Your access badge is ready.',
            '',
            'Badge Number: {{G2-N08.badge_number}}',
            'Building: {{G2-N02.building}}',
            'Zones: {{G2-N08.approved_zones}}',
            '',
            'Please pick up your badge at the Security Office.',
          ].join('\n'),
          priority: 'normal',
        },
      },
    },

    // G2-N12: Close SR
    {
      id: 'G2-N12',
      type: 'action',
      position: { x: 1900, y: 300 },
      data: {
        label: 'Close SR',
        tool: 'graph.query',
        config: {
          query: [
            'MATCH (sr:ServiceRequest {sr_id: $sr_id})',
            "SET sr.status = 'CLOSED', sr.closed_at = datetime()",
            'RETURN sr',
          ].join('\n'),
          params: { sr_id: '{{G2-N06.sr_id}}' },
        },
      },
    },

    // G2-N13: END Success
    {
      id: 'G2-N13',
      type: 'end',
      position: { x: 2100, y: 300 },
      data: {
        label: 'Complete',
        tool: 'workflow.end',
        config: {
          status: 'success',
          outputs: ['sr_id', 'badge_number'],
        },
      },
    },
  ],

  edges: [
    { id: 'e01-02', source: 'G2-N01', target: 'G2-N02' },
    { id: 'e02-03', source: 'G2-N02', target: 'G2-N03' },

    // Clearance check branching
    { id: 'e03-04', source: 'G2-N03', target: 'G2-N04', label: 'insufficient' },
    { id: 'e03-06', source: 'G2-N03', target: 'G2-N06', label: 'sufficient' },

    // Denied path
    { id: 'e04-05', source: 'G2-N04', target: 'G2-N05' },

    // Main flow
    { id: 'e06-07', source: 'G2-N06', target: 'G2-N07' },
    { id: 'e07-08', source: 'G2-N07', target: 'G2-N08' },
    { id: 'e08-09', source: 'G2-N08', target: 'G2-N09' },

    // Security decision branching
    { id: 'e09-10', source: 'G2-N09', target: 'G2-N10', label: 'approved' },
    { id: 'e09-04', source: 'G2-N09', target: 'G2-N04', label: 'rejected' },

    // Success flow
    { id: 'e10-11', source: 'G2-N10', target: 'G2-N11' },
    { id: 'e11-12', source: 'G2-N11', target: 'G2-N12' },
    { id: 'e12-13', source: 'G2-N12', target: 'G2-N13' },
  ],
};

module.exports = { GRAPH_2_HR_ACCESS };
