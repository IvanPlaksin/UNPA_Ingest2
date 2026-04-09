// Priority 6-7-8 KG Seed — CoreComponent nodes and relationships
// Run with: node api/scripts/seed-priority8.js

// ── Priority 6: Common Plugin + Integration Fixes ──────────────────────
MERGE (n:CoreComponent {name: 'CORE-PLUGIN-COMMON-JS'}) SET n.type='plugin', n.description='Common AOPEG plugin: 7 executors (start, end, condition, ai.generate, vector.search, graph.create_node, graph.query)', n.files='api/src/core/aopeg/plugins/common/', n.priority=6, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-FIX-AOPEG-WAIT-PASSTHROUGH'}) SET n.type='bugfix', n.description='AOPEGAdapter passes WAIT_FOR_INPUT status through without wrapping as error', n.file='api/src/runtime/integration/AOPEGAdapter.js', n.priority=6, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-FIX-AOPEG-ARRAY-FLATTEN'}) SET n.type='bugfix', n.description='AOPEGAdapter correctly flattens multi-port input without spreading arrays', n.file='api/src/runtime/integration/AOPEGAdapter.js', n.priority=6, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-TEST-INTEGRATION-CHECK'}) SET n.type='test', n.description='32-check integration test verifying all executor registrations and schemas', n.file='api/tests/e2e/test-ineed-e2e.js', n.priority=6, n.created='2026-02-27'

// ── Priority 7: META-GRAPH E2E + LLM Mock ─────────────────────────────
MERGE (n:CoreComponent {name: 'CORE-TEST-SMOKE-TR04'}) SET n.type='test', n.description='13-check smoke test for TR-04 urgent monitor pipeline with mock LLM', n.file='api/tests/e2e/test-ineed-e2e.js', n.priority=7, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-TEST-META-E2E'}) SET n.type='test', n.description='68-check META-GRAPH E2E: 5 phases (structure, registry, mock-happy, service-dep, DAG conversion)', n.file='api/scripts/test-meta-e2e.js', n.priority=7, n.created='2026-02-27'

// ── Priority 8: Conditional Branching + Template Resolution ────────────
MERGE (n:CoreComponent {name: 'CORE-RUNTIME-TEMPLATE-RESOLVER'}) SET n.type='service', n.description='Resolves {{path}} templates: input.*, nodeOutputs[id].*, variables, built-ins ($now/$uuid)', n.file='api/src/runtime/execution/TemplateResolver.js', n.priority=8, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-RUNTIME-EXECUTION-CONTEXT'}) SET n.type='service', n.description='Cross-node output storage: dual-keyed (G0-N02/G0_N02), variables, expression/template contexts', n.file='api/src/runtime/execution/ExecutionContext.js', n.priority=8, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-FIX-SCHEDULER-CONDITIONAL-BRANCH'}) SET n.type='feature', n.description='Conditional branching in _onNodeCompleted: branch matching, recursive skip, synonym tables', n.file='api/src/runtime/scheduler/TopologicalScheduler.js', n.priority=8, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-FIX-NODE-STATE-SKIP-BRANCH'}) SET n.type='bugfix', n.description='Added PENDING->SKIPPED transition (skip_branch trigger) in NodeStateMachine FSM', n.file='api/src/runtime/state/NodeStateMachine.js', n.priority=8, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-FIX-AOPEG-CONTEXT-PASSTHROUGH'}) SET n.type='bugfix', n.description='AOPEGAdapter._buildAOPEGContext passes executionContext and globalVariables to executor context', n.file='api/src/runtime/integration/AOPEGAdapter.js', n.priority=8, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-FIX-CONDITION-EXEC-CONTEXT'}) SET n.type='bugfix', n.description='condition.executor uses ExecutionContext.getExpressionContext() as sandbox for vm evaluation', n.file='api/src/core/aopeg/plugins/common/executors/condition.executor.js', n.priority=8, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-FIX-SET-VAR-EXEC-CONTEXT'}) SET n.type='bugfix', n.description='set_variable.executor stores variables in ExecutionContext in addition to legacy globalVariables', n.file='api/src/core/aopeg/plugins/workflow/executors/set-variable.executor.js', n.priority=8, n.created='2026-02-27'
MERGE (n:CoreComponent {name: 'CORE-TEST-CONDITIONAL'}) SET n.type='test', n.description='30-check conditional branching + template resolution test: 5 tests (unit, true/false, template, cross-node, recursive)', n.file='api/scripts/test-conditional.js', n.priority=8, n.created='2026-02-27'

