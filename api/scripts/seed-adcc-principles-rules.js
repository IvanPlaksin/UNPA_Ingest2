/**
 * Seed the Altiora Dialogue Conduct Codex (ADCC v1.0) — F10a.
 *
 * 6 principles + 21 rules + 1 meta rule, all in domain='Altiora', scope
 * ['altiora','dialogue-conduct']. namespace stays 'Codex' (API-visibility
 * invariant); "namespace Altiora" is realised as domain='Altiora' (Variant B,
 * ratified). Rules DERIVE_FROM their principle.
 *
 * Run: node api/scripts/seed-adcc-principles-rules.js
 */

const codexService = require('../src/services/codex/codex.service');

const CTX = { isAdmin: true, createdBy: 'seed-adcc' };
const SCOPE = ['altiora', 'dialogue-conduct'];

const PRINCIPLES = [
  { code: 'ADCC-PRINCIPLE-A', name: 'Sequence Organization', description: 'A question opens a sequence that obligates interpretation of what follows. Understanding = locating an utterance relative to open sequences, never classifying it in isolation.' },
  { code: 'ADCC-PRINCIPLE-B', name: 'Repair Organization', description: 'Any understanding failure, regardless of cause, is handled by one universal machinery with fixed positions. This covers failures not yet discovered.' },
  { code: 'ADCC-PRINCIPLE-C', name: 'Grounding', description: 'Understanding is established by evidence, not presumed. Every contribution requires acknowledgment. Silent interpretation is prohibited.' },
  { code: 'ADCC-PRINCIPLE-D', name: 'Recipient Design & Minimization', description: 'Say the minimum that does the job; adapt to this listener; expand on request.' },
  { code: 'ADCC-PRINCIPLE-E', name: 'User Navigation Sovereignty', description: 'Whatever breaks, the user always has the exits. Universal actions are the safety net for undiscovered failures.' },
  { code: 'ADCC-PRINCIPLE-F', name: 'Determinism Boundary', description: 'The LLM keeps conversation fluent; it never decides business logic. Routing, repair ladder, thresholds, counters, and tool access are deterministic.' },
];

