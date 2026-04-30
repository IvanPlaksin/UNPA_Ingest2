/**
 * Migration 003 — Codex Rules: DevDialogue Governance (DLG-001..006)
 *
 * Usage: node api/src/core/aopeg/plugins/dialogue/migrations/003-codex-rules.js
 */

'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../../../.env') });

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../../../../../services/memgraph.service');
  return _mg;
}

const DLG_RULES = [
  {
    codexId: 'CODEX-RULE-DLG-001',
    title: 'Processing Round Required',
    summary: 'All DialogueSession nodes MUST have processingRound from ProvenanceService for traceability. Sessions without processingRound cannot be reliably traced to the ingestion run that created them.',
    modality: 'MUST',
    scope: ['dialogue', 'data-integrity', 'provenance'],
    category: 'data-integrity',
    severity: 'error',
    enforcement: 'automated',
    derivesFrom: 'PRINCIPLE-0-2',
    rationale: 'Provenance traceability is required for audit and incremental re-processing.',
    examples: ['ProvenanceService.getOrCreate() must be called before dialogueStoreExecutor'],
    antiPatterns: ['Storing DialogueSession without processingRound', 'Setting processingRound to null'],
    validation: 'MATCH (s:DialogueSession) WHERE s.processingRound IS NULL RETURN s.sessionId AS violation',
  },
  {
    codexId: 'CODEX-RULE-DLG-002',
    title: 'Low Confidence Decision Review',
    summary: 'ArchDecision nodes with confidence < 0.5 MUST have status "proposed" and require manual review before being treated as authoritative. Automated pipelines MUST NOT apply low-confidence decisions without human verification.',
    modality: 'MUST',
    scope: ['dialogue', 'decisions', 'quality'],
    category: 'quality',
    severity: 'warning',
    enforcement: 'automated',
    derivesFrom: 'PRINCIPLE-0-4',
    rationale: 'Low-confidence decisions are speculative extractions that may mislead architectural analysis if treated as facts.',
    examples: ['confidence=0.42 → status=proposed, flag for review', 'confidence=0.85 → status=active, usable immediately'],
    antiPatterns: ['Setting status=active for confidence < 0.5', 'Displaying low-confidence decisions without disclaimer'],
    validation: "MATCH (d:ArchDecision) WHERE d.confidence < 0.5 AND d.status <> 'proposed' RETURN d.decisionId AS violation",
  },
  {
    codexId: 'CODEX-RULE-DLG-003',
    title: 'Mandatory Sanitization Before Storage',
    summary: 'All dialogue content MUST pass through dialogue.sanitize executor before graph storage. No API keys, passwords, connection strings, or PII may be stored in Memgraph or Qdrant. Sanitization is non-optional and cannot be bypassed.',
    modality: 'MUST',
    scope: ['dialogue', 'security', 'pipeline'],
    category: 'security',
    severity: 'critical',
    enforcement: 'pipeline',
    derivesFrom: 'PRINCIPLE-0-4',
    rationale: 'Development sessions frequently contain sensitive credentials. A single unsanitized session could expose production secrets.',
    examples: ['dialogueSanitizeExecutor.execute({dialogues}) must precede dialogueStoreExecutor'],
    antiPatterns: ['Calling dialogueStoreExecutor directly without prior sanitize step', 'Storing raw JSONL content in graph properties'],
    validation: "MATCH (s:DialogueSession) WHERE s.title CONTAINS 'sk-' OR s.title CONTAINS 'password=' RETURN s.sessionId AS violation",
  },
  {
    codexId: 'CODEX-RULE-DLG-004',
    title: 'Cross-Namespace Edges via dialogue.link Executor',
    summary: 'Cross-namespace graph edges from the DIALOGUE domain (DISCUSSES→BackLog, FOLLOWS_RULE→CodexRule, REFERENCES_GRAPH→CatalogEntry) MUST be created exclusively through the dialogue.link executor. Direct Cypher writes to create these edges are prohibited.',
    modality: 'MUST',
    scope: ['dialogue', 'architecture', 'graph-integrity'],
    category: 'architecture',
    severity: 'warning',
    enforcement: 'code-review',
    derivesFrom: 'PRINCIPLE-0-2',
    rationale: 'Centralized edge creation ensures consistent validation, deduplication, and provenance tracking for cross-namespace relationships.',
    examples: ['dialogueLinkExecutor.execute({sessionId, linkTypes:[backlog,codex,catalog]})'],
    antiPatterns: ['mg.runQuery("CREATE (s:DialogueSession)-[:DISCUSSES]->(b:BacklogItem...)")', 'Skipping dialogue.link and writing edges directly'],
    validation: null,
  },
  {
    codexId: 'CODEX-RULE-DLG-005',
    title: 'JSONL Backup Before Batch Processing',
    summary: 'Claude Code JSONL session files MUST be backed up before batch processing pipelines. The backup should preserve original filenames and directory structure. DialogueWatcher incremental processing is exempt (files are not modified in place).',
    modality: 'SHOULD',
    scope: ['dialogue', 'operations', 'data-safety'],
    category: 'operations',
    severity: 'warning',
    enforcement: 'manual',
    derivesFrom: 'PRINCIPLE-0-2',
    rationale: 'JSONL files are source of truth. Processing bugs can corrupt references. Backup enables recovery without data loss.',
    examples: ['cp -r ~/.claude/projects /backup/dialogue/$(date +%Y%m%d) before batch-process-all.js'],
    antiPatterns: ['Running batch-process-all.js on production data without backup', 'Deleting or modifying JSONL source files after ingestion'],
    validation: null,
  },
  {
    codexId: 'CODEX-RULE-DLG-006',
    title: 'Canonical Write Order: Memgraph → Qdrant → Redis',
    summary: 'Storage operations for dialogue data MUST follow the canonical write order: (1) Memgraph graph storage, (2) Qdrant vector upsert, (3) Redis state cache. On partial failure, earlier-completed writes must be compensated (saga pattern). This order matches CODEX-POLY §7.1.',
    modality: 'MUST',
    scope: ['dialogue', 'architecture', 'storage', 'saga'],
    category: 'architecture',
    severity: 'error',
    enforcement: 'code-review',
    derivesFrom: 'PRINCIPLE-0-4',
    rationale: 'Memgraph is the system of record; Qdrant and Redis are derived stores. Writing Qdrant before Memgraph can create orphaned vectors with no graph counterpart.',
    examples: ['dialogue.store → dialogue.embed → Redis state', 'On embed failure: compensate by removing Memgraph embeddedAt flag'],
    antiPatterns: ['Writing Qdrant vectors before Memgraph node exists', 'Skipping saga compensation on partial failure'],
    reference: 'CODEX-POLY §7.1, §7.2',
    validation: null,
  },
];

