'use strict';

/**
 * Seed the Dialogue Gym PersonaLibrary + ScenarioBank (Phase 1, ШАГ 2).
 *
 * Creates 5 built-in personas and 10 built-in scenarios grounded in the real
 * FlowDesk context, plus SUITABLE_FOR assignments. Idempotent: entities carry
 * stable ids and re-running converges (MERGE upsert).
 *
 * Best-effort ground truth: for scenarios where a single service is expected,
 * the script tries to resolve the real Qdrant `service_code` from the initial
 * message via semantic-search.classifyUserIntent. If Qdrant/TEI are unavailable
 * it falls back to the hard-coded `expectedServiceCode` (or null) and logs it.
 *
 * Run:  node api/scripts/seed-dialogue-gym.js
 * Env:  SEED_RESOLVE_CODES=false   → skip Qdrant resolution entirely
 *
 * @module scripts/seed-dialogue-gym
 */

require('dotenv').config();
const gym = require('../src/services/dialogue-gym/dialogue-gym.service');

const RESOLVE = String(process.env.SEED_RESOLVE_CODES || 'true') !== 'false';

// ── PERSONAS (5) ────────────────────────────────────────────────────────────
const PERSONAS = [
  {
    personaId: 'dg-persona-field-officer-mali',
    name: 'Field Officer (Mali)',
    description: 'Mission field staff on a mobile phone with unstable connectivity; expects a Teams-like instant reply.',
    domainKnowledge: 'none',
    patience: 3,
    verbosity: 'terse',
    cooperativeness: 'neutral',
    language: 'fr',
    persona: [
      'You are a UN field officer posted to a mission in Mali, writing from a phone on a weak connection.',
      'You do NOT know the names of services or forms. You describe your need in a few short words.',
      'You answer only what is directly asked, in short sentences, sometimes in French.',
      'If the agent asks more than three questions without progress, you get impatient and consider giving up.',
    ].join(' '),
  },
  {
    personaId: 'dg-persona-new-hr-staff',
    name: 'New HR Staff',
    description: 'Recently onboarded staff member who does not know the service hierarchy; describes the problem in detail.',
    domainKnowledge: 'symptom_only',
    patience: 7,
    verbosity: 'verbose',
    cooperativeness: 'cooperative',
    language: 'en',
    persona: [
      'You are a newly hired staff member. You do not know UN service catalogues or form codes.',
      'You describe your situation in full paragraphs, giving lots of context, but you cannot name the right service.',
      'You are cooperative and answer every clarifying question thoroughly and honestly.',
    ].join(' '),
  },
  {
    personaId: 'dg-persona-experienced-eo-admin',
    name: 'Experienced EO Admin',
    description: 'Seasoned Executive Office administrator who speaks in form codes and service names.',
    domainKnowledge: 'expert',
    patience: 5,
    verbosity: 'normal',
    cooperativeness: 'cooperative',
    language: 'en',
    persona: [
      'You are an experienced Executive Office administrator. You know exact service names and form codes.',
      'You state precisely what you need using correct terminology and expect the agent to keep up.',
      'You are cooperative but dislike being asked for information you already gave.',
    ].join(' '),
  },
  {
    personaId: 'dg-persona-frustrated-requester',
    name: 'Frustrated Requester',
    description: 'Already tried to resolve the issue and is irritated; may change wording and misuse terms.',
    domainKnowledge: 'partial',
    patience: 2,
    verbosity: 'verbose',
    cooperativeness: 'adversarial',
    language: 'en',
    persona: [
      'You have already tried to solve this problem once and failed, so you are irritated.',
      'You have a partial idea of what you need but keep changing how you describe it and sometimes use the wrong term.',
      'You vent a little, you withhold details until pressed, and you lose patience quickly.',
    ].join(' '),
  },
  {
    personaId: 'dg-persona-multilingual-officer',
    name: 'Multilingual Officer',
    description: 'Gives information in fragments and mixes languages; reveals details only when asked directly.',
    domainKnowledge: 'partial',
    patience: 6,
    verbosity: 'normal',
    cooperativeness: 'withholding',
    language: 'es',
    persona: [
      'You are a UN officer who speaks several languages and sometimes mixes Spanish and English.',
      'You know roughly what you need but reveal details only when the agent asks for them specifically.',
      'You are neither hostile nor especially forthcoming — you answer the exact question, nothing more.',
    ].join(' '),
  },
];

