'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const now = () => new Date().toISOString();

/**
 * Methodology Catalog — manages extraction methodology definitions in Memgraph.
 *
 * Graph model:
 *   (:Methodology)-[:USES_PROMPT]->(:PromptTemplate)
 *   (:Methodology)-[:USES_CONFIG]->(:PipelineConfig)
 *   (:Methodology)-[:USES_HOOKS]->(:HookSet)
 *   (:Methodology)-[:SUPERSEDES]->(:Methodology)
 */
class MethodologyService {

  // ── Methodology CRUD ────────────────────────────────────────────────────

  async createMethodology({
    name, version = '1.0', description = '',
    targetDocTypes = [], targetLayers = [],
    extractionDepth = 'STANDARD',
    promptTemplates = [], pipelineConfig = null, hookSet = null,
  }) {
    const id = uuidv4();
    const ts = now();
    await mg().runQuery(
      `CREATE (m:Methodology {
         id: $id, name: $name, version: $version, description: $description,
         targetDocTypes: $docTypes, targetLayers: $layers,
         extractionDepth: $depth,
         status: 'ACTIVE', createdAt: $ts, updatedAt: $ts
       })`,
      { id, name, version, description, docTypes: targetDocTypes, layers: targetLayers, depth: extractionDepth, ts }
    );

    for (const pt of promptTemplates) {
      await this._linkPromptTemplate(id, pt);
    }
    if (pipelineConfig) await this._linkPipelineConfig(id, pipelineConfig);
    if (hookSet) await this._linkHookSet(id, hookSet);

    return this.getMethodology(id);
  }

  async getMethodology(id) {
    const rows = await mg().runQuery(
      `MATCH (m:Methodology {id: $id})
       OPTIONAL MATCH (m)-[:USES_PROMPT]->(pt:PromptTemplate)
       OPTIONAL MATCH (m)-[:USES_CONFIG]->(pc:PipelineConfig)
       OPTIONAL MATCH (m)-[:USES_HOOKS]->(hs:HookSet)
       OPTIONAL MATCH (m)-[:SUPERSEDES]->(old:Methodology)
       WITH m,
            collect(DISTINCT {id: pt.id, phase: pt.phase, template: pt.template, version: pt.version}) AS prompts,
            collect(DISTINCT {id: pc.id, phases: pc.phases, chunkSize: pc.chunkSize, overlap: pc.overlap, maxTurns: pc.maxTurns, timeout: pc.timeout, mcpContext: pc.mcpContext}) AS configs,
            collect(DISTINCT {id: hs.id, hooks: hs.hooks}) AS hookSets,
            collect(DISTINCT {id: old.id, name: old.name, version: old.version}) AS supersedes
       RETURN m.id AS id, m.name AS name, m.version AS version,
              m.description AS description, m.targetDocTypes AS targetDocTypes,
              m.targetLayers AS targetLayers, m.extractionDepth AS extractionDepth,
              m.status AS status, m.createdAt AS createdAt, m.updatedAt AS updatedAt,
              prompts, configs, hookSets, supersedes`,
      { id }
    );
    if (!rows.length) return null;
    return _formatMethodology(rows[0]);
  }

  async listMethodologies({ status = null, extractionDepth = null, targetDocType = null } = {}) {
    const conds = [];
    const p = {};
    if (status)         { conds.push('m.status = $status');             p.status = status; }
    if (extractionDepth){ conds.push('m.extractionDepth = $depth');     p.depth = extractionDepth; }
    if (targetDocType)  { conds.push('$docType IN m.targetDocTypes');   p.docType = targetDocType; }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    const rows = await mg().runQuery(
      `MATCH (m:Methodology) ${where}
       RETURN m.id AS id, m.name AS name, m.version AS version,
              m.description AS description, m.targetDocTypes AS targetDocTypes,
              m.targetLayers AS targetLayers, m.extractionDepth AS extractionDepth,
              m.status AS status, m.createdAt AS createdAt
       ORDER BY m.name, m.version`,
      p
    );
    return rows;
  }

