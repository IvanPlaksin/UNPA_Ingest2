'use strict';

const { addLog, startStep, completeStep } = require('../pipeline-context');
const { deduplicateEntities } = require('../../workspace/extraction/entity.extractor');

module.exports = async function deduplicateStep(ctx) {
  startStep(ctx, 'deduplicate');

  const before = ctx.entities.length;
  ctx.entities = deduplicateEntities(ctx.entities);
  const after = ctx.entities.length;
  ctx.stats.deduplicated = before - after;

  // Deduplicate relations by (sourceName, relType, targetName)
  const relKeys = new Set();
  ctx.relations = ctx.relations.filter(r => {
    const key = `${(r.sourceEntity||r.sourceEntityName||'').toLowerCase()}::${r.relationshipType}::${(r.targetEntity||r.targetEntityName||'').toLowerCase()}`;
    if (relKeys.has(key)) return false;
    relKeys.add(key);
    return true;
  });

  addLog(ctx, 'deduplicate', `Entities: ${before} → ${after} (removed ${ctx.stats.deduplicated}), relations: ${ctx.relations.length}`);
  completeStep(ctx, 'deduplicate', { entitiesRemoved: ctx.stats.deduplicated, relationsAfter: ctx.relations.length });
};
