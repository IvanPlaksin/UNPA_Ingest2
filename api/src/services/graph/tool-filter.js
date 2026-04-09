/**
 * Dynamic Tool Filter Service
 * Filters MCP tools based on task domain/intent to reduce LLM context and improve generation quality
 *
 * Part of the Graph Generation Enhancement pipeline:
 * [Task] → [Tool Filter] → [LLM Generation] → [Graph Validator] → [Output]
 *
 * Key insight: Sending all 85+ tools to Claude wastes context and causes hallucinations.
 * By filtering to ~12-20 relevant tools, we dramatically improve generation accuracy.
 */

/**
 * Capability to tool prefix mapping
 * Maps abstract capabilities to concrete MCP tool prefixes
 */
const DOMAIN_TOOL_MAP = {
  // Core text processing
  text_processing: [
    'text.',
    'ingestion.sanitize',
    'ingestion.chunk',
    'ingestion.normalize'
  ],

  // Entity and information extraction
  entity_extraction: [
    'extraction.',
    'ingestion.extract_',
    'ai.extract'
  ],

  // Classification and categorization
  classification: [
    'ai.classify',
    'ai.gnn_classify',
    'ingestion.classify',
    'ai.categorize'
  ],

  // Vector embeddings and semantic search
  vector_search: [
    'vector.',
    'rag.vector_search',
    'rag.embed',
    'ai.embed'
  ],

  // Graph database operations
  graph_ops: [
    'graph.',
    'rag.graph_search',
    'knowledge.',
    'cypher.'
  ],

  // AI/LLM generation capabilities
  ai_generation: [
    'ai.generate',
    'ai.chat',
    'ai.complete',
    'ai.summarize',
    'ai.analyze',
    'rag.generate',
    'ai.explain'
  ],

  // Data transformation and flow
  data_flow: [
    'flow.',
    'transform.',
    'filter.',
    'map.',
    'control.',
    'pattern.'
  ],

  // GNN-specific analysis
  gnn_analysis: [
    'ai.gnn_',
    'gnn.',
    'graph.analyze'
  ],

  // HTTP and external API calls
  http: [
    'http.',
    'fetch.',
    'api.',
    'webhook.'
  ],

  // File and IO operations
  io: [
    'io.',
    'file.',
    'storage.',
    'export.'
  ],

  // Meta and introspection
  meta: [
    'meta.',
    'introspect.',
    'validate.'
  ],

  // BackLog task management
  backlog: [
    'backlog.',
    'backlog_'
  ],

  // Graph Catalog operations
  catalog: [
    'catalog.',
    'catalog_'
  ]
};

/**
 * Keyword to domain mapping
 * Maps task keywords (Russian + English) to relevant capability domains
 */
