/**
 * Seed Codex Rules — Sigillum (Knowledge Graph Versioning)
 *
 * SIG-001..006: Rules governing the use of the Sigillum versioning system
 * for the UNPA Knowledge Graph.
 */

'use strict';

const { v4: uuidv4 } = require('uuid');

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const SIGILLUM_RULES = [
  {
    codexId: 'CODEX-RULE-SIG-001',
    title: 'Every Significant Graph Change Requires a Snapshot',
    summary: 'After any batch modification to the Knowledge Graph (import, migration, mass update, promotion from WorkSpace), a Sigillum snapshot MUST be created on the main branch before the change is considered complete. The snapshot message MUST describe what changed and why.',
    modality: 'MUST',
    scope: ['sigillum', 'versioning', 'knowledge-graph'],
    derivesFrom: 'CODEX-PRINCIPLE-002',
    rationale: 'Snapshots provide a restore point and audit trail. Without them, catastrophic graph mutations cannot be rolled back or audited.',
    examples: ['After WorkSpace promotion: POST /sigillum/snapshots {branchId, message: "Promoted 12 DraftEntity nodes from ws-abc"}', 'After SQL import: snapshot with message describing data source and record count'],
    antiPatterns: ['Completing an import without creating a snapshot', 'Creating a snapshot without a descriptive message', 'Using empty string as message']
  },
  {
    codexId: 'CODEX-RULE-SIG-002',
    title: 'Sigillum Snapshots Are Append-Only',
    summary: 'SnapshotRecord nodes MUST NEVER be modified or deleted after creation. The versionVector and contentHash stored in a snapshot are immutable. If a snapshot was created in error, create a new corrective snapshot — do not alter the existing one.',
    modality: 'MUST',
    scope: ['sigillum', 'versioning', 'immutability'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Mutating historical snapshots breaks the audit trail and invalidates any SealRecords that reference those snapshots.',
    examples: ['Wrong data imported → create corrective snapshot, not modify old one'],
    antiPatterns: ['UPDATE SnapshotRecord SET versionVector = ...', 'DELETE SnapshotRecord', 'Amending snapshot message after creation']
  },
  {
    codexId: 'CODEX-RULE-SIG-003',
    title: 'Seals Are Used for Certified Releases and Audits',
    summary: 'A SealRecord MUST be created before any certified knowledge export, regulatory audit, or production release. SealType RELEASE is for deployments, AUDIT for compliance, CHECKPOINT for routine backups, EXPORT for data extractions. The verificationHash is recomputed at seal time and must match the snapshot contentHash.',
    modality: 'MUST',
    scope: ['sigillum', 'versioning', 'compliance', 'audit'],
    derivesFrom: 'CODEX-PRINCIPLE-003',
    rationale: 'Seals provide cryptographic proof that the knowledge state was reviewed and certified at a specific point in time.',
    examples: ['Before Elucidarium snapshot export: POST /sigillum/seals {snapshotId, sealType:"EXPORT", certifiedBy:"elucidarium-service"}'],
    antiPatterns: ['Exporting knowledge without creating a seal', 'Using RELEASE seal for routine checkpoints', 'Ignoring seal verification failure']
  },
  {
    codexId: 'CODEX-RULE-SIG-004',
    title: 'Version Vectors Must Cover the Full Namespace',
    summary: 'When creating a namespace snapshot, the VersionVectorService MUST include ALL ACTIVE NodeVersions in that namespace. Partial vectors that omit entities create misleading snapshots. Use computeForNamespace for full coverage; computeForEntities only for explicitly scoped partial snapshots with a clear message indicating scope.',
    modality: 'MUST',
    scope: ['sigillum', 'versioning', 'correctness'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'A partial version vector representing a full namespace creates a false picture of graph state, making diffs misleading.',
    examples: ['Full snapshot: vvs.computeForNamespace("CORE")', 'Partial snapshot: vvs.computeForEntities(entityIds) with message "Partial: FlowDesk workflow nodes only"'],
    antiPatterns: ['computeForEntities without indicating it is partial', 'Snapshot message does not mention scope limitation']
  },
  {
    codexId: 'CODEX-RULE-SIG-005',
    title: 'The Main Branch Must Always Exist',
    summary: 'Each namespace tracked by Sigillum MUST have exactly one BranchRecord with isMain=true. All automated processes (imports, migrations, promotions) MUST write to the main branch unless explicitly creating a feature branch for experimental changes. Use ensureMainBranch() before any automated snapshot creation.',
    modality: 'MUST',
    scope: ['sigillum', 'versioning', 'branches'],
    derivesFrom: 'CODEX-PRINCIPLE-006',
    rationale: 'The main branch is the canonical history of the Knowledge Graph. Without it, automated processes have no well-defined target for snapshots.',
    examples: ['On startup: sigillumService.ensureMainBranch("CORE")', 'Before import snapshot: ensureMainBranch() to get or create main'],
    antiPatterns: ['Creating snapshots without any branch', 'Multiple isMain=true branches for the same namespace', 'Deleting the main branch']
  },
  {
    codexId: 'CODEX-RULE-SIG-006',
    title: 'Snapshot Idempotency Must Be Preserved',
    summary: 'The SigillumService createSnapshot operation MUST be idempotent: if the computed contentHash equals the HEAD snapshot contentHash, no new snapshot is created and changed=false is returned. Callers MUST check the changed flag. This prevents duplicate snapshots for unchanged graph state.',
    modality: 'MUST',
    scope: ['sigillum', 'versioning', 'idempotency'],
    derivesFrom: 'CODEX-PRINCIPLE-001',
    rationale: 'Creating duplicate snapshots for unchanged state bloats history and makes timeline analysis noisy.',
    examples: ['Import produces no new entities → createSnapshot returns {changed: false} → do not log "snapshot created"'],
    antiPatterns: ['Logging "new snapshot" without checking changed flag', 'Forcing snapshot creation despite unchanged state', 'Bypassing idempotency check']
  },
];

async function seedRules() {
  console.log('Seeding Sigillum Codex Rules...\n');
  let created = 0, skipped = 0;

  for (const rule of SIGILLUM_RULES) {
    const id = uuidv4();
    const now = new Date().toISOString();

    try {
      const existing = await mg().runQuery(
        'MATCH (r:CodexRule {codexId: $codexId}) RETURN r', { codexId: rule.codexId }
      );
      if (existing.length > 0) {
        console.log(`  SKIP ${rule.codexId}: already exists`);
        skipped++;
        continue;
      }

      await mg().runQuery(`
        CREATE (r:CodexRule {
          id: $id, codexId: $codexId, namespace: 'Codex', nodeType: 'CodexRule',
          title: $title, summary: $summary, modality: $modality, scope: $scope,
          tier: 'M2', status: 'ACTIVE', rationale: $rationale,
          examples: $examples, antiPatterns: $antiPatterns,
          createdAt: $now, updatedAt: $now
        })
        WITH r
        MATCH (p:CodexPrinciple {codexId: $derivesFrom})
        CREATE (r)-[:DERIVES_FROM]->(p)
        RETURN r.codexId
      `, {
        id, now,
        codexId: rule.codexId, title: rule.title, summary: rule.summary,
        modality: rule.modality, scope: JSON.stringify(rule.scope),
        rationale: rule.rationale,
        examples: JSON.stringify(rule.examples), antiPatterns: JSON.stringify(rule.antiPatterns),
        derivesFrom: rule.derivesFrom,
      });

      console.log(`  OK ${rule.codexId}: ${rule.title}`);
      created++;
    } catch (err) {
      console.error(`  ERR ${rule.codexId}: ${err.message}`);
    }
  }

  console.log(`\nResults: ${created} created, ${skipped} skipped`);
  console.log(`Total Sigillum rules: ${SIGILLUM_RULES.length}`);
}

async function main() {
  await seedRules();
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
