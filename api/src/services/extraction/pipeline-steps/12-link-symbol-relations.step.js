'use strict';

/**
 * Step 12 — Symbol-Derived Document Relations
 *
 * A UN document symbol suffix deterministically implies a relation to its base
 * document: an addendum (/Add.N), corrigendum (/Corr.N), revision (/Rev.N) or
 * amendment (/Amend.N). This step parses the current document's symbol and, if
 * it carries such a suffix, materializes a typed edge to the base document:
 *
 *   /Add.N  → (base)-[:HAS_ADDENDUM]->(this)
 *   /Corr.N → (this)-[:CORRECTS]->(base)
 *   /Rev.N  → (this)-[:REVISES]->(base)
 *   /Amend.N→ (this)-[:AMENDS]->(base)
 *
 * confidence = 1.0, source = 'SYMBOL_DERIVED' (no AI needed). If the base
 * document is not yet in the system, the relation is parked on this document as
 * pendingSymbolRelationsJson and drained on import (see source-catalog.service).
 *
 * Non-fatal: DOCUMENT mode only; errors never fail the pipeline.
 */

const { addLog, startStep, completeStep } = require('../pipeline-context');
const { parseUNSymbol, deriveSymbolRelations } = require('../../knowledge/source-adapters/lib/symbol-parser');

// Edge labels this step is allowed to create (guards the interpolated label).
const ALLOWED_REL = new Set(['HAS_ADDENDUM', 'CORRECTS', 'REVISES', 'AMENDS', 'REISSUES']);

module.exports = async function linkSymbolRelationsStep(ctx) {
  startStep(ctx, 'link-symbol-relations');
  try {
    if (ctx.mode !== 'DOCUMENT') {
      completeStep(ctx, 'link-symbol-relations', { skipped: 'non-document mode' });
      return;
    }

    const mg = require('../../memgraph.service');

    // Resolve this document's symbol (prefer node value, fall back to sourceRef).
    let symbol = ctx.sourceRef?.unSymbol || null;
    if (!symbol) {
      const rows = await mg.runQuery(
        `MATCH (d:Document {id: $id}) RETURN d.unSymbol AS sym`, { id: ctx.sourceId }
      ).catch(() => []);
      symbol = rows[0]?.sym || null;
    }
    if (!symbol) {
      completeStep(ctx, 'link-symbol-relations', { edges: 0, reason: 'no symbol' });
      return;
    }

    const parsed = parseUNSymbol(symbol);
    const rels = deriveSymbolRelations(parsed);
    if (rels.length === 0) {
      completeStep(ctx, 'link-symbol-relations', { edges: 0, reason: 'no suffix' });
      return;
    }

    const now = new Date().toISOString();
    const thisNorm = parsed.normalized;
    let edges = 0;
    const pending = [];

    for (const rel of rels) {
      if (!ALLOWED_REL.has(rel.relType)) continue;

      // The base document is whichever endpoint is not this document.
      const thisIsSource = rel.sourceSymbol === thisNorm;
      const baseSymbol = thisIsSource ? rel.targetSymbol : rel.sourceSymbol;

      let baseId = null;
      try {
        // EXACT match only. Base symbols are precise (A/62/7); a CONTAINS match
        // would wrongly bind A/62/7 to A/62/794 or A/62/7/Add.18.
        const rows = await mg.runQuery(
          `MATCH (d:Document)
           WHERE d.id <> $selfId
             AND (d.unSymbol = $base OR toLower(d.unSymbol) = toLower($base))
           RETURN d.id AS id LIMIT 1`,
          { base: baseSymbol, selfId: ctx.sourceId }
        );
        baseId = rows[0]?.id || null;
      } catch (e) {
        addLog(ctx, 'link-symbol-relations', `Base lookup failed for ${baseSymbol}: ${e.message}`, 'warn');
      }

      if (!baseId) {
        pending.push({
          relType: rel.relType,
          targetRef: baseSymbol,          // the missing endpoint (base doc)
          thisIsSource,                   // edge orientation once base appears
          suffixType: parsed.suffixType,
          suffixNumber: parsed.suffixNumber,
          detectedAt: now,
        });
        continue;
      }

      const srcId = thisIsSource ? ctx.sourceId : baseId;
      const tgtId = thisIsSource ? baseId : ctx.sourceId;
      try {
        await mg.runQuery(
          `MATCH (src:Document {id: $srcId}), (tgt:Document {id: $tgtId})
           MERGE (src)-[r:${rel.relType} {source: 'SYMBOL_DERIVED'}]->(tgt)
           SET r.relType = $relType, r.confidence = 1.0,
               r.suffixType = $suffixType, r.suffixNumber = $suffixNumber,
               r.evidence = $evidence, r.createdAt = $now, r.extractionJobId = $jobId`,
          {
            srcId, tgtId, relType: rel.relType,
            suffixType: parsed.suffixType,
            suffixNumber: parsed.suffixNumber != null ? parsed.suffixNumber : null,
            evidence: rel.evidence || `Symbol suffix ${parsed.suffix}`,
            now, jobId: ctx.extractionJobId || null,
          }
        );
        edges++;
        addLog(ctx, 'link-symbol-relations', `${rel.relType}: ${rel.sourceSymbol} → ${rel.targetSymbol}`);
      } catch (e) {
        addLog(ctx, 'link-symbol-relations', `Edge ${rel.relType} failed: ${e.message}`, 'warn');
      }
    }

    if (pending.length > 0) {
      await mg.runQuery(
        `MATCH (d:Document {id: $id}) SET d.pendingSymbolRelationsJson = $json`,
        { id: ctx.sourceId, json: JSON.stringify(pending) }
      ).catch(() => {});
      addLog(ctx, 'link-symbol-relations', `${pending.length} symbol relation(s) pending (base not imported)`);
    }

    completeStep(ctx, 'link-symbol-relations', { edges, pending: pending.length });
  } catch (err) {
    addLog(ctx, 'link-symbol-relations', `Step error (non-fatal): ${err.message}`, 'warn');
    completeStep(ctx, 'link-symbol-relations', { error: err.message, edges: 0 });
  }
};
