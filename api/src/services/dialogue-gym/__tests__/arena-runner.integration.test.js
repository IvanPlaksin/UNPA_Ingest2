'use strict';

/**
 * ArenaRunner INTEGRATION test — drives a real dialogue with live LLMs against a
 * live Memgraph, using seeded personas/scenarios.
 *
 * Skipped by default (needs ANTHROPIC_API_KEY / a live stack + seeded data).
 * Enable with:  DIALOGUE_GYM_INTEGRATION=1 npx jest arena-runner.integration
 * Prereq:       node api/scripts/seed-dialogue-gym.js
 */

const RUN = process.env.DIALOGUE_GYM_INTEGRATION === '1';
const d = RUN ? describe : describe.skip;

d('ArenaRunner integration (live LLM + Memgraph)', () => {
  const arena = require('../arena-runner.service');

  test('completes a dialogue and records every turn', async () => {
    await arena.ensureIndexes();
    const { run, transcript, metrics } = await arena.runArena(
      'dg-persona-new-hr-staff',
      'dg-scn-leave-balance',
      { maxTurns: 6, debug: true, promptLabel: 'integration-test' }
    );

    expect(run.status).toBe('completed');
    expect(metrics.turnsCount).toBeGreaterThan(0);
    expect(['goal_achieved', 'gave_up', 'max_turns', 'service_matched']).toContain(metrics.terminalCondition);
    expect(transcript.length).toBeGreaterThan(0);

    const detail = await arena.getRun(run.runId);
    expect(detail).not.toBeNull();
    expect(detail.turns.length).toBe(metrics.turnsCount);
  }, 180000);
});
