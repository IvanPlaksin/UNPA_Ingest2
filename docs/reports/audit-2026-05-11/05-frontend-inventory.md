# Frontend Inventory
## Audit Date: 2026-05-11

> React + Vite SPA at `mcp/`. Uses MUI v5, ReactFlow, Zustand stores, custom SSE hooks.

---

## 1. Application Entry Points

| File | Purpose |
|---|---|
| `mcp/src/main.jsx` | Vite entry — ReactDOM.createRoot, wraps App |
| `mcp/src/App.jsx` | Router, theme provider, sidebar shell |
| `mcp/src/config/api.config.js` | API base URL config (`VITE_API_URL`) |

---

## 2. Pages / Routes (from App.jsx)

| Route | Component | Domain |
|---|---|---|
| `/` | DashboardPage | Dashboard |
| `/knowledge` | KnowledgePage | Knowledge |
| `/knowledge/rabbit-hole` | RabbitHolePage | Knowledge |
| `/knowledge/tfvc` | TfvcBrowserPage | ADO/TFVC |
| `/knowledge/graph` | KnowledgeGraphPage | Graph visualization |
| `/knowledge/planes` | KnowledgePlanesPage | Graph visualization |
| `/knowledge/crud` | GraphCRUDPage | Graph management |
| `/workitems` | WorkItemsListPage | ADO Work items |
| `/workitem/:id` | WorkItemPage | ADO Work items |
| `/nexus/workitem/:id` | WorkItemNexusPage | Nexus AI analysis |
| `/nexus/changeset/:id` | WorkItemNexusPage | Nexus AI analysis |
| `/nexus/file/*` | WorkItemNexusPage | Nexus AI analysis |
| `/nexus/:id` | WorkItemNexusPage | Nexus (legacy) |
| `/singularity/workitem/:id` | SingularityWrapper | 3D graph |
| `/agent` | AgentPage | AI Agent chat |
| `/pipeline-lab` | PipelineLabPage | Extraction pipeline |
| `/aopeg` | AOPEGEditorPage | AOPEG graph editor |
| `/aopeg/:graphId` | AOPEGEditorPage | AOPEG graph editor |
| `/gxe` | GXEVisualizerPage | GXE execution visualizer |
| `/gnn` | GNNDashboardPage | GNN dashboard |
| `/singularity` | SingularityPage | 3D knowledge explorer |
| `/experimental` | ExperimentalPage | Experimental features |
| `/tensor-dashboard` | TensorDashboardPage | Real-time performance |
| `/gxe-manager` | GxeManagerPage | GXE execution orchestrator |
| `/flowdesk` | FlowDeskPage | FlowDesk AI intake (client project) |
| `/flowdesk/config` | FlowDeskConfigPage | FlowDesk config (client project) |
| `/forms-demo` | StructuralFormDemoPage | Structural form demo |
| `/structural-editor` | StructuralEditorPage | Structural graph editor |
| `/unpa-chat-demo` | UnpaChatDemoPage | Chat demo |
| `/backlog` | BackLogPage | BackLog task management |
| `/codex` | CodexViewerPage | Codex governance rules |
| `/dialogue/*` | DialoguePage | DevDialogue Collector UI |
| `/workspaces` | WorkspacesPage | Workspace list |
| `/workspaces/:workspaceId` | WorkspaceDetailPage | Workspace detail |
| `/observability` | ObservabilityPage | Observability dashboard |

**Total routes: 34** (including parameterized variants).
**FlowDesk-specific routes: 2** (`/flowdesk`, `/flowdesk/config`) — namespace violation per CLAUDE.md.

---

## 3. Component Directories

