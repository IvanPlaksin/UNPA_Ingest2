// Priority 7: KG Update — Common Plugin, Fixes, Test Suites
// Run with: node api/scripts/seed-priority7.js

// ─── Plugin Nodes ───
MERGE (n:CoreComponent {id: 'CORE-PLUGIN-COMMON-JS'}) SET n.name = 'Common Plugin (JS)', n.type = 'plugin', n.path = 'api/src/core/aopeg/plugins/common/', n.files = 9, n.executors = 7, n.executor_types = 'workflow.start, workflow.end, workflow.condition, ai.generate, vector.search, graph.create_node, graph.query', n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-PLUGIN-WORKFLOW-JS'}) SET n.name = 'Workflow Plugin (JS)', n.type = 'plugin', n.path = 'api/src/core/aopeg/plugins/workflow/', n.executors = 5, n.executor_types = 'workflow.wait_input, workflow.set_variable, workflow.validate, graph.query_profile, workflow.spawn_graph', n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-PLUGIN-NOTIFICATION-JS'}) SET n.name = 'Notification Plugin (JS)', n.type = 'plugin', n.path = 'api/src/core/aopeg/plugins/notification/', n.executors = 1, n.executor_types = 'notification.send', n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-PLUGIN-SUBGRAPH-JS'}) SET n.name = 'SubGraph Plugin (JS)', n.type = 'plugin', n.path = 'api/src/core/aopeg/plugins/subgraph/', n.executors = 3, n.executor_types = 'subgraph.segment_graph, subgraph.extract_subgraph, subgraph.consolidate_subgraph', n.created_at = datetime();

// ─── Bug Fix Nodes ───
MERGE (n:CoreComponent {id: 'CORE-FIX-AOPEG-WAIT-PASSTHROUGH'}) SET n.name = 'Fix: WAIT_FOR_INPUT Passthrough', n.type = 'bugfix', n.file = 'api/src/runtime/integration/AOPEGAdapter.js', n.description = 'WAIT_FOR_INPUT status now passes through wrapExecutor and getTool layers without being treated as error', n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-FIX-AOPEG-ARRAY-FLATTEN'}) SET n.name = 'Fix: Array Flattening Guard', n.type = 'bugfix', n.file = 'api/src/runtime/integration/AOPEGAdapter.js', n.description = 'Added !Array.isArray guard to prevent Object.assign from destroying array parameters like expected_inputs and recipients', n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-FIX-REQUIRE-PATHS'}) SET n.name = 'Fix: Executor Require Paths', n.type = 'bugfix', n.files_fixed = 8, n.description = 'Fixed require paths in 8 executor files from 4-level to 5-level depth (executors/plugin/plugins/aopeg/core/src)', n.created_at = datetime();

// ─── Test Suite Nodes ───
MERGE (n:CoreComponent {id: 'CORE-TEST-INTEGRATION-CHECK'}) SET n.name = 'Integration Check Suite', n.type = 'test', n.path = 'api/scripts/integration-check.js', n.checks = 32, n.tests = 'AOPEG init, tool registry, set_variable, validate, notification, wait_input, resume, spawn_graph', n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-TEST-SMOKE-TR04'}) SET n.name = 'TR-04 Smoke Test', n.type = 'test', n.path = 'api/scripts/smoke-tr04.js', n.checks = 13, n.tests = '9-node DAG: SET_REQ, SET_USER, SET_URGENCY, SET_SLA, QUERY_PROFILE, VALIDATE, NOTIFY_USER, WAIT_DELIVERY, SET_FINAL', n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-TEST-META-E2E'}) SET n.name = 'META-GRAPH E2E Test Runner', n.type = 'test', n.path = 'api/scripts/test-meta-e2e.js', n.checks = 68, n.phases = '1:GraphStructure, 2:ExecutorRegistry, 3:MockHappyPath, 4:ServicePath, 5:DAGConversion', n.created_at = datetime();

