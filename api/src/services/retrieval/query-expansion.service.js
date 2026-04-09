/**
 * Query Expansion Service
 *
 * Expands search queries with:
 * - Synonyms (general and UN-specific)
 * - UN system name expansions
 * - Related terms
 * - Optional LLM-based query generation
 *
 * @module services/retrieval/query-expansion.service
 */

'use strict';

/**
 * UN-specific synonym mappings
 */
const UN_SYNONYMS = {
  // HR Terms
  'leave': ['absence', 'time off', 'PTO', 'annual leave', 'sick leave', 'entitlement'],
  'salary': ['compensation', 'pay', 'remuneration', 'emoluments'],
  'staff': ['employee', 'personnel', 'workforce', 'staff member'],
  'hire': ['recruit', 'onboard', 'appointment', 'selection'],
  'fire': ['separate', 'termination', 'end of service', 'dismissal'],
  'promotion': ['advancement', 'career progression', 'upgrade'],
  'training': ['learning', 'development', 'capacity building'],

  // Finance Terms
  'budget': ['allocation', 'funding', 'appropriation', 'financial plan'],
  'payment': ['disbursement', 'transfer', 'remittance'],
  'expense': ['expenditure', 'cost', 'outlay'],
  'travel': ['mission', 'official travel', 'TDY', 'business trip'],
  'invoice': ['bill', 'payment request', 'voucher'],
  'procurement': ['purchasing', 'acquisition', 'sourcing'],

  // Technical Terms
  'api': ['endpoint', 'interface', 'web service', 'REST'],
  'database': ['DB', 'data store', 'repository', 'schema'],
  'error': ['bug', 'issue', 'defect', 'problem', 'exception'],
  'fix': ['patch', 'hotfix', 'correction', 'resolution'],
  'deploy': ['release', 'publish', 'rollout', 'ship'],
  'test': ['QA', 'verification', 'validation', 'check'],

  // Process Terms
  'approval': ['authorization', 'sign-off', 'clearance', 'endorsement'],
  'workflow': ['process', 'flow', 'procedure', 'pipeline'],
  'request': ['submission', 'application', 'ticket'],
  'report': ['document', 'summary', 'analysis', 'statement'],
  'meeting': ['session', 'conference', 'consultation'],

  // General Terms
  'create': ['add', 'new', 'generate', 'make'],
  'update': ['modify', 'change', 'edit', 'revise'],
  'delete': ['remove', 'archive', 'eliminate'],
  'search': ['find', 'lookup', 'query', 'retrieve'],
  'calculate': ['compute', 'determine', 'evaluate']
};

/**
 * System name expansions
 */
const SYSTEM_EXPANSIONS = {
  'imis': ['Integrated Management Information System', 'legacy HR', 'HR system'],
  'umoja': ['ERP', 'SAP', 'enterprise system', 'UN ERP'],
  'inspira': ['talent management', 'recruitment system', 'HR portal'],
  'iseek': ['intranet', 'portal', 'staff portal'],
  'galileo': ['asset management', 'property system'],
  'mercury': ['travel system', 'travel management'],
  'unite': ['collaboration', 'document management'],
  'oict': ['IT department', 'technology office']
};

/**
 * System relationships for related expansions
 */
const SYSTEM_RELATIONSHIPS = {
  'IMIS': ['Umoja', 'SAP', 'Oracle', 'Inspira'],
  'Umoja': ['IMIS', 'SAP', 'ERP', 'Finance', 'HR'],
  'Inspira': ['IMIS', 'Umoja', 'HR', 'Recruitment'],
  'iSeek': ['SharePoint', 'Unite', 'Portal'],
  'Galileo': ['Umoja', 'Asset Management', 'Inventory'],
  'Mercury': ['Umoja', 'Travel', 'DSA'],
};

/**
 * UN processes for domain detection
 */
const UN_PROCESSES = [
  'leave management', 'travel authorization', 'budget preparation',
  'staff selection', 'performance evaluation', 'procurement',
  'invoice processing', 'contract management', 'asset tracking',
  'payroll', 'benefits administration', 'onboarding'
];