| Directory | Contents / Purpose |
|---|---|
| `components/AOPEG/` | 8 TSX components — GraphEditor, AOPEGNode, AOPEGEdge, PropertiesPanel, ValidationPanel, ExecutionHistory, NodeCatalogSidebar, AIChatPanel, ModelSelector, GraphEditorToolbar, ExecutionOverlay, InputDataModal |
| `components/GXE/` | GXE visualizer — HexNode, HexEdge, HexGridBackground (TSX), MCPToolsPanel, ExecutionResultPanel, ModelSelector, FloatingWindow, DetailsWatcher, FloatingPromptEditor + utility JS hooks (portAssigner, collisionResolver, dragRepulsion, selectionSync, nodeHighlighting) |
| `components/GxeManager/` | Execution monitor — StatsBar, ExecutionList, Toolbar, DetailPanel, ControlBar + dialogs |
| `components/Nexus/` | Large subsystem — Ingestion, Inspector, Insights, GNN predictions, Session, Modes (GuidedMode / ExploreMode), Header, Similarity, Assistant, Keyboard shortcuts |
| `components/Workspace/` | Workspace CRUD + promotion flow |
| `components/Dialogue/` | Dialogue session viewer (SessionDetailDrawer, etc.) |
| `components/BackLog/` | BackLog task management UI (TaskDetailDialog, etc.) |
| `components/Codex/` | Codex viewer |
| `components/FlowDesk/` | FlowDesk-specific UI — waitingNodeToForm.js |
| `components/Forms/` | Structural form rendering system — fields, hooks (useFormState, useFormValidation, useDataSource, useStructuralForm, useDisplayConditions), utils (schemaDefaults, predicateEvaluator), tests |
| `components/KnowledgePlanes/` | Knowledge planes 3D view |
| `components/KnowledgeGraph/` | 2D knowledge graph viewer |
| `components/ImmutableGraph/` | ImmutableGraph UI — GodModeToggle, DeleteConfirmation, NodeVersionHistory |
| `components/Singularity/` | 3D graph explorer with ViewRegistry |
| `components/Tensor/` | Tensor timeline and graph |
| `components/GNN/` | GNN predictions control panel and overlay |
| `components/PipelineLab/` | Pipeline stages, knowledge reconstruction, E2E validator, TuningLab |
| `components/IncrementalKG/` | Incremental KG stepper and 3D graph |
| `components/EnhancedPipelineLab/` | Enhanced pipeline with 3D graph |
| `components/UnpaChat/` | UNPA Chat widget — sessionId utils, chatApi service, useUnpaChat hook |
| `components/Agent/` | AI agent chat interface |
| `components/Chat/` | Legacy chat window, message, chat input |
| `components/Layout/` | Sidebar, ServiceStatusWidget, AIUsageWidget |
| `components/Dashboard/` | Dashboard widgets |
| `components/Experimental/` | Experimental graph component |
| `components/StructuralEditor/` | Structural editor for STRUCTURAL graphs |
| `components/common/` | Shared utility components |

---

## 4. Zustand State Stores

| Store File | State Domain |
|---|---|
| `stores/catalogStore.js` | Graph catalog — catalog entries, selected graph |
| `stores/workspaceStore.js` | Workspace list, selected workspace, draft entities |
| `stores/nexusStore.js` | Nexus AI analysis state |
| `stores/gxeManagerStore.js` | GXE execution list, selected execution |
| `stores/importSqlStore.js` | SQL import wizard state |
| `stores/structuralEditorStore.js` | Structural graph editor state |
| `stores/dataSourceCatalogStore.js` | DataSource catalog |
| `stores/flowdeskConfigStore.js` | FlowDesk configuration (client-specific store in platform) |

**Total stores: 8.** Note: `flowdeskConfigStore.js` is a client-project-specific store located in the platform's `stores/` directory — namespace violation.

---

## 5. Custom Hooks

| Hook | Purpose |
|---|---|
| `useSSEStream.js` | SSE connection with ResilientSSEClient, reconnection logic |
| `useAOPEG.ts` | AOPEG editor state and execution |
| `useAILayout.ts` | AI-driven graph auto-layout (Claude API) |
| `useGXELayout.ts` | GXE hex-grid layout |
| `useHexLayout.ts` | Hex coordinate layout engine |
| `useImmutableGraph.ts` | ImmutableGraph CRUD operations |
| `useGraphBuilderAgent.ts` | Agent-driven graph construction |
| `useDialogue.js` | Dialogue session browsing and search |
| `useCodex.js` | Codex rule loading |
| `useKBHealth.js` | KB health metrics polling |
| `useMetacognition.js` | Metacognition status |
| `useValidation.js` | Graph validation |
| `useEmbeddingsStatus.js` | Qdrant embeddings status check |
| `useGraphSettings.js` | Graph display settings |
| `useDebounce.js` | Input debounce utility |
| `useKeyboardShortcuts.js` | Keyboard shortcut binding |
| `useTuningApi.js` | Pipeline tuning API calls |