const KEYWORD_DOMAINS = {
  // Support and customer service
  'тикет|ticket|support|жалоб|обращен|клиент|customer|helpdesk|поддержк': [
    'text_processing',
    'entity_extraction',
    'classification',
    'ai_generation',
    'vector_search'
  ],

  // Document processing
  'document|документ|report|отчёт|invoice|счёт|contract|договор|pdf|word': [
    'text_processing',
    'entity_extraction',
    'ai_generation',
    'io',
    'classification'
  ],

  // Code analysis and development
  'code|код|review|analyz|анализ|уязвим|vulnerab|bug|баг|refactor|рефактор|программ': [
    'text_processing',
    'entity_extraction',
    'graph_ops',
    'gnn_analysis',
    'ai_generation'
  ],

  // Data ETL and transformation
  'data|данн|etl|transform|преобраз|migrat|миграц|pipeline|пайплайн|load|загруз': [
    'data_flow',
    'io',
    'graph_ops',
    'vector_search',
    'text_processing'
  ],

  // Search and retrieval
  'search|поиск|найти|find|query|запрос|retriev|получ|look|искать': [
    'vector_search',
    'graph_ops',
    'ai_generation',
    'text_processing'
  ],

  // Knowledge graph operations
  'граф|graph|знани|knowledge|связ|link|relation|отношен|entity|сущност|ontolog': [
    'graph_ops',
    'gnn_analysis',
    'entity_extraction',
    'vector_search'
  ],

  // Classification tasks
  'классифик|classif|категор|categ|тип|type|sort|сортир|group|групп|label|метк': [
    'classification',
    'gnn_analysis',
    'ai_generation',
    'vector_search'
  ],

  // Vector and similarity
  'embed|вектор|vector|similar|похож|семантик|semantic|meaning|смысл': [
    'vector_search',
    'ai_generation',
    'text_processing'
  ],

  // Summarization
  'сумм|summar|кратк|brief|tldr|abstract|выжимк|squeeze|compress|сжат': [
    'ai_generation',
    'text_processing',
    'entity_extraction'
  ],

  // RAG patterns
  'rag|retrieval|augment|контекст|context|ground|обоснов': [
    'vector_search',
    'graph_ops',
    'ai_generation'
  ],

  // Workflow and automation
  'workflow|автомат|automat|процесс|process|pipeline|сценар|scenario|flow|поток': [
    'data_flow',
    'ai_generation',
    'classification'
  ],

  // API and integration
  'api|интеграц|integrat|webhook|http|rest|endpoint|сервис|service': [
    'http',
    'data_flow',
    'ai_generation'
  ],

  // BackLog and task management
  'backlog|бэклог|беклог|task|задач|задани|todo|тикет|ticket|sprint|спринт|plan|планир|priorit|приоритет|status|статус|execut|выполн|завершить|создать задач': [
    'backlog',
    'graph_ops',
    'ai_generation'
  ],

  // Graph Catalog operations
  'catalog|каталог|template|шаблон|reuse|переиспольз|clone|клониров|similar|похож|library|библиотек': [
    'catalog',
    'graph_ops',
    'ai_generation'
  ]
};

/**
 * Default domains that are always included
 * These provide essential primitives for any graph
 */
const DEFAULT_DOMAINS = [
  'ai_generation',  // LLM is always useful
  'data_flow',      // Basic control flow primitives
  'meta'            // Introspection capabilities
];

/**
 * Filter tools based on task description
 * @param {string} task - Task description (natural language)
 * @param {Array} allTools - All available MCP tools
 * @param {Object} options - Filtering options
 * @returns {Object} - { tools: [], domains: [], reduction: string, stats: {} }
 */