/**
 * Stop words to exclude from expansion
 */
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'can', 'to', 'of',
  'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
  'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once',
  'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
  'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while',
  'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those',
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'it'
]);

/**
 * Query Expansion Service
 */
class QueryExpansionService {
  /**
   * @param {Object} options - Service options
   */
  constructor(options = {}) {
    this.maxExpansions = options.maxExpansions || 5;
    this.maxSynonymsPerTerm = options.maxSynonymsPerTerm || 3;
    this.includeSynonyms = options.includeSynonyms !== false;
    this.includeUNTerms = options.includeUNTerms !== false;
    this.includeRelatedSystems = options.includeRelatedSystems !== false;
    this.llmService = options.llmService || null;
  }

  /**
   * Expand query with synonyms and related terms
   * @param {string} query - Original query
   * @param {Object} options - Expansion options
   * @returns {Promise<Object>} Expanded query result
   */
  async expand(query, options = {}) {
    if (!query || typeof query !== 'string') {
      return {
        original: query || '',
        expanded: query || '',
        terms: [],
        synonyms: [],
        unEntities: [],
        relatedQueries: [],
        metadata: { empty: true }
      };
    }

    const result = {
      original: query,
      expanded: query,
      terms: [],
      synonyms: [],
      systemExpansions: [],
      unEntities: [],
      relatedSystems: [],
      relatedQueries: [],
      metadata: {}
    };

    // Step 1: Extract base terms
    result.terms = this.extractTerms(query);

    // Step 2: Find synonyms
    if (this.includeSynonyms) {
      result.synonyms = this.findSynonyms(result.terms);
    }

    // Step 3: Detect and expand UN systems
    if (this.includeUNTerms) {
      result.systemExpansions = this.findSystemExpansions(query);
      result.unEntities = this.detectUNEntities(query);
    }

    // Step 4: Find related systems
    if (this.includeRelatedSystems) {
      result.relatedSystems = this.findRelatedSystems(query);
    }

    // Step 5: Build expanded query
    result.expanded = this.buildExpandedQuery(query, result);

    // Step 6: Generate related queries (optional, requires LLM)
    if (options.generateRelated && this.llmService) {
      result.relatedQueries = await this.generateRelatedQueries(query);
    }

    // Metadata
    result.metadata = {
      termCount: result.terms.length,
      synonymCount: result.synonyms.reduce((sum, s) => sum + s.synonyms.length, 0),
      systemExpansionCount: result.systemExpansions.length,
      expansionRatio: result.expanded.length / query.length
    };

    return result;
  }

