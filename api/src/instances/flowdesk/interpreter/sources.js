'use strict';

/**
 * Source references for a turn answer (Altiora Assistant — "Show sources").
 *
 * PHASE 1 (MVP): light fields only. The chat KB (Qdrant `altiora_knowledge`)
 * does NOT yet carry UN provenance (sourceDocumentSymbol / Admiralty code /
 * inForceStatus / validity dates) — see PHASE0_ASIS_REPORT.md (F3). So a Source
 * here describes an answer's origin at the ARTICLE level only. Full provenance
 * enrichment is a later, separate task (Phase 10) and will extend this shape
 * without breaking it.
 *
 * @typedef {Object} Source
 * @property {string}  id         articleId — unique KB identifier
 * @property {string}  title      human-readable article/document title
 * @property {string}  collection sourceCollection — origin dataset/category
 * @property {number}  relevance  Qdrant score (0.0–1.0), rounded to 2 decimals
 * @property {string} [snippet]   answerSnippet — short preview (≤200 chars, "…" if longer)
 *
 * @module instances/flowdesk/interpreter/sources
 */

/** Max sources surfaced per answer (avoid UI clutter). */
const MAX_SOURCES = 5;
/** Snippet hard cap in characters (keeps the payload lean). */
const SNIPPET_MAX = 200;

/**
 * Truncate a string to `max` chars, appending a single ellipsis when cut.
 * @param {*} s
 * @param {number} [max=SNIPPET_MAX]
 * @returns {string|undefined} undefined when there is nothing to show
 */
function truncate(s, max = SNIPPET_MAX) {
  if (s == null) return undefined;
  const str = String(s).trim();
  if (!str) return undefined;
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).trimEnd()}…`;
}

/** Round a score to 2 decimals; non-numeric → 0. */
function round2(n) {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.round(x * 100) / 100;
}

/**
 * Build the `sources[]` array for an answer from ARTICLE hits.
 *
 * Contract (Phase 1 acceptance):
 *  - never returns undefined — empty `[]` when there are no ARTICLE hits;
 *  - deduped by `id` (highest relevance kept when an article matches twice);
 *  - sorted by relevance descending;
 *  - capped at MAX_SOURCES;
 *  - snippet truncated to SNIPPET_MAX with "…".
 *
 * Accepts raw ARTICLE results (as produced by resolve-search.stub.js:
 * `{ type:'ARTICLE', articleId, title, sourceCollection?, answerSnippet?, summary?, score }`).
 * Non-ARTICLE entries and entries without an id are ignored.
 *
 * @param {Array<Object>} articles
 * @returns {Source[]}
 */
function buildSources(articles) {
  if (!Array.isArray(articles) || articles.length === 0) return [];

  /** @type {Map<string, Source>} keep the highest-relevance entry per id */
  const byId = new Map();
  for (const a of articles) {
    if (!a || a.articleId == null) continue;
    const id = String(a.articleId);
    const relevance = round2(a.score);
    const existing = byId.get(id);
    if (existing && existing.relevance >= relevance) continue;

    /** @type {Source} */
    const src = {
      id,
      title: a.title != null ? String(a.title) : id,
      collection: a.sourceCollection != null ? String(a.sourceCollection) : '',
      relevance,
    };
    const snippet = truncate(a.answerSnippet != null ? a.answerSnippet : a.summary);
    if (snippet) src.snippet = snippet;
    byId.set(id, src);
  }

  return [...byId.values()]
    .sort((x, y) => y.relevance - x.relevance)
    .slice(0, MAX_SOURCES);
}

module.exports = { buildSources, truncate, round2, MAX_SOURCES, SNIPPET_MAX };
