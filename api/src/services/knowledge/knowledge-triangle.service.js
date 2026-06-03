'use strict';
/**
 * KnowledgeTriangleService
 *
 * Manages the three-vertex Knowledge Triangle for UN epistemic analysis:
 *
 *   L0-L2 Normative ──GOVERNS──► Process ◄──OPERATIONALIZES── L3 Operational
 *                                    │
 *                             REVEALS_GAP_IN
 *                                    ▼
 *                                  Gap ◄──── L4 Empirical
 *
 * Layer constraints:
 *   GOVERNS         — source must be L0, L1, or L2
 *   OPERATIONALIZES — source must be L3
 *   REVEALS_GAP_IN  — source must be L4
 */

const { v4: uuidv4 } = require('uuid');
const { epistemicLayerService } = require('./epistemic-layer.service');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

// Layer constraint map for Knowledge Triangle edges
const EDGE_LAYER_CONSTRAINTS = {
  GOVERNS:         ['L0', 'L1', 'L2'],
  OPERATIONALIZES: ['L3'],
  REVEALS_GAP_IN:  ['L4']
};

const GAP_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'ADDRESSED', 'CLOSED'];
const GAP_TYPES    = ['COMPLIANCE', 'IMPLEMENTATION', 'DOCUMENTATION', 'RESOURCE'];
const SEVERITIES   = ['HIGH', 'MEDIUM', 'LOW'];

class KnowledgeTriangleService {

  // ─── Validation ──────────────────────────────────────────────────────────

  /**
   * Validate that a source node's epistemic layer is allowed for the given edge type.
   * Throws a descriptive error on violation.
   */
  validateEdgeLayerConstraint(edgeType, sourceLayer) {
    const allowed = EDGE_LAYER_CONSTRAINTS[edgeType];
    if (!allowed) throw new Error(`Unknown Knowledge Triangle edge type: ${edgeType}`);
    if (!allowed.includes(sourceLayer)) {
      throw new Error(
        `Layer constraint violation: ${edgeType} requires source layer in [${allowed.join(', ')}], ` +
        `but source is ${sourceLayer}. ` +
        (sourceLayer === 'L4'
          ? 'L4 empirical documents create REVEALS_GAP_IN edges, not GOVERNS.'
          : `Layer ${sourceLayer} produces edge type '${epistemicLayerService.getEdgeTypeForLayer(sourceLayer)}' instead.`)
      );
    }
    return true;
  }

  // ─── Edge creation ───────────────────────────────────────────────────────

  /**
   * Create a GOVERNS edge from a normative KnowledgeNode (L0-L2) to a target node.
   */
  async createGovernsEdge(normativeNodeId, targetNodeId, properties = {}) {
    const source = await this._getNodeLayer(normativeNodeId);
    this.validateEdgeLayerConstraint('GOVERNS', source.layer);

    const now = new Date().toISOString();
    await mg().runQuery(
      `MATCH (src:KnowledgeNode {id: $srcId}), (tgt:KnowledgeNode {id: $tgtId})
       CREATE (src)-[r:GOVERNS {
         effectiveFrom:   $effectiveFrom,
         effectiveTo:     $effectiveTo,
         mandatoryLevel:  $mandatoryLevel,
         createdAt:       $now
       }]->(tgt)
       RETURN type(r) as edgeType`,
      {
        srcId: normativeNodeId,
        tgtId: targetNodeId,
        effectiveFrom:  properties.effectiveFrom  || now,
        effectiveTo:    properties.effectiveTo    || null,
        mandatoryLevel: properties.mandatoryLevel || 'MUST',
        now
      }
    );
    return { edgeType: 'GOVERNS', sourceId: normativeNodeId, targetId: targetNodeId };
  }

  /**
   * Create an OPERATIONALIZES edge from an operational KnowledgeNode (L3) to a target.
   */
  async createOperationalizesEdge(operationalNodeId, targetNodeId, properties = {}) {
    const source = await this._getNodeLayer(operationalNodeId);
    this.validateEdgeLayerConstraint('OPERATIONALIZES', source.layer);

    const now = new Date().toISOString();
    await mg().runQuery(
      `MATCH (src:KnowledgeNode {id: $srcId}), (tgt:KnowledgeNode {id: $tgtId})
       CREATE (src)-[r:OPERATIONALIZES {
         implementationStatus: $status,
         deviations:           $deviations,
         createdAt:            $now
       }]->(tgt)
       RETURN type(r) as edgeType`,
      {
        srcId: operationalNodeId,
        tgtId: targetNodeId,
        status:     properties.implementationStatus || 'FULL',
        deviations: properties.deviations           || null,
        now
      }
    );
    return { edgeType: 'OPERATIONALIZES', sourceId: operationalNodeId, targetId: targetNodeId };
  }

