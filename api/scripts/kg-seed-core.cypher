// ═══════════════════════════════════════════════════════════════════
// CORE Namespace: Project Components for iNeed GXE Test Scenario
// ═══════════════════════════════════════════════════════════════════

// --- Plugins ---

MERGE (wp:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW'})
SET wp.name = 'WorkflowPlugin',
    wp.file = 'api/src/core/aopeg/plugins/workflow/workflow.plugin.ts',
    wp.type = 'Plugin',
    wp.namespace = 'CORE',
    wp.description = 'Workflow control executors: pause, wait, validate, spawn',
    wp.executor_count = 5,
    wp.created_at = datetime();

MERGE (np:CoreComponent {component_id: 'CORE-PLUGIN-NOTIFICATION'})
SET np.name = 'NotificationPlugin',
    np.file = 'api/src/core/aopeg/plugins/notification/notification.plugin.ts',
    np.type = 'Plugin',
    np.namespace = 'CORE',
    np.description = 'Notification executor: email, activity feed, SMS',
    np.executor_count = 1,
    np.created_at = datetime();

// --- Executors (Workflow) ---

MERGE (e1:CoreComponent {component_id: 'CORE-EXECUTOR-WAIT-INPUT'})
SET e1.name = 'WaitInputExecutor',
    e1.file = 'api/src/core/aopeg/plugins/workflow/executors/wait-input.executor.ts',
    e1.type = 'Executor',
    e1.namespace = 'CORE',
    e1.tool_name = 'workflow.wait_input',
    e1.description = 'Pauses graph execution waiting for human input',
    e1.created_at = datetime();

MERGE (e2:CoreComponent {component_id: 'CORE-EXECUTOR-SET-VARIABLE'})
SET e2.name = 'SetVariableExecutor',
    e2.file = 'api/src/core/aopeg/plugins/workflow/executors/set-variable.executor.ts',
    e2.type = 'Executor',
    e2.namespace = 'CORE',
    e2.tool_name = 'workflow.set_variable',
    e2.description = 'Sets variables in execution context',
    e2.created_at = datetime();

MERGE (e3:CoreComponent {component_id: 'CORE-EXECUTOR-VALIDATE'})
SET e3.name = 'ValidateExecutor',
    e3.file = 'api/src/core/aopeg/plugins/workflow/executors/validate.executor.ts',
    e3.type = 'Executor',
    e3.namespace = 'CORE',
    e3.tool_name = 'workflow.validate',
    e3.description = 'Validates user permissions: contract, clearance, quota, budget',
    e3.created_at = datetime();

MERGE (e4:CoreComponent {component_id: 'CORE-EXECUTOR-SPAWN-GRAPH'})
SET e4.name = 'SpawnGraphExecutor',
    e4.file = 'api/src/core/aopeg/plugins/workflow/executors/spawn-graph.executor.ts',
    e4.type = 'Executor',
    e4.namespace = 'CORE',
    e4.tool_name = 'workflow.spawn_graph',
    e4.description = 'Spawns child graph execution sync or async',
    e4.created_at = datetime();

MERGE (e5:CoreComponent {component_id: 'CORE-EXECUTOR-QUERY-PROFILE'})
SET e5.name = 'QueryProfileExecutor',
    e5.file = 'api/src/core/aopeg/plugins/workflow/executors/query-profile.executor.ts',
    e5.type = 'Executor',
    e5.namespace = 'CORE',
    e5.tool_name = 'graph.query_profile',
    e5.description = 'Queries UNStaffProfile from Memgraph',
    e5.created_at = datetime();

// --- Executor (Notification) ---

MERGE (e6:CoreComponent {component_id: 'CORE-EXECUTOR-SEND-NOTIFICATION'})
SET e6.name = 'SendNotificationExecutor',
    e6.file = 'api/src/core/aopeg/plugins/notification/executors/send.executor.ts',
    e6.type = 'Executor',
    e6.namespace = 'CORE',
    e6.tool_name = 'notification.send',
    e6.description = 'Sends notifications via email, activity feed, SMS',
    e6.created_at = datetime();

// --- Runtime Components ---

MERGE (sm:CoreComponent {component_id: 'CORE-RUNTIME-STATE-MACHINE'})
SET sm.name = 'NodeStateMachine (extended)',
    sm.file = 'api/src/runtime/state/NodeStateMachine.js',
    sm.type = 'Runtime',
    sm.namespace = 'CORE',
    sm.description = 'Added WAITING_INPUT state with transitions',
    sm.created_at = datetime();

MERGE (cp:CoreComponent {component_id: 'CORE-RUNTIME-CHECKPOINT'})
SET cp.name = 'CheckpointManager',
    cp.file = 'api/src/runtime/resilience/CheckpointManager.js',
    cp.type = 'Runtime',
    cp.namespace = 'CORE',
    cp.description = 'Redis-based wait context and execution state persistence',
    cp.created_at = datetime();

MERGE (sc:CoreComponent {component_id: 'CORE-RUNTIME-SCHEDULER'})
SET sc.name = 'TopologicalScheduler (extended)',
    sc.file = 'api/src/runtime/scheduler/TopologicalScheduler.js',
    sc.type = 'Runtime',
    sc.namespace = 'CORE',
    sc.description = 'Added WAIT_FOR_INPUT handling, resumeNode, pauseExecution',
    sc.created_at = datetime();

MERGE (re:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
SET re.name = 'RuntimeEngine (extended)',
    re.file = 'api/src/runtime/RuntimeEngine.js',
    re.type = 'Runtime',
    re.namespace = 'CORE',
    re.description = 'Added WAITING_FOR_INPUT handling and resumeExecution',
    re.created_at = datetime();

// --- Data Layer ---

MERGE (ds:CoreComponent {component_id: 'CORE-DATA-SCHEMA-INEED'})
SET ds.name = 'iNeed Memgraph Schema',
    ds.file = 'api/src/services/memgraph/schemas/ineed-schema.cypher',
    ds.type = 'Schema',
    ds.namespace = 'CORE',
    ds.description = 'Indexes for 10 node types',
    ds.created_at = datetime();

MERGE (sl:CoreComponent {component_id: 'CORE-DATA-SCHEMA-LOADER'})
SET sl.name = 'SchemaLoaderService',
    sl.file = 'api/src/services/memgraph/schema-loader.service.js',
    sl.type = 'Service',
    sl.namespace = 'CORE',
    sl.description = 'Loads .cypher schema files into Memgraph',
    sl.created_at = datetime();

MERGE (sd:CoreComponent {component_id: 'CORE-DATA-SEEDER-INEED'})
SET sd.name = 'INeedTestDataSeeder',
    sd.file = 'api/src/services/memgraph/seeds/ineed-test-data.js',
    sd.type = 'Service',
    sd.namespace = 'CORE',
    sd.description = 'Seeds 8 profiles, 10 groups, 8 equipment, 7 workspaces, 3 graphs',
    sd.created_at = datetime();

MERGE (qd:CoreComponent {component_id: 'CORE-DATA-QDRANT-INEED'})
SET qd.name = 'INeedQdrantCollections',
    qd.file = 'api/src/services/qdrant/ineed-collections.js',
    qd.type = 'Service',
    qd.namespace = 'CORE',
    qd.description = '3 Qdrant collections: graphs, inventory, SR history',
    qd.created_at = datetime();

MERGE (gl:CoreComponent {component_id: 'CORE-SERVICE-GRAPH-LOADER'})
SET gl.name = 'GraphLoaderService',
    gl.file = 'api/src/services/graph-definitions/graph-loader.service.js',
    gl.type = 'Service',
    gl.namespace = 'CORE',
    gl.description = 'Loads 4 iNeed DAGs into PatternLibrary and Memgraph',
    gl.created_at = datetime();

// --- API Endpoints ---

MERGE (ar:CoreComponent {component_id: 'CORE-API-RESUME'})
SET ar.name = 'Resume Execution Endpoint',
    ar.file = 'api/src/routes/runtime.route.js',
    ar.type = 'APIEndpoint',
    ar.namespace = 'CORE',
    ar.description = 'POST /execute/:executionId/resume-input',
    ar.created_at = datetime();

MERGE (ai:CoreComponent {component_id: 'CORE-API-INEED-TEST'})
SET ai.name = 'iNeed Test Endpoints',
    ai.file = 'api/src/routes/ineed-test.route.js',
    ai.type = 'APIEndpoint',
    ai.namespace = 'CORE',
    ai.description = 'POST /submit, GET /graphs, GET /test-users, POST /load-graphs',
    ai.created_at = datetime();

// --- Test Suites ---

MERGE (te:CoreComponent {component_id: 'CORE-TEST-E2E-RUNNER'})
SET te.name = 'INeedE2ETestRunner',
    te.file = 'api/tests/e2e/test-ineed-e2e.js',
    te.type = 'TestSuite',
    te.namespace = 'CORE',
    te.description = 'E2E test runner with 4 test cases and auto resume',
    te.created_at = datetime();

MERGE (tv:CoreComponent {component_id: 'CORE-TEST-QUICK-VERIFY'})
SET tv.name = 'Quick Graph Verifier',
    tv.file = 'api/scripts/test-ineed-quick.js',
    tv.type = 'TestSuite',
    tv.namespace = 'CORE',
    tv.description = '9-point structural validation for graph definitions',
    tv.created_at = datetime();

MERGE (ts:CoreComponent {component_id: 'CORE-SCRIPT-SEED-INEED'})
SET ts.name = 'Seed iNeed Command',
    ts.file = 'api/scripts/seed-ineed.js',
    ts.type = 'Script',
    ts.namespace = 'CORE',
    ts.description = 'CLI: node api/scripts/seed-ineed.js [--clear] [--schema-only]',
    ts.created_at = datetime();

// ═══════════════════════════════════════════════════════════════════
// EDGES: Plugin → Executor
// ═══════════════════════════════════════════════════════════════════

MATCH (wp:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW'})
MATCH (e1:CoreComponent {component_id: 'CORE-EXECUTOR-WAIT-INPUT'})
MERGE (wp)-[:CONTAINS]->(e1);

MATCH (wp:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW'})
MATCH (e2:CoreComponent {component_id: 'CORE-EXECUTOR-SET-VARIABLE'})
MERGE (wp)-[:CONTAINS]->(e2);

MATCH (wp:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW'})
MATCH (e3:CoreComponent {component_id: 'CORE-EXECUTOR-VALIDATE'})
MERGE (wp)-[:CONTAINS]->(e3);

MATCH (wp:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW'})
MATCH (e4:CoreComponent {component_id: 'CORE-EXECUTOR-SPAWN-GRAPH'})
MERGE (wp)-[:CONTAINS]->(e4);

MATCH (wp:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW'})
MATCH (e5:CoreComponent {component_id: 'CORE-EXECUTOR-QUERY-PROFILE'})
MERGE (wp)-[:CONTAINS]->(e5);

MATCH (np:CoreComponent {component_id: 'CORE-PLUGIN-NOTIFICATION'})
MATCH (e6:CoreComponent {component_id: 'CORE-EXECUTOR-SEND-NOTIFICATION'})
MERGE (np)-[:CONTAINS]->(e6);

// ═══════════════════════════════════════════════════════════════════
// EDGES: Runtime Dependencies
// ═══════════════════════════════════════════════════════════════════

MATCH (re:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MATCH (sm:CoreComponent {component_id: 'CORE-RUNTIME-STATE-MACHINE'})
MERGE (re)-[:DEPENDS_ON]->(sm);

MATCH (re:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MATCH (sc:CoreComponent {component_id: 'CORE-RUNTIME-SCHEDULER'})
MERGE (re)-[:DEPENDS_ON]->(sc);

MATCH (sc:CoreComponent {component_id: 'CORE-RUNTIME-SCHEDULER'})
MATCH (cp:CoreComponent {component_id: 'CORE-RUNTIME-CHECKPOINT'})
MERGE (sc)-[:DEPENDS_ON]->(cp);

MATCH (re:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MATCH (wp:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW'})
MERGE (re)-[:USES]->(wp);

MATCH (re:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MATCH (np:CoreComponent {component_id: 'CORE-PLUGIN-NOTIFICATION'})
MERGE (re)-[:USES]->(np);

// ═══════════════════════════════════════════════════════════════════
// EDGES: Test Dependencies
// ═══════════════════════════════════════════════════════════════════

MATCH (te:CoreComponent {component_id: 'CORE-TEST-E2E-RUNNER'})
MATCH (gl:CoreComponent {component_id: 'CORE-SERVICE-GRAPH-LOADER'})
MERGE (te)-[:USES]->(gl);

MATCH (te:CoreComponent {component_id: 'CORE-TEST-E2E-RUNNER'})
MATCH (re:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MERGE (te)-[:USES]->(re);

MATCH (ai:CoreComponent {component_id: 'CORE-API-INEED-TEST'})
MATCH (re:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MERGE (ai)-[:TRIGGERS]->(re);

MATCH (ai:CoreComponent {component_id: 'CORE-API-INEED-TEST'})
MATCH (gl:CoreComponent {component_id: 'CORE-SERVICE-GRAPH-LOADER'})
MERGE (ai)-[:USES]->(gl);

MATCH (ar:CoreComponent {component_id: 'CORE-API-RESUME'})
MATCH (re:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MERGE (ar)-[:TRIGGERS]->(re);

// ═══════════════════════════════════════════════════════════════════
// EDGES: Data Layer Dependencies
// ═══════════════════════════════════════════════════════════════════

MATCH (gl:CoreComponent {component_id: 'CORE-SERVICE-GRAPH-LOADER'})
MATCH (sd:CoreComponent {component_id: 'CORE-DATA-SEEDER-INEED'})
MERGE (gl)-[:DEPENDS_ON]->(sd);

MATCH (ts:CoreComponent {component_id: 'CORE-SCRIPT-SEED-INEED'})
MATCH (sl:CoreComponent {component_id: 'CORE-DATA-SCHEMA-LOADER'})
MERGE (ts)-[:USES]->(sl);

MATCH (ts:CoreComponent {component_id: 'CORE-SCRIPT-SEED-INEED'})
MATCH (sd:CoreComponent {component_id: 'CORE-DATA-SEEDER-INEED'})
MERGE (ts)-[:USES]->(sd);

MATCH (ts:CoreComponent {component_id: 'CORE-SCRIPT-SEED-INEED'})
MATCH (qd:CoreComponent {component_id: 'CORE-DATA-QDRANT-INEED'})
MERGE (ts)-[:USES]->(qd);
