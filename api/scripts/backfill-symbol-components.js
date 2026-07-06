'use strict';
/**
 * Backfill UN-symbol components on existing Document and SourceDocument nodes.
 *
 * Documents/SourceDocuments ingested before the symbol-parser integration
 * (TASK-DOC-002) have unSymbol/symbol but no parsed components (organCode,
 * seriesCode, baseSymbol, …). This script parses the existing symbol and fills
 * the component properties, enabling the new indexes and symbol-derived edges
 * (TASK-DOC-005) on historical data.
 *
 * Safe by default: DRY-RUN unless --apply is passed. Only fills nodes whose
 * organCode is still NULL (never overwrites).
 *
 * Usage:
 *   node api/scripts/backfill-symbol-components.js                       # dry-run, all
 *   node api/scripts/backfill-symbol-components.js --apply               # write, all
 *   node api/scripts/backfill-symbol-components.js --target=documents --apply
 *   node api/scripts/backfill-symbol-components.js --target=source-documents --batch-size=1000 --apply
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const neo4j = require('neo4j-driver');
const mg = require('../src/services/memgraph.service');
const { parseUNSymbol } = require('../src/services/knowledge/source-adapters/lib/symbol-parser');

// ── CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : def;
};
const APPLY     = args.includes('--apply');
const TARGET    = getArg('target', 'all');          // documents | source-documents | all
const BATCH     = parseInt(getArg('batch-size', '500'), 10);
const MAX       = parseInt(getArg('limit', '0'), 10); // 0 = no cap

const asInt = v => (v == null ? null : neo4j.int(v));

/**
 * Build the component object for a symbol.
 * @param {boolean} useInt - wrap numbers as neo4j ints (Document) or leave plain (SourceDocument)
 */
function components(symbol, useInt) {
  const p = parseUNSymbol(symbol);
  if (!p || !p.organ) return null;
  const num = useInt ? asInt : (v => (v == null ? null : v));
  return {
    organCode:      p.organ || null,
    seriesCode:     p.series || null,
    subBody:        p.subBody || null,
    sessionNumber:  num(p.session),
    documentNumber: num(p.number),
    documentYear:   num(p.year),
    baseSymbol:     p.baseSymbol || null,
    suffixType:     p.suffixType || null,
    suffixNumber:   num(p.suffixNumber),
  };
}

async function backfill(label, symbolProp, useInt) {
  console.log(`\n── ${label} (symbol prop: ${symbolProp}) ──`);
  const total = (await mg.runQuery(
    `MATCH (d:${label}) WHERE d.${symbolProp} IS NOT NULL AND d.${symbolProp} <> '' AND d.organCode IS NULL
     RETURN count(d) AS c`
  ))[0]?.c;
  const totalNum = typeof total === 'object' && total.toNumber ? total.toNumber() : Number(total || 0);
  console.log(`  Candidates (symbol set, organCode NULL): ${totalNum}`);
  if (totalNum === 0) return { scanned: 0, parseable: 0, updated: 0 };

  let scanned = 0, parseable = 0, updated = 0, skip = 0;
  const sampleShown = [];

  while (true) {
    if (MAX && scanned >= MAX) break;
    const limit = MAX ? Math.min(BATCH, MAX - scanned) : BATCH;

    // Unified SKIP-cursor paging: `skip` advances only past rows that STAY in
    // the filter (non-parseable / dry-run). Applied rows get organCode set and
    // drop out of the `organCode IS NULL` filter, so we must NOT skip over them
    // — otherwise the window would run past unprocessed rows or loop forever.
    const rows = await mg.runQuery(
      `MATCH (d:${label})
       WHERE d.${symbolProp} IS NOT NULL AND d.${symbolProp} <> '' AND d.organCode IS NULL
       RETURN d.id AS id, d.${symbolProp} AS symbol
       SKIP $skip LIMIT $limit`,
      { skip: neo4j.int(skip), limit: neo4j.int(limit) }
    );
    if (rows.length === 0) break;
    scanned += rows.length;

    const updates = [];
    for (const r of rows) {
      const c = components(r.symbol, useInt);
      if (!c) continue;
      parseable++;
      updates.push({ id: r.id, ...c });
      if (sampleShown.length < 5) sampleShown.push(`${r.symbol} → ${c.organCode}/${c.seriesCode || '·'} #${c.documentNumber ?? '·'}${c.suffixType ? ' [' + c.suffixType + ']' : ''}`);
    }

    if (APPLY && updates.length > 0) {
      await mg.runQuery(
        `UNWIND $rows AS row
         MATCH (d:${label} {id: row.id})
         SET d.organCode = row.organCode, d.seriesCode = row.seriesCode, d.subBody = row.subBody,
             d.sessionNumber = row.sessionNumber, d.documentNumber = row.documentNumber,
             d.documentYear = row.documentYear, d.baseSymbol = row.baseSymbol,
             d.suffixType = row.suffixType, d.suffixNumber = row.suffixNumber`,
        { rows: updates }
      );
      updated += updates.length;
    }

    // Advance the cursor past rows that remain in the filter this batch:
    // - dry-run: nothing changes → all rows stay → skip += rows.length
    // - apply:   updated rows drop out → only non-updated remain → skip += (rows - updated_this_batch)
    skip += rows.length - (APPLY ? updates.length : 0);

    process.stdout.write(`\r  Progress: scanned=${scanned} parseable=${parseable} ${APPLY ? 'updated=' + updated : '(dry-run)'}   `);
    if (rows.length < limit) break;
  }

  console.log(`\n  Sample:`);
  sampleShown.forEach(s => console.log(`    ${s}`));
  return { scanned, parseable, updated };
}

(async () => {
  console.log(`Backfill symbol components — mode: ${APPLY ? 'APPLY (writing)' : 'DRY-RUN'} | target: ${TARGET} | batch: ${BATCH}${MAX ? ' | limit: ' + MAX : ''}`);

  const results = {};
  if (TARGET === 'documents' || TARGET === 'all') {
    results.documents = await backfill('Document', 'unSymbol', true);
  }
  if (TARGET === 'source-documents' || TARGET === 'all') {
    results.sourceDocuments = await backfill('SourceDocument', 'symbol', false);
  }

  console.log(`\n=== Summary (${APPLY ? 'APPLIED' : 'DRY-RUN — re-run with --apply to write'}) ===`);
  for (const [k, v] of Object.entries(results)) {
    console.log(`  ${k}: scanned=${v.scanned}, parseable=${v.parseable}, updated=${v.updated}`);
  }
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
