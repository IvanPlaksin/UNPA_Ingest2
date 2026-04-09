// Priority 9 — Full META-GRAPH E2E + Bug Fixes

// Bug fix: Back-edge detection
MERGE (c:CoreComponent {component_id: 'CORE-FIX-SCHEDULER-BACKEDGE'}) SET c.name = 'TopologicalScheduler Back-Edge Detection', c.file = 'api/src/runtime/scheduler/TopologicalScheduler.js', c.type = 'BugFix', c.issue = 'Retry loop edge G0-N06→G0-N03 caused in-degree=2 blocking execution', c.solution = 'DFS cycle detection excludes back-edges from initial in-degree', c.method = '_detectBackEdges()', c.namespace = 'CORE', c.fixed_at = datetime();

// Bug fix: Double-flattening
MERGE (c:CoreComponent {component_id: 'CORE-FIX-AOPEG-DOUBLE-FLATTEN'}) SET c.name = 'AOPEGAdapter MCP Wrapper Double-Flatten Fix', c.file = 'api/src/runtime/integration/AOPEGAdapter.js', c.type = 'BugFix', c.issue = 'Second flattening pass destroyed object parameters like mock_response', c.solution = 'Removed multi-key flattening, only unwrap single-port wrappers', c.namespace = 'CORE', c.fixed_at = datetime();

// Test suite
MERGE (c:CoreComponent {component_id: 'CORE-TEST-FULL-META'}) SET c.name = 'Full META-GRAPH E2E Test', c.file = 'api/scripts/test-full-meta.js', c.type = 'TestSuite', c.checks = 32, c.scenario = 'TR-04 Urgent Monitor via G0 META-GRAPH', c.nodes_tested = 16, c.branches_tested = 3, c.namespace = 'CORE', c.created_at = datetime();

// Update spawn_graph
MERGE (c:CoreComponent {component_id: 'CORE-EXECUTOR-SPAWN-GRAPH'}) SET c.dag_sources = ['GraphLoaderService', 'PatternLibrary', 'Memgraph'], c.supports_reactflow_conversion = true, c.updated_at = datetime();

// Update vector.search with mock support
MERGE (c:CoreComponent {component_id: 'CORE-EXECUTOR-VECTOR-SEARCH'}) SET c.name = 'Vector Search Executor', c.file = 'api/src/core/aopeg/plugins/common/executors/vector-search.executor.js', c.type = 'Executor', c.executor_type = 'vector.search', c.supports_mock = true, c.namespace = 'CORE', c.updated_at = datetime();

// Relationships
MATCH (fix:CoreComponent {component_id: 'CORE-FIX-SCHEDULER-BACKEDGE'}) MATCH (sched:CoreComponent {component_id: 'CORE-RUNTIME-SCHEDULER'}) MERGE (fix)-[:FIXES]->(sched);
MATCH (fix:CoreComponent {component_id: 'CORE-FIX-AOPEG-DOUBLE-FLATTEN'}) MATCH (adapter:CoreComponent {component_id: 'CORE-AOPEG-ADAPTER'}) MERGE (fix)-[:FIXES]->(adapter);
MATCH (test:CoreComponent {component_id: 'CORE-TEST-FULL-META'}) MATCH (g0:YNBusinessGraph {graph_id: 'INEED-G0-META-INTAKE-V1'}) MERGE (test)-[:TESTS]->(g0);
MATCH (test:CoreComponent {component_id: 'CORE-TEST-FULL-META'}) MATCH (sched:CoreComponent {component_id: 'CORE-RUNTIME-SCHEDULER'}) MERGE (test)-[:VERIFIES]->(sched);
MATCH (test:CoreComponent {component_id: 'CORE-TEST-FULL-META'}) MATCH (adapter:CoreComponent {component_id: 'CORE-AOPEG-ADAPTER'}) MERGE (test)-[:VERIFIES]->(adapter);
MATCH (test:CoreComponent {component_id: 'CORE-TEST-FULL-META'}) MATCH (ec:CoreComponent {component_id: 'CORE-EXECUTION-CONTEXT'}) MERGE (test)-[:VERIFIES]->(ec);
MATCH (test:CoreComponent {component_id: 'CORE-TEST-FULL-META'}) MATCH (tr:CoreComponent {component_id: 'CORE-TEMPLATE-RESOLVER'}) MERGE (test)-[:VERIFIES]->(tr);
MATCH (spawn:CoreComponent {component_id: 'CORE-EXECUTOR-SPAWN-GRAPH'}) MATCH (loader:CoreComponent) WHERE loader.name CONTAINS 'GraphLoader' MERGE (spawn)-[:USED_BY]->(loader);
