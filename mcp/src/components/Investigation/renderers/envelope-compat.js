/**
 * envelope-compat.js — CGE Envelope → legacy content shape normalizers.
 *
 * Each primitive type that returns a CGE envelope registers an extractor here.
 * Renderers call `fromEnvelope(content, primitiveType)` to get back the
 * legacy shape they expect, regardless of whether the artifact was produced
 * by an old or new version of the primitive.
 *
 * Detection: CGE envelopes have `Array.isArray(content.nodes)`.
 * Legacy artifacts have the primitive-specific content object directly.
 */

// ── Per-type extractors ────────────────────────────────────────────────────────

const EXTRACTORS = {
  PROFILE: (env) => ({
    entity:        env.summary?.entity || null,
    relationships: env.projection?.hints?.relationships || {},
    provenance:    env.summary?.provenance || null,
    summary:       env.summary?.statistics || null,
  }),

  EXPAND: (env) => ({
    entityId:  env.roots?.[0],
    depth:     env.summary?.depth,
    nodeCount: env.summary?.nodeCount ?? env.nodes.length,
    edgeCount: env.summary?.edgeCount ?? env.edges.length,
    // Map CGE fields back to legacy renderer fields
    nodes: env.nodes.map(n => ({ ...n, type: n.label })),
    edges: env.edges.map(e => ({ ...e, sourceId: e.source, targetId: e.target })),
  }),

  CONNECT: (env) => ({
    fromEntityId:       env.roots?.[0],
    toEntityId:         env.roots?.[1],
    paths:              env.projection?.hints?.paths              || [],
    bundles:            env.projection?.hints?.bundles            || {},
    entities:           env.nodes.map(n => ({ ...n, type: n.label })),
    relationships:      env.edges.map(e => ({ ...e, sourceId: e.source, targetId: e.target })),
    structuralAnalysis: env.summary?.structuralAnalysis          || null,
    interpretation:     env.summary?.interpretation              || null,
  }),

  STRUCTURE: (env) => ({
    nodes:    env.nodes.map(n => ({ ...n, type: n.label })),
    edges:    env.edges.map(e => ({ ...e, sourceId: e.source, targetId: e.target })),
    metrics:  env.projection?.hints?.metrics  || [],
    bridges:  env.projection?.hints?.bridges  || [],
    summary:  env.summary                     || null,
  }),

  IMPACT: (env) => {
    const hints = env.projection?.hints || {};
    return {
      entity:               env.summary?.entity              || null,
      directDependents:     hints.directDependents           || [],
      transitiveDependents: hints.transitiveDependents       || [],
      impactByCategory:     hints.impactByCategory           || {},
      structuralAnalysis:   hints.structuralAnalysis         || null,
      criticalPaths:        hints.criticalPaths              || [],
      riskAssessment:       env.summary?.riskAssessment      || null,
      recommendations:      hints.recommendations            || [],
      summary: {
        headline:      env.summary?.headline      || null,
        totalEntities: env.summary?.totalEntities || 0,
        direct:        env.summary?.direct        || 0,
        transitive:    env.summary?.transitive    || 0,
      },
    };
  },

  LOCATE: (env) => ({
    query:      env.summary?.query || env.projection?.hints?.query || null,
    results:    env.projection?.hints?.results || env.nodes.map(n => ({
      entityId: n.id, name: n.name, type: n.label, namespace: n.namespace,
      description: n.description || '', epistemicLayer: n.epistemicLayer || '',
      isInForce: n.isInForce !== undefined ? n.isInForce : true,
    })),
    total:      env.summary?.totalFound ?? env.nodes.length,
    totalFound: env.summary?.totalFound ?? env.nodes.length,
    byType:     env.summary?.byType || {},
  }),

  RESOLVE: (env) => ({
    anchor:          env.summary?.anchor || null,
    candidates:      env.projection?.hints?.candidates || [],
    suggestedMerges: env.projection?.hints?.suggestedMerges || [],
    summary: {
      candidateCount:      env.summary?.totalCandidates ?? 0,
      highConfidenceMerges:env.summary?.highConfidenceMerges ?? 0,
    },
  }),

  MATRIX: (env) => ({
    rowEntities: env.projection?.hints?.rowEntities || [],
    colEntities: env.projection?.hints?.colEntities || [],
    cells:       env.projection?.hints?.cells       || [],
    relTypes:    env.projection?.hints?.relTypes    || ['all'],
    summary:     env.summary                        || null,
  }),

  TIMELINE: (env) => ({
    events:      env.projection?.hints?.events      || [],
    span:        env.projection?.hints?.span        || null,
    entityCount: env.projection?.hints?.entityCount ?? env.nodes.length,
    summary:     env.summary                        || null,
  }),

  TEXT: (env) => ({
    title:       env.summary?.title       || null,
    body:        env.summary?.body        || null,
    wordCount:   env.summary?.wordCount   || 0,
    hasEvidence: env.summary?.hasEvidence || false,
  }),

  SYNTHESIZE: (env) => ({
    narrative:          env.summary?.narrative          || 'No narrative generated.',
    claimsWithEvidence: env.summary?.claimsWithEvidence || [],
    focus:              env.summary?.focus              || '',
    format:             env.summary?.format             || 'summary',
    evidenceCount:      env.summary?.evidenceCount      || 0,
    entities:           env.nodes.map(n => ({ ...n, type: n.label })),
  }),
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Normalize artifact content to the legacy renderer shape.
 * Pass-through if content is already in legacy format (no .nodes array).
 *
 * @param {Object} content — artifact.content (CGE envelope or legacy object)
 * @param {string} primitiveType — e.g. 'PROFILE', 'EXPAND', ...
 * @returns {Object} renderer-ready content
 */
export function fromEnvelope(content, primitiveType) {
  if (!Array.isArray(content?.nodes)) return content; // already legacy
  const extractor = EXTRACTORS[primitiveType];
  if (!extractor) return content; // unknown type → pass through
  return extractor(content);
}

/**
 * Check whether a content object is a CGE envelope.
 */
export function isCGEEnvelope(content) {
  return Array.isArray(content?.nodes);
}
