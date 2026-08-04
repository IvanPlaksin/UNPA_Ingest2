#!/usr/bin/env node
/**
 * Indexes the text of already-uploaded sources as searchable chunks.
 *
 * Sources uploaded before Radix R2.3 have their text extracted but never
 * chunked, so retrieval can only see the drafts an extractor produced from them
 * — anything the extractor missed is unreachable. This walks existing
 * SourceReferences and indexes their text.
 *
 * Idempotent: chunk point ids are derived from (sourceRefId, chunkIndex), and
 * each source's previous chunks are cleared before it is re-indexed, so running
 * this twice is the same as running it once.
 *
 * Usage:
 *   node scripts/backfill-source-chunks.js --workspace <id>
 *   node scripts/backfill-source-chunks.js --all
 *   node scripts/backfill-source-chunks.js --workspace <id> --dry-run
 *
 * @module scripts/backfill-source-chunks
 */

'use strict';

require('dotenv').config();

const USAGE = `
Backfill source-text chunks into the workspace vector index

  --workspace <id>   Backfill a single workspace
  --all              Backfill every workspace that has sources
  --dry-run          Report what would be indexed, write nothing
  --max-chunks <n>   Per-source chunk cap (default 500)
  --help             This message
`;

function parseArgs(argv) {
  const args = { dryRun: false, all: false, maxChunks: 500 };
  for (let i = 2; i < argv.length; i += 1) {
    switch (argv[i]) {
      case '--workspace': args.workspace = argv[i + 1]; i += 1; break;
      case '--all': args.all = true; break;
      case '--dry-run': args.dryRun = true; break;
      case '--max-chunks': args.maxChunks = parseInt(argv[i + 1], 10); i += 1; break;
      case '--help': args.help = true; break;
      default: throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (args.help || (!args.workspace && !args.all)) {
    process.stdout.write(USAGE);
    process.exit(args.help ? 0 : 1);
  }

  const memgraph = require('../src/services/memgraph.service');
  const qdrantService = require('../src/services/qdrant.service');
  const teiService = require('../src/services/tei.service');
  const sourceService = require('../src/services/workspace/source.service');
  const { indexSourceChunks } = require('../src/services/radix/indexing/source-chunk-indexer');

  const workspaces = args.all
    ? await memgraph.runQuery(
      `MATCH (w:WorkSpace)-[:HAS_SOURCE]->(:SourceReference)
       RETURN DISTINCT w.id AS id, w.name AS name`, {}
    )
    : [{ id: args.workspace, name: null }];

  process.stdout.write('\nBackfill source chunks\n======================\n');
  if (args.dryRun) process.stdout.write('(dry run — nothing will be written)\n');
  process.stdout.write(`Workspaces: ${workspaces.length}\n\n`);

  let totalSources = 0;
  let totalChunks = 0;
  let totalSkipped = 0;

  for (const ws of workspaces) {
    const sources = await memgraph.runQuery(
      `MATCH (w:WorkSpace {id: $wsId})-[:HAS_SOURCE]->(s:SourceReference)
       RETURN s.id AS id, s.filename AS filename, s.sourceType AS sourceType,
              s.status AS status`,
      { wsId: ws.id }
    );

    process.stdout.write(`${ws.id}${ws.name ? ` (${ws.name})` : ''} — ${sources.length} sources\n`);

    for (const src of sources || []) {
      totalSources += 1;

      if (src.status === 'DELETED') {
        process.stdout.write(`  skip   ${src.filename || src.id} (deleted)\n`);
        totalSkipped += 1;
        continue;
      }

      let text = '';
      try {
        // Reuse the same extraction path the pipeline uses, so a chunk always
        // reflects the text the rest of the system considers authoritative.
        const full = await sourceService.getSource(ws.id, src.id);
        text = await sourceService._extractText(full || src);
      } catch (error) {
        process.stdout.write(`  ERROR  ${src.filename || src.id}: ${error.message}\n`);
        totalSkipped += 1;
        continue;
      }

      if (!text || text.trim().length < 50) {
        process.stdout.write(`  skip   ${src.filename || src.id} (no usable text)\n`);
        totalSkipped += 1;
        continue;
      }

      if (args.dryRun) {
        process.stdout.write(`  would index ${src.filename || src.id} (${text.length} chars)\n`);
        continue;
      }

      const result = await indexSourceChunks({
        workspaceId: ws.id,
        source: src,
        text,
        qdrantService,
        teiService,
        maxChunks: args.maxChunks
      });

      if (result.skipped) {
        process.stdout.write(`  skip   ${src.filename || src.id} (${result.reason})\n`);
        totalSkipped += 1;
      } else {
        totalChunks += result.indexed;
        process.stdout.write(
          `  ok     ${src.filename || src.id} — ${result.indexed} chunks`
          + `${result.truncated ? ' (TRUNCATED)' : ''}\n`
        );
      }
    }
  }

  process.stdout.write(
    `\n${totalSources} sources seen, ${totalChunks} chunks indexed, ${totalSkipped} skipped\n\n`
  );
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`\nBackfill failed: ${error.message}\n${error.stack}\n`);
  process.exit(1);
});
