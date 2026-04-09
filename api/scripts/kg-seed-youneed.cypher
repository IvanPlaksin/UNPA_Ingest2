// ═══════════════════════════════════════════════════════════════════
// YOUNEED Namespace: iNeed Test Scenario Components
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// BUSINESS PROCESS GRAPHS (4)
// ═══════════════════════════════════════════════════════════════════

MERGE (g0:YNBusinessGraph {graph_id: 'INEED-G0-META-INTAKE-V1'})
SET g0.name = 'iNeed: AI Intake Agent',
    g0.category = 'META',
    g0.file = 'api/src/services/graph-definitions/ineed-graphs.js',
    g0.node_count = 16,
    g0.edge_count = 17,
    g0.wait_input_count = 1,
    g0.llm_nodes = 2,
    g0.condition_count = 3,
    g0.namespace = 'YOUNEED',
    g0.description = 'AI dispatcher: extract intent, find graph, spawn execution',
    g0.version = '1.0.0',
    g0.created_at = datetime();

MERGE (g1:YNBusinessGraph {graph_id: 'INEED-G1-IT-HARDWARE-V1'})
SET g1.name = 'iNeed: IT Hardware Request',
    g1.category = 'IT',
    g1.subcategory = 'Hardware',
    g1.file = 'api/src/services/graph-definitions/ineed-graph-1-hardware.js',
    g1.node_count = 22,
    g1.edge_count = 23,
    g1.wait_input_count = 2,
    g1.llm_nodes = 1,
    g1.condition_count = 3,
    g1.namespace = 'YOUNEED',
    g1.description = 'IT hardware: inventory check, approval loop, delivery tracking',
    g1.version = '1.0.0',
    g1.created_at = datetime();

MERGE (g2:YNBusinessGraph {graph_id: 'INEED-G2-HR-ACCESS-V1'})
SET g2.name = 'iNeed: HR Access/Badge Request',
    g2.category = 'HR',
    g2.subcategory = 'Access',
    g2.file = 'api/src/services/graph-definitions/ineed-graph-2-access.js',
    g2.node_count = 13,
    g2.edge_count = 13,
    g2.wait_input_count = 1,
    g2.llm_nodes = 1,
    g2.condition_count = 2,
    g2.namespace = 'YOUNEED',
    g2.description = 'HR access: clearance check, Security Office approval, badge issuance',
    g2.version = '1.0.0',
    g2.created_at = datetime();

MERGE (g3:YNBusinessGraph {graph_id: 'INEED-G3-FACILITIES-WORKSPACE-V1'})
SET g3.name = 'iNeed: Facilities Workspace Request',
    g3.category = 'Facilities',
    g3.subcategory = 'Workspace',
    g3.file = 'api/src/services/graph-definitions/ineed-graph-3-workspace.js',
    g3.node_count = 12,
    g3.edge_count = 11,
    g3.wait_input_count = 2,
    g3.llm_nodes = 0,
    g3.condition_count = 1,
    g3.namespace = 'YOUNEED',
    g3.description = 'Facilities: workspace search, user selection, officer confirmation',
    g3.version = '1.0.0',
    g3.created_at = datetime();

// ═══════════════════════════════════════════════════════════════════
// TEST USERS (4 staff + 4 managers)
// ═══════════════════════════════════════════════════════════════════

MERGE (u1:YNTestUser {user_id: 'TS-001'})
SET u1.full_name = 'Maria Santos',
    u1.email = 'maria.santos@un.org',
    u1.dept = 'ICTS',
    u1.duty_station = 'New York',
    u1.role = 'P4',
    u1.clearance_level = 'confidential',
    u1.manager_id = 'MGR-NY-001',
    u1.namespace = 'YOUNEED',
    u1.created_at = datetime();

MERGE (u2:YNTestUser {user_id: 'TS-002'})
SET u2.full_name = 'Ahmed Al-Rashid',
    u2.email = 'ahmed.alrashid@un.org',
    u2.dept = 'OCHA',
    u2.duty_station = 'Geneva',
    u2.role = 'P3',
    u2.clearance_level = 'confidential',
    u2.manager_id = 'MGR-GVA-001',
    u2.namespace = 'YOUNEED',
    u2.created_at = datetime();

MERGE (u3:YNTestUser {user_id: 'TS-003'})
SET u3.full_name = 'Ji-Yeon Park',
    u3.email = 'jiyeon.park@un.org',
    u3.dept = 'UNEP',
    u3.duty_station = 'Nairobi',
    u3.role = 'G7',
    u3.clearance_level = 'basic',
    u3.manager_id = 'MGR-NBI-001',
    u3.namespace = 'YOUNEED',
    u3.created_at = datetime();

