'use strict';

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

  const evidencedBy = [
    entityId,
    ...result.directDependents.slice(0, 30).map(d => d.entityId),
    ...result.transitiveDependents.slice(0, 20).map(d => d.entityId),
  ].filter(Boolean);

  return { content: result, evidencedBy };
}

const triggersEvidentiaryVersion = true;

module.exports = { PRIMITIVE_TYPE, inputSchema, execute, triggersEvidentiaryVersion };
