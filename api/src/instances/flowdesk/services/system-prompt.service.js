'use strict';

/**
 * System-prompt service (ADMIN P6) — the runtime read-path for the graph-generated
 * chat system prompt, and the "apply" write-path.
 *
 * The prompt-graph editor persists graphs via the platform graph-catalog
 * (versioned: CatalogEntry→GraphVersion). "Applying" a version compiles its rules
 * graph to text (prompt-graph-compiler) and materializes it as the single ACTIVE
 * `(:FlowdeskSystemPrompt {active:true})` node. The interpreter engine reads that
 * one node every turn via getSystemPromptGuidance() — cached 30s, never throws —
 * exactly mirroring the P5 prompt-overlay read path so the two layers compose:
 *   [ graph system prompt (authoritative) ] + node body + [ P5 overlays (tuning) ].
 *
 * Modeled on services/prompt-overlay.service.js (separate from the schema-graph,
 * best-effort, cached). One active prompt at a time (global); flipping active is
 * atomic (deactivate-all then activate-one).
 *
 * @module instances/flowdesk/services/system-prompt.service
 */

const crypto = require('crypto');

const { compilePromptGraph, PROMPT_NODES } = require('./prompt-graph-compiler');

const CACHE_MS = 30 * 1000;
const MAX_TEXT = 16000; // system prompt can be large; guard against runaway graphs

/**
 * Stable identity of a compiled prompt (SUADA-PREREQ-001). Mirrors the
 * graph-catalog's contentHash convention (sha256 hex) so provenance recorded on
 * a chat turn can be joined against catalog artifacts by the same kind of key.
 * Hashing the COMPILED TEXT (not the graph) is deliberate: two graph versions
 * that compile to the same prompt are behaviorally identical, and attribution
 * should treat them as one.
 */
const textHashOf = (text) => (text ? crypto.createHash('sha256').update(String(text)).digest('hex') : null);

let _write = null;
let _read = null;
function w() { if (!_write) _write = require('../schema-graph/driver').write; return _write; }
function r() { if (!_read) _read = require('../schema-graph/driver').read; return _read; }

let _cache = { at: 0, value: undefined };
function invalidateCache() { _cache = { at: 0, value: undefined }; }

const cap = (s) => (s == null ? null : String(s).slice(0, MAX_TEXT));

/**
 * Apply a compiled prompt as the active system prompt. Deactivates any previous
 * active prompt, then creates the new active node. Returns the stored record.
 * @param {object} p {text, byNodeJson?, graphEntryId?, graphVersion?, ruleCount?, updatedBy?, label?}
 */
async function applyActivePrompt(p) {
  const text = cap(p.text);
  if (!text || text.trim().length < 10) throw Object.assign(new Error('compiled prompt is empty'), { status: 400 });
  const record = {
    promptId: `FSP-${Date.now().toString(36)}`,
    text,
    textHash: textHashOf(text),
    byNodeJson: p.byNodeJson || null,
    graphEntryId: p.graphEntryId || null,
    graphVersion: p.graphVersion != null ? Number(p.graphVersion) : null,
    ruleCount: p.ruleCount != null ? Number(p.ruleCount) : null,
    label: p.label || null,
    updatedBy: p.updatedBy || 'admin',
    appliedAt: new Date().toISOString(),
  };
  // Deactivate all, then create the new active one (last-writer-wins, one active).
  await w()('MATCH (s:FlowdeskSystemPrompt {active:true}) SET s.active=false', {});
  await w()(
    `CREATE (s:FlowdeskSystemPrompt {promptId:$promptId, active:true, text:$text, textHash:$textHash,
       byNodeJson:$byNodeJson,
       graphEntryId:$graphEntryId, graphVersion:$graphVersion, ruleCount:$ruleCount,
       label:$label, updatedBy:$updatedBy, appliedAt:$appliedAt})`,
    record
  );
  invalidateCache();
  return record;
}

/** Compile a rules graph and apply it as active in one step. */
async function applyFromGraph(graph, meta = {}) {
  const { validatePromptGraph } = require('./prompt-graph-validator');
  const validation = validatePromptGraph(graph);
  if (!validation.ok) {
    throw Object.assign(new Error(`prompt graph invalid: ${validation.errors.map((e) => e.message).join('; ')}`), { status: 400, validation });
  }
  const compiled = compilePromptGraph(graph, { title: meta.title });
  const record = await applyActivePrompt({
    text: compiled.text,
    byNodeJson: JSON.stringify(compiled.byNode),
    graphEntryId: meta.graphEntryId,
    graphVersion: meta.graphVersion,
    ruleCount: compiled.ruleCount,
    label: meta.label,
    updatedBy: meta.updatedBy,
  });
  return { record, compiled, validation };
}

