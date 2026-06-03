'use strict';
/**
 * EpistemicLayerService
 *
 * Provides layer-aware queries and precedence resolution for the
 * UN Knowledge Triangle model (L0-L5).
 *
 * Layer roles:
 *   L0-L2  NORMATIVE_SOURCE   → produce GOVERNS edges
 *   L3     OPERATIONAL_BRIDGE → produce OPERATIONALIZES edges
 *   L4     EMPIRICAL_EVIDENCE → produce REVEALS_GAP_IN edges
 *   L5     STRATEGIC_GUIDANCE → produce INFORMS edges
 */

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

// Precedence: lower number = higher authority
const LAYER_ORDER = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };

const LAYER_ROLES = {
  L0: 'NORMATIVE_SOURCE',
  L1: 'NORMATIVE_SOURCE',
  L2: 'NORMATIVE_SOURCE',
  L3: 'OPERATIONAL_BRIDGE',
  L4: 'EMPIRICAL_EVIDENCE',
  L5: 'STRATEGIC_GUIDANCE'
};

class EpistemicLayerService {

  // ─── Precedence ──────────────────────────────────────────────────────────

  /**
   * Compare epistemic authority of two layers.
   * Returns negative if layer1 has higher authority, positive if layer2 does, 0 if equal.
   *
   * @example getLayerPrecedence('L0', 'L1') → -1  (L0 wins)
   * @example getLayerPrecedence('L4', 'L1') → 3   (L1 wins)
   */
  getLayerPrecedence(layer1, layer2) {
    const o1 = LAYER_ORDER[layer1] ?? 99;
    const o2 = LAYER_ORDER[layer2] ?? 99;
    return o1 - o2;
  }

  /**
   * Return the layer with higher normative authority.
   * L4 (empirical) never "wins" a normative conflict — it reveals gaps.
   */
  resolveConflict(layer1, layer2) {
    if (layer1 === 'L4') return layer2;
    if (layer2 === 'L4') return layer1;
    return this.getLayerPrecedence(layer1, layer2) <= 0 ? layer1 : layer2;
  }

  /**
   * True if a layer is normative (produces GOVERNS edges).
   */
  isNormative(layer) {
    return ['L0', 'L1', 'L2'].includes(layer);
  }

  /**
   * Return the Knowledge Triangle edge type appropriate for a source layer.
   */
  getEdgeTypeForLayer(layer) {
    const map = {
      L0: 'GOVERNS',
      L1: 'GOVERNS',
      L2: 'GOVERNS',
      L3: 'OPERATIONALIZES',
      L4: 'REVEALS_GAP_IN',
      L5: 'INFORMS'
    };
    return map[layer] || 'RELATES_TO';
  }

  // ─── Memgraph queries ─────────────────────────────────────────────────────

  /**
   * Get all 6 EpistemicLayer nodes ordered by precedence.
   */
  async getLayers() {
    const result = await mg().runQuery(
      `MATCH (l:EpistemicLayer)
       RETURN l.id as id, l.name as name, l.description as description,
              l.knowledgeTriangleRole as role, l.precedenceOrder as order,
              l.normativeWeightMin as wMin, l.normativeWeightMax as wMax,
              l.edgeTypesProduced as edgeTypes
       ORDER BY l.precedenceOrder`,
      {}
    );
    return result.map(r => ({
      id: r.id, name: r.name, description: r.description,
      knowledgeTriangleRole: r.role, precedenceOrder: r.order,
      normativeWeightRange: [r.wMin, r.wMax],
      edgeTypesProduced: r.edgeTypes ? JSON.parse(r.edgeTypes) : []
    }));
  }

  /**
   * Get DocumentTypes belonging to a specific epistemic layer.
   */
  async getDocumentTypesByLayer(layer) {
    const result = await mg().runQuery(
      `MATCH (dt:DocumentType)-[:BELONGS_TO_LAYER]->(l:EpistemicLayer {id: $layer})
       RETURN dt.id as id, dt.name as name, dt.normativeWeight as normativeWeight
       ORDER BY dt.normativeWeight DESC`,
      { layer }
    );
    return result.map(r => ({ id: r.id, name: r.name, normativeWeight: r.normativeWeight }));
  }

