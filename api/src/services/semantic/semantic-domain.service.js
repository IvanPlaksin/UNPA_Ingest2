/**
 * Semantic Domain Service (D3)
 *
 * Manages semantic layer: business rules, calculations, concepts, vocabulary.
 * Integrates with LLM for natural language enrichment.
 *
 * Node types:
 *   SemanticRule        — IF/CASE conditions expressed as business rules
 *   SemanticCalculation — SET @var = expr formulas with business descriptions
 *   SemanticConcept     — Entity-level business meanings (table → concept)
 *   DomainVocabulary    — Technical name → business term mapping
 *
 * Cross-domain edges created:
 *   BEHAVIORAL -[ENFORCES]-> SEMANTIC (rule sourced from a procedure node)
 *   SEMANTIC   -[APPLIES_TO]-> STRUCTURAL (rule applies to entity)
 *   BEHAVIORAL -[COMPUTES]-> SEMANTIC (calculation sourced from procedure node)
 *   SEMANTIC   -[DEFINED_BY]-> STRUCTURAL (concept defined by entity)
 */

const { v4: uuidv4 } = require('uuid');

// Semantic node types
const SemanticNodeType = {
  CONCEPT: 'CONCEPT',
  RULE: 'RULE',
  CALCULATION: 'CALCULATION',
  VOCABULARY: 'VOCABULARY',
};

// Rule types
const RuleType = {
  VALIDATION: 'validation',
  INVARIANT: 'invariant',
  CONSTRAINT: 'constraint',
  AUTHORIZATION: 'authorization',
  WORKFLOW: 'workflow',
};

// Rule severity
const RuleSeverity = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
};

/**
 * Semantic Domain Service
 */
class SemanticDomainService {
  /**
   * @param {Object} dependencies
   * @param {Object} dependencies.memgraphService - MemgraphService with runQuery()
   * @param {Object} [dependencies.llmService] - LlmService with chat([messages])
   * @param {Object} [dependencies.embeddingService] - TEI embedding service with embed(text)
   */
  constructor(dependencies = {}) {
    this.memgraphService = dependencies.memgraphService;
    this.llmService = dependencies.llmService;
    this.embeddingService = dependencies.embeddingService;
    this.namespace = 'semantic';
  }

  // ============================================================
  // BUSINESS RULES
  // ============================================================

  /**
   * Create a semantic rule from extracted data.
   *
   * @param {Object} ruleData
   * @param {string} [ruleData.name]
   * @param {string} [ruleData.expression] - SQL condition expression
   * @param {string} [ruleData.naturalLanguage] - Business description (auto-generated if missing)
   * @param {string} [ruleData.ruleType] - One of RuleType values
   * @param {string} [ruleData.severity] - One of RuleSeverity values
   * @param {string} [ruleData.sourceNodeId] - BehavioralNode id
   * @param {string} [ruleData.sourceProcedure]
   * @param {string} [ruleData.sourceSchema]
   * @param {string[]} [ruleData.affectedEntities] - StructuralEntity ids
   * @param {number} [ruleData.confidence]
   * @param {Object} context - { sessionId }
   * @returns {Promise<Object>}
   */
  async createRule(ruleData, context = {}) {
    const ruleId = uuidv4();
    const now = new Date().toISOString();

    // Enrich with LLM if expression provided but no natural language
    let naturalLanguage = ruleData.naturalLanguage || null;
    if (!naturalLanguage && ruleData.expression && this.llmService) {
      naturalLanguage = await this._enrichRuleWithLLM(ruleData);
    }

    // Generate embedding for semantic search
    let embedding = null;
    if (this.embeddingService && (naturalLanguage || ruleData.name)) {
      try {
        embedding = await this.embeddingService.embed(naturalLanguage || ruleData.name);
      } catch {
        // Embedding generation is optional
      }
    }

    const query = `
      CREATE (r:SemanticRule:SEMANTIC {
        id: $id,
        globalId: $globalId,
        domain: 'SEMANTIC',
        name: $name,
        expression: $expression,
        naturalLanguage: $naturalLanguage,
        ruleType: $ruleType,
        severity: $severity,
        sourceNodeId: $sourceNodeId,
        sourceProcedure: $sourceProcedure,
        sourceSchema: $sourceSchema,
        extractionSessionId: $sessionId,
        confidence: $confidence,
        humanValidated: false,
        embeddingJson: $embeddingJson,
        createdAt: $now,
        updatedAt: $now
      })
      RETURN r.id as id
    `;

    const params = {
      id: ruleId,
      globalId: `${this.namespace}:rule:${ruleId}`,
      name: ruleData.name || `Rule_${ruleId.substring(0, 8)}`,
      expression: ruleData.expression || '',
      naturalLanguage: naturalLanguage || '',
      ruleType: ruleData.ruleType || RuleType.VALIDATION,
      severity: ruleData.severity || RuleSeverity.WARNING,
      sourceNodeId: ruleData.sourceNodeId || '',
      sourceProcedure: ruleData.sourceProcedure || '',
      sourceSchema: ruleData.sourceSchema || 'dbo',
      sessionId: context.sessionId || '',
      confidence: ruleData.confidence || 0.8,
      embeddingJson: embedding ? JSON.stringify(embedding) : '',
      now,
    };

    await this.memgraphService.runQuery(query, params);

    // Create cross-domain links
    if (ruleData.sourceNodeId) {
      await this._linkRuleToBehavioral(ruleId, ruleData.sourceNodeId);
    }
    if (ruleData.affectedEntities) {
      for (const entityId of ruleData.affectedEntities) {
        await this._linkRuleToStructural(ruleId, entityId);
      }
    }

    return { id: ruleId, name: params.name, naturalLanguage, ruleType: params.ruleType };
  }

