'use strict';

/**
 * Step 11 — Queue Document References + materialize REFERENCES edges
 *
 * After extraction completes, find all DOCUMENTREF entities and look up matching
 * Document nodes in Memgraph. For every match we:
 *   1. Create a Document-[:REFERENCES {relType:'CITES'}]->Document edge
 *      (this document cites the referenced one) — including already-COMPLETED
 *      targets, since a citation to an extracted document is still valid.
 *   2. Re-queue the target for extraction if it hasn't been COMPLETED yet.
 * References whose target is not yet in the system are recorded on the source
 * document as `pendingReferencesJson`, to be drained when the target is imported
 * (mirrors the pendingSupersessionJson pattern in document.adapter.js).
 *
 * Non-fatal: errors are logged but never fail the pipeline.
 */

const { addLog, startStep, completeStep } = require('../pipeline-context');

module.exports = async function queueRefsStep(ctx) {
  startStep(ctx, 'queue-refs');
  try {
    const docRefs = (ctx.entities || []).filter(e => e.type === 'DOCUMENTREF');
    if (docRefs.length === 0) {
      addLog(ctx, 'queue-refs', 'No DOCUMENTREF entities — skipping');
      completeStep(ctx, 'queue-refs', { docRefs: 0, found: 0, queued: 0, edges: 0 });
      return;
    }

    // Unique reference names (AI may extract the same symbol multiple times).
    // Keep the first entity per name for confidence/context (edge evidence).
    const entityByName = new Map();
    for (const e of docRefs) {
      const n = e.name && e.name.trim();
      if (n && n.length >= 2 && !entityByName.has(n)) entityByName.set(n, e);
    }
    const refNames = [...entityByName.keys()];
    addLog(ctx, 'queue-refs', `${docRefs.length} DOCUMENTREF entities → ${refNames.length} unique names`);

    const mg  = require('../../memgraph.service');
    const now = new Date().toISOString();
    const jobId = ctx.extractionJobId || null;

    let found   = 0;
    let queued  = 0;
    let edges   = 0;
    const queuedIds = new Set();  // dedup re-queue within this run
    const edgedIds  = new Set();  // dedup edges within this run
    const pending   = [];         // references with no matching Document yet

    for (const refName of refNames) {
      try {
        const entity = entityByName.get(refName) || {};
        // Match by unSymbol (exact/contains) or documentTitle (contains).
        // NOTE: unlike re-queue, edge creation must include COMPLETED docs, so
        // we do NOT filter on status here — status is used only to gate re-queue.
        const rows = await mg.runQuery(
          `MATCH (d:Document)
           WHERE d.id <> $selfId
             AND d.uploadedAt IS NOT NULL
             AND (
               d.unSymbol = $name
               OR toLower(d.unSymbol) = toLower($name)
               OR d.documentTitle = $name
               OR (d.unSymbol IS NOT NULL AND toLower(d.unSymbol) CONTAINS toLower($name) AND size($name) >= 5)
               OR (d.documentTitle IS NOT NULL AND toLower(d.documentTitle) CONTAINS toLower($name) AND size($name) >= 8)
             )
           RETURN d.id AS id, d.unSymbol AS sym, d.documentTitle AS title, d.status AS status
           LIMIT 3`,
          { name: refName, selfId: ctx.sourceId }
        );

        if (rows.length === 0) {
          // Target not in the system yet — remember for drain-on-import.
          pending.push({
            relType:    'CITES',
            targetRef:  refName,
            confidence: entity.confidence != null ? entity.confidence : 0.8,
            evidence:   (entity.context || entity.match || `Cited as "${refName}"`).slice(0, 300),
            detectedAt: now,
          });
          continue;
        }

        for (const row of rows) {
          found++;

          // 1. Materialize the REFERENCES edge (this doc cites the target).
          if (!edgedIds.has(row.id)) {
            try {
              await mg.runQuery(
                `MATCH (src:Document {id: $srcId}), (tgt:Document {id: $tgtId})
                 MERGE (src)-[r:REFERENCES {relType: 'CITES'}]->(tgt)
                 SET r.confidence      = $conf,
                     r.evidence        = $evidence,
                     r.refSymbol       = $refName,
                     r.extractedAt     = $now,
                     r.extractionJobId = $jobId`,
                {
                  srcId: ctx.sourceId, tgtId: row.id,
                  conf:     entity.confidence != null ? entity.confidence : 0.8,
                  evidence: (entity.context || entity.match || `Cited as "${refName}"`).slice(0, 400),
                  refName, now, jobId,
                }
              );
              edgedIds.add(row.id);
              edges++;
            } catch (edgeErr) {
              addLog(ctx, 'queue-refs', `REFERENCES edge failed for ${row.id}: ${edgeErr.message}`, 'warn');
            }
          }

          // 2. Re-queue for extraction if not COMPLETED (original behavior).
          if (row.status !== 'COMPLETED' && !queuedIds.has(row.id)) {
            try {
              await mg.runQuery(
                `MATCH (d:Document {id: $id})
                 SET d.status = 'CLASSIFIED', d.updatedAt = $now, d.aiExtractedAt = null`,
                { id: row.id, now }
              );
            } catch (statusErr) {
              addLog(ctx, 'queue-refs', `Status reset failed for ${row.id}: ${statusErr.message}`, 'warn');
            }
            try {
              const { enqueueDocument } = require('../unified-queue');
              await enqueueDocument(row.id, {
                source:    'documentref',
                refFromId: ctx.sourceId,
                refSymbol: refName,
              });
              queuedIds.add(row.id);
              queued++;
              addLog(ctx, 'queue-refs',
                `Queued: "${row.sym || row.title || row.id}" (was ${row.status || 'null'}) for ref "${refName}"`);
            } catch (qErr) {
              addLog(ctx, 'queue-refs', `Enqueue failed for ${row.id}: ${qErr.message}`, 'warn');
            }
          }
        }
      } catch (lookupErr) {
        addLog(ctx, 'queue-refs', `Lookup error for "${refName}": ${lookupErr.message}`, 'warn');
      }
    }

    // Persist pending references on the source document (apoc append, JSON fallback).
    if (pending.length > 0) {
      await mg.runQuery(
        `MATCH (d:Document {id: $docId})
         SET d.pendingReferencesJson = coalesce(d.pendingReferencesJson, '[]')
         WITH d, apoc.convert.fromJsonList(d.pendingReferencesJson) AS existing
         SET d.pendingReferencesJson = apoc.convert.toJson(existing + $pending)`,
        { docId: ctx.sourceId, pending }
      ).catch(() => {
        // apoc unavailable — overwrite with this run's pending set
        return mg.runQuery(
          `MATCH (d:Document {id: $docId}) SET d.pendingReferencesJson = $json`,
          { docId: ctx.sourceId, json: JSON.stringify(pending) }
        ).catch(() => {});
      });
      addLog(ctx, 'queue-refs', `${pending.length} reference(s) pending (target not yet imported)`);
    }

    addLog(ctx, 'queue-refs',
      `Done — ${refNames.length} refs searched, ${found} matched, ${edges} edge(s), ${queued} enqueued, ${pending.length} pending`);
    completeStep(ctx, 'queue-refs', {
      docRefs: docRefs.length, unique: refNames.length,
      found, edges, queued, pending: pending.length,
    });

  } catch (err) {
    // Non-fatal — always complete, never throw
    addLog(ctx, 'queue-refs', `Step error (non-fatal): ${err.message}`, 'warn');
    completeStep(ctx, 'queue-refs', { error: err.message, queued: 0, edges: 0 });
  }
};
