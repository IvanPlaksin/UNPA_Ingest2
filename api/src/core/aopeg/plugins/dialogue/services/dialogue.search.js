/**
 * DialogueSearchService — Three-stage hybrid retrieval
 * Stage 1: Qdrant vector search
 * Stage 2: Memgraph graph expansion (decisions, chains, backlog)
 * Stage 3: Scoring and ranking
 */

class DialogueSearchService {
  constructor(qdrantService, memgraphService, embeddingService) {
    this.qdrant = qdrantService;
    this.memgraph = memgraphService;
    this.embedding = embeddingService;
    this._collectionName = 'dialogue_embeddings';
  }

  /**
   * Main search method.
   * @param {string} query
   * @param {object} options
   * @param {object} [options.filters] - platform, startDate, endDate, participant
   * @param {number} [options.limit=20]
   * @param {boolean} [options.includeDecisions=true]
   * @param {boolean} [options.expandGraph=true]
   * @param {'summary'|'content'} [options.vectorName='summary']
   */
  async search(query, options = {}) {
    if (!query || !query.trim()) return [];

    const startMs = Date.now();
    const limit = options.limit || 20;

    // Stage 1: embed query + Qdrant vector search
    const queryEmbedding = await this.embedding.generateEmbedding(query.trim());
    const vectorResults = await this._vectorSearch(queryEmbedding, options.filters, Math.min(limit * 3, 100), options.vectorName || 'summary');

    if (!vectorResults.length) return [];

    // Stage 2: graph expansion
    let graphContext = {};
    if (options.expandGraph !== false) {
      const sessionIds = [...new Set(vectorResults.map(r => r.payload?.sessionId).filter(Boolean))];
      graphContext = await this._graphExpand(sessionIds);
    }

    // Stage 3: score and rank
    const ranked = this._scoreAndRank(vectorResults, graphContext, options);
    const results = ranked.slice(0, limit);

    try {
      const { getDialogueMetrics } = require('./dialogue.metrics');
      getDialogueMetrics().recordSearchLatency(Date.now() - startMs);
    } catch { /* non-fatal */ }

    return results;
  }

  // ── Stage 1: Vector Search ─────────────────────────────────────────────────

