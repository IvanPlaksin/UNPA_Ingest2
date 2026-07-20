'use strict';
const {
  createEnvelope, buildNode, buildEdge, PROJECTION_KIND,
} = require('../../../constants/canonical-graph.constants');

const PRIMITIVE_TYPE = 'IMPACT';

const inputSchema = {
  entityId:          { type: 'string', required: true },
  maxDepth:          { type: 'number', default: 5 },
  includeStructural: { type: 'boolean', default: true },
};

async function execute(params, _context, services) {
  const { entityId, maxDepth = 5, includeStructural = true } = params;
  if (!entityId) throw new Error('IMPACT requires entityId');

  const { impactAnalysisService } = services;
  const result = await impactAnalysisService.analyzeImpact(entityId, {
    maxDepth:          Math.min(maxDepth, 8),
    includeStructural: includeStructural !== false,
  });

  const {
    directDependents = [], transitiveDependents = [], totalTransitive,
    impactByCategory = {}, structuralAnalysis, criticalPaths = [],
    riskAssessment, recommendations = [], summary: analysisSummary,
  } = result;

  const envelope = createEnvelope({
    roots:      [entityId],
    kind:       PROJECTION_KIND.TREE,
    hints: {
      directDependents,
      transitiveDependents,
      totalTransitive,
      impactByCategory,
      structuralAnalysis,
      criticalPaths,
      recommendations,
    },
    producedBy: 'TOOL',
    toolId:     'investigation.impact',
  });

  // Root entity node
  envelope.nodes.push(buildNode({ id: entityId, type: 'ENTITY', name: entityId }));

  // Dependent nodes + dependency edges
  const seen = new Set([entityId]);
  for (const dep of directDependents) {
    if (!seen.has(dep.entityId)) {
      seen.add(dep.entityId);
      envelope.nodes.push(buildNode({ id: dep.entityId, type: dep.type, name: dep.name }));
    }
    if (dep.relType) {
      envelope.edges.push(buildEdge({ sourceId: dep.entityId, targetId: entityId, relType: dep.relType, direction: 'backward' }));
    }
  }
  for (const dep of transitiveDependents.slice(0, 50)) {
    if (!seen.has(dep.entityId)) {
      seen.add(dep.entityId);
      envelope.nodes.push(buildNode({ id: dep.entityId, type: dep.type, name: dep.name }));
    }
  }

  envelope.summary = {
    headline:      analysisSummary?.headline || `Impact: ${entityId}`,
    entityId,
    riskAssessment,
    totalEntities: analysisSummary?.totalEntities || (directDependents.length + (totalTransitive || 0)),
    direct:        analysisSummary?.direct        || directDependents.length,
    transitive:    analysisSummary?.transitive     || (totalTransitive || 0),
  };

  const evidencedBy = [
    entityId,
    ...directDependents.slice(0, 30).map(d => d.entityId),
    ...transitiveDependents.slice(0, 20).map(d => d.entityId),
  ].filter(Boolean);

  return { content: envelope, evidencedBy };
}

const triggersEvidentiaryVersion = true;

module.exports = { PRIMITIVE_TYPE, inputSchema, execute, triggersEvidentiaryVersion };
