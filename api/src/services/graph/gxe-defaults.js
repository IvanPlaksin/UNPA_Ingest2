/**
 * GXE Default Configuration
 *
 * Minimal tool set for graph generation to optimize token usage.
 * Full list: ~66 tools. Default set: ~18 tools (73% reduction).
 *
 * Note: In SDA mode (default), tools are NOT sent to Claude — only used
 * locally by Tool Resolver and TaskPlanner (Gemini). In legacy mode,
 * tools with full input_schema are sent to Claude API.
 *
 * @module services/graph/gxe-defaults
 */

// ═══════════════════════════════════════════════════════════════════════════
// DEFAULT TOOL CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Core primitive tools (data operations)
 * Removed: primitive.log (debugging only, not needed for pipeline execution)
 */
const CORE_PRIMITIVES = [
  'primitive.get_value',
  'primitive.set_value',
  'primitive.transform',
  'primitive.filter',
  'primitive.map',
  'primitive.merge'
];

/**
 * Text processing tools
 * Removed: text.template (rarely used), text.extract_keywords (redundant with extraction.entities)
 */
const TEXT_TOOLS = [
  'text.sanitize',
  'text.normalize',
  'text.chunk'
];

/**
 * Extraction tools
 */
const EXTRACTION_TOOLS = [
  'extraction.entities',
  'extraction.relations',
  'extraction.structure'
];

/**
 * Vector/embedding tools
 */
const VECTOR_TOOLS = [
  'vector.embed',
  'vector.search',
  'vector.store'
];

/**
 * Graph operation tools
 */
const GRAPH_TOOLS = [
  'graph.query',
  'graph.create_node',
  'graph.create_edge'
];

/**
 * AI tools (optional, for advanced graphs)
 */
const AI_TOOLS = [
  'ai.summarize',
  'ai.classify'
];

/**
 * Catalog tools (graph/tool catalog operations)
 */
const CATALOG_TOOLS = [
  'catalog.search_graphs',
  'catalog.get_graph',
  'catalog.save_graph',
  'catalog.clone_graph',
  'catalog.find_similar_graphs',
  'catalog.analyze_reuse',
  'catalog.list_tools',
  'catalog.get_tool_detail',
  'catalog.search_tools',
  'catalog.suggest_tools'
];

/**
 * BackLog tools (task management for agents)
 */
const BACKLOG_TOOLS = [
  'backlog.create_task',
  'backlog.list_tasks',
  'backlog.get_task',
  'backlog.update_status',
  'backlog.get_stats',
  'backlog.add_dependency'
];

/**
 * Workflow control tools (graph execution flow)
 */
const WORKFLOW_TOOLS = [
  'workflow.start',
  'workflow.end',
  'workflow.condition',
  'workflow.wait_input'
];

/**
 * FlowDesk tools (ITSM business process executors)
 */
const FLOWDESK_TOOLS = [
  'flowdesk.classify_intent',
  'flowdesk.check_location',
  'flowdesk.search_location',
  'flowdesk.ask_beneficiary',
  'flowdesk.find_user',
  'flowdesk.confirm_request',
  'flowdesk.spawn_process',
  'flowdesk.create_service_request',
  'flowdesk.request_approval',
  'flowdesk.create_work_order',
  'flowdesk.assign_handler',
  'flowdesk.send_notification'
];

// ═══════════════════════════════════════════════════════════════════════════
// TOOL SETS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Minimal tool set for basic graph generation (~14 tools)
 * Use for: simple data flows, basic transformations
 */
const MINIMAL_TOOL_SET = [
  ...CORE_PRIMITIVES,
  ...TEXT_TOOLS,              // sanitize, normalize, chunk (all 3)
  ...EXTRACTION_TOOLS.slice(0, 2), // entities, relations
  ...VECTOR_TOOLS.slice(0, 2), // embed, search
  ...GRAPH_TOOLS.slice(0, 2)  // query, create_node
];

/**
 * Standard tool set for most graph generation tasks (~48 tools)
 * Use for: typical UN data ingestion, entity extraction, graph building
 * Includes: catalog, backlog, workflow, flowdesk for full agent capability
 */
const STANDARD_TOOL_SET = [
  ...CORE_PRIMITIVES,
  ...TEXT_TOOLS,
  ...EXTRACTION_TOOLS,
  ...VECTOR_TOOLS,
  ...GRAPH_TOOLS,
  ...CATALOG_TOOLS,
  ...BACKLOG_TOOLS,
  ...WORKFLOW_TOOLS,
  ...FLOWDESK_TOOLS
];

/**
 * Extended tool set with AI capabilities (~50 tools)
 * Use for: advanced analysis, summarization, classification
 */
const EXTENDED_TOOL_SET = [
  ...STANDARD_TOOL_SET,
  ...AI_TOOLS
];

/**
 * Full tool set - all available tools (~66 tools)
 * Use for: complex multi-step workflows, meta-programming
 * Warning: May exceed rate limits on some plans
 */
const FULL_TOOL_SET = null; // null = no filtering, use all tools

// ═══════════════════════════════════════════════════════════════════════════
// GXE DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Default GXE configuration
 */
const GXE_DEFAULTS = {
  // Use Agentic Mode by default (tools enabled)
  useTools: true,

  // Use SDA pipeline by default (structured generation)
  useSDA: true,

  // Default tool set (standard - balanced between capability and token usage)
  defaultToolSet: STANDARD_TOOL_SET,

  // Default model
  defaultModel: 'claude-sonnet',

  // Tool set presets
  toolSetPresets: {
    minimal: MINIMAL_TOOL_SET,
    standard: STANDARD_TOOL_SET,
    extended: EXTENDED_TOOL_SET,
    full: FULL_TOOL_SET
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  GXE_DEFAULTS,
  MINIMAL_TOOL_SET,
  STANDARD_TOOL_SET,
  EXTENDED_TOOL_SET,
  FULL_TOOL_SET,
  CORE_PRIMITIVES,
  TEXT_TOOLS,
  EXTRACTION_TOOLS,
  VECTOR_TOOLS,
  GRAPH_TOOLS,
  AI_TOOLS,
  CATALOG_TOOLS,
  BACKLOG_TOOLS,
  WORKFLOW_TOOLS,
  FLOWDESK_TOOLS
};
