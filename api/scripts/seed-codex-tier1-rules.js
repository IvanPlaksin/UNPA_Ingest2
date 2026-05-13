#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { v4: uuidv4 } = require('uuid');
const memgraph = require('../src/services/memgraph.service');

const rules = [
  {
    codexId: 'CODEX-RULE-T1-001',
    title: 'Conflicting evidence must create Hypothesis',
    summary: 'When AFFIRMED and NEGATED edges exist for same relationship, system must create POLARITY_CONFLICT Hypothesis node. Silent contradiction resolution is forbidden.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'hypothesis', 'polarity'],
    rationale: 'Contradictions are signals — they indicate competing evidence that must be tracked, not discarded. ACH analysis requires the conflict to be visible.',
    examples: ['detectContradiction() → creates :Hypothesis {type: POLARITY_CONFLICT}'],
    antiPatterns: ['Deleting one of the conflicting edges', 'Overwriting AFFIRMED with NEGATED silently'],
  },
  {
    codexId: 'CODEX-RULE-T1-002',
    title: 'Hypothesis resolution must be recorded',
    summary: 'All hypothesis resolutions must include: resolved_by (method), resolution_reason (human-readable), and resolved_at (timestamp). Untracked resolutions are not allowed.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'hypothesis'],
    rationale: 'Audit trails require knowing who resolved a hypothesis, when, and why. This enables post-hoc review of analytical decisions.',
    examples: ['h.resolved_by = "HUMAN", h.resolution_reason = "Confirmed by document revision"'],
    antiPatterns: ['Setting status=CONFIRMED without resolved_by', 'Resolving without reason'],
  },
  {
    codexId: 'CODEX-RULE-T1-003',
    title: 'ACH evaluation must rank by contradicting evidence',
    summary: 'Analysis of Competing Hypotheses (ACH) ranks hypotheses by minimum count of CONTRADICTS evidence, not maximum count of SUPPORTS. The most defensible hypothesis is the one with fewest contradictions.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'hypothesis', 'ach'],
    rationale: 'ACH methodology is falsification-based (from Richards Heuer). Hypotheses with no contradictions are preferred over hypotheses with many confirmations but also contradictions.',
    examples: ['H1: 3 SUPPORTS, 0 CONTRADICTS → ranked above H2: 10 SUPPORTS, 1 CONTRADICTS'],
    antiPatterns: ['Ranking by support count instead of contradiction count', 'Confirmation-bias reasoning'],
  },
  {
    codexId: 'CODEX-RULE-T1-004',
    title: 'All KnowledgeQuantum should have Admiralty code',
    summary: 'Every KnowledgeQuantum node should have admiralty_combined, admiralty_source, admiralty_accuracy, and admiralty_weight properties. Unrated quanta default to F6 (unknown/cannot judge).',
    modality: 'SHOULD',
    scope: ['knowledge', 'tier1', 'admiralty', 'provenance'],
    rationale: 'Without source rating, conflict arbitration cannot be evidence-based. Admiralty codes enable principled weighting of competing claims.',
    examples: ['q.admiralty_combined = "B2" (usually reliable, probably true)'],
    antiPatterns: ['Creating quanta without any reliability rating', 'Treating all sources as equally reliable'],
  },
  {
    codexId: 'CODEX-RULE-T1-005',
    title: 'Conflict arbitration must use Admiralty Code',
    summary: 'When quanta conflict, the quantum with higher Admiralty weight takes precedence. Ties broken by recency. Manual override must be recorded.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'admiralty'],
    rationale: 'Principled conflict resolution requires an objective standard. Admiralty Code provides a domain-neutral, well-established framework.',
    examples: ['arbitrateConflict([q1(A1), q2(D4)]) → winner=q1 (higher Admiralty weight)'],
    antiPatterns: ['Using recency as primary arbiter when Admiralty differs', 'Manual resolution without recording the method'],
  },
  {
    codexId: 'CODEX-RULE-T1-006',
    title: 'Current facts must have decay rate assigned',
    summary: 'Edges with valid_to=NULL (current facts, status=ACTIVE) should have explicit decay_rate. Default is STABLE only for mathematical or immutable facts.',
    modality: 'SHOULD',
    scope: ['knowledge', 'tier1', 'decay'],
    rationale: 'Real-world facts become stale. Without decay, the knowledge graph accumulates outdated claims with no signal that reconfirmation is needed.',
    examples: ['Employment facts: MEDIUM decay (~30%/year)', 'Project status: FAST decay (~95%/year)', 'Historical dates: STABLE'],
    antiPatterns: ['Using STABLE for all facts regardless of domain', 'Not assigning any decay_rate'],
  },
  {
    codexId: 'CODEX-RULE-T1-007',
    title: 'Low-confidence edges require DECAY_RECOVERY hypothesis',
    summary: 'When an edge weight_effective falls below 0.3 (default threshold), a DECAY_RECOVERY Hypothesis must be created if not already open. This signals the fact needs reconfirmation.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'decay', 'hypothesis'],
    rationale: 'Decayed facts should not silently remain in the graph. The DECAY_RECOVERY hypothesis creates a visible signal for human or agent review.',
    examples: ['applyDecay() → edge.weight_effective = 0.18 → creates Hypothesis(DECAY_RECOVERY)'],
    antiPatterns: ['Allowing decayed edges without any notification', 'Auto-retracting without creating hypothesis first'],
  },
  {
    codexId: 'CODEX-RULE-T1-008',
    title: 'Historical facts do not decay',
    summary: 'Edges with valid_to < NOW (historical facts — the relationship is known to have ended) must not have decay applied. Only current facts (valid_to=NULL) decay.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'decay', 'temporal'],
    rationale: 'Historical facts are immutable — "Alice worked at X from 2020-2023" does not become less certain with time. Only current claims about ongoing states can become stale.',
    examples: ['Edge: valid_to = 2023-06-01 (past) → decay_rate = STABLE (system-enforced)'],
    antiPatterns: ['Applying decay to edges with valid_to in the past', 'Mixing temporal invalidation with confidence decay'],
  },
  {
    codexId: 'CODEX-RULE-T1-009',
    title: 'Derived edges must have justification chain',
    summary: 'All edges with derived=true must have: inference_rule_id, premise_edge_ids (non-empty), derived_confidence, and derived_at. Unjustified derived edges are not allowed.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'inference'],
    rationale: 'Derived knowledge without justification is indistinguishable from asserted knowledge. The chain enables validation, debugging, and retraction cascades.',
    examples: ['r.derived=true, r.inference_rule_id="rule-123", r.premise_edge_ids=["42","87"]'],
    antiPatterns: ['Setting derived=true without premise_edge_ids', 'Creating derived edges without rule reference'],
  },
  {
    codexId: 'CODEX-RULE-T1-010',
    title: 'Derived confidence must not exceed premise confidence',
    summary: 'derived_confidence <= min(premise.weight_effective) × confidence_modifier. Inference cannot create certainty where premises are uncertain.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'inference'],
    rationale: 'Logical principle: a conclusion cannot be more certain than its least certain premise. Violating this inflates confidence artificially.',
    examples: ['premises: [0.8, 0.6], modifier: 0.9 → derived_confidence = 0.6 × 0.9 = 0.54'],
    antiPatterns: ['Setting derived_confidence = 1.0 regardless of premises', 'Not applying confidence_modifier'],
  },
  {
    codexId: 'CODEX-RULE-T1-011',
    title: 'Premise invalidation must cascade to derived',
    summary: 'When a premise edge is retracted, all derived edges that depend on it must be revalidated. If any premise is invalid, the derived edge must also be retracted.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'inference', 'retraction'],
    rationale: 'A chain of reasoning is only as strong as its premises. Allowing derived edges to survive after premise retraction creates orphaned false conclusions.',
    examples: ['retract(edge42) → invalidateDerived(42) → cascades to all edges where 42 ∈ premise_edge_ids'],
    antiPatterns: ['Only retracting the premise without cascading', 'Manual cascade without system enforcement'],
  },
  {
    codexId: 'CODEX-RULE-T1-012',
    title: 'Inference rules must be namespaced',
    summary: 'All :InferenceRule nodes must have a namespace property. Rules from different instances must not cross-apply by default.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'inference', 'namespace'],
    rationale: 'Multi-instance architecture requires rules to be scoped. A FLOWDESK rule should not accidentally derive edges in the UNPA namespace.',
    examples: ['r.namespace = "FLOWDESK" — rule only applies to FLOWDESK edges'],
    antiPatterns: ['Creating InferenceRule without namespace', 'Applying rules across namespaces without explicit override'],
  },
  {
    codexId: 'CODEX-RULE-T1-013',
    title: 'Evidence admiralty must be recorded on hypothesis relationship',
    summary: 'SUPPORTED_BY and CONTRADICTED_BY relationships on Hypothesis nodes should carry the admiralty code of the source quantum as r.admiralty.',
    modality: 'SHOULD',
    scope: ['knowledge', 'tier1', 'hypothesis', 'admiralty'],
    rationale: 'ACH confidence calculation uses evidence quality. Without admiralty on the relationship, all evidence is treated as equally reliable.',
    examples: ['(h)-[:SUPPORTS {admiralty: "B2", diagnostic_value: 0.7}]->(q)'],
    antiPatterns: ['Adding evidence without recording admiralty', 'Assuming all evidence is equally diagnostic'],
  },
  {
    codexId: 'CODEX-RULE-T1-014',
    title: 'Expired hypotheses must be auto-resolved',
    summary: 'Hypotheses with expires_at < NOW and status=OPEN must be automatically resolved with status=EXPIRED and resolved_by=TIMEOUT. Unresolved expired hypotheses pollute the open queue.',
    modality: 'MUST',
    scope: ['knowledge', 'tier1', 'hypothesis'],
    rationale: 'Open hypotheses represent pending analytical tasks. Stale open hypotheses reduce the signal-to-noise ratio and can block downstream analysis.',
    examples: ['checkExpired() scheduled daily → auto-resolves all expired OPEN hypotheses'],
    antiPatterns: ['Leaving expired hypotheses in OPEN status indefinitely', 'Not setting expires_at on time-limited hypotheses'],
  },
  {
    codexId: 'CODEX-RULE-T1-015',
    title: 'EXISTENCE hypothesis required for orphaned nodes',
    summary: 'When all supporting edges of a node are retracted (source_quanta cascade), an EXISTENCE Hypothesis must be created to flag that the entity may no longer be valid.',
    modality: 'SHOULD',
    scope: ['knowledge', 'tier1', 'hypothesis', 'retraction'],
    rationale: 'Nodes without any supporting evidence are epistemically invalid but should not be auto-deleted. The EXISTENCE hypothesis creates a review queue item.',
    examples: ['retractByQuantum(q1) → all edges of NodeX retracted → createHypothesis(EXISTENCE, nodeX)'],
    antiPatterns: ['Auto-deleting nodes when all edges are retracted', 'Silently leaving orphaned nodes without flagging'],
  },
];

