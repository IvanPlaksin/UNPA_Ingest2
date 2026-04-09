/**
 * META-GRAPH: GXE AI Assistant Graph Building Process
 *
 * Executable representation of the algorithm used by the GXE AI Assistant
 * to build AOPEG graphs. This is a "graph about graph-building" (meta-level).
 *
 * Format: ReactFlow-compatible DAG structure (same as ineed-graphs.js)
 * Namespace: META
 *
 * Architecture source files:
 *   - api/src/controllers/assistant.controller.js (entry point)
 *   - api/src/services/agents/anthropic-agent.service.js (LLM call)
 *   - api/src/services/agents/GraphActionParser.js (action parsing)
 *   - api/src/services/agents/SessionContextService.js (session)
 *   - api/src/services/agents/AgentBootstrapService.js (context)
 *   - api/src/services/graph/graph-validator.js (validation)
 */

// ====================================================================
// META-GRAPH: GXE AI Assistant — Graph Building Process
// ====================================================================

const META_GRAPH_ASSISTANT_BUILDING = {
  graph_id: 'META-GRAPH-ASSISTANT-BUILDING-V1',
  name: 'GXE AI Assistant: Graph Building Process',
  description: 'Documents and executes the algorithm by which the GXE AI Assistant receives user messages, calls the LLM with AOPEG tools, parses %%ACTION%% blocks, validates the resulting graph, and streams actions to the frontend.',
  category: 'META',
  namespace: 'META',
  version: '1.0.0',

  nodes: [
    // ─── STAGE 1: HTTP Entry ─────────────────────────────────

    {
      id: 'M-N01',
      type: 'start',
      position: { x: 100, y: 300 },
      data: {
        label: 'Request Receive',
        tool: 'workflow.start',
        description: 'HTTP POST /api/v1/assistant/chat — receives user message with graph state and selection context',
        config: {
          inputs: [
            { name: 'sessionId', type: 'string', required: true },
            { name: 'message', type: 'string', required: true },
            { name: 'graphId', type: 'string', required: false },
            { name: 'graphState', type: 'object', required: true, description: '{ nodes[], edges[], isEmpty, graphId }' },
            { name: 'selectionContext', type: 'object', required: false, description: '{ nodes[], edges[], topologicalRole }' },
          ],
        },
        sourceFile: 'api/src/controllers/assistant.controller.js',
        sourceLine: 123,
      },
    },

    // ─── STAGE 2: Session Management ─────────────────────────

    {
      id: 'M-N02',
      type: 'action',
      position: { x: 350, y: 300 },
      data: {
        label: 'Session Load/Create',
        tool: 'common.transform',
        description: 'Load existing session from Redis or create new one. Stores messages, graphSnapshots, undoStack. TTL 7200s.',
        config: {
          service: 'SessionContextService',
          method: 'getOrCreate',
          storage: 'Redis',
          keyPattern: 'gxe:assistant:session:{sessionId}',
          ttl: 7200,
          maxMessages: 100,
          maxSnapshots: 10,
          maxUndoStack: 50,
        },
        sourceFile: 'api/src/services/agents/SessionContextService.js',
        sourceLine: 43,
      },
    },

    // ─── STAGE 3: Context Assembly ───────────────────────────

    {
      id: 'M-N03',
      type: 'action',
      position: { x: 600, y: 300 },
      data: {
        label: 'Build System Context',
        tool: 'common.transform',
        description: 'Assembles system prompt from 5 layers: KG KnowledgeSections (7 sections P0-P6), AgentLearning error lessons, Codex minimal bootstrap (~400-600 tokens), AOPEG executor catalog (74 executors), and graph state suffix.',
        config: {
          service: 'AgentBootstrapService',
          method: 'bootstrap',
          layers: [
            'KnowledgeSections (P0: Mandate, P1: Action Format, P2: Executor Taxonomy, P3: Design Patterns, P4: Validation Rules, P5: Rationale/Learning, P6: Execution/Verification)',
            'AgentLearning error lessons',
            'Codex minimal bootstrap (KM-001..004 + GXE-031/032)',
            'AOPEG executor catalog (74 executors, 7 domains)',
            'Graph state suffix (buildGraphStateSuffix)',
          ],
        },
        sourceFile: 'api/src/services/agents/AgentBootstrapService.js',
        sourceLine: 108,
      },
    },

    // ─── STAGE 4: Graph State Serialization ──────────────────

    {
      id: 'M-N04',
      type: 'action',
      position: { x: 850, y: 300 },
      data: {
        label: 'Serialize Graph State',
        tool: 'common.transform',
        description: 'Formats current canvas nodes/edges into markdown for system context. Includes node types, tool bindings, edge conditions. Selection context appended separately.',
        config: {
          service: 'assistant.controller',
          method: 'buildGraphStateSuffix',
          includes: ['nodeId', 'type', 'tool', 'label', 'config', 'edges', 'conditions'],
          selectionMethod: 'buildSelectionSuffix',
        },
        sourceFile: 'api/src/controllers/assistant.controller.js',
        sourceLine: 60,
      },
    },

    // ─── STAGE 5: LLM Call (Agentic Loop Entry) ──────────────

    {
      id: 'M-N05',
      type: 'ai_node',
      position: { x: 1100, y: 300 },
      data: {
        label: 'Anthropic Agent Call',
        tool: 'ai.agent',
        description: 'Calls Claude claude-sonnet-4-20250514 via Anthropic SDK with streaming. System prompt + message history + 42+ tools (MCP + GXE + Codex). Max 8192 tokens response.',
        config: {
          model: 'claude-sonnet-4-20250514',
          max_tokens: 8192,
          temperature: 0.3,
          toolSources: ['MCP (project-knowledge)', 'GXE in-process tools', 'Codex fallback tools'],
          totalTools: '42+',
          streaming: true,
          sseEvents: ['chunk', 'tool_call', 'tool_result', 'tool_error', 'done', 'error'],
        },
        sourceFile: 'api/src/services/agents/anthropic-agent.service.js',
        sourceLine: 159,
      },
    },

    // ─── STAGE 6: Response Parsing ───────────────────────────

    {
      id: 'M-N06',
      type: 'action',
      position: { x: 1350, y: 300 },
      data: {
        label: 'Parse Response',
        tool: 'extraction.structured',
        description: 'GraphActionParser extracts %%ACTION%%...%%END_ACTION%% blocks from LLM response. Also %%RATIONALE%% and %%LESSON%% blocks. 4-stage JSON repair: direct → extract → repair → truncate+close.',
        config: {
          parser: 'GraphActionParser',
          regex: '/%%ACTION%%\\s*([\\s\\S]*?)\\s*%%END_ACTION%%{0,2}/g',
          jsonRepairStages: 4,
          fuzzyTypeMatching: true,
          outputFields: ['text', 'actions', 'rationale', 'lessons', 'errors'],
        },
        sourceFile: 'api/src/services/agents/GraphActionParser.js',
        sourceLine: 43,
      },
    },

    // ─── STAGE 7: Action Validation ──────────────────────────

    {
      id: 'M-N07',
      type: 'action',
      position: { x: 1600, y: 300 },
      data: {
        label: 'Validate Actions',
        tool: 'validation.schema',
        description: 'Validates each parsed action: checks required fields per type (ADD_NODE needs node.id+node.type, ADD_EDGE needs source+target, etc.). Fuzzy type matching with aliases.',
        config: {
          actionTypes: [
            'ADD_NODE', 'REMOVE_NODE', 'UPDATE_NODE',
            'ADD_EDGE', 'REMOVE_EDGE',
            'INSERT_BETWEEN', 'CREATE_SUBGRAPH', 'EXTRACT_SUBGRAPH',
            'BATCH', 'EXECUTE_GRAPH',
          ],
          aliases: {
            'DELETE_NODE': 'REMOVE_NODE',
            'CREATE_EDGE': 'ADD_EDGE',
            'LINK': 'ADD_EDGE',
            'RUN': 'EXECUTE_GRAPH',
          },
        },
        sourceFile: 'api/src/services/agents/GraphActionParser.js',
        sourceLine: 350,
      },
    },

    // ─── STAGE 8: Loop Decision (Agentic Loop Control) ──────

    {
      id: 'M-N08',
      type: 'condition',
      position: { x: 1850, y: 300 },
      data: {
        label: 'Has Tool Use?',
        tool: 'workflow.condition',
        description: 'Checks if LLM response contains tool_use blocks requiring execution. If yes AND iterations < 10, loops back to Anthropic call. Otherwise proceeds to graph validation.',
        config: {
          expression: 'hasToolUse === true && iterationCount < maxIterations',
          maxIterations: 10,
        },
        sourceFile: 'api/src/services/agents/anthropic-agent.service.js',
        sourceLine: 214,
      },
    },

    // ─── STAGE 9: Graph Validation ───────────────────────────

    {
      id: 'M-N09',
      type: 'action',
      position: { x: 2100, y: 300 },
      data: {
        label: 'Validate Graph',
        tool: 'validation.graph',
        description: 'GraphValidator runs 6 checks: node ID uniqueness, edge integrity (source/target exist), DAG check (Kahn\'s algorithm), connectivity (BFS), entry/exit nodes, standard I/O nodes. Returns {valid, errors[], warnings[], stats}.',
        config: {
          checks: [
            { name: 'nodeIdUniqueness', severity: 'error' },
            { name: 'edgeIntegrity', severity: 'error' },
            { name: 'dagCheck', severity: 'error', algorithm: 'Kahn' },
            { name: 'connectivity', severity: 'warning', algorithm: 'BFS' },
            { name: 'entryExitNodes', severity: 'error' },
            { name: 'standardIO', severity: 'warning' },
          ],
        },
        sourceFile: 'api/src/services/graph/graph-validator.js',
        sourceLine: 43,
      },
    },

    // ─── STAGE 10: Auto-Fix ──────────────────────────────────

    {
      id: 'M-N10',
      type: 'action',
      position: { x: 2350, y: 300 },
      data: {
        label: 'Auto-Fix Graph',
        tool: 'common.transform',
        description: 'GraphValidator.autoFix() normalizes edges (ReactFlow↔AOPEG), filters bad IDs, deduplicates nodes, removes self-loops, removes duplicate edges, ensures edge IDs, applies default positions.',
        config: {
          service: 'GraphValidator',
          method: 'autoFix',
          fixes: [
            'normalizeEdges', 'filterBadIds', 'deduplicateNodes',
            'removeSelfLoops', 'removeDuplicateEdges',
            'ensureEdgeIds', 'applyDefaultPositions',
          ],
        },
        sourceFile: 'api/src/services/graph/graph-validator.js',
        sourceLine: 352,
      },
    },

    // ─── STAGE 11: Session Update ────────────────────────────

    {
      id: 'M-N11',
      type: 'action',
      position: { x: 2600, y: 300 },
      data: {
        label: 'Update Session',
        tool: 'common.transform',
        description: 'Saves assistant response to session history, pushes graph snapshot, generates inverse diffs for undo stack, saves learned lessons to AgentLearningService.',
        config: {
          operations: [
            'appendMessage(role: assistant)',
            'pushGraphSnapshot()',
            'pushUndo(inverseDiff)',
            'saveLessons()',
          ],
        },
        sourceFile: 'api/src/controllers/assistant.controller.js',
        sourceLine: 256,
      },
    },

    // ─── STAGE 12: SSE Stream ────────────────────────────────

    {
      id: 'M-N12',
      type: 'action',
      position: { x: 2850, y: 300 },
      data: {
        label: 'SSE Stream to Frontend',
        tool: 'io.stream',
        description: 'Sends final SSE event with type "done" containing cleaned text, parsed actions array, rationale, lessons, and sessionId. Frontend processes via ReadableStream + TextDecoder.',
        config: {
          eventType: 'done',
          payload: ['text', 'actions[]', 'rationale', 'lessons[]', 'sessionId'],
          contentType: 'text/event-stream',
        },
        sourceFile: 'api/src/controllers/assistant.controller.js',
        sourceLine: 279,
      },
    },

    // ─── STAGE 13: Frontend Apply ────────────────────────────

    {
      id: 'M-N13',
      type: 'end',
      position: { x: 3100, y: 300 },
      data: {
        label: 'Frontend Apply Actions',
        tool: 'workflow.end',
        description: 'User clicks "Apply" on each ActionCard. handleApplyAction() dispatches setNodes/setEdges to ReactFlow canvas incrementally. Auto-validation via triggerAutoFix() checks: 1x workflow.start, 1+ workflow.end, all non-start have incoming edge, condition nodes have 2+ outgoing.',
        config: {
          outputs: ['updatedNodes', 'updatedEdges', 'validationResult'],
          applicationMode: 'user-initiated',
          autoValidation: true,
        },
        sourceFile: 'mcp/src/components/GXE/panels/GXEAssistantTab.jsx',
        sourceLine: 885,
      },
    },

    // ─── ERROR: Max Iterations ───────────────────────────────

    {
      id: 'M-N14',
      type: 'action',
      position: { x: 1850, y: 500 },
      data: {
        label: 'Max Iterations Reached',
        tool: 'notification.send',
        description: 'Emits max_iterations warning event when agentic loop reaches 10 iterations without completion.',
        config: {
          channel: 'sse',
          eventType: 'max_iterations',
          payload: { iterations: 10 },
        },
        sourceFile: 'api/src/services/agents/anthropic-agent.service.js',
        sourceLine: 273,
      },
    },

    // ─── END ERROR ───────────────────────────────────────────

    {
      id: 'M-N15',
      type: 'end',
      position: { x: 2100, y: 500 },
      data: {
        label: 'Complete (Truncated)',
        tool: 'workflow.end',
        config: {
          outputs: ['partialActions', 'iterationCount'],
        },
      },
    },
  ],

  edges: [
    // ─── Main Flow ───────────────────────────────────────────
    { id: 'e01-02', source: 'M-N01', target: 'M-N02' },
    { id: 'e02-03', source: 'M-N02', target: 'M-N03' },
    { id: 'e03-04', source: 'M-N03', target: 'M-N04' },
    { id: 'e04-05', source: 'M-N04', target: 'M-N05' },

    // ─── Agentic Loop ────────────────────────────────────────
    { id: 'e05-06', source: 'M-N05', target: 'M-N06' },
    { id: 'e06-07', source: 'M-N06', target: 'M-N07' },
    { id: 'e07-08', source: 'M-N07', target: 'M-N08' },

    // Loop decision: tool_use detected → back to LLM
    { id: 'e08-05', source: 'M-N08', target: 'M-N05', label: 'tool_use_detected' },

    // Loop decision: no more tool_use → proceed to validation
    { id: 'e08-09', source: 'M-N08', target: 'M-N09', label: 'no_tool_use' },

    // Loop decision: max iterations → error path
    { id: 'e08-14', source: 'M-N08', target: 'M-N14', label: 'max_iterations' },

    // ─── Post-Processing ─────────────────────────────────────
    { id: 'e09-10', source: 'M-N09', target: 'M-N10' },
    { id: 'e10-11', source: 'M-N10', target: 'M-N11' },
    { id: 'e11-12', source: 'M-N11', target: 'M-N12' },
    { id: 'e12-13', source: 'M-N12', target: 'M-N13' },

    // ─── Error Path ──────────────────────────────────────────
    { id: 'e14-15', source: 'M-N14', target: 'M-N15' },
  ],

  metadata: {
    createdAt: '2026-03-27',
    createdBy: 'architecture-session',
    chatId: '95b7f392-b464-44ee-aa33-dd8f462c2795',
    graphType: 'process-documentation',
    isExecutable: true,
    relatedFiles: [
      'api/src/controllers/assistant.controller.js',
      'api/src/services/agents/anthropic-agent.service.js',
      'api/src/services/agents/GraphActionParser.js',
      'api/src/services/graph/graph-validator.js',
      'api/src/services/agents/SessionContextService.js',
      'api/src/services/agents/AgentBootstrapService.js',
      'mcp/src/components/GXE/panels/GXEAssistantTab.jsx',
    ],
  },
};

module.exports = { META_GRAPH_ASSISTANT_BUILDING };
