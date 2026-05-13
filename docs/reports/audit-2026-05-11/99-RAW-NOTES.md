# Raw Notes — Miscellaneous Observations
## Audit Date: 2026-05-11

> Unstructured observations that don't fit neatly into other files. Source of additional context.

---

## Naming Inconsistencies Found

1. **`knowledge.route.js` vs `knowledge.routes.js`** — Two files for knowledge routes. `knowledge.route.js` (32 endpoints) is mounted; `knowledge.routes.js` (10 endpoints) is NOT mounted. The `.routes.js` pluralization convention is inconsistent across the codebase.

2. **`backlog-extended.route.js`** — 22 endpoints, NOT mounted in `index.js`. These endpoints may represent functionality that was built but never integrated. No comment in `index.js` explains the omission.

3. **`ineed-test.route.js`** — Contains iNeed test routes, not mounted. Should likely be removed or the test functionality moved to the test suite.

4. **Route naming conventions mixed:** `*.route.js` vs `*.routes.js` — both exist, no clear rule about which to use.

---

## Code Quality Observations

1. **Dialogue plugin index.js comment mismatch**: The `api/src/core/aopeg/plugins/dialogue/index.js` file contains the comment "EXECUTOR STUBS — real implementations added in Phase 1/2 tasks" yet the real implementations ARE loaded. This is confusing documentation.

2. **ProvenanceService vs ProvenenanceTypes**: `provenance.service.js` is 489 lines but stores everything in-memory. `provenance.types.js` defines `LIFECYCLE_STATES` used by `EntityResolver.js`. The architecture has the concept of provenance but the implementation is ephemeral.

3. **`flowdeskRoutes` in index.js without `flowdesk-config.route.js`**: `flowdesk.route.js` is mounted but `flowdesk-config.route.js` is not. This suggests the config route was intentionally separated but then left unmounted.

4. **Two different MCP patterns in same codebase**: (a) `api/src/mcp/tools/` — in-process GXE tools for AnthropicAgentService; (b) `api/src/gxe-manager/` + `createMcpCompatibleRegistry()` — MCP-compatible registry for RuntimeEngine. These serve different masters and the distinction is easy to confuse.

5. **`api/index.js:213-216`** — `_mg` is used as a short variable name for memgraphService then immediately passed to `initFormRoutes`. This is unusual naming in otherwise consistent code.

---

## Deployment Observations

1. **Port 3001** is the API. Port 3002 appears to be another service (possibly Vite dev server for the MCP frontend or a second API instance).

2. **Qdrant has 90 workspace collections** — suggests significant development/testing activity. In production, workspace cleanup policies should be enforced before deployment to avoid this accumulation.

3. **45 dialogue sessions with 27,556 messages** — The DevDialogue Collector is clearly being used actively. The system is ingesting real Claude Code sessions. The `dialogue_embeddings` collection (2,433 points) suggests embeddings are being generated for these sessions.

4. **Docker mode**: The codebase has Docker configuration. Azure Container Apps were deployed (per git history and Azure commands in allowlist). The current state is the Azure ACA deployment exists but the developer is running locally.

---

## Architecture Decision Evidence

1. **`Re-execution per Turn` pattern confirmed**: RuntimeEngine creates a new instance per `/execute` call. GxeManagerService keeps the execution registry in Redis (via TransactionCoordinator), not in-process. This means horizontal scaling of the API is possible — any instance can resume any execution by pulling state from Redis.

2. **The `Graph = Program` duality is genuinely implemented**: FlowDesk dialog graphs are `.json` files. iNeed graphs are `.js` definitions. Both use the same RuntimeEngine. GraphCatalog stores both. The same topological execution engine runs workflow logic AND knowledge extraction pipelines AND dialog flows.

3. **Type-gated execution is real**: `GraphClassificationService.canExecute()` is called before any execution. The 10-type system is enforced at the RuntimeEngine level, not just documented.

