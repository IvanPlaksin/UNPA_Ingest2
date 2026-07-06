'use strict';
/**
 * Backfill symbol-derived document relations (HAS_ADDENDUM / CORRECTS / REVISES
 * / AMENDS) for Documents already in the graph that carry a suffix (Add./Corr./
 * Rev./Amend.). Mirrors pipeline step 12 for historical data.
 *
 * Safe by default: DRY-RUN unless --apply. When the base document is missing,
 * the relation is parked on the suffix document as pendingSymbolRelationsJson.
 *
 * Usage:
 *   node api/scripts/backfill-symbol-relations.js            # dry-run
 *   node api/scripts/backfill-symbol-relations.js --apply    # write edges
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mg = require('../src/services/memgraph.service');
const { parseUNSymbol, deriveSymbolRelations } = require('../src/services/knowledge/source-adapters/lib/symbol-parser');

const APPLY = process.argv.includes('--apply');
const ALLOWED = new Set(['HAS_ADDENDUM', 'CORRECTS', 'REVISES', 'AMENDS', 'REISSUES']);

(async () => {
  console.log(`Backfill symbol relations — mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const docs = await mg.runQuery(
    `MATCH (d:Document)
     WHERE d.suffixType IS NOT NULL AND d.unSymbol IS NOT NULL
     RETURN d.id AS id, d.unSymbol AS sym`
  );
  console.log(`Suffix documents: ${docs.length}`);

  let edges = 0, pending = 0, noBase = 0;
  const now = new Date().toISOString();
  const samples = [];

  for (const d of docs) {
    const parsed = parseUNSymbol(d.sym);
    const rels = deriveSymbolRelations(parsed).filter(r => ALLOWED.has(r.relType));
    const thisNorm = parsed.normalized;

    for (const rel of rels) {
      const thisIsSource = rel.sourceSymbol === thisNorm;
      const baseSymbol = thisIsSource ? rel.targetSymbol : rel.sourceSymbol;

      // EXACT match only (see step 12) — CONTAINS would mis-bind base symbols.
      const rows = await mg.runQuery(
        `MATCH (b:Document)
         WHERE b.id <> $selfId
           AND (b.unSymbol = $base OR toLower(b.unSymbol) = toLower($base))
         RETURN b.id AS id, b.unSymbol AS sym LIMIT 1`,
        { base: baseSymbol, selfId: d.id }
      );
      const baseId = rows[0]?.id || null;

      if (!baseId) {
        noBase++;
        if (APPLY) {
          await mg.runQuery(
            `MATCH (x:Document {id: $id}) SET x.pendingSymbolRelationsJson =
               apoc.convert.toJson(coalesce(apoc.convert.fromJsonList(x.pendingSymbolRelationsJson), []) + [$entry])`,
            { id: d.id, entry: { relType: rel.relType, targetRef: baseSymbol, thisIsSource, suffixType: parsed.suffixType, suffixNumber: parsed.suffixNumber, detectedAt: now } }
          ).catch(async () => {
            await mg.runQuery(
              `MATCH (x:Document {id: $id}) SET x.pendingSymbolRelationsJson = $json`,
              { id: d.id, json: JSON.stringify([{ relType: rel.relType, targetRef: baseSymbol, thisIsSource, suffixType: parsed.suffixType, suffixNumber: parsed.suffixNumber, detectedAt: now }]) }
            ).catch(() => {});
          });
          pending++;
        }
        continue;
      }

      if (samples.length < 8) samples.push(`${rel.sourceSymbol} -[:${rel.relType}]-> ${rel.targetSymbol}` + (baseId ? '' : ' (pending)'));

      if (APPLY) {
        const srcId = thisIsSource ? d.id : baseId;
        const tgtId = thisIsSource ? baseId : d.id;
        await mg.runQuery(
          `MATCH (src:Document {id: $srcId}), (tgt:Document {id: $tgtId})
           MERGE (src)-[r:${rel.relType} {source: 'SYMBOL_DERIVED'}]->(tgt)
           SET r.relType = $relType, r.confidence = 1.0,
               r.suffixType = $suffixType, r.suffixNumber = $suffixNumber,
               r.createdAt = $now, r.backfilled = true`,
          { srcId, tgtId, relType: rel.relType, suffixType: parsed.suffixType, suffixNumber: parsed.suffixNumber, now }
        ).catch(e => console.warn(`  edge ${rel.relType} failed:`, e.message.split('\n')[0]));
        edges++;
      } else {
        edges++; // would-create count
      }
    }
  }

  console.log('\nSample:');
  samples.forEach(s => console.log('  ' + s));
  console.log(`\n=== Summary (${APPLY ? 'APPLIED' : 'DRY-RUN'}) ===`);
  console.log(`  edges ${APPLY ? 'created' : 'would-create'}: ${edges}`);
  console.log(`  base not found: ${noBase}${APPLY ? ` (parked as pending: ${pending})` : ''}`);
  process.exit(0);
})().catch(e => { console.error('ERR', e); process.exit(1); });
