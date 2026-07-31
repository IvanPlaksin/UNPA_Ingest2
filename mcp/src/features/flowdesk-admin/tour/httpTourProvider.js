/**
 * The knowledge provider for this host: six HTTP calls, nothing else.
 *
 * This file is the entire coupling between `@guided-ux/tour` and UNPA. The package
 * never learns that Memgraph or Qdrant exist — it asks three questions, and these are
 * our answers. A different site implements the same three over whatever it has, and
 * every component above this line is unchanged.
 *
 * @module features/flowdesk-admin/tour/httpTourProvider
 */

const BASE = '/api/v1/tour';

async function call(path, init) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
    body: init && init.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
  return data;
}

export function createHttpTourProvider() {
  // Reported by the server (it knows whether the vector store answered), and cached
  // after the first listing so the assistant can say what it can and cannot do
  // without a round trip per question.
  let caps = { vectorSearch: true, graph: true, languages: ['en', 'ru'], source: 'unpa' };

  return {
    capabilities: () => caps,

    async listScenarios() {
      const d = await call('/scenarios');
      if (d.capabilities) caps = d.capabilities;
      return d.scenarios || [];
    },

    // Not caught anywhere: a tour that cannot load its scenario must fail loudly
    // rather than open an empty overlay.
    getScenario: (id) => call(`/scenarios/${encodeURIComponent(id)}`),

    async search(query, opts = {}) {
      const d = await call('/search', {
        method: 'POST',
        body: { query, lang: opts.lang, scenarioId: opts.scenarioId, limit: opts.limit },
      });
      return d.hits || [];
    },

    /** Not part of the contract — the assistant's answer, passed in as `ask`. */
    async ask({ question, hits, lang, step, scenarioId }) {
      return call('/ask', { method: 'POST', body: { question, hits, lang, step, scenarioId } });
    },

    async health() { return call('/health'); },
  };
}