4. **Signal system vs WAIT_FOR_INPUT**: Two distinct pause mechanisms exist:
   - `WAIT_FOR_INPUT` — node type that pauses execution pending user input (POST `/resume-input`)
   - Signal system (`api/src/runtime/signals/`) — async signal resumption (POST `/signal/resume`)
   Both are real and both have tests.

---

## Test Infrastructure Observations

1. **`api/tests/integration/`** has 14 test files covering: workspace actions, workspace agent, workspace contradiction, workspace cross-source, workspace embedding similarity, sigillum, SSE client, health resilience, circuit breaker, security input validation, metrics logging, flowdesk integration (the only FlowDesk test file), catalog pattern matcher, catalog assistant.

2. **`api/tests/e2e/`** has: `pipeline-e2e.test.js`, `runtime-api.e2e.test.js`, `runtime-stress-test.js`, plus several debug scripts (`debug-simple-pipeline.js`).

3. **The `api/coverage/` directory** exists but `lcov.info` shows 0 lines hit for all TypeScript files. This indicates the TypeScript coverage collection is broken (likely because Jest doesn't invoke the TypeScript files through the normal require path that lcov tracks).

4. **Frontend tests: only 5 test files** — the frontend has minimal automated test coverage. No page-level integration tests, no visual regression tests.

---

## Security Observations

1. **`NODE_TLS_REJECT_UNAUTHORIZED = '0'`** at startup (api/index.js:6) — This disables certificate validation for ALL HTTPS connections from the process, not just ADO. This was added for on-premise ADO but is a global security risk.

2. **API key validation** is applied via `security.apiKeyValidator` middleware — all API endpoints require an API key in the `x-api-key` header. The key is configured via `envConfig.security.apiKey`. This is a single shared key, not per-user authentication.

3. **No frontend authentication**: The React SPA has no login flow, no token management, no protected routes. The security model relies entirely on the API key being set correctly in the frontend's environment configuration. In practice, anyone who can access the frontend URL can use the platform.

4. **Whitelist audit at startup**: `auditAllWhitelists()` is called during startup and logs a critical error if violations are found, but does NOT halt startup. The whitelist audit is advisory, not enforcing.

---

## FlowDesk Integration Analysis

The FlowDesk integration is more deeply embedded than typical "routes left in accidentally":

1. **AOPEG Plugin layer**: 17 dedicated executors (`ask-beneficiary`, `classify-intent`, `create-service-request`, `generate-form`, etc.) — domain-specific business logic
2. **Service layer**: `api/src/services/flowdesk/` with 20+ files including dialog service, form service, utterance generator, graph seeder
3. **Route layer**: `/api/v1/flowdesk` mounted (21 endpoints)
4. **Frontend layer**: FlowDeskPage, FlowDeskConfigPage, flowdeskConfigStore
5. **Data layer**: `flowdesk_services` Qdrant collection (1,704 points), `workspace_flowdesk` collection

This represents a significant portion of the platform's active feature set. Extracting FlowDesk into a proper external plugin/module would require architectural refactoring at all 5 layers.

---

## Positive Observations

1. **Graceful shutdown is properly implemented**: `createShutdownHandler` closes memgraph, redis, websocket, job queue, session cleanup, tensor service, query cache, dialogue watcher — all are properly cleaned up.

2. **First-request latency is documented and known**: GxeManagerService uses lazy initialization (`getManager()` pattern). First request initializes the entire AOPEG stack. This is a known trade-off documented in the codebase.

3. **SAGA compensation is properly implemented**: PromotionSagaService has LIFO rollback for each step type. This is not just documented — it's coded with explicit `compensate` functions.

4. **Graph validation with auto-fix**: RuntimeEngine validates graphs before execution and attempts auto-fix before failing. This is a thoughtful UX decision that prevents cryptic execution failures.

5. **Hash chain integrity in Codex**: SHA-256 hash chain for Codex governance rules means tampering with rules is detectable. This is a non-trivial integrity mechanism for a governance system.
