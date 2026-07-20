/**
 * I-8 — broader end-to-end verification of the Altiora integration across the real
 * EO-HR/EO-FIN catalog.
 *
 * Pass 1 (graph mode, primary):
 *   - BROAD SWEEP: for every requestable service, verify the pipeline
 *     resolve(intent) → getSchema → materialize → bake(LOV) succeeds without error
 *     (in-memory; no persistence, no submit).
 *   - DEEP E2E: for one service per complexity tier (SIMPLE / MEDIUM-conditional /
 *     MEDIUM-LOV), pre-materialize into the graph, drive the chat to completion, and
 *     create a REAL Altiora ticket.
 *
 * Writes api/docs/i8-report.json (machine) + api/docs/I8_E2E_SUMMARY.md (human).
 *
 * Usage:
 *   node -r dotenv/config scripts/i8-e2e.js            # Pass 1 (broad + deep)
 *   node -r dotenv/config scripts/i8-e2e.js --broad    # broad sweep only
 *   node -r dotenv/config scripts/i8-e2e.js --deep     # deep E2E only
 *   node -r dotenv/config scripts/i8-e2e.js --service EO-HR-PM-CMP --no-submit  # one service, no ticket
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const { createAltioraClient, createServiceTokenProvider } = require('../src/instances/flowdesk/services/altiora-client');
const { createAltioraSchemaClient } = require('../src/instances/flowdesk/services/altiora-schema-client');
const { materializeSchema } = require('../src/instances/flowdesk/services/altiora-schema-materializer');
const { bakeLov } = require('../src/instances/flowdesk/services/altiora-lov.service');
const semantic = require('../src/instances/flowdesk/services/semantic-search');
const { materializeOne, catalogEntries } = require('./materialize-altiora-service');
const { close } = require('../src/instances/flowdesk/schema-graph/driver');

const DIGEST_PATH = process.env.I8_DIGEST || 'd:/tmp/i8-candidates.json';
const REPORT_JSON = path.join(__dirname, '..', 'docs', 'i8-report.json');
const REPORT_MD = path.join(__dirname, '..', 'docs', 'I8_E2E_SUMMARY.md');
const CHAT = { host: 'localhost', port: Number(process.env.PORT || 3010), path: '/api/v1/flowdesk/chat' };
const UID = '11111111-1111-1111-1111-111111111111';

// One service per complexity tier (from the Architect's i8-candidates digest).
const TIERS = [
  { code: 'EO-FIN-GM-GA-ACA', tier: 'SIMPLE' },
  { code: 'EO-HR-TS-REC', tier: 'MEDIUM-conditional' },
  { code: 'EO-HR-PM-CMP', tier: 'MEDIUM-LOV' },
];

function loadDigest() {
  const raw = JSON.parse(fs.readFileSync(DIGEST_PATH, 'utf8'));
  return Object.values(raw).filter((x) => x && typeof x === 'object' && x.code);
}

// ── Pass 1: broad sweep (in-memory) ───────────────────────────────────────────
async function sweepOne(sc, entry) {
  const rec = { serviceCode: entry.code, name: entry.name, ous: entry.ous };
  // Resolve (soft — recorded, not a gate; recall tuning is I-2b's job).
  try {
    const r = await semantic.classifyUserIntent(entry.name);
    rec.resolvedTo = r.top_match ? r.top_match.service_code : null;
    rec.resolved = rec.resolvedTo === entry.code;
  } catch (err) { rec.resolved = false; rec.resolveError = err.message; }

  if (!entry.form) { rec.materialized = false; rec.note = 'no published form'; return rec; }

  try {
    const raw = await sc.getSchema(entry.ous);
    const schemaJson = raw && (raw.schemaJson || raw.SchemaJson || raw);
    const { snapshot, warnings } = materializeSchema({
      schemaJson, serviceCode: entry.code, ousId: entry.ous, title: entry.name, approvalRequired: !!entry.approval,
    });
    rec.materialized = true;
    rec.slots = snapshot.slots.length;
    rec.warnings = warnings;
    const { report } = await bakeLov(snapshot, { fetchLovValues: (req) => sc.getLovValues(req) });
    rec.baked = true;
    rec.lovBaked = report.baked;
    rec.lovUnresolved = report.empty + report.failed;
  } catch (err) {
    rec.materialized = false;
    rec.error = err.message;
  }
  return rec;
}

async function broadSweep(sc, digest) {
  const out = [];
  for (const entry of digest) {
    const rec = await sweepOne(sc, entry);
    out.push(rec);
    const flag = rec.error ? '!' : (rec.materialized ? '+' : '~');
    console.log(`${flag} ${rec.serviceCode.padEnd(22)} mat=${rec.materialized} slots=${rec.slots ?? '-'} lov=${rec.lovBaked ?? 0}${rec.lovUnresolved ? `/${rec.lovUnresolved}✗` : ''} resolved=${rec.resolved}${rec.error ? `  ERR ${rec.error.slice(0, 50)}` : ''}`);
  }
  return out;
}

// ── Pass 1: deep E2E (chat dialogue → real ticket) ────────────────────────────
function chat(body) {
  return new Promise((resolve, reject) => {
    const d = JSON.stringify(body);
    const req = http.request({ ...CHAT, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(d), 'X-FlowDesk-User-Id': UID } }, (x) => {
      let s = ''; x.on('data', (c) => s += c); x.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(new Error(s.slice(0, 200))); } });
    });
    req.on('error', reject); req.write(d); req.end();
  });
}

/** Answer whatever slot the turn is asking, using the emitted controls/choices when present. */
function answerFor(turn) {
  const slot = turn.askingSlot || '';
  // Prefer a control-driven answer (enum/choice → first option value).
  const choice = (turn.controls || []).find((c) => c.type === 'choice' && Array.isArray(c.options) && c.options.length);
  if (choice) return choice.options[0].value;
  if (Array.isArray(turn.choices) && turn.choices.length && turn.responseType !== 'confirm_or_choose') return turn.choices[0];
  if (/date/i.test(slot)) return '2026-08-01';
  if (/number|count|quantity|amount/i.test(slot)) return '1';
  if (/email/i.test(slot)) return 'i8test@un.org';
  return 'I-8 automated E2E value';
}

