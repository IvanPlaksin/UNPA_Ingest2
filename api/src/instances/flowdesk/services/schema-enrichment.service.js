'use strict';

/**
 * Schema-enrichment AI agent (ADMIN P7) — a Claude Haiku agent, triggered per
 * schema from the Schemas admin, that makes a service request easier for ANOTHER
 * AI (the chat's intent resolver) to find from free-text / voice input:
 *
 *   1. Generates an AI-readable SERVICE DESCRIPTION from the card context (service
 *      name, its catalog category / parent category, and the schema fields). The
 *      description is written for a model to read. It is:
 *        - embedded (TEI) and upserted as a companion point in the Qdrant
 *          `flowdesk_services` collection (source:'ai_description') — this is the
 *          lever the chat's RESOLVE node uses (aggregates by service_code, keeps
 *          MAX score), so it raises intent-resolution recall;
 *        - graph-linked to the schema as (:ServiceDescription)-[:DESCRIBES]->(:ServiceDef)
 *          keyed by serviceId (survives re-materialization — a separate node, not a
 *          ServiceDef property that seedService would purge);
 *        - surfaced on the schema card.
 *   2. Determines the MEANING of each field (from its label, name and the whole
 *      schema context) and stores a per-field description on the card, attached to
 *      the field.
 *
 * The agent is a structured LLM call (Haiku), mirroring session-analysis.service.
 *
 * @module instances/flowdesk/services/schema-enrichment.service
 */

const crypto = require('crypto');

const COLLECTION = process.env.FLOWDESK_SERVICE_COLLECTION || 'flowdesk_services';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
// Deterministic UUIDv5 namespace so a service's ai_description point id is stable
// (idempotent re-enrichment) and never collides with the catalog GUID point.
const AI_DESC_NS = '6f2a1c00-ai00-4e00-b000-flowdeskaidsc'.replace(/[^0-9a-f]/g, '0');

const ENRICH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['serviceDescription', 'fieldDescriptions'],
  properties: {
    serviceDescription: {
      type: 'string',
      description: 'A clear, self-contained description of what this service request is for — what problem it solves, when a user would need it, what it covers — written so ANOTHER AI model can match a free-text user request to this service. 2–5 sentences. No markdown headers.',
    },
    keywords: {
      type: 'array', items: { type: 'string' },
      description: 'Up to 12 natural phrases / synonyms a user might type or say when they need this service (for intent recall).',
    },
    fieldDescriptions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['slotId', 'description'],
        properties: {
          slotId: { type: 'string' },
          description: { type: 'string', description: 'What this field means and what the user should enter, in one clear sentence.' },
        },
      },
    },
  },
};

// ── deps (injectable for tests) ───────────────────────────────────────────────

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