const RULES = [
  ['ADCC-080', 'ADCC-PRINCIPLE-A', 'Open Sequence as State', 'Every agent question opens a sequence; it remains open until answered, explicitly declined, or abandoned. Open sequences are first-class session state (DialogueStack in DraftSR).'],
  ['ADCC-081', 'ADCC-PRINCIPLE-A', 'Interpretation Priority Order', 'User utterance with open sequence MUST be interpreted in order: (1) structured choice, (2) universal action, (3) repair marker, (4) answer to pending slot, (5) insertion sequence, (6) new sequence proposal, (7) out of scope. Isolated intent classification is prohibited.'],
  ['ADCC-082', 'ADCC-PRINCIPLE-A', 'Slot-Type-Aware Acceptance', 'Answer acceptance depends on slot type: freetext accepts any non-meta utterance; enum requires option match; typed (date/user/location) requires successful extraction. Extraction failure triggers repair, never re-routing.'],
  ['ADCC-083', 'ADCC-PRINCIPLE-A', 'Insertion Sequences', 'Insertion sequences (user asks before answering) are answered via read-only means, then pending question re-issued in same turn (bridge). Insertions never close the open sequence.'],
  ['ADCC-084', 'ADCC-PRINCIPLE-A', 'No Silent Exit', 'Leaving an open sequence is never silent. High-confidence new intent mid-flow requires explicit user confirmation. Exit thresholds grow with draft completeness. Abandoned draft is parked, never destroyed.'],
  ['ADCC-085', 'ADCC-PRINCIPLE-B', 'Universal Repair Ladder', 'Repair ladder, cause-independent: (1) targeted re-ask, (2) reformulated question, (3) present options/examples, (4) offer skip or park, (5) human handoff. Every state has a defined next step; dead ends prohibited.'],
  ['ADCC-086', 'ADCC-PRINCIPLE-B', 'Repair Counters and Escalation', 'Repair attempts counted per-slot and per-session. Per-slot: 2nd failure -> reformulate; 3rd -> options or skip offer. Per-session threshold -> handoff offer with full transcript attached.'],
  ['ADCC-087', 'ADCC-PRINCIPLE-B', 'User Correction Priority', 'User-initiated repair outranks agent interpretation (preference for self-correction). Correction markers ("not X - Y", "actually...") update referenced slot with confirmation echo; stale cascade applies.'],
  ['ADCC-088', 'ADCC-PRINCIPLE-B', 'No User Blame', 'Repair formulations never blame the user: "I did not catch that" - never "invalid input". The agent owns the misunderstanding.'],
  ['ADCC-089', 'ADCC-PRINCIPLE-C', 'No Silent Interpretation', 'Silent interpretation is prohibited. Every value extracted from user text is echoed (preamble) in the same turn it is committed.'],
  ['ADCC-090', 'ADCC-PRINCIPLE-C', 'Low Confidence Confirmation', 'Low-confidence extractions are never committed silently - explicit confirmation precedes commit.'],
  ['ADCC-091', 'ADCC-PRINCIPLE-C', 'Explicit Sequence Closure', 'Every sequence is explicitly closed: answers acknowledged, completed flows sealed with a closer, final outcomes (SR number, park, cancel) stated verbatim.'],
  ['ADCC-092', 'ADCC-PRINCIPLE-C', 'Visible Shared State', 'The shared state is continuously visible: live draft (DraftPanel) is the grounding artifact; server state and displayed state must not diverge.'],
  ['ADCC-093', 'ADCC-PRINCIPLE-D', 'One Question Per Turn', 'Agent turns are minimal: one question per turn (one-at-a-time). Detail expansion available on request, never volunteered at full length.'],
  ['ADCC-094', 'ADCC-PRINCIPLE-D', 'Templated Structural Utterances', 'Structural utterances (confirmations, repair moves, closers) come from templates in user language (6 UN languages); LLM improvisation reserved for extraction and question phrasing only.'],
  ['ADCC-095', 'ADCC-PRINCIPLE-D', 'Slot Explanation on Request', 'Every question carries retrievable help: each slot exposes explanation ("why we ask") and available options on request. Explanation texts are schema data owned by service owner.'],
  ['ADCC-096', 'ADCC-PRINCIPLE-E', 'Six Universal Actions', 'Six universal actions available in ANY dialogue state, all 6 UN languages, detected deterministically: repeat / rephrase / skip / cancel / capabilities / start over.'],
  ['ADCC-097', 'ADCC-PRINCIPLE-E', 'Skip Handling', 'Skip on required slot -> explain why needed, then offer park or cancel. Re-asking same question verbatim in a loop is prohibited.'],
  ['ADCC-098', 'ADCC-PRINCIPLE-E', 'Cancel and Park', 'Cancel requires confirmation; cancelled or abandoned drafts are parked with resume offer. Park is default fate of unfinished work; deletion only on explicit user demand.'],
  ['ADCC-099', 'ADCC-PRINCIPLE-F', 'Deterministic Routing', 'Routing among sequences, repair ladder position, thresholds, counters, and tool access are deterministic. LLM operates only inside designated nodes (extraction, question phrasing, insertion answers) under whitelist.'],
  ['ADCC-100', 'ADCC-PRINCIPLE-F', 'Test Coverage and Non-Proliferation', 'Every conduct pattern is covered by a test; CALM pattern list is acceptance checklist. New failure case becomes new test of existing principle. Adding a new rule requires demonstrating no existing principle generates required behavior.'],
  ['ADCC-META-001', 'ADCC-PRINCIPLE-F', 'Altiora Namespace via Domain', 'The concept "namespace Altiora" is realised by domain=\'Altiora\' on Codex nodes; storage namespace remains \'Codex\' for API visibility. The Altiora agent reads rules via loadForAltiora() filtered by domain=\'Altiora\'.'],
];

async function seed() {
  console.log('Seeding ADCC principles + rules...\n');
  const pMap = {};
  for (const p of PRINCIPLES) {
    const node = await codexService.createNode('CodexPrinciple', {
      title: p.name, name: p.name, summary: p.description, description: p.description,
      code: p.code, domain: 'Altiora', scope: SCOPE, tags: ['altiora', 'adcc'], deonticState: 'ACTIVE',
    }, CTX);
    const id = node.codexId || node.properties?.codexId;
    pMap[p.code] = id;
    console.log(`+ principle ${id} (${p.code}): ${p.name}`);
  }

  let n = 0;
  for (const [code, principle, name, statement] of RULES) {
    const node = await codexService.createNode('CodexRule', {
      title: name, summary: statement, code, domain: 'Altiora', scope: SCOPE,
      ruleKind: 'PRESCRIPTIVE', modality: 'MUST', tags: ['altiora', 'dialogue-conduct', 'adcc'], deonticState: 'ACTIVE',
    }, CTX);
    const id = node.codexId || node.properties?.codexId;
    console.log(`+ rule ${id} (${code}): ${name}`);
    if (pMap[principle]) {
      try { await codexService.linkRuleToPrinciple(id, pMap[principle], 1.0); } catch (e) { console.warn(`  link warn: ${e.message}`); }
    }
    n++;
  }
  console.log(`\nSeeded ${PRINCIPLES.length} principles + ${n} rules (domain=Altiora).`);
}

if (require.main === module) {
  seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed, PRINCIPLES, RULES };
