'use strict';

const { addLog, startStep, completeStep, skipStep, failStep } = require('../pipeline-context');

module.exports = async function extractRelationsStep(ctx) {
  const skipTypes = ctx.options?.extractTypes;
  if (skipTypes && !skipTypes.includes('relationship')) {
    skipStep(ctx, 'extract-relations', 'Not in extractTypes');
    return;
  }
  if (ctx.entities.length < 2) {
    skipStep(ctx, 'extract-relations', 'Not enough entities');
    return;
  }
  // Relations pre-populated by extractEntitiesStep (document/claude-code Phase 2) — skip workspace extractor
  if (ctx.relations && ctx.relations.length > 0) {
    skipStep(ctx, 'extract-relations', `Pre-extracted (${ctx.relations.length} rels)`);
    return;
  }

  startStep(ctx, 'extract-relations');
  try {
    const { extractRelations } = require('../../workspace/extraction/relation.extractor');
    const result = await extractRelations(ctx.text, ctx.entities, {
      documentType: ctx.documentType || 'UNKNOWN',
      domain: ctx.domain || 'GENERAL',
    });

    ctx.relations = result.relations || [];
    ctx.stats.relationsFound = ctx.relations.length;
    addLog(ctx, 'extract-relations', `Extracted ${ctx.relations.length} relations`);
    completeStep(ctx, 'extract-relations', { count: ctx.relations.length });
  } catch (err) {
    // Relations are non-fatal
    addLog(ctx, 'extract-relations', `Failed (non-fatal): ${err.message}`, 'warn');
    failStep(ctx, 'extract-relations', err);
    ctx.relations = [];
  }
};
