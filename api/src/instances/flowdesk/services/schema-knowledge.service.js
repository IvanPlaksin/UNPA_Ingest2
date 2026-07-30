'use strict';

/**
 * SchemaKnowledge service (IP-KB) — the seam that turns a materialized
 * SchemaSnapshot into a searchable KNOWLEDGE entry linking a vector to the schema
 * graph, exactly the way the project knowledge base does it (shared id between the
 * Qdrant point and the Memgraph node).
 *
 * WHY this exists, and how it differs from P7 schema-enrichment:
 *   - P7 (schema-enrichment) is a MANUAL, LLM-authored companion point keyed by the
 *     payload string `service_code`, aggregated MAX-score at search time. It is a
 *     recall booster, not a graph-linked knowledge item.
 *   - This module runs AUTOMATICALLY at the end of materialization and mirrors the
 *     knowledge-base contract: one deterministic `kbId` is BOTH the Qdrant point id
 *     AND the `(:ServiceKnowledge {kbId})` node key, and that node is graph-linked
 *     `-[:DESCRIBES]->(:ServiceDef)`. Intent resolution can then run a true hybrid
 *     retrieval: vector hit → kbId → graph → ServiceDef (see hybridSearchServices).
 *
 * The description text is DETERMINISTIC (built from the snapshot slots) so indexing
 * never depends on an LLM or an API key — it works on every materialization. When a
 * P7 ai_description exists for the same serviceId it is merged in as a richer lead,
 * so the two layers compose instead of competing.
 *
 * Storage (chosen design — reuse the existing collection with a shared-id link):
 *   - Qdrant `flowdesk_services` point: id=kbId, payload.source='schema_kb',
 *     payload.kb_id=kbId, payload.service_code=serviceId, payload.namespace='Altiora'.
 *     A distinct UUIDv5 namespace keeps it from colliding with the P7 point.
 *   - Memgraph `(:ServiceKnowledge {kbId, serviceId, text, namespace:'Altiora'})`
 *     `-[:DESCRIBES]->(:ServiceDef {serviceId})`. A separate label survives
 *     seedService's purge-by-serviceId; the edge is re-MERGEd every materialization
 *     (the ServiceDef is fresh after storeSchema, so the hook runs AFTER it).
 *
 * SAFETY: every graph write/delete is scoped to `namespace:'Altiora'`. Deletion is
 * per-service only (no mass wipe here); a bulk purge lives in the registry and is
 * guarded there.
 *
 * @module instances/flowdesk/services/schema-knowledge.service
 */

const crypto = require('crypto');

const COLLECTION = process.env.FLOWDESK_SERVICE_COLLECTION || 'flowdesk_services';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const NAMESPACE = 'Altiora';
const SOURCE = 'schema_kb';
const SLOT_SOURCE = 'slot_kb';

// Deterministic UUIDv5-ish namespace, distinct from P7's AI_DESC_NS so a service's
// schema_kb point id never collides with its ai_description point id.
const KB_NS = 'schemakb0-0000-4000-8000-flowdeskkb000'.replace(/[^0-9a-f]/g, '0');

// ── low-level helpers ─────────────────────────────────────────────────────────

function w() { return require('../schema-graph/driver').write; }
function r() { return require('../schema-graph/driver').read; }

