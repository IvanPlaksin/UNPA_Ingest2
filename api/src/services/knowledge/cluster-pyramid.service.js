'use strict';
/**
 * ClusterPyramidService — builds a multi-level hierarchy of ESCluster nodes
 * over an ESEntity namespace graph.
 *
 * Hierarchy levels:
 *   L0 = ESEntity nodes (already exist, no extra nodes created)
 *   L1 = Leiden/Louvain/LP communities of L0 ESEntities
 *   L2 = communities of L1 clusters (if L1 count >= L2_THRESHOLD)
 *   L3 = communities of L2 clusters (if L2 count >= L3_THRESHOLD)
 *
 * Edges:
 *   (:ESCluster)-[:CONTAINS]->(:ESEntity)              L1 → L0
 *   (:ESCluster)-[:CONTAINS]->(:ESCluster)             L2→L1, L3→L2
 *   (:ESCluster)-[:CLUSTER_LINK {weight}]->(:ESCluster) aggregated per level
 */

const { v4: uuidv4 } = require('uuid');
const { layoutInBbox, computeBbox, layoutGrid } = require('../layout/pyramid-layout.service');

let _mg;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

let _cd;
function cd() {
  if (!_cd) {
    const { CommunityDetector } = require('../graph/community-detector');
    _cd = new CommunityDetector();
  }
  return _cd;
}

// Default canvas size for world coordinates
const DEFAULT_CANVAS = 10000;

const L2_THRESHOLD = 30;
const L3_THRESHOLD = 20;

class ClusterPyramidService {

  /**
   * Build (or rebuild) the full cluster pyramid for a namespace.
   */
  async buildPyramid(namespace, opts = {}) {
    const { minCommunitySize = 2 } = opts;
    const timing = { start: Date.now() };

    await this._purge(namespace);

    // L1 — community detection on ESEntity graph
    const l1Result = await cd().detectESEntity(namespace, { minCommunitySize });
    const l1Clusters = await this._createClustersFromEntities(namespace, l1Result.clusters);
    timing.l1 = Date.now();

    let l2Clusters = [], l3Clusters = [];

    if (l1Clusters.length >= L2_THRESHOLD) {
      const l2Result = await this._detectClusterLevel(namespace, 1, minCommunitySize);
      l2Clusters = await this._createClustersFromClusters(namespace, 2, l2Result.clusters, l1Clusters);
      timing.l2 = Date.now();

      if (l2Clusters.length >= L3_THRESHOLD) {
        const l3Result = await this._detectClusterLevel(namespace, 2, minCommunitySize);
        l3Clusters = await this._createClustersFromClusters(namespace, 3, l3Result.clusters, l2Clusters);
        timing.l3 = Date.now();
      }
    }

    await this._buildAggregatedEdges(namespace, 1);
    if (l2Clusters.length) await this._buildAggregatedEdges(namespace, 2);
    if (l3Clusters.length) await this._buildAggregatedEdges(namespace, 3);

    await this._assignLabels(namespace);

    return {
      method:  l1Result.method,
      levels:  1 + (l2Clusters.length ? 1 : 0) + (l3Clusters.length ? 1 : 0),
      counts:  { l1: l1Clusters.length, l2: l2Clusters.length, l3: l3Clusters.length },
      elapsed: Date.now() - timing.start,
    };
  }

  async getStatus(namespace) {
    const rows = await mg().runQuery(
      `MATCH (c:ESCluster {namespace: $namespace})
       RETURN c.level AS level, count(c) AS cnt, max(c.createdAt) AS lastBuilt
       ORDER BY level`,
      { namespace }
    );
    if (!rows.length) return { exists: false };
    return {
      exists:    true,
      levels:    rows.map(r => ({
        level: _val(r.level),
        count: _val(r.cnt),
      })),
      lastBuilt: rows[rows.length - 1].lastBuilt || null,
    };
  }

  // ─── Internal ────────────────────────────────────────────────

  async _purge(namespace) {
    await mg().runQuery(
      `MATCH (c:ESCluster {namespace: $namespace}) DETACH DELETE c`,
      { namespace }
    );
  }

