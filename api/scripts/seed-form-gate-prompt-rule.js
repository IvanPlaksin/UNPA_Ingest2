'use strict';

/**
 * The chat does not file the request — the form does.
 *
 * Enforced in code for a while (`FLOWDESK_FINAL_GATE=form` makes draft_submit refuse),
 * and the system prompt never said so. It said the opposite: the mission node ends
 * with "raise an accurate service request", and the confirmation rule names
 * "submitting the request" as the first thing to get explicit agreement for. A model
 * reading that will try to submit, be refused by the tool, and have to improvise an
 * explanation to the user for a rule it was never told.
 *
 * That gap is not cosmetic. Every turn where the model believes it can finish is a
 * turn where it may promise the user that it has.
 *
 * This adds ONE Constraint saying where a request is filed, and repairs the single
 * clause that contradicts it. Nothing else is touched: the mission node stays as it
 * is, because "raise an accurate service request" remains true — the request is
 * raised, through the form, and the assistant does the work that gets it there.
 *
 *   node scripts/seed-form-gate-prompt-rule.js            # apply
 *   node scripts/seed-form-gate-prompt-rule.js --dry-run  # show, change nothing
 */

require('dotenv').config();

const ENTRY = process.env.FLOWDESK_AGENT_PROMPT_ENTRY;
const DRY = process.argv.includes('--dry-run');

const NODE_ID = 'constraint-request-is-filed-from-the-form';

const RULE_TEXT = 'You never submit or file a request. When every field is collected, the request '
    + 'goes to the form, which opens with everything you gathered carried into it, and the '
    + 'user reviews and submits it there. Do not offer to submit, do not ask for agreement '
    + 'to submit, and do not say a request has been created — you will not know that it has. '
    + 'If the user asks you to send it, say plainly that the last step happens in the form, '
    + 'and that you will open it for them. Until the form opens you can still change any '
    + 'answer, and that is what to offer instead.';

/** Shaped exactly like the Constraint nodes already in the graph — the schema is strict. */
const RULE = {
  nodeId: NODE_ID,
  type: 'Constraint',
  title: 'The request is filed from the form, never from the chat',
  status: 'ACTIVE',
  // Above the dialogue theses it qualifies, so it is read before them. Not 100:
  // that band is the immutable safety rules, and this one is a product decision
  // that a deployment can turn off with FLOWDESK_FINAL_GATE.
  priority: 20,
  weight: 1,
  // 'scope' of the four the schema allows (safety | privacy | legal | scope): this
  // draws the line around what the assistant DOES, which is exactly what scope means
  // here. Not 'safety' — nobody is harmed by a submitted request, and that band is
  // reserved for the immutable rules an optimizer may never drop.
  kind: 'scope',
  severity: 'blocking',
  // NOT immutable. The gate is a deployment choice (FLOWDESK_FINAL_GATE), so a
  // deployment that allows chat submission must be able to drop this rule with it.
  immutable: false,
  rule: RULE_TEXT,
  // Both, because the compiler reads one and the editor shows the other; a node
  // carrying only `rule` renders blank in the prompt editor.
  text: RULE_TEXT,
  origin: {
    kind: 'human',
    rationale: 'The gate has been enforced in code (FLOWDESK_FINAL_GATE=form) while the prompt '
      + 'still described submitting as the assistant\'s job. A model told one thing and refused '
      + 'another does not fall silent — it explains the refusal to the user in words nobody wrote, '
      + 'and sometimes it claims success it cannot verify. The prompt has to agree with the gate.',
    introducedBy: 'form-gate-001',
    introducedAt: new Date().toISOString(),
  },
  position: { x: 660, y: 760 },
};

// The one clause that says the opposite. Submitting is no longer something the
// assistant does, so it cannot be something the assistant seeks agreement for.
const AMEND = {
  nodeId: 'voice-confirm-what-is-expensive',
  find: 'Ask for explicit agreement only where a mistake is costly: submitting the request, a date, an amount, and who the request is for.',
  replace: 'Ask for explicit agreement only where a mistake is costly: a date, an amount, and who the request is for. Submitting is not yours to ask about — the form does that.',
};

async function main() {
  const svc = require('../src/services/evolutio/evolutio-prompt.service');
  if (!ENTRY) throw new Error('FLOWDESK_AGENT_PROMPT_ENTRY is not set — refusing to guess which graph is live');

  const loaded = await svc.getGraph(ENTRY);
  const graph = loaded.graph || loaded;
  const nodes = graph.nodes || [];
  console.log(`graph "${(loaded.meta && loaded.meta.title) || ENTRY}" — ${nodes.length} nodes`);

  const already = nodes.find((n) => n.nodeId === NODE_ID);
  const target = nodes.find((n) => n.nodeId === AMEND.nodeId);

  const next = nodes.map((n) => {
    if (n.nodeId !== AMEND.nodeId) return n;
    if (!String(n.assertion || '').includes(AMEND.find)) return n;
    return { ...n, assertion: String(n.assertion).replace(AMEND.find, AMEND.replace) };
  });
  if (!already) next.push(RULE);

  console.log(already ? '  constraint: already present, refreshed' : '  constraint: ADDED');
  if (!target) console.log('  amend: target node not found — the clause may already have been reworded');
  else if (!String(target.assertion || '').includes(AMEND.find)) console.log('  amend: clause already reworded, left alone');
  else console.log('  amend: the "submitting the request" clause rewritten');

  if (already) {
    const i = next.findIndex((n) => n.nodeId === NODE_ID);
    next[i] = RULE;
  }

  if (DRY) {
    console.log('\n--- dry run, nothing written ---');
    console.log(RULE.rule);
    return;
  }

  // A prompt change is a behaviour change: it goes in as a new VERSION, so the
  // previous one is still there to promote back if this reads badly in a live turn.
  const saved = await svc.saveGraph({
    entryId: ENTRY,
    graph: { ...graph, nodes: next },
    changelog: 'form-gate-001: the request is filed from the form, never from the chat',
    createdBy: 'seed-form-gate-prompt-rule',
  });
  console.log(`\nsaved as version ${saved.version ?? '(see catalog)'} — ${next.length} nodes`);
  console.log('Promote it if the service does not pick it up automatically.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
