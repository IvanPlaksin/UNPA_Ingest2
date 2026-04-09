/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTENT CLASSIFIER - Hybrid Intent Classification
 * Part of SDA (Staged DAG Assembly) Architecture - Stage 1
 *
 * Classification strategy:
 * 1. Rule-based matching from intent-rules.js (fast, deterministic)
 * 2. LLM fallback with structured output (for ambiguous cases)
 * 3. Confidence scoring and threshold-based decisions
 *
 * Pipeline integration:
 * [prompt] → [IntentClassifier.classify()] → [ToolFilter.filterByIntent()] → [LLM Generation]
 *
 * @module services/graph/intent-classifier
 * ═══════════════════════════════════════════════════════════════════════════
 */

const {
  DOMAINS,
  INTENT_TYPES,
  COMPOSITE_RULES,
  getDomain,
  getIntentType,
  getCompositeRules,
  getOntologyLayer,
  isModifyingIntent,
  getCapabilityForIntent
} = require('./intent-rules');

// ═══════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS (JSDoc)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ExtractedEntity
 * @property {string} name - Entity text
 * @property {string} type - Entity type (system, organization, technology, artifact)
 * @property {number} position - Position in text
 */

/**
 * @typedef {Object} IntentDescriptor
 * @property {string} domain - Primary domain
 * @property {string[]} allDomains - All matched domains
 * @property {string} intent - Action type (ingest, query, transform, route, approve, monitor, analyze)
 * @property {'low'|'medium'|'high'} complexity - Estimated complexity
 * @property {string[]} requiredCapabilities - Required capability categories
 * @property {ExtractedEntity[]} entities - Domain entities found in prompt
 * @property {Object} expectedScale - { minNodes, maxNodes, minDepth, maxDepth }
 * @property {boolean} expectsParallel - Whether parallel branches are likely
 * @property {number} confidence - 0.0-1.0 classification confidence
 * @property {'rule'|'llm'|'hybrid'} method - How classification was performed
 * @property {string[]} matchedKeywords - Keywords that triggered classification
 * @property {Array<{intent: string, score: number}>} alternativeIntents - Other possible intents
 */

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG = {
  // Confidence thresholds
  HIGH_CONFIDENCE_THRESHOLD: 0.75,
  MEDIUM_CONFIDENCE_THRESHOLD: 0.50,

  // Scoring weights
  KEYWORD_MATCH_WEIGHT: 0.3,
  PATTERN_MATCH_WEIGHT: 0.5,
  COMPOSITE_RULE_WEIGHT: 0.8
};

// ═══════════════════════════════════════════════════════════════════════════
// INTENT DESCRIPTOR SCHEMA (for LLM structured output)
// ═══════════════════════════════════════════════════════════════════════════

const INTENT_DESCRIPTOR_SCHEMA = {
  type: 'object',
  properties: {
    domain: {
      type: 'string',
      enum: Object.keys(DOMAINS),
      description: 'The domain this request belongs to'
    },
    intent: {
      type: 'string',
      enum: ['ingest', 'query', 'route', 'approve', 'transform', 'monitor', 'analyze', 'create', 'read', 'update', 'delete', 'extract', 'aggregate', 'compare', 'link', 'export'],
      description: 'The type of operation requested'
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score from 0 to 1'
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          value: { type: 'string' },
          role: { type: 'string', enum: ['subject', 'object', 'context'] }
        },
        required: ['type', 'value']
      },
      description: 'Extracted entities from the request'
    },
    reasoning: {
      type: 'string',
      description: 'Brief explanation of classification'
    }
  },
  required: ['domain', 'intent', 'confidence']
};

