#!/usr/bin/env node
/**
 * Creates the Memgraph indexes the workspace subsystem needs.
 *
 * Without an index on `:WorkSpace(id)`, the pattern every workspace service
 * opens with — `MATCH (w:WorkSpace {id: $wsId})` — plans as `ScanAll`, i.e. a
 * full pass over every node in the graph. Measured cost on a real workspace:
 * ~190 ms for a point lookup of 20 drafts by id, and it grows with the size of
 * unrelated data (documents, codex, catalog) rather than with the workspace.
 *
 * Draft `id` indexes matter for the same reason: hydration and graph expansion
 * both filter on `d.id IN $ids`, and the draft labels currently carry indexes on
 * `status` and `workspaceId` only.
 *
 * Safe to run repeatedly — an index that already exists is reported and skipped.
 *
 * Usage:
 *   node scripts/create-workspace-indexes.js
 *   node scripts/create-workspace-indexes.js --dry-run
 *
 * @module scripts/create-workspace-indexes
 */

'use strict';

require('dotenv').config();

const memgraph = require('../src/services/memgraph.service');

/** Label → property pairs the workspace subsystem looks up by. */
const INDEXES = [
  // Opens virtually every workspace query.
  ['WorkSpace', 'id'],

  // Hydration and k-hop expansion filter drafts by id.
  ['DraftEntity', 'id'],
  ['DraftRelationship', 'id'],
  ['DraftBusinessRule', 'id'],
  ['DraftSchema', 'id'],
  ['DraftWorkflow', 'id'],
  ['DraftCalculation', 'id'],
  ['DraftConcept', 'id'],
  ['DraftPolicy', 'id'],
  ['DraftDecision', 'id'],
  ['DraftRequirement', 'id'],
  ['DraftAnomaly', 'id'],
  ['DraftAPIContract', 'id'],

  // Provenance resolution joins to the source document.
  ['SourceReference', 'id']
];

async function existingIndexes() {
  const rows = await memgraph.runQuery('SHOW INDEX INFO', {});
  const seen = new Set();
  for (const row of rows || []) {
    const label = row.label;
    const property = Array.isArray(row.property) ? row.property[0] : row.property;
    if (label && property) seen.add(`${label}.${property}`);
  }
  return seen;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  process.stdout.write('\nWorkspace Memgraph indexes\n==========================\n');
  if (dryRun) process.stdout.write('(dry run — nothing will be created)\n');

  const before = await existingIndexes();

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const [label, property] of INDEXES) {
    const key = `${label}.${property}`;
    if (before.has(key)) {
      process.stdout.write(`  exists   ${key}\n`);
      skipped += 1;
      continue;
    }
    if (dryRun) {
      process.stdout.write(`  would create ${key}\n`);
      created += 1;
      continue;
    }
    try {
      // Label/property come from the constant above, never from input.
      await memgraph.runQuery(`CREATE INDEX ON :${label}(${property})`, {});
      process.stdout.write(`  created  ${key}\n`);
      created += 1;
    } catch (error) {
      // Memgraph reports an already-existing index as an error in some versions.
      if (/already exists/i.test(error.message || '')) {
        process.stdout.write(`  exists   ${key}\n`);
        skipped += 1;
      } else {
        process.stdout.write(`  FAILED   ${key}: ${error.message}\n`);
        failed += 1;
      }
    }
  }

  process.stdout.write(
    `\n${created} created, ${skipped} already present, ${failed} failed\n\n`
  );

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  process.stderr.write(`\nFailed: ${error.message}\n`);
  process.exit(1);
});
