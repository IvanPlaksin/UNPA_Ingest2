// ═══════════════════════════════════════════════════════════════════
// PRIORITY 6: Integration Check & Bug Fix Components
// Added 2026-02-27
// ═══════════════════════════════════════════════════════════════════

// JS Runtime Plugins (19 new files)
MERGE (c:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW-JS'})
SET c.name = 'WorkflowPlugin (JS Runtime)',
    c.type = 'Plugin',
    c.path = 'api/src/core/aopeg/plugins/workflow/',
    c.files = 'workflow.plugin.js, index.js, executors/index.js, wait-input.executor.js, set-variable.executor.js, validate.executor.js, spawn-graph.executor.js, query-profile.executor.js',
    c.executor_count = 5,
    c.reason = 'CommonJS compatibility for Node.js runtime - TS files not loadable',
    c.namespace = 'CORE',
    c.created_at = datetime();

MERGE (c:CoreComponent {component_id: 'CORE-PLUGIN-NOTIFICATION-JS'})
SET c.name = 'NotificationPlugin (JS Runtime)',
    c.type = 'Plugin',
    c.path = 'api/src/core/aopeg/plugins/notification/',
    c.files = 'notification.plugin.js, index.js, executors/index.js, send.executor.js',
    c.executor_count = 1,
    c.reason = 'CommonJS compatibility for Node.js runtime',
    c.namespace = 'CORE',
    c.created_at = datetime();

MERGE (c:CoreComponent {component_id: 'CORE-PLUGIN-SUBGRAPH-JS'})
SET c.name = 'SubgraphPlugin (JS Runtime)',
    c.type = 'Plugin',
    c.path = 'api/src/core/aopeg/plugins/subgraph/',
    c.files = 'subgraph.plugin.js, index.js, executors/index.js, segment-graph.executor.js, extract-subgraph.executor.js, consolidate-subgraph.executor.js',
    c.executor_count = 3,
    c.reason = 'CommonJS compatibility for Node.js runtime',
    c.namespace = 'CORE',
    c.created_at = datetime();

// Bug Fixes
MERGE (c:CoreComponent {component_id: 'CORE-FIX-AOPEG-ADAPTER-WAIT'})
SET c.name = 'AOPEGAdapter WAIT_FOR_INPUT Fix',
    c.file = 'api/src/runtime/integration/AOPEGAdapter.js',
    c.type = 'BugFix',
    c.issue = 'WAIT_FOR_INPUT status treated as error at line 174',
    c.solution = 'Added passthrough at both adapter layers before !result.success check',
    c.namespace = 'CORE',
    c.fixed_at = datetime();

MERGE (c:CoreComponent {component_id: 'CORE-FIX-AOPEG-ADAPTER-ARRAY'})
SET c.name = 'AOPEGAdapter Array Flattening Fix',
    c.file = 'api/src/runtime/integration/AOPEGAdapter.js',
    c.type = 'BugFix',
    c.issue = 'Object.assign destroyed array parameters like expected_inputs and recipients',
    c.solution = 'Added !Array.isArray() guard before Object.assign flattening',
    c.namespace = 'CORE',
    c.fixed_at = datetime();

MERGE (c:CoreComponent {component_id: 'CORE-FIX-PLUGIN-LOADER'})
SET c.name = 'PluginLoader Missing Plugins Fix',
    c.file = 'api/src/core/aopeg/plugins/plugin-loader.js',
    c.type = 'BugFix',
    c.issue = 'loadDomainPlugins only loaded ingestion and rag, missing subgraph/workflow/notification',
    c.solution = 'Added 3 new plugin imports to loadDomainPlugins()',
    c.namespace = 'CORE',
    c.fixed_at = datetime();

MERGE (c:CoreComponent {component_id: 'CORE-FIX-REQUIRE-PATHS'})
SET c.name = 'Executor Require Path Fix',
    c.type = 'BugFix',
    c.issue = 'All executor JS files used 4 ../ levels instead of 5 for services require',
    c.solution = 'Fixed require paths in 8 executor files across workflow/notification/subgraph',
    c.files_affected = 'query-profile, validate, spawn-graph, send, segment-graph, extract-subgraph, consolidate-subgraph',
    c.namespace = 'CORE',
    c.fixed_at = datetime();

// Test Scripts
MERGE (c:CoreComponent {component_id: 'CORE-TEST-INTEGRATION-CHECK'})
SET c.name = 'Integration Check Script',
    c.file = 'api/scripts/integration-check.js',
    c.type = 'TestScript',
    c.checks = 32,
    c.steps = 'services, data, runtime, graphs, execution, wait_input',
    c.namespace = 'CORE',
    c.created_at = datetime();

MERGE (c:CoreComponent {component_id: 'CORE-TEST-SMOKE-TR04'})
SET c.name = 'Smoke Test TR-04',
    c.file = 'api/scripts/smoke-tr04.js',
    c.type = 'TestScript',
    c.checks = 13,
    c.execution_time_ms = 329,
    c.scenario = 'Urgent monitor replacement - fastest path, no approval',
    c.namespace = 'CORE',
    c.created_at = datetime();

// ═══════════════════════════════════════════════════════════════════
// EDGES: Relationships
// ═══════════════════════════════════════════════════════════════════

// JS plugins depend on TS definitions
MATCH (js:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW-JS'})
MATCH (ts:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW'})
MERGE (js)-[:COMPILED_FROM]->(ts);

MATCH (js:CoreComponent {component_id: 'CORE-PLUGIN-NOTIFICATION-JS'})
MATCH (ts:CoreComponent {component_id: 'CORE-PLUGIN-NOTIFICATION'})
MERGE (js)-[:COMPILED_FROM]->(ts);

MATCH (js:CoreComponent {component_id: 'CORE-PLUGIN-SUBGRAPH-JS'})
MATCH (ts:CoreComponent {component_id: 'CORE-PLUGIN-SUBGRAPH'})
MERGE (js)-[:COMPILED_FROM]->(ts);

// Fixes apply to runtime adapter
MATCH (fix:CoreComponent {component_id: 'CORE-FIX-AOPEG-ADAPTER-WAIT'})
MATCH (adapter:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MERGE (fix)-[:FIXES]->(adapter);

MATCH (fix:CoreComponent {component_id: 'CORE-FIX-AOPEG-ADAPTER-ARRAY'})
MATCH (adapter:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MERGE (fix)-[:FIXES]->(adapter);

MATCH (fix:CoreComponent {component_id: 'CORE-FIX-PLUGIN-LOADER'})
MATCH (loader:CoreComponent {component_id: 'CORE-PLUGIN-LOADER'})
MERGE (fix)-[:FIXES]->(loader);

// Tests verify runtime
MATCH (t:CoreComponent {component_id: 'CORE-TEST-INTEGRATION-CHECK'})
MATCH (r:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MERGE (t)-[:VERIFIES]->(r);

MATCH (t:CoreComponent {component_id: 'CORE-TEST-SMOKE-TR04'})
MATCH (r:CoreComponent {component_id: 'CORE-RUNTIME-ENGINE'})
MERGE (t)-[:VERIFIES]->(r);

// Tests use plugins
MATCH (t:CoreComponent {component_id: 'CORE-TEST-SMOKE-TR04'})
MATCH (w:CoreComponent {component_id: 'CORE-PLUGIN-WORKFLOW-JS'})
MERGE (t)-[:USES]->(w);

MATCH (t:CoreComponent {component_id: 'CORE-TEST-SMOKE-TR04'})
MATCH (n:CoreComponent {component_id: 'CORE-PLUGIN-NOTIFICATION-JS'})
MERGE (t)-[:USES]->(n);