// ═══════════════════════════════════════════════════════════════════════════
// INTENT CLASSIFIER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class IntentClassifier {
  /**
   * @param {Object} [llmService=null] - Optional LLM service for fallback classification
   */
  constructor(llmService = null) {
    this.llmService = llmService;

    // Intent patterns — RU + EN, prioritized by specificity
    this.intentPatterns = [
      {
        intent: 'ingest',
        keywords: [
          'обработ', 'загруз', 'индекс', 'ingest', 'import', 'parse', 'extract',
          'очист', 'sanitiz', 'chunk', 'разбиение', 'embed', 'сохран', 'store',
          'pipeline', 'пайплайн', 'обработка документ', 'document processing'
        ],
        domains: ['text_processing', 'entity_extraction', 'vector_search', 'graph_ops'],
        defaultComplexity: 'medium'
      },
      {
        intent: 'query',
        keywords: [
          'найди', 'поиск', 'search', 'query', 'retriev', 'rag', 'ответ',
          'answer', 'ask', 'вопрос', 'question', 'lookup', 'fetch', 'get',
          'найти', 'получить', 'запрос'
        ],
        domains: ['vector_search', 'graph_ops', 'ai_generation'],
        defaultComplexity: 'medium'
      },
      {
        intent: 'route',
        keywords: [
          'маршрут', 'route', 'assign', 'назначь', 'распредел', 'dispatch',
          'тикет', 'ticket', 'обращен', 'request', 'приоритет', 'priority',
          'классифиц', 'categoriz', 'triage', 'support', 'поддержк', 'helpdesk'
        ],
        domains: ['classification', 'entity_extraction', 'ai_generation'],
        defaultComplexity: 'medium'
      },
      {
        intent: 'approve',
        keywords: [
          'утвержд', 'approv', 'согласов', 'review', 'sign-off',
          'подпис', 'верифик', 'verify', 'confirm', 'workflow', 'approval'
        ],
        domains: ['classification', 'ai_generation'],
        defaultComplexity: 'medium'
      },
      {
        intent: 'transform',
        keywords: [
          'преобраз', 'transform', 'конверт', 'convert', 'merge',
          'слияние', 'resolv', 'deduplic', 'нормализ', 'normaliz',
          'entity resolution', 'reconcil', 'сопоставл', 'fuzzy',
          'cross-reference', 'кросс', 'discrepan', 'расхожден',
          'batch', 'пакет', 'aggregat', 'агрегир', 'process files',
          'master record', 'update', 'обнов', 'migrat'
        ],
        domains: ['entity_extraction', 'vector_search', 'graph_ops'],
        defaultComplexity: 'high'
      },
      {
        intent: 'monitor',
        keywords: [
          'мониторинг', 'monitor', 'наблюд', 'alert', 'оповещ',
          'threshold', 'порог', 'health', 'status', 'severity',
          'channel', 'канал', 'collect metrics'
        ],
        domains: ['graph_ops', 'gnn_analysis', 'classification'],
        defaultComplexity: 'low'
      },
      {
        intent: 'analyze',
        keywords: [
          'анализ', 'analyz', 'оцен', 'evaluat', 'качеств',
          'compare', 'сравн', 'отчёт', 'summary', 'статистик',
          'statistic', 'validate', 'валидир', 'check schema',
          'verify', 'провер', 'anomal', 'detect', 'log result',
          'детализ', 'detail', 'elaborate', 'describe', 'опиши',
          'разложи', 'decompos', 'breakdown', 'explain', 'объясн'
        ],
        domains: ['ai_generation', 'graph_ops', 'gnn_analysis'],
        defaultComplexity: 'medium'
      }
    ];

    // UN-specific entity patterns
    this.entityPatterns = [
      // UN Systems
      { pattern: /\b(IMIS|Umoja|iNeed|Inspira|ERP|SAP|Unite)\b/gi, type: 'system' },
      // UN Organizations
      { pattern: /\b(UNDP|UNICEF|UNFPA|OCHA|DPPA|DESA|OHR|OIOS|WHO|UNESCO|UNHCR)\b/g, type: 'organization' },
      // Technologies in stack
      { pattern: /\b(Qdrant|Memgraph|Redis|BullMQ|Ollama|Gemini|Claude|Neo4j|PostgreSQL)\b/gi, type: 'technology' },
      // Artifacts
      { pattern: /\b(work\s*item|тикет|ticket|service\s*request|SR|PBI|bug|feature)\b/gi, type: 'artifact' },
      // Document types
      { pattern: /\b(document|документ|report|отчёт|PDF|Word|Excel)\b/gi, type: 'document' }
    ];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN CLASSIFICATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Classify prompt using hybrid approach (rule-based + optional LLM fallback)
   * @param {string} prompt - User task description
   * @param {Object} context - Optional context
   * @returns {Promise<IntentDescriptor>}
   */
  async classify(prompt, context = {}) {
    // Step 1: Try composite rules from intent-rules.js (highest precision)
    const compositeResult = this._matchCompositeRules(prompt);
    if (compositeResult && compositeResult.confidence >= CONFIG.HIGH_CONFIDENCE_THRESHOLD) {
      return compositeResult;
    }

    // Step 2: Fall back to original rule-based classification
    const ruleBased = this.classifyRuleBased(prompt);

    // Merge composite hints if available
    if (compositeResult) {
      ruleBased.suggestedTools = compositeResult.suggestedTools || [];
      ruleBased.ontologyLayer = compositeResult.ontologyLayer || ruleBased.ontologyLayer;
    }

    if (ruleBased.confidence >= CONFIG.HIGH_CONFIDENCE_THRESHOLD) {
      return ruleBased; // Rule-based is confident enough
    }

    // Step 3: Low confidence — try LLM if available
    if (this.llmService) {
      return this.classifyWithLLM(prompt, ruleBased);
    }

    return ruleBased;
  }

  /**
   * Match against composite rules from intent-rules.js
   * @param {string} text
   * @returns {IntentDescriptor|null}
   */
  _matchCompositeRules(text) {
    if (!text) return null;
    const textLower = text.toLowerCase();

    let bestMatch = null;
    let bestScore = 0;

    for (const rule of COMPOSITE_RULES) {
      let score = 0;

      // Check patterns
      for (const pattern of rule.patterns) {
        if (pattern.test(textLower)) {
          score += CONFIG.COMPOSITE_RULE_WEIGHT;
          break;
        }
      }

      // Check keywords
      for (const keyword of rule.keywords) {
        if (textLower.includes(keyword.toLowerCase())) {
          score += CONFIG.KEYWORD_MATCH_WEIGHT * 0.5;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = rule;
      }
    }

    if (bestMatch && bestScore > 0) {
      const confidence = Math.min(bestScore, 1.0);
      const domain = getDomain(bestMatch.domain);

      return {
        domain: bestMatch.domain,
        allDomains: [bestMatch.domain],
        intent: bestMatch.intent,
        complexity: 'medium',
        requiredCapabilities: domain?.keywords?.slice(0, 3) || [],
        entities: this._extractEntities(text),
        expectedScale: this._estimateScale('medium', bestMatch.intent),
        expectsParallel: this._expectsParallel(text, bestMatch.intent),
        confidence,
        method: 'composite_rule',
        matchedKeywords: bestMatch.keywords.filter(kw => textLower.includes(kw.toLowerCase())),
        alternativeIntents: [],
        suggestedTools: bestMatch.suggestedTools || [],
        ontologyLayer: getOntologyLayer(bestMatch.domain),
        capability: getCapabilityForIntent(bestMatch.intent),
        isModifying: isModifyingIntent(bestMatch.intent)
      };
    }

    return null;
  }

  /**
   * Rule-based classification
   * @param {string} prompt
   * @returns {IntentDescriptor}
   */
  classifyRuleBased(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return this._unknownIntent('');
    }

    const promptLower = prompt.toLowerCase();
    const scores = [];

    // Score each intent pattern
    for (const pattern of this.intentPatterns) {
      let score = 0;
      const matchedKeywords = [];

      for (const kw of pattern.keywords) {
        if (promptLower.includes(kw.toLowerCase())) {
          score += 1;
          matchedKeywords.push(kw);
        }
      }

      if (score > 0) {
        scores.push({
          intent: pattern.intent,
          domains: pattern.domains,
          score,
          matchedKeywords,
          defaultComplexity: pattern.defaultComplexity
        });
      }
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    if (scores.length === 0) {
      return this._unknownIntent(prompt);
    }

    const best = scores[0];
    // 4+ keyword matches = max confidence
    const confidence = Math.min(best.score / 4, 1.0);

    // Estimate complexity from prompt length + keyword diversity
    const complexity = this._estimateComplexity(prompt, scores);

    // Extract entities
    const entities = this._extractEntities(prompt);

    // Estimate scale
    const expectedScale = this._estimateScale(complexity, best.intent);

    return {
      domain: best.domains[0],
      allDomains: [...new Set(scores.flatMap(s => s.domains))],
      intent: best.intent,
      complexity,
      requiredCapabilities: best.domains,
      entities,
      expectedScale,
      expectsParallel: this._expectsParallel(prompt, best.intent),
      confidence,
      method: 'rule',
      matchedKeywords: best.matchedKeywords,
      alternativeIntents: scores.slice(1, 3).map(s => ({ intent: s.intent, score: s.score }))
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LLM FALLBACK (with Structured Output)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * LLM-based classification for low-confidence cases
   * Uses structured output for guaranteed valid JSON
   * @param {string} prompt
   * @param {IntentDescriptor} ruleBasedResult
   * @returns {Promise<IntentDescriptor>}
   */
  async classifyWithLLM(prompt, ruleBasedResult) {
    if (!this.llmService) return ruleBasedResult;

    // Try structured output first (if available)
    if (this.llmService.generateStructured) {
      try {
        const classificationPrompt = this._buildClassificationPrompt(prompt, ruleBasedResult);
        const result = await this.llmService.generateStructured(
          classificationPrompt,
          INTENT_DESCRIPTOR_SCHEMA,
          { provider: 'gemini', temperature: 0.1 }
        );

        if (result.success && result.data) {
          const data = result.data;
          return {
            ...ruleBasedResult,
            domain: data.domain || ruleBasedResult.domain,
            intent: data.intent || ruleBasedResult.intent,
            entities: data.entities || ruleBasedResult.entities,
            expectedScale: this._estimateScale(ruleBasedResult.complexity, data.intent || ruleBasedResult.intent),
            confidence: data.confidence || 0.85,
            method: 'structured_llm',
            reasoning: data.reasoning,
            suggestedTools: this._getSuggestedTools(data.domain, data.intent),
            ontologyLayer: getOntologyLayer(data.domain),
            capability: getCapabilityForIntent(data.intent),
            isModifying: isModifyingIntent(data.intent)
          };
        }
      } catch (err) {
        console.warn(`[IntentClassifier] Structured output failed: ${err.message}, trying chat fallback`);
      }
    }

    // Fallback to regular chat
    const systemPrompt = `You are an intent classifier for a graph execution system.
Classify the user's task into ONE of these intents: ingest, query, route, approve, transform, monitor, analyze, create, read, update, delete, extract, aggregate, compare, link, export.

Available domains: ${Object.keys(DOMAINS).join(', ')}

Respond ONLY with valid JSON matching this schema:
{
  "intent": "string",
  "domain": "string",
  "complexity": "low|medium|high",
  "requiredCapabilities": ["string"],
  "expectsParallel": boolean
}`;

    try {
      const response = await this.llmService.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ], { temperature: 0, maxTokens: 200 });

      const content = response?.content || response;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('[IntentClassifier] LLM response not JSON, using rule-based');
        return ruleBasedResult;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        ...ruleBasedResult,
        ...parsed,
        entities: ruleBasedResult.entities, // Keep rule-based entities
        expectedScale: this._estimateScale(parsed.complexity || ruleBasedResult.complexity, parsed.intent || ruleBasedResult.intent),
        confidence: 0.9,
        method: 'llm',
        suggestedTools: this._getSuggestedTools(parsed.domain, parsed.intent),
        ontologyLayer: getOntologyLayer(parsed.domain),
        capability: getCapabilityForIntent(parsed.intent),
        isModifying: isModifyingIntent(parsed.intent)
      };
    } catch (err) {
      console.warn(`[IntentClassifier] LLM fallback failed: ${err.message}, using rule-based`);
      return ruleBasedResult;
    }
  }

  /**
   * Build classification prompt for LLM
   * @private
   */
  _buildClassificationPrompt(prompt, ruleBasedResult) {
    const domains = Object.entries(DOMAINS).map(([id, d]) => `- ${id}: ${d.description}`).join('\n');
    const intents = Object.entries(INTENT_TYPES).map(([id, i]) => `- ${id}: ${i.description}`).join('\n');

    return `Classify the following user request into domain and intent.

AVAILABLE DOMAINS:
${domains}

AVAILABLE INTENTS:
${intents}

USER REQUEST: "${prompt}"

${ruleBasedResult ? `Rule-based suggestion: domain=${ruleBasedResult.domain}, intent=${ruleBasedResult.intent} (confidence: ${ruleBasedResult.confidence.toFixed(2)})` : ''}

Provide domain, intent, confidence (0-1), and brief reasoning.`;
  }

  /**
   * Get suggested tools for domain+intent
   * @private
   */
  _getSuggestedTools(domain, intent) {
    const rules = getCompositeRules(domain, intent);
    if (rules.length > 0) {
      return rules[0].suggestedTools || [];
    }

    // Default tool suggestions based on capability
    const capability = getCapabilityForIntent(intent);
    const toolMap = {
      'data_fetch': ['primitive.getWorkItem', 'ado.fetchWorkItems'],
      'data_store': ['neo4j.createNode', 'graph.storeEntity'],
      'extraction': ['extraction.extractEntities', 'llm.extractEntities'],
      'analysis': ['analysis.analyze', 'llm.analyze'],
      'data_transform': ['transform.process', 'sanitize.text'],
      'embedding': ['embedding.generate', 'qdrant.upsert'],
      'aggregation': ['analysis.aggregate', 'llm.summarize']
    };

    return toolMap[capability] || [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Estimate complexity from prompt characteristics
   * @private
   */
  _estimateComplexity(prompt, scores) {
    const words = prompt.split(/\s+/).length;
    const intentCount = scores.length;

    // Heuristics:
    // - prompt > 40 words or 3+ intents matched → high
    // - prompt < 15 words and 1 intent → low
    // - otherwise → medium
    if (words > 40 || intentCount >= 3) return 'high';
    if (words < 15 && intentCount <= 1) return 'low';
    return 'medium';
  }

  /**
   * Estimate expected graph scale
   * @private
   */
  _estimateScale(complexity, intent) {
    const scales = {
      low: { minNodes: 3, maxNodes: 6, minDepth: 2, maxDepth: 4 },
      medium: { minNodes: 6, maxNodes: 12, minDepth: 4, maxDepth: 8 },
      high: { minNodes: 10, maxNodes: 18, minDepth: 6, maxDepth: 12 }
    };
    return scales[complexity] || scales.medium;
  }

  /**
   * Check if parallel execution is expected
   * @private
   */
  _expectsParallel(prompt, intent) {
    const parallelKeywords = [
      'параллел', 'parallel', 'одновремен', 'simultane',
      'fork', 'concurrent', 'both', 'оба'
    ];

    // Check for explicit parallel keywords
    const hasParallelKeyword = parallelKeywords.some(kw =>
      prompt.toLowerCase().includes(kw)
    );

    // RAG queries often have parallel vector+graph search
    const isRagLikely = intent === 'query' && (
      prompt.toLowerCase().includes('rag') ||
      (prompt.toLowerCase().includes('vector') && prompt.toLowerCase().includes('graph'))
    );

    return hasParallelKeyword || isRagLikely;
  }

  /**
   * Extract domain entities from prompt
   * @private
   */
  _extractEntities(prompt) {
    const entities = [];

    for (const { pattern, type } of this.entityPatterns) {
      let match;
      // Create fresh regex to avoid state issues
      const regex = new RegExp(pattern.source, pattern.flags);

      while ((match = regex.exec(prompt)) !== null) {
        // Avoid duplicates
        const existing = entities.find(e =>
          e.name.toLowerCase() === match[0].toLowerCase() && e.type === type
        );

        if (!existing) {
          entities.push({
            name: match[0],
            type,
            position: match.index
          });
        }
      }
    }

    return entities;
  }

  /**
   * Return unknown intent descriptor
   * @private
   */
  _unknownIntent(prompt) {
    return {
      domain: 'general',
      allDomains: ['general'],
      intent: 'unknown',
      complexity: 'medium',
      requiredCapabilities: ['ai_generation'],
      entities: this._extractEntities(prompt),
      expectedScale: { minNodes: 4, maxNodes: 10, minDepth: 3, maxDepth: 7 },
      expectsParallel: false,
      confidence: 0.1,
      method: 'rule',
      matchedKeywords: [],
      alternativeIntents: []
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get available intents
   * @returns {string[]}
   */
  getAvailableIntents() {
    return this.intentPatterns.map(p => p.intent);
  }

  /**
   * Get intent statistics for a batch of prompts
   * @param {string[]} prompts
   * @returns {Object}
   */
  batchClassify(prompts) {
    const results = prompts.map(p => this.classifyRuleBased(p));

    const stats = {
      total: prompts.length,
      byIntent: {},
      byComplexity: { low: 0, medium: 0, high: 0 },
      avgConfidence: 0,
      highConfidenceCount: 0
    };

    for (const r of results) {
      stats.byIntent[r.intent] = (stats.byIntent[r.intent] || 0) + 1;
      stats.byComplexity[r.complexity]++;
      stats.avgConfidence += r.confidence;
      if (r.confidence >= 0.75) stats.highConfidenceCount++;
    }

    stats.avgConfidence = stats.avgConfidence / prompts.length;

    return { results, stats };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// FACTORY FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create IntentClassifier instance
 * @param {Object} [llmService=null] - Optional LLM service
 * @returns {IntentClassifier}
 */
function createIntentClassifier(llmService = null) {
  return new IntentClassifier(llmService);
}

module.exports = {
  IntentClassifier,
  createIntentClassifier,
  INTENT_DESCRIPTOR_SCHEMA,
  CONFIG,
  // Re-export from intent-rules for convenience
  DOMAINS,
  INTENT_TYPES,
  COMPOSITE_RULES
};
