'use strict';

const { addLog, startStep, completeStep, skipStep, failStep } = require('../pipeline-context');

// ── Canonical relation types (synchronized with RelTypeWeight in Memgraph) ────
const CANONICAL_RELATION_TYPES = new Set([
  'GOVERNS', 'MANDATES', 'IMPLEMENTS', 'OVERSEES',
  'ESTABLISHED_BY', 'ESTABLISHES', 'DEFINES', 'REQUIRES', 'REPORTS_TO', 'PART_OF',
  'AUTHORED_BY', 'CHAIRED_BY', 'FUNDED_BY',
  'REFERENCES', 'SUPPORTS', 'COOPERATES_WITH',
  'MENTIONS', 'RELATED_TO',
  // Temporal / supersession relation types
  'SUPERSEDES', 'REVOKES', 'AMENDS', 'EXTENDS', 'RENEWS', 'SUPPLEMENTS', 'PARTIALLY_SUPERSEDES',
]);

// Maps non-canonical variants → canonical
const REL_TYPE_ALIASES = {
  'GOVERNED_BY':         'GOVERNS',
  'GOVERNS_BY':          'GOVERNS',
  'MANDATED_BY':         'MANDATES',
  'ESTABLISHED':         'ESTABLISHED_BY',
  'CREATES':             'ESTABLISHES',
  'AUTHORED':            'AUTHORED_BY',
  'CHAIRED':             'CHAIRED_BY',
  'FUNDS':               'FUNDED_BY',
  'FUNDED':              'FUNDED_BY',
  'REFER':               'REFERENCES',
  'REFERENCE':           'REFERENCES',
  'MENTION':             'MENTIONS',
  'RELATED':             'RELATED_TO',
  'COOPERATE_WITH':      'COOPERATES_WITH',
  'COOPERATED':          'COOPERATES_WITH',
  // Supersession aliases
  'REPLACES':            'SUPERSEDES',
  'REPLACE':             'SUPERSEDES',
  'CANCELS':             'REVOKES',
  'CANCEL':              'REVOKES',
  'ANNULS':              'REVOKES',
  'TERMINATES':          'REVOKES',
  'PARTIALLY_REPLACES':  'PARTIALLY_SUPERSEDES',
  'EXTEND':              'EXTENDS',
  'RENEW':               'RENEWS',
  'SUPPLEMENT':          'SUPPLEMENTS',
  'AMEND':               'AMENDS',
};

// ── normalizeRelation ─────────────────────────────────────────────────────────

function normalizeRelType(raw) {
  if (!raw) return 'RELATED_TO';
  const up = String(raw).toUpperCase().replace(/[\s-]/g, '_');
  if (CANONICAL_RELATION_TYPES.has(up)) return up;
  return REL_TYPE_ALIASES[up] || 'RELATED_TO';
}

function normalizeRelation(raw, entityNameSet, documentId) {
  const source = (raw.sourceEntity || raw.source || '').trim();
  const target = (raw.targetEntity || raw.target || '').trim();

  if (!source || !target) return null;
  if (source.toLowerCase() === target.toLowerCase()) return null;

  // In workspace mode, entityNameSet may be null — skip validation
  if (entityNameSet) {
    const srcLower = source.toLowerCase();
    const tgtLower = target.toLowerCase();
    const names = [...entityNameSet].map(n => n.toLowerCase());
    if (!names.includes(srcLower) || !names.includes(tgtLower)) return null;
  }

  const relType    = normalizeRelType(raw.relationType || raw.relType);
  const confidence = Math.min(1, Math.max(0, parseFloat(raw.confidence) || 0.5));

  if (confidence < 0.25) return null;

  return {
    sourceEntity: source,
    targetEntity: target,
    relationType: relType,
    confidence,
    context:         (raw.context  || '').slice(0, 500),
    evidence:        raw.evidence  || null,
    provenanceDocId: documentId    || null,
  };
}

// ── Pipeline step ─────────────────────────────────────────────────────────────

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

    const rawRelations = result.relations || [];
    const entityNameSet = new Set(ctx.entities.map(e => e.name));

    ctx.relations = rawRelations
      .map(r => normalizeRelation(r, entityNameSet, ctx.sourceId))
      .filter(Boolean);

    ctx.stats.relationsFound = ctx.relations.length;
    addLog(ctx, 'extract-relations', `Extracted ${ctx.relations.length} relations (from ${rawRelations.length} raw)`);
    completeStep(ctx, 'extract-relations', { count: ctx.relations.length });
  } catch (err) {
    // Relations are non-fatal
    addLog(ctx, 'extract-relations', `Failed (non-fatal): ${err.message}`, 'warn');
    failStep(ctx, 'extract-relations', err);
    ctx.relations = [];
  }
};

module.exports.normalizeRelation         = normalizeRelation;
module.exports.normalizeRelType          = normalizeRelType;
module.exports.CANONICAL_RELATION_TYPES  = CANONICAL_RELATION_TYPES;