async function qdrant(method, path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method, headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Qdrant ${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

/** `EO-FIN-GM-GA-ACA` → `EO-FIN` (domain), used for filtering/reporting. */
function domainOf(serviceCode) {
  return String(serviceCode || '').split('-').filter(Boolean).slice(0, 2).join('-') || null;
}

/** Deterministic UUID for a service's schema_kb point / ServiceKnowledge node. */
function kbPointId(serviceCode) {
  const h = crypto.createHash('sha1').update(`${KB_NS}:${serviceCode}:schema_kb`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Deterministic UUID for a slot_kb point / SlotKnowledge node (distinct id space). */
function slotKbPointId(serviceCode, slotId) {
  const h = crypto.createHash('sha1').update(`${KB_NS}:${serviceCode}:slot:${slotId}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ── description ───────────────────────────────────────────────────────────────

/**
 * Build the deterministic knowledge text for a snapshot. Optionally merges a P7
 * ai_description (`enrichment`) as a richer lead + keyword amplifier.
 * @param {object} snapshot  SchemaSnapshot
 * @param {{enrichment?: {text?:string, keywords?:string[]}}} [opts]
 * @returns {string}
 */
function buildSchemaDescription(snapshot, opts = {}) {
  const meta = (snapshot && snapshot.metadata) || {};
  const serviceId = (snapshot && snapshot.serviceId) || '';
  const title = meta.title || serviceId;
  const enrichment = opts.enrichment || null;

  const parts = [];
  // A P7 AI description carries the strongest semantic signal — lead with it.
  if (enrichment && enrichment.text && String(enrichment.text).trim()) {
    parts.push(String(enrichment.text).trim());
  }
  parts.push(`Service request: ${title}.`);

  const slots = ((snapshot && snapshot.slots) || []).filter((s) => s && (s.promptHint || s.helpText));
  const fieldLine = (s) => {
    const label = String(s.promptHint || s.slotId).trim();
    const help = s.helpText ? ` — ${String(s.helpText).trim()}` : '';
    const opts2 = Array.isArray(s.presentOptions) && s.presentOptions.length
      ? ` (options: ${s.presentOptions.slice(0, 12).map((o) => o.label).filter(Boolean).join(', ')})`
      : '';
    return `${label}${help}${opts2}`;
  };

  // Group the field lines by the form section (Altiora sectionId) so related
  // questions read together — this is the author's semantic grouping and gives the
  // intent embedding cleaner structure. Slots keep snapshot order within a section;
  // section order follows first appearance. Ungrouped slots fall under a generic bucket.
  if (slots.some((s) => s.section)) {
    const order = [];
    const groups = new Map();
    for (const s of slots) {
      const key = s.section || '';
      if (!groups.has(key)) { groups.set(key, { label: s.sectionLabel || null, lines: [] }); order.push(key); }
      groups.get(key).lines.push(fieldLine(s));
    }
    for (const key of order) {
      const g = groups.get(key);
      const heading = g.label ? `${g.label}: ` : 'Also: ';
      parts.push(`${heading}${g.lines.join('; ')}.`);
    }
  } else if (slots.length) {
    parts.push(`This request collects: ${slots.map(fieldLine).join('; ')}.`);
  }

  // P7 keywords / synonyms amplify recall for free-text and voice input.
  if (enrichment && Array.isArray(enrichment.keywords) && enrichment.keywords.length) {
    parts.push(enrichment.keywords.filter(Boolean).join(', '));
  }
  return parts.join('\n').trim();
}

/**
 * Deterministic per-SLOT knowledge text: what this field is, in which service and
 * section, its guidance and options. Grounds slot resolution from free text
 * ("change the duty station" → which slot).
 */
function buildSlotDescription(snapshot, slot) {
  const meta = (snapshot && snapshot.metadata) || {};
  const title = meta.title || (snapshot && snapshot.serviceId) || '';
  const label = String((slot && (slot.promptHint || slot.slotId)) || '').trim();
  const parts = [`Field: ${label}.`, `Service request: ${title}.`];
  if (slot.sectionLabel) parts.push(`Section: ${String(slot.sectionLabel).trim()}.`);
  if (slot.helpText) parts.push(String(slot.helpText).trim());
  if (Array.isArray(slot.presentOptions) && slot.presentOptions.length) {
    parts.push(`Options: ${slot.presentOptions.slice(0, 20).map((o) => o.label).filter(Boolean).join(', ')}.`);
  }
  return parts.join(' ').trim();
}

// ── index / remove / read ─────────────────────────────────────────────────────

function defaultEmbed(text) {
  const { embedViaTei } = require('../../../services/ai/llm-provider/embedding');
  return embedViaTei(text);
}

/**
 * Index a materialized snapshot into the schema knowledge base: vectorize its
 * description and link the vector to the schema graph by a shared kbId.
 * Idempotent (deterministic kbId → upsert overwrites in place).
 *
 * @param {object} snapshot  a stored SchemaSnapshot (metadata + slots)
 * @param {object} [deps]  {embed, qdrant, write, read, namespace} test seams
 * @returns {Promise<{serviceId,kbId,chars}|{skipped:true}>}
 */
async function indexSchemaKnowledge(snapshot, deps = {}) {
  const serviceId = snapshot && snapshot.serviceId;
  if (!serviceId) throw Object.assign(new Error('snapshot.serviceId is required'), { status: 400 });
  const namespace = deps.namespace || NAMESPACE;
  const embed = deps.embed || defaultEmbed;
  const write = deps.write || w();
  const qd = deps.qdrant || qdrant;
  const getEnrichment = deps.getEnrichment
    || ((sid) => require('./schema-enrichment.service').getStored(sid));

  // Merge an existing P7 ai_description if one is stored (best-effort).
  let enrichment = null;
  try { enrichment = await getEnrichment(serviceId); }
  catch { enrichment = null; }

  const text = buildSchemaDescription(snapshot, { enrichment });
  if (!text || text.trim().length < 10) return { skipped: true };

  const vector = await embed(text);
  const kbId = kbPointId(serviceId);
  const meta = snapshot.metadata || {};
  const payload = {
    text,
    lang: 'en',
    service_code: serviceId,             // aggregation key used by semantic-search
    service_name: meta.title || serviceId,
    domain_code: domainOf(serviceId),
    service_guid: meta.serviceGuid || null,
    source: SOURCE,                      // provenance ⇒ purge-safe / identifiable
    kb_id: kbId,                         // shared-id link back to the graph node
    namespace,
  };

  await qd('PUT', `/collections/${COLLECTION}/points?wait=true`, { points: [{ id: kbId, vector, payload }] });

  // Graph node + linkage. Shared kbId ties the vector point to this node; the edge
  // to ServiceDef is re-MERGEd here because storeSchema (seedService) recreated the
  // ServiceDef just before this hook runs.
  await write(
    `MERGE (k:ServiceKnowledge {kbId:$kbId})
     SET k.serviceId=$sid, k.text=$text, k.source=$src, k.namespace=$ns, k.updatedAt=$ts
     WITH k
     OPTIONAL MATCH (s:ServiceDef {serviceId:$sid})
     FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END | MERGE (k)-[:DESCRIBES]->(s))`,
    { kbId, sid: serviceId, text, src: SOURCE, ns: namespace, ts: new Date().toISOString() },
  );

  // Also index per-slot knowledge for slot resolution from free text. Best-effort:
  // a slot-index failure must not fail the service-level index.
  let slotCount = 0;
  try { const sr = await indexSlotKnowledge(snapshot, deps); slotCount = sr.slots; }
  catch (err) { console.warn('[schema-knowledge] slot index failed:', err.message); }

  return { serviceId, kbId, chars: text.length, slots: slotCount };
}

/**
 * Index each slot of a snapshot as its own vector point linked to its SlotDef node
 * (shared slotKbId), for resolving which slot a free-text edit refers to. Rebuilds
 * the service's slot points from scratch (delete-by-service then upsert) so removed
 * or renamed slots never linger. Scoped to the 'Altiora' namespace + slot_kb source.
 *
 * @param {object} snapshot  a stored SchemaSnapshot (metadata + slots)
 * @param {object} [deps]  {embed, qdrant, write, namespace} test seams
 * @returns {Promise<{serviceId, slots:number}>}
 */
async function indexSlotKnowledge(snapshot, deps = {}) {
  const serviceId = snapshot && snapshot.serviceId;
  if (!serviceId) throw Object.assign(new Error('snapshot.serviceId is required'), { status: 400 });
  const namespace = deps.namespace || NAMESPACE;
  const embed = deps.embed || defaultEmbed;
  const write = deps.write || w();
  const qd = deps.qdrant || qdrant;
  const slots = ((snapshot && snapshot.slots) || []).filter((s) => s && s.slotId);

  // Clean slate for this service's slot points/nodes (removed/renamed slots).
  try {
    await qd('POST', `/collections/${COLLECTION}/points/delete?wait=true`, {
      filter: { must: [{ key: 'source', match: { value: SLOT_SOURCE } }, { key: 'service_code', match: { value: serviceId } }] },
    });
  } catch (err) { void err; }
  await write('MATCH (k:SlotKnowledge {serviceId:$sid, namespace:$ns}) DETACH DELETE k', { sid: serviceId, ns: namespace });

  const points = [];
  const nodeRows = [];
  for (const slot of slots) {
    const text = buildSlotDescription(snapshot, slot);
    if (!text || text.length < 6) continue;
    const vector = await embed(text);
    const kbId = slotKbPointId(serviceId, slot.slotId);
    points.push({ id: kbId, vector, payload: {
      text, lang: 'en', service_code: serviceId, slot_id: slot.slotId,
      section: slot.section || null, source: SLOT_SOURCE, kb_id: kbId, namespace,
    } });
    nodeRows.push({ kbId, slotId: slot.slotId, text });
  }
  if (points.length) await qd('PUT', `/collections/${COLLECTION}/points?wait=true`, { points });
  if (nodeRows.length) {
    await write(
      `UNWIND $rows AS row
       MERGE (k:SlotKnowledge {kbId:row.kbId})
       SET k.serviceId=$sid, k.slotId=row.slotId, k.text=row.text, k.source=$src, k.namespace=$ns, k.updatedAt=$ts
       WITH k, row
       OPTIONAL MATCH (sl:SlotDef {serviceId:$sid, slotId:row.slotId})
       FOREACH (_ IN CASE WHEN sl IS NULL THEN [] ELSE [1] END | MERGE (k)-[:DESCRIBES]->(sl))`,
      { rows: nodeRows, sid: serviceId, src: SLOT_SOURCE, ns: namespace, ts: new Date().toISOString() },
    );
  }
  return { serviceId, slots: nodeRows.length };
}

/**
 * Remove one service's schema knowledge (single-service; not a mass wipe).
 * Graph delete is scoped to namespace for safety.
 * @returns {Promise<{serviceId,kbId}>}
 */
async function removeSchemaKnowledge(serviceId, deps = {}) {
  const namespace = deps.namespace || NAMESPACE;
  const write = deps.write || w();
  const qd = deps.qdrant || qdrant;
  const kbId = kbPointId(serviceId);
  try { await qd('POST', `/collections/${COLLECTION}/points/delete?wait=true`, { points: [kbId] }); }
  catch (err) { /* best-effort: a missing point is not an error */ void err; }
  // Slot points for this service (source:'slot_kb').
  try {
    await qd('POST', `/collections/${COLLECTION}/points/delete?wait=true`, {
      filter: { must: [{ key: 'source', match: { value: SLOT_SOURCE } }, { key: 'service_code', match: { value: serviceId } }] },
    });
  } catch (err) { void err; }
  await write('MATCH (k:ServiceKnowledge {kbId:$kbId, namespace:$ns}) DETACH DELETE k', { kbId, ns: namespace });
  await write('MATCH (k:SlotKnowledge {serviceId:$sid, namespace:$ns}) DETACH DELETE k', { sid: serviceId, ns: namespace });
  return { serviceId, kbId };
}

/**
 * Resolve which slot a free-text phrase refers to, within one service. Embeds the
 * phrase, searches this service's slot_kb points, joins each hit to its SlotDef for
 * authoritative metadata, and returns candidates best-first. Used by the edit flow
 * to target "change the duty station" → the dutyStation slot. Returns [] when the
 * service has no indexed slots.
 *
 * @param {string} serviceId
 * @param {string} text  the user's free-text reference to a field
 * @param {object} [opts] {embed, qdrant, read, top, limit, scoreThreshold}
 * @returns {Promise<Array<{slotId, promptHint, type, section, score}>>}
 */
async function resolveSlotFromText(serviceId, text, opts = {}) {
  if (!serviceId || !text || !String(text).trim()) return [];
  const embed = opts.embed || defaultEmbed;
  const qd = opts.qdrant || qdrant;
  const read = opts.read || r();
  const top = opts.top || 3;

  const vector = await embed(String(text));
  const search = await qd('POST', `/collections/${COLLECTION}/points/search`, {
    vector, limit: opts.limit || 8, with_payload: true,
    score_threshold: opts.scoreThreshold != null ? opts.scoreThreshold : 0.3,
    filter: { must: [{ key: 'source', match: { value: SLOT_SOURCE } }, { key: 'service_code', match: { value: serviceId } }] },
  });
  const hits = (search && search.result) || [];
  if (!hits.length) return [];

  const byKb = new Map();
  for (const h of hits) {
    const id = (h.payload && h.payload.kb_id) || h.id;
    if (!id) continue;
    if (!byKb.has(id) || h.score > byKb.get(id).score) byKb.set(id, { score: h.score });
  }
  const kbIds = [...byKb.keys()];
  const rows = await read(
    `MATCH (k:SlotKnowledge)-[:DESCRIBES]->(sl:SlotDef)
     WHERE k.kbId IN $kbIds
     RETURN k.kbId AS kbId, sl.slotId AS slotId, sl.promptHint AS promptHint, sl.type AS type, sl.section AS section`,
    { kbIds },
  );
  return rows.map((row) => {
    const v = byKb.get(row.get('kbId'));
    const slotId = row.get('slotId');
    return {
      slotId,
      promptHint: row.get('promptHint') || slotId,
      type: row.get('type'),
      section: row.get('section') || null,
      score: v ? v.score : 0,
    };
  }).sort((a, b) => b.score - a.score).slice(0, top);
}

/** Read the stored knowledge node for a service (or null). */
async function getSchemaKnowledge(serviceId, deps = {}) {
  const read = deps.read || r();
  const rows = await read(
    'MATCH (k:ServiceKnowledge {kbId:$kbId}) RETURN k LIMIT 1', { kbId: kbPointId(serviceId) });
  if (!rows.length) return null;
  const p = rows[0].get('k').properties;
  return { serviceId: p.serviceId, kbId: p.kbId, text: p.text || null, source: p.source, namespace: p.namespace, updatedAt: p.updatedAt };
}

// ── hybrid retrieval (vector → graph) ─────────────────────────────────────────

/**
 * Hybrid service search: embed the query, retrieve schema_kb vector hits, then join
 * each hit to the schema graph via the shared kbId and hydrate ServiceDef signals.
 * This is the "graph + vector via linkage" retrieval the knowledge base uses.
 *
 * Returns [] when nothing is indexed yet, so the caller can fall back to the pure
 * vector path with no regression.
 *
 * @param {string} query
 * @param {object} [opts] {embed, qdrant, read, limit, top, scoreThreshold}
 * @returns {Promise<Array<{serviceId,title,domain,approvalRequired,slotCount,score,source:'hybrid'}>>}
 */
async function hybridSearchServices(query, opts = {}) {
  if (!query || !String(query).trim()) return [];
  const embed = opts.embed || defaultEmbed;
  const qd = opts.qdrant || qdrant;
  const read = opts.read || r();
  const limit = opts.limit || 10;
  const top = opts.top || 4;

  const vector = await embed(query);
  const search = await qd('POST', `/collections/${COLLECTION}/points/search`, {
    vector, limit, with_payload: true,
    score_threshold: opts.scoreThreshold != null ? opts.scoreThreshold : 0.3,
    filter: { must: [{ key: 'source', match: { value: SOURCE } }] },
  });
  const hits = (search && search.result) || [];
  if (!hits.length) return [];

  // Best vector score per kbId.
  const byKb = new Map();
  for (const h of hits) {
    const kbId = (h.payload && h.payload.kb_id) || h.id;
    if (!kbId) continue;
    if (!byKb.has(kbId) || h.score > byKb.get(kbId).score) byKb.set(kbId, { score: h.score });
  }
  const kbIds = [...byKb.keys()];
  if (!kbIds.length) return [];

  // Graph join: kbId → ServiceKnowledge → ServiceDef (+ slot signals).
  const rows = await read(
    `MATCH (k:ServiceKnowledge)-[:DESCRIBES]->(s:ServiceDef)
     WHERE k.kbId IN $kbIds
     OPTIONAL MATCH (s)-[:HAS_SLOT]->(sl:SlotDef)
     RETURN k.kbId AS kbId, s.serviceId AS serviceId, s.title AS title,
            s.approvalRequired AS approvalRequired, count(sl) AS slotCount`,
    { kbIds },
  );

  const out = rows.map((row) => {
    const kbId = row.get('kbId');
    const serviceId = row.get('serviceId');
    const v = byKb.get(kbId);
    return {
      serviceId,
      title: row.get('title') || serviceId,
      domain: domainOf(serviceId),
      approvalRequired: row.get('approvalRequired') === true,
      slotCount: Number(row.get('slotCount')) || 0,
      score: v ? v.score : 0,
      source: 'hybrid',
    };
  }).sort((a, b) => b.score - a.score);

  return out.slice(0, top);
}

module.exports = {
  buildSchemaDescription,
  buildSlotDescription,
  indexSchemaKnowledge,
  indexSlotKnowledge,
  removeSchemaKnowledge,
  getSchemaKnowledge,
  hybridSearchServices,
  resolveSlotFromText,
  kbPointId,
  slotKbPointId,
  domainOf,
  NAMESPACE,
  SOURCE,
  SLOT_SOURCE,
  COLLECTION,
};
