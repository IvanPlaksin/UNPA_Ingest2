'use strict';

/**
 * Seed script — apply Investigation Memgraph schema (constraints + indexes).
 * Run once after first deploy or when schema changes.
 * Safe to re-run: CREATE CONSTRAINT and CREATE INDEX are idempotent on Memgraph.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

let _mg = null;
function mg() {
  if (!_mg) _mg = require('../src/services/memgraph.service');
  return _mg;
}

const STATEMENTS = [
  // InvestigationSession
  'CREATE CONSTRAINT ON (s:InvestigationSession) ASSERT s.sessionId IS UNIQUE',
  'CREATE INDEX ON :InvestigationSession(parentSessionId)',
  'CREATE INDEX ON :InvestigationSession(status)',
  'CREATE INDEX ON :InvestigationSession(createdBy)',
  'CREATE INDEX ON :InvestigationSession(createdAt)',

  // InvestigationVersion
  'CREATE CONSTRAINT ON (v:InvestigationVersion) ASSERT v.versionId IS UNIQUE',
  'CREATE INDEX ON :InvestigationVersion(sessionId)',
  'CREATE INDEX ON :InvestigationVersion(type)',
  'CREATE INDEX ON :InvestigationVersion(kbSnapshotId)',
  'CREATE INDEX ON :InvestigationVersion(parentVersionId)',
  'CREATE INDEX ON :InvestigationVersion(createdAt)',

  // InvestigationStep
  'CREATE CONSTRAINT ON (s:InvestigationStep) ASSERT s.stepId IS UNIQUE',
  'CREATE INDEX ON :InvestigationStep(sessionId)',
  'CREATE INDEX ON :InvestigationStep(versionId)',
  'CREATE INDEX ON :InvestigationStep(primitiveType)',
  'CREATE INDEX ON :InvestigationStep(prevStepId)',
  'CREATE INDEX ON :InvestigationStep(status)',
  'CREATE INDEX ON :InvestigationStep(createdAt)',

  // InvestigationArtifact
  'CREATE CONSTRAINT ON (a:InvestigationArtifact) ASSERT a.artifactId IS UNIQUE',
  'CREATE INDEX ON :InvestigationArtifact(sessionId)',
  'CREATE INDEX ON :InvestigationArtifact(versionId)',
  'CREATE INDEX ON :InvestigationArtifact(stepId)',
  'CREATE INDEX ON :InvestigationArtifact(primitiveType)',
  'CREATE INDEX ON :InvestigationArtifact(createdAt)',
];

async function run() {
  const db = mg();
  let ok = 0;
  let skipped = 0;

  for (const stmt of STATEMENTS) {
    try {
      await db.queryWithNamespace(stmt, {});
      console.log(`✓ ${stmt}`);
      ok++;
    } catch (e) {
      // Already exists — safe to skip
      if (e.message && (e.message.includes('already exists') || e.message.includes('duplicate'))) {
        console.log(`~ (already exists) ${stmt}`);
        skipped++;
      } else {
        console.error(`✗ FAILED: ${stmt}\n  ${e.message}`);
      }
    }
  }

  console.log(`\nDone: ${ok} applied, ${skipped} skipped`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