---

## 6. Frontend Services (API Clients)

| Service File | API Domain |
|---|---|
| `services/api.js` | Base axios instance with `VITE_API_URL` |
| `services/workspace.service.js` | Workspace CRUD |
| `services/dialogue.service.js` | Dialogue sessions and search |
| `services/runtime.service.js` | GXE runtime execution |
| `services/gxe.service.js` | GXE graph operations |
| `services/gxeManager.service.js` | GXE Manager orchestration |
| `services/graphCatalog.service.js` | Graph catalog operations |
| `services/extraction.service.js` | Knowledge extraction |
| `services/incrementalKG.service.js` | Incremental KG pipeline |
| `services/knowledgeGraphService.js` | Knowledge graph queries |
| `services/nexus.service.js` | Nexus AI analysis |
| `services/subgraph.service.js` | Subgraph operations |
| `services/gnn.service.js` | GNN predictions |
| `services/importSql.service.js` | SQL import wizard |
| `services/anomalyTasks.service.js` | Anomaly task management |
| `services/immutableGraph.service.ts` | ImmutableGraph TypeScript client |

---

## 7. Technology Stack

- **Framework:** React 18 + Vite
- **UI Library:** MUI v5 with dark theme (Slate-900 background)
- **State:** Zustand (8 stores)
- **Routing:** React Router v6
- **Graph Visualization:** ReactFlow (AOPEG editor, GXE visualizer)
- **3D Visualization:** Custom hex-grid engine + Singularity 3D explorer
- **TypeScript:** Partial — 18 TSX/TS files in `components/AOPEG/` and GXE hex components + some hooks. Majority is JSX/JS.
- **CSS:** MUI CssBaseline + Tailwind CSS (dark class managed via useEffect)
- **SSE Client:** Custom `ResilientSSEClient` in `utils/sse-client.js` with reconnection
- **Chat:** ChatContext (React Context, not Zustand) for legacy chat

---

## 8. Testing

| Test File | Scope |
|---|---|
| `components/Forms/__tests__/predicateEvaluator.test.js` | Form predicate evaluation |
| `hooks/__tests__/useSSEStream.test.js` | SSE hook |
| `hooks/__tests__/useDebounce.test.js` | Debounce hook |
| `utils/__tests__/cache.test.js` | Cache utility |
| `utils/__tests__/sse-client.test.js` | SSE client |

**Total frontend test files: 5** — very limited coverage. No page-level or component integration tests found.

---

## 9. Notable Observations

1. **FlowDesk in platform UI**: `/flowdesk` and `/flowdesk/config` routes, `FlowDeskPage`, `FlowDeskConfigPage`, `flowdeskConfigStore.js`, and `components/FlowDesk/` all exist in the platform frontend — violates the namespace separation principle.

2. **Mixed TypeScript**: AOPEG components are TSX, GXE hex components are TSX, some hooks are TS. The rest is JSX/JS. No shared `tsconfig.json` discipline visible.

3. **DialoguePage uses nested routes**: `Route path="/dialogue/*"` with sub-navigation (likely tabs for Sessions/Timeline/Decisions).

4. **No global auth guard**: No `<PrivateRoute>` or `<AuthGuard>` component in App.jsx. Routes are not protected. The API uses `x-api-key` header auth but the frontend has no login flow.

5. **ChatContext is separate from Zustand**: The legacy `ChatContext.jsx` uses React Context (not Zustand) for the old chat interface. Newer features use dedicated hooks/services.

6. **UnpaChat is a separate widget**: `components/UnpaChat/` is a self-contained chat component with its own `useUnpaChat` hook and `chatApi` service — positioned as an embeddable chat widget distinct from the full AgentPage.
