'use strict';

/**
 * Run a Dialogue Gym arena dialogue from the CLI and pretty-print the transcript.
 *
 *   node api/scripts/run-arena.js --persona=field-officer-mali --scenario=leave-balance
 *   node api/scripts/run-arena.js --random
 *   node api/scripts/run-arena.js --random --debug --max-turns=6
 *
 * --persona / --scenario accept a full id (dg-persona-…, dg-scn-…) or any
 * unique substring of the id/name. --random draws a SUITABLE_FOR-weighted pair.
 *
 * @module scripts/run-arena
 */

require('dotenv').config();
const gym = require('../src/services/dialogue-gym/dialogue-gym.service');
const arena = require('../src/services/dialogue-gym/arena-runner.service');

function parseArgs(argv) {
  const a = {};
  for (const raw of argv.slice(2)) {
    const m = raw.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) a[m[1]] = m[2] === undefined ? true : m[2];
  }
  return a;
}

function findByHint(items, hint, idKey) {
  if (!hint) return null;
  const h = String(hint).toLowerCase();
  return items.find((x) => x[idKey] === hint)
    || items.find((x) => String(x[idKey]).toLowerCase().includes(h))
    || items.find((x) => String(x.name || '').toLowerCase().includes(h))
    || null;
}

const line = (c = '─', n = 72) => c.repeat(n);