async function deepOne(entry, { submit = true } = {}) {
  const rec = { serviceCode: entry.code, tier: entry.tier, slots: entry.slots, enums: entry.enums, conds: entry.conds, lov: entry.lov };
  const sid = `i8-${entry.code}-${Date.now()}`;
  let sawChoiceControl = false;
  try {
    let turn = await chat({ sessionId: sid, userId: UID, message: `I need: ${entry.name}`, lang: 'en' });
    rec.resolvedTo = turn.state && turn.state.serviceId;
    for (let i = 0; i < 25; i++) {
      if (turn.isComplete) break;
      if (Array.isArray(turn.controls) && turn.controls.some((c) => c.type === 'choice')) sawChoiceControl = true;
      const isReview = /review|confirm|submit/i.test(turn.response || '') && !turn.askingSlot;
      const reply = isReview ? (submit ? 'yes' : '__STOP__') : answerFor(turn);
      if (reply === '__STOP__') { rec.status = 'DIALOGUE_OK_NO_SUBMIT'; rec.reachedReview = true; break; }
      turn = await chat({ sessionId: sid, userId: UID, message: reply, lang: 'en' });
    }
    rec.sawChoiceControl = sawChoiceControl;
    if (turn.isComplete) {
      rec.ticketNumber = turn.state && turn.state.srNumber;
      rec.status = rec.ticketNumber ? 'PASS' : 'COMPLETE_NO_TICKET';
    } else if (!rec.status) {
      rec.status = 'INCOMPLETE';
      rec.lastResponse = (turn.response || '').slice(0, 120);
    }
  } catch (err) {
    rec.status = 'ERROR';
    rec.error = err.message;
  }
  return rec;
}

async function deepE2E(sc, digest, { submit = true, only = null } = {}) {
  const tiers = only ? TIERS.filter((t) => t.code === only) : TIERS;
  const out = [];
  for (const t of tiers) {
    const entry = { ...digest.find((d) => d.code === t.code), tier: t.tier };
    // Pre-materialize into the graph (graph mode serves via compile). The catalog
    // entry (with the GUID detect needs) comes from the I-2 Qdrant sync.
    let premat = null;
    try {
      const [catEntry] = await catalogEntries([t.code]);
      if (catEntry) premat = await materializeOne(sc, catEntry);
    } catch (err) { premat = { error: err.message }; }
    const rec = await deepOne(entry, { submit });
    if (premat && premat.error) rec.prematerializeError = premat.error;
    out.push(rec);
    console.log(`  [${rec.tier}] ${rec.serviceCode.padEnd(22)} ${rec.status}${rec.ticketNumber ? ` ${rec.ticketNumber}` : ''}${rec.error ? `  ERR ${rec.error.slice(0, 60)}` : ''}`);
  }
  return out;
}

