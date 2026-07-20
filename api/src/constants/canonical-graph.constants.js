'use strict';

/**
 * Canonical Graph Constants — CGE (Canonical Graph Envelope)
 *
 * Single source of truth for the Entity Store edge vocabulary and
 * the Canonical Graph Envelope contract used across:
 *  - Investigation primitives (I/O contract)
 *  - AOPEG executors (methodology nodes)
 *  - MCP tools (context tools)
 *  - AI assistants (unified graph language)
 *
 * U2=B decision: ES_RELATED_TO {relType} → typed edge labels.
 * This file is the vocabulary that enables that migration.
 */

// ── Edge Vocabulary ───────────────────────────────────────────────────────────
// 18 canonical entity relationship types derived from live data (2026-07-06).
// Distribution: MENTIONS(6752) REFERENCES(666) PART_OF(658) RELATED_TO(412)
//   MANDATES(395) IMPLEMENTS(379) GOVERNS(343) SUPPORTS(300) COOPERATES_WITH(298)
//   OVERSEES(298) ESTABLISHES(267) AUTHORED_BY(205) REPORTS_TO(192)
//   REQUIRES(145) ESTABLISHED_BY(106) DEFINES(104) CHAIRED_BY(31) FUNDED_BY(21)
// 465 edges with null relType → normalized to RELATED_TO.

const EDGE_TYPES = Object.freeze({
  // Structural / governance (semantic, 1 per pair)
  GOVERNS:        'GOVERNS',
  MANDATES:       'MANDATES',
  OVERSEES:       'OVERSEES',
  ESTABLISHED_BY: 'ESTABLISHED_BY',
  ESTABLISHES:    'ESTABLISHES',
  DEFINES:        'DEFINES',
  REPORTS_TO:     'REPORTS_TO',
  PART_OF:        'PART_OF',
  CHAIRED_BY:     'CHAIRED_BY',

  // Operational / aggregable (can appear N times per pair, from different docs)
  IMPLEMENTS:     'IMPLEMENTS',
  REQUIRES:       'REQUIRES',
  AUTHORED_BY:    'AUTHORED_BY',
  FUNDED_BY:      'FUNDED_BY',
  REFERENCES:     'REFERENCES',
  SUPPORTS:       'SUPPORTS',
  COOPERATES_WITH: 'COOPERATES_WITH',
  MENTIONS:       'MENTIONS',
  RELATED_TO:     'RELATED_TO',  // default / fallback for null relType
});

// Structural (governance) edge types — typically one per node pair
const STRUCTURAL_EDGE_TYPES = new Set([
  EDGE_TYPES.GOVERNS,
  EDGE_TYPES.MANDATES,
  EDGE_TYPES.OVERSEES,
  EDGE_TYPES.ESTABLISHED_BY,
  EDGE_TYPES.ESTABLISHES,
  EDGE_TYPES.DEFINES,
  EDGE_TYPES.REPORTS_TO,
  EDGE_TYPES.PART_OF,
  EDGE_TYPES.CHAIRED_BY,
]);

// Aggregable edge types — commonly appear multiple times per pair (different documents)
const AGGREGABLE_EDGE_TYPES = new Set([
  EDGE_TYPES.IMPLEMENTS,
  EDGE_TYPES.REQUIRES,
  EDGE_TYPES.AUTHORED_BY,
  EDGE_TYPES.FUNDED_BY,
  EDGE_TYPES.REFERENCES,
  EDGE_TYPES.SUPPORTS,
  EDGE_TYPES.COOPERATES_WITH,
  EDGE_TYPES.MENTIONS,
  EDGE_TYPES.RELATED_TO,
]);

// All 18 canonical types as an array (for Cypher IN clauses)
const ALL_EDGE_TYPES = Object.values(EDGE_TYPES);

// Default for null relType during migration
const DEFAULT_EDGE_TYPE = EDGE_TYPES.RELATED_TO;

// ── Projection Kinds ──────────────────────────────────────────────────────────
// Hint to renderers about the preferred view of the envelope content.

const PROJECTION_KIND = Object.freeze({
  GRAPH:    'graph',    // general graph (nodes + edges)
  PATHS:    'paths',    // sequential chains (CONNECT)
  MATRIX:   'matrix',  // cross-tabulation (MATRIX)
  TIMELINE: 'timeline', // chronological (TIMELINE)
  DOSSIER:  'dossier', // entity profile (PROFILE)
  LIST:     'list',    // flat entity list (LOCATE, RESOLVE)
  TREE:     'tree',    // hierarchical (IMPACT dependency tree)
  TEXT:     'text',    // narrative (SYNTHESIZE, TEXT)
});

// ── CGE Node ──────────────────────────────────────────────────────────────────
// Minimal node structure. All primitives emit nodes in this shape.
// Full Knowledge Quantum fields are optional extensions.

/**
 * @typedef {Object} CGENode
 * @property {string}  id          - Stable entity ID (ESEntity.id)
 * @property {string}  label       - Entity type (Organization, Document, System, …)
 * @property {string}  name        - Human-readable name
 * @property {string}  [namespace] - Knowledge namespace
 * @property {string}  [description]
 * @property {string}  [epistemicLayer] - L0–L5
 * @property {Object}  [semantic]  - { title, summary }
 * @property {Object}  [quality]   - { confidence: number }
 * @property {Object}  [provenance] - { sources: [{documentId, confidence}] }
 * @property {boolean} [isInForce] - For normative documents
 * @property {Object}  [properties] - Raw entity properties
 */