  async _vectorSearch(queryEmbedding, filters, limit, vectorName) {
    try {
      const qdrantFilter = this._buildQdrantFilters(filters);
      const results = await this.qdrant.search(queryEmbedding, vectorName, qdrantFilter, limit);
      return results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload,
        nodeType: r.payload?.node_type || 'unknown',
      }));
    } catch (err) {
      console.warn(`[DialogueSearch] Vector search failed: ${err.message}`);
      return [];
    }
  }

  _buildQdrantFilters(filters) {
    if (!filters) return null;
    const must = [];

    if (filters.platform) {
      must.push({ key: 'platform', match: { value: filters.platform } });
    }
    if (filters.participant) {
      must.push({ key: 'dominantParticipant', match: { value: filters.participant } });
    }
    if (filters.startDate || filters.endDate) {
      const range = {};
      if (filters.startDate) range.gte = filters.startDate;
      if (filters.endDate) range.lte = filters.endDate;
      must.push({ key: 'startedAt', range });
    }

    return must.length ? { must } : null;
  }

  // ── Stage 2: Graph Expansion ───────────────────────────────────────────────

  async _graphExpand(sessionIds) {
    if (!sessionIds.length) return {};
    try {
      const rows = await this.memgraph.runQuery(
        `UNWIND $sessionIds AS sid
         MATCH (s:DialogueSession { sessionId: sid })
         OPTIONAL MATCH (s)-[:DECIDED_IN_SESSION]-(d:ArchDecision)
         OPTIONAL MATCH (s)-[:CONTINUES_FROM]-(chain:DialogueSession)
         OPTIONAL MATCH (s)-[:DISCUSSES]->(bl:BackLogTask)
         RETURN sid,
                collect(DISTINCT d.decisionId) AS decisions,
                collect(DISTINCT chain.sessionId) AS chainedSessions,
                collect(DISTINCT bl.backlogId) AS backlogItems`,
        { sessionIds }
      );

      const ctx = {};
      for (const r of rows) {
        ctx[r.sid] = {
          decisions: r.decisions || [],
          chainedSessions: r.chainedSessions || [],
          backlogItems: r.backlogItems || [],
        };
      }
      return ctx;
    } catch (err) {
      console.warn(`[DialogueSearch] Graph expand failed: ${err.message}`);
      return {};
    }
  }

  // ── Stage 3: Scoring and Ranking ──────────────────────────────────────────

  _scoreAndRank(vectorResults, graphContext, options) {
    const now = Date.now();

    return vectorResults
      .map(r => {
        const ctx = graphContext[r.payload?.sessionId] || {};
        const recency = this._recencyBoost(r.payload?.startedAt, now);

        const finalScore =
          0.50 * r.score +
          0.20 * (ctx.decisions?.length > 0 ? Math.min(ctx.decisions.length * 0.1, 0.5) : 0) +
          0.15 * (ctx.chainedSessions?.length > 0 ? 0.3 : 0) +
          0.10 * recency +
          0.05 * (ctx.backlogItems?.length > 0 ? 0.2 : 0);

        return { ...r, finalScore, context: ctx };
      })
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  _recencyBoost(timestampStr, now) {
    if (!timestampStr) return 0;
    try {
      const ts = new Date(timestampStr).getTime();
      const daysDiff = (now - ts) / (1000 * 86400);
      return Math.exp(-daysDiff / 30); // half-life ~30 days
    } catch {
      return 0;
    }
  }

  // ── Specialized: Decision Provenance ─────────────────────────────────────

  async traceDecisionProvenance(query, limit = 10) {
    if (!query) return [];

    const neo4j = require('neo4j-driver');
    const qLower = query.toLowerCase();

    // First, find matching decision IDs
    const decRows = await this.memgraph.runQuery(
      `MATCH (d:ArchDecision)
       WHERE toLower(d.title) CONTAINS $q
          OR toLower(d.decision) CONTAINS $q
       RETURN d.decisionId AS decisionId,
              d.title AS title,
              d.decision AS decision,
              d.rationale AS rationale,
              d.category AS category,
              d.confidence AS confidence,
              d.status AS status,
              d.sessionId AS sessionId,
              d.segmentId AS segmentId,
              d.createdAt AS createdAt
       ORDER BY d.confidence DESC
       LIMIT $limit`,
      { q: qLower, limit: neo4j.int(limit) }
    );

    // Enrich with session titles + codex rules
    const rows = await Promise.all(decRows.map(async (d) => {
      let sessionTitle = null;
      try {
        const sessRows = await this.memgraph.runQuery(
          'MATCH (s:DialogueSession { sessionId: $sid }) RETURN s.title AS title LIMIT 1',
          { sid: d.sessionId }
        );
        sessionTitle = sessRows[0]?.title || null;
      } catch { /* non-fatal */ }

      return {
        ...d,
        provenance: { segmentId: d.segmentId, sessionId: d.sessionId, sessionTitle },
        codexRules: [],
      };
    }));

    return rows;

    return rows.map(r => ({
      decisionId: r.decisionId,
      title: r.title,
      decision: r.decision,
      rationale: r.rationale,
      category: r.category,
      confidence: r.confidence,
      status: r.status,
      createdAt: r.createdAt,
      provenance: {
        segmentId: r.segmentId,
        sessionId: r.sessionId,
        sessionTitle: r.sessionTitle,
      },
      codexRules: r.codexRules || [],
    }));
  }

  // ── Specialized: Related Sessions ─────────────────────────────────────────

  async findRelatedSessions(sessionId, limit = 5) {
    const neo4j = require('neo4j-driver');
    const rows = await this.memgraph.runQuery(
      `MATCH (s:DialogueSession { sessionId: $sid })-[c:CONTINUES_FROM]-(related:DialogueSession)
       RETURN related.sessionId AS relatedId,
              related.title AS title,
              related.startedAt AS startedAt,
              c.score AS chainScore
       ORDER BY c.score DESC
       LIMIT $limit`,
      { sid: sessionId, limit: neo4j.int(limit) }
    );

    return rows
      .filter(r => r.relatedId)
      .map(r => ({
        sessionId: r.relatedId,
        title: r.title,
        startedAt: r.startedAt,
        chainScore: r.chainScore,
      }));
  }
}

module.exports = { DialogueSearchService };
