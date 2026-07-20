/**
 * F12 — seed the Altiora knowledge base for Tier-0 deflection.
 *
 * Creates the Qdrant `altiora_knowledge` collection (1024-dim, Cosine — matches
 * TEI) and upserts a set of self-service articles for the common Hardware / Badge
 * / Workspace questions. Each point is namespace='Altiora' so the FlowDesk chat's
 * ARTICLE backend (namespace-filtered, N1) can read them. INFO_QUESTION answers
 * then become substantive instead of "(no articles found)".
 *
 * Run: node api/scripts/seed-altiora-knowledge.js
 */

const TEI_URL = process.env.TEI_URL || 'http://localhost:8081';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.FLOWDESK_KB_COLLECTION || 'altiora_knowledge';
const NAMESPACE = process.env.FLOWDESK_KB_NAMESPACE || 'Altiora';
const BATCH = Number(process.env.TEI_BATCH_SIZE) || 4;

const ARTICLES = [
  { articleId: 'KB-HW-001', serviceId: 'IT-HW-LAP', tags: ['hardware', 'laptop'],
    title: 'What laptops and devices can I request?',
    answer: 'You can request a standard laptop (everyday office work), an engineering / high-spec laptop (development, CAD, data work), a desktop workstation, or an external monitor. Choose the device type when you raise a Hardware / Laptop Provisioning request.' },
  { articleId: 'KB-HW-002', serviceId: 'IT-HW-LAP', tags: ['hardware', 'onboarding'],
    title: 'How do I request a laptop for a new employee?',
    answer: 'Start a hardware request and set the beneficiary to the new employee (by name or email). The delivery location defaults to their duty station. Add the device type, a short justification, and the approver (their manager). I can walk you through it step by step.' },
  { articleId: 'KB-HW-003', serviceId: 'IT-HW-LAP', tags: ['hardware', 'sla'],
    title: 'How long does a hardware request take?',
    answer: 'Hardware / laptop provisioning has a target service level of 72 hours after approval. Times may vary by duty station and stock availability.' },
  { articleId: 'KB-HW-004', serviceId: 'IT-HW-LAP', tags: ['hardware', 'approval'],
    title: 'Who approves a hardware request?',
    answer: 'Hardware requests require approval. The approver defaults to the administrative manager of the beneficiary (or of the requester if you are filing for yourself). You can pick a different approver from the directory if needed.' },
  { articleId: 'KB-HW-005', serviceId: 'IT-HW-LAP', tags: ['hardware', 'broken', 'replacement'],
    title: 'What do I do if my laptop is broken or needs replacement?',
    answer: 'Raise a hardware request describing the fault in the justification. If the device is unusable, note that so it can be prioritised. Standard replacement follows the same 72-hour target after approval.' },
  { articleId: 'KB-HW-006', serviceId: 'IT-HW-LAP', tags: ['hardware', 'monitor', 'peripheral'],
    title: 'How do I request a monitor or peripheral?',
    answer: 'Choose "External monitor" as the device type in a hardware request. For keyboards, docks and other peripherals, describe them in the justification. Peripherals may not require manager approval depending on value.' },
  { articleId: 'KB-HW-007', serviceId: 'IT-HW-LAP', tags: ['hardware', 'requirements'],
    title: 'What information do I need to raise a hardware request?',
    answer: 'You will need: who the device is for (beneficiary), the delivery location, the device type, a short justification, and — for items needing sign-off — the approver. I collect these one question at a time.' },
  { articleId: 'KB-BADGE-001', serviceId: 'HR-BADGE', tags: ['badge', 'access'],
    title: 'How do I get a new access badge?',
    answer: 'Raise an Access Badge request. Provide the beneficiary, the badge type (permanent staff or temporary visitor), and the duty station. Visitor badges also need validity dates.' },
  { articleId: 'KB-BADGE-002', serviceId: 'HR-BADGE', tags: ['badge', 'types'],
    title: 'What types of access badges are there?',
    answer: 'There are permanent badges for staff and temporary visitor badges. Visitor badges are issued for a limited validity period and may need a sponsor.' },
  { articleId: 'KB-BADGE-003', serviceId: 'HR-BADGE', tags: ['badge', 'sla'],
    title: 'How long does badge processing take?',
    answer: 'Access badge requests are typically processed within one to two business days after approval. Collect the badge at the pass office of your duty station.' },
  { articleId: 'KB-WS-001', serviceId: 'FAC-WS', tags: ['workspace', 'desk'],
    title: 'How do I request a workspace or desk?',
    answer: 'Raise a Workspace request with the beneficiary, the duty station / building, and the type of space (permanent desk, hot desk, or meeting space). Add any special requirements in the notes.' },
  { articleId: 'KB-VPN-001', serviceId: 'IT-VPN', tags: ['vpn', 'remote', 'network'],
    title: 'How do I request VPN access?',
    answer: 'Raise a VPN Access request. Provide who it is for, the access type (full tunnel or split tunnel), the duration (30 days, 90 days, or permanent), and a short justification. VPN access requires manager approval.' },
  { articleId: 'KB-VPN-002', serviceId: 'IT-VPN', tags: ['vpn', 'full-tunnel', 'split-tunnel'],
    title: 'What is the difference between full tunnel and split tunnel VPN?',
    answer: 'Full tunnel routes all of your internet traffic through the UN network; split tunnel routes only UN resources and leaves the rest of your traffic direct. Choose split tunnel unless full tunnel is required by policy for your work.' },
  { articleId: 'KB-VPN-003', serviceId: 'IT-VPN', tags: ['vpn', 'duration'],
    title: 'How long does VPN access last?',
    answer: 'You can request VPN access for 30 days, 90 days, or permanently (staff). Temporary access can be renewed by raising a new request before it expires.' },
  { articleId: 'KB-SW-001', serviceId: 'IT-SW', tags: ['software', 'license'],
    title: 'How do I request software?',
    answer: 'Raise a Software Request. Tell me who it is for, the type of software (productivity, development, design, security, or other), the specific product name, and the license type (individual, team, or enterprise). Team and enterprise licenses need manager approval.' },
  { articleId: 'KB-SW-002', serviceId: 'IT-SW', tags: ['software', 'license-types'],
    title: 'What software license types are available?',
    answer: 'Software can be requested with an individual, team, or enterprise license. Individual licenses are for a single user; team and enterprise licenses cover multiple users and require approval and licensing review.' },
  { articleId: 'KB-ROOM-001', serviceId: 'FAC-ROOM', tags: ['room', 'booking', 'meeting'],
    title: 'How do I book a conference room?',
    answer: 'Raise a Conference Room Booking. Provide the organizer, the room (A for 10, B for 20, C for 50, or the auditorium), the date and start time, the duration, the number of attendees, and any AV equipment (projector, video conference, or full AV).' },
  { articleId: 'KB-PARK-001', serviceId: 'FAC-PARK', tags: ['parking', 'pass'],
    title: 'How do I get a parking pass?',
    answer: 'Raise a Parking Pass Request. Provide who it is for, the vehicle license plate, the pass type (daily, monthly, or annual), and the date from which it should be valid.' },
  { articleId: 'KB-GEN-001', serviceId: null, tags: ['general', 'behalf'],
    title: 'Can I request equipment or services for someone else?',
    answer: 'Yes. When you start a request, tell me who it is for — the beneficiary can be any colleague found in the directory. The request is filed under your name as the author, and the location defaults to the beneficiary’s duty station.' },
  { articleId: 'KB-GEN-002', serviceId: null, tags: ['general', 'status'],
    title: 'How do I check the status of my request?',
    answer: 'Every submitted request gets a reference number (for example SR-12345). Give me that number and I can look up its current status.' },
  { articleId: 'KB-GEN-003', serviceId: null, tags: ['general', 'cancel', 'modify'],
    title: 'How do I cancel or change a request I started?',
    answer: 'While we are still filling in a request you can say "cancel" at any time — I will confirm and save it as a draft you can resume later. To correct a value, just tell me the right one (for example, "not Geneva — Vienna").' },
  { articleId: 'KB-GEN-004', serviceId: null, tags: ['general', 'help', 'escalation'],
    title: 'How do I get help or reach a person?',
    answer: 'Ask me "what can you do" to see the services I can raise. If we get stuck, I can hand you over to a human service-desk agent and pass along everything collected so far.' },
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

async function ensureCollection(dims) {
  const exists = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (exists.ok) { console.log(`Collection ${COLLECTION} already exists.`); return; }
  await qdrant('PUT', `/collections/${COLLECTION}`, { vectors: { size: dims, distance: 'Cosine' } });
  console.log(`Created collection ${COLLECTION} (size ${dims}, Cosine).`);
}

async function seed() {
  console.log(`Seeding ${ARTICLES.length} articles into ${COLLECTION} (namespace=${NAMESPACE})...\n`);
  // dims probe
  const probe = await tei(['dimension probe']);
  const dims = probe[0].length;
  await ensureCollection(dims);

  const points = [];
  for (let i = 0; i < ARTICLES.length; i += BATCH) {
    const chunk = ARTICLES.slice(i, i + BATCH);
    const vectors = await tei(chunk.map((a) => `${a.title}\n${a.answer}`));
    chunk.forEach((a, j) => {
      points.push({
        id: i + j + 1,
        vector: vectors[j],
        payload: {
          namespace: NAMESPACE,
          articleId: a.articleId,
          title: a.title,
          answerSnippet: a.answer,
          summary: a.answer.length > 160 ? `${a.answer.slice(0, 157)}...` : a.answer,
          tags: a.tags,
          serviceId: a.serviceId || undefined,
          language: 'en',
          sourceCollection: COLLECTION,
        },
      });
      console.log(`+ ${a.articleId}: ${a.title}`);
    });
  }
  await qdrant('PUT', `/collections/${COLLECTION}/points?wait=true`, { points });
  const info = await qdrant('GET', `/collections/${COLLECTION}`);
  console.log(`\nUpserted ${points.length} points. Collection count: ${info.result?.points_count}.`);
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { ARTICLES, COLLECTION, NAMESPACE };