// ── CGE Edge ──────────────────────────────────────────────────────────────────
/**
 * @typedef {Object} CGEEdge
 * @property {string}  id          - Stable edge ID (or composite source|target|relType)
 * @property {string}  source      - Source node ID
 * @property {string}  target      - Target node ID
 * @property {string}  relType     - One of EDGE_TYPES values
 * @property {'forward'|'backward'|'undirected'} direction
 * @property {number}  [confidence]
 * @property {string}  [context]   - Text excerpt from source document
 * @property {string}  [documentId]
 * @property {Object}  [provenance] - { documentId, confidence, extractedAt }
 */

// ── CGE Envelope ─────────────────────────────────────────────────────────────
/**
 * @typedef {Object} CGEEnvelope
 * @property {CGENode[]}   nodes       - All nodes in the subgraph
 * @property {CGEEdge[]}   edges       - All edges in the subgraph
 * @property {string[]}    roots       - Focus node IDs (entry/anchor nodes)
 * @property {Object}      projection  - { kind: PROJECTION_KIND, hints: {} }
 * @property {Object}      provenance  - { producedBy: 'TOOL'|'AI', toolId, methodologyId, at }
 * @property {Object}      [summary]   - { headline, counts, ... } — primitive-specific summary
 */

// ── Cypher Helpers ────────────────────────────────────────────────────────────

/**
 * Returns a Cypher edge type pattern string for use in MATCH clauses.
 * For typed labels: getEdgeTypePattern() → ':GOVERNS|:MANDATES|...'
 * After U2 migration — used as `[r:GOVERNS|MANDATES|...]`
 *
 * @param {string[]} [types] - subset of EDGE_TYPES; defaults to all
 * @returns {string} e.g. ':GOVERNS|:MANDATES|:OVERSEES'
 */
function getEdgeTypePattern(types) {
  const list = types || ALL_EDGE_TYPES;
  return list.map(t => `:${t}`).join('|');
}

/**
 * Normalize a raw relType string to a canonical edge type.
 * Maps null/undefined → DEFAULT_EDGE_TYPE.
 * Unknown strings → DEFAULT_EDGE_TYPE (logged as warning).
 *
 * @param {string|null} relType
 * @returns {string} canonical EDGE_TYPES value
 */
function normalizeEdgeType(relType) {
  if (!relType) return DEFAULT_EDGE_TYPE;
  if (EDGE_TYPES[relType]) return relType;
  // Unknown type — fallback
  return DEFAULT_EDGE_TYPE;
}

/**
 * Build a CGE node from an ESEntity DB row.
 * @param {Object} row
 * @returns {CGENode}
 */
function buildNode(row) {
  return {
    id:             row.id || row.entityId,
    label:          row.type   || 'CONCEPT',
    name:           row.name   || '',
    namespace:      row.namespace    || null,
    description:    row.description  || null,
    epistemicLayer: row.epistemicLayer || null,
    isInForce:      row.isInForce != null ? row.isInForce !== false : undefined,
    semantic:       { title: row.name || '', summary: row.description || null },
    quality:        { confidence: row.confidence ?? null },
    provenance:     row.provenanceDocId ? { sources: [{ documentId: row.provenanceDocId }] } : null,
  };
}

/**
 * Build a CGE edge from an entity-store relationship row.
 * @param {Object} row
 * @returns {CGEEdge}
 */
function buildEdge(row) {
  return {
    id:         row.id || `${row.sourceId}|${row.targetId}|${row.relType || DEFAULT_EDGE_TYPE}`,
    source:     row.sourceId || row.source,
    target:     row.targetId || row.target,
    relType:    normalizeEdgeType(row.relType),
    direction:  row.direction || 'forward',
    confidence: row.confidence != null ? (typeof row.confidence === 'object' ? (row.confidence?.low ?? null) : row.confidence) : null,
    context:    row.context   || null,
    documentId: row.documentId || null,
    provenance: row.documentId ? { documentId: row.documentId, confidence: row.confidence || null } : null,
  };
}

/**
 * Create an empty CGE envelope.
 * @param {Object} opts
 * @returns {CGEEnvelope}
 */
function createEnvelope({ roots = [], kind = PROJECTION_KIND.GRAPH, hints = {}, producedBy = 'TOOL', toolId = null, methodologyId = null } = {}) {
  return {
    nodes:      [],
    edges:      [],
    roots:      roots,
    projection: { kind, hints },
    provenance: { producedBy, toolId, methodologyId, at: new Date().toISOString() },
    summary:    null,
  };
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  EDGE_TYPES,
  STRUCTURAL_EDGE_TYPES,
  AGGREGABLE_EDGE_TYPES,
  ALL_EDGE_TYPES,
  DEFAULT_EDGE_TYPE,
  PROJECTION_KIND,
  getEdgeTypePattern,
  normalizeEdgeType,
  buildNode,
  buildEdge,
  createEnvelope,
};