  /**
   * Create a REVEALS_GAP_IN edge from an empirical KnowledgeNode (L4) to a target,
   * and automatically create a Gap node capturing the finding.
   * Returns { edgeType, gapId, sourceId, targetId }.
   */
  async createRevealsGapEdge(empiricalNodeId, targetNodeId, gapProperties = {}) {
    const source = await this._getNodeLayer(empiricalNodeId);
    this.validateEdgeLayerConstraint('REVEALS_GAP_IN', source.layer);

    const gapId = uuidv4();
    const now   = new Date().toISOString();

    const gapType  = gapProperties.gapType  || 'COMPLIANCE';
    const severity = gapProperties.severity || 'MEDIUM';

    if (!GAP_TYPES.includes(gapType))
      throw new Error(`Invalid gapType: ${gapType}. Must be one of ${GAP_TYPES.join(', ')}`);
    if (!SEVERITIES.includes(severity))
      throw new Error(`Invalid severity: ${severity}. Must be one of ${SEVERITIES.join(', ')}`);

    // Create Gap node and REVEALS_GAP_IN edge in one transaction
    await mg().runQuery(
      `MATCH (src:KnowledgeNode {id: $srcId}), (tgt:KnowledgeNode {id: $tgtId})
       CREATE (gap:Gap {
         id:              $gapId,
         gapType:         $gapType,
         severity:        $severity,
         status:          'OPEN',
         title:           $title,
         description:     $desc,
         identifiedBy:    $srcId,
         identifiedAt:    $now,
         affectedProcess: $tgtId,
         recommendation:  $recommendation,
         resolution:      null,
         resolvedAt:      null,
         createdAt:       $now,
         updatedAt:       $now
       })
       CREATE (src)-[:REVEALS_GAP_IN {
         gapType:        $gapType,
         severity:       $severity,
         auditReference: $auditRef,
         createdAt:      $now
       }]->(gap)
       CREATE (gap)-[:AFFECTS]->(tgt)
       RETURN gap.id as gapId`,
      {
        srcId:          empiricalNodeId,
        tgtId:          targetNodeId,
        gapId,
        gapType,
        severity,
        title:          gapProperties.title          || `Gap identified by ${empiricalNodeId}`,
        desc:           gapProperties.description    || '',
        recommendation: gapProperties.recommendation || '',
        auditRef:       gapProperties.auditReference || '',
        now
      }
    );

    return { edgeType: 'REVEALS_GAP_IN', gapId, sourceId: empiricalNodeId, targetId: targetNodeId };
  }

  // ─── Gap management ───────────────────────────────────────────────────────

  /**
   * Update the status of a Gap node.
   * Lifecycle: OPEN → ACKNOWLEDGED → ADDRESSED → CLOSED
   * Gaps are never deleted — only closed (KM-014).
   */
  async updateGapStatus(gapId, newStatus, resolution = null) {
    if (!GAP_STATUSES.includes(newStatus))
      throw new Error(`Invalid gap status: ${newStatus}. Must be one of ${GAP_STATUSES.join(', ')}`);

    const now = new Date().toISOString();
    const result = await mg().runQuery(
      `MATCH (gap:Gap {id: $id})
       SET gap.status    = $status,
           gap.updatedAt = $now
           ${newStatus === 'CLOSED' ? ', gap.resolution = $resolution, gap.resolvedAt = $now' : ''}
       RETURN gap.id as id, gap.status as status`,
      { id: gapId, status: newStatus, resolution: resolution || '', now }
    );
    if (!result.length) throw new Error(`Gap not found: ${gapId}`);
    return { id: result[0].id, status: result[0].status };
  }

