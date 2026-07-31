'use strict';

/**
 * Tour knowledge — the graph-and-vector implementation of the provider contract that
 * `@guided-ux/tour` defines.
 *
 * The package itself knows nothing about any of this. It asks three questions —
 * what tours exist, give me one, find me something — and this is one way to answer
 * them. The static JSON provider that ships inside the package is another, and the
 * fact that BOTH satisfy the same contract is what keeps the tour portable: a site
 * with no Memgraph and no Qdrant still gets a working tour, with a weaker assistant
 * and an honest label saying so.
 *
 * THE SHAPE, AND WHY.
 *
 *   (:TourScenario {id, name, section})
 *     -[:CONTAINS {order}]-> (:TourStep {id, content, anchorId, optional})
 *     (:TourStep) -[:NEXT]-> (:TourStep)
 *     (:TourStep) -[:TARGETS]-> (:TourAnchor {id, label, route})
 *
 * The anchor is a NODE, not a string on the step, because an anchor outlives any one
 * step: several scenarios point at the same panel, and "which tours mention the rule
 * explorer" is a question worth being able to ask. That is also what makes drift
 * detectable — an anchor node with no live registration is a step about to break.
 *
 * Vectors go to ONE collection with a `type` in the payload rather than one collection
 * per kind: the filter is cheaper than the collection, and the assistant nearly always
 * wants steps and explanations ranked together anyway.
 *
 * HYBRID, AND WHAT THE GRAPH ADDS. Vector search finds the passage; the graph then
 * pulls its neighbours — the step before and after, the anchor it targets. A question
 * asked mid-tour is usually about the SEQUENCE ("what do I do after this"), and pure
 * similarity answers the wrong question.
 *
 * @module services/tour/tour-knowledge.service
 */

const COLLECTION = process.env.TOUR_QDRANT_COLLECTION || 'tour_knowledge';
const VECTOR_SIZE = 1024;                       // multilingual-e5-large via TEI
const QDRANT_URL = () => process.env.QDRANT_URL || 'http://localhost:6333';

// ── deps (injectable for tests) ───────────────────────────────────────────────
let _deps = {};
function deps() {
  if (!_deps.read) {
    const driver = require('../../instances/flowdesk/schema-graph/driver');
    _deps.read = driver.read;
    _deps.write = driver.write;
  }
  if (!_deps.embed) {
    _deps.embed = async (text) => require('../ai/llm-provider/embedding').embedViaTei(text);
  }
  if (!_deps.fetch) _deps.fetch = (...a) => fetch(...a);
  return _deps;
}
function _setDeps(d) { _deps = { ..._deps, ...d }; }

const num = (v) => (v && typeof v === 'object' && 'low' in v ? v.low : v);
const parse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };

// ── read side: the provider contract ──────────────────────────────────────────

async function listScenarios() {
  const rows = await deps().read(
    // The aggregate goes through WITH: Memgraph loses `s` from scope when count() is
    // mixed into the RETURN of an OPTIONAL MATCH.
    `MATCH (s:TourScenario)
     OPTIONAL MATCH (s)-[:CONTAINS]->(st:TourStep)
     WITH s, count(st) AS steps
     RETURN s.id AS id, s.name AS name, s.section AS section, s.description AS description, steps
     ORDER BY s.section, s.id`, {},
  );
  return rows.map((r) => ({
    id: r.get('id'),
    name: parse(r.get('name'), r.get('name')),
    section: r.get('section') || null,
    description: parse(r.get('description'), r.get('description')),
    steps: num(r.get('steps')) || 0,
  }));
}

/**
 * One scenario, in the shape the runner validates. Throws when it does not exist —
 * an empty tour on screen would be worse than an error the host can report.
 */
