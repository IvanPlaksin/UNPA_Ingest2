'use strict';

const { addLog, startStep, completeStep, failStep } = require('../pipeline-context');
const { updateProgress } = require('../progress-bridge');

// ── Canonical entity types ────────────────────────────────────────────────────
// Maps aliases (all-caps) → canonical form. Canonical forms pass through unchanged.
const TYPE_MAP = {
  // AGENTS
  PERSON:       'PERSON',
  INDIVIDUAL:   'PERSON',
  OFFICIAL:     'PERSON',
  ORGANIZATION: 'ORGANIZATION',
  AGENCY:       'ORGANIZATION',
  BODY:         'ORGANIZATION',
  COMMITTEE:    'ORGANIZATION',
  DEPARTMENT:   'ORGANIZATION',
  INSTITUTION:  'ORGANIZATION',
  OFFICE:       'ORGANIZATION',
  UNIT:         'ORGANIZATION',
  ACTOR:        'ACTOR',
  ROLE:         'ACTOR',
  POSITION:     'ACTOR',
  // ARTIFACTS
  DOCUMENT:     'DOCUMENT',
  REPORT:       'DOCUMENT',
  FILE:         'DOCUMENT',
  DOCUMENTREF:  'DOCUMENTREF',
  REFERENCE:    'DOCUMENTREF',
  POLICY:       'POLICY',
  REGULATION:   'POLICY',
  RULE:         'POLICY',
  GUIDELINE:    'POLICY',
  STANDARD:     'POLICY',
  SYSTEM:       'SYSTEM',
  PLATFORM:     'SYSTEM',
  APPLICATION:  'SYSTEM',
  DATABASE:     'SYSTEM',
  TECHNOLOGY:   'TECHNOLOGY',
  TOOL:         'TECHNOLOGY',
  SOFTWARE:     'TECHNOLOGY',
  // CONCEPTS
  CONCEPT:      'CONCEPT',
  TERM:         'CONCEPT',
  DEFINITION:   'CONCEPT',
  PRINCIPLE:    'CONCEPT',
  FRAMEWORK:    'CONCEPT',
  METHODOLOGY:  'CONCEPT',
  PROCESS:      'PROCESS',
  PROCEDURE:    'PROCESS',
  WORKFLOW:     'PROCESS',
  ACTION:       'PROCESS',
  EVENT:        'EVENT',
  MEETING:      'EVENT',
  SESSION:      'EVENT',
  INCIDENT:     'EVENT',
  // CONTEXT
  LOCATION:     'LOCATION',
  PLACE:        'LOCATION',
  COUNTRY:      'LOCATION',
  REGION:       'LOCATION',
  CITY:         'LOCATION',
  DUTY_STATION: 'LOCATION',
  // WORK
  WORK_ITEM:    'WORK_ITEM',
  WORKITEM:     'WORK_ITEM',
  TASK:         'WORK_ITEM',
  TICKET:       'WORK_ITEM',
  ISSUE:        'WORK_ITEM',
};

// ── Epistemic layer taxonomy ──────────────────────────────────────────────────
const EPISTEMIC_LAYERS = {
  L0_NORMATIVE: {
    code: 'L0_NORMATIVE',
    markers: ['shall', 'must', 'mandates', 'requires', 'obligates', 'prohibits', 'decides'],
    typeDefaults: ['POLICY'],
  },
  L1_STRUCTURAL: {
    code: 'L1_STRUCTURAL',
    markers: ['reports to', 'composed of', 'established by', 'part of', 'member of', 'led by'],
    typeDefaults: ['ORGANIZATION'],
  },
  L2_OPERATIONAL: {
    code: 'L2_OPERATIONAL',
    markers: ['procedure', 'process', 'steps', 'workflow', 'guideline', 'implement', 'execute'],
    typeDefaults: ['PROCESS'],
  },
  L3_INFORMATIONAL: {
    code: 'L3_INFORMATIONAL',
    markers: ['reported', 'occurred', 'noted', 'statistics', 'as of', 'during', 'recorded'],
    typeDefaults: ['EVENT', 'PERSON', 'LOCATION'],
  },
  L4_ANALYTICAL: {
    code: 'L4_ANALYTICAL',
    markers: ['recommends', 'suggests', 'finds', 'assesses', 'gap', 'risk', 'concludes', 'proposes'],
    typeDefaults: ['CONCEPT'],
  },
};

