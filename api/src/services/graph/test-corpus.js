/**
 * Test Corpus for Graph Quality Metrics
 *
 * Contains standardized test scenarios with expected properties
 * for evaluating graph generation quality.
 *
 * Each test case includes:
 * - id: Unique identifier
 * - prompt: Task description (RU/EN)
 * - expectedProperties: Expected graph characteristics
 * - category: Test category for grouping
 * - complexity: Expected complexity level
 */

const TEST_CORPUS = [
  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT PROCESSING SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'TC01_document_ingestion',
    category: 'document_processing',
    complexity: 'medium',
    prompt: 'Создай pipeline для обработки документа: очистка текста, определение языка, разбиение на чанки, извлечение сущностей, сохранение в векторную и графовую базу',
    promptEn: 'Create a document processing pipeline: text cleaning, language detection, chunking, entity extraction, store in vector and graph databases',
    expectedProperties: {
      minNodes: 7,
      maxNodes: 12,
      requiredToolDomains: ['text_processing', 'entity_extraction', 'vector_search', 'graph_ops'],
      expectedParallel: false,
      expectedDepth: [5, 9],
      expectedNodeKinds: ['input', 'executor', 'ai', 'output'],
      description: 'Sequential document processing pipeline with storage'
    }
  },

  {
    id: 'TC02_rag_query',
    category: 'retrieval',
    complexity: 'high',
    prompt: 'Build a RAG query flow: classify user question, expand query with synonyms, run parallel vector and graph search, fuse results with RRF, rerank, generate answer',
    promptRu: 'Построй RAG запрос: классифицируй вопрос, расширь синонимами, параллельный поиск по вектору и графу, объедини RRF, переранжируй, сгенерируй ответ',
    expectedProperties: {
      minNodes: 7,
      maxNodes: 11,
      requiredToolDomains: ['vector_search', 'graph_ops', 'ai_generation', 'classification'],
      expectedParallel: true,
      expectedDepth: [5, 8],
      expectedNodeKinds: ['input', 'ai', 'executor', 'condition', 'output'],
      description: 'RAG with parallel retrieval and fusion'
    }
  },

  {
    id: 'TC03_ticket_routing',
    category: 'workflow',
    complexity: 'medium',
    prompt: 'Обработай тикет поддержки: извлеки суть обращения, определи категорию, оцени приоритет, назначь ответственную группу, создай work order, отправь уведомление',
    promptEn: 'Process support ticket: extract issue essence, determine category, assess priority, assign responsible group, create work order, send notification',
    expectedProperties: {
      minNodes: 7,
      maxNodes: 12,
      requiredToolDomains: ['entity_extraction', 'classification', 'ai_generation'],
      expectedParallel: false,
      expectedDepth: [6, 10],
      expectedNodeKinds: ['input', 'ai', 'executor', 'output'],
      description: 'Ticket processing workflow with classification'
    }
  },

  {
    id: 'TC04_data_quality',
    category: 'validation',
    complexity: 'low',
    prompt: 'Validate incoming data: check schema, verify required fields, detect anomalies, log results',
    promptRu: 'Валидируй входные данные: проверь схему, верифицируй обязательные поля, обнаружь аномалии, залогируй результаты',
    expectedProperties: {
      minNodes: 4,
      maxNodes: 7,
      requiredToolDomains: ['text_processing'],
      expectedParallel: false,
      expectedDepth: [3, 6],
      expectedNodeKinds: ['input', 'executor', 'condition', 'output'],
      description: 'Simple data validation pipeline'
    }
  },

  {
    id: 'TC05_entity_resolution',
    category: 'entity_management',
    complexity: 'high',
    prompt: 'Entity resolution: extract entities from text, search similar in vector DB, fuzzy match by name, validate matches with LLM, merge confirmed duplicates in graph',
    promptRu: 'Разрешение сущностей: извлеки сущности из текста, найди похожие в векторной БД, fuzzy-сопоставление по имени, валидируй совпадения через LLM, объедини подтверждённые дубликаты в графе',
    expectedProperties: {
      minNodes: 8,
      maxNodes: 14,
      requiredToolDomains: ['entity_extraction', 'vector_search', 'graph_ops', 'ai_generation'],
      expectedParallel: false,
      expectedDepth: [6, 11],
      expectedNodeKinds: ['input', 'ai', 'executor', 'condition', 'output'],
      description: 'Entity resolution with vector similarity and LLM validation'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKFLOW SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'TC06_approval_workflow',
    category: 'workflow',
    complexity: 'medium',
    prompt: 'Создай workflow утверждения документа: проверка комплектности, автоматическая валидация правил, маршрутизация по типу документа, назначение утверждающего, отправка на подпись, обработка результата',
    promptEn: 'Create document approval workflow: completeness check, automatic rules validation, route by document type, assign approver, send for signature, process result',
    expectedProperties: {
      minNodes: 7,
      maxNodes: 12,
      requiredToolDomains: ['classification', 'ai_generation'],
      expectedParallel: false,
      expectedDepth: [5, 9],
      expectedNodeKinds: ['input', 'executor', 'condition', 'actor', 'output'],
      description: 'Multi-step approval workflow with branching'
    }
  },

  {
    id: 'TC07_batch_processing',
    category: 'batch',
    complexity: 'medium',
    prompt: 'Batch process files: list files from folder, filter by extension, parse each file, aggregate results, generate summary report',
    promptRu: 'Пакетная обработка файлов: получить список файлов из папки, отфильтровать по расширению, распарсить каждый файл, агрегировать результаты, сгенерировать сводный отчёт',
    expectedProperties: {
      minNodes: 6,
      maxNodes: 10,
      requiredToolDomains: ['text_processing', 'ai_generation'],
      expectedParallel: false,
      expectedDepth: [4, 8],
      expectedNodeKinds: ['input', 'executor', 'ai', 'output'],
      description: 'Batch file processing with aggregation'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // KNOWLEDGE GRAPH SCENARIOS
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: 'TC08_kg_update',
    category: 'knowledge_graph',
    complexity: 'high',
    prompt: 'Обнови knowledge graph: загрузи новые данные, извлеки сущности и связи, сопоставь с существующими узлами, обнови или создай новые, пересчитай веса связей, индексируй для поиска',
    promptEn: 'Update knowledge graph: load new data, extract entities and relations, match with existing nodes, update or create new, recalculate edge weights, index for search',
    expectedProperties: {
      minNodes: 8,
      maxNodes: 14,
      requiredToolDomains: ['entity_extraction', 'graph_ops', 'vector_search'],
      expectedParallel: false,
      expectedDepth: [6, 11],
      expectedNodeKinds: ['input', 'executor', 'ai', 'output'],
      description: 'Knowledge graph incremental update pipeline'
    }
  },

  {
    id: 'TC09_monitoring_alert',
    category: 'monitoring',
    complexity: 'low',
    prompt: 'Set up monitoring alert: collect metrics, check thresholds, classify severity, route alert to appropriate channel',
    promptRu: 'Настрой мониторинг алертов: собери метрики, проверь пороги, классифицируй severity, маршрутизируй алерт в нужный канал',
    expectedProperties: {
      minNodes: 5,
      maxNodes: 8,
      requiredToolDomains: ['classification'],
      expectedParallel: false,
      expectedDepth: [4, 7],
      expectedNodeKinds: ['input', 'executor', 'condition', 'output'],
      description: 'Simple monitoring and alerting flow'
    }
  },

  {
    id: 'TC10_cross_reference',
    category: 'data_integration',
    complexity: 'high',
    prompt: 'Cross-reference data sources: query primary DB, fetch related records from secondary source, compare and reconcile differences, generate discrepancy report, update master record',
    promptRu: 'Кросс-проверка источников данных: запрос к основной БД, получение связанных записей из вторичного источника, сравнение и согласование различий, генерация отчёта о расхождениях, обновление мастер-записи',
    expectedProperties: {
      minNodes: 7,
      maxNodes: 12,
      requiredToolDomains: ['graph_ops', 'ai_generation'],
      expectedParallel: true,
      expectedDepth: [5, 9],
      expectedNodeKinds: ['input', 'executor', 'ai', 'condition', 'output'],
      description: 'Data reconciliation with parallel queries'
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════
// CORPUS ACCESS FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get all test cases
 * @returns {Array} All test cases
 */
function getAllTestCases() {
  return TEST_CORPUS;
}

/**
 * Get test case by ID
 * @param {string} id - Test case ID
 * @returns {Object|null} Test case or null
 */
function getTestCaseById(id) {
  return TEST_CORPUS.find(tc => tc.id === id) || null;
}

/**
 * Get test cases by category
 * @param {string} category - Category name
 * @returns {Array} Matching test cases
 */
function getTestCasesByCategory(category) {
  return TEST_CORPUS.filter(tc => tc.category === category);
}

/**
 * Get test cases by complexity
 * @param {string} complexity - Complexity level (low, medium, high)
 * @returns {Array} Matching test cases
 */
function getTestCasesByComplexity(complexity) {
  return TEST_CORPUS.filter(tc => tc.complexity === complexity);
}

/**
 * Get expected properties for a prompt (finds matching test case)
 * @param {string} prompt - User prompt to match
 * @returns {Object|null} Expected properties or null
 */
function getExpectedPropertiesForPrompt(prompt) {
  if (!prompt) return null;

  const promptLower = prompt.toLowerCase();

  // Try exact ID match first (if prompt is actually an ID)
  const byId = getTestCaseById(prompt);
  if (byId) return byId.expectedProperties;

  // Try keyword matching
  for (const tc of TEST_CORPUS) {
    const keywords = extractKeywords(tc.prompt) + ' ' + extractKeywords(tc.promptEn || tc.promptRu || '');

    // Simple keyword overlap scoring
    const promptWords = new Set(promptLower.split(/\s+/).filter(w => w.length > 3));
    const tcWords = new Set(keywords.toLowerCase().split(/\s+/).filter(w => w.length > 3));

    let matches = 0;
    for (const word of promptWords) {
      if (tcWords.has(word)) matches++;
    }

    // If more than 30% keyword overlap, consider it a match
    if (matches > 0 && matches / promptWords.size > 0.3) {
      return tc.expectedProperties;
    }
  }

  return null;
}

/**
 * Extract keywords from text
 * @private
 */
function extractKeywords(text) {
  if (!text) return '';
  // Remove punctuation and normalize
  return text.replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Get all categories
 * @returns {Array} Unique category names
 */
function getCategories() {
  return [...new Set(TEST_CORPUS.map(tc => tc.category))];
}

/**
 * Get corpus statistics
 * @returns {Object} Statistics about the corpus
 */
function getCorpusStats() {
  const categories = {};
  const complexities = { low: 0, medium: 0, high: 0 };

  for (const tc of TEST_CORPUS) {
    categories[tc.category] = (categories[tc.category] || 0) + 1;
    complexities[tc.complexity] = (complexities[tc.complexity] || 0) + 1;
  }

  return {
    totalCases: TEST_CORPUS.length,
    categories,
    complexities,
    averageMinNodes: TEST_CORPUS.reduce((sum, tc) => sum + tc.expectedProperties.minNodes, 0) / TEST_CORPUS.length,
    averageMaxNodes: TEST_CORPUS.reduce((sum, tc) => sum + tc.expectedProperties.maxNodes, 0) / TEST_CORPUS.length
  };
}

module.exports = {
  TEST_CORPUS,
  getAllTestCases,
  getTestCaseById,
  getTestCasesByCategory,
  getTestCasesByComplexity,
  getExpectedPropertiesForPrompt,
  getCategories,
  getCorpusStats
};