async function getScenario(id) {
  const rows = await deps().read(
    // Everything the RETURN needs is carried through WITH first: collect() ends the
    // scope of the pattern variables, and ordering by `c.order` after it does not
    // resolve. Same shape of fix as listScenarios.
    `MATCH (s:TourScenario {id:$id})-[c:CONTAINS]->(st:TourStep)
     OPTIONAL MATCH (st)-[:NEXT]->(nx:TourStep)
     OPTIONAL MATCH (st)-[:TARGETS]->(a:TourAnchor)
     WITH s, st, c.order AS ord, a.id AS anchorId, collect(DISTINCT nx.id) AS nextIds
     RETURN s.id AS sid, s.name AS sname, s.entry AS entry, s.languages AS langs,
            st.id AS stepId, st.content AS content, st.optional AS optional,
            st.placement AS placement, st.navigate AS navigate, ord, nextIds, anchorId
     ORDER BY ord`, { id },
  );
  if (!rows.length) throw new Error(`no tour scenario "${id}"`);

  const steps = rows.map((r) => {
    const nextIds = (r.get('nextIds') || []).filter(Boolean);
    return {
      id: r.get('stepId'),
      anchorId: r.get('anchorId') || undefined,
      content: parse(r.get('content'), { text: '' }),
      optional: r.get('optional') === true,
      placement: r.get('placement') || undefined,
      navigate: r.get('navigate') ? parse(r.get('navigate'), undefined) : undefined,
      // One successor is a plain id; several mean the author wrote branches, which are
      // stored as ordered NEXT edges and rebuilt as an unguarded chain here.
      next: nextIds.length > 1 ? nextIds.map((to) => ({ to })) : (nextIds[0] || undefined),
      _order: num(r.get('ord')),
    };
  });

  return {
    id: rows[0].get('sid'),
    name: parse(rows[0].get('sname'), rows[0].get('sname')),
    entry: rows[0].get('entry') || steps[0].id,
    languages: rows[0].get('langs') || ['en'],
    steps: steps.map(({ _order, ...s }) => s),
  };
}

function capabilities() {
  return {
    vectorSearch: true,
    graph: true,
    languages: ['en', 'ru', 'fr', 'es', 'ar', 'zh'],
    source: 'memgraph+qdrant',
  };
}

/**
 * Hybrid search: vectors find the passage, the graph supplies its neighbourhood.
 *
 * Falls back to graph-only text matching when the vector store or the embedder is
 * unreachable — degraded, and SAID to be degraded, because an assistant that quietly
 * loses half its recall looks exactly like one that had nothing to find.
 *
 * @param {string} query
 * @param {{lang?:string, limit?:number, scenarioId?:string, withNeighbours?:boolean}} [opts]
 */
async function search(query, opts = {}) {
  const lang = opts.lang || 'en';
  const limit = Math.min(Math.max(1, opts.limit || 5), 20);

  let hits = [];
  let degraded = null;
  try {
    hits = await vectorSearch(query, { lang, limit, scenarioId: opts.scenarioId });
  } catch (e) {
    degraded = e.message;
    hits = await textSearch(query, { lang, limit, scenarioId: opts.scenarioId });
  }

  if (opts.withNeighbours !== false && hits.length) {
    try { hits = await withNeighbours(hits); } catch { /* neighbours are a bonus, not the answer */ }
  }
  if (degraded) hits = hits.map((h) => ({ ...h, degraded }));
  return hits;
}

