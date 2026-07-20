/**
 * I-2b — utterance generation for casual-paraphrase recall.
 *
 * The formal catalog prose ("Record Marriage / Civil Union") embeds poorly against
 * how staff actually type ("I just got married"), so casual intents land in a
 * near-tie cluster and fall below the confidence gate → deflection. This script
 * augments each real Altiora service with a handful of diverse, first-person
 * utterance vectors (same service_code/guid, source:'altiora'), sharpening the
 * per-service semantic footprint without touching the formal point.
 *
 * Idempotent: point id = a deterministic UUID from `${code}:utterance:${index}`,
 * so re-runs overwrite in place. classifyUserIntent aggregates by service_code
 * (max score wins), so extra vectors only help.
 *
 * Usage:
 *   node -r dotenv/config scripts/generate-altiora-utterances.js --dry-run   # sample 3, no write
 *   node -r dotenv/config scripts/generate-altiora-utterances.js             # full run
 *   node -r dotenv/config scripts/generate-altiora-utterances.js --only EO-HR-SP-PD-RMCU
 */

const crypto = require('crypto');

const COLLECTION = process.env.FLOWDESK_SERVICE_COLLECTION || 'flowdesk_services';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const N = Number(process.env.I2B_UTTERANCES || 6);
// Dry-run samples this confusable cluster so the marriage/divorce/dependency split is visible.
const SAMPLE = ['EO-HR-SP-PD-RMCU', 'EO-HR-SP-PD-RD', 'EO-HR-SP-HD-RDS'];

/**
 * Confusable clusters (Personal/Household Data) whose formal names — and generic
 * "update my marital status / my record" phrasings — collide in embedding space.
 * For a service in a cluster we pass the SIBLINGS as negative examples so the LLM
 * makes the distinguishing event explicit in every utterance (Architect refinement).
 */
const CLUSTERS = [
  ['EO-HR-SP-PD-RMCU', 'EO-HR-SP-PD-RD', 'EO-HR-SP-PD-RLS', 'EO-HR-SP-HD-RDS', 'EO-HR-SP-HD-RDC', 'EO-HR-SP-PD-CN'],
];
function siblingsOf(code, byCode) {
  const cluster = CLUSTERS.find((c) => c.includes(code));
  if (!cluster) return [];
  return cluster.filter((c) => c !== code).map((c) => byCode[c]).filter(Boolean).map((s) => s.service_name);
}