// ─── Graph Definition Nodes ───
MERGE (n:CoreComponent {id: 'CORE-GRAPH-G0-META'}) SET n.name = 'META-GRAPH G0: AI Intake Agent', n.type = 'graph_definition', n.graph_id = 'INEED-G0-META-INTAKE-V1', n.path = 'api/src/services/graph-definitions/ineed-graphs.js', n.nodes = 16, n.edges = 17, n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-GRAPH-G1-HARDWARE'}) SET n.name = 'G1: IT Hardware Request', n.type = 'graph_definition', n.graph_id = 'INEED-G1-IT-HARDWARE-V1', n.path = 'api/src/services/graph-definitions/ineed-graph-1-hardware.js', n.nodes = 22, n.edges = 23, n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-GRAPH-G2-ACCESS'}) SET n.name = 'G2: HR Access/Badge Request', n.type = 'graph_definition', n.graph_id = 'INEED-G2-HR-ACCESS-V1', n.path = 'api/src/services/graph-definitions/ineed-graph-2-access.js', n.nodes = 13, n.edges = 13, n.created_at = datetime();
MERGE (n:CoreComponent {id: 'CORE-GRAPH-G3-WORKSPACE'}) SET n.name = 'G3: Facilities Workspace Request', n.type = 'graph_definition', n.graph_id = 'INEED-G3-FACILITIES-WORKSPACE-V1', n.path = 'api/src/services/graph-definitions/ineed-graph-3-workspace.js', n.nodes = 12, n.edges = 11, n.created_at = datetime();

// ─── Edges: Plugin relationships ───
MATCH (a:CoreComponent {id: 'CORE-PLUGIN-COMMON-JS'}), (b:CoreComponent {id: 'CORE-AOPEG-ADAPTER'}) MERGE (a)-[:USES]->(b);
MATCH (a:CoreComponent {id: 'CORE-PLUGIN-WORKFLOW-JS'}), (b:CoreComponent {id: 'CORE-AOPEG-ADAPTER'}) MERGE (a)-[:USES]->(b);
MATCH (a:CoreComponent {id: 'CORE-PLUGIN-NOTIFICATION-JS'}), (b:CoreComponent {id: 'CORE-AOPEG-ADAPTER'}) MERGE (a)-[:USES]->(b);
MATCH (a:CoreComponent {id: 'CORE-PLUGIN-SUBGRAPH-JS'}), (b:CoreComponent {id: 'CORE-AOPEG-ADAPTER'}) MERGE (a)-[:USES]->(b);

// ─── Edges: Fixes target AOPEGAdapter ───
MATCH (a:CoreComponent {id: 'CORE-FIX-AOPEG-WAIT-PASSTHROUGH'}), (b:CoreComponent {id: 'CORE-AOPEG-ADAPTER'}) MERGE (a)-[:FIXES]->(b);
MATCH (a:CoreComponent {id: 'CORE-FIX-AOPEG-ARRAY-FLATTEN'}), (b:CoreComponent {id: 'CORE-AOPEG-ADAPTER'}) MERGE (a)-[:FIXES]->(b);

// ─── Edges: Tests verify components ───
MATCH (a:CoreComponent {id: 'CORE-TEST-INTEGRATION-CHECK'}), (b:CoreComponent {id: 'CORE-RUNTIME-ENGINE'}) MERGE (a)-[:VERIFIES]->(b);
MATCH (a:CoreComponent {id: 'CORE-TEST-SMOKE-TR04'}), (b:CoreComponent {id: 'CORE-RUNTIME-ENGINE'}) MERGE (a)-[:VERIFIES]->(b);
MATCH (a:CoreComponent {id: 'CORE-TEST-META-E2E'}), (b:CoreComponent {id: 'CORE-RUNTIME-ENGINE'}) MERGE (a)-[:VERIFIES]->(b);
MATCH (a:CoreComponent {id: 'CORE-TEST-META-E2E'}), (b:CoreComponent {id: 'CORE-GRAPH-G0-META'}) MERGE (a)-[:VERIFIES]->(b);

// ─── Edges: Graphs use plugins ───
MATCH (a:CoreComponent {id: 'CORE-GRAPH-G0-META'}), (b:CoreComponent {id: 'CORE-PLUGIN-COMMON-JS'}) MERGE (a)-[:USES]->(b);
MATCH (a:CoreComponent {id: 'CORE-GRAPH-G0-META'}), (b:CoreComponent {id: 'CORE-PLUGIN-WORKFLOW-JS'}) MERGE (a)-[:USES]->(b);
MATCH (a:CoreComponent {id: 'CORE-GRAPH-G0-META'}), (b:CoreComponent {id: 'CORE-PLUGIN-NOTIFICATION-JS'}) MERGE (a)-[:USES]->(b);
MATCH (a:CoreComponent {id: 'CORE-GRAPH-G1-HARDWARE'}), (b:CoreComponent {id: 'CORE-PLUGIN-COMMON-JS'}) MERGE (a)-[:USES]->(b);
MATCH (a:CoreComponent {id: 'CORE-GRAPH-G1-HARDWARE'}), (b:CoreComponent {id: 'CORE-PLUGIN-WORKFLOW-JS'}) MERGE (a)-[:USES]->(b);

// ─── Final count ───
MATCH (n:CoreComponent) RETURN count(n) AS total_components;