// ── SCENARIOS (10) ──────────────────────────────────────────────────────────
// resolveHint = message used to look up the real service_code from Qdrant.
const SCENARIOS = [
  {
    scenarioId: 'dg-scn-travel-advance',
    name: 'Request travel advance',
    description: 'User needs a cash advance for an upcoming official mission.',
    userGoal: 'Obtain a travel advance for an upcoming mission trip.',
    initialMessage: 'I need money for my upcoming mission trip',
    category: 'typical', domain: 'EO-FIN', difficulty: 'easy',
    expectedServiceCode: null, resolveHint: 'travel advance for a mission trip',
    successCriteria: { serviceIdentified: true, domain: 'EO-FIN' },
    tags: ['travel', 'finance'],
  },
  {
    scenarioId: 'dg-scn-leave-balance',
    name: 'Check leave balance',
    description: 'User wants to know how many annual leave days remain.',
    userGoal: 'Find out the remaining annual leave balance.',
    initialMessage: 'How many vacation days do I have left?',
    category: 'typical', domain: 'EO-HR', difficulty: 'easy',
    expectedServiceCode: null, resolveHint: 'check my annual leave balance',
    expectedRoute: 'info_answer',
    successCriteria: { serviceIdentified: true, domain: 'EO-HR' },
    tags: ['leave', 'hr'],
  },
  {
    scenarioId: 'dg-scn-p11-renewal',
    name: 'P.11 form renewal',
    description: 'User needs to update/renew their P.11 personal history form.',
    userGoal: 'Update the P.11 personal history record.',
    initialMessage: 'My P.11 needs to be updated',
    category: 'typical', domain: 'EO-HR', difficulty: 'medium',
    expectedServiceCode: null, resolveHint: 'update my P.11 personal history form',
    successCriteria: { serviceIdentified: true, domain: 'EO-HR' },
    tags: ['forms', 'hr'],
  },
  {
    scenarioId: 'dg-scn-bank-details',
    name: 'Update bank details',
    description: 'User wants to change the bank account for salary payments.',
    userGoal: 'Change the bank account used for salary payment.',
    initialMessage: 'I need to change the bank account where my salary is paid',
    category: 'typical', domain: 'EO-FIN', difficulty: 'medium',
    expectedServiceCode: null, resolveHint: 'change bank account for salary payment',
    successCriteria: { serviceIdentified: true, domain: 'EO-FIN' },
    tags: ['finance', 'payroll'],
  },
  {
    scenarioId: 'dg-scn-dependency-allowance',
    name: 'Dependency allowance query',
    description: 'User is unsure whether they qualify for a dependency allowance.',
    userGoal: 'Determine eligibility and apply for a dependency allowance.',
    initialMessage: 'I just had a child, what allowances can I get?',
    category: 'typical', domain: 'EO-HR', difficulty: 'medium',
    expectedServiceCode: null, resolveHint: 'dependency allowance for a new child',
    successCriteria: { serviceIdentified: true, domain: 'EO-HR' },
    tags: ['allowance', 'hr'],
  },
  {
    scenarioId: 'dg-scn-mixed-request',
    name: 'Mixed request (two services)',
    description: 'User bundles two distinct requests into one message — the classic iNeed misclassification trap.',
    userGoal: 'Get help with BOTH a bank-detail change and a travel-claim question.',
    initialMessage: 'I need to update my bank details and also ask about my travel claim from last month',
    category: 'edge_case', domain: 'mixed', difficulty: 'hard',
    expectedServiceCode: null,
    successCriteria: { disambiguationOffered: true, bothIntentsAcknowledged: true },
    tags: ['mixed', 'disambiguation'],
  },
  {
    scenarioId: 'dg-scn-unknown-service',
    name: 'Unknown / out-of-scope service',
    description: 'User asks for something outside the EO-HR/EO-FIN catalogue.',
    userGoal: 'Get the broken coffee machine fixed (not a catalogued service).',
    initialMessage: 'I need help with the coffee machine in building F',
    category: 'red_team', domain: 'out_of_scope', difficulty: 'medium',
    expectedServiceCode: null,
    successCriteria: { gracefulDeflection: true, noHallucinatedService: true },
    tags: ['out_of_scope', 'deflection'],
  },
  {
    scenarioId: 'dg-scn-vague-complaint',
    name: 'Vague pay complaint',
    description: 'User only reports a symptom and cannot name the service.',
    userGoal: 'Resolve an unspecified problem with their pay.',
    initialMessage: 'Something is wrong with my pay',
    category: 'edge_case', domain: 'EO-FIN', difficulty: 'hard',
    expectedServiceCode: null, resolveHint: 'my salary payment is wrong',
    successCriteria: { needElicited: true, serviceIdentified: true },
    tags: ['finance', 'elicitation'],
  },
  {
    scenarioId: 'dg-scn-change-of-intent',
    name: 'Change of intent mid-dialogue',
    description: 'User starts one request then switches to another mid-conversation.',
    userGoal: 'Ultimately obtain a travel advance after first mentioning leave.',
    initialMessage: 'I want to check my leave... actually no, I need a travel advance',
    category: 'red_team', domain: 'mixed', difficulty: 'hard',
    expectedServiceCode: null, resolveHint: 'travel advance',
    successCriteria: { finalIntentHonoured: 'travel_advance', noStaleSlots: true },
    tags: ['intent_switch', 'finance'],
  },
  {
    scenarioId: 'dg-scn-education-grant',
    name: 'Education grant claim',
    description: 'User wants to claim the education grant for a dependent child.',
    userGoal: 'Submit an education grant claim for a child in school.',
    initialMessage: 'How do I claim the education grant for my daughter?',
    category: 'typical', domain: 'EO-HR', difficulty: 'medium',
    expectedServiceCode: null, resolveHint: 'education grant claim for a dependent child',
    successCriteria: { serviceIdentified: true, domain: 'EO-HR' },
    tags: ['grant', 'hr'],
  },
];

