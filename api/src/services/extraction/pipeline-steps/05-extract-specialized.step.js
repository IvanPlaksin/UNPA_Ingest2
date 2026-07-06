'use strict';

const { addLog, startStep, completeStep, skipStep } = require('../pipeline-context');
const { getPrompt, fillPrompt } = require('../../workspace/extraction/prompts');
const { runClaudeCode, DEFAULT_MODEL } = require('../../knowledge/document-ai-extraction.service');

const SPECIALIZED_TYPES = ['business_rule', 'workflow', 'calculation', 'concept', 'anomaly'];
const TIMEOUT_PER_TYPE  = 180000; // 3 min per type (simpler prompts than entity extraction)

module.exports = async function extractSpecializedStep(ctx) {
  const extractTypes = ctx.options?.extractTypes;
  const types = SPECIALIZED_TYPES.filter(t =>
    !extractTypes || extractTypes.includes(t)
  );

  if (types.length === 0) {
    skipStep(ctx, 'extract-specialized', 'No specialized types requested');
    return;
  }

  startStep(ctx, 'extract-specialized');

  const model = ctx.options?.model || DEFAULT_MODEL;

  // Run sequentially — avoid spawning multiple claude.exe processes in parallel
  let totalItems = 0;
  for (const extractType of types) {
    const prompt = getPrompt(extractType);
    if (!prompt) {
      ctx.specializedItems.set(extractType, []);
      ctx.stats.specializedByType[extractType] = 0;
      continue;
    }

    try {
      const filledPrompt = fillPrompt(prompt, {
        documentType: ctx.documentType || 'UNKNOWN',
        domain: ctx.domain || 'GENERAL',
        entitiesJson: JSON.stringify(ctx.entities.map(e => ({ name: e.name, type: e.type }))),
        text: ctx.text.substring(0, 12000),
      });

      const responseText = await runClaudeCode(filledPrompt, model, TIMEOUT_PER_TYPE);

      const jsonMatch = (typeof responseText === 'string' ? responseText : JSON.stringify(responseText))
        .match(/\[[\s\S]*\]/);

      if (!jsonMatch) {
        addLog(ctx, 'extract-specialized', `${extractType}: no JSON array in response`, 'warn');
        ctx.specializedItems.set(extractType, []);
        ctx.stats.specializedByType[extractType] = 0;
        continue;
      }

      const items = JSON.parse(jsonMatch[0]);
      const arr = Array.isArray(items) ? items : [];
      addLog(ctx, 'extract-specialized', `${extractType}: ${arr.length} items`);
      ctx.specializedItems.set(extractType, arr);
      ctx.stats.specializedByType[extractType] = arr.length;
      totalItems += arr.length;
    } catch (err) {
      addLog(ctx, 'extract-specialized', `${extractType} failed: ${err.message}`, 'warn');
      ctx.specializedItems.set(extractType, []);
      ctx.stats.specializedByType[extractType] = 0;
    }
  }

  addLog(ctx, 'extract-specialized', `Total specialized items: ${totalItems}`);
  completeStep(ctx, 'extract-specialized', { totalItems, byType: ctx.stats.specializedByType });
};