// ── report writers ────────────────────────────────────────────────────────────
function writeReport(report) {
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  const s = report.summary;
  const md = [
    '# I-8 — Broader E2E Verification',
    '',
    `**Run:** ${report.runDate} · **Mode:** ${report.mode}`,
    '',
    '## Summary',
    '',
    `| Metric | Value |`,
    `|---|---|`,
    `| Services in catalog | ${s.total} |`,
    `| Resolved to correct code | ${s.resolved}/${s.total} |`,
    `| Materialized + baked (has form) | ${s.materialized}/${s.withForm} |`,
    `| No published form | ${s.noForm} |`,
    `| Pipeline errors | ${s.errors} |`,
    `| Deep E2E tiers | ${s.deepE2E} |`,
    `| Real tickets created | ${s.ticketsCreated} |`,
    '',
    '## Deep E2E (per tier)',
    '',
    `| Service | Tier | Slots | Enums | Conds | LOV | choice-control | Ticket | Status |`,
    `|---|---|---|---|---|---|---|---|---|`,
    ...report.deepE2E.map((d) => `| ${d.serviceCode} | ${d.tier} | ${d.slots} | ${d.enums} | ${d.conds} | ${d.lov} | ${d.sawChoiceControl ? '✓' : '–'} | ${d.ticketNumber || '–'} | ${d.status} |`),
    '',
    '## Broad sweep — failures & warnings',
    '',
  ];
  const problems = report.broadSweep.filter((r) => r.error || !r.materialized || (r.warnings && r.warnings.length) || r.lovUnresolved);
  if (!problems.length) md.push('_None — all forms materialized + baked cleanly._');
  else {
    md.push('| Service | Materialized | Issue |', '|---|---|---|');
    for (const p of problems) {
      const issue = p.error ? `ERROR: ${p.error}` : (!p.materialized ? (p.note || 'not materialized') : (p.lovUnresolved ? `${p.lovUnresolved} LOV unresolved` : `${p.warnings.length} warning(s)`));
      md.push(`| ${p.serviceCode} | ${p.materialized} | ${issue} |`);
    }
  }
  md.push('', '## Resolution (recall) — misses', '');
  const misses = report.broadSweep.filter((r) => !r.resolved);
  if (!misses.length) md.push('_All display names resolved to their own service code._');
  else {
    md.push('_Casual-recall misses (candidate I-2b utterance generation); not a pipeline failure._', '', '| Service | Resolved to |', '|---|---|');
    for (const m of misses) md.push(`| ${m.serviceCode} | ${m.resolvedTo || '(none)'} |`);
  }
  md.push('');
  fs.writeFileSync(REPORT_MD, md.join('\n'));
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const only = args.includes('--service') ? args[args.indexOf('--service') + 1] : null;
  const noSubmit = args.includes('--no-submit');
  const broadOnly = args.includes('--broad');
  const deepOnly = args.includes('--deep') || !!only;

  const client = createAltioraClient({ tokenProvider: createServiceTokenProvider() });
  const sc = createAltioraSchemaClient({ client });
  await semantic.init().catch(() => {});
  const digest = loadDigest();

  const report = {
    runDate: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    mode: process.env.FLOWDESK_SCHEMA_PROVIDER === 'altiora' ? 'altiora' : 'graph',
    broadSweep: [],
    deepE2E: [],
  };

  if (!deepOnly) {
    console.log(`\n═══ BROAD SWEEP (${digest.length} services) ═══\n`);
    report.broadSweep = await broadSweep(sc, digest);
  }
  if (!broadOnly) {
    console.log(`\n═══ DEEP E2E ═══\n`);
    report.deepE2E = await deepE2E(sc, digest, { submit: !noSubmit, only });
  }

  const withForm = report.broadSweep.filter((r) => r.materialized !== false || !r.note).length;
  report.summary = {
    total: digest.length,
    withForm: report.broadSweep.filter((r) => !r.note).length,
    noForm: report.broadSweep.filter((r) => r.note === 'no published form').length,
    resolved: report.broadSweep.filter((r) => r.resolved).length,
    materialized: report.broadSweep.filter((r) => r.materialized).length,
    errors: report.broadSweep.filter((r) => r.error).length,
    deepE2E: report.deepE2E.length,
    ticketsCreated: report.deepE2E.filter((r) => r.ticketNumber).length,
  };

  writeReport(report);
  console.log(`\n═══ DONE ═══`);
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`\nreport: ${REPORT_JSON}\nsummary: ${REPORT_MD}`);
  await close().catch(() => {});
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(async (e) => { console.error('I-8 FAILED:', e.message); await close().catch(() => {}); process.exit(1); });
}

module.exports = { sweepOne, deepOne, answerFor };
