'use strict';

/**
 * PromptLoader (ШАГ 5) — the bridge from Dialogue Gym to the FlowDesk Prompt
 * Editor (P6, namespace CHAT_PROMPT). Lets the arena test any prompt-graph
 * VERSION from the editor, or the live production prompt, with full provenance.
 *
 * Wraps the existing `prompt-editor.service` (the same API the editor UI uses):
 *   listGraphs / getGraph(entryId, version) / getVersions(entryId) /
 *   getActive() / compile(graph).
 *
 * Both AltioraChat (text) and the voice assistant share ONE global system prompt
 * (a single active :FlowdeskSystemPrompt), so there is a single graph to load.
 *
 * @module services/dialogue-gym/prompt-loader
 */

const entryIdOf = (e) => (e && (e.entryId || e.id || e.graphId)) || null;

function createPromptLoader(deps = {}) {
  const pe = () => deps.promptEditor || require('../../instances/flowdesk/services/prompt-editor.service');

  /** List CHAT_PROMPT graphs (catalog entries). */
  async function listPromptGraphs() {
    const entries = await pe().listGraphs();
    return (entries || []).map((e) => ({
      entryId: entryIdOf(e),
      name: e.name || e.title || '(unnamed)',
      description: e.description || null,
      currentVersion: e.currentVersion ?? e.version ?? null,
      nodeCount: Array.isArray(e.nodes) ? e.nodes.length : undefined,
    })).filter((e) => e.entryId);
  }

  /** Versions of a graph (versionNumber, isProduction, changelog, …). */
  async function listVersions(entryId) {
    return pe().getVersions(entryId);
  }

  /**
   * Load a specific version's graph. versionNumber null → latest.
   * @returns {{nodes, edges, metadata:{entryId, versionNumber, name, isProduction}}}
   */
  async function loadVersion(entryId, versionNumber = null) {
    if (!entryId) throw Object.assign(new Error('entryId is required'), { status: 400 });
    const g = await pe().getGraph(entryId, versionNumber == null ? undefined : Number(versionNumber));
    if (!g) throw Object.assign(new Error(`prompt graph ${entryId}@${versionNumber ?? 'latest'} not found`), { status: 404 });
    return {
      nodes: g.nodes || [],
      edges: g.edges || [],
      metadata: {
        entryId,
        versionNumber: g.versionNumber ?? g.version ?? (versionNumber == null ? null : Number(versionNumber)),
        name: g.name || null,
        isProduction: Boolean(g.isProduction),
      },
    };
  }

  /**
   * Load the LIVE production prompt (the single active :FlowdeskSystemPrompt).
   * Prefers its source graph (graphEntryId+graphVersion, preserving per-node
   * scoping); falls back to the compiled text if it was applied from an inline
   * graph (no entryId). Returns null when nothing is applied.
   * @returns {{ nodes?, edges?, systemPromptText?, metadata }|null}
   */
  async function loadProduction() {
    const active = await pe().getActive();
    if (!active) return null;
    const entryId = active.graphEntryId || null;
    const version = active.graphVersion ?? null;
    if (entryId) {
      try {
        const v = await loadVersion(entryId, version);
        return { ...v, metadata: { ...v.metadata, source: 'production', entryId, versionNumber: v.metadata.versionNumber ?? version } };
      } catch { /* fall through to text */ }
    }
    return {
      systemPromptText: active.text || null,
      metadata: { source: 'production', entryId, versionNumber: version },
    };
  }

  /** Compile a graph to its markdown prompt text (preview). */
  async function compileToText(graph) {
    const res = await pe().compile(graph);
    return res && res.text;
  }

  return { listPromptGraphs, listVersions, loadVersion, loadProduction, compileToText };
}

module.exports = createPromptLoader();
module.exports.createPromptLoader = createPromptLoader;
