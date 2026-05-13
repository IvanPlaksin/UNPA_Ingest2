'use strict';
/**
 * Tier 0 + Tier 1 Integration Verification
 *
 * End-to-end test that exercises all knowledge model concepts as a connected system.
 * Verifies that Tier 0 mechanics (polarity, temporal, retraction) integrate correctly
 * with Tier 1 mechanics (hypothesis, decay, inference).
 *
 * Five chains:
 *   1. Polarity conflict detection → POLARITY_CONFLICT Hypothesis auto-created
 *   2. Retraction cascade via source_quanta → EXISTENCE Hypothesis for orphaned evidence
 *   3. Confidence decay → DECAY_RECOVERY Hypothesis when below threshold
 *   4. Inference rule → derived edge → retract premise → cascade invalidation
 *   5. Full ACH evaluation across competing hypotheses
 *
 * Run: node api/tests/integration/tier0-tier1-integration.test.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const neo4j = require('neo4j-driver');

// ─────────────────────────────────────────────────────────────
// Harness
// ─────────────────────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0;
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m', C = '\x1b[36m', Z = '\x1b[0m';

async function test(name, fn) {
  try {
    await fn();
    console.log(`${G}  ✓${Z} ${name}`);
    passed++;
  } catch (err) {
    if (err.skip) { console.log(`${Y}  ⊘${Z} ${name} (${err.message})`); skipped++; }
    else { console.log(`${R}  ✗${Z} ${name}\n      ${R}${err.message}${Z}`); failed++; }
  }
}

function assert(c, m) { if (!c) throw new Error(m || 'assertion failed'); }
function skip(m)      { const e = new Error(m); e.skip = true; throw e; }
function section(s)   { console.log(`\n${C}${s}${Z}`); }

// ─────────────────────────────────────────────────────────────
// Services
// ─────────────────────────────────────────────────────────────

const mg          = require('../../src/services/memgraph.service');
const edgeProps   = require('../../src/services/knowledge/tier0/edge-properties.service');
const polaritySvc = require('../../src/services/knowledge/tier0/polarity.service');
const retrSvc     = require('../../src/services/knowledge/tier0/retraction.service');
const temporalSvc = require('../../src/services/knowledge/tier0/temporal.service');
const hypoSvc     = require('../../src/services/knowledge/tier1/hypothesis.service');
const admSvc      = require('../../src/services/knowledge/tier1/admiralty.service');
const decaySvc    = require('../../src/services/knowledge/tier1/confidence-decay.service');
const inferSvc    = require('../../src/services/knowledge/tier1/inference.service');

// Shared state across chains
const state = {};

// ─────────────────────────────────────────────────────────────
// Setup: test fixture nodes
// ─────────────────────────────────────────────────────────────

async function setup() {
  section('── Setup ──────────────────────────────────────────────');

  await test('Memgraph connection', async () => {
    await mg.runQuery('RETURN 1 AS ok', {});
  });

  await test('create fixture nodes (Alice, Bob, TeamX)', async () => {
    const ts = `inttest_${Date.now()}`;
    const [alice, bob, teamX] = await Promise.all([
      mg.runQuery(`CREATE (n:IntTestNode {label:'Alice', ts:$ts}) RETURN id(n) AS id`, { ts }),
      mg.runQuery(`CREATE (n:IntTestNode {label:'Bob',   ts:$ts}) RETURN id(n) AS id`, { ts }),
      mg.runQuery(`CREATE (n:IntTestNode {label:'TeamX', ts:$ts}) RETURN id(n) AS id`, { ts }),
    ]);
    state.aliceId = alice[0].id;
    state.bobId   = bob[0].id;
    state.teamXId = teamX[0].id;
    state.ts      = ts;
    assert(state.aliceId != null, 'Alice created');
    assert(state.bobId   != null, 'Bob created');
    assert(state.teamXId != null, 'TeamX created');
    console.log(`      nodeIds: Alice=${state.aliceId}, Bob=${state.bobId}, TeamX=${state.teamXId}`);
  });

  await test('create KnowledgeQuantum fixtures (q1, q2, q3)', async () => {
    const now = new Date().toISOString();
    const [q1, q2, q3] = await Promise.all([
      mg.runQuery(
        `CREATE (q:KnowledgeQuantum {id:$id, namespace:'TEST', created_at:$now, content:'Alice manages Bob'}) RETURN q.id AS id`,
        { id: `q1-${state.ts}`, now }
      ),
      mg.runQuery(
        `CREATE (q:KnowledgeQuantum {id:$id, namespace:'TEST', created_at:$now, content:'Alice does NOT manage Bob'}) RETURN q.id AS id`,
        { id: `q2-${state.ts}`, now }
      ),
      mg.runQuery(
        `CREATE (q:KnowledgeQuantum {id:$id, namespace:'TEST', created_at:$now, content:'Bob is in TeamX'}) RETURN q.id AS id`,
        { id: `q3-${state.ts}`, now }
      ),
    ]);
    state.q1 = `q1-${state.ts}`;
    state.q2 = `q2-${state.ts}`;
    state.q3 = `q3-${state.ts}`;
    console.log(`      quantumIds: q1=${state.q1}, q2=${state.q2}, q3=${state.q3}`);
  });
}

// ─────────────────────────────────────────────────────────────
// Chain 1: Polarity Conflict → POLARITY_CONFLICT Hypothesis
// ─────────────────────────────────────────────────────────────

async function chain1_polarityConflict() {
  section('Chain 1: Polarity conflict → POLARITY_CONFLICT Hypothesis');

  await test('create AFFIRMED MANAGES edge (Alice → Bob)', async () => {
    const result = await edgeProps.createEdge(state.aliceId, state.bobId, 'INT_MANAGES', {
      source_quanta:    [state.q1],
      polarity:         'AFFIRMED',
      polarity_confidence: 1.0,
    });
    state.managedEdgeId = result.edgeId;
    assert(state.managedEdgeId != null, 'edgeId returned');
    assert(result.polarity === 'AFFIRMED', `polarity=${result.polarity}`);
    assert(result.status   === 'ACTIVE',   `status=${result.status}`);
    console.log(`      edgeId=${state.managedEdgeId}`);
  });

  await test('set Admiralty code B2 on q1 (usually reliable, probably true)', async () => {
    await admSvc.setAdmiraltyCode(state.q1, 'B', '2');
    const code = await admSvc.getAdmiraltyCode(state.q1);
    assert(code.combined === 'B2', `combined=${code.combined}`);
    assert(code.weight > 0.7 && code.weight < 0.9, `weight=${code.weight}`);
    console.log(`      q1 admiralty: ${code.combined}, weight=${code.weight?.toFixed(3)}`);
  });

  await test('create NEGATED MANAGES edge via negateEdge()', async () => {
    const result = await polaritySvc.negateEdge(state.managedEdgeId, 'contradicted by q2', state.q2);
    state.negatedEdgeId = result.negatedEdgeId;
    assert(state.negatedEdgeId != null, 'negatedEdgeId returned');
    console.log(`      negatedEdgeId=${state.negatedEdgeId}`);
  });

  await test('POLARITY_CONFLICT Hypothesis auto-created by detectContradiction()', async () => {
    const result = await polaritySvc.detectContradiction(state.aliceId, state.bobId, 'INT_MANAGES');
    assert(result.hasContradiction === true,  'hasContradiction=true');
    assert(result.hypothesisId != null,       'hypothesisId returned');
    state.polarityHypoId = result.hypothesisId;
    console.log(`      hypothesisId=${state.polarityHypoId}`);
  });

  await test('POLARITY_CONFLICT Hypothesis has correct type and status', async () => {
    const h = await hypoSvc.getHypothesis(state.polarityHypoId);
    assert(h.type   === 'POLARITY_CONFLICT', `type=${h.type}`);
    assert(h.status === 'OPEN',              `status=${h.status}`);
  });

  await test('arbitrateConflict: q1(B2) beats q2(unrated → lower weight)', async () => {
    // Set q2 to D4 (not usually reliable, doubtfully true)
    await admSvc.setAdmiraltyCode(state.q2, 'D', '4');
    const result = await admSvc.arbitrateConflict([state.q1, state.q2]);
    assert(result.winnerId === state.q1, `Expected q1 to win, got ${result.winnerId}`);
    console.log(`      Winner: ${result.winnerId} (${result.reason}), confidence=${result.confidence?.toFixed(3)}`);
  });

  await test('resolve POLARITY_CONFLICT hypothesis after arbitration', async () => {
    const result = await hypoSvc.resolveHypothesis(state.polarityHypoId, {
      status:             'CONFIRMED',
      resolved_by:        'AUTO',
      resolution_reason:  'Arbitrated by Admiralty: q1(B2) > q2(D4) → AFFIRMED edge wins',
    });
    assert(result.success, 'resolution succeeded');
  });

  await test('updateWeightFromAdmiralty reflects q1 admiralty on edge', async () => {
    const result = await admSvc.updateWeightFromAdmiralty(state.managedEdgeId);
    assert(result.weight_effective > 0.5, `weight_effective=${result.weight_effective}`);
    console.log(`      edge weight_effective=${result.weight_effective?.toFixed(3)} (from q1 B2)`);
  });
}

// ─────────────────────────────────────────────────────────────
// Chain 2: Retraction cascade → edge retracted when quanta exhausted
// ─────────────────────────────────────────────────────────────

async function chain2_retractionCascade() {
  section('Chain 2: Retraction cascade — edge retracted when source_quanta empty');

  await test('create MEMBER_OF edge (Bob → TeamX) supported only by q3', async () => {
    const result = await edgeProps.createEdge(state.bobId, state.teamXId, 'INT_MEMBER_OF', {
      source_quanta: [state.q3],
    });
    state.memberEdgeId = result.edgeId;
    assert(state.memberEdgeId != null, 'edgeId returned');
    console.log(`      edgeId=${state.memberEdgeId}`);
  });

  await test('edge is currently ACTIVE', async () => {
    const edge = await edgeProps.getEdgeWithTier0(state.memberEdgeId);
    assert(edge._isActive === true, `Expected isActive=true, got ${edge._isActive}`);
  });

  await test('retractByQuantum(q3) cascades → edge becomes RETRACTED', async () => {
    const result = await retrSvc.retractByQuantum(state.q3, 'q3 was found to be fabricated');
    assert(result.edgesAffected  >= 1, `edgesAffected=${result.edgesAffected}`);
    assert(result.edgesRetracted >= 1, `edgesRetracted=${result.edgesRetracted}`);
    console.log(`      cascade: ${result.edgesAffected} affected, ${result.edgesRetracted} retracted`);
  });

  await test('MEMBER_OF edge is now RETRACTED', async () => {
    const isR = await retrSvc.isRetracted(state.memberEdgeId);
    assert(isR === true, 'edge should be RETRACTED');
  });

  await test('retracted edge has retraction_reason set', async () => {
    const edge = await edgeProps.getEdgeWithTier0(state.memberEdgeId);
    assert(edge.retraction_reason != null,      'retraction_reason set');
    assert(edge.retracted_at      != null,       'retracted_at set');
    assert(edge.retracted_by_quantum === state.q3, `retracted_by_quantum=${edge.retracted_by_quantum}`);
    console.log(`      reason: "${edge.retraction_reason}"`);
  });

  await test('temporal validity is independent of retraction status', async () => {
    // Set temporal bounds on the retracted edge — should succeed (Tier 0 orthogonality)
    await temporalSvc.setTemporalValidity(state.memberEdgeId, {
      valid_from:       '2024-01-01',
      valid_from_grain: 'DAY',
      valid_to:         null,
      valid_to_grain:   null,
    });
    const tv = await temporalSvc.getTemporalValidity(state.memberEdgeId);
    assert(tv.valid_from === '2024-01-01', 'valid_from set on retracted edge');
    // Status is still RETRACTED — temporal and retraction are orthogonal
    const isR = await retrSvc.isRetracted(state.memberEdgeId);
    assert(isR === true, 'still RETRACTED after temporal update');
  });
}

// ─────────────────────────────────────────────────────────────
// Chain 3: Confidence decay → DECAY_RECOVERY Hypothesis
// ─────────────────────────────────────────────────────────────

async function chain3_confidenceDecay() {
  section('Chain 3: Confidence decay → DECAY_RECOVERY Hypothesis');

  await test('create COLLAB edge (Alice → Bob) with FAST decay rate', async () => {
    const result = await edgeProps.createEdge(state.aliceId, state.bobId, 'INT_COLLAB', {
      source_quanta: [state.q1],
    });
    state.collabEdgeId = result.edgeId;
    await decaySvc.setDecayRate(state.collabEdgeId, 'FAST');
    console.log(`      edgeId=${state.collabEdgeId}, decay=FAST`);
  });

  await test('simulate 3-year-old evidence (backdate last_reinforced)', async () => {
    const threeYearsAgo = new Date(Date.now() - 3 * 365 * 86400000).toISOString();
    await mg.runQuery(
      `MATCH ()-[r]->() WHERE id(r) = $eid SET r.last_reinforced = $lr`,
      { eid: neo4j.int(state.collabEdgeId), lr: threeYearsAgo }
    );
    const w = decaySvc.computeEffectiveWeight(1.0, 'FAST', threeYearsAgo);
    assert(w < 0.01, `Expected near-zero weight for FAST+3yr, got ${w.toFixed(6)}`);
    console.log(`      simulated weight_effective=${w.toFixed(6)} (3yr FAST decay)`);
  });

  await test('applyDecay() creates DECAY_RECOVERY Hypothesis for low-confidence edge', async () => {
    const result = await decaySvc.applyDecay({ batchSize: 100 });
    assert(result.processed       >= 1, `processed=${result.processed}`);
    assert(result.hypothesesCreated >= 1, `hypothesesCreated=${result.hypothesesCreated}`);
    console.log(`      processed=${result.processed}, decayed=${result.decayed}, hypotheses=${result.hypothesesCreated}`);
  });

  await test('DECAY_RECOVERY Hypothesis exists for INT_COLLAB edge', async () => {
    const rows = await mg.runQuery(
      `MATCH (h:Hypothesis { type: 'DECAY_RECOVERY', status: 'OPEN' })
       WHERE $eid IN h.subject_edges RETURN h.id AS id, h.statement AS statement`,
      { eid: String(state.collabEdgeId) }
    );
    assert(rows.length > 0, `No DECAY_RECOVERY hypothesis found for edge ${state.collabEdgeId}`);
    state.decayHypoId = rows[0].id;
    console.log(`      hypothesis: "${rows[0].statement}"`);
  });

  await test('reinforce() resolves DECAY_RECOVERY Hypothesis', async () => {
    await retrSvc.restore
      ? null // no restore needed here
      : null;
    await decaySvc.reinforce(state.collabEdgeId, `q-reinforce-${state.ts}`);
    // Check hypothesis resolved
    const rows = await mg.runQuery(
      `MATCH (h:Hypothesis { id: $id }) RETURN h.status AS status`,
      { id: state.decayHypoId }
    );
    assert(rows.length > 0, 'hypothesis still exists');
    const status = rows[0].status;
    assert(status === 'CONFIRMED', `Expected CONFIRMED after reinforce, got ${status}`);
    console.log(`      DECAY_RECOVERY hypothesis resolved: ${status}`);
  });

  await test('after reinforce, weight_effective is near 1.0', async () => {
    const we = await decaySvc.calculateEffectiveWeight(state.collabEdgeId);
    assert(we > 0.9, `Expected ~1.0 after reinforce, got ${we}`);
    console.log(`      weight_effective after reinforce=${we.toFixed(4)}`);
  });
}

// ─────────────────────────────────────────────────────────────
// Chain 4: Inference rule → derived edge → premise retraction → cascade
// ─────────────────────────────────────────────────────────────

async function chain4_inferenceAndCascade() {
  section('Chain 4: Inference rule → derived edge → premise retract → cascade');

  await test('create WORKS_IN premise edge (Bob → TeamX)', async () => {
    const result = await edgeProps.createEdge(state.bobId, state.teamXId, 'INT_WORKS_IN', {
      source_quanta: [`q-works-${state.ts}`],
    });
    state.worksInEdgeId = result.edgeId;
    console.log(`      premise edgeId=${state.worksInEdgeId}`);
  });

  await test('register TRANSITIVE inference rule: WORKS_IN → member (symmetric)', async () => {
    const result = await inferSvc.registerRule({
      name:                'INT_WORKS_IN → INT_MEMBER_DERIVED',
      description:         'If Bob WORKS_IN TeamX, Bob is a derived member of TeamX',
      type:                'TRANSITIVE',
      pattern:             {
        premises:   [{ from: 'a', to: 'b', type: 'INT_WORKS_IN' }],
        conclusion: { from: 'a', to: 'b', type: 'INT_MEMBER_DERIVED' },
      },
      confidence_modifier: 0.85,
      namespace:           'TEST',
      created_by:          'integration-test',
    });
    state.inferRuleId = result.ruleId;
    console.log(`      ruleId=${state.inferRuleId}`);
  });

  await test('deriveEdge() creates INT_MEMBER_DERIVED with justification', async () => {
    const result = await inferSvc.deriveEdge(state.bobId, state.teamXId, 'INT_MEMBER_DERIVED', {
      premises:            [state.worksInEdgeId],
      ruleId:              state.inferRuleId,
      ruleName:            'INT_WORKS_IN → INT_MEMBER_DERIVED',
      confidence_modifier: 0.85,
      premiseWeights:      [1.0],
    });
    state.derivedEdgeId = result.edgeId;
    assert(state.derivedEdgeId != null, 'derived edgeId returned');
    assert(result.derived_confidence > 0.8, `confidence=${result.derived_confidence}`);
    console.log(`      derivedEdgeId=${state.derivedEdgeId}, confidence=${result.derived_confidence}`);
  });

  await test('getJustification returns chain pointing to premise', async () => {
    const j = await inferSvc.getJustification(state.derivedEdgeId);
    assert(Array.isArray(j.chain) && j.chain.length > 0, 'chain non-empty');
    assert(j.totalConfidence > 0.8, `totalConfidence=${j.totalConfidence}`);
    const hasRule = j.chain.some(c => c.ruleId === state.inferRuleId);
    assert(hasRule, 'justification references the inference rule');
    console.log(`      chain depth=${j.chain.length}, totalConfidence=${j.totalConfidence?.toFixed(3)}`);
  });

  await test('revalidateDerived() confirms derived edge valid while premise active', async () => {
    const r = await inferSvc.revalidateDerived(state.derivedEdgeId);
    assert(r.valid === true, `Expected valid=true, got: ${JSON.stringify(r)}`);
  });

  await test('retract premise (INT_WORKS_IN) — derived edge should cascade to RETRACTED', async () => {
    await retrSvc.retract(state.worksInEdgeId, {
      reason: 'Bob transferred to a different team',
    });
    const isR = await retrSvc.isRetracted(state.worksInEdgeId);
    assert(isR === true, 'premise is RETRACTED');

    // Trigger cascade
    const cascade = await inferSvc.invalidateDerived(state.worksInEdgeId);
    assert(cascade.affected  >= 1, `affected=${cascade.affected}`);
    assert(cascade.retracted >= 1, `retracted=${cascade.retracted}`);
    console.log(`      cascade: ${cascade.affected} affected, ${cascade.retracted} retracted`);
  });

  await test('derived INT_MEMBER_DERIVED edge is now RETRACTED', async () => {
    const isR = await retrSvc.isRetracted(state.derivedEdgeId);
    assert(isR === true, 'derived edge cascaded to RETRACTED');
  });
}

// ─────────────────────────────────────────────────────────────
// Chain 5: Full ACH evaluation across competing hypotheses
// ─────────────────────────────────────────────────────────────

async function chain5_achEvaluation() {
  section('Chain 5: Full ACH evaluation — competing hypotheses');

  await test('create two competing RELATION hypotheses', async () => {
    const [h1, h2] = await Promise.all([
      hypoSvc.createHypothesis({
        type:      'RELATION',
        statement: 'Alice reports to Carol (hypothesis A)',
        namespace: 'TEST',
      }),
      hypoSvc.createHypothesis({
        type:      'RELATION',
        statement: 'Alice reports to Dave (hypothesis B)',
        namespace: 'TEST',
      }),
    ]);
    state.achHypo1 = h1.hypothesisId;
    state.achHypo2 = h2.hypothesisId;
    await hypoSvc.linkCompeting(state.achHypo1, state.achHypo2);
    console.log(`      H1=${state.achHypo1}, H2=${state.achHypo2}`);
  });

  await test('add SUPPORTS evidence to H1 (Alice→Carol)', async () => {
    const result = await hypoSvc.addEvidence(state.achHypo1, {
      quantumId:       state.q1,
      relationship:    'SUPPORTS',
      diagnostic_value: 0.7,
      admiralty:        'B2',
    });
    assert(result.newConfidence > 0.5, `confidence after SUPPORTS=${result.newConfidence}`);
    console.log(`      H1 confidence after SUPPORTS: ${result.newConfidence}`);
  });

  await test('add CONTRADICTS evidence to H1 — lowers confidence', async () => {
    const result = await hypoSvc.addEvidence(state.achHypo1, {
      quantumId:       state.q2,
      relationship:    'CONTRADICTS',
      diagnostic_value: 0.6,
      admiralty:        'C3',
    });
    assert(result.newConfidence < 0.9, `confidence should drop: ${result.newConfidence}`);
    console.log(`      H1 confidence after CONTRADICTS: ${result.newConfidence}`);
  });

  await test('add only SUPPORTS evidence to H2 (Alice→Dave) — no contradictions', async () => {
    const result = await hypoSvc.addEvidence(state.achHypo2, {
      quantumId:       state.q3,
      relationship:    'SUPPORTS',
      diagnostic_value: 0.5,
      admiralty:        'C3',
    });
    assert(result.newConfidence >= 0.5, `H2 confidence=${result.newConfidence}`);
    console.log(`      H2 confidence after SUPPORTS: ${result.newConfidence}`);
  });

  await test('ACH evaluation: H2 ranked higher (fewer contradictions)', async () => {
    const ach = await hypoSvc.evaluateWithACH(state.achHypo1);
    assert(ach.ranking && ach.ranking.length >= 2, `ranking length=${ach.ranking?.length}`);
    const top = ach.ranking[0];
    // H2 has 0 contradictions, H1 has 1 → H2 should rank first
    assert(top.id === state.achHypo2, `Expected H2 on top, got ${top.id} (contradicts: ${top.contradicts_count})`);
    assert(ach.recommendation === 'COMPETING_HYPOTHESIS_PREFERRED', `recommendation=${ach.recommendation}`);
    console.log(`      Top: "${top.statement?.slice(0,50)}..." contradictions=${top.contradicts_count}`);
    console.log(`      Recommendation: ${ach.recommendation}`);
  });

  await test('eliminates=true CONTRADICTS evidence auto-falsifies H2', async () => {
    const result = await hypoSvc.addEvidence(state.achHypo2, {
      quantumId:       state.q2,
      relationship:    'CONTRADICTS',
      diagnostic_value: 1.0,
      eliminates:       true,
    });
    assert(result.newConfidence === 0.0,    'confidence=0 after eliminate');
    assert(result.statusChanged === true,   'statusChanged=true');

    const h2 = await hypoSvc.getHypothesis(state.achHypo2);
    assert(h2.status === 'FALSIFIED', `Expected FALSIFIED, got ${h2.status}`);
    console.log(`      H2 status: ${h2.status} (auto-falsified by eliminates=true)`);
  });
}

// ─────────────────────────────────────────────────────────────
// Chain 6: validateEdge — Tier 0 compliance check
// ─────────────────────────────────────────────────────────────

async function chain6_schemaCompliance() {
  section('Chain 6: Schema compliance — all created edges pass Tier 0 validation');

  const edgesToCheck = [
    { id: () => state.managedEdgeId, name: 'INT_MANAGES (AFFIRMED)' },
    { id: () => state.collabEdgeId,  name: 'INT_COLLAB (decayed+reinforced)' },
  ];

  for (const { id, name } of edgesToCheck) {
    await test(`validateEdge — ${name}`, async () => {
      const edgeId = id();
      if (edgeId == null) skip('edge not created');
      const result = await edgeProps.validateEdge(edgeId);
      assert(result.valid === true, `Validation errors: ${(result.errors || []).join('; ')}`);
    });
  }

  await test('migrateEdge is idempotent on already-compliant edge', async () => {
    if (!state.managedEdgeId) skip('edge not created');
    const r1 = await edgeProps.migrateEdge(state.managedEdgeId);
    assert(r1.migrated === false || r1.reason === 'already compliant',
      `Expected no migration, got: ${JSON.stringify(r1)}`);
  });
}

// ─────────────────────────────────────────────────────────────
// Teardown
// ─────────────────────────────────────────────────────────────

async function teardown() {
  section('── Teardown ───────────────────────────────────────────');

  await test('clean up all test nodes, edges, hypotheses', async () => {
    await mg.runQuery(`MATCH (n:IntTestNode {ts:$ts}) DETACH DELETE n`, { ts: state.ts });
    await mg.runQuery(`MATCH (q:KnowledgeQuantum) WHERE q.id STARTS WITH 'q1-${state.ts}' OR q.id STARTS WITH 'q2-${state.ts}' OR q.id STARTS WITH 'q3-${state.ts}' DETACH DELETE q`, {});
    await mg.runQuery(`MATCH (h:Hypothesis) WHERE h.namespace IN ['TEST','SYSTEM'] DETACH DELETE h`, {});
    await mg.runQuery(`MATCH (r:InferenceRule {namespace:'TEST'}) DELETE r`, {});
    console.log('      test data cleaned up');
  });
}

// ─────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  Tier 0 + Tier 1 Integration Verification');
  console.log('  (end-to-end knowledge model system test)');
  console.log('══════════════════════════════════════════════════════');

  try {
    await setup();
    if (failed > 0) {
      console.log(`\n${R}Setup failed — aborting integration chains${Z}`);
      process.exit(1);
    }

    await chain1_polarityConflict();
    await chain2_retractionCascade();
    await chain3_confidenceDecay();
    await chain4_inferenceAndCascade();
    await chain5_achEvaluation();
    await chain6_schemaCompliance();
  } finally {
    await teardown();
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log(`  Passed: ${passed}  Failed: ${failed}  Skipped: ${skipped}`);
  console.log(`  ${failed === 0 ? `${G}All integration chains verified ✓${Z}` : `${R}${failed} chain(s) failed${Z}`}`);
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`${R}Integration test runner error:${Z}`, err);
  process.exit(1);
});