  // Create L1 ESCluster nodes, each containing ESEntity members
  async _createClustersFromEntities(namespace, communities) {
    const ts  = new Date().toISOString();
    const created = [];

    for (const comm of communities) {
      const id = uuidv4();

      // Dominant entity type
      let dominantType = 'UNKNOWN';
      if (comm.nodes.length) {
        const typesRes = await mg().runQuery(
          `MATCH (e:ESEntity) WHERE e.id IN $ids RETURN e.type AS t, count(*) AS cnt ORDER BY cnt DESC LIMIT 1`,
          { ids: comm.nodes }
        );
        dominantType = typesRes[0]?.t || 'UNKNOWN';
      }

      await mg().runQuery(
        `CREATE (c:ESCluster {
           id: $id, namespace: $namespace, level: 1,
           memberCount: $mc, dominantType: $dominantType,
           label: $label, cx: null, cy: null, createdAt: $ts
         })`,
        { id, namespace, mc: comm.nodes.length, dominantType, label: String(comm.communityId), ts }
      );

      // CONTAINS → ESEntity
      for (const nodeId of comm.nodes) {
        await mg().runQuery(
          `MATCH (c:ESCluster {id: $clusterId}), (e:ESEntity {id: $entityId})
           MERGE (c)-[:CONTAINS]->(e)`,
          { clusterId: id, entityId: nodeId }
        ).catch(() => {});
      }

      created.push({ id, level: 1, memberCount: comm.nodes.length });
    }

    return created;
  }

  // Create L2/L3 ESCluster nodes, each containing child ESCluster members
  async _createClustersFromClusters(namespace, level, communities, childClusterMap) {
    const ts  = new Date().toISOString();
    const created = [];

    // Build index: communityId position → child cluster id
    const childIds = childClusterMap.map(c => c.id);

    for (const comm of communities) {
      const id = uuidv4();

      await mg().runQuery(
        `CREATE (c:ESCluster {
           id: $id, namespace: $namespace, level: $level,
           memberCount: $mc, dominantType: 'CLUSTER',
           label: $label, cx: null, cy: null, createdAt: $ts
         })`,
        { id, namespace, level, mc: comm.nodes.length, label: String(comm.communityId), ts }
      );

      // CONTAINS → child ESCluster
      for (const childId of comm.nodes) {
        // comm.nodes contains child cluster ids (strings from LP output)
        await mg().runQuery(
          `MATCH (parent:ESCluster {id: $parentId}), (child:ESCluster {id: $childId})
           MERGE (parent)-[:CONTAINS]->(child)`,
          { parentId: id, childId }
        ).catch(() => {});
      }

      created.push({ id, level, memberCount: comm.nodes.length });
    }

    return created;
  }

  // Detect communities of ESCluster nodes at a given level using JS LP
  async _detectClusterLevel(namespace, level, minSize) {
    const clusterRows = await mg().runQuery(
      `MATCH (c:ESCluster {namespace: $namespace, level: $level}) RETURN c.id AS id`,
      { namespace, level }
    );

    // Co-membership adjacency: two L{level} clusters adjacent if they share any entity edge
    const edgeRows = await mg().runQuery(
      level === 1
        ? `MATCH (a:ESCluster {namespace: $namespace, level: 1})-[:CONTAINS]->(ae:ESEntity)
           MATCH (b:ESCluster {namespace: $namespace, level: 1})-[:CONTAINS]->(be:ESEntity)
           WHERE a.id <> b.id
           MATCH (ae)-[:ES_RELATED_TO]-(be)
           RETURN DISTINCT a.id AS src, b.id AS tgt`
        : `MATCH (a:ESCluster {namespace: $namespace, level: $level})-[:CONTAINS]->(ca:ESCluster)
           MATCH (b:ESCluster {namespace: $namespace, level: $level})-[:CONTAINS]->(cb:ESCluster)
           WHERE a.id <> b.id
           MATCH (ca)-[:CLUSTER_LINK]-(cb)
           RETURN DISTINCT a.id AS src, b.id AS tgt`,
      { namespace, level }
    );

    const nodes = clusterRows.map(r => ({ id: r.id, name: r.id, label: 'ESCluster' }));
    const adj   = new Map(nodes.map(n => [n.id, []]));
    for (const e of edgeRows) {
      if (adj.has(e.src) && adj.has(e.tgt)) {
        adj.get(e.src).push(e.tgt);
        adj.get(e.tgt).push(e.src);
      }
    }

    const community = new Map(nodes.map(n => [n.id, n.id]));
    for (let iter = 0; iter < 30; iter++) {
      let changed = false;
      for (const node of [...nodes].sort(() => Math.random() - 0.5)) {
        const neighbors = adj.get(node.id) || [];
        if (!neighbors.length) continue;
        const freq = new Map();
        for (const nb of neighbors) { const c = community.get(nb); freq.set(c, (freq.get(c) || 0) + 1); }
        let best = community.get(node.id), bestCount = 0;
        for (const [c, count] of freq) {
          if (count > bestCount || (count === bestCount && Math.random() > 0.5)) { best = c; bestCount = count; }
        }
        if (best !== community.get(node.id)) { community.set(node.id, best); changed = true; }
      }
      if (!changed) break;
    }

    const groups = new Map();
    for (const [id] of community) {
      const c = community.get(id);
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(id);
    }
    const clusters = [...groups.values()]
      .filter(g => g.length >= minSize)
      .sort((a, b) => b.length - a.length)
      .map((members, idx) => ({ communityId: idx, nodes: members, nodeCount: members.length }));

    return { method: 'label_propagation_cluster', clusters };
  }

