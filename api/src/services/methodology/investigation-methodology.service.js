'use strict';

const { v4: uuidv4 } = require('uuid');
const neo4j = require('neo4j-driver');

let _mg;
function mg() {
  if (!_mg) _mg = require('../memgraph.service');
  return _mg;
}

const VALID_STATUSES = new Set(['DRAFT', 'ACTIVE', 'DEPRECATED']);

const now = () => new Date().toISOString();

/**
 * InvestigationMethodologyService
 *
 * Manages reusable, graph-backed investigation methodologies.
 *
 * Graph model:
 *   (:InvestigationMethodology { id, name, userCase, description,
 *     parameterSchema, qualityRubric, graphId, version, status, createdAt, updatedAt })
 *   (:InvestigationMethodology)-[:EXECUTES_GRAPH]->(:CatalogEntry { entryId: graphId })
 *
 * parameterSchema / qualityRubric are stored as JSON strings.
 *
 * execute() loads the GXE graph from the catalog, runs it via RuntimeEngine,
 * and saves the result as a PROPOSED artifact in the investigation session.
 */
class InvestigationMethodologyService {

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  async create({ name, userCase = '', description = '', parameterSchema = {}, qualityRubric = {}, graphId = null, version = '1.0.0' }) {
    if (!name) throw new Error('name is required');
    const id = uuidv4();
    const ts = now();

    await mg().runQuery(
      `CREATE (m:InvestigationMethodology {
         id: $id, name: $name, userCase: $userCase, description: $description,
         parameterSchema: $parameterSchema, qualityRubric: $qualityRubric,
         graphId: $graphId, version: $version,
         status: 'DRAFT', createdAt: $ts, updatedAt: $ts
       })`,
      {
        id, name, userCase, description,
        parameterSchema: JSON.stringify(parameterSchema),
        qualityRubric:   JSON.stringify(qualityRubric),
        graphId: graphId || null,
        version, ts,
      }
    );

    if (graphId) {
      await mg().runQuery(
        `MATCH (m:InvestigationMethodology {id: $id})
         MATCH (g:CatalogEntry {entryId: $graphId})
         MERGE (m)-[:EXECUTES_GRAPH]->(g)`,
        { id, graphId }
      ).catch(() => {}); // non-fatal if graph not yet in catalog
    }

    return this._row({ id, name, userCase, description, parameterSchema: JSON.stringify(parameterSchema), qualityRubric: JSON.stringify(qualityRubric), graphId, version, status: 'DRAFT', createdAt: ts, updatedAt: ts });
  }

  async getById(id) {
    const rows = await mg().runQuery(
      `MATCH (m:InvestigationMethodology {id: $id}) RETURN m`,
      { id }
    );
    return rows.length ? this._row(rows[0].m) : null;
  }

  async list({ status = null, limit = 50, offset = 0 } = {}) {
    const whereClause = status ? 'WHERE m.status = $status' : '';
    const rows = await mg().runQuery(
      `MATCH (m:InvestigationMethodology) ${whereClause}
       RETURN m
       ORDER BY m.createdAt DESC
       SKIP ${neo4j.int(offset)} LIMIT ${neo4j.int(limit)}`,
      status ? { status } : {}
    );
    return rows.map(r => this._row(r.m));
  }

  async update(id, { name, userCase, description, parameterSchema, qualityRubric, graphId, version } = {}) {
    const m = await this.getById(id);
    if (!m) throw new Error(`InvestigationMethodology not found: ${id}`);

    const updates = [];
    const params = { id, ts: now() };

    if (name        !== undefined) { updates.push('m.name = $name');               params.name = name; }
    if (userCase    !== undefined) { updates.push('m.userCase = $userCase');        params.userCase = userCase; }
    if (description !== undefined) { updates.push('m.description = $description');  params.description = description; }
    if (version     !== undefined) { updates.push('m.version = $version');          params.version = version; }
    if (parameterSchema !== undefined) {
      updates.push('m.parameterSchema = $parameterSchema');
      params.parameterSchema = JSON.stringify(parameterSchema);
    }
    if (qualityRubric !== undefined) {
      updates.push('m.qualityRubric = $qualityRubric');
      params.qualityRubric = JSON.stringify(qualityRubric);
    }
    if (graphId !== undefined) {
      updates.push('m.graphId = $graphId');
      params.graphId = graphId;
    }

    if (!updates.length) return m;

    updates.push('m.updatedAt = $ts');
    await mg().runQuery(
      `MATCH (m:InvestigationMethodology {id: $id}) SET ${updates.join(', ')}`,
      params
    );

    if (graphId !== undefined && graphId) {
      await mg().runQuery(
        `MATCH (m:InvestigationMethodology {id: $id})
         OPTIONAL MATCH (m)-[old:EXECUTES_GRAPH]->() DELETE old
         WITH m
         MATCH (g:CatalogEntry {entryId: $graphId})
         MERGE (m)-[:EXECUTES_GRAPH]->(g)`,
        { id, graphId }
      ).catch(() => {});
    }

    return this.getById(id);
  }

