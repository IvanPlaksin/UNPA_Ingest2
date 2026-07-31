'use strict';

/**
 * VOICE-001/003 — rules that hold only when the user is speaking.
 *
 * Written as conditions on the LIVE graph (`channel: voice`), not as a second graph.
 * Two graphs drift: CHAT_PROMPT and EVOLUTIO cost this project a week of tuning a
 * prompt nothing read. One graph, one version history, and the voice rules are
 * absent from a text turn because their condition says so.
 *
 * THE RESEARCH, AND WHAT WE TOOK FROM IT
 *
 * The literature agrees on three things that bear directly on our four questions:
 *
 *   · a spoken menu must be short and lead with the likeliest option, because the
 *     listener has no way to glance back and must hold every option in memory;
 *   · confirmation should be EXPLICIT where a mistake is expensive and IMPLICIT
 *     where it is not — constant explicit confirmation reads as an interrogation and
 *     users start agreeing without listening;
 *   · a relative date must be resolved and echoed back in absolute form, because
 *     "next Tuesday" is ambiguous to a person as well as to a parser.
 *
 * What the literature does NOT decide is where OUR line falls, and that is the part
 * these rules commit to: a submitted request, a date and a named person are worth an
 * explicit confirmation; a category chosen from four is not.
 *
 * MEASURED, NOT ASSUMED. Conditional text sits after the cached prefix and is
 * re-sent every turn, so voice rules cost money on every spoken turn. The script
 * prints that number. If the voice tail runs past about a third of the prefix, the
 * decision to keep one graph should be revisited with the figure in hand.
 *
 * Usage: node scripts/seed-voice-prompt-rules.js [--write]
 */

require('dotenv').config();

const CONTEXTS = require('../src/services/evolutio/evolutio-prompt.coverage').REACHABLE_CONTEXTS;
const { compile } = require('../src/services/evolutio/evolutio-prompt.compiler');
const { validateGraph } = require('../src/services/evolutio/evolutio-prompt.validator');

const origin = (rationale) => ({
  kind: 'human', rationale, introducedBy: 'voice-001', introducedAt: '2026-07-31T00:00:00.000Z',
});

/**
 * Six rules. Deliberately few: each one is conditional text paid for on every spoken
 * turn, and a voice prompt padded with good advice is a voice prompt that is slower
 * AND dearer than the text one.
 */
const VOICE_RULES = [
  {
    nodeId: 'voice-no-visual-reference',
    type: 'Thesis', title: 'Never point at the screen', status: 'ACTIVE',
    priority: 10, category: 'formatting',
    assertion: 'The user is listening, not looking. Never say "below", "on the right", "click", '
      + '"the list", "the form above" or "as shown" — describe what you need in words that work with '
      + 'the eyes closed.',
    origin: origin('A spoken turn that refers to the screen is an instruction the listener cannot follow, and it is the commonest way a text prompt fails aloud.'),
  },
  {
    nodeId: 'voice-short-turn',
    type: 'Thesis', title: 'One question, two sentences', status: 'ACTIVE',
    priority: 11, category: 'formatting',
    assertion: 'Keep a spoken turn to about two sentences and exactly one question. The listener '
      + 'cannot skim back, so everything you say has to be held in memory until they answer.',
    origin: origin('There is no scan-back in speech: a long turn is not slower to read, it is forgotten. Measured at roughly 17 characters per second of speech, a paragraph is half a minute of talking.'),
  },
  {
    nodeId: 'voice-offer-three-then-ask',
    type: 'Thesis', title: 'Never read a long list aloud', status: 'ACTIVE',
    priority: 12, category: 'dialogue',
    assertion: 'When there are more than three options, do not read them. Name the two or three '
      + 'most likely, say how many others there are, and ask a narrowing question — "is it about pay, '
      + 'leave, or something else?" Read the full list only if the user asks for it.',
    origin: origin('A spoken list of eight options is not a menu, it is a memory test: the listener holds the first two and the last one. Short lists led by the likeliest option are the settled practice, and the narrowing question is what replaces scanning.'),
  },
  {
    nodeId: 'voice-date-echo-absolute',
    type: 'Thesis', title: 'Say the date back in full', status: 'ACTIVE',
    priority: 13, category: 'dialogue',
    assertion: 'When a date is given in relative words — "next Tuesday", "the end of the month", '
      + '"in two weeks" — resolve it and say the absolute date back before accepting it: '
      + '"Tuesday the fourth of August, then?" Wait for agreement.',
    origin: origin('"Next Tuesday" is ambiguous to a person as well as to a parser — it can mean the coming Tuesday or the one after. A wrong date is discovered after the request has been submitted, and it costs a re-submission.'),
  },
  {
    nodeId: 'voice-directory-confirm-one',
    type: 'Thesis', title: 'Confirm one match, do not recite several', status: 'ACTIVE',
    priority: 14, category: 'dialogue',
    assertion: 'For a person or a place from the directory, offer the single best match by name and '
      + 'ask yes or no. If nothing is clearly best, ask for something that narrows it — a department, '
      + 'a duty station, a first name — rather than reading candidates aloud.',
    origin: origin('A directory match is what the autocomplete does visually with a glance. Aloud, reading five near-identical names is unusable, and picking one silently would decide a person\'s identity for them.'),
  },
  {
    nodeId: 'voice-confirm-what-is-expensive',
    type: 'Thesis', title: 'Confirm what is expensive, acknowledge the rest', status: 'ACTIVE',
    priority: 15, category: 'dialogue',
    assertion: 'Ask for explicit agreement only where a mistake is costly: submitting the request, a '
      + 'date, an amount, and who the request is for. Everything else you simply repeat back as part '
      + 'of the next question — "right, annual leave; when does it start?"',
    origin: origin('Explicit confirmation on every field turns the conversation into an interrogation and users begin agreeing without listening, which is worse than not confirming. The research line is high-stakes explicit, low-stakes implicit; this rule says where OUR line falls.'),
  },
];