async function seed() {
  console.log('[T1-seed] Seeding Tier 1 Codex rules...');
  let created = 0, skipped = 0;

  for (const rule of rules) {
    try {
      const existing = await memgraph.runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r',
        { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      await memgraph.runQuery(
        `CREATE (r:CodexRule {
           id: $id, codexId: $codexId, namespace: 'Codex', nodeType: 'CodexRule',
           title: $title, summary: $summary, modality: $modality, scope: $scope,
           tier: 'T1', status: 'ACTIVE', rationale: $rationale,
           examples: $examples, antiPatterns: $antiPatterns,
           createdAt: $now, updatedAt: $now
         })`,
        {
          id:           uuidv4(),
          now:          new Date().toISOString(),
          codexId:      rule.codexId,
          title:        rule.title,
          summary:      rule.summary,
          modality:     rule.modality,
          scope:        JSON.stringify(rule.scope),
          rationale:    rule.rationale,
          examples:     JSON.stringify(rule.examples),
          antiPatterns: JSON.stringify(rule.antiPatterns),
        }
      );
      console.log(`  ✓ ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      console.error(`  ERR ${rule.codexId}: ${err.message}`);
    }
  }

  console.log(`[T1-seed] Done — created: ${created}, skipped: ${skipped}`);
  process.exit(0);
}

seed().catch(err => { console.error('[T1-seed] Error:', err.message); process.exit(1); });
