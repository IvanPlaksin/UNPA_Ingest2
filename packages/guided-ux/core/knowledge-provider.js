/**
 * The knowledge-provider contract — the second boundary of this system.
 *
 * Where the anchor registry keeps the tour from knowing the host's DOM, this keeps it
 * from knowing the host's DATABASE. A tour that imported a graph driver would be a
 * tour that only runs where that database runs, and the requirement here is the
 * opposite: the same package should sit on a site that has nothing but a JSON file.
 *
 * So a provider answers three questions and no others:
 *
 *   listScenarios()      what tours exist here
 *   getScenario(id)      the steps, in whatever language the host asked for
 *   search(query, opts)  free-text lookup, for the assistant to answer a question
 *
 * `search` is the interesting one. With a vector store behind it the assistant can
 * answer about things no step mentions; with a JSON file it can only find what the
 * steps say. Both are legitimate — but the difference must be VISIBLE, because an
 * assistant that says "I don't know" and an assistant that cannot look are different
 * things to a user. Hence `capabilities`, and hence every result carrying where it
 * came from.
 *
 * @module @guided-ux/tour/core/knowledge-provider
 */

/**
 * @typedef {object} SearchHit
 * @property {string} id
 * @property {string} text
 * @property {number} [score]
 * @property {'step'|'document'|'anchor'|string} kind
 * @property {string} [scenarioId]
 * @property {string} [stepId]      Set when the hit is somewhere the tour can go.
 * @property {string} [source]      Which provider produced it — shown, not hidden.
 */

/**
 * @typedef {object} ProviderCapabilities
 * @property {boolean} vectorSearch  False for a static provider; the UI says so.
 * @property {boolean} graph         Related-content traversal available.
 * @property {string[]} languages
 */

/**
 * Assert an object satisfies the contract. Used at composition time so a
 * half-implemented provider fails on the first line rather than mid-tour.
 * @param {any} p
 * @returns {{ok:boolean, missing:string[]}}
 */
function checkProvider(p) {
  const required = ['listScenarios', 'getScenario', 'search', 'capabilities'];
  const missing = required.filter((m) => !p || typeof p[m] !== 'function');
  return { ok: missing.length === 0, missing };
}

/**
 * Wrap a provider so a failure degrades instead of ending the tour.
 *
 * The knowledge store is the one dependency guaranteed to be remote, and a tour that
 * dies because a search timed out is worse than one that says "I could not look that
 * up". Scenario loading still throws — without a scenario there is nothing to show,
 * and pretending otherwise would put an empty tour on screen.
 *
 * @param {object} provider
 * @param {{onError?:(where:string, err:Error)=>void}} [opts]
 */
function resilient(provider, opts = {}) {
  const onError = opts.onError || (() => {});
  const { ok, missing } = checkProvider(provider);
  if (!ok) throw new TypeError(`knowledge provider is missing: ${missing.join(', ')}`);

  return {
    capabilities: () => {
      try { return provider.capabilities(); } catch { return { vectorSearch: false, graph: false, languages: ['en'] }; }
    },
    listScenarios: async (...a) => {
      try { return await provider.listScenarios(...a); } catch (e) { onError('listScenarios', e); return []; }
    },
    // Deliberately NOT caught: see above.
    getScenario: (...a) => provider.getScenario(...a),
    search: async (...a) => {
      try { return await provider.search(...a); } catch (e) { onError('search', e); return []; }
    },
  };
}

export { checkProvider, resilient };