MERGE (u4:YNTestUser {user_id: 'TS-004'})
SET u4.full_name = 'Ravi Chakraborty',
    u4.email = 'ravi.chakraborty@un.org',
    u4.dept = 'OLA',
    u4.duty_station = 'New York',
    u4.role = 'P5',
    u4.clearance_level = 'secret',
    u4.manager_id = 'MGR-NY-002',
    u4.namespace = 'YOUNEED',
    u4.created_at = datetime();

// ═══════════════════════════════════════════════════════════════════
// TEST SCENARIOS (4)
// ═══════════════════════════════════════════════════════════════════

MERGE (t1:YNTestScenario {scenario_id: 'TR-01'})
SET t1.description = 'Maria Santos (NY, ICTS) requests high-spec laptop',
    t1.raw_text = 'I need a new laptop, my current one is 5 years old and very slow. I work in data analytics so I need at least 32GB RAM.',
    t1.expected_graph = 'INEED-G1-IT-HARDWARE-V1',
    t1.expected_pauses = 'G1-N11,G1-N16',
    t1.user_id = 'TS-001',
    t1.namespace = 'YOUNEED',
    t1.created_at = datetime();

MERGE (t2:YNTestScenario {scenario_id: 'TR-02'})
SET t2.description = 'Ahmed Al-Rashid (Geneva, OCHA) requests building access',
    t2.raw_text = 'I need a building access pass for Palais des Nations next week, temporary assignment.',
    t2.expected_graph = 'INEED-G2-HR-ACCESS-V1',
    t2.expected_pauses = 'G2-N08',
    t2.user_id = 'TS-002',
    t2.namespace = 'YOUNEED',
    t2.created_at = datetime();

MERGE (t3:YNTestScenario {scenario_id: 'TR-03'})
SET t3.description = 'Ji-Yeon Park (Nairobi, UNEP) requests workspace for new hire',
    t3.raw_text = 'We have a new team member joining in 2 weeks. She needs a desk and phone in Block C.',
    t3.expected_graph = 'INEED-G3-FACILITIES-WORKSPACE-V1',
    t3.expected_pauses = 'G3-N06,G3-N09',
    t3.user_id = 'TS-003',
    t3.namespace = 'YOUNEED',
    t3.created_at = datetime();

MERGE (t4:YNTestScenario {scenario_id: 'TR-04'})
SET t4.description = 'Ravi Chakraborty (NY, OLA) urgent monitor replacement',
    t4.raw_text = 'My monitor suddenly stopped working this morning. Urgent - I have a Security Council meeting at 3pm.',
    t4.expected_graph = 'INEED-G1-IT-HARDWARE-V1',
    t4.expected_pauses = 'G1-N16',
    t4.expected_priority = 'P1',
    t4.user_id = 'TS-004',
    t4.namespace = 'YOUNEED',
    t4.created_at = datetime();

// ═══════════════════════════════════════════════════════════════════
// ORGANIZATIONAL ROLES (for graph dependencies)
// ═══════════════════════════════════════════════════════════════════

MERGE (mr:YNRole {role_id: 'MANAGER-ROLE'})
SET mr.name = 'Manager (D1+)',
    mr.description = 'Approves equipment requests over $5K',
    mr.namespace = 'YOUNEED',
    mr.created_at = datetime();

MERGE (so:YNRole {role_id: 'SECURITY-OFFICE'})
SET so.name = 'Security Office',
    so.description = 'Approves building access and badge requests',
    so.namespace = 'YOUNEED',
    so.created_at = datetime();

MERGE (fo:YNRole {role_id: 'FACILITIES-OFFICER'})
SET fo.name = 'Facilities Officer',
    fo.description = 'Confirms workspace assignments',
    fo.namespace = 'YOUNEED',
    fo.created_at = datetime();

// ═══════════════════════════════════════════════════════════════════
// EDGES: META → Business Graphs (CAN_SPAWN)
// ═══════════════════════════════════════════════════════════════════

MATCH (g0:YNBusinessGraph {graph_id: 'INEED-G0-META-INTAKE-V1'})
MATCH (g1:YNBusinessGraph {graph_id: 'INEED-G1-IT-HARDWARE-V1'})
MERGE (g0)-[:CAN_SPAWN {via_node: 'G0-N11', method: 'workflow.spawn_graph'}]->(g1);

MATCH (g0:YNBusinessGraph {graph_id: 'INEED-G0-META-INTAKE-V1'})
MATCH (g2:YNBusinessGraph {graph_id: 'INEED-G2-HR-ACCESS-V1'})
MERGE (g0)-[:CAN_SPAWN {via_node: 'G0-N11', method: 'workflow.spawn_graph'}]->(g2);

MATCH (g0:YNBusinessGraph {graph_id: 'INEED-G0-META-INTAKE-V1'})
MATCH (g3:YNBusinessGraph {graph_id: 'INEED-G3-FACILITIES-WORKSPACE-V1'})
MERGE (g0)-[:CAN_SPAWN {via_node: 'G0-N11', method: 'workflow.spawn_graph'}]->(g3);

