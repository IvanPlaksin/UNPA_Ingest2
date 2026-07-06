'use strict';

/**
 * MATRIX primitive — cross-tabulation of relationships between entity sets.
 *
 * Input params:
 *   rowEntityIds  {string[]} required — entities forming the rows
 *   colEntityIds  {string[]} optional — entities forming the columns; defaults to rowEntityIds (symmetric)
 *   relTypes      {string[]} optional — relationship types to consider; defaults to all
 *
 * Output (artifact content):
 *   rowEntities: [{entityId, name, type}]
 *   colEntities: [{entityId, name, type}]
 *   cells: [{rowEntityId, colEntityId, directRel: bool, relType?, context?, indirectDegree?}]
 *   summary: { totalCells, directConnections, indirectConnections }
 */

const PRIMITIVE_TYPE = 'MATRIX';

const inputSchema = {
  rowEntityIds: { type: 'array', required: true },
  colEntityIds: { type: 'array' },
  relTypes:     { type: 'array' },
};

let _mg;
function mg() {
  if (!_mg) _mg = require('../../memgraph.service');
  return _mg;
}

function _num(v) {
  if (v === null || v === undefined) return 0;
  return typeof v === 'object' ? (v.low ?? 0) : (v || 0);
}

async function execute(params, _context, _services) {
  const { rowEntityIds = [], colEntityIds, relTypes = [] } = params;

  if (!rowEntityIds.length) throw new Error('MATRIX requires rowEntityIds');

  const colIds = colEntityIds && colEntityIds.length ? colEntityIds : rowEntityIds;
  const allIds = Array.from(new Set([...rowEntityIds, ...colIds]));

  // Fetch entity metadata
  const entityRows = await mg().runQuery(
    `MATCH (e:ESEntity) WHERE e.id IN $ids
     RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS ns`,
    { ids: allIds }
  );
  const entityMap = Object.fromEntries(entityRows.map(r => [r.id, { entityId: r.id, name: r.name, type: r.type, namespace: r.ns }]));

  // Build rel-type filter clause
  const relFilter = relTypes.length
    ? `WHERE r.relType IN $relTypes`
    : '';
  const relParams = relTypes.length ? { relTypes } : {};

  // Fetch all direct edges between row × col sets
  const directRows = await mg().runQuery(
    `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
     WHERE a.id IN $rowIds AND b.id IN $colIds
     ${relFilter}
     RETURN a.id AS fromId, b.id AS toId, r.relType AS relType,
            r.context AS context, r.confidence AS confidence`,
    { rowIds: rowEntityIds, colIds, ...relParams }
  );

  // Also check reverse direction (undirected semantics for matrix)
  const reverseRows = await mg().runQuery(
    `MATCH (b:ESEntity)-[r:ES_RELATED_TO]->(a:ESEntity)
     WHERE b.id IN $colIds AND a.id IN $rowIds
     ${relFilter}
     RETURN b.id AS fromId, a.id AS toId, r.relType AS relType,
            r.context AS context, r.confidence AS confidence`,
    { rowIds: rowEntityIds, colIds, ...relParams }
  );

  // Build direct connection lookup: key = `${rowId}:${colId}`
  const directMap = new Map();
  for (const r of [...directRows, ...reverseRows]) {
    const key = `${r.fromId}:${r.toId}`;
    if (!directMap.has(key)) {
      directMap.set(key, { relType: r.relType, context: r.context || null });
    }
  }

  // Check indirect connections (path length 2) for unconnected pairs
  const indirectMap = new Map();
  const unconnectedPairs = [];
  for (const rowId of rowEntityIds) {
    for (const colId of colIds) {
      if (rowId === colId) continue;
      if (!directMap.has(`${rowId}:${colId}`) && !directMap.has(`${colId}:${rowId}`)) {
        unconnectedPairs.push({ rowId, colId });
      }
    }
  }

  // Batch indirect path check (degree-2 only, to stay fast)
  if (unconnectedPairs.length && unconnectedPairs.length <= 50) {
    for (const { rowId, colId } of unconnectedPairs) {
      const pathCheck = await mg().runQuery(
        `MATCH (a:ESEntity {id: $from})-[:ES_RELATED_TO*1..2]-(b:ESEntity {id: $to})
         RETURN count(*) AS cnt LIMIT 1`,
        { from: rowId, to: colId }
      );
      if (_num(pathCheck[0]?.cnt) > 0) {
        indirectMap.set(`${rowId}:${colId}`, true);
      }
    }
  }

  // Build cells
  const cells = [];
  for (const rowId of rowEntityIds) {
    for (const colId of colIds) {
      if (rowId === colId) {
        cells.push({ rowEntityId: rowId, colEntityId: colId, self: true });
        continue;
      }
      const direct = directMap.get(`${rowId}:${colId}`) || directMap.get(`${colId}:${rowId}`);
      const indirect = !direct && indirectMap.has(`${rowId}:${colId}`);
      cells.push({
        rowEntityId: rowId,
        colEntityId: colId,
        directRel: !!direct,
        relType: direct?.relType || null,
        context: direct?.context || null,
        indirectPath: indirect,
      });
    }
  }

  const directConnections = cells.filter(c => c.directRel).length;
  const indirectConnections = cells.filter(c => c.indirectPath).length;

  const rowEntities = rowEntityIds.map(id => entityMap[id] || { entityId: id, name: id, type: 'UNKNOWN' });
  const colEntities = colIds.map(id => entityMap[id] || { entityId: id, name: id, type: 'UNKNOWN' });

  return {
    content: {
      rowEntities,
      colEntities,
      cells,
      relTypes: relTypes.length ? relTypes : ['all'],
      summary: {
        totalCells: cells.length,
        directConnections,
        indirectConnections,
        noConnection: cells.filter(c => !c.directRel && !c.indirectPath && !c.self).length,
      },
    },
    evidencedBy: allIds,
  };
}

module.exports = { PRIMITIVE_TYPE, inputSchema, execute };
