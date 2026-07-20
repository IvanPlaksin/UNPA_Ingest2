/**
 * F13 — register a FlowDesk service in the RESOLVE catalog (Qdrant
 * `flowdesk_services`). Each service is anchored by several example utterances
 * (varied phrasings) so `classifyUserIntent` can map a user's request to its
 * service_code. Run after seeding the service's schema-graph.
 *
 * This file registers the F13 catalog additions. Add a service by appending a
 * block to SERVICES and re-running (fixed point ids → idempotent upsert).
 *
 * Run: node api/scripts/register-flowdesk-service-utterances.js
 */

const TEI_URL = process.env.TEI_URL || 'http://localhost:8081';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.FLOWDESK_SERVICE_COLLECTION || 'flowdesk_services';
const BATCH = Number(process.env.TEI_BATCH_SIZE) || 4;
const ID_BASE = 990000; // high range to avoid colliding with the existing catalog

const SERVICES = [
  {
    service_code: 'IT-VPN', service_name: 'VPN Access Request', domain_code: 'IT', category: 'Network Access',
    utterances: [
      'I need VPN access to work remotely',
      'How do I get set up with the VPN?',
      'Request remote access VPN for a colleague',
      'I need to connect to the UN network from home',
      'Set up VPN for a new team member',
      'I need full tunnel VPN access for a few weeks',
    ],
  },
  {
    service_code: 'IT-SW', service_name: 'Software Request', domain_code: 'IT', category: 'Software',
    utterances: [
      'I need to install some software',
      'Request a software license for my computer',
      'Can I get Adobe Photoshop installed?',
      'I need a development tool for my work',
      'Please provision an application for a colleague',
      'How do I request enterprise software?',
    ],
  },
  {
    service_code: 'FAC-ROOM', service_name: 'Conference Room Booking', domain_code: 'FAC', category: 'Facilities',
    utterances: [
      'I need to book a conference room',
      'Reserve a meeting room for tomorrow',
      'Book the auditorium for an event',
      'I need a room with video conferencing',
      'Schedule a meeting space for my team',
      'How do I reserve a conference room?',
    ],
  },
  {
    service_code: 'FAC-PARK', service_name: 'Parking Pass Request', domain_code: 'FAC', category: 'Facilities',
    utterances: [
      'I need a parking pass',
      'Request parking for my car',
      'How do I get a monthly parking permit?',
      'I need parking access at the compound',
      'Set up a parking pass for a visitor',
      'Request an annual parking permit',
    ],
  },
];

async function tei(inputs) {
  const resp = await fetch(`${TEI_URL}/embed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inputs }) });
  if (!resp.ok) throw new Error(`TEI ${resp.status}: ${await resp.text()}`);
  return resp.json();
}
async function qdrant(method, path, body) {
  const resp = await fetch(`${QDRANT_URL}${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Qdrant ${method} ${path} → ${resp.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function run() {
  const flat = [];
  SERVICES.forEach((s, si) => s.utterances.forEach((text, ui) => flat.push({ ...s, text, _id: ID_BASE + si * 100 + ui })));
  console.log(`Registering ${flat.length} utterances across ${SERVICES.length} service(s) into ${COLLECTION}...\n`);

  const points = [];
  for (let i = 0; i < flat.length; i += BATCH) {
    const chunk = flat.slice(i, i + BATCH);
    const vectors = await tei(chunk.map((c) => c.text));
    chunk.forEach((c, j) => {
      points.push({ id: c._id, vector: vectors[j], payload: { text: c.text, lang: 'en', service_code: c.service_code, service_name: c.service_name, domain_code: c.domain_code, category: c.category } });
      console.log(`+ ${c.service_code}: "${c.text}"`);
    });
  }
  await qdrant('PUT', `/collections/${COLLECTION}/points?wait=true`, { points });
  console.log(`\nUpserted ${points.length} catalog utterances.`);
}

if (require.main === module) {
  run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { SERVICES };
