/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SEED GRAPH TYPES
 * Populates Core Knowledge Base with standard node/edge types
 *
 * Run: node api/scripts/seed-graph-types.js
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { getGraphTypeService, NodeCategory, Domain, EdgeType } = require('../src/services/graph/GraphTypeService');

// ────────────────────────────────────────────────────────────────────────────
// DOMAIN DEFINITIONS
// ────────────────────────────────────────────────────────────────────────────

const DOMAINS = [
  {
    name: Domain.COMMON,
    displayName: 'Common',
    description: 'Universal node types for control flow and general operations',
    color: '#64748b',
    icon: 'box',
  },
  {
    name: Domain.INGESTION,
    displayName: 'Ingestion',
    description: 'Document parsing, text processing, and data ingestion',
    color: '#22c55e',
    icon: 'file-input',
  },
  {
    name: Domain.RAG,
    displayName: 'RAG',
    description: 'Retrieval-Augmented Generation pipeline components',
    color: '#3b82f6',
    icon: 'brain',
  },
  {
    name: Domain.WORKFLOW,
    displayName: 'Workflow',
    description: 'Business process and workflow automation types',
    color: '#a855f7',
    icon: 'workflow',
  },
  {
    name: Domain.INTEGRATION,
    displayName: 'Integration',
    description: 'External system connectors and API integrations',
    color: '#f59e0b',
    icon: 'plug',
  },
  {
    name: Domain.INFRASTRUCTURE,
    displayName: 'Infrastructure',
    description: 'System infrastructure nodes — proxy nodes for SubGraph consolidation. These are NOT business entities and MUST be excluded from graph analysis, clustering, and community detection.',
    color: '#6b7280',
    icon: 'server',
  },
  // ── Async Signal System + FormBuilder domains ──
  {
    name: Domain.FORMS,
    displayName: 'Forms',
    description: 'Form definitions, fields, validation rules, and display conditions for the AI-First FormBuilder system. Stored in CORE namespace as canonical reusable specifications.',
    color: '#14b8a6',
    icon: 'clipboard-list',
  },
  {
    name: Domain.SIGNALS,
    displayName: 'Signals',
    description: 'Async signal resolution policies, participants, and timeout actions. Universal async node contract for SINGLE/QUORUM/VOTE/FORCE modes.',
    color: '#f43f5e',
    icon: 'bell-ring',
  },
  {
    name: Domain.AGENTS,
    displayName: 'Agents',
    description: 'AI agent pool definitions and agent configurations for AI Society voting and autonomous decision-making.',
    color: '#8b5cf6',
    icon: 'bot',
  },
  {
    name: Domain.FLOWDESK,
    displayName: 'FlowDesk',
    description: 'FlowDesk service management configurations — SLA targets, queue mappings, keyword rules, service categories, domain codes, confidence thresholds, and scope rules.',
    color: '#f97316',
    icon: 'headset',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// EDGE TYPE DEFINITIONS
// ────────────────────────────────────────────────────────────────────────────

const EDGE_TYPES = [
  {
    name: EdgeType.DATA_FLOW,
    displayName: 'Data Flow',
    description: 'Normal data transfer between nodes',
    color: '#3b82f6',
    style: 'solid',
    animated: false,
    allowedSources: ['*'],
    allowedTargets: ['*'],
    dataSchema: {
      type: 'object',
      properties: {
        mapping: { type: 'object' },
        transform: { type: 'string' },
      },
    },
  },
  {
    name: EdgeType.CONTROL_FLOW,
    displayName: 'Control Flow',
    description: 'Execution order without data transfer',
    color: '#64748b',
    style: 'dashed',
    animated: false,
    allowedSources: ['*'],
    allowedTargets: ['*'],
    dataSchema: {},
  },
  {
    name: EdgeType.CONDITIONAL,
    displayName: 'Conditional',
    description: 'Conditional branching based on expression',
    color: '#f59e0b',
    style: 'solid',
    animated: true,
    allowedSources: ['condition', 'gateway'],
    allowedTargets: ['*'],
    dataSchema: {
      type: 'object',
      properties: {
        condition: { type: 'string' },
        expression: { type: 'string' },
      },
      required: ['condition'],
    },
  },
  {
    name: EdgeType.ERROR_HANDLING,
    displayName: 'Error Handling',
    description: 'Error and exception flow',
    color: '#ef4444',
    style: 'dotted',
    animated: false,
    allowedSources: ['*'],
    allowedTargets: ['*'],
    dataSchema: {
      type: 'object',
      properties: {
        errorTypes: { type: 'array', items: { type: 'string' } },
        retryable: { type: 'boolean' },
      },
    },
  },
  {
    name: EdgeType.TIMEOUT,
    displayName: 'Timeout',
    description: 'Timeout-triggered flow',
    color: '#f97316',
    style: 'dotted',
    animated: false,
    allowedSources: ['*'],
    allowedTargets: ['*'],
    dataSchema: {
      type: 'object',
      properties: {
        timeoutMs: { type: 'number' },
      },
    },
  },
  {
    name: EdgeType.CASCADE,
    displayName: 'Cascade',
    description: 'Cascade delete/update propagation',
    color: '#8b5cf6',
    style: 'solid',
    animated: true,
    allowedSources: ['aggregator', 'gateway'],
    allowedTargets: ['*'],
    dataSchema: {},
  },
  // ── Async Signal System + FormBuilder edge types ──
  {
    name: EdgeType.HAS_SECTION,
    displayName: 'Has Section',
    description: 'FormDefinition contains a FormSection',
    color: '#14b8a6',
    style: 'solid',
    animated: false,
    allowedSources: ['forms.form_definition'],
    allowedTargets: ['forms.form_section'],
    dataSchema: {},
  },
  {
    name: EdgeType.HAS_FIELD,
    displayName: 'Has Field',
    description: 'FormSection contains a FormField',
    color: '#14b8a6',
    style: 'solid',
    animated: false,
    allowedSources: ['forms.form_section'],
    allowedTargets: ['forms.form_field'],
    dataSchema: {},
  },
  {
    name: EdgeType.HAS_VALIDATION,
    displayName: 'Has Validation',
    description: 'FormField has a ValidationRule attached',
    color: '#14b8a6',
    style: 'dashed',
    animated: false,
    allowedSources: ['forms.form_field'],
    allowedTargets: ['forms.validation_rule'],
    dataSchema: {},
  },
  {
    name: EdgeType.HAS_DISPLAY_CONDITION,
    displayName: 'Has Display Condition',
    description: 'FormField has a DisplayCondition controlling its visibility',
    color: '#14b8a6',
    style: 'dashed',
    animated: false,
    allowedSources: ['forms.form_field'],
    allowedTargets: ['forms.display_condition'],
    dataSchema: {},
  },
  {
    name: EdgeType.USES_DATA_SOURCE,
    displayName: 'Uses Data Source',
    description: 'FormField references a DataSourceDefinition for select/autocomplete options',
    color: '#f59e0b',
    style: 'solid',
    animated: true,
    allowedSources: ['forms.form_field'],
    allowedTargets: ['integration.data_source_definition'],
    dataSchema: {},
  },
  {
    name: EdgeType.PRODUCES_SCHEMA,
    displayName: 'Produces Schema',
    description: 'FormDefinition produces a JSONSchema for resume payload validation',
    color: '#14b8a6',
    style: 'dotted',
    animated: false,
    allowedSources: ['forms.form_definition'],
    allowedTargets: ['*'],
    dataSchema: { type: 'object', properties: { schemaVersion: { type: 'string' } } },
  },
  {
    name: EdgeType.HAS_RESOLUTION_POLICY,
    displayName: 'Has Resolution Policy',
    description: 'FormDefinition links to a SignalResolutionPolicy defining how signals are resolved',
    color: '#f43f5e',
    style: 'solid',
    animated: false,
    allowedSources: ['forms.form_definition'],
    allowedTargets: ['signals.signal_resolution_policy'],
    dataSchema: {},
  },
  {
    name: EdgeType.HAS_PARTICIPANT,
    displayName: 'Has Participant',
    description: 'SignalResolutionPolicy includes a Participant (human, AI agent, or pool)',
    color: '#f43f5e',
    style: 'solid',
    animated: false,
    allowedSources: ['signals.signal_resolution_policy'],
    allowedTargets: ['signals.participant'],
    dataSchema: {},
  },
  {
    name: EdgeType.ON_TIMEOUT,
    displayName: 'On Timeout',
    description: 'SignalResolutionPolicy defines a TimeoutAction for deadline expiry',
    color: '#f97316',
    style: 'dotted',
    animated: false,
    allowedSources: ['signals.signal_resolution_policy'],
    allowedTargets: ['signals.timeout_action'],
    dataSchema: {},
  },
  {
    name: EdgeType.SCOPED_TO_NAMESPACE,
    displayName: 'Scoped To Namespace',
    description: 'DataSourceDefinition is scoped to a specific namespace for access filtering',
    color: '#64748b',
    style: 'dashed',
    animated: false,
    allowedSources: ['integration.data_source_definition'],
    allowedTargets: ['*'],
    dataSchema: {},
  },
  {
    name: EdgeType.HAS_CONFIG,
    displayName: 'Has Config',
    description: 'DataSourceDefinition links to its type-specific configuration node',
    color: '#64748b',
    style: 'solid',
    animated: false,
    allowedSources: ['integration.data_source_definition'],
    allowedTargets: ['*'],
    dataSchema: {},
  },
  {
    name: EdgeType.HAS_MEMBER,
    displayName: 'Has Member',
    description: 'AgentPoolDefinition contains an AgentDefinition member',
    color: '#8b5cf6',
    style: 'solid',
    animated: false,
    allowedSources: ['agents.agent_pool_definition'],
    allowedTargets: ['agents.agent_definition'],
    dataSchema: {},
  },
  {
    name: EdgeType.RESOLVED_BY,
    displayName: 'Resolved By',
    description: 'SignalRecord was resolved by a specific Participant',
    color: '#22c55e',
    style: 'solid',
    animated: false,
    allowedSources: ['meta.signal_record'],
    allowedTargets: ['signals.participant'],
    dataSchema: {},
  },
  {
    name: EdgeType.FOR_EXECUTION,
    displayName: 'For Execution',
    description: 'SignalRecord belongs to a specific ExecutionRecord',
    color: '#64748b',
    style: 'dashed',
    animated: false,
    allowedSources: ['meta.signal_record'],
    allowedTargets: ['*'],
    dataSchema: {},
  },
  {
    name: EdgeType.WAITING_ON,
    displayName: 'Waiting On',
    description: 'PendingSignal is waiting on a FormDefinition to be filled',
    color: '#f43f5e',
    style: 'solid',
    animated: true,
    allowedSources: ['meta.pending_signal'],
    allowedTargets: ['forms.form_definition'],
    dataSchema: {},
  },
  // ── Infrastructure edge types (SubGraph system) ──
  {
    name: EdgeType.CONTAINS_MEMBER,
    displayName: 'Contains Member',
    description: 'Infrastructure: SubGraph contains a member node. Created during subgraph extraction.',
    color: '#6b7280',
    style: 'dotted',
    animated: false,
    allowedSources: ['infrastructure.subgraph'],
    allowedTargets: ['*'],
    dataSchema: {},
  },
  {
    name: EdgeType.PORT_OF,
    displayName: 'Port Of',
    description: 'Infrastructure: SubGraph owns a boundary port. Created during boundary resolution.',
    color: '#6b7280',
    style: 'dotted',
    animated: false,
    allowedSources: ['infrastructure.subgraph'],
    allowedTargets: ['infrastructure.subgraph_port'],
    dataSchema: {},
  },
  {
    name: EdgeType.BRIDGES_TO,
    displayName: 'Bridges To',
    description: 'Infrastructure: SubGraphPort bridges to an external node outside the subgraph.',
    color: '#6b7280',
    style: 'dotted',
    animated: false,
    allowedSources: ['infrastructure.subgraph_port'],
    allowedTargets: ['*'],
    dataSchema: {},
  },
  {
    name: EdgeType.CONNECTS_INTERNAL,
    displayName: 'Connects Internal',
    description: 'Infrastructure: SubGraphPort connects to an internal member node.',
    color: '#6b7280',
    style: 'dotted',
    animated: false,
    allowedSources: ['infrastructure.subgraph_port'],
    allowedTargets: ['*'],
    dataSchema: {},
  },
  {
    name: EdgeType.SUBGRAPH_LINK,
    displayName: 'SubGraph Link',
    description: 'Infrastructure: Rewired boundary edge passing through a consolidated SubGraph proxy.',
    color: '#6b7280',
    style: 'dashed',
    animated: false,
    allowedSources: ['*'],
    allowedTargets: ['*'],
    dataSchema: {
      type: 'object',
      properties: {
        originalType: { type: 'string' },
        direction: { type: 'string', enum: ['IN', 'OUT'] },
        originalSourceId: { type: 'string' },
      },
    },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// COMMON NODE TYPES
// ────────────────────────────────────────────────────────────────────────────

const COMMON_NODE_TYPES = [
  {
    domain: Domain.COMMON,
    name: 'condition',
    category: NodeCategory.CONDITION,
    displayName: 'Condition',
    description: 'Evaluates a condition and branches the flow',
    icon: 'git-branch',
    color: '#f59e0b',
    parameters: [
      { name: 'expression', type: 'string', required: true, description: 'JavaScript expression to evaluate' },
      { name: 'trueBranch', type: 'string', required: false, description: 'Label for true branch' },
      { name: 'falseBranch', type: 'string', required: false, description: 'Label for false branch' },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', properties: { result: { type: 'boolean' }, data: { type: 'object' } } },
  },
  {
    domain: Domain.COMMON,
    name: 'merge',
    category: NodeCategory.AGGREGATOR,
    displayName: 'Merge',
    description: 'Merges multiple inputs into a single output',
    icon: 'git-merge',
    color: '#8b5cf6',
    parameters: [
      { name: 'strategy', type: 'enum', required: false, enumValues: ['concat', 'merge', 'first', 'last'], default: 'merge' },
      { name: 'waitForAll', type: 'boolean', required: false, default: true },
    ],
    inputSchema: { type: 'array' },
    outputSchema: { type: 'object' },
  },
  {
    domain: Domain.COMMON,
    name: 'split',
    category: NodeCategory.GATEWAY,
    displayName: 'Parallel Split',
    description: 'Splits flow into parallel branches',
    icon: 'split',
    color: '#06b6d4',
    parameters: [
      { name: 'branches', type: 'number', required: false, default: 2 },
      { name: 'distribution', type: 'enum', required: false, enumValues: ['copy', 'partition', 'round-robin'] },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'array' },
  },
  {
    domain: Domain.COMMON,
    name: 'wait',
    category: NodeCategory.CONTROL,
    displayName: 'Wait/Delay',
    description: 'Pauses execution for a specified duration',
    icon: 'clock',
    color: '#64748b',
    parameters: [
      { name: 'duration', type: 'number', required: true, description: 'Wait duration in milliseconds' },
      { name: 'condition', type: 'string', required: false, description: 'Optional condition to check during wait' },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
  },
  {
    domain: Domain.COMMON,
    name: 'loop',
    category: NodeCategory.CONTROL,
    displayName: 'Loop',
    description: 'Iterates over items or until a condition is met',
    icon: 'repeat',
    color: '#10b981',
    parameters: [
      { name: 'type', type: 'enum', required: true, enumValues: ['forEach', 'while', 'for'] },
      { name: 'condition', type: 'string', required: false },
      { name: 'maxIterations', type: 'number', required: false, default: 100 },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'array' },
  },
  {
    domain: Domain.COMMON,
    name: 'transform',
    category: NodeCategory.TRANSFORMER,
    displayName: 'Transform',
    description: 'Transforms data using a JavaScript expression',
    icon: 'wand-2',
    color: '#ec4899',
    parameters: [
      { name: 'expression', type: 'string', required: true, description: 'JavaScript transform expression' },
      { name: 'outputPath', type: 'string', required: false, description: 'Path for output data' },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
  },
  {
    domain: Domain.COMMON,
    name: 'filter',
    category: NodeCategory.TRANSFORMER,
    displayName: 'Filter',
    description: 'Filters data based on a condition',
    icon: 'filter',
    color: '#6366f1',
    parameters: [
      { name: 'condition', type: 'string', required: true, description: 'Filter condition' },
      { name: 'path', type: 'string', required: false, description: 'Path to array to filter' },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// INGESTION NODE TYPES
// ────────────────────────────────────────────────────────────────────────────

const INGESTION_NODE_TYPES = [
  {
    domain: Domain.INGESTION,
    name: 'parse_document',
    category: NodeCategory.EXECUTOR,
    displayName: 'Parse Document',
    description: 'Parses documents (PDF, DOCX, HTML, etc.) into structured text',
    icon: 'file-text',
    color: '#22c55e',
    parameters: [
      { name: 'format', type: 'enum', required: false, enumValues: ['auto', 'pdf', 'docx', 'html', 'markdown'] },
      { name: 'extractMetadata', type: 'boolean', required: false, default: true },
      { name: 'extractImages', type: 'boolean', required: false, default: false },
    ],
    inputSchema: { type: 'object', properties: { content: { type: 'string' }, url: { type: 'string' }, path: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { text: { type: 'string' }, metadata: { type: 'object' }, images: { type: 'array' } } },
  },
  {
    domain: Domain.INGESTION,
    name: 'sanitize',
    category: NodeCategory.TRANSFORMER,
    displayName: 'Sanitize Text',
    description: 'Cleans and normalizes text content',
    icon: 'eraser',
    color: '#22c55e',
    parameters: [
      { name: 'removeHtml', type: 'boolean', required: false, default: true },
      { name: 'normalizeWhitespace', type: 'boolean', required: false, default: true },
      { name: 'removeUrls', type: 'boolean', required: false, default: false },
      { name: 'removePii', type: 'boolean', required: false, default: false },
    ],
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { text: { type: 'string' }, changes: { type: 'array' } } },
  },
  {
    domain: Domain.INGESTION,
    name: 'chunk_text',
    category: NodeCategory.TRANSFORMER,
    displayName: 'Chunk Text',
    description: 'Splits text into semantic chunks for processing',
    icon: 'scissors',
    color: '#22c55e',
    parameters: [
      { name: 'strategy', type: 'enum', required: false, enumValues: ['semantic', 'fixed', 'paragraph', 'sentence'], default: 'semantic' },
      { name: 'chunkSize', type: 'number', required: false, default: 512 },
      { name: 'chunkOverlap', type: 'number', required: false, default: 50 },
      { name: 'minChunkSize', type: 'number', required: false, default: 100 },
    ],
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { chunks: { type: 'array', items: { type: 'object' } } } },
  },
  {
    domain: Domain.INGESTION,
    name: 'extract_entities',
    category: NodeCategory.EXECUTOR,
    displayName: 'Extract Entities',
    description: 'Extracts named entities and relationships from text',
    icon: 'tag',
    color: '#22c55e',
    parameters: [
      { name: 'entityTypes', type: 'array', required: false, description: 'Entity types to extract' },
      { name: 'extractRelations', type: 'boolean', required: false, default: true },
      { name: 'model', type: 'string', required: false, default: 'default' },
    ],
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, chunks: { type: 'array' } } },
    outputSchema: { type: 'object', properties: { entities: { type: 'array' }, relations: { type: 'array' } } },
  },
  {
    domain: Domain.INGESTION,
    name: 'detect_language',
    category: NodeCategory.TRANSFORMER,
    displayName: 'Detect Language',
    description: 'Detects the language of text content',
    icon: 'languages',
    color: '#22c55e',
    parameters: [
      { name: 'confidence', type: 'number', required: false, default: 0.8 },
    ],
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { language: { type: 'string' }, confidence: { type: 'number' } } },
  },
  {
    domain: Domain.INGESTION,
    name: 'write_vector',
    category: NodeCategory.EXECUTOR,
    displayName: 'Write to Vector Store',
    description: 'Writes embeddings to vector database',
    icon: 'database',
    color: '#22c55e',
    parameters: [
      { name: 'collection', type: 'string', required: true },
      { name: 'embeddingModel', type: 'string', required: false, default: 'default' },
      { name: 'batchSize', type: 'number', required: false, default: 100 },
    ],
    inputSchema: { type: 'object', properties: { chunks: { type: 'array' }, metadata: { type: 'object' } } },
    outputSchema: { type: 'object', properties: { written: { type: 'number' }, ids: { type: 'array' } } },
  },
  {
    domain: Domain.INGESTION,
    name: 'write_graph',
    category: NodeCategory.EXECUTOR,
    displayName: 'Write to Graph',
    description: 'Writes entities and relationships to knowledge graph',
    icon: 'share-2',
    color: '#22c55e',
    parameters: [
      { name: 'namespace', type: 'string', required: true },
      { name: 'mergeStrategy', type: 'enum', required: false, enumValues: ['create', 'merge', 'upsert'], default: 'merge' },
    ],
    inputSchema: { type: 'object', properties: { entities: { type: 'array' }, relations: { type: 'array' } } },
    outputSchema: { type: 'object', properties: { nodesCreated: { type: 'number' }, edgesCreated: { type: 'number' } } },
  },
  {
    domain: Domain.INGESTION,
    name: 'classify_content',
    category: NodeCategory.EXECUTOR,
    displayName: 'Classify Content',
    description: 'Classifies content into categories',
    icon: 'folder-tree',
    color: '#22c55e',
    parameters: [
      { name: 'categories', type: 'array', required: true },
      { name: 'multiLabel', type: 'boolean', required: false, default: false },
      { name: 'threshold', type: 'number', required: false, default: 0.5 },
    ],
    inputSchema: { type: 'object', properties: { text: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { categories: { type: 'array' }, scores: { type: 'object' } } },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// RAG NODE TYPES
// ────────────────────────────────────────────────────────────────────────────

const RAG_NODE_TYPES = [
  {
    domain: Domain.RAG,
    name: 'expand_query',
    category: NodeCategory.TRANSFORMER,
    displayName: 'Expand Query',
    description: 'Expands user query with synonyms and related terms',
    icon: 'expand',
    color: '#3b82f6',
    parameters: [
      { name: 'method', type: 'enum', required: false, enumValues: ['llm', 'thesaurus', 'embeddings'], default: 'llm' },
      { name: 'expansions', type: 'number', required: false, default: 3 },
    ],
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { original: { type: 'string' }, expanded: { type: 'array' } } },
  },
  {
    domain: Domain.RAG,
    name: 'vector_search',
    category: NodeCategory.EXECUTOR,
    displayName: 'Vector Search',
    description: 'Performs semantic vector similarity search',
    icon: 'search',
    color: '#3b82f6',
    parameters: [
      { name: 'collection', type: 'string', required: true },
      { name: 'topK', type: 'number', required: false, default: 10 },
      { name: 'threshold', type: 'number', required: false, default: 0.7 },
      { name: 'filter', type: 'object', required: false },
    ],
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { results: { type: 'array' }, scores: { type: 'array' } } },
  },
  {
    domain: Domain.RAG,
    name: 'graph_search',
    category: NodeCategory.EXECUTOR,
    displayName: 'Graph Search',
    description: 'Performs knowledge graph traversal search',
    icon: 'network',
    color: '#3b82f6',
    parameters: [
      { name: 'namespace', type: 'string', required: true },
      { name: 'depth', type: 'number', required: false, default: 2 },
      { name: 'relationTypes', type: 'array', required: false },
    ],
    inputSchema: { type: 'object', properties: { entities: { type: 'array' }, query: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { nodes: { type: 'array' }, edges: { type: 'array' }, paths: { type: 'array' } } },
  },
  {
    domain: Domain.RAG,
    name: 'hybrid_search',
    category: NodeCategory.EXECUTOR,
    displayName: 'Hybrid Search',
    description: 'Combines vector and graph search for better results',
    icon: 'combine',
    color: '#3b82f6',
    parameters: [
      { name: 'collection', type: 'string', required: true },
      { name: 'namespace', type: 'string', required: true },
      { name: 'vectorWeight', type: 'number', required: false, default: 0.7 },
      { name: 'graphWeight', type: 'number', required: false, default: 0.3 },
      { name: 'topK', type: 'number', required: false, default: 10 },
    ],
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { results: { type: 'array' }, vectorResults: { type: 'array' }, graphResults: { type: 'array' } } },
  },
  {
    domain: Domain.RAG,
    name: 'rerank',
    category: NodeCategory.EXECUTOR,
    displayName: 'Rerank Results',
    description: 'Reranks search results using cross-encoder model',
    icon: 'arrow-up-down',
    color: '#3b82f6',
    parameters: [
      { name: 'model', type: 'string', required: false, default: 'cross-encoder' },
      { name: 'topK', type: 'number', required: false, default: 5 },
      { name: 'threshold', type: 'number', required: false, default: 0.5 },
    ],
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, results: { type: 'array' } } },
    outputSchema: { type: 'object', properties: { results: { type: 'array' }, scores: { type: 'array' } } },
  },
  {
    domain: Domain.RAG,
    name: 'assemble_context',
    category: NodeCategory.TRANSFORMER,
    displayName: 'Assemble Context',
    description: 'Assembles search results into coherent context',
    icon: 'layout-list',
    color: '#3b82f6',
    parameters: [
      { name: 'maxTokens', type: 'number', required: false, default: 4000 },
      { name: 'strategy', type: 'enum', required: false, enumValues: ['relevance', 'diversity', 'temporal'], default: 'relevance' },
      { name: 'includeMetadata', type: 'boolean', required: false, default: true },
    ],
    inputSchema: { type: 'object', properties: { results: { type: 'array' }, query: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { context: { type: 'string' }, sources: { type: 'array' }, tokenCount: { type: 'number' } } },
  },
  {
    domain: Domain.RAG,
    name: 'generate_response',
    category: NodeCategory.EXECUTOR,
    displayName: 'Generate Response',
    description: 'Generates response using LLM with context',
    icon: 'message-square',
    color: '#3b82f6',
    parameters: [
      { name: 'model', type: 'string', required: false, default: 'default' },
      { name: 'temperature', type: 'number', required: false, default: 0.1 },
      { name: 'maxTokens', type: 'number', required: false, default: 1024 },
      { name: 'systemPrompt', type: 'string', required: false },
      { name: 'stream', type: 'boolean', required: false, default: false },
    ],
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, context: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { response: { type: 'string' }, sources: { type: 'array' }, usage: { type: 'object' } } },
  },
  {
    domain: Domain.RAG,
    name: 'evaluate_response',
    category: NodeCategory.EXECUTOR,
    displayName: 'Evaluate Response',
    description: 'Evaluates response quality and relevance',
    icon: 'check-circle',
    color: '#3b82f6',
    parameters: [
      { name: 'metrics', type: 'array', required: false, description: 'Metrics to evaluate' },
      { name: 'threshold', type: 'number', required: false, default: 0.7 },
    ],
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, context: { type: 'string' }, response: { type: 'string' } } },
    outputSchema: { type: 'object', properties: { scores: { type: 'object' }, passed: { type: 'boolean' }, feedback: { type: 'string' } } },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// WORKFLOW NODE TYPES
// ────────────────────────────────────────────────────────────────────────────

const WORKFLOW_NODE_TYPES = [
  {
    domain: Domain.WORKFLOW,
    name: 'user_task',
    category: NodeCategory.EVENT,
    displayName: 'User Task',
    description: 'Waits for user input or action',
    icon: 'user',
    color: '#a855f7',
    parameters: [
      { name: 'taskType', type: 'enum', required: false, enumValues: ['form', 'approval', 'decision', 'input'] },
      { name: 'assignee', type: 'string', required: false },
      { name: 'dueDate', type: 'string', required: false },
      { name: 'formSchema', type: 'object', required: false },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', properties: { result: { type: 'object' }, completedBy: { type: 'string' }, completedAt: { type: 'string' } } },
  },
  {
    domain: Domain.WORKFLOW,
    name: 'service_task',
    category: NodeCategory.EXECUTOR,
    displayName: 'Service Task',
    description: 'Automated service/API call',
    icon: 'cog',
    color: '#a855f7',
    parameters: [
      { name: 'service', type: 'string', required: true },
      { name: 'method', type: 'string', required: true },
      { name: 'async', type: 'boolean', required: false, default: false },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
  },
  {
    domain: Domain.WORKFLOW,
    name: 'decision',
    category: NodeCategory.GATEWAY,
    displayName: 'Decision Gateway',
    description: 'Exclusive gateway for decision branching',
    icon: 'git-branch',
    color: '#a855f7',
    parameters: [
      { name: 'defaultPath', type: 'string', required: false },
      { name: 'decisionTable', type: 'array', required: false },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', properties: { path: { type: 'string' }, data: { type: 'object' } } },
  },
  {
    domain: Domain.WORKFLOW,
    name: 'parallel_gateway',
    category: NodeCategory.GATEWAY,
    displayName: 'Parallel Gateway',
    description: 'Parallel split/join gateway',
    icon: 'git-fork',
    color: '#a855f7',
    parameters: [
      { name: 'type', type: 'enum', required: true, enumValues: ['split', 'join'] },
      { name: 'joinCondition', type: 'enum', required: false, enumValues: ['all', 'any', 'majority'] },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
  },
  {
    domain: Domain.WORKFLOW,
    name: 'timer_event',
    category: NodeCategory.EVENT,
    displayName: 'Timer Event',
    description: 'Triggers on time-based conditions',
    icon: 'timer',
    color: '#a855f7',
    parameters: [
      { name: 'type', type: 'enum', required: true, enumValues: ['delay', 'schedule', 'cycle'] },
      { name: 'duration', type: 'string', required: false, description: 'ISO 8601 duration' },
      { name: 'cron', type: 'string', required: false, description: 'Cron expression' },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', properties: { triggeredAt: { type: 'string' } } },
  },
  {
    domain: Domain.WORKFLOW,
    name: 'message_event',
    category: NodeCategory.EVENT,
    displayName: 'Message Event',
    description: 'Triggers on message/webhook receipt',
    icon: 'mail',
    color: '#a855f7',
    parameters: [
      { name: 'messageName', type: 'string', required: true },
      { name: 'correlationKey', type: 'string', required: false },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', properties: { message: { type: 'object' }, receivedAt: { type: 'string' } } },
  },
  {
    domain: Domain.WORKFLOW,
    name: 'subprocess',
    category: NodeCategory.CONTROL,
    displayName: 'Subprocess',
    description: 'Invokes another workflow as subprocess',
    icon: 'package',
    color: '#a855f7',
    parameters: [
      { name: 'workflowId', type: 'string', required: true },
      { name: 'inputMapping', type: 'object', required: false },
      { name: 'outputMapping', type: 'object', required: false },
      { name: 'async', type: 'boolean', required: false, default: false },
    ],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// INTEGRATION NODE TYPES
// ────────────────────────────────────────────────────────────────────────────

const INTEGRATION_NODE_TYPES = [
  {
    domain: Domain.INTEGRATION,
    name: 'http_request',
    category: NodeCategory.EXECUTOR,
    displayName: 'HTTP Request',
    description: 'Makes HTTP/REST API requests',
    icon: 'globe',
    color: '#f59e0b',
    parameters: [
      { name: 'url', type: 'string', required: true },
      { name: 'method', type: 'enum', required: false, enumValues: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'], default: 'GET' },
      { name: 'headers', type: 'object', required: false },
      { name: 'auth', type: 'object', required: false },
      { name: 'timeout', type: 'number', required: false, default: 30000 },
    ],
    inputSchema: { type: 'object', properties: { body: { type: 'object' }, params: { type: 'object' } } },
    outputSchema: { type: 'object', properties: { status: { type: 'number' }, data: { type: 'object' }, headers: { type: 'object' } } },
  },
  {
    domain: Domain.INTEGRATION,
    name: 'webhook_trigger',
    category: NodeCategory.EVENT,
    displayName: 'Webhook Trigger',
    description: 'Receives incoming webhooks',
    icon: 'webhook',
    color: '#f59e0b',
    parameters: [
      { name: 'path', type: 'string', required: true },
      { name: 'method', type: 'enum', required: false, enumValues: ['POST', 'PUT', 'GET'], default: 'POST' },
      { name: 'authentication', type: 'object', required: false },
    ],
    inputSchema: {},
    outputSchema: { type: 'object', properties: { body: { type: 'object' }, headers: { type: 'object' }, query: { type: 'object' } } },
  },
  {
    domain: Domain.INTEGRATION,
    name: 'database_query',
    category: NodeCategory.EXECUTOR,
    displayName: 'Database Query',
    description: 'Executes database queries',
    icon: 'database',
    color: '#f59e0b',
    parameters: [
      { name: 'connection', type: 'string', required: true },
      { name: 'query', type: 'string', required: true },
      { name: 'parameters', type: 'array', required: false },
    ],
    inputSchema: { type: 'object', properties: { parameters: { type: 'array' } } },
    outputSchema: { type: 'object', properties: { rows: { type: 'array' }, rowCount: { type: 'number' } } },
  },
  {
    domain: Domain.INTEGRATION,
    name: 'email_send',
    category: NodeCategory.EXECUTOR,
    displayName: 'Send Email',
    description: 'Sends email messages',
    icon: 'mail',
    color: '#f59e0b',
    parameters: [
      { name: 'to', type: 'string', required: true },
      { name: 'subject', type: 'string', required: true },
      { name: 'template', type: 'string', required: false },
      { name: 'attachments', type: 'array', required: false },
    ],
    inputSchema: { type: 'object', properties: { body: { type: 'string' }, templateData: { type: 'object' } } },
    outputSchema: { type: 'object', properties: { messageId: { type: 'string' }, sent: { type: 'boolean' } } },
  },
  {
    domain: Domain.INTEGRATION,
    name: 'file_storage',
    category: NodeCategory.EXECUTOR,
    displayName: 'File Storage',
    description: 'Read/write files to storage (S3, local, etc.)',
    icon: 'hard-drive',
    color: '#f59e0b',
    parameters: [
      { name: 'provider', type: 'enum', required: false, enumValues: ['local', 's3', 'azure', 'gcs'], default: 'local' },
      { name: 'operation', type: 'enum', required: true, enumValues: ['read', 'write', 'delete', 'list'] },
      { name: 'path', type: 'string', required: true },
    ],
    inputSchema: { type: 'object', properties: { content: { type: 'string' }, metadata: { type: 'object' } } },
    outputSchema: { type: 'object', properties: { content: { type: 'string' }, metadata: { type: 'object' }, url: { type: 'string' } } },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// INFRASTRUCTURE NODE TYPES (SubGraph system — proxy/meta nodes)
//
// These are system-generated infrastructure nodes that represent consolidated
// subgraph clusters. They are NOT business entities and MUST be excluded from
// graph analysis, clustering, community detection, and structural metrics.
//
// Labels in Memgraph: :SubGraph, :SubGraphPort, :CatalogEntry, :ConsolidationCheckpoint
// ────────────────────────────────────────────────────────────────────────────

const INFRASTRUCTURE_NODE_TYPES = [
  {
    name: 'subgraph',
    domain: Domain.INFRASTRUCTURE,
    displayName: 'SubGraph',
    description: 'Proxy node representing a consolidated cluster of business nodes. Created by the SubGraph extraction + consolidation pipeline. Contains member nodes via CONTAINS_MEMBER edges and boundary ports via PORT_OF edges. After consolidation, boundary edges are rewired through this node via SUBGRAPH_LINK.',
    category: NodeCategory.CONTROL,
    color: '#6b7280',
    icon: 'boxes',
    isInfrastructure: true,
    excludeFromAnalysis: true,
    parameters: [
      { name: 'nodeCount', type: 'number', required: false },
      { name: 'internalEdgeCount', type: 'number', required: false },
      { name: 'strategy', type: 'string', required: false },
      { name: 'coherenceScore', type: 'number', required: false },
      { name: 'status', type: 'enum', required: true, enumValues: ['extracted', 'consolidated', 'archived'] },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    name: 'subgraph_port',
    domain: Domain.INFRASTRUCTURE,
    displayName: 'SubGraph Port',
    description: 'Boundary port node representing a typed entry/exit point of a SubGraph. Bridges internal member nodes to external nodes via BRIDGES_TO and CONNECTS_INTERNAL edges. Direction can be IN, OUT, or BIDI.',
    category: NodeCategory.GATEWAY,
    color: '#6b7280',
    icon: 'plug-2',
    isInfrastructure: true,
    excludeFromAnalysis: true,
    parameters: [
      { name: 'direction', type: 'enum', required: true, enumValues: ['IN', 'OUT', 'BIDI'] },
      { name: 'externalNodeId', type: 'string', required: true },
      { name: 'externalEdgeType', type: 'string', required: true },
      { name: 'internalNodeId', type: 'string', required: true },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    name: 'graph_container',
    domain: Domain.INFRASTRUCTURE,
    displayName: 'Graph Container',
    description: 'Versioned snapshot container for the knowledge graph. Used for graph versioning and rollback.',
    category: NodeCategory.CONTROL,
    color: '#6b7280',
    icon: 'archive',
    isInfrastructure: true,
    excludeFromAnalysis: true,
    parameters: [
      { name: 'version', type: 'number', required: true },
      { name: 'snapshotAt', type: 'string', required: false },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    name: 'consolidation_checkpoint',
    domain: Domain.INFRASTRUCTURE,
    displayName: 'Consolidation Checkpoint',
    description: 'Rollback checkpoint created before subgraph consolidation operations. Stores pre-consolidation state for undo.',
    category: NodeCategory.CONTROL,
    color: '#6b7280',
    icon: 'save',
    isInfrastructure: true,
    excludeFromAnalysis: true,
    parameters: [
      { name: 'subgraphId', type: 'string', required: true },
      { name: 'createdAt', type: 'string', required: true },
    ],
    inputSchema: {},
    outputSchema: {},
  },
];

// ────────────────────────────────────────────────────────────────────────────
// FORMS NODE TYPES (CORE namespace)
// FormDefinition → FormSection → FormField → ValidationRule / DisplayCondition
// ────────────────────────────────────────────────────────────────────────────

const FORMS_NODE_TYPES = [
  {
    domain: Domain.FORMS,
    name: 'form_definition',
    category: NodeCategory.FORM,
    displayName: 'Form Definition',
    description: 'Root definition of a dynamic form. Contains sections, fields, validation rules, and display conditions. Stored in CORE namespace as canonical reusable specification.',
    icon: 'clipboard-list',
    color: '#14b8a6',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Form name' },
      { name: 'description', type: 'string', required: false, description: 'Form purpose' },
      { name: 'version', type: 'string', required: false, default: '1.0.0', description: 'Semantic version' },
      { name: 'status', type: 'enum', required: true, enumValues: ['DRAFT', 'ACTIVE', 'DEPRECATED'], default: 'DRAFT' },
      { name: 'namespace', type: 'string', required: false, default: 'CORE', description: 'KB namespace for this form' },
    ],
    inputSchema: {},
    outputSchema: { type: 'object', properties: { formId: { type: 'string' }, payloadSchema: { type: 'object' } } },
  },
  {
    domain: Domain.FORMS,
    name: 'form_section',
    category: NodeCategory.FORM,
    displayName: 'Form Section',
    description: 'A logical grouping of form fields within a FormDefinition. Supports ordering and collapsibility.',
    icon: 'layout-list',
    color: '#14b8a6',
    parameters: [
      { name: 'title', type: 'string', required: true, description: 'Section title' },
      { name: 'order', type: 'number', required: true, description: 'Display order' },
      { name: 'collapsible', type: 'boolean', required: false, default: false },
      { name: 'description', type: 'string', required: false },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FORMS,
    name: 'form_field',
    category: NodeCategory.FORM,
    displayName: 'Form Field',
    description: 'Individual input field within a form section. Supports text, number, select, multiselect, date, boolean, file, autocomplete, and table types.',
    icon: 'text-cursor-input',
    color: '#14b8a6',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Field identifier (used in payload)' },
      { name: 'type', type: 'enum', required: true, enumValues: ['text', 'number', 'select', 'multiselect', 'date', 'boolean', 'file', 'autocomplete', 'table'], description: 'Field input type' },
      { name: 'label', type: 'string', required: true, description: 'Display label' },
      { name: 'required', type: 'boolean', required: false, default: false },
      { name: 'placeholder', type: 'string', required: false },
      { name: 'defaultValue', type: 'string', required: false, description: 'Default value (JSON-encoded for complex types)' },
      { name: 'order', type: 'number', required: true, description: 'Display order within section' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FORMS,
    name: 'validation_rule',
    category: NodeCategory.FORM,
    displayName: 'Validation Rule',
    description: 'Validation constraint for a form field. Uses PredicateEvaluator (CEL-inspired) or JSONata engine for expression evaluation.',
    icon: 'shield-check',
    color: '#14b8a6',
    parameters: [
      { name: 'ruleType', type: 'enum', required: true, enumValues: ['REQUIRED', 'REGEX', 'RANGE', 'EXPRESSION', 'CUSTOM'], description: 'Type of validation' },
      { name: 'expression', type: 'string', required: false, description: 'Validation expression' },
      { name: 'engine', type: 'enum', required: false, enumValues: ['PREDICATE', 'JSONATA'], default: 'PREDICATE', description: 'Expression evaluation engine' },
      { name: 'message', type: 'string', required: true, description: 'Error message shown on validation failure' },
      { name: 'severity', type: 'enum', required: false, enumValues: ['ERROR', 'WARNING'], default: 'ERROR' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FORMS,
    name: 'display_condition',
    category: NodeCategory.FORM,
    displayName: 'Display Condition',
    description: 'Conditional visibility/state rule for a form field. Controls SHOW/HIDE/REQUIRED/DISABLED effects based on predicate expressions.',
    icon: 'eye',
    color: '#14b8a6',
    parameters: [
      { name: 'expression', type: 'string', required: true, description: 'Predicate expression (CEL-inspired syntax)' },
      { name: 'engine', type: 'enum', required: false, enumValues: ['PREDICATE'], default: 'PREDICATE' },
      { name: 'effect', type: 'enum', required: true, enumValues: ['SHOW', 'HIDE', 'REQUIRED', 'DISABLED'], description: 'Effect when condition is true' },
      { name: 'dependsOn', type: 'array', required: false, description: 'Field names this condition depends on (for watch-effect optimization)' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
];

// ────────────────────────────────────────────────────────────────────────────
// SIGNAL NODE TYPES (CORE namespace)
// SignalResolutionPolicy → Participant, TimeoutAction
// ────────────────────────────────────────────────────────────────────────────

const SIGNAL_NODE_TYPES = [
  {
    domain: Domain.SIGNALS,
    name: 'signal_resolution_policy',
    category: NodeCategory.SIGNAL,
    displayName: 'Signal Resolution Policy',
    description: 'Defines how an async signal is resolved: SINGLE (one response), QUORUM (n of m), VOTE (majority/weighted/unanimous with AI Society support), or FORCE (privileged override).',
    icon: 'bell-ring',
    color: '#f43f5e',
    parameters: [
      { name: 'mode', type: 'enum', required: true, enumValues: ['SINGLE', 'QUORUM', 'VOTE', 'FORCE'], description: 'Resolution mode' },
      { name: 'quorumRequired', type: 'number', required: false, description: 'For QUORUM: number of responses required' },
      { name: 'quorumStrategy', type: 'enum', required: false, enumValues: ['ANY_PAYLOAD', 'MERGE', 'FIRST_WINS'], description: 'How to combine QUORUM responses' },
      { name: 'voteOptions', type: 'string', required: false, description: 'JSON: vote options for VOTE mode [{value, label}]' },
      { name: 'resolutionStrategy', type: 'enum', required: false, enumValues: ['MAJORITY', 'WEIGHTED', 'UNANIMOUS', 'CONDORCET'], description: 'VOTE resolution strategy' },
      { name: 'tieBreak', type: 'enum', required: false, enumValues: ['ESCALATE', 'ABSTAIN', 'RANDOM', 'TIMEOUT_DEFAULT'], description: 'How to break ties in VOTE' },
      { name: 'voterTypes', type: 'enum', required: false, enumValues: ['HUMAN', 'AI_AGENT', 'MIXED'], default: 'HUMAN' },
    ],
    inputSchema: {},
    outputSchema: { type: 'object', properties: { resolvedPayload: { type: 'object' }, resolutionType: { type: 'string' } } },
  },
  {
    domain: Domain.SIGNALS,
    name: 'participant',
    category: NodeCategory.SIGNAL,
    displayName: 'Participant',
    description: 'An actor (human user, AI agent, agent pool, or external system) that participates in signal resolution.',
    icon: 'user-circle',
    color: '#f43f5e',
    parameters: [
      { name: 'type', type: 'enum', required: true, enumValues: ['HUMAN_USER', 'AI_AGENT', 'AI_AGENT_POOL', 'EXTERNAL_SYSTEM'], description: 'Participant type' },
      { name: 'refId', type: 'string', required: true, description: 'Reference ID (user_id, agent_definition_id, pool_id, or webhook_url)' },
      { name: 'weight', type: 'number', required: false, default: 1.0, description: 'Vote weight for WEIGHTED resolution' },
      { name: 'deadlineOverride', type: 'string', required: false, description: 'ISO datetime individual deadline' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.SIGNALS,
    name: 'timeout_action',
    category: NodeCategory.SIGNAL,
    displayName: 'Timeout Action',
    description: 'Defines what happens when a signal times out without sufficient responses.',
    icon: 'timer-off',
    color: '#f97316',
    parameters: [
      { name: 'action', type: 'enum', required: true, enumValues: ['CONTINUE_DEFAULT', 'FAIL', 'ESCALATE', 'SKIP'], description: 'Timeout action' },
      { name: 'defaultPayload', type: 'string', required: false, description: 'JSON: default payload used when action is CONTINUE_DEFAULT' },
      { name: 'escalateTo', type: 'string', required: false, description: 'Participant refId for ESCALATE action' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
];

// ────────────────────────────────────────────────────────────────────────────
// DATA SOURCE NODE TYPES (CORE/COMMON/PROJECT namespace)
// DataSourceDefinition → type-specific config
// ────────────────────────────────────────────────────────────────────────────

const DATASOURCE_NODE_TYPES = [
  {
    domain: Domain.INTEGRATION,
    name: 'data_source_definition',
    category: NodeCategory.DATASOURCE,
    displayName: 'Data Source Definition',
    description: 'Registry entry for a data source used by form fields (select, dropdown, autocomplete, table). Supports STATIC_LIST, MEMGRAPH_QUERY, REST_API, QDRANT_SEARCH, SQL_QUERY, and COMPUTED types. Namespace-aware with filtering.',
    icon: 'database',
    color: '#f59e0b',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Data source name' },
      { name: 'type', type: 'enum', required: true, enumValues: ['STATIC_LIST', 'MEMGRAPH_QUERY', 'REST_API', 'QDRANT_SEARCH', 'SQL_QUERY', 'COMPUTED'], description: 'Data source type' },
      { name: 'description', type: 'string', required: false },
      { name: 'cacheTtl', type: 'number', required: false, default: 300, description: 'Cache TTL in seconds' },
      { name: 'authRequired', type: 'boolean', required: false, default: false },
      { name: 'namespace', type: 'string', required: false, default: 'CORE', description: 'Scoped namespace (CORE, COMMON, or PROJECT:name)' },
      { name: 'status', type: 'enum', required: false, enumValues: ['ACTIVE', 'INACTIVE', 'DEPRECATED'], default: 'ACTIVE' },
    ],
    inputSchema: { type: 'object', properties: { params: { type: 'object' }, namespaceFilter: { type: 'array' } } },
    outputSchema: { type: 'object', properties: { items: { type: 'array', items: { type: 'object', properties: { value: {}, label: { type: 'string' }, metadata: { type: 'object' } } } } } },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// AGENT NODE TYPES (CORE namespace)
// AgentPoolDefinition → AgentDefinition
// ────────────────────────────────────────────────────────────────────────────

const AGENT_NODE_TYPES = [
  {
    domain: Domain.AGENTS,
    name: 'agent_pool_definition',
    category: NodeCategory.AGENT,
    displayName: 'Agent Pool Definition',
    description: 'Pool of AI agents for VOTE mode in AI Society voting. Contains AgentDefinition members with different roles, system prompts, and vote weights.',
    icon: 'users',
    color: '#8b5cf6',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Pool name' },
      { name: 'description', type: 'string', required: false },
      { name: 'minVoters', type: 'number', required: false, default: 1, description: 'Minimum agents to invoke' },
      { name: 'maxVoters', type: 'number', required: false, description: 'Maximum agents (all if null)' },
    ],
    inputSchema: {},
    outputSchema: { type: 'object', properties: { votes: { type: 'array' }, tally: { type: 'object' } } },
  },
  {
    domain: Domain.AGENTS,
    name: 'agent_definition',
    category: NodeCategory.AGENT,
    displayName: 'Agent Definition',
    description: 'Individual AI agent within an AgentPoolDefinition. Defines role, system prompt reference, vote weight, and domain specialization.',
    icon: 'bot',
    color: '#8b5cf6',
    parameters: [
      { name: 'role', type: 'string', required: true, description: 'Agent role (e.g., RiskAnalyst, ComplianceOfficer)' },
      { name: 'systemPromptRef', type: 'string', required: false, description: 'KB reference to agent system prompt' },
      { name: 'weight', type: 'number', required: false, default: 1.0, description: 'Vote weight in WEIGHTED resolution' },
      { name: 'specialization', type: 'string', required: false, description: 'JSON array of domain expertise tags' },
      { name: 'model', type: 'string', required: false, default: 'default', description: 'LLM model to use' },
    ],
    inputSchema: {},
    outputSchema: { type: 'object', properties: { vote: { type: 'string' }, confidence: { type: 'number' }, reasoning: { type: 'string' } } },
  },
];

// ────────────────────────────────────────────────────────────────────────────
// META NAMESPACE NODE TYPES (runtime records + audit)
// PendingSignal, SignalRecord, ContradictionRecord
// ────────────────────────────────────────────────────────────────────────────

const META_SIGNAL_NODE_TYPES = [
  {
    domain: Domain.META,
    name: 'pending_signal',
    category: NodeCategory.RUNTIME,
    displayName: 'Pending Signal',
    description: 'Active signal awaiting resolution. Tracks resume token, expiration, and accumulated votes. Primary state in Redis, significant events persisted to META namespace.',
    icon: 'hourglass',
    color: '#f43f5e',
    parameters: [
      { name: 'resumeToken', type: 'string', required: true, description: 'Unique resume token (UUID + HMAC)' },
      { name: 'executionId', type: 'string', required: true, description: 'Parent graph execution ID' },
      { name: 'nodeId', type: 'string', required: true, description: 'Node ID within the graph that is waiting' },
      { name: 'expiresAt', type: 'string', required: true, description: 'ISO datetime expiration' },
      { name: 'votesReceived', type: 'string', required: false, default: '[]', description: 'JSON array of received votes' },
      { name: 'status', type: 'enum', required: true, enumValues: ['WAITING', 'RESOLVED', 'EXPIRED', 'CANCELLED'], default: 'WAITING' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.META,
    name: 'signal_record',
    category: NodeCategory.AUDIT,
    displayName: 'Signal Record',
    description: 'Completed signal resolution audit record. Stores final payload, resolution type, vote tally, and timing.',
    icon: 'check-circle-2',
    color: '#22c55e',
    parameters: [
      { name: 'resumeToken', type: 'string', required: true },
      { name: 'resolvedAt', type: 'string', required: true, description: 'ISO datetime of resolution' },
      { name: 'resolutionType', type: 'enum', required: true, enumValues: ['SINGLE', 'QUORUM', 'VOTE', 'FORCE', 'TIMEOUT'] },
      { name: 'payloadSnapshot', type: 'string', required: false, description: 'JSON: final resolved payload' },
      { name: 'voteTally', type: 'string', required: false, description: 'JSON: vote breakdown' },
      { name: 'durationMs', type: 'number', required: false, description: 'Time from initiated to resolved (ms)' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.META,
    name: 'contradiction_record',
    category: NodeCategory.AUDIT,
    displayName: 'Contradiction Record',
    description: 'Audit record for contradictions detected during AI Society voting. Stores dynamic threshold, criticality/risk scores, and resolution outcome. Feed for APES learning.',
    icon: 'alert-triangle',
    color: '#f97316',
    parameters: [
      { name: 'voteId', type: 'string', required: true, description: 'Reference to the vote' },
      { name: 'thresholdUsed', type: 'number', required: true, description: 'Dynamic contradiction threshold (0.0-1.0)' },
      { name: 'criticalityScore', type: 'number', required: false, description: 'Task criticality score' },
      { name: 'riskScore', type: 'number', required: false, description: 'Risk assessment score' },
      { name: 'reasoning', type: 'string', required: false, description: 'LLM explanation of threshold calculation' },
      { name: 'actualContradiction', type: 'boolean', required: false, description: 'Was there a real contradiction' },
      { name: 'outcome', type: 'enum', required: false, enumValues: ['ESCALATED', 'RESOLVED_WEIGHTED', 'FORCED'], description: 'How contradiction was resolved' },
      { name: 'wasCorrect', type: 'boolean', required: false, description: 'Feedback: was the threshold appropriate (APES learning signal)' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
];

// ────────────────────────────────────────────────────────────────────────────
// FLOWDESK CONFIGURATION NODE TYPES (CORE namespace)
// Editable business rules extracted from hardcoded executor code
// ────────────────────────────────────────────────────────────────────────────

const FLOWDESK_CONFIG_NODE_TYPES = [
  {
    domain: Domain.FLOWDESK,
    name: 'sla_config',
    category: NodeCategory.CONFIGURATION,
    displayName: 'SLA Configuration',
    description: 'Service Level Agreement targets by priority. Defines response and resolution time targets in hours.',
    icon: 'timer',
    color: '#f97316',
    parameters: [
      { name: 'priority', type: 'enum', required: true, enumValues: ['critical', 'high', 'medium', 'low'] },
      { name: 'responseHours', type: 'number', required: true, description: 'Target response time (hours)' },
      { name: 'resolutionHours', type: 'number', required: true, description: 'Target resolution time (hours)' },
      { name: 'escalationHours', type: 'number', required: false, description: 'Auto-escalation threshold (hours)' },
      { name: 'businessHoursOnly', type: 'boolean', required: false, default: false },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FLOWDESK,
    name: 'queue_mapping',
    category: NodeCategory.CONFIGURATION,
    displayName: 'Queue Mapping',
    description: 'Maps service queue codes to handler teams for ticket routing.',
    icon: 'users',
    color: '#f97316',
    parameters: [
      { name: 'queueCode', type: 'string', required: true, description: 'Queue identifier (e.g., IT-HW, HR)' },
      { name: 'teamName', type: 'string', required: true, description: 'Handler team name' },
      { name: 'description', type: 'string', required: false },
      { name: 'isActive', type: 'boolean', required: false, default: true },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FLOWDESK,
    name: 'keyword_rule',
    category: NodeCategory.CONFIGURATION,
    displayName: 'Keyword Rule',
    description: 'L1 deterministic classification rule. Maps regex patterns to service categories with language support.',
    icon: 'text-search',
    color: '#f97316',
    parameters: [
      { name: 'pattern', type: 'string', required: true, description: 'Regex pattern for matching' },
      { name: 'category', type: 'string', required: true, description: 'Target service category code' },
      { name: 'language', type: 'string', required: false, default: 'en', description: 'Language code' },
      { name: 'priority', type: 'number', required: false, default: 0, description: 'Matching priority (higher = first)' },
      { name: 'isActive', type: 'boolean', required: false, default: true },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FLOWDESK,
    name: 'service_category',
    category: NodeCategory.CONFIGURATION,
    displayName: 'Service Category',
    description: 'Hierarchical service category for intent classification. Used by L1/L2/L3 classifiers.',
    icon: 'folder-tree',
    color: '#f97316',
    parameters: [
      { name: 'code', type: 'string', required: true, description: 'Category code (e.g., IT-HW-LAP)' },
      { name: 'name', type: 'string', required: true, description: 'Display name' },
      { name: 'parentCode', type: 'string', required: false, description: 'Parent category code (hierarchy)' },
      { name: 'level', type: 'number', required: false, description: 'Hierarchy depth (1=domain, 2=group, 3=service)' },
      { name: 'description', type: 'string', required: false },
      { name: 'slaHours', type: 'number', required: false, description: 'Default SLA hours for this category' },
      { name: 'requiresApproval', type: 'boolean', required: false, default: false },
      { name: 'isActive', type: 'boolean', required: false, default: true },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FLOWDESK,
    name: 'domain_code',
    category: NodeCategory.CONFIGURATION,
    displayName: 'Domain Code',
    description: 'Top-level service domain identifier (IT, HR, FAC, FIN, SEC, COM, LOG, LEG).',
    icon: 'tag',
    color: '#f97316',
    parameters: [
      { name: 'code', type: 'string', required: true, description: 'Domain code' },
      { name: 'name', type: 'string', required: true, description: 'Domain display name' },
      { name: 'description', type: 'string', required: false },
      { name: 'color', type: 'string', required: false, description: 'UI color for domain' },
      { name: 'isActive', type: 'boolean', required: false, default: true },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FLOWDESK,
    name: 'confidence_threshold',
    category: NodeCategory.CONFIGURATION,
    displayName: 'Confidence Threshold',
    description: 'Classification confidence thresholds for L1 (keyword), L2 (semantic), and L3 (LLM) classifiers.',
    icon: 'gauge',
    color: '#f97316',
    parameters: [
      { name: 'classifierLevel', type: 'enum', required: true, enumValues: ['L1', 'L2', 'L3'], description: 'Classifier level' },
      { name: 'highThreshold', type: 'number', required: true, description: 'Score >= this = high confidence' },
      { name: 'mediumThreshold', type: 'number', required: false, description: 'Score >= this = medium confidence' },
      { name: 'lowThreshold', type: 'number', required: false, description: 'Score below medium = low confidence' },
    ],
    inputSchema: {},
    outputSchema: {},
  },
  {
    domain: Domain.FLOWDESK,
    name: 'scope_rule',
    category: NodeCategory.CONFIGURATION,
    displayName: 'Scope Rule',
    description: 'Handler resolution scope priority rule (mission → regional → global).',
    icon: 'globe',
    color: '#f97316',
    parameters: [
      { name: 'scopeType', type: 'enum', required: true, enumValues: ['mission', 'regional', 'global'], description: 'Scope type' },
      { name: 'priority', type: 'number', required: true, description: 'Resolution priority (lower = preferred)' },
      { name: 'matchField', type: 'string', required: true, description: 'Field to match (e.g., dutyStation, region)' },
      { name: 'description', type: 'string', required: false },
    ],
    inputSchema: {},
    outputSchema: {},
  },
];

// ────────────────────────────────────────────────────────────────────────────
// MAIN SEED FUNCTION
// ────────────────────────────────────────────────────────────────────────────

async function seedGraphTypes() {
  console.log('Starting graph type seeding...\n');

  const typeService = getGraphTypeService();

  try {
    // Initialize schema
    console.log('Initializing schema...');
    await typeService.initialize();

    // Seed domains
    console.log('\nSeeding domains...');
    for (const domain of DOMAINS) {
      try {
        await typeService.createDomain(domain);
        console.log(`  ✓ ${domain.displayName}`);
      } catch (e) {
        console.log(`  ⚠ ${domain.displayName}: ${e.message}`);
      }
    }

    // Seed edge types
    console.log('\nSeeding edge types...');
    for (const edgeType of EDGE_TYPES) {
      try {
        await typeService.createEdgeType(edgeType);
        console.log(`  ✓ ${edgeType.displayName}`);
      } catch (e) {
        console.log(`  ⚠ ${edgeType.displayName}: ${e.message}`);
      }
    }

    // Seed node types
    const allNodeTypes = [
      ...COMMON_NODE_TYPES,
      ...INGESTION_NODE_TYPES,
      ...RAG_NODE_TYPES,
      ...WORKFLOW_NODE_TYPES,
      ...INTEGRATION_NODE_TYPES,
      ...INFRASTRUCTURE_NODE_TYPES,
      // Async Signal System + FormBuilder
      ...FORMS_NODE_TYPES,
      ...SIGNAL_NODE_TYPES,
      ...DATASOURCE_NODE_TYPES,
      ...AGENT_NODE_TYPES,
      ...META_SIGNAL_NODE_TYPES,
      // FlowDesk configuration
      ...FLOWDESK_CONFIG_NODE_TYPES,
    ];

    console.log('\nSeeding node types...');
    for (const nodeType of allNodeTypes) {
      try {
        await typeService.createNodeType(nodeType);
        console.log(`  ✓ ${nodeType.domain}.${nodeType.name}`);
      } catch (e) {
        console.log(`  ⚠ ${nodeType.domain}.${nodeType.name}: ${e.message}`);
      }
    }

    // Set up compatibility relationships
    console.log('\nSetting up compatibility relationships...');

    // Ingestion pipeline compatibility
    const ingestionFlow = [
      ['ingestion.parse_document', 'ingestion.sanitize'],
      ['ingestion.sanitize', 'ingestion.chunk_text'],
      ['ingestion.chunk_text', 'ingestion.extract_entities'],
      ['ingestion.extract_entities', 'ingestion.write_vector'],
      ['ingestion.extract_entities', 'ingestion.write_graph'],
      ['ingestion.chunk_text', 'ingestion.write_vector'],
    ];

    for (const [source, target] of ingestionFlow) {
      try {
        await typeService.setCompatibility(source, target, EdgeType.DATA_FLOW);
        console.log(`  ✓ ${source} → ${target}`);
      } catch (e) {
        console.log(`  ⚠ ${source} → ${target}: ${e.message}`);
      }
    }

    // RAG pipeline compatibility
    const ragFlow = [
      ['rag.expand_query', 'rag.vector_search'],
      ['rag.expand_query', 'rag.hybrid_search'],
      ['rag.vector_search', 'rag.rerank'],
      ['rag.graph_search', 'rag.rerank'],
      ['rag.hybrid_search', 'rag.rerank'],
      ['rag.rerank', 'rag.assemble_context'],
      ['rag.assemble_context', 'rag.generate_response'],
      ['rag.generate_response', 'rag.evaluate_response'],
    ];

    for (const [source, target] of ragFlow) {
      try {
        await typeService.setCompatibility(source, target, EdgeType.DATA_FLOW);
        console.log(`  ✓ ${source} → ${target}`);
      } catch (e) {
        console.log(`  ⚠ ${source} → ${target}: ${e.message}`);
      }
    }

    // FormBuilder pipeline compatibility
    console.log('\nSetting up FormBuilder compatibility...');
    const formFlow = [
      ['forms.form_definition', 'forms.form_section', EdgeType.HAS_SECTION],
      ['forms.form_section', 'forms.form_field', EdgeType.HAS_FIELD],
      ['forms.form_field', 'forms.validation_rule', EdgeType.HAS_VALIDATION],
      ['forms.form_field', 'forms.display_condition', EdgeType.HAS_DISPLAY_CONDITION],
      ['forms.form_field', 'integration.data_source_definition', EdgeType.USES_DATA_SOURCE],
      ['forms.form_definition', 'signals.signal_resolution_policy', EdgeType.HAS_RESOLUTION_POLICY],
    ];

    for (const [source, target, edgeType] of formFlow) {
      try {
        await typeService.setCompatibility(source, target, edgeType);
        console.log(`  ✓ ${source} → ${target} [${edgeType}]`);
      } catch (e) {
        console.log(`  ⚠ ${source} → ${target}: ${e.message}`);
      }
    }

    // Signal resolution compatibility
    console.log('\nSetting up Signal compatibility...');
    const signalFlow = [
      ['signals.signal_resolution_policy', 'signals.participant', EdgeType.HAS_PARTICIPANT],
      ['signals.signal_resolution_policy', 'signals.timeout_action', EdgeType.ON_TIMEOUT],
      ['agents.agent_pool_definition', 'agents.agent_definition', EdgeType.HAS_MEMBER],
      ['meta.signal_record', 'signals.participant', EdgeType.RESOLVED_BY],
      ['meta.pending_signal', 'forms.form_definition', EdgeType.WAITING_ON],
    ];

    for (const [source, target, edgeType] of signalFlow) {
      try {
        await typeService.setCompatibility(source, target, edgeType);
        console.log(`  ✓ ${source} → ${target} [${edgeType}]`);
      } catch (e) {
        console.log(`  ⚠ ${source} → ${target}: ${e.message}`);
      }
    }

    console.log('\n✅ Seeding complete!');

    // Print summary
    const nodeTypes = await typeService.listNodeTypes();
    const edgeTypes = await typeService.listEdgeTypes();
    const domains = await typeService.listDomains();

    console.log('\nSummary:');
    console.log(`  Domains: ${domains.length}`);
    console.log(`  Node Types: ${nodeTypes.length}`);
    console.log(`  Edge Types: ${edgeTypes.length}`);

  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  seedGraphTypes()
    .then(() => process.exit(0))
    .catch(e => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { seedGraphTypes };
