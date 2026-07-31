'use strict';

/**
 * ПР-001 — runtime settings an operator can change, starting with the one that
 * decides WHICH GRAPH IS THE SYSTEM PROMPT.
 *
 * Until now that was `FLOWDESK_AGENT_PROMPT_ENTRY`, read from `process.env` at every
 * call site. An environment variable cannot be changed from a UI, so a selector built
 * on it would be the defect this project keeps meeting: the control moves, the value
 * is accepted, and the next process start throws it away. Nothing would say so.
 *
 * ONE SOURCE WITH A FALLBACK CHAIN, not three sources of truth. Read top to bottom,
 * first hit wins:
 *
 *   1. FLOWDESK_AGENT_PROMPT_ENTRY_FORCE=true → the env value, whatever is stored.
 *      The way back when the stored choice is the thing that broke the chat and the
 *      admin UI is exactly what you cannot reach.
 *   2. the stored setting — what the operator last chose.
 *   3. FLOWDESK_AGENT_PROMPT_ENTRY — the initial value on a clean install.
 *
 * The cache is a plain module variable, invalidated on write, because this is read on
 * EVERY chat turn and a Memgraph round trip per turn would be paid by the user waiting
 * for an answer.
 *
 * @module instances/flowdesk/services/flowdesk-settings.service
 */

const LABEL = 'FlowdeskSetting';
const ACTIVE_PROMPT_ENTRY = 'agent.promptEntryId';

let _driver = null;
function driver() { return _driver || (_driver = require('../schema-graph/driver')); }

// key → value. `undefined` means "not read yet"; `null` means "read, and absent" —
// the difference is what stops a missing setting from being re-queried every turn.
const _cache = new Map();

const forced = () => String(process.env.FLOWDESK_AGENT_PROMPT_ENTRY_FORCE || '').toLowerCase() === 'true';

async function getSetting(key) {
  if (_cache.has(key)) return _cache.get(key);
  let value = null;
  try {
    const rows = await driver().read(
      `MATCH (s:${LABEL} {key: $key}) RETURN s.value AS value`, { key },
    );
    value = rows.length ? (rows[0].get('value') ?? null) : null;
  } catch {
    // Storage unreachable. Cache NOTHING — the next call must try again rather than
    // remember an outage as "the operator never chose anything".
    return null;
  }
  _cache.set(key, value);
  return value;
}

async function setSetting(key, value, updatedBy) {
  const now = new Date().toISOString();
  await driver().write(
    `MERGE (s:${LABEL} {key: $key})
     ON CREATE SET s.createdAt = $now
     SET s.value = $value, s.updatedAt = $now, s.updatedBy = $updatedBy, s.namespace = 'FlowDesk'
     RETURN s`,
    { key, value: value == null ? null : String(value), now, updatedBy: updatedBy || 'admin' },
  );
  _cache.set(key, value == null ? null : String(value));
  return { key, value, updatedAt: now };
}

/**
 * The graph the running agent compiles.
 *
 * Synchronous callers still exist (`agentEntryId()` in several services), so the
 * resolved value is also mirrored into `process.env` on read — that keeps a stale
 * env from disagreeing with a stored choice for the rest of the process's life.
 *
 * @returns {Promise<string|null>}
 */
async function getActivePromptEntry() {
  if (forced()) return process.env.FLOWDESK_AGENT_PROMPT_ENTRY || null;
  const saved = await getSetting(ACTIVE_PROMPT_ENTRY);
  if (saved) {
    process.env.FLOWDESK_AGENT_PROMPT_ENTRY = saved;
    return saved;
  }
  return process.env.FLOWDESK_AGENT_PROMPT_ENTRY || null;
}

/** What the chain resolved and WHY, for a UI that must not lie about its own effect. */
async function describeActivePromptEntry() {
  const envValue = process.env.FLOWDESK_AGENT_PROMPT_ENTRY || null;
  if (forced()) {
    return {
      entryId: envValue, source: 'env-forced', editable: false,
      notice: 'FLOWDESK_AGENT_PROMPT_ENTRY_FORCE is set, so the environment wins and a '
        + 'choice made here would have no effect until it is unset.',
    };
  }
  const saved = await getSetting(ACTIVE_PROMPT_ENTRY);
  if (saved) return { entryId: saved, source: 'stored', editable: true, notice: null };
  return {
    entryId: envValue, source: 'env', editable: true,
    notice: envValue ? 'Set from the environment; no choice has been stored yet.' : null,
  };
}

