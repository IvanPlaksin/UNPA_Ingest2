/**
 * BlackCodex Service - Failed approaches and anti-patterns
 *
 * "Not a garbage bin, but institutional memory of mistakes"
 *
 * Structure mirrors Codex but stores:
 * - Rejected proposals
 * - Anti-patterns discovered
 * - Failed approaches with diagnosis
 * - Resolved contradictions
 */

const { v7: uuidv7 } = require('uuid');
const { BLACK_CODEX_TYPES } = require('../../validation/codex-schemas');

let _memgraph = null;
function getMemgraph() {
  if (!_memgraph) {
    _memgraph = require('../memgraph.service');
  }
  return _memgraph;
}

class BlackCodexService {
  constructor() {
    this.namespace = 'BlackCodex';
  }

  // ============================================================
  // ID GENERATION
  // ============================================================

  async generateBlackCodexId() {
    const mg = getMemgraph();
    const query = `
      MATCH (n:BlackCodexEntry)
      WHERE n.codexId STARTS WITH 'BLACKCODEX-'
      RETURN n.codexId AS codexId
      ORDER BY n.codexId DESC
      LIMIT 1
    `;

    const result = await mg.runQuery(query);

    let nextSeq = 1;
    if (result.length > 0) {
      const lastId = result[0].codexId;
      const lastSeq = parseInt(lastId.split('-').pop(), 10);
      nextSeq = lastSeq + 1;
    }

    return `BLACKCODEX-${String(nextSeq).padStart(3, '0')}`;
  }

  // ============================================================
  // CREATE OPERATIONS
  // ============================================================

  async createEntry(type, data, context = {}) {
    if (!BLACK_CODEX_TYPES.includes(type)) {
      throw new Error(`Invalid BlackCodex type: ${type}. Must be one of: ${BLACK_CODEX_TYPES.join(', ')}`);
    }

    const id = uuidv7();
    const codexId = await this.generateBlackCodexId();
    const now = new Date().toISOString();

    const entry = {
      id,
      codexId,
      namespace: this.namespace,
      type,
      title: data.title,
      summary: data.summary,
      failureContext: data.failureContext,
      symptom: data.symptom,
      rootCause: data.rootCause,
      refactoringPlan: data.refactoringPlan,
      alternativeTo: data.alternativeTo || '',
      confidenceInDiagnosis: data.confidenceInDiagnosis || 0.8,
      status: 'ACTIVE',
      referenceCount: 0,
      tags: Array.isArray(data.tags) ? JSON.stringify(data.tags) : '[]',
      createdAt: now,
      createdBy: context.createdBy || 'system'
    };

    const mg = getMemgraph();
    const query = `
      CREATE (n:BlackCodexEntry $props)
      RETURN n
    `;

    const result = await mg.runQuery(query, { props: entry });
    return result[0]?.n?.properties || entry;
  }

  // ============================================================
  // READ OPERATIONS
  // ============================================================

  async getByCodexId(codexId) {
    const mg = getMemgraph();
    const query = `
      MATCH (n:BlackCodexEntry {codexId: $codexId})
      RETURN n
    `;
    const result = await mg.runQuery(query, { codexId });
    return result[0]?.n || null;
  }

  async getByType(type) {
    const mg = getMemgraph();
    const query = `
      MATCH (n:BlackCodexEntry {type: $type})
      WHERE n.status = 'ACTIVE'
      RETURN n
      ORDER BY n.createdAt DESC
    `;
    const result = await mg.runQuery(query, { type });
    return result.map(r => r.n);
  }

  async getAll() {
    const mg = getMemgraph();
    const query = `
      MATCH (n:BlackCodexEntry)
      WHERE n.status = 'ACTIVE'
      RETURN n
      ORDER BY n.createdAt DESC
    `;
    const result = await mg.runQuery(query);
    return result.map(r => r.n);
  }

  async getAntiPatternFor(codexRuleId) {
    const mg = getMemgraph();
    const query = `
      MATCH (b:BlackCodexEntry {alternativeTo: $codexRuleId, type: 'AntiPattern'})
      WHERE b.status = 'ACTIVE'
      RETURN b
    `;
    const result = await mg.runQuery(query, { codexRuleId });
    return result.map(r => r.b);
  }

  // ============================================================
  // RELATIONSHIP OPERATIONS
  // ============================================================

  async linkToCorrectApproach(blackCodexId, codexRuleId) {
    const mg = getMemgraph();
    const query = `
      MATCH (b:BlackCodexEntry {codexId: $blackCodexId})
      MATCH (r {codexId: $codexRuleId, namespace: 'Codex'})
      CREATE (b)-[rel:REJECTED_IN_FAVOR_OF {createdAt: $now}]->(r)
      SET b.alternativeTo = $codexRuleId
      RETURN rel
    `;

    const result = await mg.runQuery(query, {
      blackCodexId,
      codexRuleId,
      now: new Date().toISOString()
    });

    return result[0]?.rel || null;
  }

  async linkFailureToRule(codexRuleId, blackCodexId, severity = 'MEDIUM') {
    const mg = getMemgraph();
    const query = `
      MATCH (r:CodexRule {codexId: $codexRuleId})
      MATCH (b:BlackCodexEntry {codexId: $blackCodexId})
      CREATE (r)-[rel:HAS_KNOWN_FAILURE {severity: $severity, createdAt: $now}]->(b)
      RETURN rel
    `;

    const result = await mg.runQuery(query, {
      codexRuleId,
      blackCodexId,
      severity,
      now: new Date().toISOString()
    });

    return result[0]?.rel || null;
  }

  // ============================================================
  // REFERENCE TRACKING
  // ============================================================

  async recordReference(codexId) {
    const mg = getMemgraph();
    const query = `
      MATCH (n:BlackCodexEntry {codexId: $codexId})
      SET n.referenceCount = COALESCE(n.referenceCount, 0) + 1,
          n.lastReferencedAt = $now
      RETURN n.referenceCount AS count
    `;

    const result = await mg.runQuery(query, {
      codexId,
      now: new Date().toISOString()
    });

    return result[0]?.count || 0;
  }

  // ============================================================
  // ARCHIVE OPERATIONS
  // ============================================================

  async archive(codexId, archivedBy, reason) {
    const mg = getMemgraph();
    const query = `
      MATCH (n:BlackCodexEntry {codexId: $codexId})
      SET n.status = 'ARCHIVED',
          n.archivedAt = $now,
          n.archivedBy = $archivedBy,
          n.archiveReason = $reason
      RETURN n
    `;

    const result = await mg.runQuery(query, {
      codexId,
      now: new Date().toISOString(),
      archivedBy,
      reason
    });

    return result[0]?.n || null;
  }
}

module.exports = new BlackCodexService();
