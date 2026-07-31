/**
 * The static provider — scenarios from a plain object, search over their own words.
 *
 * This is the floor of the system, and it exists for two reasons.
 *
 * The first is honest portability: a site that adopts this package has no Memgraph and
 * no vector store, and the tour still has to run there. Everything the core needs is
 * satisfiable from a JSON file, and this file proves it — if a feature cannot be
 * expressed here, it has leaked our infrastructure into the contract.
 *
 * The second is the assistant's honesty. With only step text to search, the assistant
 * can answer "where do I click" but not "why does the prompt only govern part of the
 * dialogue". It must therefore SAY it is limited rather than confidently inventing —
 * which is why `capabilities()` reports `vectorSearch: false` and every hit is labelled
 * with where it came from. A confident answer from a provider that cannot look things
 * up is the exact failure this whole design keeps refusing to ship.
 *
 * @module @guided-ux/tour/providers/json
 */

const stringsOf = (field, lang) => {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object') return field[lang] || field.en || Object.values(field)[0] || '';
  return '';
};

/** Words a query and a text share — crude on purpose, and never dressed up as more. */
function score(text, query) {
  const t = String(text || '').toLowerCase();
  const words = String(query || '').toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  if (!words.length) return 0;
  let hits = 0;
  for (const w of words) if (t.includes(w)) hits += 1;
  return hits / words.length;
}

/**
 * @param {{scenarios: object[], documents?: Array<{id:string,text:string|object,title?:string|object}>}} data
 */
function createJsonProvider(data = {}) {
  const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
  const documents = Array.isArray(data.documents) ? data.documents : [];
  const byId = new Map(scenarios.map((s) => [s.id, s]));

  const languages = [...new Set(scenarios.flatMap((s) => s.languages || []))];

  return {
    capabilities() {
      return {
        vectorSearch: false,
        graph: false,
        languages: languages.length ? languages : ['en'],
        // Said plainly so the assistant can tell the user what it cannot do, rather
        // than answering anyway.
        note: 'Static content: the assistant can only find what the tour itself says.',
      };
    },

    async listScenarios() {
      return scenarios.map((s) => ({
        id: s.id,
        name: s.name,
        steps: Array.isArray(s.steps) ? s.steps.length : 0,
      }));
    },

    async getScenario(id) {
      const s = byId.get(id);
      if (!s) throw new Error(`no scenario "${id}" in this content`);
      return s;
    },

    /**
     * @param {string} query
     * @param {{lang?:string, limit?:number, scenarioId?:string}} [opts]
     * @returns {Promise<import('../core/knowledge-provider').SearchHit[]>}
     */
    async search(query, opts = {}) {
      const lang = opts.lang || 'en';
      const limit = opts.limit || 5;
      const hits = [];

      for (const s of scenarios) {
        if (opts.scenarioId && s.id !== opts.scenarioId) continue;
        for (const step of s.steps || []) {
          const text = [stringsOf(step.content && step.content.title, lang), stringsOf(step.content && step.content.text, lang)]
            .filter(Boolean).join(' — ');
          const sc = score(text, query);
          // A hit carries the step it came from, so the assistant can offer to TAKE
          // the user there instead of only describing it.
          if (sc > 0) hits.push({ id: `${s.id}:${step.id}`, text, score: sc, kind: 'step', scenarioId: s.id, stepId: step.id, source: 'json' });
        }
      }
      for (const d of documents) {
        const text = stringsOf(d.text, lang);
        const sc = score(`${stringsOf(d.title, lang)} ${text}`, query);
        if (sc > 0) hits.push({ id: d.id, text, score: sc, kind: 'document', source: 'json' });
      }

      return hits.sort((a, b) => b.score - a.score).slice(0, limit);
    },
  };
}

export { createJsonProvider };