/**
 * ПР-002 — make a graph the system prompt, but only if it can actually BE one.
 *
 * Three gates, all hard failures. A warning here would be an invitation to break the
 * chat outright: this is the one setting where a bad value stops every conversation,
 * and the operator finds out from users rather than from the screen.
 *
 * @param {string} entryId
 * @param {{updatedBy?:string}} [opts]
 */
async function setActivePromptEntry(entryId, opts = {}) {
  const id = String(entryId || '').trim();
  if (!id) throw Object.assign(new Error('entryId is required'), { status: 400 });

  const editor = require('./prompt-editor.service');

  // 1. It exists, and it is the agent's ontology. A CHAT_PROMPT graph would load and
  //    compile to an empty prompt — the state machine's nodes keep their text in
  //    fields the agent's compiler does not read.
  let loaded;
  try {
    loaded = await editor.getGraph(id, undefined, 'agent');
  } catch (e) {
    throw Object.assign(new Error(`Graph ${id} could not be loaded: ${e.message}`), { status: 400 });
  }
  if (!loaded) throw Object.assign(new Error(`Graph ${id} was not found.`), { status: 404 });

  // `schemaVersion` is stamped by the writer, not stored on the nodes — `getGraph`
  // returns the graph flattened for the editor and without it. Validating that shape
  // fails on EVERY graph, healthy ones included, with a message about a missing
  // property rather than anything the operator did. Caught by the test that expected
  // a context name and got a schema complaint instead.
  const { SCHEMA_VERSION } = require('../../../services/evolutio/evolutio-prompt.constants');
  const graph = { schemaVersion: SCHEMA_VERSION, nodes: loaded.nodes || [], edges: loaded.edges || [] };

  // 2. It passes the ontology's own validator.
  const validation = editor.validate(graph, { source: 'agent' });
  const errors = (validation && validation.errors) || [];
  if (errors.length) {
    throw Object.assign(
      new Error(`Graph ${id} has validation errors and cannot be made live: ${errors[0].message}`),
      { status: 400, validation },
    );
  }

  // 3. It compiles in EVERY reachable context, not just the default one. A graph that
  //    compiles at rest and throws once the conversation reaches `confirm` would fail
  //    mid-dialogue, for some users only, and look like an intermittent fault.
  const { REACHABLE_CONTEXTS } = require('../../../services/evolutio/evolutio-prompt.coverage');
  for (const ctx of REACHABLE_CONTEXTS) {
    try {
      const out = editor.compile(graph, {
        source: 'agent', language: 'en', phase: ctx.phase, toolContext: ctx.toolContext,
      });
      // Counting RULES, not characters. A graph with no nodes still compiles to a
      // non-empty string — the title heading — so a text-length check passes it and
      // the assistant goes live with nothing in front of the model. What must be true
      // is that this context puts at least one rule there.
      const rules = (out && out.manifest && out.manifest.nodes) || [];
      if (!rules.length) throw new Error('no rule reaches the model in this context');
    } catch (e) {
      throw Object.assign(
        new Error(`Graph ${id} fails in the "${ctx.name}" context: ${e.message}`),
        { status: 400 },
      );
    }
  }

  await setSetting(ACTIVE_PROMPT_ENTRY, id, opts.updatedBy);
  // The synchronous readers elsewhere read env; without this they would keep serving
  // the previous graph until the process restarted.
  process.env.FLOWDESK_AGENT_PROMPT_ENTRY = id;
  return { entryId: id, name: loaded.name || null, source: 'stored' };
}

/** Test seam — the cache is process-wide and would otherwise leak between cases. */
function _resetCache() { _cache.clear(); }

// Resolve the chain once shortly after load, so `process.env` carries the STORED
// choice before the first chat turn arrives. Several readers of the live entry are
// synchronous (`agentEntryId()`), and without this warm-up they would serve the
// previous graph for the first turns after every restart — a window in which the
// operator's choice appears to have been forgotten and then to have taken hold on
// its own. Fire-and-forget: a failure here leaves the env value in place, which is
// what those readers used before this service existed.
setImmediate(() => { getActivePromptEntry().catch(() => {}); });

module.exports = {
  getSetting, setSetting,
  getActivePromptEntry, setActivePromptEntry, describeActivePromptEntry,
  ACTIVE_PROMPT_ENTRY, _resetCache,
};
