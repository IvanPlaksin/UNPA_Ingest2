'use strict';

const { addLog, startStep, completeStep, failStep } = require('../pipeline-context');

module.exports = async function extractEntitiesStep(ctx) {
  startStep(ctx, 'extract-entities');
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
  const aiSvc = require('../../knowledge/document-ai-extraction.service');
  const text = ctx.text;
  const meta = {
    title: ctx.sourceRef?.filename || ctx.sourceRef?.title || '',
    documentType: ctx.documentType || ctx.sourceRef?.documentType || 'UNKNOWN',
    epistemicLayer: ctx.epistemicLayer || ctx.sourceRef?.epistemicLayer || '',
    publishedDate: ctx.sourceRef?.publishedDate || '',
    unSymbol: ctx.sourceRef?.unSymbol || '',
    model: ctx.options?.model,
  };

  const result = await aiSvc.extractDocument(text, meta);
  if (!result?.entities) return [];

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
  const aiSvc = require('../../knowledge/document-ai-extraction.service');
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