  /**
   * Get all open gaps, optionally filtered by affected process node ID.
   */
  async getOpenGaps(processId = null) {
    const GAP_COLS = `gap.id as id, gap.gapType as gapType, gap.severity as severity,
                      gap.status as status, gap.title as title,
                      gap.identifiedBy as identifiedBy, gap.recommendation as recommendation`;
    if (processId) {
      const result = await mg().runQuery(
        `MATCH (gap:Gap {status: 'OPEN'})-[:AFFECTS]->(proc:KnowledgeNode {id: $procId})
         RETURN ${GAP_COLS}`,
        { procId: processId }
      );
      return result;
    }
    const result = await mg().runQuery(
      `MATCH (gap:Gap {status: 'OPEN'})
       RETURN ${GAP_COLS}
       LIMIT 100`,
      {}
    );
    return result;
  }

  /**
   * Get a Gap node by ID.
   */
  async getGap(gapId) {
    const result = await mg().runQuery(
      `MATCH (gap:Gap {id: $id})
       RETURN gap.id as id, gap.gapType as gapType, gap.severity as severity,
              gap.status as status, gap.title as title, gap.description as description,
              gap.identifiedBy as identifiedBy, gap.identifiedAt as identifiedAt,
              gap.affectedProcess as affectedProcess, gap.recommendation as recommendation,
              gap.resolution as resolution, gap.resolvedAt as resolvedAt,
              gap.createdAt as createdAt, gap.updatedAt as updatedAt`,
      { id: gapId }
    );
    return result.length ? result[0] : null;
  }

  // ─── Triangle queries ─────────────────────────────────────────────────────

  /**
   * Get the full Knowledge Triangle for a given process/entity node.
   * Returns { normative, operational, empirical, gaps }.
   */
  async getTriangleForProcess(processId) {
    const [normative, operational, empirical, gaps] = await Promise.all([
      mg().runQuery(
        `MATCH (norm:KnowledgeNode)-[:GOVERNS]->(proc:KnowledgeNode {id: $id})
         RETURN norm.id as id, norm.content as content, norm.epistemicLayer as layer,
                norm.documentType as sourceType`,
        { id: processId }
      ),
      mg().runQuery(
        `MATCH (op:KnowledgeNode)-[:OPERATIONALIZES]->(proc:KnowledgeNode {id: $id})
         RETURN op.id as id, op.content as content, op.epistemicLayer as layer,
                op.documentType as sourceType`,
        { id: processId }
      ),
      mg().runQuery(
        `MATCH (emp:KnowledgeNode)-[:REVEALS_GAP_IN]->(gap:Gap)-[:AFFECTS]->(proc:KnowledgeNode {id: $id})
         RETURN emp.id as id, emp.content as content, emp.epistemicLayer as layer,
                emp.documentType as sourceType, gap.id as gapId, gap.severity as severity`,
        { id: processId }
      ),
      mg().runQuery(
        `MATCH (gap:Gap)-[:AFFECTS]->(proc:KnowledgeNode {id: $id})
         RETURN gap.id as id, gap.gapType as gapType, gap.severity as severity,
                gap.status as status, gap.title as title`,
        { id: processId }
      )
    ]);

    return {
      processId,
      normative:   normative.map(r => ({ id: r.id, content: r.content, layer: r.layer, sourceType: r.sourceType })),
      operational: operational.map(r => ({ id: r.id, content: r.content, layer: r.layer, sourceType: r.sourceType })),
      empirical:   empirical.map(r => ({ id: r.id, content: r.content, layer: r.layer, gapId: r.gapId, severity: r.severity })),
      gaps:        gaps.map(r => ({ id: r.id, gapType: r.gapType, severity: r.severity, status: r.status, title: r.title }))
    };
  }

