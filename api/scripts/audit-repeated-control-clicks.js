'use strict';

/**
 * Did the chat lose a user's answer?
 *
 * A click that is not stored has one visible consequence: the field becomes due
 * again and the assistant asks the same question on the next turn. So the signature
 * of a lost answer is **the same FIELD clicked on two or more consecutive turns of
 * one session** — and that is what this looks for.
 *
 * Written after a real one. A yes/no field carried `value: true|false`, and
 * `recordControlAnswer` read those with a CONFIRM's semantics — `true` went looking
 * for a defaultValue a toggle does not carry, `false` was discarded as "no, someone
 * else". Nothing was stored either way. The consent checkbox on the extension form
 * was answered and asked again, in FOUR live sessions out of 112 with control clicks
 * (3.6%), before anyone noticed; the arena found it only once it could click and walk
 * a form to the end.
 *
 * WHAT IT CAN AND CANNOT TELL YOU. ChatTurn records `[control:<action>:<slotId>]` and
 * not the slot's type, so this finds every repeated field click — including the
 * legitimate ones, where a user changed their mind. It is a DETECTOR, not a verdict:
 * read the sessions it names. Fields whose name looks like a consent are flagged,
 * because that is the shape the known defect took.
 *
 * `__`-prefixed controls are excluded: a service list, a skip, a confirm gate are the
 * turn's own questions and a user clicks them repeatedly by design.
 *
 * Run it after any change to how answers are recorded (recordControlAnswer,
 * handleControlAction, the hybrid's write path) and check the count has not grown.
 *
 *   node api/scripts/audit-repeated-control-clicks.js
 *   node api/scripts/audit-repeated-control-clicks.js --since=2026-07-01 --limit=40
 *
 * @module scripts/audit-repeated-control-clicks
 */

require('dotenv').config();

const neo4j = require('neo4j-driver');

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/);
  return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));

const SINCE = args.since || null;                                  // ISO date, optional
const LIMIT = args.limit ? parseInt(args.limit, 10) : 25;

const num = (v) => (v && typeof v === 'object' && 'low' in v ? v.low : v);

/** Field names that look like a consent — the shape the known defect took. */
const CONSENT_ISH = /confirm|consent|agree|accurate|certify|declaration|acknowledg/i;

const slotOf = (text) => {
  const m = /^\[control:[^:]*:([^\]]+)\]/.exec(String(text || ''));
  return m ? m[1] : null;
};

async function main() {
  const driver = neo4j.driver(
    process.env.MEMGRAPH_URI || 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.MEMGRAPH_USER || 'memgraph', process.env.MEMGRAPH_PASSWORD || 'secret_password_123'),
  );
  const session = driver.session();

  try {
    const res = await session.run(
      `MATCH (t:ChatTurn)
       WHERE t.userText STARTS WITH '[control'
         ${SINCE ? 'AND t.ts >= $since' : ''}
       RETURN t.sessionId AS sessionId, t.seq AS seq, t.userText AS userText, t.ts AS ts
       ORDER BY t.sessionId, t.seq`,
      SINCE ? { since: SINCE } : {},
    );

    const bySession = new Map();
    for (const r of res.records) {
      const sid = r.get('sessionId');
      if (!bySession.has(sid)) bySession.set(sid, []);
      bySession.get(sid).push({ seq: num(r.get('seq')), text: r.get('userText'), ts: r.get('ts') });
    }

    // The longest consecutive run of clicks on the same field, per (session, field).
    const worst = new Map();
    for (const [sid, turns] of bySession) {
      turns.sort((a, b) => a.seq - b.seq);
      let run = { slot: null, count: 0, from: null };
      for (const t of turns) {
        const slot = slotOf(t.text);
        if (!slot || slot.startsWith('__')) { run = { slot: null, count: 0, from: null }; continue; }
        if (slot === run.slot) {
          run.count += 1;
          if (run.count >= 2) {
            const key = `${sid}|${slot}`;
            const row = { sessionId: sid, slot, clicks: run.count, fromSeq: run.from, ts: t.ts };
            if (!worst.has(key) || worst.get(key).clicks < row.clicks) worst.set(key, row);
          }
        } else {
          run = { slot, count: 1, from: t.seq };
        }
      }
    }

    const rows = [...worst.values()].sort((a, b) => b.clicks - a.clicks);
    const consentish = rows.filter((r) => CONSENT_ISH.test(r.slot));

    console.log('='.repeat(76));
    console.log('REPEATED FIELD CLICKS — the signature of an answer that was not stored');
    if (SINCE) console.log(`  window            : since ${SINCE}`);
    console.log(`  sessions with clicks: ${bySession.size}`);
    console.log(`  fields clicked 2+ times consecutively: ${rows.length}`);
    console.log(`  …of those, consent-shaped by name    : ${consentish.length}`);
    console.log('='.repeat(76));

    if (!rows.length) {
      console.log('Nothing repeated — no sign of a lost answer in this window.');
    } else {
      console.log(`${'field'.padEnd(36)}${'clicks'.padEnd(8)}${'turn'.padEnd(6)}session`);
      for (const r of rows.slice(0, LIMIT)) {
        const flag = CONSENT_ISH.test(r.slot) ? '  ← yes/no by name' : '';
        console.log(
          `${String(r.slot).slice(0, 35).padEnd(36)}${String(r.clicks).padEnd(8)}${String(r.fromSeq ?? '?').padEnd(6)}${r.sessionId}${flag}`,
        );
      }
      if (rows.length > LIMIT) console.log(`… ${rows.length - LIMIT} more (raise --limit)`);
      console.log('');
      console.log('A repeat is not a verdict: a user may have changed their mind. Read the sessions —');
      console.log('a LOST answer looks like the assistant asking the SAME question again straight after.');
    }
  } finally {
    await session.close();
    await driver.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[audit] FAILED:', e.message); process.exit(1); });
