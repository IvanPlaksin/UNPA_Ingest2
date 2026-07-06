'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');
const { KB_TOUCHING_PRIMITIVES } = require('./investigation-artifact.service');

/**
 * InvestigationStepService
 *
 * Records each executed investigative primitive as a Step node forming
 * the "program chain" — the reproducible sequence of operations that
 * defines the investigation.
 *
 * Replay = re-execute the chain of steps with their recorded inputParams
 * against a pinned KB snapshot.
 *
 * Step chain: (step1)-[:STEP_FOLLOWS]->(step2)-[:STEP_FOLLOWS]->(step3)...
 * Each step also has STEP_IN_SESSION and STEP_IN_VERSION edges.
 * Each step that produces an artifact has a STEP_PRODUCES edge.
 */
class InvestigationStepService {
  constructor(memgraph) {
    this._mg = memgraph;
  }

  // ─── Record start of a step ────────────────────────────────────────────────

  async begin({ sessionId, versionId, primitiveType, inputParams = {}, createdBy = 'system' }) {
    const stepId = uuidv4();
    const createdAt = new Date().toISOString();
    const prevStepId = await this._getLatestStepId(sessionId);
    const triggersEvidentiaryVersion = KB_TOUCHING_PRIMITIVES.has(primitiveType);
    const inputParamsJson = JSON.stringify(inputParams);

    await this._mg.queryWithNamespace(
      `CREATE (s:InvestigationStep {
         stepId: $stepId,
         sessionId: $sessionId,
         versionId: $versionId,
         primitiveType: $primitiveType,
         inputParams: $inputParamsJson,
         prevStepId: $prevStepId,
         triggersEvidentiaryVersion: $triggersEvidentiaryVersion,
         status: 'RUNNING',
         createdAt: $createdAt,
         doneAt: null
       })`,
      { stepId, sessionId, versionId, primitiveType, inputParamsJson, prevStepId, triggersEvidentiaryVersion, createdAt }
    );

    // STEP_IN_SESSION
    await this._mg.queryWithNamespace(
      `MATCH (step:InvestigationStep { stepId: $stepId })
       MATCH (sess:InvestigationSession { sessionId: $sessionId })
       CREATE (step)-[:STEP_IN_SESSION]->(sess)`,
      { stepId, sessionId }
    );

    // STEP_IN_VERSION
    await this._mg.queryWithNamespace(
      `MATCH (step:InvestigationStep { stepId: $stepId })
       MATCH (v:InvestigationVersion { versionId: $versionId })
       CREATE (step)-[:STEP_IN_VERSION]->(v)`,
      { stepId, versionId }
    );

    // STEP_FOLLOWS chain
    if (prevStepId) {
      await this._mg.queryWithNamespace(
        `MATCH (curr:InvestigationStep { stepId: $stepId })
         MATCH (prev:InvestigationStep { stepId: $prevStepId })
         CREATE (curr)-[:STEP_FOLLOWS]->(prev)`,
        { stepId, prevStepId }
      );
    }

    return { stepId, sessionId, versionId, primitiveType, inputParams, prevStepId, triggersEvidentiaryVersion, status: 'RUNNING', createdAt };
  }

  // ─── Mark step as done (after artifact is saved) ───────────────────────────

  async complete(stepId, artifactId = null) {
    const doneAt = new Date().toISOString();
    await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationStep { stepId: $stepId })
       SET s.status = 'DONE', s.doneAt = $doneAt`,
      { stepId, doneAt }
    );

    if (artifactId) {
      await this._mg.queryWithNamespace(
        `MATCH (step:InvestigationStep { stepId: $stepId })
         MATCH (art:InvestigationArtifact { artifactId: $artifactId })
         MERGE (step)-[:STEP_PRODUCES]->(art)`,
        { stepId, artifactId }
      );
    }

    return { stepId, status: 'DONE', doneAt };
  }

  async fail(stepId, errorMessage = '') {
    const doneAt = new Date().toISOString();
    await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationStep { stepId: $stepId })
       SET s.status = 'FAILED', s.doneAt = $doneAt, s.errorMessage = $errorMessage`,
      { stepId, doneAt, errorMessage }
    );
    return { stepId, status: 'FAILED', doneAt };
  }

  // ─── Read ──────────────────────────────────────────────────────────────────

  async findById(stepId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationStep { stepId: $stepId }) RETURN s`,
      { stepId }
    );
    return rows.length > 0 ? this._map(rows[0].s) : null;
  }

  // Return the full program chain for a session (ordered, for replay)
  async getProgram(sessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationStep { sessionId: $sessionId })
       RETURN s ORDER BY s.createdAt ASC`,
      { sessionId }
    );
    return rows.map(r => this._map(r.s));
  }

  async listByVersion(sessionId, versionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationStep { sessionId: $sessionId, versionId: $versionId })
       RETURN s ORDER BY s.createdAt ASC`,
      { sessionId, versionId }
    );
    return rows.map(r => this._map(r.s));
  }

  // Get the step that produced a specific artifact (via STEP_PRODUCES edge)
  async getStepByArtifact(artifactId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationStep)-[:STEP_PRODUCES]->(a:InvestigationArtifact { artifactId: $artifactId })
       RETURN s LIMIT 1`,
      { artifactId }
    );
    return rows.length > 0 ? this._map(rows[0].s) : null;
  }

  // ─── Internal ──────────────────────────────────────────────────────────────

  async _getLatestStepId(sessionId) {
    const rows = await this._mg.queryWithNamespace(
      `MATCH (s:InvestigationStep { sessionId: $sessionId })
       RETURN s.stepId AS stepId ORDER BY s.createdAt DESC LIMIT 1`,
      { sessionId }
    );
    return rows.length > 0 ? rows[0].stepId : null;
  }

  _map(node) {
    const p = node.properties || node;
    let inputParams;
    try { inputParams = JSON.parse(p.inputParams || '{}'); } catch { inputParams = {}; }
    return {
      stepId: p.stepId,
      sessionId: p.sessionId,
      versionId: p.versionId,
      primitiveType: p.primitiveType,
      inputParams,
      prevStepId: p.prevStepId || null,
      triggersEvidentiaryVersion: p.triggersEvidentiaryVersion === true || p.triggersEvidentiaryVersion === 'true',
      status: p.status,
      createdAt: p.createdAt,
      doneAt: p.doneAt || null,
      errorMessage: p.errorMessage || null,
    };
  }
}

let _instance = null;
function getInvestigationStepService() {
  if (!_instance) {
    const mg = require('../memgraph.service');
    _instance = new InvestigationStepService(mg);
  }
  return _instance;
}

module.exports = { InvestigationStepService, getInvestigationStepService };