  /**
   * Calculate detailed Knowledge Triangle completeness for a process node.
   *
   * Returns:
   * {
   *   processId, completeness,         // primary score 0-1 with gap penalty
   *   score,                           // raw score without penalty (backward-compat alias)
   *   vertices: { normative, operational, empirical },
   *   gaps: { count, openHigh, openMedium, openLow, penalty },
   *   missingVertices,                 // ['NORMATIVE', 'OPERATIONAL', 'EMPIRICAL']
   *   openGaps,                        // count (backward-compat alias)
   *   hasNormative, hasOperational, hasEmpirical,  // backward-compat
   *   calculatedAt
   * }
   */
  async getTriangleCompleteness(processId) {
    const [triangle, openGapsList] = await Promise.all([
      this.getTriangleForProcess(processId),
      this.getOpenGaps(processId)
    ]);

    const hasNormative   = triangle.normative.length > 0;
    const hasOperational = triangle.operational.length > 0;
    const hasEmpirical   = triangle.empirical.length > 0;

    const rawScore = (Number(hasNormative) + Number(hasOperational) + Number(hasEmpirical)) / 3;

    const openHigh   = openGapsList.filter(g => g.severity === 'HIGH').length;
    const openMedium = openGapsList.filter(g => g.severity === 'MEDIUM').length;
    const openLow    = openGapsList.filter(g => g.severity === 'LOW').length;
    const gapPenalty = (openHigh * 0.15) + (openMedium * 0.10) + (openLow * 0.05);

    const completeness = Math.max(0, Math.round((rawScore - gapPenalty) * 1000) / 1000);

    const missingVertices = [
      !hasNormative   && 'NORMATIVE',
      !hasOperational && 'OPERATIONAL',
      !hasEmpirical   && 'EMPIRICAL'
    ].filter(Boolean);

    return {
      processId,
      completeness,
      score: Math.round(rawScore * 1000) / 1000,
      vertices: {
        normative:   { present: hasNormative,   count: triangle.normative.length },
        operational: { present: hasOperational, count: triangle.operational.length },
        empirical:   { present: hasEmpirical,   count: triangle.empirical.length }
      },
      gaps: {
        count:      openGapsList.length,
        openHigh,
        openMedium,
        openLow,
        penalty:    Math.round(gapPenalty * 1000) / 1000
      },
      missingVertices,
      // backward-compat aliases
      hasNormative, hasOperational, hasEmpirical,
      openGaps: openGapsList.length,
      calculatedAt: new Date().toISOString()
    };
  }

  /**
   * Find processes with incomplete Knowledge Triangle (missing normative or operational coverage).
   * Returns up to 50 nodes.
   */
  async findIncompleteTriangles() {
    // Two separate queries to avoid EXISTS() compatibility issues with Memgraph
    const [missingNorm, missingOp] = await Promise.all([
      mg().runQuery(
        `MATCH (proc:KnowledgeNode)
         WHERE NOT (proc)<-[:GOVERNS]-(:KnowledgeNode)
         RETURN proc.id as id, proc.content as content, proc.epistemicLayer as layer
         LIMIT 50`,
        {}
      ),
      mg().runQuery(
        `MATCH (proc:KnowledgeNode)
         WHERE NOT (proc)<-[:OPERATIONALIZES]-(:KnowledgeNode)
         RETURN proc.id as id
         LIMIT 50`,
        {}
      )
    ]);
    const missingOpIds = new Set(missingOp.map(r => r.id));
    return missingNorm.map(r => ({
      id: r.id, content: r.content, layer: r.layer,
      hasNormative:   false,
      hasOperational: !missingOpIds.has(r.id)
    }));
  }

  /**
   * Get KnowledgeTriangleEdgeType metadata from Memgraph.
   */
  async getEdgeTypeMetadata(edgeName = null) {
    const cols = `e.name as name, e.description as description,
                  e.knowledgeTriangleRole as knowledgeTriangleRole,
                  e.sourceLayerConstraint as sourceLayerConstraint,
                  e.targetNodeTypes as targetNodeTypes,
                  e.inverseEdge as inverseEdge,
                  e.createsGapNode as createsGapNode`;
    if (edgeName) {
      const result = await mg().runQuery(
        `MATCH (e:KnowledgeTriangleEdgeType {name: $name}) RETURN ${cols}`,
        { name: edgeName }
      );
      return result.length ? result[0] : null;
    }
    const result = await mg().runQuery(
      `MATCH (e:KnowledgeTriangleEdgeType) RETURN ${cols} ORDER BY e.name`,
      {}
    );
    return result;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  async _getNodeLayer(nodeId) {
    const result = await mg().runQuery(
      `MATCH (n:KnowledgeNode {id: $id})
       RETURN n.epistemicLayer as layer, n.documentType as documentType`,
      { id: nodeId }
    );
    if (!result.length) throw new Error(`KnowledgeNode not found: ${nodeId}`);
    const r = result[0];
    return { layer: r.layer, documentType: r.documentType };
  }
}

const knowledgeTriangleService = new KnowledgeTriangleService();
module.exports = {
  knowledgeTriangleService,
  KnowledgeTriangleService,
  EDGE_LAYER_CONSTRAINTS,
  GAP_STATUSES,
  GAP_TYPES,
  SEVERITIES
};
