'use strict';

/**
 * HYB-007 — a scenario that walks a form to the end.
 *
 * Every enabled arena scenario is about RESOLVING AN INTENT: the goal is reached
 * once the right service is identified, which happens on turn two or three. That is
 * a fair test of routing and a blind spot for everything after it — the repair
 * ladder, cascades, and the whole of form filling. Measured consequence: in a
 * three-pair A/B/C run, 15 of the hybrid's 26 turns were free text and only 2 were
 * the template turns that mode exists for.
 *
 * So this seeds the missing case: one persona who behaves like a real user in front
 * of a form (clicks what is offered, answers what is asked, does not wander) and one
 * scenario whose goal is a COMPLETED request on a long form — Extension of
 * Appointment & Assignment, 29 fields.
 *
 * Why the persona matters as much as the scenario: the simulator decides whether to
 * answer or to argue, and an impatient or withholding persona never reaches field
 * twenty. This one is deliberately the easy case, because the thing under test is
 * the interpreter's cost per turn, not the user's stamina.
 *
 *   node api/scripts/seed-full-form-scenario.js
 *
 * Idempotent: re-running updates the pair rather than adding a second copy.
 *
 * @module scripts/seed-full-form-scenario
 */

require('dotenv').config();

const gym = require('../src/services/dialogue-gym/dialogue-gym.service');

const PERSONA = {
  name: 'Form Completer (EO Admin)',
  description: 'An administrator who came to file one specific request and will see it through. Accepts the identity the assistant proposes — the arena\'s acting user is a REAL directory record while this persona\'s name is a fixture, so a persona that insists on its own name can never satisfy a people picker (it deadlocked twice before this instruction existed).',
  domainKnowledge: 'expert',
  patience: 10,
  verbosity: 'terse',
  cooperativeness: 'cooperative',
  language: 'en',
  persona: [
    'You are an Executive Office administrator raising an extension of appointment for yourself.',
    'You have every detail to hand and you want the request FILED, not discussed.',
    '',
    'How you behave, in order of importance:',
    '1. When the assistant offers a control, USE IT. Pick the option, confirm the default, give the date.',
    '2. Answer the question that was asked, in as few words as possible. No preamble, no thanks, no meta-commentary.',
    '3. For a field you have no real value for, give a plausible short one rather than asking what it means.',
    '4. Dates: answer in ISO form (2026-09-01). Numbers: answer with digits only.',
    '5. Optional fields you do not care about: say "skip".',
    '6. Do NOT change your mind, raise a second request, or ask policy questions — that is not what you came for.',
    '7. IDENTITY: when the assistant proposes who the request is for, or which duty station, ACCEPT what it proposes.',
    '   Say "yes, that is me" or "yes, correct" and move on. Never insist on a different name, ID or office, and never',
    '   ask to see a directory list — you are the signed-in user, and the assistant already knows who that is.',
    '8. Emit goal_achieved only when the assistant states the request has been created or hands you the completed form.',
  ].join('\n'),
};

const SCENARIO = {
  name: 'Complete an extension request end to end',
  description: 'Walks the 29-field Extension of Appointment form to the end. The point is the COST PER TURN of each interpreter over a long fill, not intent resolution — that is already covered by the other scenarios.',
  userGoal: 'File a complete extension of my fixed-term appointment for another year.',
  initialMessage: 'I need to extend my staff appointment for another year.',
  expectedServiceCode: 'EO-HR-SA-EXT',
  expectedRoute: 'SLOT_FILL',
  // The terminal that matters here is a finished request, not a matched service —
  // the runner must be told so, or `stopOnServiceMatch` ends the dialogue on turn 2
  // and the form is never touched (which is exactly how the arena went blind).
  successCriteria: {
    terminal: 'request_created_or_handed_off',
    note: 'Run with stopOnServiceMatch:false (--walk-form). Matching the service is a waypoint here, not the goal.',
  },
  maxTurns: 35,
  category: 'typical',
  domain: 'EO-HR',
  difficulty: 'medium',
  tags: ['full-form', 'hyb-007', 'cost-per-turn'],
  source: 'manual',
  sourceRef: 'HYB-007',
};

/** Find an existing seed by name so re-running updates instead of duplicating. */
async function upsert(kind, wanted) {
  const list = kind === 'persona'
    ? (await gym.listPersonas({ limit: 200 })).items
    : (await gym.listScenarios({ limit: 200 })).items;
  const found = (list || []).find((x) => x.name === wanted.name);
  if (found) {
    const id = kind === 'persona' ? found.personaId : found.scenarioId;
    const updated = kind === 'persona'
      ? await gym.updatePersona(id, wanted)
      : await gym.updateScenario(id, wanted);
    return { id, updated: true, item: updated };
  }
  const created = kind === 'persona'
    ? await gym.createPersona(wanted, { createdBy: 'hyb-007' })
    : await gym.createScenario(wanted, { createdBy: 'hyb-007' });
  return { id: kind === 'persona' ? created.personaId : created.scenarioId, updated: false, item: created };
}

(async () => {
  const p = await upsert('persona', PERSONA);
  const s = await upsert('scenario', SCENARIO);

  console.log(`persona  ${p.updated ? 'updated' : 'created'}: ${p.id}  ${PERSONA.name}`);
  console.log(`scenario ${s.updated ? 'updated' : 'created'}: ${s.id}  ${SCENARIO.name}`);
  console.log('');
  console.log('Run it (walk-form is REQUIRED — without it the dialogue ends before the form):');
  console.log(`  node api/scripts/run-exp002-comparison.js --modes=agent,hybrid --pairs=1 --max-turns=35 --walk-form \\`);
  console.log(`    --persona=${p.id} --scenario=${s.id}`);
  process.exit(0);
})().catch((e) => {
  console.error('[hyb-007] FAILED:', e.message);
  process.exit(1);
});