  async _buildAggregatedEdges(namespace, level) {
    if (level === 1) {
      await mg().runQuery(`
        MATCH (ca:ESCluster {namespace: $namespace, level: 1})-[:CONTAINS]->(a:ESEntity)
        MATCH (cb:ESCluster {namespace: $namespace, level: 1})-[:CONTAINS]->(b:ESEntity)
        WHERE ca.id <> cb.id
        MATCH (a)-[:ES_RELATED_TO]->(b)
        WITH ca, cb, count(*) AS w
        MERGE (ca)-[l:CLUSTER_LINK]->(cb)
        SET l.weight = w
      `, { namespace }).catch(e => console.warn('[ClusterPyramid] aggEdges L1:', e.message));
    } else {
      await mg().runQuery(`
        MATCH (pa:ESCluster {namespace: $namespace, level: $level})-[:CONTAINS]->(ca:ESCluster)
        MATCH (pb:ESCluster {namespace: $namespace, level: $level})-[:CONTAINS]->(cb:ESCluster)
        WHERE pa.id <> pb.id
        MATCH (ca)-[l:CLUSTER_LINK]->(cb)
        WITH pa, pb, sum(l.weight) AS w
        MERGE (pa)-[ll:CLUSTER_LINK]->(pb)
        SET ll.weight = w
      `, { namespace, level }).catch(e => console.warn('[ClusterPyramid] aggEdges L'+level+':', e.message));
    }
  }

  // ─── PHASE B: Coordinate pipeline ────────────────────────────

  /**
   * Full pipeline: build pyramid + layout in one call.
   */
  async buildAndLayout(namespace, opts = {}) {
    const {
      minCommunitySize = 2,
      resolution       = 1.0,
      canvasWidth      = DEFAULT_CANVAS,
      canvasHeight     = DEFAULT_CANVAS,
    } = opts;
    const buildResult = await this.buildPyramid(namespace, { minCommunitySize, resolution });
    await this.layoutPyramid(namespace, { canvasWidth, canvasHeight });
    return { ...buildResult, layoutComplete: true };
  }

  /**
   * Layout the pyramid top-down, writing x/y (entities) and cx/cy (clusters)
   * into Memgraph. Children are positioned inside their parent's bounding box.
   */
  async layoutPyramid(namespace, opts = {}) {
    const { canvasWidth = DEFAULT_CANVAS, canvasHeight = DEFAULT_CANVAS } = opts;
    const rootBbox = { x: 0, y: 0, width: canvasWidth, height: canvasHeight };

    const topLevel = await this._getTopLevel(namespace);

    if (topLevel === 0) {
      await this._layoutAllEntities(namespace, rootBbox);
      return;
    }

    // Layout top-level clusters globally
    await this._layoutClusterLevel(namespace, topLevel, rootBbox);

    // Walk down: layout children of each cluster inside its bbox
    for (let level = topLevel; level >= 1; level--) {
      const clusters = await this._getClustersAtLevel(namespace, level);
      for (const cluster of clusters) {
        const clusterBbox = this._clusterToBbox(cluster);
        if (level === 1) {
          // Children are ESEntity
          const children  = await this._getEntityChildren(cluster.id);
          const edgeRows  = await this._getEntityEdgesBetween(children.map(c => c.id));
          const inputNodes = children.map(e => ({ id: e.id, width: 180, height: 60 }));
          const laidOut    = await layoutInBbox(inputNodes, edgeRows, clusterBbox, { algorithm: 'stress', padding: 30 });
          await this._saveEntityPositions(laidOut);
        } else {
          // Children are ESCluster
          const children  = await this._getClusterChildren(cluster.id, level - 1);
          const edgeRows  = await this._getClusterLinksBetween(children.map(c => c.id));
          const inputNodes = children.map(c => ({
            id:     c.id,
            width:  _clusterSize(c.memberCount).w,
            height: _clusterSize(c.memberCount).h,
          }));
          const laidOut = await layoutInBbox(inputNodes, edgeRows, clusterBbox, { algorithm: 'stress', padding: 40 });
          await this._saveClusterCentroids(laidOut);
        }
        // Update this cluster's centroid to reflect laid-out children
        const allChildren = level === 1
          ? (await this._getEntityChildren(cluster.id)).map(e => ({ x: e.x || 0, y: e.y || 0, width: 180, height: 60 }))
          : (await this._getClusterChildren(cluster.id, level - 1)).map(c => ({
              x: c.cx || 0, y: c.cy || 0, width: _clusterSize(c.memberCount).w, height: _clusterSize(c.memberCount).h,
            }));
        if (allChildren.length) {
          const bb = computeBbox(allChildren, 0);
          await this._updateClusterCentroid(cluster.id, bb.cx, bb.cy);
        }
      }
    }

    // Entities not in any cluster (singletons filtered by minCommunitySize) go in a strip below main canvas
    await this._layoutOrphanEntities(namespace, canvasWidth, canvasHeight);
  }