async function qdrant(method, path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Qdrant ${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

/** Deterministic UUID (v4-shaped) from a stable key → idempotent Qdrant point ids. */
function keyToUuid(key) {
  const h = crypto.createHash('md5').update(key).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Pull the real (formal) altiora catalog points — everything that is NOT itself an utterance. */
async function loadServices(only) {
  const filter = { must: [{ key: 'source', match: { value: 'altiora' } }], must_not: [{ key: 'type', match: { value: 'utterance' } }] };
  if (only) filter.must.push({ key: 'service_code', match: { value: only } });
  const res = await qdrant('POST', `/collections/${COLLECTION}/points/scroll`, { limit: 300, with_payload: true, filter });
  return (res.result?.points || []).map((p) => p.payload);
}

const UTTERANCE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['utterances'],
  properties: { utterances: { type: 'array', items: { type: 'string' }, minItems: N, maxItems: N } },
};

function buildPrompt(svc, siblings = []) {
  const negative = siblings.length
    ? `\nCRITICAL — this service is easily confused with: ${siblings.join('; ')}.\n` +
      `Make the distinguishing event EXPLICIT in EVERY utterance (name the specific event/action). ` +
      `Do NOT use generic phrasings like "update my marital status", "update my record", or "change my personal details" ` +
      `that would fit those sibling services equally well.\n`
    : '';
  return `Generate ${N} short utterances a UN staff member might type in a chat when they need this HR/Finance service.\n\n` +
    `Service: ${svc.service_name}\n` +
    `Description: ${svc.text || svc.service_name}\n` +
    negative +
    `\nRequirements:\n` +
    `- Casual, first-person, the way real users type — NOT the formal service name.\n` +
    `- Vary the ANGLE across the ${N}: an action request, a question, a situation/trigger event, an informal one-liner, a problem statement.\n` +
    `- 5-15 words each, different sentence structures.\n` +
    `- English only, no service codes, no explanations.`;
}

async function generate(llm, svc, siblings = []) {
  const { data } = await llm.structuredOutput(buildPrompt(svc, siblings), UTTERANCE_SCHEMA, { temperature: 0.3 });
  const list = (data && Array.isArray(data.utterances) ? data.utterances : [])
    .map((u) => String(u || '').trim()).filter(Boolean);
  return list.slice(0, N);
}

/** Utterance point: the formal point's routing fields + the utterance text, tagged type:'utterance'. */
function mapPoint(svc, utterance, index, vector) {
  return {
    id: keyToUuid(`${svc.service_code}:utterance:${index}`),
    vector,
    payload: {
      text: utterance,
      lang: 'en',
      service_code: svc.service_code,
      service_name: svc.service_name,
      domain_code: svc.domain_code,
      category: svc.category,
      service_guid: svc.service_guid,
      approval_required: !!svc.approval_required,
      sla_hours: svc.sla_hours ?? null,
      hierarchy_path: svc.hierarchy_path || null,
      source: 'altiora',
      type: 'utterance',
      utterance_index: index,
      generated_from: 'displayName+description',
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

  const { getLLMProvider } = require('../src/services/ai/llm-provider');
  const llm = getLLMProvider({ provider: process.env.FLOWDESK_LLM_PROVIDER || 'claude-code', model: process.env.FLOWDESK_LLM_MODEL || 'claude-sonnet-4-6' });
  const { embedViaTei } = require('../src/services/ai/llm-provider/embedding');

  // Load ALL services first for the sibling-name lookup, then filter what to generate.
  const all = await loadServices(null);
  const byCode = Object.fromEntries(all.map((s) => [s.service_code, s]));
  let services = only ? all.filter((s) => s.service_code === only) : all;
  if (dryRun && !only) services = services.filter((s) => SAMPLE.includes(s.service_code));
  console.log(`I-2b utterance generation — ${services.length} service(s)${dryRun ? '  [DRY-RUN: generate + print, no embed/upsert]' : ''}\n`);

  let upserted = 0; const errors = [];
  for (const svc of services) {
    try {
      // Sibling negative-prompting is OPT-IN (--distinct): for the tight marital
      // micro-cluster it over-corrected (everything collapsed to one sibling), since
      // the embedding model itself conflates marriage/divorce/separation. Plain
      // generation is better-balanced; true disambiguation belongs in the UI
      // (controls[] over the near-tie alternatives), not in more utterances.
      const siblings = args.includes('--distinct') ? siblingsOf(svc.service_code, byCode) : [];
      const utterances = await generate(llm, svc, siblings);
      if (utterances.length < N) console.log(`  ⚠ ${svc.service_code}: only ${utterances.length}/${N} generated`);
      console.log(`\n${svc.service_code} — ${svc.service_name}`);
      utterances.forEach((u, i) => console.log(`   ${i + 1}. ${u}`));
      if (dryRun) continue;
      const points = [];
      for (let i = 0; i < utterances.length; i++) {
        const vec = await embedViaTei(utterances[i]);
        points.push(mapPoint(svc, utterances[i], i, vec));
      }
      if (points.length) { await qdrant('PUT', `/collections/${COLLECTION}/points?wait=true`, { points }); upserted += points.length; }
    } catch (err) {
      errors.push({ code: svc.service_code, error: err.message });
      console.log(`  ! ${svc.service_code} ERROR: ${err.message.slice(0, 80)}`);
    }
  }

  console.log(`\n${dryRun ? 'DRY-RUN complete' : `upserted ${upserted} utterance points`} · errors ${errors.length}`);
  errors.forEach((e) => console.log(`  ${e.code}: ${e.error}`));
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((e) => { console.error('I-2b FAILED:', e.message); process.exit(1); });
}

module.exports = { keyToUuid, buildPrompt, mapPoint };