// Valid epistemic layer codes (both short and full form)
const VALID_EPISTEMIC = new Set([
  'L0', 'L1', 'L2', 'L3', 'L4',
  'L0_NORMATIVE', 'L1_STRUCTURAL', 'L2_OPERATIONAL', 'L3_INFORMATIONAL', 'L4_ANALYTICAL',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeType(t) {
  if (!t) return 'CONCEPT';
  const up = t.toUpperCase().replace(/[-\s]/g, '_');
  return TYPE_MAP[up] || up;
}

function normalizeEpistemicLayer(raw, entityType, contextText) {
  if (raw) {
    const up = String(raw).toUpperCase();
    if (VALID_EPISTEMIC.has(up)) return up;
    // Partial match: 'L0' prefix
    for (const code of VALID_EPISTEMIC) {
      if (up.startsWith(code.split('_')[0])) return code;
    }
  }
  return inferEpistemicLayer(entityType, contextText);
}

function inferEpistemicLayer(type, contextText) {
  const text = (contextText || '').toLowerCase();
  for (const [, def] of Object.entries(EPISTEMIC_LAYERS)) {
    for (const marker of def.markers) {
      if (text.includes(marker)) return def.code;
    }
  }
  for (const [, def] of Object.entries(EPISTEMIC_LAYERS)) {
    if (def.typeDefaults.includes(type)) return def.code;
  }
  return 'L3_INFORMATIONAL';
}

function normalizeEntity(raw, documentId) {
  const type = normalizeType(raw.type);
  const contextText = raw.context || raw.match || '';
  const epistemicLayer = normalizeEpistemicLayer(
    raw.epistemicLayer,
    type,
    contextText
  );

  let description = (raw.description || '').trim();
  if (description.length < 5) {
    description = raw.match ? `${raw.name}: ${raw.match}`.slice(0, 300) : `${raw.name}`;
  }

  const name = (raw.name || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').slice(0, 200) || 'Unknown';

  return {
    id:             raw.id || require('crypto').randomUUID(),
    type,
    name,
    description:    description.slice(0, 500),
    category:       raw.category || null,
    epistemicLayer,
    relevance:      raw.relevance || 'MEDIUM',
    confidence:     typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0.8,
    extractedByAI:  true,
    mentions:       Array.isArray(raw.mentions) ? raw.mentions : [name],
    match:          raw.match || name,
    temporal:       raw.temporal || null,
    isExisting:     Boolean(raw.isExisting),
    provenanceDocId: documentId,
    _aiSummary:     raw._aiSummary || null,
    _aiModel:       raw._aiModel   || null,
  };
}

// ── Pipeline step ─────────────────────────────────────────────────────────────

module.exports = async function extractEntitiesStep(ctx) {
  startStep(ctx, 'extract-entities');
  await updateProgress(ctx, { step: 'extractEntitiesStep' }).catch(() => {});
  try {
    // ── Registry methodology path (M1/M2/M4/…) ──────────────────────────────
    if (ctx.options?.registryMethodology) {
      await _extractViaRegistry(ctx);
      if (!ctx.entities?.length) {
        const e = new Error(`Registry extractor '${ctx.options.registryMethodology}' returned 0 entities`);
        failStep(ctx, 'extract-entities', e);
        throw e;
      }
      completeStep(ctx, 'extract-entities', { count: ctx.entities.length, via: ctx.options.registryMethodology });
      return;
    }

    addLog(ctx, 'extract-entities', `Provider=${ctx.adapter.aiProvider}, chunks=${ctx.chunks.length}`);

    let entities = [];

    if (ctx.adapter.aiProvider === 'claude-code') {
      entities = await extractViaClaudeCode(ctx);
    } else {
      entities = await extractViaLLMProvider(ctx);
    }

    // Regex fallback
    if (entities.length === 0 && ctx.adapter.allowRegexFallback) {
      addLog(ctx, 'extract-entities', 'AI returned no entities — falling back to regex', 'warn');
      entities = await extractViaRegex(ctx);
    }

    if (entities.length === 0) {
      const err = new Error(
        'Entity extraction returned 0 results — document may be empty, scanned, or AI extraction failed'
      );
      failStep(ctx, 'extract-entities', err);
      throw err;
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
        if (ctx.entities.length === 0) {
          throw err;
        }
        completeStep(ctx, 'extract-entities', { count: ctx.entities.length, fallback: true });
      } catch (e2) {
        throw e2.message === err.message ? err : e2;
      }
    } else {
      throw err;
    }
  }
};

// ── Registry extractor (M1/M2/M4/…) — routes METHODOLOGY jobs through full pipeline ──

async function _extractViaRegistry(ctx) {
  const { registry } = require('../methodology-registry');
  const mId = ctx.options.registryMethodology;
  addLog(ctx, 'extract-entities', `Registry extractor: ${mId}`);

  // Pre-load known entities for pre-marking
  let existing = [];
  try {
    const mg = require('../../memgraph.service');
    const rows = await mg.runQuery(
      `MATCH (d:Document {id: $id})-[:MENTIONS]->(em:EntityMention)
       RETURN em.id AS id, em.name AS name, em.type AS type LIMIT 200`,
      { id: ctx.sourceId }
    );
    existing = rows.map(r => ({ id: r.id, name: r.name, type: r.type }));
  } catch {}

  const extractor = registry.getExtractor(mId);
  const result = await extractor.extract(ctx.sourceId, ctx.text, existing);

  // Normalize to pipeline entity format
  ctx.entities = result.entities.map(e => normalizeEntity(e, ctx.sourceId));
  ctx.stats.entitiesExtracted = ctx.entities.length;
  ctx.methodologyId = mId; // override adapter's catalog-resolved methodology

  // Pre-populate relations so step 04 skips its own extractor
  if (Array.isArray(result.relations) && result.relations.length > 0) {
    ctx.relations = result.relations.map(r => ({
      sourceEntity: r.sourceEntity,
      targetEntity: r.targetEntity,
      relationType: r.type || r.relationType || 'RELATED_TO',
      confidence:   r.confidence ?? 0.5,
      context:      r.evidence   || null,
    }));
    ctx.stats.relationsFound = ctx.relations.length;
  }

  addLog(ctx, 'extract-entities', `${mId}: ${ctx.entities.length} entities, ${ctx.relations?.length || 0} relations`);
}

// ── Claude Code CLI (DOCUMENT mode) ──────────────────────────────────────────

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

  // Store AI metadata on ctx for downstream use
  ctx._aiSummary    = result.summary;
  ctx._aiModel      = result.model;
  ctx._claudeOutput = result.rawPhase1Output || null;

  return result.entities
    .filter(e => e && e.name && e.type)
    .map(e => normalizeEntity(
      { ...e, _aiSummary: result.summary, _aiModel: result.model },
      ctx.sourceId
    ));
}

// ── LLMProviderService (WORKSPACE mode) ──────────────────────────────────────

async function extractViaLLMProvider(ctx) {
  const { extractEntities } = require('../../workspace/extraction/entity.extractor');
  const result = await extractEntities(ctx.text, {
    documentType: ctx.documentType || 'UNKNOWN',
    domain: ctx.domain || 'GENERAL',
    onProgress: (p) => addLog(ctx, 'extract-entities', `chunk ${p.current}/${p.total}`),
  });
  return (result.entities || []).map(e => normalizeEntity(e, ctx.sourceId));
}

// ── Regex fallback ────────────────────────────────────────────────────────────

async function extractViaRegex(ctx) {
  const { documentAIExtractionService: aiSvc } = require('../../knowledge/document-ai-extraction.service');
  if (typeof aiSvc.extractViaRegex !== 'function') return [];
  return aiSvc.extractViaRegex(ctx.text, {
    documentType: ctx.documentType,
    epistemicLayer: ctx.epistemicLayer,
  });
}

module.exports.normalizeEntity       = normalizeEntity;
module.exports.normalizeType         = normalizeType;
module.exports.inferEpistemicLayer   = inferEpistemicLayer;
module.exports.EPISTEMIC_LAYERS      = EPISTEMIC_LAYERS;