  async _getTopLevel(namespace) {
    const rows = await mg().runQuery(
      `MATCH (c:ESCluster {namespace: $namespace}) RETURN max(c.level) AS top`,
      { namespace }
    );
    return _val(rows[0]?.top) || 0;
  }

  async _getClustersAtLevel(namespace, level) {
    return mg().runQuery(
      `MATCH (c:ESCluster {namespace: $namespace, level: $level})
       RETURN c.id AS id, c.cx AS cx, c.cy AS cy, c.memberCount AS memberCount`,
      { namespace, level }
    ).then(rows => rows.map(r => ({
      id:          r.id,
      cx:          _val(r.cx)          || 0,
      cy:          _val(r.cy)          || 0,
      memberCount: _val(r.memberCount) || 1,
    })));
  }

  async _getEntityChildren(clusterId) {
    return mg().runQuery(
      `MATCH (c:ESCluster {id: $id})-[:CONTAINS]->(e:ESEntity)
       RETURN e.id AS id, e.x AS x, e.y AS y`,
      { id: clusterId }
    ).then(rows => rows.map(r => ({ id: r.id, x: _val(r.x), y: _val(r.y) })));
  }

  async _getClusterChildren(clusterId, childLevel) {
    return mg().runQuery(
      `MATCH (parent:ESCluster {id: $id})-[:CONTAINS]->(child:ESCluster {level: $level})
       RETURN child.id AS id, child.cx AS cx, child.cy AS cy, child.memberCount AS memberCount`,
      { id: clusterId, level: childLevel }
    ).then(rows => rows.map(r => ({
      id:          r.id,
      cx:          _val(r.cx)          || 0,
      cy:          _val(r.cy)          || 0,
      memberCount: _val(r.memberCount) || 1,
    })));
  }

  async _getEntityEdgesBetween(entityIds) {
    if (!entityIds.length) return [];
    return mg().runQuery(
      `MATCH (a:ESEntity)-[:ES_RELATED_TO]->(b:ESEntity)
       WHERE a.id IN $ids AND b.id IN $ids
       RETURN a.id AS source, b.id AS target`,
      { ids: entityIds }
    );
  }

  async _getClusterLinksBetween(clusterIds) {
    if (!clusterIds.length) return [];
    return mg().runQuery(
      `MATCH (a:ESCluster)-[:CLUSTER_LINK]->(b:ESCluster)
       WHERE a.id IN $ids AND b.id IN $ids
       RETURN a.id AS source, b.id AS target`,
      { ids: clusterIds }
    );
  }

  async _layoutClusterLevel(namespace, level, bbox) {
    const clusters = await this._getClustersAtLevel(namespace, level);
    if (!clusters.length) return;

    const edges    = await this._getClusterLinksAtLevel(namespace, level);
    const inputNodes = clusters.map(c => ({
      id:     c.id,
      width:  _clusterSize(c.memberCount).w,
      height: _clusterSize(c.memberCount).h,
    }));
    const edgeFmt  = edges.map(e => ({ source: e.source, target: e.target }));

    const laidOut  = await layoutInBbox(inputNodes, edgeFmt, bbox, { algorithm: 'stress', padding: 50 });
    await this._saveClusterCentroids(laidOut);
  }

