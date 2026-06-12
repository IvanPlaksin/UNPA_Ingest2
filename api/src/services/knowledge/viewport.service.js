'use strict';
/**
 * ViewportService — returns the subgraph visible in a given screen bbox at a given LOD level.
 *
 * Algorithm:
 *   1. Count nodes in bbox at requested level
 *   2. If count > budget → auto-escalate to level+1 until count ≤ budget or level=3
 *   3. Return nodes + edges between them (edges capped at EDGE_BUDGET)
 */

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const DEFAULT_NODE_BUDGET = 400;
const EDGE_BUDGET         = 800;

class ViewportService {

  /**
   * @param {Object} params
   * @param {string}  params.namespace
   * @param {Object}  params.bbox     — { minX, minY, maxX, maxY } in world coords
   * @param {number}  params.level    — 0=ESEntity, 1+=ESCluster
   * @param {number}  params.budget   — max nodes to return
   * @returns {Promise<{nodes, edges, meta}>}
   */
  async getViewport({ namespace, bbox, level = 0, budget = DEFAULT_NODE_BUDGET }) {
    const safeBbox = {
      minX: Number(bbox.minX ?? 0),
      minY: Number(bbox.minY ?? 0),
      maxX: Number(bbox.maxX ?? 10000),
      maxY: Number(bbox.maxY ?? 10000),
    };

    // Auto-escalate if too many nodes in bbox at requested level
    let actualLevel = level;
    let countInBbox = await this._countInBbox(namespace, safeBbox, actualLevel);

    while (countInBbox > budget && actualLevel < 3) {
      actualLevel++;
      countInBbox = await this._countInBbox(namespace, safeBbox, actualLevel);
    }

    const nodes = await this._getNodesInBbox(namespace, safeBbox, actualLevel, budget);
    const ids   = nodes.map(n => n.id);
    const edges = await this._getEdgesBetween(ids, actualLevel, EDGE_BUDGET);

    return {
      nodes,
      edges,
      meta: {
        namespace,
        requestedLevel: level,
        actualLevel,
        countInBbox,
        returnedCount:  nodes.length,
        budgetExceeded: actualLevel !== level,
        bbox:           safeBbox,
      },
    };
  }

  /**
   * Return children of a cluster (ESEntity or ESCluster level-1).
   */
  async expandCluster(clusterId) {
    const children = await mg().runQuery(
      `MATCH (c:ESCluster {id: $id})-[:CONTAINS]->(child)
       RETURN child.id AS id, labels(child) AS lbls,
              child.name AS name, child.type AS type, child.namespace AS namespace,
              child.description AS description, child.epistemicLayer AS epistemicLayer,
              child.x AS x, child.y AS y,
              child.level AS level, child.label AS clusterLabel,
              child.memberCount AS memberCount, child.dominantType AS dominantType,
              child.cx AS cx, child.cy AS cy`,
      { id: clusterId }
    );

    const nodes = children.map(r => {
      const isEntity = (r.lbls || []).includes('ESEntity');
      return isEntity ? _entityRow(r) : _clusterRow(r);
    });

    const ids   = nodes.map(n => n.id);
    const isEntityLevel = nodes.length && nodes[0].type === 'entity';
    const edges = await this._getEdgesBetween(ids, isEntityLevel ? 0 : 1, EDGE_BUDGET);

    return { nodes, edges, parentId: clusterId };
  }

  // ─── Internal ────────────────────────────────────────────────

  async _countInBbox(namespace, bbox, level) {
    if (level === 0) {
      const rows = await mg().runQuery(
        `MATCH (e:ESEntity {namespace: $namespace})
         WHERE e.x >= $minX AND e.x <= $maxX AND e.y >= $minY AND e.y <= $maxY
         RETURN count(e) AS cnt`,
        { namespace, ...bbox }
      );
      return _val(rows[0]?.cnt) ?? 0;
    } else {
      const rows = await mg().runQuery(
        `MATCH (c:ESCluster {namespace: $namespace, level: $level})
         WHERE c.cx >= $minX AND c.cx <= $maxX AND c.cy >= $minY AND c.cy <= $maxY
         RETURN count(c) AS cnt`,
        { namespace, level, ...bbox }
      );
      return _val(rows[0]?.cnt) ?? 0;
    }
  }

