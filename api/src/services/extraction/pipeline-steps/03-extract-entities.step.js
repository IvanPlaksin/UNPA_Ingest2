'use strict';

const { addLog, startStep, completeStep, failStep } = require('../pipeline-context');
const { updateProgress } = require('../progress-bridge');

module.exports = async function extractEntitiesStep(ctx) {
  startStep(ctx, 'extract-entities');
  // Flush "running" status to Redis immediately — this step is slow (Claude Code subprocess)
  // and without this push the UI shows "pending" for the full duration of extraction.
  await updateProgress(ctx, { step: 'extractEntitiesStep' }).catch(() => {});
  try {
    addLog(ctx, 'extract-entities', `Provider=${ctx.adapter.aiProvider}, chunks=${ctx.chunks.length}`);

    let entities = [];

    if (ctx.adapter.aiProvider === 'claude-code') {
      // Document mode: single AI call on full text (Claude Code CLI subprocess)
      entities = await extractViaClaudeCode(ctx);
    } else {
      // Workspace mode: chunked LLM calls via LLMProviderService
      entities = await extractViaLLMProvider(ctx);
    }

    // Regex fallback
    if (entities.length === 0 && ctx.adapter.allowRegexFallback) {
      addLog(ctx, 'extract-entities', 'AI returned no entities — falling back to regex', 'warn');
      entities = await extractViaRegex(ctx);
    }

    ctx.entities = entities;
    ctx.stats.entitiesExtracted = entities.length;
    addLog(ctx, 'extract-entities', `Extracted ${entities.length} entities`);
    completeStep(ctx, 'extract-entities', { count: entities.length });
  } catch (err) {
    failStep(ctx, 'extract-entities', err);
    if (ctx.adapter.allowRegexFallback) {
      addLog(ctx, 'extract-entities', 'Falling back to regex after error', 'warn');
      try {
        ctx.entities = await extractViaRegex(ctx);
        ctx.stats.entitiesExtracted = ctx.entities.length;
        completeStep(ctx, 'extract-entities', { count: ctx.entities.length, fallback: true });
      } catch (e2) {
        throw err; // rethrow original
      }
    } else {
      throw err;
    }
  }
};

// ── Claude Code CLI (DOCUMENT mode) ────────────────────────

async function extractViaClaudeCode(ctx) {
  const { documentAIExtractionService: aiSvc } = require('../../knowledge/document-ai-extraction.service');
  const text = ctx.text;

  const result = await aiSvc.extractDocument(
    ctx.sourceId,
    text,
    ctx.sourceRef,
    { model: ctx.options?.model, extractionMode: ctx.options?.extractionMode || 'FULL' }
  );
  if (!result?.entities) return [];

  // Relationships from Phase 2 are pre-populated here so Step 04 can skip them.
  if (Array.isArray(result.relationships) && result.relationships.length > 0) {
    ctx.relations = result.relationships.map(r => ({
      sourceEntity: r.sourceEntityName,
      targetEntity: r.targetEntityName,
      relationType: r.relationType,
      context:      r.context      || null,
      confidence:   r.confidence   ?? 0.8,
    }));
    ctx.stats.relationsFound = ctx.relations.length;
    addLog(ctx, 'extract-entities', `Phase 2: ${ctx.relations.length} relationships pre-loaded`);
  }

  return result.entities.map(e => ({
    id: require('crypto').randomUUID(),
    name: e.name,
    type: normalizeType(e.type),
    description: e.match || '',
    category: e.category || '',
    epistemicLayer: e.epistemicLayer || ctx.epistemicLayer || '',
    relevance: e.relevance || 'MEDIUM',
    confidence: 0.8,
    extractedByAI: true,
    _aiSummary: result.summary,
    _aiModel: result.model,
  }));
}

// ── LLMProviderService (WORKSPACE mode) ────────────────────

async function extractViaLLMProvider(ctx) {
  const { extractEntities } = require('../../workspace/extraction/entity.extractor');
  const result = await extractEntities(ctx.text, {
    documentType: ctx.documentType || 'UNKNOWN',
    domain: ctx.domain || 'GENERAL',
    onProgress: (p) => addLog(ctx, 'extract-entities', `chunk ${p.current}/${p.total}`),
  });
  return result.entities || [];
}

// ── Regex fallback ──────────────────────────────────────────

async function extractViaRegex(ctx) {
  const { documentAIExtractionService: aiSvc } = require('../../knowledge/document-ai-extraction.service');
  if (typeof aiSvc.extractViaRegex !== 'function') return [];
  return aiSvc.extractViaRegex(ctx.text, {
    documentType: ctx.documentType,
    epistemicLayer: ctx.epistemicLayer,
  });
}

// ── Type normalization ──────────────────────────────────────

const TYPE_MAP = {
  ORGANIZATION: 'ACTOR', PERSON: 'ACTOR', ROLE: 'ACTOR',
  PROCESS: 'EVENT', ACTION: 'EVENT',
  TERM: 'CONCEPT', DEFINITION: 'CONCEPT',
  FILE: 'DOCUMENT', REPORT: 'DOCUMENT',
};

function normalizeType(t) {
  if (!t) return 'CONCEPT';
  const up = t.toUpperCase();
  return TYPE_MAP[up] || up;
}