async function main() {
  const args = parseArgs(process.argv);
  await arena.ensureIndexes();

  // --list-prompts: show CHAT_PROMPT graphs + versions from the editor and exit.
  if (args['list-prompts']) {
    const loader = require('../src/services/dialogue-gym/prompt-loader');
    const graphs = await loader.listPromptGraphs();
    console.log(`CHAT_PROMPT graphs (${graphs.length}):`);
    for (const g of graphs) {
      console.log(`  ${g.entryId}  "${g.name}"  currentVersion=${g.currentVersion}`);
      const versions = await loader.listVersions(g.entryId);
      for (const v of versions) console.log(`     v${v.versionNumber}${v.isProduction ? ' [production]' : ''}  ${v.changelog || ''}`);
    }
    return;
  }

  // Gate every run: the agent's backends degrade silently to empty results, so a
  // dead catalog or embedder produces a dialogue that fails for reasons that have
  // nothing to do with the prompt under test.
  if (!args['skip-preflight']) {
    const preflight = require('../src/services/dialogue-gym/preflight.service');
    const result = await preflight.runPreflight();
    if (!result.ok) {
      console.log(preflight.formatReport(result));
      console.error('\nAborting: this run would fail for infrastructure reasons, not prompt reasons.');
      console.error('Pass --skip-preflight to override.');
      process.exit(3);
    }
    console.log(`preflight OK (${result.durationMs}ms)${result.warned.length ? ` — ${result.warned.length} warning(s)` : ''}`);
  }

  let personaId; let scenarioId;

  if (args.random) {
    const pair = await gym.getRandomPair({ category: args.category, domain: args.domain, difficulty: args.difficulty });
    if (!pair) throw new Error('no eligible persona/scenario pair — run seed-dialogue-gym.js first');
    personaId = pair.persona.personaId; scenarioId = pair.scenario.scenarioId;
  } else {
    const { items: personas } = await gym.listPersonas({ enabled: true });
    const { items: scenarios } = await gym.listScenarios({ enabled: true });
    const p = findByHint(personas, args.persona, 'personaId');
    const s = findByHint(scenarios, args.scenario, 'scenarioId');
    if (!p) throw new Error(`persona not found for hint "${args.persona}". Available: ${personas.map((x) => x.personaId).join(', ')}`);
    if (!s) throw new Error(`scenario not found for hint "${args.scenario}". Available: ${scenarios.map((x) => x.scenarioId).join(', ')}`);
    personaId = p.personaId; scenarioId = s.scenarioId;
  }

  const persona = await gym.getPersona(personaId);
  const scenario = await gym.getScenario(scenarioId);

  console.log(line('═'));
  console.log(`ARENA RUN  ·  persona: ${persona.name} (${persona.domainKnowledge}/${persona.cooperativeness}, ${persona.language})`);
  console.log(`           ·  scenario: ${scenario.name} [${scenario.category}/${scenario.domain}/${scenario.difficulty}]`);
  console.log(`           ·  goal: ${scenario.userGoal}`);
  console.log(`           ·  expected service_code: ${scenario.expectedServiceCode || '(none)'}`);
  console.log(line('═'));

  const altioraUserToken = args.token || process.env.DIALOGUE_GYM_ALTIORA_TOKEN || undefined;
  if (altioraUserToken) console.log('  (acting as real Altiora user — token supplied)');
  // Prompt source: --prompt-entry(+--prompt-version) → test a specific editor version.
  const promptOpts = args['prompt-entry']
    ? { promptSource: 'version', promptEntryId: args['prompt-entry'], promptVersionNumber: args['prompt-version'] ? parseInt(args['prompt-version'], 10) : null }
    : {};
  if (promptOpts.promptSource) console.log(`  (prompt: ${promptOpts.promptEntryId}@v${promptOpts.promptVersionNumber ?? 'latest'})`);
  const t0 = Date.now();
  const { run, transcript, metrics } = await arena.runArena(personaId, scenarioId, {
    maxTurns: args['max-turns'] ? parseInt(args['max-turns'], 10) : undefined,
    debug: !!args.debug,
    promptLabel: promptOpts.promptSource ? `v:${promptOpts.promptEntryId}` : 'cli',
    altioraUserToken,
    ...promptOpts,
  });

  // optional Russian translation (bilingual output)
  let biTurns = null;
  if (args.translate) {
    process.stdout.write('\n(translating to Russian…)');
    await arena.translateRun(run.runId);
    const detail = await arena.getRun(run.runId);
    biTurns = detail ? detail.turns : null;
    process.stdout.write(' done\n');
  }

  // pretty transcript
  if (biTurns) {
    for (const t of biTurns) {
      console.log(`\n[turn ${t.turnIndex}]`);
      console.log(`  👤 USER  EN: ${t.userMessage}`);
      if (t.userMessageRu) console.log(`  👤 USER  RU: ${t.userMessageRu}`);
      console.log(`  🤖 AGENT EN: ${t.agentResponse}`);
      if (t.agentResponseRu) console.log(`  🤖 AGENT RU: ${t.agentResponseRu}`);
    }
  } else {
    let turn = 0;
    for (let i = 0; i < transcript.length; i += 2) {
      const user = transcript[i];
      const agent = transcript[i + 1];
      console.log(`\n[turn ${turn}]`);
      console.log(`  👤 USER : ${user ? user.content : ''}`);
      if (agent) console.log(`  🤖 AGENT: ${agent.content}`);
      turn++;
    }
  }

  console.log(`\n${line()}`);
  console.log('OUTCOME');
  console.log(`  runId              : ${metrics.runId}`);
  console.log(`  prompt             : ${run.promptSource}${run.promptEntryId ? ` (${run.promptEntryId}@v${run.promptVersionNumber ?? 'latest'})` : ''}`);
  console.log(`  terminalCondition  : ${metrics.terminalCondition}`);
  console.log(`  turns              : ${metrics.turnsCount}`);
  console.log(`  serviceIdentified  : ${metrics.serviceIdentified}`);
  console.log(`  identified code    : ${metrics.identifiedServiceCode || '(none)'}  (expected: ${metrics.expectedServiceCode || 'none'})`);
  console.log(`  slotsCollected     : ${(metrics.slotsCollected || []).join(', ') || '(none)'}`);
  console.log(`  persona tokens     : ${metrics.personaTokens}  (~$${(metrics.personaCostUsd || 0).toFixed(4)})`);
  console.log(`  wall time          : ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  status             : ${run.status}${run.errorMessage ? '  error=' + run.errorMessage : ''}`);
  console.log(line());
}

main()
  .then(async () => { try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(0); })
  .catch(async (err) => { console.error('\n[run-arena] FAILED:', err.message); try { await require('../src/services/memgraph.service').close(); } catch {} process.exit(1); });
