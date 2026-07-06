'use strict';
/**
 * Backfill MARC-derived graph relations for documents ingested before the MARC
 * materialization (TASK-DOC-006/007/008) and edge-copy (TASK-DOC-013) landed.
 *
 * Two phases:
 *   documents        (default) — targeted, high value: for each Document with a
 *                    symbol, find the matching SourceDocument that carries
 *                    marcData, materialize its MARC relations, copy them onto the
 *                    Document, and repair the SourceDocument.importedDocumentId
 *                    link (which an earlier bug left empty for all imports).
 *   source-documents (--phase=source-documents) — bulk: materialize MARC
 *                    relations on every SourceDocument that has marcData
 *                    (harvester-level series/agenda/draft graph). Large (~4.7k).
 *   all              — documents then source-documents.
 *
 * Safe by default: DRY-RUN unless --apply.
 *
 * Usage:
 *   node api/scripts/backfill-marc-relations.js                       # dry-run, documents
 *   node api/scripts/backfill-marc-relations.js --apply               # documents phase
 *   node api/scripts/backfill-marc-relations.js --phase=source-documents --apply
 *   node api/scripts/backfill-marc-relations.js --phase=all --apply
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const neo4j = require('neo4j-driver');
const mg = require('../src/services/memgraph.service');
const { sourceCatalogEnrichmentService: enrich } = require('../src/services/knowledge/source-catalog-enrichment.service');
const { sourceCatalogService: catalog } = require('../src/services/knowledge/source-catalog.service');

const args = process.argv.slice(2);
const getArg = (n, d) => { const h = args.find(a => a.startsWith(`--${n}=`)); return h ? h.split('=')[1] : d; };
const APPLY  = args.includes('--apply');
const PHASE  = getArg('phase', 'documents');
const BATCH  = parseInt(getArg('batch-size', '500'), 10);

function parseMarc(json) {
  try { const m = JSON.parse(json || '{}'); return m && typeof m === 'object' ? m : null; } catch { return null; }
}
function hasRelations(m) {
  return m && ((m.relatedDocs && m.relatedDocs.length) || (m.hierarchy && m.hierarchy.length) || (m.agendaItems && m.agendaItems.length));
}

// ── Phase: documents (targeted, symbol-matched) ──
async function phaseDocuments() {
  console.log('\n── Phase: documents (symbol-matched Document ← SourceDocument marcData) ──');
  const docs = await mg.runQuery(
    `MATCH (d:Document) WHERE d.unSymbol IS NOT NULL AND d.unSymbol <> ''
     RETURN d.id AS id, d.unSymbol AS sym`
  );
  console.log(`  Documents with symbol: ${docs.length}`);

  let matched = 0, materialized = 0, copied = 0, linked = 0;
  const samples = [];

  for (const d of docs) {
    const rows = await mg.runQuery(
      `MATCH (s:SourceDocument)
       WHERE (s.symbol = $sym OR toLower(s.symbol) = toLower($sym))
         AND s.marcData IS NOT NULL AND s.marcData <> ''
       RETURN s.id AS id, s.marcData AS marcData LIMIT 1`,
      { sym: d.sym }
    );
    if (rows.length === 0) continue;
    const marc = parseMarc(rows[0].marcData);
    if (!hasRelations(marc)) continue;
    matched++;
    if (samples.length < 8) {
      samples.push(`${d.sym}: rel=${marc.relatedDocs?.length || 0} series=${marc.hierarchy?.length || 0} agenda=${marc.agendaItems?.length || 0}`);
    }
    if (APPLY) {
      await enrich._materializeMarcRelations(rows[0].id, marc).catch(() => {});
      materialized++;
      await catalog._copyMarcEdgesToDocument(rows[0].id, d.id).catch(() => {});
      copied++;
      // repair the missing SourceDocument → Document link
      await mg.runQuery(
        `MATCH (s:SourceDocument {id: $sid}) SET s.importedDocumentId = coalesce(s.importedDocumentId, $did)`,
        { sid: rows[0].id, did: d.id }
      ).catch(() => {});
      linked++;
    }
  }

  console.log('\n  Sample:');
  samples.forEach(s => console.log(`    ${s}`));
  console.log(`\n  matched (Document↔SourceDoc with MARC relations): ${matched}`);
  if (APPLY) console.log(`  materialized=${materialized}, copied=${copied}, importedDocumentId repaired=${linked}`);
  return { matched, materialized, copied, linked };
}

// ── Phase: source-documents (bulk materialize) ──
async function phaseSourceDocuments() {
  console.log('\n── Phase: source-documents (bulk MARC materialize) ──');
  const total = (await mg.runQuery(
    `MATCH (s:SourceDocument) WHERE s.marcData IS NOT NULL AND s.marcData <> '' RETURN count(s) AS c`
  ))[0]?.c;
  const totalNum = typeof total === 'object' && total.toNumber ? total.toNumber() : Number(total || 0);
  console.log(`  SourceDocuments with marcData: ${totalNum}`);

  let scanned = 0, withRelations = 0, materialized = 0, skip = 0;
  while (true) {
    const rows = await mg.runQuery(
      `MATCH (s:SourceDocument) WHERE s.marcData IS NOT NULL AND s.marcData <> ''
       RETURN s.id AS id, s.marcData AS marcData SKIP $skip LIMIT $limit`,
      { skip: neo4j.int(skip), limit: neo4j.int(BATCH) }
    );
    if (rows.length === 0) break;
    scanned += rows.length;
    for (const r of rows) {
      const marc = parseMarc(r.marcData);
      if (!hasRelations(marc)) continue;
      withRelations++;
      if (APPLY) { await enrich._materializeMarcRelations(r.id, marc).catch(() => {}); materialized++; }
    }
    skip += rows.length;
    process.stdout.write(`\r  scanned=${scanned} withRelations=${withRelations} ${APPLY ? 'materialized=' + materialized : '(dry-run)'}   `);
    if (rows.length < BATCH) break;
  }
  console.log('');
  return { scanned, withRelations, materialized };
}

(async () => {
  console.log(`Backfill MARC relations — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'} | phase: ${PHASE}`);
  const out = {};
  if (PHASE === 'documents' || PHASE === 'all') out.documents = await phaseDocuments();
  if (PHASE === 'source-documents' || PHASE === 'all') out.sourceDocuments = await phaseSourceDocuments();

  console.log(`\n=== Summary (${APPLY ? 'APPLIED' : 'DRY-RUN — re-run with --apply'}) ===`);
  for (const [k, v] of Object.entries(out)) console.log(`  ${k}: ${JSON.stringify(v)}`);
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
