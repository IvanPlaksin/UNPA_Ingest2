/**
 * MetaLearningRetriever
 *
 * Finds similar past ingestion sessions for meta-learning.
 * Uses Memgraph to query session history, table profiles,
 * effective prompts, and successful decisions.
 *
 * Part of A.6 — provides context for STEP 0 (META_CONSULTATION).
 */

class MetaLearningRetriever {
  /**
   * @param {Object} memgraphService - Memgraph service with runQuery()
   */
  constructor(memgraphService) {
    this.mg = memgraphService;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Session Search
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Find similar past sessions for a given database.
   */
  async findSimilarSessions(criteria, limit = 5) {
    const {
      database,
      sourceType = 'mssql',
      tableCount,
    } = criteria;

    const neo4j = require('neo4j-driver');
    const intLimit = neo4j.int(parseInt(limit) || 5);

    // First: exact database match
    let result = await this.mg.runQuery(`
      MATCH (s:IngestionSession)
      WHERE s.status = 'complete'
        AND s.sourceDatabase = $database
        AND s.qualityScore >= 0.5
      RETURN s
      ORDER BY s.qualityScore DESC, s.startedAt DESC
      LIMIT $limit
    `, { database: database || '', limit: intLimit });

    if (result && result.length > 0) {
      return result.map(r => this._props(r.s || r));
    }

    // Fallback: same source type, similar size
    result = await this.mg.runQuery(`
      MATCH (s:IngestionSession)
      WHERE s.status = 'complete'
        AND s.sourceType = $sourceType
        AND s.qualityScore >= 0.5
      RETURN s
      ORDER BY s.qualityScore DESC
      LIMIT $limit
    `, { sourceType, limit: intLimit });

    return (result || []).map(r => this._props(r.s || r));
  }

  // ═══════════════════════════════════════════════════════════════════
  // Best Practices Extraction
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Extract best practices from a set of sessions.
   */
  async extractBestPractices(sessionIds) {
    if (!sessionIds || sessionIds.length === 0) return null;

    const practices = {
      effectivePrompts: [],
      successfulDecisions: [],
      classificationPatterns: [],
      antiPatterns: [],
      sessionCount: sessionIds.length,
    };

    // 1. Effective prompts (quality >= 0.8)
    try {
      const prompts = await this.mg.runQuery(`
        MATCH (s:IngestionSession)-[:HAS_PHASE]->(:IngestionPhase)-[:HAS_STEP]->(:AgentStep)-[:USED_PROMPT]->(p:PromptRecord)
        WHERE s.id IN $ids AND p.qualityRating >= 0.8
        RETURN p.promptType as promptType, p.promptTemplate as template, p.qualityRating as rating
        ORDER BY p.qualityRating DESC
        LIMIT 10
      `, { ids: sessionIds });

      practices.effectivePrompts = (prompts || []).map(r => ({
        promptType: r.promptType,
        template: r.template,
        rating: r.rating,
      }));
    } catch (_) {}

    // 2. Successful decisions
    try {
      const decisions = await this.mg.runQuery(`
        MATCH (s:IngestionSession)-[:HAS_PHASE]->(:IngestionPhase)-[:HAS_STEP]->(:AgentStep)-[:MADE_DECISION]->(d:AgentDecision)
        WHERE s.id IN $ids AND d.wasCorrect = true
        RETURN d.decisionType as type, d.chosenOption as option, d.reasoning as reasoning
        LIMIT 20
      `, { ids: sessionIds });

      practices.successfulDecisions = (decisions || []).map(r => ({
        type: r.type,
        option: r.option,
        reasoning: r.reasoning,
      }));
    } catch (_) {}

    // 3. Classification patterns
    try {
      const classifications = await this.mg.runQuery(`
        MATCH (s:IngestionSession)-[:PROFILED_TABLE]->(t:TableProfile)
        WHERE s.id IN $ids
        RETURN t.tableName as tableName, t.classifiedAs as classifiedAs, t.confidence as confidence
        LIMIT 50
      `, { ids: sessionIds });

      practices.classificationPatterns = (classifications || []).map(r => ({
        tableName: r.tableName,
        classifiedAs: r.classifiedAs,
        confidence: r.confidence,
      }));
    } catch (_) {}

    // 4. Anti-patterns (failed phases)
    try {
      const failures = await this.mg.runQuery(`
        MATCH (s:IngestionSession)-[:HAS_PHASE]->(p:IngestionPhase)
        WHERE s.id IN $ids AND p.status = 'failed'
        RETURN p.phaseName as phase, p.errorMessage as error
        LIMIT 10
      `, { ids: sessionIds });

      practices.antiPatterns = (failures || []).map(r => ({
        phase: r.phase,
        error: r.error,
      }));
    } catch (_) {}

    return practices;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Post-hoc Rating Updates
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Update prompt quality rating post-hoc.
   */
  async updatePromptRating(promptId, rating, notes = null) {
    await this.mg.runQuery(`
      MATCH (p:PromptRecord {id: $promptId})
      SET p.qualityRating = $rating,
          p.improvementNotes = $notes,
          p.wasEffective = $wasEffective
    `, {
      promptId,
      rating,
      notes: notes || '',
      wasEffective: rating >= 0.7,
    });
  }

  /**
   * Update decision outcome post-hoc.
   */
  async updateDecisionOutcome(decisionId, outcome, wasCorrect) {
    await this.mg.runQuery(`
      MATCH (d:AgentDecision {id: $decisionId})
      SET d.outcome = $outcome,
          d.wasCorrect = $wasCorrect
    `, { decisionId, outcome, wasCorrect });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Strategy Evolution
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get the active strategy version.
   */
  async getActiveStrategy() {
    const result = await this.mg.runQuery(`
      MATCH (s:StrategyVersion {isActive: true})
      RETURN s
      LIMIT 1
    `);

    return result && result.length > 0 ? this._props(result[0].s || result[0]) : null;
  }

  /**
   * Create a new strategy version, deactivating the previous one.
   */
  async createStrategyVersion(strategyData, basedOnSessionIds) {
    const id = require('uuid').v4();

    // Deactivate current active
    await this.mg.runQuery(`
      MATCH (s:StrategyVersion {isActive: true})
      SET s.isActive = false
    `);

    // Create new version
    await this.mg.runQuery(`
      CREATE (s:StrategyVersion {
        id: $id,
        version: $version,
        basedOnSessions: $sessions,
        changes: $changes,
        createdAt: $createdAt,
        performanceDelta: $delta,
        isActive: true
      })
    `, {
      id,
      version: strategyData.version || '1.0',
      sessions: JSON.stringify(basedOnSessionIds || []),
      changes: JSON.stringify(strategyData.changes || {}),
      createdAt: new Date().toISOString(),
      delta: strategyData.performanceDelta || 0,
    });

    return id;
  }

  _props(node) {
    if (!node) return {};
    return node.properties || node;
  }
}

module.exports = { MetaLearningRetriever };