  async deprecateMethodology(id, { supersededById = null } = {}) {
    const ts = now();
    await mg().runQuery(
      `MATCH (m:Methodology {id: $id})
       SET m.status = 'DEPRECATED', m.updatedAt = $ts`,
      { id, ts }
    );
    if (supersededById) {
      await mg().runQuery(
        `MATCH (newM:Methodology {id: $newId}), (oldM:Methodology {id: $oldId})
         MERGE (newM)-[:SUPERSEDES]->(oldM)`,
        { newId: supersededById, oldId: id }
      );
    }
    return { id, deprecated: true };
  }

  // ── Methodology Selection ───────────────────────────────────────────────

  /**
   * Select the best methodology for a document profile.
   *
   * Resolution order:
   *   1. ACTIVE DerivedRule match (learned from metrics)
   *   2. Catalog match: exact docType+layer > docType > layer > DEFAULT fallback
   *
   * Returns { methodology, source: 'DERIVED_RULE'|'CATALOG_MATCH', ruleId? }
   * but also returns the methodology directly for backward compatibility.
   */
  async getMethodologyForDocument({ documentType = null, epistemicLayer = null, extractionDepth = 'STANDARD' } = {}) {
    // 1. Check ACTIVE DerivedRules first
    try {
      const { ruleDerivationService } = require('./rule-derivation.service');
      const rule = await ruleDerivationService.findMatchingRule({ documentType, epistemicLayer });
      if (rule?.recommendsMethodologyId) {
        const methodology = await this.getMethodology(rule.recommendsMethodologyId);
        if (methodology) {
          methodology._source  = 'DERIVED_RULE';
          methodology._ruleId  = rule.id;
          return methodology;
        }
      }
    } catch (e) {
      // Rule derivation service not available — fall through to catalog
    }

    // 2. Catalog resolution
    const methodology = await this._resolveFromCatalog(documentType, epistemicLayer, extractionDepth);
    if (methodology) {
      methodology._source = 'CATALOG_MATCH';
    }
    return methodology;
  }

  async _resolveFromCatalog(documentType, epistemicLayer, extractionDepth) {
    // Try: match by docType AND layer
    if (documentType && epistemicLayer) {
      const rows = await mg().runQuery(
        `MATCH (m:Methodology {status: 'ACTIVE', extractionDepth: $depth})
         WHERE $docType IN m.targetDocTypes AND $layer IN m.targetLayers
         RETURN m.id AS id ORDER BY m.createdAt DESC LIMIT 1`,
        { depth: extractionDepth, docType: documentType, layer: epistemicLayer }
      );
      if (rows.length) return this.getMethodology(rows[0].id);
    }

    // Try: match by docType only
    if (documentType) {
      const rows = await mg().runQuery(
        `MATCH (m:Methodology {status: 'ACTIVE', extractionDepth: $depth})
         WHERE $docType IN m.targetDocTypes
         RETURN m.id AS id ORDER BY m.createdAt DESC LIMIT 1`,
        { depth: extractionDepth, docType: documentType }
      );
      if (rows.length) return this.getMethodology(rows[0].id);
    }

    // Try: match by layer only
    if (epistemicLayer) {
      const rows = await mg().runQuery(
        `MATCH (m:Methodology {status: 'ACTIVE', extractionDepth: $depth})
         WHERE $layer IN m.targetLayers
         RETURN m.id AS id ORDER BY m.createdAt DESC LIMIT 1`,
        { depth: extractionDepth, layer: epistemicLayer }
      );
      if (rows.length) return this.getMethodology(rows[0].id);
    }

    // Fallback: DEFAULT methodology (empty targetDocTypes)
    const rows = await mg().runQuery(
      `MATCH (m:Methodology {status: 'ACTIVE', extractionDepth: $depth})
       WHERE size(m.targetDocTypes) = 0
       RETURN m.id AS id ORDER BY m.createdAt ASC LIMIT 1`,
      { depth: extractionDepth }
    );
    if (rows.length) return this.getMethodology(rows[0].id);

    // Any active methodology
    const fallback = await mg().runQuery(
      `MATCH (m:Methodology {status: 'ACTIVE'})
       RETURN m.id AS id ORDER BY m.createdAt ASC LIMIT 1`,
      {}
    );
    if (fallback.length) return this.getMethodology(fallback[0].id);

    return null;
  }