function filterToolsForTask(task, allTools, options = {}) {
  const {
    minTools = 5,           // Minimum tools to return
    maxTools = 30,          // Maximum tools to return
    includeDefaults = true, // Include default domains
    customDomains = []      // Additional domains to include
  } = options;

  if (!task || typeof task !== 'string') {
    return {
      tools: allTools,
      domains: [],
      reduction: '0% reduction (no task provided)',
      stats: { filtered: allTools.length, total: allTools.length }
    };
  }

  const taskLower = task.toLowerCase();
  const matchedDomains = new Set();

  // Match keywords to domains
  for (const [pattern, domains] of Object.entries(KEYWORD_DOMAINS)) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(taskLower)) {
      domains.forEach(d => matchedDomains.add(d));
    }
  }

  // Add default domains
  if (includeDefaults) {
    DEFAULT_DOMAINS.forEach(d => matchedDomains.add(d));
  }

  // Add custom domains
  customDomains.forEach(d => matchedDomains.add(d));

  // If no domains matched, use a sensible default set
  if (matchedDomains.size === 0) {
    matchedDomains.add('text_processing');
    matchedDomains.add('ai_generation');
    matchedDomains.add('data_flow');
  }

  // Resolve domains to tool prefixes
  const allowedPrefixes = new Set();
  for (const domain of matchedDomains) {
    const prefixes = DOMAIN_TOOL_MAP[domain] || [];
    prefixes.forEach(p => allowedPrefixes.add(p));
  }

  // Filter tools by prefix match
  const filtered = allTools.filter(tool => {
    const toolId = tool.name || tool.id || '';
    return [...allowedPrefixes].some(prefix => toolId.startsWith(prefix));
  });

  // Ensure minimum tools
  let finalTools = filtered;
  if (filtered.length < minTools && allTools.length > minTools) {
    // Add more tools from related domains
    const additionalTools = allTools.filter(t => !filtered.includes(t));
    const needed = minTools - filtered.length;
    finalTools = [...filtered, ...additionalTools.slice(0, needed)];
  }

  // Enforce maximum tools
  if (finalTools.length > maxTools) {
    // Prioritize tools from core domains
    const coreDomains = ['ai_generation', 'text_processing', 'data_flow'];
    const corePrefixes = coreDomains.flatMap(d => DOMAIN_TOOL_MAP[d] || []);

    const coreTools = finalTools.filter(t => {
      const id = t.name || t.id || '';
      return corePrefixes.some(p => id.startsWith(p));
    });

    const otherTools = finalTools.filter(t => !coreTools.includes(t));
    const available = maxTools - coreTools.length;
    finalTools = [...coreTools, ...otherTools.slice(0, Math.max(0, available))];
  }

  // Calculate stats
  const reductionPercent = allTools.length > 0
    ? Math.round((1 - finalTools.length / allTools.length) * 100)
    : 0;

  return {
    tools: finalTools,
    domains: [...matchedDomains],
    reduction: `${finalTools.length}/${allTools.length} tools (${reductionPercent}% reduction)`,
    stats: {
      filtered: finalTools.length,
      total: allTools.length,
      reductionPercent,
      matchedDomains: matchedDomains.size,
      prefixCount: allowedPrefixes.size
    }
  };
}

/**
 * Classify task intent to determine primary domain
 * @param {string} task - Task description
 * @returns {Object} - { primaryDomain, confidence, allDomains }
 */
function classifyTaskIntent(task) {
  if (!task || typeof task !== 'string') {
    return { primaryDomain: 'unknown', confidence: 0, allDomains: [] };
  }

  const taskLower = task.toLowerCase();
  const domainScores = new Map();

  // Score each domain based on keyword matches
  for (const [pattern, domains] of Object.entries(KEYWORD_DOMAINS)) {
    const regex = new RegExp(pattern, 'gi');
    const matches = taskLower.match(regex) || [];
    const score = matches.length;

    if (score > 0) {
      for (const domain of domains) {
        const current = domainScores.get(domain) || 0;
        domainScores.set(domain, current + score);
      }
    }
  }

  // Sort by score
  const sorted = [...domainScores.entries()].sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) {
    return { primaryDomain: 'generic', confidence: 0.3, allDomains: ['text_processing', 'ai_generation'] };
  }

  const topScore = sorted[0][1];
  const confidence = Math.min(1, topScore / 5); // Normalize to 0-1

  return {
    primaryDomain: sorted[0][0],
    confidence,
    allDomains: sorted.slice(0, 5).map(([domain]) => domain),
    scores: Object.fromEntries(sorted.slice(0, 10))
  };
}

/**
 * Get tool prefixes for a specific domain
 * @param {string} domain - Domain name
 * @returns {Array} - Tool prefixes
 */
function getToolPrefixesForDomain(domain) {
  return DOMAIN_TOOL_MAP[domain] || [];
}

/**
 * Get all available domains
 * @returns {Array} - Domain names
 */
function getAvailableDomains() {
  return Object.keys(DOMAIN_TOOL_MAP);
}

/**
 * Create a tool filter function with preset options
 * @param {Object} options - Default options
 * @returns {Function} - Configured filter function
 */
function createToolFilter(options = {}) {
  return (task, allTools) => filterToolsForTask(task, allTools, options);
}

module.exports = {
  filterToolsForTask,
  classifyTaskIntent,
  getToolPrefixesForDomain,
  getAvailableDomains,
  createToolFilter,
  // Export mappings for testing/customization
  DOMAIN_TOOL_MAP,
  KEYWORD_DOMAINS,
  DEFAULT_DOMAINS
};