  /**
   * Get all normative source document types (L0-L2).
   */
  async getNormativeSources() {
    const result = await mg().runQuery(
      `MATCH (dt:DocumentType)-[:BELONGS_TO_LAYER]->(l:EpistemicLayer)
       WHERE l.knowledgeTriangleRole = 'NORMATIVE_SOURCE'
       RETURN dt.id as id, dt.name as name, dt.epistemicLayer as layer,
              dt.normativeWeight as normativeWeight
       ORDER BY dt.normativeWeight DESC`,
      {}
    );
    return result.map(r => ({ id: r.id, name: r.name, layer: r.layer, normativeWeight: r.normativeWeight }));
  }

  /**
   * Get all empirical evidence document types (L4).
   */
  async getEmpiricalSources() {
    return this.getDocumentTypesByLayer('L4');
  }

  /**
   * Get normative weight for a document node by its documentType property.
   * Returns null if document has no classification.
   */
  async getNormativeWeightForDocument(documentId) {
    const result = await mg().runQuery(
      `MATCH (d:Document {id: $id})
       OPTIONAL MATCH (dt:DocumentType {id: d.documentType})
       RETURN d.documentType as typeId, dt.epistemicLayer as layer,
              dt.normativeWeight as weight`,
      { id: documentId }
    );
    if (!result.length) return null;
    const r = result[0];
    return { typeId: r.typeId, layer: r.layer, normativeWeight: r.weight };
  }

  /**
   * Find unimplemented L1/L2 policies: normative nodes with no OPERATIONALIZES
   * relationship from any L3 node.
   */
  async findUnimplementedPolicies() {
    const result = await mg().runQuery(
      `MATCH (policy:KnowledgeNode)
       WHERE policy.epistemicLayer IN ['L1', 'L2']
       AND NOT (policy)<-[:OPERATIONALIZES]-(:KnowledgeNode {epistemicLayer: 'L3'})
       RETURN policy.id as id, policy.content as content,
              policy.epistemicLayer as layer, policy.documentType as sourceType
       LIMIT 50`,
      {}
    );
    return result.map(r => ({ id: r.id, content: r.content, layer: r.layer, sourceType: r.sourceType }));
  }

  /**
   * Find L4 empirical findings with no REVEALS_GAP_IN target (not yet linked to policy).
   */
  async findUnlinkedFindings() {
    const result = await mg().runQuery(
      `MATCH (finding:KnowledgeNode {epistemicLayer: 'L4'})
       WHERE NOT (finding)-[:REVEALS_GAP_IN]->(:KnowledgeNode)
       RETURN finding.id as id, finding.content as content,
              finding.documentType as sourceType
       LIMIT 50`,
      {}
    );
    return result.map(r => ({ id: r.id, content: r.content, sourceType: r.sourceType }));
  }

  /**
   * Get full layer hierarchy with document type counts.
   */
  async getLayerSummary() {
    const result = await mg().runQuery(
      `MATCH (l:EpistemicLayer)
       WITH l.id as id, l.name as name, l.knowledgeTriangleRole as role,
            l.precedenceOrder as order
       OPTIONAL MATCH (dt:DocumentType)-[:BELONGS_TO_LAYER]->(l2:EpistemicLayer {id: id})
       WITH id, name, role, order, count(dt) as docTypeCount
       RETURN id, name, role, order, docTypeCount
       ORDER BY order`,
      {}
    );
    return result.map(r => ({
      id: r.id, name: r.name, role: r.role,
      precedenceOrder: r.order, docTypeCount: r.docTypeCount
    }));
  }
}

const epistemicLayerService = new EpistemicLayerService();
module.exports = { epistemicLayerService, EpistemicLayerService, LAYER_ORDER, LAYER_ROLES };