  async setStatus(id, status) {
    if (!VALID_STATUSES.has(status)) throw new Error(`Invalid status: ${status}. Must be DRAFT | ACTIVE | DEPRECATED`);
    const m = await this.getById(id);
    if (!m) throw new Error(`InvestigationMethodology not found: ${id}`);
    await mg().runQuery(
      `MATCH (m:InvestigationMethodology {id: $id}) SET m.status = $status, m.updatedAt = $ts`,
      { id, status, ts: now() }
    );
    return { ...m, status };
  }

  // ── Execute ───────────────────────────────────────────────────────────────────

  /**
   * Execute a methodology against an investigation session.
   *
   * @param {string} methodologyId
   * @param {object} parameters — caller-provided params (validated against parameterSchema)
   * @param {string} sessionId — investigation session to attach the result to
   * @param {object} services — { mcpRegistry, investigationVersionService, investigationArtifactService }
   * @returns {object} PROPOSED artifact
   */
  async execute(methodologyId, parameters, sessionId, services) {
    const { mcpRegistry, investigationVersionService, investigationArtifactService } = services;

    // 1. Load methodology
    const m = await this.getById(methodologyId);
    if (!m) throw new Error(`InvestigationMethodology not found: ${methodologyId}`);
    if (m.status === 'DEPRECATED') throw new Error(`Methodology '${m.name}' is deprecated`);

    // 2. Apply defaults + validate parameters
    const schema = m.parameterSchema;
    const resolvedParams = { ...parameters };
    for (const [key, def] of Object.entries(schema)) {
      if (resolvedParams[key] === undefined && def.default !== undefined) {
        resolvedParams[key] = def.default;
      }
    }
    const validationErrors = this._validateParams(resolvedParams, schema);
    if (validationErrors.length) {
      throw new Error(`Parameter validation failed: ${validationErrors.join('; ')}`);
    }

    // 3. Load graph from catalog
    if (!m.graphId) throw new Error(`Methodology '${m.name}' has no graphId — no graph to execute`);

    const { graphCatalogService } = require('../graphCatalog.service');
    const graphEntry = await graphCatalogService.getGraphById(m.graphId);
    if (!graphEntry) throw new Error(`Graph not found in catalog: ${m.graphId}`);

    const dag = {
      nodes: graphEntry.nodes || [],
      edges: graphEntry.edges || [],
      graphType: graphEntry.graphType || 'EXECUTABLE',
    };

    // 4. Execute graph via RuntimeEngine
    const { RuntimeEngine } = require('../../runtime/RuntimeEngine');
    const engine = new RuntimeEngine(mcpRegistry);
    const result = await engine.execute(dag, resolvedParams, {
      executionId: `mth-${methodologyId}-${Date.now()}`,
    });

    if (result.status !== 'COMPLETED') {
      const failedNodeEntries = Object.entries(result.nodeResults || {})
        .filter(([, nr]) => nr.status === 'FAILED' || nr.status === 'ERROR');

      // When ALL failures are UNRESOLVED_TEMPLATE it means an upstream node (e.g. LOCATE)
      // returned an empty collection — this is a data condition, not a graph error.
      // Return a NO_RESULTS artifact instead of throwing 500.
      const allUnresolved = failedNodeEntries.length > 0 &&
        failedNodeEntries.every(([, nr]) => nr.error === 'UNRESOLVED_TEMPLATE');

      if (allUnresolved) {
        const version = await investigationVersionService.getCurrent(sessionId);
        const artifact = await investigationArtifactService.saveProposed({
          sessionId,
          versionId: version?.versionId || null,
          stepId:        null,
          primitiveType: 'SYNTHESIZE',
          content: {
            methodology: m.name, methodologyId,
            parameters:  resolvedParams,
            executionResult: {
              status:  'NO_RESULTS',
              message: 'No entities matched the given parameters — the search returned an empty result set',
            },
          },
          evidenceEntityIds: ['methodology-execution'],
          producedBy: 'TOOL',
        });
        return {
          artifact,
          methodology: { id: m.id, name: m.name, version: m.version },
          executionId: result.executionId,
          status: 'NO_RESULTS',
        };
      }

      // Real graph failure — throw with details
      const detail = failedNodeEntries.map(([id, nr]) => {
        const msg = nr.details?.error || nr.error?.message || (typeof nr.error === 'string' ? nr.error : '') || nr.errors?.[0]?.message || 'unknown';
        return `${id}: ${msg}`;
      });
      throw new Error(`Graph execution failed: ${result.error?.message || result.status}${detail.length ? ` [${detail.join('; ')}]` : ''}`);
    }

    // 5. Extract evidencedBy from result outputs
    const evidencedBy = this._extractEvidencedBy(result);
    if (!evidencedBy.length) {
      evidencedBy.push('methodology-execution');
    }

    // 6. Get current version for the session
    const version = await investigationVersionService.getCurrent(sessionId);
    const versionId = version?.versionId || null;

    // 7. Save PROPOSED artifact
    const artifact = await investigationArtifactService.saveProposed({
      sessionId,
      versionId,
      stepId:            null,
      primitiveType:     'SYNTHESIZE',
      content:           { methodology: m.name, methodologyId, parameters: resolvedParams, executionResult: result.nodeResults || {} },
      evidenceEntityIds: evidencedBy,
      producedBy:        'TOOL',
    });

    return {
      artifact,
      methodology:   { id: m.id, name: m.name, version: m.version },
      executionId:   result.executionId,
      status:        result.status,
    };
  }

