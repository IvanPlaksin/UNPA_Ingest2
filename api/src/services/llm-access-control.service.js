'use strict';

/**
 * LLM Access Control Service — Matrix Edition
 *
 * Controls LLM access at two levels:
 *
 *  1. PROVIDER level  — key: `provider:{name}`
 *     Blocks the entire provider for ALL callers.
 *     Names: anthropic | azure | gemini | ollama
 *
 *  2. SERVICE level  — key: `svc:{group}:{provider}`
 *     Blocks a specific service group from using a specific provider.
 *     Even if the provider is globally enabled, this blocks just that service.
 *
 * Service groups:
 *   controllers         HTTP controllers (assistant, chat, GXE, MSSQL)
 *   aopeg_executors     AOPEG ai-agent, ai-generate, transform executors
 *   aopeg_dialogue      Dialogue summarize/extract executors + AI services
 *   aopeg_rag           RAG executor
 *   agent_service       AnthropicAgentService (backlog, assistant agent)
 *   catalog_assistant   Catalog AI assistant
 *   workspace_agent     WorkSpace agent + extraction pipeline
 *   graph_services      ai-layout, coherence, anomaly-gate, subgraph, task-planner
 *   extraction_pipeline Document AI extraction, entity extraction steps
 *   preprocessing       Coreference resolver, sentence decomposer
 *   mcp_tools           MCP AI tools (ChatTool, CompleteTool)
 *   graph_builder       Graph builder agent service
 *   structured_output   Structured output service
 *   retrieval           Query expansion / retrieval services
 *   flowdesk            FlowDesk instance (utterance generation)
 */

const REDIS_KEY = 'llm_access_control:state_v2';

// ── Provider definitions ──────────────────────────────────────────────────────

const PROVIDERS = [
  { id: 'anthropic', label: 'Anthropic Claude',  color: '#e97333' },
  { id: 'azure',     label: 'Azure AI Foundry',  color: '#0078d4' },
  { id: 'gemini',    label: 'Google Gemini',      color: '#4285f4' },
  { id: 'ollama',    label: 'Ollama (local)',      color: '#34d399' },
];

// ── Service group definitions ─────────────────────────────────────────────────