// ── Relationships ──────────────────────────────────────────────────────
MATCH (a:CoreComponent {name: 'CORE-RUNTIME-TEMPLATE-RESOLVER'}), (b:CoreComponent {name: 'CORE-RUNTIME-NODE-RUNNER'}) MERGE (a)-[:USED_BY]->(b)
MATCH (a:CoreComponent {name: 'CORE-RUNTIME-EXECUTION-CONTEXT'}), (b:CoreComponent {name: 'CORE-RUNTIME-NODE-RUNNER'}) MERGE (a)-[:USED_BY]->(b)
MATCH (a:CoreComponent {name: 'CORE-RUNTIME-EXECUTION-CONTEXT'}), (b:CoreComponent {name: 'CORE-RUNTIME-TOPOLOGICAL-SCHEDULER'}) MERGE (a)-[:USED_BY]->(b)
MATCH (a:CoreComponent {name: 'CORE-RUNTIME-EXECUTION-CONTEXT'}), (b:CoreComponent {name: 'CORE-RUNTIME-TEMPLATE-RESOLVER'}) MERGE (a)-[:USED_BY]->(b)
MATCH (a:CoreComponent {name: 'CORE-RUNTIME-EXECUTION-CONTEXT'}), (b:CoreComponent {name: 'CORE-RUNTIME-ENGINE'}) MERGE (a)-[:USED_BY]->(b)
MATCH (a:CoreComponent {name: 'CORE-FIX-SCHEDULER-CONDITIONAL-BRANCH'}), (b:CoreComponent {name: 'CORE-RUNTIME-TOPOLOGICAL-SCHEDULER'}) MERGE (a)-[:FIXES]->(b)
MATCH (a:CoreComponent {name: 'CORE-FIX-NODE-STATE-SKIP-BRANCH'}), (b:CoreComponent {name: 'CORE-RUNTIME-NODE-STATE-MACHINE'}) MERGE (a)-[:FIXES]->(b)
MATCH (a:CoreComponent {name: 'CORE-FIX-AOPEG-CONTEXT-PASSTHROUGH'}), (b:CoreComponent {name: 'CORE-RUNTIME-AOPEG-ADAPTER'}) MERGE (a)-[:FIXES]->(b)
MATCH (a:CoreComponent {name: 'CORE-FIX-CONDITION-EXEC-CONTEXT'}), (b:CoreComponent {name: 'CORE-PLUGIN-COMMON-JS'}) MERGE (a)-[:FIXES]->(b)
MATCH (a:CoreComponent {name: 'CORE-FIX-SET-VAR-EXEC-CONTEXT'}), (b:CoreComponent {name: 'CORE-PLUGIN-WORKFLOW'}) MERGE (a)-[:FIXES]->(b)
MATCH (a:CoreComponent {name: 'CORE-TEST-CONDITIONAL'}), (b:CoreComponent {name: 'CORE-FIX-SCHEDULER-CONDITIONAL-BRANCH'}) MERGE (a)-[:VERIFIES]->(b)
MATCH (a:CoreComponent {name: 'CORE-TEST-CONDITIONAL'}), (b:CoreComponent {name: 'CORE-RUNTIME-TEMPLATE-RESOLVER'}) MERGE (a)-[:VERIFIES]->(b)
MATCH (a:CoreComponent {name: 'CORE-TEST-CONDITIONAL'}), (b:CoreComponent {name: 'CORE-RUNTIME-EXECUTION-CONTEXT'}) MERGE (a)-[:VERIFIES]->(b)
MATCH (a:CoreComponent {name: 'CORE-TEST-META-E2E'}), (b:CoreComponent {name: 'CORE-PLUGIN-COMMON-JS'}) MERGE (a)-[:VERIFIES]->(b)
MATCH (a:CoreComponent {name: 'CORE-FIX-AOPEG-WAIT-PASSTHROUGH'}), (b:CoreComponent {name: 'CORE-RUNTIME-AOPEG-ADAPTER'}) MERGE (a)-[:FIXES]->(b)
MATCH (a:CoreComponent {name: 'CORE-FIX-AOPEG-ARRAY-FLATTEN'}), (b:CoreComponent {name: 'CORE-RUNTIME-AOPEG-ADAPTER'}) MERGE (a)-[:FIXES]->(b)
// Count all CORE namespace nodes
MATCH (n:CoreComponent) RETURN count(n) AS total_core_components