/** The currently active prompt record (or null). */
async function getActivePrompt() {
  const rows = await r()('MATCH (s:FlowdeskSystemPrompt {active:true}) RETURN s ORDER BY s.appliedAt DESC LIMIT 1', {});
  if (!rows.length) return null;
  return rows[0].get('s').properties;
}

/** History of applied prompts (newest first). */
async function listApplied({ limit = 50 } = {}) {
  const { neo4j } = require('../schema-graph/driver');
  const rows = await r()(
    'MATCH (s:FlowdeskSystemPrompt) RETURN s ORDER BY s.appliedAt DESC LIMIT $limit',
    { limit: neo4j.int(Math.min(Math.max(1, Number(limit) || 50), 200)) });
  return rows.map((row) => {
    const p = row.get('s').properties;
    return { ...p, byNodeJson: undefined, text: (p.text || '').slice(0, 400) }; // trim for listing
  });
}

/** Clear the active prompt (revert the chat to base prompts + P5 overlays only). */
async function clearActivePrompt() {
  await w()('MATCH (s:FlowdeskSystemPrompt {active:true}) SET s.active=false', {});
  invalidateCache();
  return { cleared: true };
}

/**
 * Per-turn read path for the engine. Returns per-node guidance from the active
 * system prompt, plus its provenance (SUADA-PREREQ-001). NEVER throws — a store
 * failure yields empty guidance so the chat degrades to base prompts. Cached 30s.
 * @returns {Promise<{text:string|null, byNode:Object<string,string>,
 *                    entryId:string|null, version:number|null, textHash:string|null}>}
 */
async function getSystemPromptGuidance() {
  const now = Date.now();
  if (_cache.value !== undefined && now - _cache.at < CACHE_MS) return _cache.value;
  let value = { text: null, byNode: {}, entryId: null, version: null, textHash: null };
  try {
    const active = await getActivePrompt();
    if (active) {
      let byNode = {};
      try { byNode = active.byNodeJson ? JSON.parse(active.byNodeJson) : {}; } catch { byNode = {}; }
      const text = active.text || null;
      value = {
        text,
        byNode,
        entryId: active.graphEntryId || null,
        // Memgraph returns integers as neo4j Integer objects; normalize to Number.
        version: active.graphVersion != null ? Number(active.graphVersion) : null,
        // Prompts applied before this field existed carry no stored hash — derive
        // it from the text so historical turns are still attributable.
        textHash: active.textHash || textHashOf(text),
      };
    }
  } catch (err) {
    console.warn('[system-prompt] getSystemPromptGuidance failed:', err.message);
  }
  _cache = { at: now, value };
  return value;
}

/**
 * Provenance of the prompt currently governing the chat — the join key between a
 * recorded turn and the prompt-graph version that produced its behavior
 * (SUADA-PREREQ-001). Never throws; all-null when no prompt is applied.
 * @returns {Promise<{promptGraphEntryId:string|null, promptGraphVersion:number|null, promptTextHash:string|null}>}
 */
async function getProvenance() {
  const g = await getSystemPromptGuidance();
  return {
    promptGraphEntryId: (g && g.entryId) || null,
    promptGraphVersion: (g && g.version != null) ? g.version : null,
    promptTextHash: (g && g.textHash) || null,
  };
}

/** Convenience for the engine: the text scoped to one chat LLM node (falls back to full text). */
async function guidanceForNode(node) {
  const g = await getSystemPromptGuidance();
  if (!g) return null;
  if (g.byNode && g.byNode[node]) return g.byNode[node];
  return g.text;
}

function _setDeps({ write, read } = {}) { _write = write || null; _read = read || null; invalidateCache(); }

module.exports = {
  applyActivePrompt, applyFromGraph, getActivePrompt, listApplied, clearActivePrompt,
  getSystemPromptGuidance, guidanceForNode, getProvenance, textHashOf,
  invalidateCache, PROMPT_NODES, MAX_TEXT, _setDeps,
};