  // ── Evaluate ──────────────────────────────────────────────────────────────────

  /**
   * Evaluate artifact content against this methodology's qualityRubric.
   *
   * @param {object} content — artifact content (CGE envelope or legacy object)
   * @param {string} methodologyId
   * @returns {{ passed: boolean, scores: object, violations: string[] }}
   */
  async evaluateResult(content, methodologyId) {
    const m = await this.getById(methodologyId);
    if (!m) throw new Error(`InvestigationMethodology not found: ${methodologyId}`);

    const rubric = m.qualityRubric;
    const violations = [];
    const scores = {};

    // minEntityCount — require at least N nodes
    if (rubric.minEntityCount !== undefined) {
      const nodeCount = Array.isArray(content?.nodes) ? content.nodes.length : 0;
      scores.entityCount = nodeCount;
      if (nodeCount < rubric.minEntityCount) {
        violations.push(`entityCount ${nodeCount} < required ${rubric.minEntityCount}`);
      }
    }

    // minProvenanceRatio — fraction of nodes that have provenance/evidenceId
    if (rubric.minProvenanceRatio !== undefined) {
      const nodes = Array.isArray(content?.nodes) ? content.nodes : [];
      const withProv = nodes.filter(n => n.sourceDocumentId || n.evidenceId || n.createdAt).length;
      const ratio = nodes.length ? withProv / nodes.length : 0;
      scores.provenanceRatio = ratio;
      if (ratio < rubric.minProvenanceRatio) {
        violations.push(`provenanceRatio ${ratio.toFixed(2)} < required ${rubric.minProvenanceRatio}`);
      }
    }

    // minSourceCoverage — fraction of declared sources that contributed nodes
    if (rubric.minSourceCoverage !== undefined) {
      // Approximate: check if summary.totalFound or nodeCount is non-trivial
      const found = content?.summary?.totalFound ?? (Array.isArray(content?.nodes) ? content.nodes.length : 0);
      scores.sourceCoverageProxy = found;
      if (found === 0) {
        violations.push(`sourceCoverage: no results found (minSourceCoverage = ${rubric.minSourceCoverage})`);
      }
    }

    return {
      passed:     violations.length === 0,
      scores,
      violations,
      rubric,
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  _validateParams(params, schema) {
    const errors = [];
    for (const [key, def] of Object.entries(schema)) {
      if (def.required && (params[key] === undefined || params[key] === null || params[key] === '')) {
        errors.push(`Required parameter '${key}' is missing`);
      }
      if (params[key] !== undefined && def.type) {
        const ptype = Array.isArray(params[key]) ? 'array' : typeof params[key];
        if (ptype !== def.type) {
          errors.push(`Parameter '${key}' must be of type ${def.type}, got ${ptype}`);
        }
      }
    }
    return errors;
  }

  _extractEvidencedBy(result) {
    const ids = new Set();
    const visit = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (obj.evidencedBy) { obj.evidencedBy.forEach(id => ids.add(id)); return; }
      if (obj.nodes && Array.isArray(obj.nodes)) { obj.nodes.forEach(n => n.id && ids.add(n.id)); }
      Object.values(obj).forEach(v => { if (v && typeof v === 'object') visit(v); });
    };
    visit(result.outputs || {});
    return Array.from(ids);
  }

  _row(node) {
    const p = node.properties || node;
    return {
      id:              p.id,
      name:            p.name,
      userCase:        p.userCase || '',
      description:     p.description || '',
      parameterSchema: _parseJson(p.parameterSchema, {}),
      qualityRubric:   _parseJson(p.qualityRubric, {}),
      graphId:         p.graphId || null,
      version:         p.version || '1.0.0',
      status:          p.status,
      createdAt:       p.createdAt,
      updatedAt:       p.updatedAt,
    };
  }
}

function _parseJson(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

let _instance;
function getInvestigationMethodologyService() {
  if (!_instance) _instance = new InvestigationMethodologyService();
  return _instance;
}

module.exports = { InvestigationMethodologyService, getInvestigationMethodologyService };