  /**
   * Extract meaningful terms from query
   * @param {string} query - Query string
   * @returns {string[]} Extracted terms
   */
  extractTerms(query) {
    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2 && !STOP_WORDS.has(term));
  }

  /**
   * Find synonyms for extracted terms
   * @param {string[]} terms - Terms to find synonyms for
   * @returns {Object[]} Synonym mappings
   */
  findSynonyms(terms) {
    const synonyms = [];

    for (const term of terms) {
      const termLower = term.toLowerCase();

      // Check direct synonyms
      if (UN_SYNONYMS[termLower]) {
        synonyms.push({
          original: term,
          synonyms: UN_SYNONYMS[termLower].slice(0, this.maxSynonymsPerTerm)
        });
      }
    }

    return synonyms.slice(0, this.maxExpansions);
  }

  /**
   * Find system name expansions
   * @param {string} query - Query string
   * @returns {Object[]} System expansions
   */
  findSystemExpansions(query) {
    const expansions = [];
    const queryLower = query.toLowerCase();

    for (const [system, expanded] of Object.entries(SYSTEM_EXPANSIONS)) {
      if (queryLower.includes(system)) {
        expansions.push({
          original: system.toUpperCase(),
          expansions: expanded.slice(0, this.maxSynonymsPerTerm)
        });
      }
    }

    return expansions;
  }

  /**
   * Detect UN-specific entities in query
   * @param {string} query - Query string
   * @returns {Object[]} Detected entities
   */
  detectUNEntities(query) {
    const entities = [];
    const queryLower = query.toLowerCase();

    // Check for administrative instructions
    const adminInstr = query.match(/ST\/(AI|SGB|IC)\/\d{4}\/\d+/gi);
    if (adminInstr) {
      entities.push(...adminInstr.map(m => ({
        name: m,
        type: 'AdminInstruction',
        normalized: m.toUpperCase()
      })));
    }

    // Check for work item references
    const workItems = query.match(/#?\d{5,}/g);
    if (workItems) {
      entities.push(...workItems.map(m => ({
        name: m,
        type: 'WorkItemRef',
        normalized: m.replace('#', '')
      })));
    }

    // Check for processes
    for (const process of UN_PROCESSES) {
      if (queryLower.includes(process.toLowerCase())) {
        entities.push({
          name: process,
          type: 'Process',
          normalized: process.toLowerCase().replace(/\s+/g, '_')
        });
      }
    }

    return entities;
  }

  /**
   * Find related systems based on query content
   * @param {string} query - Query string
   * @returns {string[]} Related system names
   */
  findRelatedSystems(query) {
    const related = new Set();
    const queryUpper = query.toUpperCase();

    for (const [system, relations] of Object.entries(SYSTEM_RELATIONSHIPS)) {
      if (queryUpper.includes(system)) {
        relations.forEach(r => related.add(r));
      }
    }

    return [...related].slice(0, 5);
  }

  /**
   * Build expanded query string
   * @param {string} original - Original query
   * @param {Object} expansion - Expansion data
   * @returns {string} Expanded query
   */
  buildExpandedQuery(original, expansion) {
    const parts = [original];

    // Add top synonym from each term (not all to avoid noise)
    for (const syn of expansion.synonyms.slice(0, 3)) {
      if (syn.synonyms[0]) {
        parts.push(syn.synonyms[0]);
      }
    }

    // Add system expansions (first only)
    for (const exp of expansion.systemExpansions.slice(0, 2)) {
      if (exp.expansions[0]) {
        parts.push(exp.expansions[0]);
      }
    }

    // Add related systems
    for (const system of expansion.relatedSystems.slice(0, 2)) {
      if (!original.toLowerCase().includes(system.toLowerCase())) {
        parts.push(system);
      }
    }

    return [...new Set(parts)].join(' ');
  }

  /**
   * Generate related queries using LLM
   * @param {string} query - Original query
   * @returns {Promise<string[]>} Related queries
   */
  async generateRelatedQueries(query) {
    if (!this.llmService) return [];

    try {
      const prompt = `Given this search query about UN systems: "${query}"

Generate 3 related search queries that might help find relevant information.
Focus on UN-specific terminology (IMIS, Umoja, staff rules, etc.)

Return only JSON array: ["query1", "query2", "query3"]`;

      const response = await this.llmService.chat([
        { role: 'user', content: prompt }
      ], { temperature: 0.3, maxTokens: 200 });

      // Parse response
      const match = response.match(/\[[\s\S]*\]/);
      if (match) {
        return JSON.parse(match[0]);
      }
    } catch (error) {
      console.error('Query expansion LLM error:', error.message);
    }

    return [];
  }

  /**
   * Quick expand without async operations
   * @param {string} query - Query string
   * @returns {string} Expanded query
   */
  quickExpand(query) {
    const terms = this.extractTerms(query);
    const synonyms = this.findSynonyms(terms);
    const systems = this.findSystemExpansions(query);

    const parts = [query];

    for (const syn of synonyms.slice(0, 2)) {
      if (syn.synonyms[0]) parts.push(syn.synonyms[0]);
    }

    for (const sys of systems.slice(0, 1)) {
      if (sys.expansions[0]) parts.push(sys.expansions[0]);
    }

    return [...new Set(parts)].join(' ');
  }
}

/**
 * Create query expansion service
 */
function createQueryExpansionService(options = {}) {
  return new QueryExpansionService(options);
}

module.exports = {
  QueryExpansionService,
  createQueryExpansionService,
  UN_SYNONYMS,
  SYSTEM_EXPANSIONS,
  SYSTEM_RELATIONSHIPS,
  UN_PROCESSES
};
