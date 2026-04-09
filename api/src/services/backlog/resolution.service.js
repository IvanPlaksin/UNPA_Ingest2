/**
 * Resolution Service — Stores structured resolution records for completed tasks.
 *
 * A Resolution is a machine-readable summary of work done, written by the
 * Executor Agent before submitting for review (CODEX-RULE-BA-061).
 *
 * Structure is optimized for AI analysis: typed fields, arrays, nested objects.
 */
'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

class ResolutionService {
  /**
   * Save or update a resolution for a task.
   * @param {string} backlogId
   * @param {object} resolution - structured resolution data:
   *   {
   *     summary: string,
   *     approach: string,
   *     testResults: { passed: number, failed: number, skipped: number, details?: string },
   *     filesChanged: string[],
   *     filesCreated: string[],
   *     decisions: Array<{ decision: string, rationale: string }>,
   *     risksIdentified: Array<{ risk: string, severity: string, mitigation: string }>,
   *     recommendations: string[],
   *     acceptanceCriteriaStatus: Array<{ criterion: string, met: boolean, evidence: string }>
   *   }
   * @param {object} ctx - { agentId }
   */
  async saveResolution(backlogId, resolution, ctx = {}) {
    if (!resolution.summary || resolution.summary.length < 10) {
      throw new Error('resolution.summary is required (min 10 chars)');
    }

    const id = uuidv4();
    const now = new Date().toISOString();

    // Check if resolution already exists
    const existing = await mg().runQuery(
      `MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_RESOLUTION]->(r:Resolution) RETURN r`,
      { backlogId }
    );

    if (existing.length > 0) {
      // Update existing
      await mg().runQuery(`
        MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_RESOLUTION]->(r:Resolution)
        SET r.summary = $summary, r.approach = $approach,
            r.testResults = $testResults, r.filesChanged = $filesChanged,
            r.filesCreated = $filesCreated, r.decisions = $decisions,
            r.risksIdentified = $risksIdentified, r.recommendations = $recommendations,
            r.acceptanceCriteriaStatus = $acceptanceCriteriaStatus,
            r.resolvedBy = $agentId, r.updatedAt = $now
        RETURN r
      `, this._buildParams(backlogId, resolution, ctx.agentId, now));

      return { updated: true, backlogId };
    }

    // Create new
    await mg().runQuery(`
      MATCH (b:BackLogItem {backlogId: $backlogId})
      CREATE (r:Resolution {
        id: $id, nodeType: 'Resolution', backlogId: $backlogId,
        summary: $summary, approach: $approach,
        testResults: $testResults, filesChanged: $filesChanged,
        filesCreated: $filesCreated, decisions: $decisions,
        risksIdentified: $risksIdentified, recommendations: $recommendations,
        acceptanceCriteriaStatus: $acceptanceCriteriaStatus,
        resolvedBy: $agentId, createdAt: $now, updatedAt: $now
      })
      CREATE (b)-[:HAS_RESOLUTION {addedAt: $now}]->(r)
      RETURN r
    `, { id, ...this._buildParams(backlogId, resolution, ctx.agentId, now) });

    return { created: true, backlogId, id };
  }

  /**
   * Get the resolution for a task.
   */
  async getResolution(backlogId) {
    const rows = await mg().runQuery(
      `MATCH (b:BackLogItem {backlogId: $backlogId})-[:HAS_RESOLUTION]->(r:Resolution) RETURN r`,
      { backlogId }
    );

    if (rows.length === 0) return null;

    const r = rows[0].r.properties || rows[0].r;
    return this._deserialize(r);
  }

  _buildParams(backlogId, res, agentId, now) {
    return {
      backlogId, now,
      summary: res.summary || '',
      approach: res.approach || '',
      testResults: JSON.stringify(res.testResults || {}),
      filesChanged: JSON.stringify(res.filesChanged || []),
      filesCreated: JSON.stringify(res.filesCreated || []),
      decisions: JSON.stringify(res.decisions || []),
      risksIdentified: JSON.stringify(res.risksIdentified || []),
      recommendations: JSON.stringify(res.recommendations || []),
      acceptanceCriteriaStatus: JSON.stringify(res.acceptanceCriteriaStatus || []),
      agentId: agentId || 'unknown'
    };
  }

  _deserialize(r) {
    const jsonFields = ['testResults', 'filesChanged', 'filesCreated', 'decisions', 'risksIdentified', 'recommendations', 'acceptanceCriteriaStatus'];
    const result = { ...r };
    for (const f of jsonFields) {
      if (typeof result[f] === 'string') {
        try { result[f] = JSON.parse(result[f]); } catch { /* keep as string */ }
      }
    }
    return result;
  }
}

module.exports = new ResolutionService();