const VOICE_CONDITION = { channel: 'voice' };
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const fingerprint = (graph, channel) => CONTEXTS.map((c) => {
  try {
    return compile(graph, {
      language: 'en', channel, phase: c.phase, toolContext: c.toolContext,
    }, { title: 'System Prompt' }).manifest.textHash;
  } catch (e) { return `ERROR:${e.message}`; }
});

const layersIn = (graph, channel, ctx) => compile(graph, {
  language: 'en', channel, phase: ctx.phase, toolContext: ctx.toolContext,
}, { title: 'System Prompt' }).manifest.layers;

async function main() {
  const write = process.argv.includes('--write');
  const ev = require('../src/services/evolutio/evolutio-prompt.service');
  const entryId = process.env.FLOWDESK_AGENT_PROMPT_ENTRY;
  const loaded = await ev.getGraph(entryId);
  const current = loaded.graph;

  const textBefore = fingerprint(current, 'text');

  const nodes = [...current.nodes, ...VOICE_RULES];
  const edges = [
    ...(current.edges || []),
    ...VOICE_RULES.map((r) => ({
      edgeId: `c-voice-${r.nodeId}`, type: 'APPLIES_WHEN',
      source: r.nodeId, target: r.nodeId, condition: VOICE_CONDITION,
    })),
  ];
  const next = { ...current, nodes, edges };

  const textAfter = fingerprint(next, 'text');
  const voiceAfter = fingerprint(next, 'voice');

  console.log(`live graph v${loaded.meta.versionNumber}: ${current.nodes.length} rules`);
  console.log(`adding ${VOICE_RULES.length} rules conditional on channel: voice`);
  console.log('');
  console.log(`a TEXT turn is byte-identical to before : ${same(textBefore, textAfter)}`);
  console.log(`a VOICE turn differs from a text turn   : ${!same(textAfter, voiceAfter)}`);

  if (!same(textBefore, textAfter)) {
    console.error('ABORT: adding voice rules changed the text prompt. They are not conditional.');
    process.exit(1);
  }

  // What it costs. Conditional text is re-sent on every turn, so this is the number
  // that decides whether one graph remains the right shape.
  const ctx = CONTEXTS.find((c) => c.phase === 'fill') || CONTEXTS[0];
  const t = layersIn(next, 'text', ctx);
  const v = layersIn(next, 'voice', ctx);
  const share = t.coreTokens ? Math.round((v.conditionalTokens / t.coreTokens) * 100) : 0;
  console.log('');
  console.log(`cached core (both channels) : ${t.coreTokens} tokens`);
  console.log(`text turn, conditional tail : ${t.conditionalTokens} tokens`);
  console.log(`voice turn, conditional tail: ${v.conditionalTokens} tokens  (${share}% of the core)`);
  console.log(share > 30
    ? 'ABOVE the 30% line — the one-graph decision should be revisited with this figure.'
    : 'below the 30% line — one graph remains the right shape.');

  const val = validateGraph(next);
  console.log('');
  console.log(`validates: ${(val.errors || []).map((e) => e.code).join(',') || 'clean'}`
    + ` | warnings: ${(val.warnings || []).map((w) => w.code).join(',') || 'none'}`);

  if (!write) { console.log('\n(dry run — pass --write to save a new version)'); return; }
  if ((val.errors || []).length) { console.error('ABORT: invalid.'); process.exit(1); }

  const { saved } = await ev.saveGraph({
    entryId,
    graph: next,
    changelog: `VOICE-001: ${VOICE_RULES.length} rules conditional on channel:voice. Text prompt byte-identical.`,
    createdBy: 'voice-001',
  });
  console.log(`\nsaved as version ${saved.versionNumber ?? saved.version ?? '(new)'} of the live graph.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