// ═══════════════════════════════════════════════════════════════════
// EDGES: TestScenario → TestUser (SUBMITTED_BY)
// ═══════════════════════════════════════════════════════════════════

MATCH (t1:YNTestScenario {scenario_id: 'TR-01'})
MATCH (u1:YNTestUser {user_id: 'TS-001'})
MERGE (t1)-[:SUBMITTED_BY]->(u1);

MATCH (t2:YNTestScenario {scenario_id: 'TR-02'})
MATCH (u2:YNTestUser {user_id: 'TS-002'})
MERGE (t2)-[:SUBMITTED_BY]->(u2);

MATCH (t3:YNTestScenario {scenario_id: 'TR-03'})
MATCH (u3:YNTestUser {user_id: 'TS-003'})
MERGE (t3)-[:SUBMITTED_BY]->(u3);

MATCH (t4:YNTestScenario {scenario_id: 'TR-04'})
MATCH (u4:YNTestUser {user_id: 'TS-004'})
MERGE (t4)-[:SUBMITTED_BY]->(u4);

// ═══════════════════════════════════════════════════════════════════
// EDGES: TestScenario → BusinessGraph (EXPECTS_GRAPH)
// ═══════════════════════════════════════════════════════════════════

MATCH (t1:YNTestScenario {scenario_id: 'TR-01'})
MATCH (g1:YNBusinessGraph {graph_id: 'INEED-G1-IT-HARDWARE-V1'})
MERGE (t1)-[:EXPECTS_GRAPH]->(g1);

MATCH (t2:YNTestScenario {scenario_id: 'TR-02'})
MATCH (g2:YNBusinessGraph {graph_id: 'INEED-G2-HR-ACCESS-V1'})
MERGE (t2)-[:EXPECTS_GRAPH]->(g2);

MATCH (t3:YNTestScenario {scenario_id: 'TR-03'})
MATCH (g3:YNBusinessGraph {graph_id: 'INEED-G3-FACILITIES-WORKSPACE-V1'})
MERGE (t3)-[:EXPECTS_GRAPH]->(g3);

MATCH (t4:YNTestScenario {scenario_id: 'TR-04'})
MATCH (g1b:YNBusinessGraph {graph_id: 'INEED-G1-IT-HARDWARE-V1'})
MERGE (t4)-[:EXPECTS_GRAPH]->(g1b);

// ═══════════════════════════════════════════════════════════════════
// EDGES: Graph → Role Dependencies
// ═══════════════════════════════════════════════════════════════════

MATCH (g1:YNBusinessGraph {graph_id: 'INEED-G1-IT-HARDWARE-V1'})
MATCH (mr:YNRole {role_id: 'MANAGER-ROLE'})
MERGE (g1)-[:REQUIRES_APPROVAL {threshold_usd: 5000, wait_node: 'G1-N11', timeout_hours: 48}]->(mr);

MATCH (g2:YNBusinessGraph {graph_id: 'INEED-G2-HR-ACCESS-V1'})
MATCH (so:YNRole {role_id: 'SECURITY-OFFICE'})
MERGE (g2)-[:REQUIRES_CLEARANCE {wait_node: 'G2-N08', timeout_hours: 120}]->(so);

MATCH (g3:YNBusinessGraph {graph_id: 'INEED-G3-FACILITIES-WORKSPACE-V1'})
MATCH (fo:YNRole {role_id: 'FACILITIES-OFFICER'})
MERGE (g3)-[:REQUIRES_CONFIRMATION {wait_node: 'G3-N09', timeout_hours: 96}]->(fo);

// ═══════════════════════════════════════════════════════════════════
// CROSS-NAMESPACE EDGE: YOUNEED Graphs → CORE Components
// ═══════════════════════════════════════════════════════════════════

MATCH (g0:YNBusinessGraph {graph_id: 'INEED-G0-META-INTAKE-V1'})
MATCH (gl:CoreComponent {component_id: 'CORE-SERVICE-GRAPH-LOADER'})
MERGE (g0)-[:LOADED_BY]->(gl);

MATCH (g1:YNBusinessGraph {graph_id: 'INEED-G1-IT-HARDWARE-V1'})
MATCH (gl:CoreComponent {component_id: 'CORE-SERVICE-GRAPH-LOADER'})
MERGE (g1)-[:LOADED_BY]->(gl);

MATCH (g2:YNBusinessGraph {graph_id: 'INEED-G2-HR-ACCESS-V1'})
MATCH (gl:CoreComponent {component_id: 'CORE-SERVICE-GRAPH-LOADER'})
MERGE (g2)-[:LOADED_BY]->(gl);

MATCH (g3:YNBusinessGraph {graph_id: 'INEED-G3-FACILITIES-WORKSPACE-V1'})
MATCH (gl:CoreComponent {component_id: 'CORE-SERVICE-GRAPH-LOADER'})
MERGE (g3)-[:LOADED_BY]->(gl);
