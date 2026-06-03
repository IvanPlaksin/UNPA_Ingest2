'use strict';

const { addLog, startStep, completeStep, skipStep } = require('../pipeline-context');
const { getPrompt, fillPrompt } = require('../../workspace/extraction/prompts');

const SPECIALIZED_TYPES = ['business_rule', 'workflow', 'calculation', 'concept', 'anomaly'];

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

  let _llm = null;
  function llm() {
    if (!_llm) {
      const { getInstance } = require('../../llm/LLMProviderService');
      _llm = getInstance();
    }
    return _llm;
  }

  const results = await Promise.all(types.map(async (extractType) => {
    const prompt = getPrompt(extractType);
    if (!prompt) return [extractType, []];

    try {
      const filledPrompt = fillPrompt(prompt, {
        documentType: ctx.documentType || 'UNKNOWN',
        domain: ctx.domain || 'GENERAL',
        entitiesJson: ctx.entities.map(e => ({ name: e.name, type: e.type })),
        text: ctx.text.substring(0, 12000),
      });

      const response = await llm().chat(
        [{ role: 'user', content: filledPrompt }],
        { maxTokens: 4000, temperature: 0.1 }
      );

      const rawRC = response?.content;
      const responseText = Array.isArray(rawRC)
        ? rawRC.filter(b => b.type === 'text').map(b => b.text).join('')
        : (rawRC || '');

      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [extractType, []];

      const items = JSON.parse(jsonMatch[0]);
      addLog(ctx, 'extract-specialized', `${extractType}: ${items.length} items`);
      return [extractType, Array.isArray(items) ? items : []];
    } catch (err) {
      addLog(ctx, 'extract-specialized', `${extractType} failed: ${err.message}`, 'warn');
      return [extractType, []];
    }
  }));

  let totalItems = 0;
  for (const [type, items] of results) {
    ctx.specializedItems.set(type, items);
    ctx.stats.specializedByType[type] = items.length;
    totalItems += items.length;
  }

  addLog(ctx, 'extract-specialized', `Total specialized items: ${totalItems}`);
  completeStep(ctx, 'extract-specialized', { totalItems, byType: ctx.stats.specializedByType });
};