  /**
   * Create multiple rules in batch.
   */
  async createRules(rulesData, context = {}) {
    const results = { created: [], failed: [] };

    for (const ruleData of rulesData) {
      try {
        const rule = await this.createRule(ruleData, context);
        results.created.push(rule);
      } catch (error) {
        results.failed.push({ name: ruleData.name, error: error.message });
      }
    }

    return results;
  }

  /**
   * Find rules by expression or description pattern.
   */
  async findRulesByPattern(pattern) {
    const result = await this.memgraphService.runQuery(
      `MATCH (r:SemanticRule)
       WHERE r.expression CONTAINS $pattern OR r.naturalLanguage CONTAINS $pattern
       RETURN r.id as id, r.name as name, r.expression as expression,
              r.naturalLanguage as naturalLanguage, r.ruleType as ruleType
       ORDER BY r.createdAt DESC
       LIMIT 50`,
      { pattern }
    );
    return result || [];
  }

  /**
   * Find rules by semantic similarity (using embeddings).
   */
  async findSimilarRules(text, limit = 10) {
    if (!this.embeddingService) return [];

    let queryEmbedding;
    try {
      queryEmbedding = await this.embeddingService.embed(text);
    } catch {
      return [];
    }

    const result = await this.memgraphService.runQuery(
      `MATCH (r:SemanticRule)
       WHERE r.embeddingJson <> ''
       RETURN r.id as id, r.name as name, r.naturalLanguage as naturalLanguage,
              r.embeddingJson as embeddingJson`
    );

    if (!result || result.length === 0) return [];

    // Calculate cosine similarity in-memory
    const scored = result
      .map(r => {
        try {
          const emb = JSON.parse(r.embeddingJson);
          return { id: r.id, name: r.name, naturalLanguage: r.naturalLanguage, similarity: this._cosineSimilarity(queryEmbedding, emb) };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return scored;
  }

  // ============================================================
  // CALCULATIONS
  // ============================================================

  /**
   * Create a semantic calculation.
   */
  async createCalculation(calcData, context = {}) {
    const calcId = uuidv4();
    const now = new Date().toISOString();

    // Enrich with LLM
    let naturalLanguage = calcData.naturalLanguage || null;
    if (!naturalLanguage && calcData.formula && this.llmService) {
      naturalLanguage = await this._enrichCalculationWithLLM(calcData);
    }

    const query = `
      CREATE (c:SemanticCalculation:SEMANTIC {
        id: $id,
        globalId: $globalId,
        domain: 'SEMANTIC',
        name: $name,
        formula: $formula,
        naturalLanguage: $naturalLanguage,
        outputVariable: $outputVariable,
        dataType: $dataType,
        sourceNodeId: $sourceNodeId,
        sourceProcedure: $sourceProcedure,
        sourceSchema: $sourceSchema,
        extractionSessionId: $sessionId,
        confidence: $confidence,
        createdAt: $now,
        updatedAt: $now
      })
      RETURN c.id as id
    `;

    const params = {
      id: calcId,
      globalId: `${this.namespace}:calc:${calcId}`,
      name: calcData.name || calcData.outputVariable || `Calc_${calcId.substring(0, 8)}`,
      formula: calcData.formula || calcData.expression || '',
      naturalLanguage: naturalLanguage || '',
      outputVariable: calcData.outputVariable || calcData.variable || '',
      dataType: calcData.dataType || 'unknown',
      sourceNodeId: calcData.sourceNodeId || '',
      sourceProcedure: calcData.sourceProcedure || '',
      sourceSchema: calcData.sourceSchema || 'dbo',
      sessionId: context.sessionId || '',
      confidence: calcData.confidence || 0.8,
      now,
    };

    await this.memgraphService.runQuery(query, params);

    // Link to behavioral node
    if (calcData.sourceNodeId) {
      await this._linkCalculationToBehavioral(calcId, calcData.sourceNodeId);
    }

    return { id: calcId, name: params.name, formula: params.formula, naturalLanguage };
  }

  /**
   * Create multiple calculations in batch.
   */
  async createCalculations(calculationsData, context = {}) {
    const results = { created: [], failed: [] };

    for (const calcData of calculationsData) {
      try {
        const calc = await this.createCalculation(calcData, context);
        results.created.push(calc);
      } catch (error) {
        results.failed.push({ name: calcData.name, error: error.message });
      }
    }

    return results;
  }

  // ============================================================
  // CONCEPTS
  // ============================================================

  /**
   * Create a semantic concept (business entity description).
   */
  async createConcept(conceptData, context = {}) {
    const conceptId = uuidv4();
    const now = new Date().toISOString();

    // Generate embedding
    let embedding = null;
    if (this.embeddingService) {
      try {
        const textToEmbed = `${conceptData.name}: ${conceptData.description || ''} ${(conceptData.synonyms || []).join(' ')}`;
        embedding = await this.embeddingService.embed(textToEmbed);
      } catch {
        // Optional
      }
    }

    const query = `
      CREATE (c:SemanticConcept:SEMANTIC {
        id: $id,
        globalId: $globalId,
        domain: 'SEMANTIC',
        name: $name,
        description: $description,
        synonymsJson: $synonymsJson,
        businessContext: $businessContext,
        definedByEntityId: $entityId,
        confidence: $confidence,
        embeddingJson: $embeddingJson,
        createdAt: $now,
        updatedAt: $now
      })
      RETURN c.id as id
    `;

    const params = {
      id: conceptId,
      globalId: `${this.namespace}:concept:${conceptId}`,
      name: conceptData.name,
      description: conceptData.description || '',
      synonymsJson: JSON.stringify(conceptData.synonyms || []),
      businessContext: conceptData.businessContext || '',
      entityId: conceptData.entityId || '',
      confidence: conceptData.confidence || 0.8,
      embeddingJson: embedding ? JSON.stringify(embedding) : '',
      now,
    };

    await this.memgraphService.runQuery(query, params);

    // Link to structural entity
    if (conceptData.entityId) {
      await this._linkConceptToStructural(conceptId, conceptData.entityId);
    }

    return { id: conceptId, name: params.name, description: params.description };
  }

  /**
   * Generate concepts from structural entities using LLM.
   */
  async generateConceptsFromEntities(entities, context = {}) {
    if (!this.llmService) {
      return { created: [], skipped: entities.length };
    }

    const results = { created: [], failed: [] };

    for (const entity of entities) {
      try {
        const conceptData = await this._generateConceptWithLLM(entity);
        const concept = await this.createConcept({
          ...conceptData,
          entityId: entity.id,
        }, context);
        results.created.push(concept);
      } catch (error) {
        results.failed.push({ entity: entity.name, error: error.message });
      }
    }

    return results;
  }

  // ============================================================
  // VOCABULARY
  // ============================================================

  /**
   * Add vocabulary mapping (technical → business term).
   * Uses MERGE to avoid duplicates.
   */
  async addVocabularyEntry(entry, context = {}) {
    const entryId = uuidv4();
    const now = new Date().toISOString();

    const query = `
      MERGE (v:DomainVocabulary:SEMANTIC {technicalName: $technicalName})
      ON CREATE SET
        v.id = $id,
        v.businessTerm = $businessTerm,
        v.context = $context,
        v.extractionSessionId = $sessionId,
        v.createdAt = $now,
        v.updatedAt = $now
      ON MATCH SET
        v.businessTerm = $businessTerm,
        v.context = $context,
        v.updatedAt = $now
      RETURN v.id as id, v.technicalName as technicalName, v.businessTerm as businessTerm
    `;

    const result = await this.memgraphService.runQuery(query, {
      id: entryId,
      technicalName: entry.technicalName,
      businessTerm: entry.businessTerm,
      context: entry.context || '',
      sessionId: context.sessionId || '',
      now,
    });

    return result && result[0] ? result[0] : { id: entryId, ...entry };
  }

  /**
   * Bulk add vocabulary entries.
   */
  async addVocabularyEntries(entries, context = {}) {
    const results = [];
    for (const entry of entries) {
      try {
        const result = await this.addVocabularyEntry(entry, context);
        results.push(result);
      } catch {
        // Skip failed entries
      }
    }
    return results;
  }

  /**
   * Translate technical name to business term.
   */
  async translateTerm(technicalName) {
    const result = await this.memgraphService.runQuery(
      `MATCH (v:DomainVocabulary {technicalName: $technicalName})
       RETURN v.businessTerm as businessTerm, v.context as context`,
      { technicalName }
    );
    return result && result[0] ? result[0] : null;
  }

  /**
   * Generate vocabulary from database objects using LLM.
   */
  async generateVocabulary(objects, context = {}) {
    if (!this.llmService) {
      return { created: 0, entries: [] };
    }

    const objectNames = objects.slice(0, 50).map(o =>
      typeof o === 'string' ? o : o.name
    );

    const messages = [
      {
        role: 'system',
        content: `Generate business-friendly names for technical database terms.
Respond with a JSON array:
[{"technicalName":"sp_ApproveDoc","businessTerm":"Document Approval","context":"Workflow"}]
Only include entries where you can confidently determine the business meaning.`,
      },
      {
        role: 'user',
        content: `Technical names: ${objectNames.join(', ')}`,
      },
    ];

    try {
      const response = await this.llmService.chat(messages);
      const content = response?.content || response;
      const entries = this._parseJsonResponse(content);

      if (Array.isArray(entries) && entries.length > 0) {
        const created = await this.addVocabularyEntries(entries, context);
        return { created: created.length, entries: created };
      }
    } catch {
      // LLM call failed
    }

    return { created: 0, entries: [] };
  }

  // ============================================================
  // CROSS-DOMAIN LINKS
  // ============================================================

  async _linkRuleToBehavioral(ruleId, behavioralNodeId) {
    await this.memgraphService.runQuery(
      `MATCH (r:SemanticRule {id: $ruleId})
       MATCH (b:BehavioralNode {id: $nodeId})
       MERGE (b)-[:CROSS_DOMAIN {
         edgeType: 'ENFORCES',
         sourceDomain: 'BEHAVIORAL',
         targetDomain: 'SEMANTIC'
       }]->(r)`,
      { ruleId, nodeId: behavioralNodeId }
    ).catch(() => {}); // Node may not exist yet
  }

  async _linkRuleToStructural(ruleId, entityId) {
    await this.memgraphService.runQuery(
      `MATCH (r:SemanticRule {id: $ruleId})
       MATCH (e:StructuralEntity {id: $entityId})
       MERGE (r)-[:CROSS_DOMAIN {
         edgeType: 'APPLIES_TO',
         sourceDomain: 'SEMANTIC',
         targetDomain: 'STRUCTURAL'
       }]->(e)`,
      { ruleId, entityId }
    ).catch(() => {});
  }

  async _linkCalculationToBehavioral(calcId, behavioralNodeId) {
    await this.memgraphService.runQuery(
      `MATCH (c:SemanticCalculation {id: $calcId})
       MATCH (b:BehavioralNode {id: $nodeId})
       MERGE (b)-[:CROSS_DOMAIN {
         edgeType: 'COMPUTES',
         sourceDomain: 'BEHAVIORAL',
         targetDomain: 'SEMANTIC'
       }]->(c)`,
      { calcId, nodeId: behavioralNodeId }
    ).catch(() => {});
  }

  async _linkConceptToStructural(conceptId, entityId) {
    await this.memgraphService.runQuery(
      `MATCH (c:SemanticConcept {id: $conceptId})
       MATCH (e:StructuralEntity {id: $entityId})
       MERGE (c)-[:CROSS_DOMAIN {
         edgeType: 'DEFINED_BY',
         sourceDomain: 'SEMANTIC',
         targetDomain: 'STRUCTURAL'
       }]->(e)`,
      { conceptId, entityId }
    ).catch(() => {});
  }

  // ============================================================
  // LLM ENRICHMENT
  // ============================================================

  /**
   * Uses llmService.chat([messages]) — project convention.
   */
  async _enrichRuleWithLLM(ruleData) {
    const messages = [
      {
        role: 'system',
        content: 'Convert technical SQL conditions into clear business rule descriptions. Respond with ONLY the business rule in plain English, one sentence.',
      },
      {
        role: 'user',
        content: `Technical expression: ${ruleData.expression}\nContext: ${ruleData.sourceProcedure ? `From procedure ${ruleData.sourceProcedure}` : 'Unknown'}${ruleData.name ? `\nRule name hint: ${ruleData.name}` : ''}`,
      },
    ];

    try {
      const response = await this.llmService.chat(messages);
      const content = response?.content || response;
      return typeof content === 'string' ? content.trim() : null;
    } catch {
      return null;
    }
  }

  async _enrichCalculationWithLLM(calcData) {
    const messages = [
      {
        role: 'system',
        content: 'Describe this calculation in plain business language. Respond with ONLY a clear description, one sentence.',
      },
      {
        role: 'user',
        content: `Formula: ${calcData.formula}\nOutput variable: ${calcData.outputVariable || 'unknown'}\nData type: ${calcData.dataType || 'unknown'}`,
      },
    ];

    try {
      const response = await this.llmService.chat(messages);
      const content = response?.content || response;
      return typeof content === 'string' ? content.trim() : null;
    } catch {
      return null;
    }
  }

  async _generateConceptWithLLM(entity) {
    const messages = [
      {
        role: 'system',
        content: `Generate a business concept description for a database entity.
Respond in JSON:
{"name":"Business-friendly name","description":"What this entity represents","synonyms":["alt names"],"businessContext":"Domain area"}`,
      },
      {
        role: 'user',
        content: `Entity: ${entity.name}\nTable: ${entity.tableName || entity.name}\nAttributes: ${JSON.stringify(entity.attributes || []).substring(0, 500)}`,
      },
    ];

    try {
      const response = await this.llmService.chat(messages);
      const content = response?.content || response;
      return this._parseJsonResponse(content) || {
        name: entity.name,
        description: '',
        synonyms: [],
        businessContext: '',
      };
    } catch {
      return { name: entity.name, description: '', synonyms: [], businessContext: '' };
    }
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Get all semantic content for a session.
   */
  async getSemanticContentForSession(sessionId) {
    const [rules, calculations, concepts] = await Promise.all([
      this.memgraphService.runQuery(
        `MATCH (r:SemanticRule {extractionSessionId: $sessionId})
         RETURN r.id as id, r.name as name, r.expression as expression,
                r.naturalLanguage as naturalLanguage, r.ruleType as ruleType
         ORDER BY r.createdAt`,
        { sessionId }
      ),
      this.memgraphService.runQuery(
        `MATCH (c:SemanticCalculation {extractionSessionId: $sessionId})
         RETURN c.id as id, c.name as name, c.formula as formula,
                c.naturalLanguage as naturalLanguage, c.outputVariable as outputVariable
         ORDER BY c.createdAt`,
        { sessionId }
      ),
      this.memgraphService.runQuery(
        `MATCH (c:SemanticConcept {extractionSessionId: $sessionId})
         RETURN c.id as id, c.name as name, c.description as description,
                c.businessContext as businessContext
         ORDER BY c.createdAt`,
        { sessionId }
      ),
    ]);

    return {
      rules: rules || [],
      calculations: calculations || [],
      concepts: concepts || [],
    };
  }

  /**
   * Get semantic summary statistics.
   */
  async getSemanticStats() {
    // Memgraph: run separate count queries (combined queries can be unreliable)
    const [rules, calcs, concepts, vocab] = await Promise.all([
      this.memgraphService.runQuery('MATCH (r:SemanticRule) RETURN count(r) as cnt'),
      this.memgraphService.runQuery('MATCH (c:SemanticCalculation) RETURN count(c) as cnt'),
      this.memgraphService.runQuery('MATCH (c:SemanticConcept) RETURN count(c) as cnt'),
      this.memgraphService.runQuery('MATCH (v:DomainVocabulary) RETURN count(v) as cnt'),
    ]);

    const toNum = (r) => {
      const val = r?.[0]?.cnt;
      return typeof val === 'object' && val?.toNumber ? val.toNumber() : (val || 0);
    };

    return {
      ruleCount: toNum(rules),
      calcCount: toNum(calcs),
      conceptCount: toNum(concepts),
      vocabCount: toNum(vocab),
    };
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  _cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  _parseJsonResponse(content) {
    if (!content) return null;
    const text = typeof content === 'string' ? content : JSON.stringify(content);

    // Try direct parse
    try {
      return JSON.parse(text);
    } catch {
      // Try extracting JSON from markdown code block
      const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try { return JSON.parse(match[1].trim()); } catch { /* fall through */ }
      }
      // Try finding first { or [
      const start = text.search(/[{[]/);
      if (start >= 0) {
        try { return JSON.parse(text.substring(start)); } catch { /* fall through */ }
      }
    }
    return null;
  }
}

module.exports = {
  SemanticDomainService,
  SemanticNodeType,
  RuleType,
  RuleSeverity,
};
