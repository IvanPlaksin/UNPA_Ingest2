#!/usr/bin/env node
/**
 * Seed Codex rules for Tier 0 Concepts (T0-001 through T0-010).
 * Run once: node api/scripts/seed-codex-tier0-rules.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const { v4: uuidv4 } = require('uuid');
const memgraph = require('../src/services/memgraph.service');

const rules = [
  {
    codexId: 'CODEX-RULE-T0-001',
    title: 'All semantic edges must have polarity property',
    summary:
      'Every edge representing a knowledge assertion must declare polarity: ' +
      'AFFIRMED (this is true) or NEGATED (this is false). ' +
      'Missing polarity defaults to AFFIRMED but must be set explicitly for any new edge created after this rule.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'edges'],
    rationale: 'Without explicit polarity, negative knowledge is invisible and cannot be used for falsification in ACH.',
    examples: [
      'CREATE (a)-[r:REPORTS_TO {polarity: \'AFFIRMED\'}]->(b)',
      'CREATE (a)-[r:REPORTS_TO {polarity: \'NEGATED\', polarity_confidence: 0.9}]->(b)',
    ],
    antiPatterns: [
      'Creating edges without polarity field',
      'Using boolean "negated: true" instead of polarity enum',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-002',
    title: 'All semantic edges must have recorded_at timestamp',
    summary:
      'recorded_at is the transaction time — when the edge was added to the system. ' +
      'This is NOT valid_from; valid_from is when the fact became true in reality.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'edges'],
    rationale: 'Bitemporal model requires both valid time (when true in reality) and transaction time (when recorded). Without recorded_at, audit and provenance queries are impossible.',
    examples: ['r.recorded_at = datetime()'],
    antiPatterns: [
      'Using valid_from as a proxy for recorded_at',
      'Leaving recorded_at null on new edges',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-003',
    title: 'All semantic edges must have status property',
    summary:
      'status must be one of: ACTIVE (in use), RETRACTED (explicitly withdrawn), SUPERSEDED (replaced by newer version). ' +
      'Default for new edges is ACTIVE.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'edges'],
    rationale: 'Without status, there is no way to distinguish current knowledge from withdrawn knowledge without physically deleting data.',
    examples: ['r.status = \'ACTIVE\'', 'r.status = \'RETRACTED\''],
    antiPatterns: [
      'Deleting edges instead of retracting them',
      'Using status values outside the enum (e.g. "deleted", "archived")',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-004',
    title: 'Retracted edges must have retracted_at and retraction_reason',
    summary:
      'When status=RETRACTED, both retracted_at and retraction_reason are mandatory. ' +
      'This ensures traceability — we always know when and why knowledge was withdrawn.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'retraction'],
    rationale: 'Retraction without metadata is invisible — future analysts cannot distinguish intentional retraction from data corruption.',
    examples: ['r.retracted_at = datetime(), r.retraction_reason = \'Source document revised\''],
    antiPatterns: [
      'Setting status=RETRACTED without retraction_reason',
      'Retracting without recording the quantum that triggered retraction',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-005',
    title: 'Temporal grain must match temporal value presence',
    summary:
      'valid_from_grain must be non-null if and only if valid_from is non-null. ' +
      'Same rule for valid_to / valid_to_grain. ' +
      'Grain specifies precision: EXACT (full datetime), DAY, MONTH, YEAR.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'temporal'],
    rationale: 'Grain without value is meaningless. Value without grain makes temporal precision ambiguous — was 2023-01-01 a day-precision fact or an exact moment?',
    examples: [
      'valid_from: \'2023\', valid_from_grain: \'YEAR\'',
      'valid_from: \'2023-06-15T10:30:00Z\', valid_from_grain: \'EXACT\'',
    ],
    antiPatterns: [
      'Setting valid_from without valid_from_grain',
      'Setting valid_from_grain=\'EXACT\' when valid_from is null',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-006',
    title: 'Contradicting polarities must create POLARITY_CONFLICT hypothesis',
    summary:
      'If both AFFIRMED and NEGATED edges of the same type exist between the same pair of nodes, ' +
      'a Hypothesis(POLARITY_CONFLICT) node must be created. ' +
      'Do not silently resolve the contradiction — surface it for review.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'polarity', 'hypothesis'],
    rationale: 'Contradictions are signals, not errors. They indicate competing evidence and should be tracked for ACH analysis rather than silently discarded.',
    examples: ['detectContradiction(nodeA, nodeB, relationType) → creates Hypothesis:POLARITY_CONFLICT'],
    antiPatterns: [
      'Silently deleting one of the contradicting edges',
      'Overwriting AFFIRMED with NEGATED without creating a conflict record',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-007',
    title: 'Edges with empty source_quanta after quantum retraction must be retracted',
    summary:
      'When a KnowledgeQuantum is retracted, all edges listing it in source_quanta lose that reference. ' +
      'If source_quanta becomes empty (no remaining evidence), the edge must be automatically retracted.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'retraction', 'provenance'],
    rationale: 'An edge with no supporting evidence cannot remain ACTIVE. Evidence-driven retraction ensures the knowledge graph only contains claims with traceable support.',
    examples: ['retractByQuantum(quantumId) → removes from source_quanta → cascades to RETRACTED if empty'],
    antiPatterns: [
      'Keeping edges ACTIVE when source_quanta is empty',
      'Only removing the quantum reference without checking if the edge is now unsupported',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-008',
    title: 'Superseded edges must have superseded_at timestamp',
    summary:
      'When status=SUPERSEDED, superseded_at must be set to the time the new version was created. ' +
      'The original edge is preserved for history; only the new edge should be used for current queries.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'versioning'],
    rationale: 'Version history requires timestamps. Without superseded_at, temporal queries cannot determine which version was active at a given point in time.',
    examples: ['r.status = \'SUPERSEDED\', r.superseded_at = datetime()'],
    antiPatterns: [
      'Deleting old edges when creating superseding edges',
      'Modifying existing edges in-place instead of creating a superseding edge',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-009',
    title: 'NEGATED edges must not be used for positive derivation',
    summary:
      'Edges with polarity=NEGATED assert that a relationship does NOT hold. ' +
      'They must be excluded from traversals that look for positive facts. ' +
      'They are valuable for falsification in ACH (Analysis of Competing Hypotheses).',
    modality: 'MUST NOT',
    scope: ['knowledge', 'tier0', 'polarity', 'queries'],
    rationale: 'Including NEGATED edges in positive traversals produces false conclusions. A NEGATED REPORTS_TO edge means the person does NOT report to the target.',
    examples: [
      'MATCH (a)-[r:REPORTS_TO]->(b) WHERE r.polarity = \'AFFIRMED\' AND r.status = \'ACTIVE\'',
    ],
    antiPatterns: [
      'MATCH (a)-[r:REPORTS_TO]->(b) // missing polarity filter',
      'Treating all edges as positive regardless of polarity',
    ],
  },
  {
    codexId: 'CODEX-RULE-T0-010',
    title: 'Temporal queries must respect valid_from/valid_to bounds',
    summary:
      'Any query asking "what was true at time T" must filter: ' +
      '(valid_from IS NULL OR valid_from <= T) AND (valid_to IS NULL OR valid_to > T). ' +
      'Queries without temporal context implicitly ask for "currently active" edges.',
    modality: 'MUST',
    scope: ['knowledge', 'tier0', 'temporal', 'queries'],
    rationale: 'Without temporal filtering, historical facts are presented as current facts, leading to stale or incorrect conclusions.',
    examples: [
      'WHERE (r.valid_from IS NULL OR r.valid_from <= $now) AND (r.valid_to IS NULL OR r.valid_to > $now)',
    ],
    antiPatterns: [
      'Querying knowledge without temporal filter and presenting results as current facts',
      'Ignoring valid_to when presenting historical analysis',
    ],
  },
];

async function seed() {
  console.log('[T0-seed] Seeding Tier 0 Codex rules...');
  let created = 0;
  let skipped = 0;

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

      const id  = uuidv4();
      const now = new Date().toISOString();

      await memgraph.runQuery(
        `CREATE (r:CodexRule {
           id: $id, codexId: $codexId, namespace: 'Codex', nodeType: 'CodexRule',
           title: $title, summary: $summary, modality: $modality, scope: $scope,
           tier: 'T0', status: 'ACTIVE', rationale: $rationale,
           examples: $examples, antiPatterns: $antiPatterns,
           createdAt: $now, updatedAt: $now
         })`,
        {
          id, now,
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

  console.log(`[T0-seed] Done — created: ${created}, skipped: ${skipped}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('[T0-seed] Error:', err.message);
  process.exit(1);
});