  // ── PromptTemplate ──────────────────────────────────────────────────────

  async _linkPromptTemplate(methodologyId, { phase, template, variables = [], version = '1.0' }) {
    const ptId = uuidv4();
    const ts = now();
    await mg().runQuery(
      `MATCH (m:Methodology {id: $mId})
       CREATE (pt:PromptTemplate {
         id: $id, phase: $phase, template: $template,
         variables: $vars, version: $version, createdAt: $ts
       })
       CREATE (m)-[:USES_PROMPT]->(pt)`,
      { mId: methodologyId, id: ptId, phase, template, vars: variables, version, ts }
    );
    return ptId;
  }

  async getPromptTemplate(methodologyId, phase) {
    const rows = await mg().runQuery(
      `MATCH (m:Methodology {id: $mId})-[:USES_PROMPT]->(pt:PromptTemplate {phase: $phase})
       RETURN pt.id AS id, pt.phase AS phase, pt.template AS template,
              pt.variables AS variables, pt.version AS version`,
      { mId: methodologyId, phase }
    );
    return rows[0] || null;
  }

  // ── PipelineConfig ──────────────────────────────────────────────────────

  async _linkPipelineConfig(methodologyId, {
    phases = [], chunkSize = 4000, overlap = 200,
    maxTurns = 1, timeout = 180000, mcpContext = false,
  }) {
    const pcId = uuidv4();
    const ts = now();
    await mg().runQuery(
      `MATCH (m:Methodology {id: $mId})
       CREATE (pc:PipelineConfig {
         id: $id, phases: $phases, chunkSize: $chunkSize, overlap: $overlap,
         maxTurns: $maxTurns, timeout: $timeout, mcpContext: $mcpContext, createdAt: $ts
       })
       CREATE (m)-[:USES_CONFIG]->(pc)`,
      { mId: methodologyId, id: pcId, phases, chunkSize, overlap, maxTurns, timeout, mcpContext, ts }
    );
    return pcId;
  }

  // ── HookSet ─────────────────────────────────────────────────────────────

  async _linkHookSet(methodologyId, { hooks = [] }) {
    const hsId = uuidv4();
    const ts = now();
    await mg().runQuery(
      `MATCH (m:Methodology {id: $mId})
       CREATE (hs:HookSet {id: $id, hooks: $hooks, createdAt: $ts})
       CREATE (m)-[:USES_HOOKS]->(hs)`,
      { mId: methodologyId, id: hsId, hooks, ts }
    );
    return hsId;
  }
}

function _formatMethodology(row) {
  return {
    id:               row.id,
    name:             row.name,
    version:          row.version,
    description:      row.description || '',
    targetDocTypes:   row.targetDocTypes || [],
    targetLayers:     row.targetLayers  || [],
    extractionDepth:  row.extractionDepth,
    status:           row.status,
    createdAt:        row.createdAt,
    updatedAt:        row.updatedAt || null,
    promptTemplates:  (row.prompts || []).filter(p => p.id),
    pipelineConfigs:  (row.configs || []).filter(c => c.id),
    hookSets:         (row.hookSets || []).filter(h => h.id),
    supersedes:       (row.supersedes || []).filter(s => s.id),
  };
}

const methodologyService = new MethodologyService();
module.exports = { methodologyService, MethodologyService };