const SERVICE_GROUPS = [
  {
    id: 'controllers',
    label: 'HTTP Controllers',
    description: 'assistant, chat, GXE, MSSQL API controllers',
    files: ['controllers/assistant.controller.js', 'controllers/chat.controller.js', 'controllers/gxe.controller.js', 'controllers/mssql-assistant.controller.js', 'controllers/mssql-import.controller.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'aopeg_executors',
    label: 'AOPEG AI Executors',
    description: 'ai-agent, ai-generate, transform.executor nodes in GXE graphs',
    files: ['core/aopeg/plugins/common/executors/ai-agent.executor.js', 'core/aopeg/plugins/common/executors/ai-generate.executor.js', 'core/aopeg/plugins/common/executors/transform.executor.js'],
    providers: ['anthropic', 'azure', 'gemini', 'ollama'],
  },
  {
    id: 'aopeg_dialogue',
    label: 'AOPEG Dialogue Executors',
    description: 'dialogue.summarize, extract_goals, extract_decisions, extract_entities, ai-search, open-tasks-report',
    files: ['core/aopeg/plugins/dialogue/executors/dialogue.summarize.js', 'core/aopeg/plugins/dialogue/executors/dialogue.extract_goals.js', 'core/aopeg/plugins/dialogue/executors/dialogue.extract_decisions.js', 'core/aopeg/plugins/dialogue/executors/dialogue.extract_entities.js', 'core/aopeg/plugins/dialogue/services/dialogue.ai-search.js', 'core/aopeg/plugins/dialogue/services/dialogue.open-tasks-report.js'],
    providers: ['anthropic', 'azure', 'gemini', 'ollama'],
  },
  {
    id: 'aopeg_rag',
    label: 'AOPEG RAG Executor',
    description: 'Retrieval-augmented generation executor in AOPEG plugin system',
    files: ['core/aopeg/plugins/rag/index.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'agent_service',
    label: 'Agent Service',
    description: 'AnthropicAgentService — agentic loop for BackLog, GXE assistant, monitor',
    files: ['services/agents/anthropic-agent.service.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'catalog_assistant',
    label: 'Catalog Assistant',
    description: 'AI assistant for graph catalog browsing and suggestions',
    files: ['services/catalog/catalog-assistant.service.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'workspace_agent',
    label: 'WorkSpace Agent',
    description: 'workspace-agent.service + workspace extraction pipeline (entity/relation extractors)',
    files: ['services/workspace/workspace-agent.service.js', 'services/workspace/source.service.js', 'services/workspace/extraction/entity.extractor.js', 'services/workspace/extraction/extraction-pipeline.js'],
    providers: ['anthropic', 'azure', 'gemini', 'ollama'],
  },
  {
    id: 'graph_services',
    label: 'Graph Services',
    description: 'ai-layout, coherence-evaluator, pipeline-anomaly-gate, subgraph-validator, task-planner',
    files: ['services/graph/ai-layout.service.js', 'services/graph/coherence-evaluator.js', 'services/graph/pipeline-anomaly-gate.js', 'services/graph/subgraph-validator.js', 'services/graph/task-planner.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'extraction_pipeline',
    label: 'Extraction Pipeline',
    description: 'Document AI extraction + entity extraction pipeline steps',
    files: ['services/extraction/pipeline-steps/03-extract-entities.step.js', 'services/knowledge/document-ai-extraction.service.js'],
    providers: ['anthropic', 'azure', 'gemini', 'ollama'],
  },
  {
    id: 'preprocessing',
    label: 'Preprocessing Services',
    description: 'Coreference resolver + sentence decomposer',
    files: ['services/preprocessing/coreference-resolver.js', 'services/preprocessing/sentence-decomposer.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'mcp_tools',
    label: 'MCP AI Tools',
    description: 'ChatTool and CompleteTool — MCP protocol AI endpoints',
    files: ['mcp/tools/ai/ChatTool.js', 'mcp/tools/ai/CompleteTool.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'graph_builder',
    label: 'Graph Builder Agent',
    description: 'AI agent service that builds AOPEG graphs from natural language',
    files: ['services/ai/graph-builder-agent.service.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'structured_output',
    label: 'Structured Output Service',
    description: 'JSON schema-validated LLM output service used by many consumers',
    files: ['services/ai/structured-output.js'],
    providers: ['anthropic', 'azure'],
  },
  {
    id: 'retrieval',
    label: 'Retrieval / Query Expansion',
    description: 'Query expansion service for knowledge retrieval',
    files: ['services/retrieval/query-expansion.service.js'],
    providers: ['anthropic', 'azure', 'gemini', 'ollama'],
  },
  {
    id: 'flowdesk',
    label: 'FlowDesk Instance',
    description: 'FlowDesk utterance generation and classification (client instance)',
    files: ['instances/flowdesk/services/generate-utterances.js'],
    providers: ['anthropic', 'azure', 'gemini', 'ollama'],
  },
];

// ── Build key registry ────────────────────────────────────────────────────────

// Provider-level keys
const PROVIDER_ENTRIES = PROVIDERS.map(p => ({
  key: `provider:${p.id}`,
  level: 'provider',
  providerId: p.id,
  label: `${p.label} (global)`,
  description: `Master switch — disabling blocks ALL services from using ${p.label}.`,
}));

// Service × Provider keys
const SERVICE_ENTRIES = [];
for (const grp of SERVICE_GROUPS) {
  for (const pId of grp.providers) {
    SERVICE_ENTRIES.push({
      key: `svc:${grp.id}:${pId}`,
      level: 'service',
      groupId: grp.id,
      providerId: pId,
    });
  }
}

const ALL_KEYS = [
  ...PROVIDER_ENTRIES.map(e => e.key),
  ...SERVICE_ENTRIES.map(e => e.key),
];

// ── In-memory state ───────────────────────────────────────────────────────────

const _state = new Map(ALL_KEYS.map(k => [k, true]));

// ── Redis persistence ─────────────────────────────────────────────────────────

let _redis = null;
function _getRedis() {
  if (!_redis) {
    try { _redis = require('./redis.service'); } catch (_) {}
  }
  return _redis;
}

async function _loadFromRedis() {
  const redis = _getRedis();
  if (!redis) return;
  try {
    const raw = await redis.get(REDIS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const [key, val] of Object.entries(saved)) {
        if (_state.has(key)) _state.set(key, !!val);
      }
    }
  } catch (err) {
    console.warn('[LLMAccessControl] Could not load from Redis:', err.message);
  }
}

function _persistToRedis() {
  const redis = _getRedis();
  if (!redis) return;
  const obj = Object.fromEntries(_state);
  redis.set(REDIS_KEY, JSON.stringify(obj)).catch(err =>
    console.warn('[LLMAccessControl] Could not persist to Redis:', err.message)
  );
}

_loadFromRedis().catch(() => {});

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if the given key is allowed.
 * Unknown keys default to allowed=true.
 */
function isAllowed(key) {
  return _state.get(key) !== false;
}

/**
 * Check if a service can use a provider.
 * Checks BOTH provider-level and service-level.
 * @param {string} groupId  — service group id (e.g. 'agent_service')
 * @param {string} providerId — provider id (e.g. 'anthropic')
 * @returns {boolean}
 */
function isServiceAllowed(groupId, providerId) {
  if (!isAllowed(`provider:${providerId}`)) return false;
  const svcKey = `svc:${groupId}:${providerId}`;
  if (_state.has(svcKey) && !_state.get(svcKey)) return false;
  return true;
}

/**
 * Set enabled state for a key. Persists to Redis.
 */
function setAccess(key, enabled) {
  if (!_state.has(key)) {
    throw new Error(`Unknown LLM access key: ${key}`);
  }
  _state.set(key, !!enabled);
  _persistToRedis();
  console.log(`[LLMAccessControl] ${key} → ${enabled ? 'ENABLED' : 'DISABLED'}`);
  return !!enabled;
}

/**
 * Get state for API / frontend.
 * Returns provider entries, service groups, and the full state map.
 */
function getState() {
  return {
    providers: PROVIDERS,
    serviceGroups: SERVICE_GROUPS.map(grp => ({
      ...grp,
      providerStates: Object.fromEntries(
        grp.providers.map(pId => [pId, _state.get(`svc:${grp.id}:${pId}`) !== false])
      ),
    })),
    providerGlobals: Object.fromEntries(
      PROVIDERS.map(p => [p.id, _state.get(`provider:${p.id}`) !== false])
    ),
    state: Object.fromEntries(_state),
  };
}

/**
 * Reset all keys to enabled=true.
 */
function resetAll() {
  for (const key of _state.keys()) _state.set(key, true);
  _persistToRedis();
}

/**
 * Create a scoped LLM provider proxy that automatically passes caller identity.
 * Drop-in replacement for getLLMProvider() in service files.
 *
 * @param {string} callerGroupId  — service group id (e.g. 'agent_service')
 * @returns {{ chat, stream, type, models, resolveModel }}
 */
function getScopedProvider(callerGroupId) {
  // Lazy require to avoid circular dep at module load time
  function _getInstance() {
    return require('./llm/LLMProviderService').getInstance();
  }
  return {
    get type()   { return _getInstance().type; },
    get models() { return _getInstance().models; },
    resolveModel(alias) { return _getInstance().resolveModel(alias); },
    chat(messages, opts = {}) {
      return _getInstance().chat(messages, { ...opts, caller: callerGroupId });
    },
    stream(messages, opts = {}) {
      return _getInstance().stream(messages, { ...opts, caller: callerGroupId });
    },
  };
}

module.exports = {
  isAllowed,
  isServiceAllowed,
  setAccess,
  getState,
  resetAll,
  getScopedProvider,
  PROVIDERS,
  SERVICE_GROUPS,
};