// ── SUITABLE_FOR assignments (personaId → [scenarioId], weight) ────────────────
const ASSIGNMENTS = [
  ['dg-persona-field-officer-mali', 'dg-scn-travel-advance', 1.5],
  ['dg-persona-field-officer-mali', 'dg-scn-unknown-service', 1.0],
  ['dg-persona-new-hr-staff', 'dg-scn-leave-balance', 1.5],
  ['dg-persona-new-hr-staff', 'dg-scn-vague-complaint', 1.5],
  ['dg-persona-new-hr-staff', 'dg-scn-dependency-allowance', 1.2],
  ['dg-persona-experienced-eo-admin', 'dg-scn-p11-renewal', 1.5],
  ['dg-persona-experienced-eo-admin', 'dg-scn-bank-details', 1.2],
  ['dg-persona-experienced-eo-admin', 'dg-scn-education-grant', 1.0],
  ['dg-persona-frustrated-requester', 'dg-scn-vague-complaint', 2.0],
  ['dg-persona-frustrated-requester', 'dg-scn-change-of-intent', 1.5],
  ['dg-persona-frustrated-requester', 'dg-scn-mixed-request', 1.2],
  ['dg-persona-multilingual-officer', 'dg-scn-mixed-request', 1.5],
  ['dg-persona-multilingual-officer', 'dg-scn-education-grant', 1.0],
  ['dg-persona-multilingual-officer', 'dg-scn-change-of-intent', 1.0],
];

async function resolveServiceCode(hint) {
  if (!RESOLVE || !hint) return null;
  try {
    const ss = require('../src/instances/flowdesk/services/semantic-search');
    if (ss.init) { try { await ss.init(); } catch { /* ignore */ } }
    const res = await ss.classifyUserIntent(hint, {});
    const code = res && res.top_match && (res.top_match.service_code || res.top_match.serviceId);
    if (code) return code;
  } catch (e) {
    // Qdrant/TEI unavailable — fall back silently, logged by caller.
  }
  return null;
}

async function main() {
  console.log('[seed-dialogue-gym] ensuring indexes…');
  await gym.ensureIndexes();

  console.log(`[seed-dialogue-gym] seeding ${PERSONAS.length} personas…`);
  for (const p of PERSONAS) {
    const existing = await gym.getPersona(p.personaId);
    if (existing) {
      await gym.updatePersona(p.personaId, { ...p, enabled: true });
    } else {
      await gym.createPersona(p, { createdBy: 'system', isBuiltin: true });
    }
    console.log(`  ✓ persona ${p.personaId} (${p.name})`);
  }

  console.log(`[seed-dialogue-gym] seeding ${SCENARIOS.length} scenarios…`);
  for (const raw of SCENARIOS) {
    const { resolveHint, ...s } = raw;
    const resolved = await resolveServiceCode(resolveHint);
    const expectedServiceCode = resolved || s.expectedServiceCode || null;
    const data = { ...s, expectedServiceCode, source: 'catalog_generated', sourceRef: resolveHint || null };
    const existing = await gym.getScenario(s.scenarioId);
    if (existing) {
      await gym.updateScenario(s.scenarioId, { ...data, enabled: true });
    } else {
      await gym.createScenario(data, { isBuiltin: true });
    }
    const codeNote = resolved ? `code=${resolved} (Qdrant)` : (s.expectedServiceCode ? `code=${s.expectedServiceCode} (fallback)` : 'code=null');
    console.log(`  ✓ scenario ${s.scenarioId} (${s.name}) — ${codeNote}`);
  }

  console.log(`[seed-dialogue-gym] linking ${ASSIGNMENTS.length} SUITABLE_FOR edges…`);
  for (const [personaId, scenarioId, weight] of ASSIGNMENTS) {
    try {
      await gym.assignPersonaToScenario(personaId, scenarioId, weight, 'seed');
      console.log(`  ✓ ${personaId} → ${scenarioId} (w=${weight})`);
    } catch (e) {
      console.warn(`  ✗ ${personaId} → ${scenarioId}: ${e.message}`);
    }
  }

  const personas = await gym.listPersonas();
  const scenarios = await gym.listScenarios();
  console.log(`\n[seed-dialogue-gym] done. personas=${personas.total} scenarios=${scenarios.total}`);
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('[seed-dialogue-gym] FAILED:', err); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