/** Deterministic UUIDv5-like id for a service's ai_description companion point. */
function aiPointId(serviceCode) {
  const h = crypto.createHash('sha1').update(`${AI_DESC_NS}:${serviceCode}:ai_description`).digest('hex');
  // format as a UUID (Qdrant accepts UUID string ids)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

// ── context gathering ─────────────────────────────────────────────────────────

/** Pull the service's catalog context (name, category, parent, guid) from Qdrant. */
async function catalogContext(serviceCode) {
  try {
    const res = await qdrant('POST', `/collections/${COLLECTION}/points/scroll`, {
      limit: 1, with_payload: true,
      filter: { must: [{ key: 'source', match: { value: 'altiora' } }, { key: 'service_code', match: { value: serviceCode } }] },
    });
    return (res.result?.points || [])[0]?.payload || null;
  } catch { return null; }
}

async function gatherContext(ousId) {
  const registry = require('./altiora-schema-registry');
  const snapshot = await registry.getSchema(Number(ousId));
  if (!snapshot) throw Object.assign(new Error(`no cached schema for ousId ${ousId}`), { status: 404 });
  const cat = await catalogContext(snapshot.serviceId);
  return { snapshot, catalog: cat };
}

function buildPrompt({ snapshot, catalog }) {
  const meta = snapshot.metadata || {};
  const fields = snapshot.slots.map((s) => {
    const opts = s.type === 'enum' ? ` [options: ${(s.presentOptions || []).map((o) => o.label).join(' | ')}]` : '';
    return `- ${s.slotId} (type:${s.type}${s.required ? ', required' : ''}) label:"${s.promptHint || s.slotId}"${opts}`;
  }).join('\n');
  return `You enrich a UN HR/Finance service-desk catalog so an AI intake assistant can match free-text and voice user requests to the correct service.

## Service
- code: ${snapshot.serviceId}
- name: ${meta.title || catalog?.service_name || snapshot.serviceId}
- domain: ${catalog?.domain_code || '(unknown)'}
- catalog category / parent: ${catalog?.category || '(none)'}${catalog?.hierarchy_path ? ` (path: ${catalog.hierarchy_path})` : ''}
- approval required: ${!!meta.approvalRequired}

## Intake form fields
${fields || '(no fields)'}

## Tasks
1. serviceDescription: write a clear, self-contained description of what THIS service request is for — the real-world problem it addresses, when a UN staff member would need it, and what it covers. Write it so another AI model can confidently match a user's free-text/voice request to this service. Ground it in the service name, category and the fields above; do NOT invent capabilities the form does not support. 2–5 sentences, plain text.
2. keywords: natural phrases/synonyms a user might actually type or say for this need.
3. fieldDescriptions: for EACH field above, one clear sentence explaining what it means and what the user should enter (infer from the field label, name and the whole-form context).

Return strictly via the tool schema.`;
}

// ── the agent ─────────────────────────────────────────────────────────────────

function llm() {
  const { getLLMProvider } = require('../../../services/ai/llm-provider');
  return getLLMProvider({
    provider: process.env.FLOWDESK_ENRICH_PROVIDER || process.env.FLOWDESK_LLM_PROVIDER || 'anthropic-api',
    model: process.env.FLOWDESK_ENRICH_MODEL || 'claude-haiku-4-5-20251001', // Claude Haiku, as specified
  });
}

/** Generate (does NOT persist) the enrichment for a schema. */
async function generate(ousId, deps = {}) {
  const ctx = await gatherContext(ousId);
  const provider = deps.llm || llm();
  const { data } = await provider.structuredOutput(buildPrompt(ctx), ENRICH_SCHEMA);
  // Keep only field descriptions for slots that exist in the schema.
  const known = new Set(ctx.snapshot.slots.map((s) => s.slotId));
  const fieldDescriptions = (data.fieldDescriptions || []).filter((f) => known.has(f.slotId));
  return {
    ousId: Number(ousId),
    serviceId: ctx.snapshot.serviceId,
    serviceName: ctx.snapshot.metadata?.title || ctx.catalog?.service_name || ctx.snapshot.serviceId,
    serviceDescription: data.serviceDescription,
    keywords: data.keywords || [],
    fieldDescriptions,
    model: process.env.FLOWDESK_ENRICH_MODEL || 'claude-haiku-4-5-20251001',
  };
}

// ── persistence ───────────────────────────────────────────────────────────────

/** Embed + upsert the companion ai_description point into flowdesk_services. */
async function upsertVector({ serviceId, serviceName, serviceDescription, keywords, catalog }) {
  const { embedViaTei } = require('../../../services/ai/llm-provider/embedding');
  // Embed the description PLUS keywords — both feed intent recall.
  const text = [serviceDescription, ...(keywords || [])].filter(Boolean).join('. ');
  const vector = await embedViaTei(text);
  const domainOf = (code) => String(code || '').split('-').filter(Boolean).slice(0, 2).join('-') || null;
  const payload = {
    text,
    lang: 'en',
    service_code: serviceId,               // REQUIRED — aggregation key
    service_name: serviceName || serviceId,
    domain_code: catalog?.domain_code || domainOf(serviceId),
    category: catalog?.category || null,
    service_guid: catalog?.service_guid || null,
    source: 'ai_description',              // provenance ⇒ purge-safe / identifiable
  };
  await qdrant('PUT', `/collections/${COLLECTION}/points?wait=true`, {
    points: [{ id: aiPointId(serviceId), vector, payload }],
  });
  return { pointId: aiPointId(serviceId), embeddedChars: text.length };
}

/** Graph-link the description (+ field descriptions) to the ServiceDef. */
async function storeGraph({ serviceId, serviceDescription, keywords, fieldDescriptions, model }) {
  const fieldsJson = JSON.stringify((fieldDescriptions || []).reduce((a, f) => { a[f.slotId] = f.description; return a; }, {}));
  await w()(
    `MERGE (d:ServiceDescription {serviceId:$sid})
     SET d.text=$text, d.keywordsJson=$keywords, d.fieldsJson=$fields,
         d.source='ai', d.model=$model, d.updatedAt=$ts
     WITH d
     OPTIONAL MATCH (s:ServiceDef {serviceId:$sid})
     FOREACH (_ IN CASE WHEN s IS NULL THEN [] ELSE [1] END | MERGE (d)-[:DESCRIBES]->(s))`,
    { sid: serviceId, text: serviceDescription, keywords: JSON.stringify(keywords || []), fields: fieldsJson,
      model: model || null, ts: new Date().toISOString() });
}

/** Apply a (generated or edited) enrichment: vectorize + graph-link. */
async function apply(ousId, enrichment, deps = {}) {
  const ctx = deps.ctx || await gatherContext(ousId);
  const e = {
    serviceId: enrichment.serviceId || ctx.snapshot.serviceId,
    serviceName: enrichment.serviceName || ctx.snapshot.metadata?.title || ctx.snapshot.serviceId,
    serviceDescription: enrichment.serviceDescription,
    keywords: enrichment.keywords || [],
    fieldDescriptions: enrichment.fieldDescriptions || [],
    model: enrichment.model,
  };
  if (!e.serviceDescription || e.serviceDescription.trim().length < 20) {
    throw Object.assign(new Error('serviceDescription is empty'), { status: 400 });
  }
  const vector = await upsertVector({ ...e, catalog: ctx.catalog });
  await storeGraph(e);
  return { serviceId: e.serviceId, vector, fields: e.fieldDescriptions.length };
}

/** Generate AND apply in one call (the button's default action). */
async function enrich(ousId, deps = {}) {
  const ctx = await gatherContext(ousId);
  const generated = await generate(ousId, { ...deps, });
  const applied = await apply(ousId, generated, { ...deps, ctx });
  return { ...generated, applied };
}

/** Read the stored enrichment for a service (for the card). */
async function getStored(serviceId) {
  const rows = await r()('MATCH (d:ServiceDescription {serviceId:$sid}) RETURN d LIMIT 1', { sid: serviceId });
  if (!rows.length) return null;
  const p = rows[0].get('d').properties;
  const parse = (s, dflt) => { try { return JSON.parse(s); } catch { return dflt; } };
  return {
    serviceId,
    text: p.text || null,
    keywords: parse(p.keywords || p.keywordsJson, []),
    fields: parse(p.fieldsJson, {}),
    source: p.source, model: p.model, updatedAt: p.updatedAt,
  };
}

module.exports = { generate, apply, enrich, getStored, gatherContext, buildPrompt, aiPointId, ENRICH_SCHEMA };