async function vectorSearch(query, { lang, limit, scenarioId }) {
  const vector = await deps().embed(query);
  const filter = { must: [{ key: 'lang', match: { value: lang } }] };
  if (scenarioId) filter.must.push({ key: 'scenarioId', match: { value: scenarioId } });

  const res = await deps().fetch(`${QDRANT_URL()}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vector, limit, filter, with_payload: true }),
  });
  if (!res.ok) throw new Error(`qdrant search failed: ${res.status}`);
  const j = await res.json();
  return ((j.result) || []).map((p) => ({
    id: String(p.id),
    text: p.payload.text,
    score: p.score,
    kind: p.payload.type,
    scenarioId: p.payload.scenarioId || undefined,
    stepId: p.payload.stepId || undefined,
    source: 'qdrant',
  }));
}

/** The floor: substring matching in the graph, used when vectors are unavailable. */
async function textSearch(query, { lang, limit, scenarioId }) {
  const rows = await deps().read(
    `MATCH (s:TourScenario)-[:CONTAINS]->(st:TourStep)
     ${scenarioId ? 'WHERE s.id = $scenarioId' : ''}
     RETURN s.id AS scenarioId, st.id AS stepId, st.content AS content
     LIMIT 500`,
    scenarioId ? { scenarioId } : {},
  );
  const words = String(query).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
  const out = [];
  for (const r of rows) {
    const content = parse(r.get('content'), {});
    const text = pickLang(content.text, lang);
    if (!text) continue;
    const t = text.toLowerCase();
    const score = words.length ? words.filter((w) => t.includes(w)).length / words.length : 0;
    if (score > 0) {
      out.push({
        id: `${r.get('scenarioId')}:${r.get('stepId')}`, text, score, kind: 'step',
        scenarioId: r.get('scenarioId'), stepId: r.get('stepId'), source: 'graph',
      });
    }
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** What sits next to a hit — the step before and after, and the anchor it targets. */
async function withNeighbours(hits) {
  const stepIds = hits.map((h) => h.stepId).filter(Boolean);
  if (!stepIds.length) return hits;
  const rows = await deps().read(
    `MATCH (st:TourStep) WHERE st.id IN $ids
     OPTIONAL MATCH (st)-[:NEXT]->(nx:TourStep)
     OPTIONAL MATCH (prev:TourStep)-[:NEXT]->(st)
     OPTIONAL MATCH (st)-[:TARGETS]->(a:TourAnchor)
     RETURN st.id AS id, collect(DISTINCT nx.id) AS next, collect(DISTINCT prev.id) AS prev,
            a.label AS anchorLabel`,
    { ids: stepIds },
  );
  const by = new Map(rows.map((r) => [r.get('id'), {
    next: (r.get('next') || []).filter(Boolean),
    prev: (r.get('prev') || []).filter(Boolean),
    anchorLabel: r.get('anchorLabel') || null,
  }]));
  return hits.map((h) => (h.stepId && by.has(h.stepId) ? { ...h, neighbours: by.get(h.stepId) } : h));
}

const pickLang = (field, lang) => {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object') return field[lang] || field.en || Object.values(field)[0] || '';
  return '';
};

// ── write side: authoring ─────────────────────────────────────────────────────

/**
 * Upsert a whole scenario — steps, order, successors, anchors — and index it.
 *
 * Idempotent by id: re-running replaces the scenario's steps rather than accumulating
 * them, because the alternative is a tour that grows a duplicate every time someone
 * edits it.
 */
async function upsertScenario(scenario) {
  const { write } = deps();
  const steps = scenario.steps || [];

  await write(
    `MERGE (s:TourScenario {id:$id})
     SET s.name=$name, s.description=$description, s.section=$section,
         s.entry=$entry, s.languages=$languages, s.updatedAt=$now`,
    {
      id: scenario.id,
      name: JSON.stringify(scenario.name || scenario.id),
      description: JSON.stringify(scenario.description || ''),
      section: scenario.section || null,
      entry: scenario.entry || (steps[0] && steps[0].id) || null,
      languages: scenario.languages || ['en'],
      now: new Date().toISOString(),
    },
  );

  // Detach the old steps first: an edit that removed a step must remove it here too.
  await write(
    `MATCH (s:TourScenario {id:$id})-[:CONTAINS]->(st:TourStep) DETACH DELETE st`,
    { id: scenario.id },
  );

  for (let i = 0; i < steps.length; i += 1) {
    const st = steps[i];
    await write(
      // `placement` is SET rather than written into the CREATE map: Memgraph rejects a
      // null literal inside a property map, and an absent placement is the normal case.
      `MATCH (s:TourScenario {id:$sid})
       CREATE (st:TourStep {id:$id, content:$content, optional:$optional})
       SET st.placement = $placement, st.navigate = $navigate
       MERGE (s)-[c:CONTAINS]->(st) SET c.order=$order`,
      {
        sid: scenario.id, id: st.id, content: JSON.stringify(st.content || {}),
        optional: st.optional === true, placement: st.placement || null, order: i,
        // Host Adapter Protocol intent, stored as JSON: it is the step's own
        // statement of where it lives, and the host decides how to get there.
        navigate: st.navigate ? JSON.stringify(st.navigate) : null,
      },
    );
    if (st.anchorId) {
      await write(
        `MERGE (a:TourAnchor {id:$aid})
         ON CREATE SET a.label=$label, a.route=$route, a.section=$section
         WITH a MATCH (st:TourStep {id:$sid}) MERGE (st)-[:TARGETS]->(a)`,
        {
          aid: st.anchorId, sid: st.id,
          label: (st.meta && st.meta.anchorLabel) || st.anchorId,
          route: (st.meta && st.meta.route) || null,
          section: scenario.section || null,
        },
      );
    }
  }

  for (const st of steps) {
    const targets = typeof st.next === 'string' ? [st.next]
      : (Array.isArray(st.next) ? st.next.map((b) => b && b.to).filter(Boolean) : []);
    for (const to of targets) {
      await write(
        'MATCH (a:TourStep {id:$from}), (b:TourStep {id:$to}) MERGE (a)-[:NEXT]->(b)',
        { from: st.id, to },
      );
    }
  }

  // THE TOUR-GRAPH CHANGE TRIGGER.
  //
  // Editing a step changes what is spoken, and the recording of the old wording is
  // now wrong. Cache keys are content hashes, so the stale audio is already
  // unreachable — but the new wording has no recording yet, and the first visitor
  // would pay 0.5–2.1s of silence for every step. So the graph write and the audio
  // warm-up are one operation.
  //
  // Best-effort and non-blocking-ish: a speech outage must not make a scenario
  // unsaveable. The result is reported rather than thrown.
  let speech = null;
  try {
    const tts = require('./tour-speech.service');
    await tts.invalidate();
    speech = await tts.warmScenario(scenario);
  } catch (e) {
    speech = { error: e.message };
  }

  return { id: scenario.id, steps: steps.length, speech };
}

/** Ensure the vector collection exists. Safe to call repeatedly. */
async function ensureCollection() {
  const url = `${QDRANT_URL()}/collections/${COLLECTION}`;
  const head = await deps().fetch(url);
  if (head.ok) return { created: false };
  const res = await deps().fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vectors: { size: VECTOR_SIZE, distance: 'Cosine' } }),
  });
  if (!res.ok) throw new Error(`could not create ${COLLECTION}: ${res.status}`);
  return { created: true };
}

/**
 * Index a scenario's steps (and any standalone explanations) for search.
 * One point per (item, language): the assistant searches in the user's language, and
 * mixing languages in one vector makes every query slightly wrong in all of them.
 */
async function indexScenario(scenario, extraDocs = []) {
  await ensureCollection();
  const points = [];
  let n = 0;

  const push = async (payload, text) => {
    if (!text) return;
    const vector = await deps().embed(text);
    points.push({
      id: hashId(`${payload.type}:${payload.stepId || payload.docId}:${payload.lang}`),
      vector,
      // TOUR-001 — every point is stamped with the namespace and the section it
      // belongs to. Without them a search cannot tell tour guidance from any other
      // knowledge in the same store, and the assistant would answer a question about
      // a button with a paragraph about a service.
      payload: { namespace: 'ALTIORA', section: 'Tour', ...payload, text },
    });
    n += 1;
  };

  for (const st of scenario.steps || []) {
    const content = st.content || {};
    const langs = new Set([...Object.keys(content.text || {}), ...Object.keys(content.title || {})]);
    if (!langs.size) langs.add('en');
    for (const lang of langs) {
      const title = pickLang(content.title, lang);
      const text = pickLang(content.text, lang);
      // eslint-disable-next-line no-await-in-loop
      await push({ type: 'step', scenarioId: scenario.id, stepId: st.id, lang }, [title, text].filter(Boolean).join(' — '));
    }
  }
  for (const d of extraDocs) {
    const langs = Object.keys(d.text || { en: '' });
    for (const lang of langs) {
      // eslint-disable-next-line no-await-in-loop
      await push({ type: 'doc', scenarioId: d.scenarioId || scenario.id, docId: d.id, lang }, pickLang(d.text, lang));
    }
  }

  if (points.length) {
    const res = await deps().fetch(`${QDRANT_URL()}/collections/${COLLECTION}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    });
    if (!res.ok) throw new Error(`qdrant upsert failed: ${res.status} ${await res.text()}`);
  }
  return { indexed: n };
}

/** Stable numeric id from a string — Qdrant wants a uint or a uuid. */
function hashId(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; }
  return Math.abs(h);
}

/**
 * Anchors a scenario needs that no live registration has claimed.
 *
 * The drift check: authored steps point at anchor ids, the host declares anchor ids,
 * and nothing keeps the two in step except looking. Run with the ids the host reports.
 */
async function anchorDrift(registeredIds = []) {
  const rows = await deps().read(
    `MATCH (s:TourScenario)-[:CONTAINS]->(st:TourStep)-[:TARGETS]->(a:TourAnchor)
     RETURN DISTINCT a.id AS anchorId, collect(DISTINCT s.id) AS scenarios`, {},
  );
  const declared = new Set(registeredIds);
  const missing = rows
    .map((r) => ({ anchorId: r.get('anchorId'), scenarios: r.get('scenarios') }))
    .filter((x) => !declared.has(x.anchorId));
  return { needed: rows.length, missing };
}

module.exports = {
  // provider contract
  listScenarios, getScenario, search, capabilities,
  // authoring
  upsertScenario, indexScenario, ensureCollection, anchorDrift,
  // internals worth testing
  COLLECTION, _setDeps, pickLang,
};