async function seedRules() {
  console.log('=== DevDialogue Codex Rules Migration (DLG-001..006) ===\n');
  let created = 0, skipped = 0, errors = 0;

  for (const rule of DLG_RULES) {
    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r.codexId', { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      const id = uuidv4();
      const now = new Date().toISOString();

      await mg().runQuery(`
        CREATE (r:CodexRule {
          id: $id, codexId: $codexId, namespace: 'Codex', nodeType: 'CodexRule',
          title: $title, summary: $summary, modality: $modality,
          scope: $scope, category: $category, severity: $severity,
          enforcement: $enforcement, validation: $validation, reference: $reference,
          examples: $examples, antiPatterns: $antiPatterns,
          tier: 'M2', status: 'ACTIVE',
          createdAt: $now, updatedAt: $now
        })
      `, {
        id, now,
        codexId: rule.codexId,
        title: rule.title,
        summary: rule.summary,
        modality: rule.modality,
        scope: JSON.stringify(rule.scope),
        category: rule.category,
        severity: rule.severity,
        enforcement: rule.enforcement,
        validation: rule.validation || '',
        reference: rule.reference || '',
        examples: JSON.stringify(rule.examples || []),
        antiPatterns: JSON.stringify(rule.antiPatterns || []),
      });

      // Link to Codex principle if exists
      if (rule.derivesFrom) {
        try {
          await mg().runQuery(`
            MATCH (r:CodexRule {codexId: $ruleId})
            MATCH (p:CodexPrinciple {codexId: $principleId})
            MERGE (r)-[:DERIVES_FROM]->(p)
          `, { ruleId: rule.codexId, principleId: rule.derivesFrom });
        } catch { /* non-fatal — principle may not exist */ }
      }

      console.log(`  OK  ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      console.error(`  ERR ${rule.codexId}: ${err.message}`);
      errors++;
    }
  }

  console.log(`\nResults: ${created} created, ${skipped} skipped, ${errors} errors`);

  // Verify
  console.log('\nVerification:');
  const rows = await mg().runQuery(
    "MATCH (r:CodexRule) WHERE r.codexId STARTS WITH 'CODEX-RULE-DLG' RETURN r.codexId AS id, r.title AS title, r.severity AS severity ORDER BY r.codexId",
    {}
  );
  for (const r of rows) {
    console.log(`  ${r.id} [${r.severity}]: ${r.title}`);
  }
}

async function main() {
  await seedRules();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
