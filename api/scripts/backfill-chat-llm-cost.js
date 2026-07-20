'use strict';

/**
 * Backfill FlowDesk chat LLM cost — retroactively price historical turns whose
 * cost was stored as $0.
 *
 * WHY: the anthropic-api provider (the active FlowDesk chat backend) used to
 * report token usage but no cost, so every ChatTurn/ChatSession recorded
 * llmCostUsd=0 while llmTokens was populated. The whole /flowdesk-admin cost
 * UI therefore showed $0.0000. Going forward the provider prices calls itself;
 * this script fixes the already-stored records so the historical views are
 * correct too.
 *
 * For each ChatTurn: reprice each per-call record in llmCallsJson from its
 * stored model+tokens (services/ai/llm-pricing), rewrite llmCallsJson +
 * t.llmCostUsd, then recompute each ChatSession.llmCostUsd as the sum of its
 * turns. Idempotent: calls that already carry a costUsd are left untouched.
 *
 * Usage:
 *   node scripts/backfill-chat-llm-cost.js            # apply
 *   node scripts/backfill-chat-llm-cost.js --dry-run  # report only
 *
 * @module scripts/backfill-chat-llm-cost
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { read, write, close } = require('../src/instances/flowdesk/schema-graph/driver');
const pricing = require('../src/services/ai/llm-pricing');

const DRY = process.argv.includes('--dry-run');

/** Reprice one stored call record; return {call, changed}. */
function repriceCall(c) {
  if (!c || typeof c !== 'object') return { call: c, changed: false };
  if (typeof c.costUsd === 'number' && c.costUsd > 0) return { call: c, changed: false };
  const tokens = c.tokens || 0;
  if (!tokens) return { call: c, changed: false };
  const cost = (typeof c.inputTokens === 'number' && typeof c.outputTokens === 'number')
    ? pricing.costFor(c.model, c.inputTokens, c.outputTokens)
    : pricing.costForCombined(c.model, tokens);
  if (!cost) return { call: c, changed: false };
  return { call: { ...c, costUsd: cost }, changed: true };
}

async function main() {
  console.log(`[backfill-chat-llm-cost] ${DRY ? 'DRY RUN — no writes' : 'APPLY'}`);

  const rows = await read(
    `MATCH (t:ChatTurn)
     RETURN t.turnId AS turnId, t.sessionId AS sessionId,
            coalesce(t.llmCostUsd,0.0) AS cost, t.llmCallsJson AS calls`);

  let turnsScanned = 0, turnsUpdated = 0, callsRepriced = 0;
  let addedTurnCost = 0;
  const sessions = new Set();

  for (const r of rows) {
    turnsScanned += 1;
    const turnId = r.get('turnId');
    const sessionId = r.get('sessionId');
    if (sessionId) sessions.add(sessionId);
    let calls;
    try { calls = JSON.parse(r.get('calls') || '[]'); } catch { continue; }
    if (!Array.isArray(calls) || !calls.length) continue;

    let anyChange = false;
    const next = calls.map((c) => {
      const { call, changed } = repriceCall(c);
      if (changed) { anyChange = true; callsRepriced += 1; }
      return call;
    });
    if (!anyChange) continue;

    const newCost = next.reduce((a, c) => a + (c.costUsd || 0), 0);
    addedTurnCost += newCost - Number(r.get('cost') || 0);
    turnsUpdated += 1;

    if (!DRY) {
      await write(
        `MATCH (t:ChatTurn {turnId:$turnId})
         SET t.llmCostUsd=$cost, t.llmCallsJson=$calls`,
        { turnId, cost: newCost, calls: JSON.stringify(next) });
    }
  }

  // Recompute each affected session's total from its (now-repriced) turns.
  let sessionsUpdated = 0;
  if (!DRY) {
    for (const sessionId of sessions) {
      const res = await write(
        `MATCH (s:ChatSession {sessionId:$sessionId})-[:HAS_TURN]->(t:ChatTurn)
         WITH s, sum(coalesce(t.llmCostUsd,0.0)) AS total
         SET s.llmCostUsd=total
         RETURN total`,
        { sessionId });
      if (res.length) sessionsUpdated += 1;
    }
  }

  console.log(`  turns scanned:   ${turnsScanned}`);
  console.log(`  turns updated:   ${turnsUpdated}`);
  console.log(`  calls repriced:  ${callsRepriced}`);
  console.log(`  cost added:      $${addedTurnCost.toFixed(4)}`);
  console.log(`  sessions retotalled: ${DRY ? sessions.size + ' (would)' : sessionsUpdated}`);
  console.log('[backfill-chat-llm-cost] done.');
}

main()
  .catch((e) => { console.error('[backfill-chat-llm-cost] FAILED:', e); process.exitCode = 1; })
  .finally(() => close());
