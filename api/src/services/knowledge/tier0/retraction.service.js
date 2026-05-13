'use strict';

const memgraph = require('../../memgraph.service');
const neo4j    = require('neo4j-driver');

async function retract(edgeId, { reason, retractedByQuantum } = {}) {
  if (!reason) throw new Error('retraction reason is required');
  const now = new Date().toISOString();

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     SET r.status               = 'RETRACTED',
         r.retracted_at         = $now,
         r.retraction_reason    = $reason,
         r.retracted_by_quantum = $quantum`,
    {
      edgeId:  neo4j.int(edgeId),
      now,
      reason,
      quantum: retractedByQuantum || null,
    }
  );

  return { success: true, edgeId, retracted_at: now, cascadeTriggered: false };
}

// Remove quantumId from every edge that references it in source_quanta.
// Edges that become empty cascade to RETRACTED status.
async function retractByQuantum(quantumId, reason) {
  if (!quantumId) throw new Error('quantumId is required');

  // Find edges referencing this quantum
  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE $quantumId IN r.source_quanta AND r.status = 'ACTIVE'
     RETURN id(r) AS edgeId, r.source_quanta AS source_quanta`,
    { quantumId }
  );

  const now = new Date().toISOString();
  let edgesAffected = 0;
  let edgesRetracted = 0;

  for (const row of rows) {
    edgesAffected++;
    const remaining = (row.source_quanta || []).filter(q => q !== quantumId);

    if (remaining.length === 0) {
      // Cascade: no more supporting evidence → retract
      await memgraph.runQuery(
        `MATCH ()-[r]->() WHERE id(r) = $edgeId
         SET r.source_quanta        = [],
             r.status               = 'RETRACTED',
             r.retracted_at         = $now,
             r.retraction_reason    = $reason,
             r.retracted_by_quantum = $quantumId`,
        {
          edgeId:    neo4j.int(row.edgeId),
          now,
          reason:    reason || `Source quantum ${quantumId} retracted — edge has no remaining support`,
          quantumId,
        }
      );
      edgesRetracted++;

      // TODO: Check nodes that were connected only by this edge — may become orphans.
      // Create Hypothesis(EXISTENCE) when HypothesisService exists.
    } else {
      await memgraph.runQuery(
        `MATCH ()-[r]->() WHERE id(r) = $edgeId SET r.source_quanta = $remaining`,
        { edgeId: neo4j.int(row.edgeId), remaining }
      );
    }
  }

  return { quantumId, edgesAffected, edgesRetracted };
}

async function isRetracted(edgeId) {
  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId RETURN r.status AS status`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);
  return rows[0].status === 'RETRACTED';
}

async function getRetractedEdges({ namespace, since, limit = 100 } = {}) {
  let cypher = `MATCH (a)-[r]->(b) WHERE r.status = 'RETRACTED'`;
  if (namespace) cypher += ` AND r.namespace = $namespace`;
  if (since)     cypher += ` AND r.retracted_at >= $since`;
  cypher += ` RETURN id(r) AS edgeId, type(r) AS relType,
                     r.retracted_at AS retracted_at,
                     r.retraction_reason AS reason,
                     r.retracted_by_quantum AS quantum
              LIMIT $limit`;

  return memgraph.runQuery(cypher, {
    namespace: namespace || null,
    since:     since     || null,
    limit:     neo4j.int(limit),
  });
}

// Restore a RETRACTED edge. A new source quantum must be provided to re-establish provenance.
async function restore(edgeId, { reason, newSourceQuantum }) {
  if (!newSourceQuantum) throw new Error('newSourceQuantum is required to restore a retracted edge');
  if (!reason)           throw new Error('reason is required to restore an edge');

  const rows = await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId RETURN r.source_quanta AS source_quanta, r.status AS status`,
    { edgeId: neo4j.int(edgeId) }
  );
  if (!rows.length) throw new Error(`Edge ${edgeId} not found`);
  if (rows[0].status !== 'RETRACTED') throw new Error(`Edge ${edgeId} is not retracted (status: ${rows[0].status})`);

  const source_quanta = [...(rows[0].source_quanta || []), newSourceQuantum];

  await memgraph.runQuery(
    `MATCH ()-[r]->() WHERE id(r) = $edgeId
     SET r.status               = 'ACTIVE',
         r.retracted_at         = null,
         r.retraction_reason    = null,
         r.retracted_by_quantum = null,
         r.source_quanta        = $source_quanta`,
    { edgeId: neo4j.int(edgeId), source_quanta }
  );

  return { edgeId, restored: true, source_quanta, reason };
}

module.exports = { retract, retractByQuantum, isRetracted, getRetractedEdges, restore };