  async _getClusterLinksAtLevel(namespace, level) {
    return mg().runQuery(
      `MATCH (a:ESCluster {namespace: $namespace, level: $level})-[:CLUSTER_LINK]->(b:ESCluster {namespace: $namespace, level: $level})
       RETURN a.id AS source, b.id AS target`,
      { namespace, level }
    );
  }

  // Layout orphan entities (not contained in any L1 cluster) in a strip below the main canvas
  async _layoutOrphanEntities(namespace, canvasWidth, canvasHeight) {
    const orphans = await mg().runQuery(
      `MATCH (e:ESEntity {namespace: $namespace})
       WHERE NOT ()-[:CONTAINS]->(e)
       RETURN e.id AS id`,
      { namespace }
    );
    if (!orphans.length) return;

    const stripBbox = {
      x:      0,
      y:      canvasHeight + 200,
      width:  canvasWidth,
      height: Math.max(500, orphans.length * 80),
    };
    const inputNodes = orphans.map(e => ({ id: e.id, width: 180, height: 60 }));
    const laidOut    = layoutGrid(inputNodes, stripBbox, 30);
    await this._saveEntityPositions(laidOut);
  }

  async _layoutAllEntities(namespace, bbox) {
    const entities = await mg().runQuery(
      `MATCH (e:ESEntity {namespace: $namespace}) RETURN e.id AS id`,
      { namespace }
    );
    const edges = await mg().runQuery(
      `MATCH (a:ESEntity {namespace: $namespace})-[:ES_RELATED_TO]->(b:ESEntity {namespace: $namespace})
       RETURN a.id AS source, b.id AS target`,
      { namespace }
    );
    const inputNodes = entities.map(e => ({ id: e.id, width: 180, height: 60 }));
    const laidOut = await layoutInBbox(inputNodes, edges, bbox, { algorithm: 'stress', padding: 40 });
    await this._saveEntityPositions(laidOut);
  }

  async _saveEntityPositions(nodes) {
    for (const n of nodes) {
      if (n.id && n.x != null && n.y != null) {
        await mg().runQuery(
          `MATCH (e:ESEntity {id: $id}) SET e.x = $x, e.y = $y`,
          { id: n.id, x: n.x, y: n.y }
        ).catch(() => {});
      }
    }
  }

  async _saveClusterCentroids(nodes) {
    for (const n of nodes) {
      if (n.id && n.x != null && n.y != null) {
        const cx = n.x + (n.width  || 100) / 2;
        const cy = n.y + (n.height ||  50) / 2;
        await this._updateClusterCentroid(n.id, cx, cy);
      }
    }
  }

  async _updateClusterCentroid(id, cx, cy) {
    await mg().runQuery(
      `MATCH (c:ESCluster {id: $id}) SET c.cx = $cx, c.cy = $cy`,
      { id, cx, cy }
    ).catch(() => {});
  }

  _clusterToBbox(cluster) {
    const { w, h } = _clusterSize(cluster.memberCount);
    return {
      x:      (cluster.cx || 0) - w / 2,
      y:      (cluster.cy || 0) - h / 2,
      width:  w,
      height: h,
    };
  }

  async _assignLabels(namespace) {
    const clusters = await mg().runQuery(
      `MATCH (c:ESCluster {namespace: $namespace, level: 1}) RETURN c.id AS id`,
      { namespace }
    );
    for (const { id } of clusters) {
      try {
        const top = await mg().runQuery(`
          MATCH (c:ESCluster {id: $id})-[:CONTAINS]->(e:ESEntity)
          WITH e, size([(e)-[:ES_RELATED_TO]-() | 1]) AS deg
          ORDER BY deg DESC LIMIT 1
          RETURN e.name AS name
        `, { id });
        if (top[0]?.name) {
          await mg().runQuery(`MATCH (c:ESCluster {id: $id}) SET c.label = $label`, { id, label: top[0].name });
        }
      } catch { /* best-effort */ }
    }
  }
}

function _val(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  if (typeof v === 'object' && 'low' in v) return v.low;
  return v;
}

// Cluster bounding box size proportional to sqrt(memberCount)
function _clusterSize(memberCount) {
  const base  = 500;
  const scale = Math.sqrt(Math.max(1, memberCount));
  return { w: Math.round(base * scale), h: Math.round(base * scale * 0.7) };
}

const clusterPyramidService = new ClusterPyramidService();
module.exports = { clusterPyramidService, ClusterPyramidService };