  async _getNodesInBbox(namespace, bbox, level, limit) {
    const neo4jLimit = require('neo4j-driver').int(limit);

    if (level === 0) {
      const rows = await mg().runQuery(
        `MATCH (e:ESEntity {namespace: $namespace})
         WHERE e.x >= $minX AND e.x <= $maxX AND e.y >= $minY AND e.y <= $maxY
         RETURN e.id AS id, e.name AS name, e.type AS type, e.namespace AS namespace,
                e.description AS description, e.epistemicLayer AS epistemicLayer,
                e.x AS x, e.y AS y, e.mentionCount AS mentionCount
         ORDER BY e.x
         LIMIT $limit`,
        { namespace, ...bbox, limit: neo4jLimit }
      );
      return rows.map(_entityRow);
    } else {
      const rows = await mg().runQuery(
        `MATCH (c:ESCluster {namespace: $namespace, level: $level})
         WHERE c.cx >= $minX AND c.cx <= $maxX AND c.cy >= $minY AND c.cy <= $maxY
         RETURN c.id AS id, c.label AS clusterLabel, c.level AS level,
                c.memberCount AS memberCount, c.dominantType AS dominantType,
                c.cx AS cx, c.cy AS cy
         ORDER BY c.memberCount DESC
         LIMIT $limit`,
        { namespace, level, ...bbox, limit: neo4jLimit }
      );
      return rows.map(_clusterRow);
    }
  }

  async _getEdgesBetween(ids, level, limit) {
    if (!ids.length) return [];
    const neo4jLimit = require('neo4j-driver').int(limit);

    if (level === 0) {
      return mg().runQuery(
        `MATCH (a:ESEntity)-[r:ES_RELATED_TO]->(b:ESEntity)
         WHERE a.id IN $ids AND b.id IN $ids
         RETURN a.id AS source, b.id AS target, r.relType AS label, r.confidence AS confidence
         LIMIT $limit`,
        { ids, limit: neo4jLimit }
      ).then(rows => rows.map((r, i) => ({
        id:         `e${i}`,
        source:     r.source,
        target:     r.target,
        label:      r.label || 'RELATED_TO',
        confidence: _val(r.confidence),
      })));
    } else {
      return mg().runQuery(
        `MATCH (a:ESCluster)-[r:CLUSTER_LINK]->(b:ESCluster)
         WHERE a.id IN $ids AND b.id IN $ids
         RETURN a.id AS source, b.id AS target, r.weight AS weight
         ORDER BY r.weight DESC
         LIMIT $limit`,
        { ids, limit: neo4jLimit }
      ).then(rows => rows.map((r, i) => ({
        id:     `ce${i}`,
        source: r.source,
        target: r.target,
        weight: _val(r.weight),
      })));
    }
  }
}

// ─── Row mappers ─────────────────────────────────────────────────────────────

function _entityRow(r) {
  return {
    id:             r.id,
    type:           'entity',
    entityType:     (r.type || 'CONCEPT').toUpperCase(),
    label:          r.name || r.id,
    x:              _val(r.x)  ?? 0,
    y:              _val(r.y)  ?? 0,
    namespace:      r.namespace,
    description:    r.description  || null,
    epistemicLayer: r.epistemicLayer || null,
    mentionCount:   _val(r.mentionCount) ?? 0,
  };
}

function _clusterRow(r) {
  return {
    id:           r.id,
    type:         'cluster',
    level:        _val(r.level) ?? 1,
    label:        r.clusterLabel || r.id,
    x:            _val(r.cx) ?? 0,
    y:            _val(r.cy) ?? 0,
    memberCount:  _val(r.memberCount) ?? 0,
    dominantType: r.dominantType || 'UNKNOWN',
    expandable:   true,
  };
}

function _val(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  if (typeof v === 'object' && 'low' in v) return v.low;
  return v;
}

const viewportService = new ViewportService();
module.exports = { viewportService, ViewportService };
