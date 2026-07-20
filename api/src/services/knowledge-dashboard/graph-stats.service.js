'use strict';

/**
 * Graph Stats Service — aggregated composition of the graph side of the knowledge
 * base for the Knowledge Dashboard. All aggregations run in parallel; heavy
 * per-node degree metrics (maxDegree) are gated behind `heavy` to stay within a
 * few seconds on 1.3M+ nodes (avgDegree is derived from counts, not scanned).
 */

const neo4j = require('neo4j-driver');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }

const num = (v) => (v && typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : Number(v || 0));
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 10000) / 100 : 0);

class GraphStatsService {
    async getGraphStats({ heavy = false, labelLimit = 50, typeLimit = 30 } = {}) {
        const [
            counts, nodesByLabel, relationshipsByType, nsCounts, nsLabels, isolated, temporal, maxDeg,
        ] = await Promise.all([
            this._counts(),
            this._nodesByLabel(labelLimit),
            this._relationshipsByType(typeLimit),
            this._namespaceCounts(),
            this._namespaceLabels(),
            this._isolatedNodes(),
            this._temporal(),
            heavy ? this._maxDegree() : Promise.resolve(null),
        ]);

        const totalNodes = counts.totalNodes;
        const totalRelationships = counts.totalRelationships;

        // avgDegree = total endpoints / nodes = 2 * rels / nodes (cheap, exact).
        const avgDegree = totalNodes > 0 ? Math.round((2 * totalRelationships / totalNodes) * 100) / 100 : 0;

        return {
            timestamp: new Date().toISOString(),
            summary: {
                totalNodes,
                totalRelationships,
                totalLabels: counts.totalLabels,
                totalRelTypes: counts.totalRelTypes,
            },
            nodesByLabel,
            nodesByNamespace: this._mergeNamespaces(nsCounts, nsLabels),
            relationshipsByType,
            structure: {
                avgDegree,
                maxDegree: maxDeg,
                isolatedNodes: isolated,
                connectedComponents: null, // too expensive on a graph this size
            },
            temporal,
        };
    }

    async _counts() {
        const [nodes, rels, labels, types] = await Promise.all([
            mg().runQuery('MATCH (n) RETURN count(n) AS c'),
            mg().runQuery('MATCH ()-[r]->() RETURN count(r) AS c'),
            mg().runQuery('MATCH (n) UNWIND labels(n) AS l RETURN count(DISTINCT l) AS c'),
            mg().runQuery('MATCH ()-[r]->() RETURN count(DISTINCT type(r)) AS c'),
        ]);
        return {
            totalNodes: num(nodes[0]?.c),
            totalRelationships: num(rels[0]?.c),
            totalLabels: num(labels[0]?.c),
            totalRelTypes: num(types[0]?.c),
        };
    }

    async _nodesByLabel(limit) {
        const rows = await mg().runQuery(
            'MATCH (n) UNWIND labels(n) AS label WITH label, count(*) AS cnt ORDER BY cnt DESC LIMIT $limit RETURN label, cnt',
            { limit: neo4j.int(limit) }
        );
        const total = rows.reduce((s, r) => s + num(r.cnt), 0);
        return rows.map((r) => ({ label: r.label, count: num(r.cnt), percentage: pct(num(r.cnt), total) }));
    }

    async _relationshipsByType(limit) {
        const rows = await mg().runQuery(
            'MATCH ()-[r]->() WITH type(r) AS t, count(*) AS cnt ORDER BY cnt DESC LIMIT $limit RETURN t, cnt',
            { limit: neo4j.int(limit) }
        );
        const total = rows.reduce((s, r) => s + num(r.cnt), 0);
        return rows.map((r) => ({ type: r.t, count: num(r.cnt), percentage: pct(num(r.cnt), total) }));
    }

    async _namespaceCounts() {
        const rows = await mg().runQuery(
            'MATCH (n) WHERE n.namespace IS NOT NULL WITH n.namespace AS ns, count(n) AS c RETURN ns, c ORDER BY c DESC'
        );
        return rows.map((r) => ({ namespace: r.ns, count: num(r.c) }));
    }

    async _namespaceLabels() {
        const rows = await mg().runQuery(
            'MATCH (n) WHERE n.namespace IS NOT NULL UNWIND labels(n) AS l WITH DISTINCT n.namespace AS ns, l RETURN ns, collect(l) AS labels'
        );
        const map = {};
        for (const r of rows) map[r.ns] = r.labels || [];
        return map;
    }

    _mergeNamespaces(counts, labelsByNs) {
        const total = counts.reduce((s, n) => s + n.count, 0);
        return counts.map((n) => ({
            namespace: n.namespace,
            count: n.count,
            percentage: pct(n.count, total),
            labels: labelsByNs[n.namespace] || [],
        }));
    }

    async _isolatedNodes() {
        const rows = await mg().runQuery('MATCH (n) WHERE NOT (n)--() RETURN count(n) AS c');
        return num(rows[0]?.c);
    }

    async _maxDegree() {
        const rows = await mg().runQuery('MATCH (n)-[r]-() WITH n, count(r) AS deg RETURN max(deg) AS m');
        return num(rows[0]?.m);
    }

    async _temporal() {
        const now = Date.now();
        const iso = (ms) => new Date(now - ms).toISOString();
        try {
            // createdAt is mostly ISO strings but some nodes store a temporal type;
            // toString() normalizes both so the lexicographic compare doesn't throw.
            const rows = await mg().runQuery(
                `MATCH (n) WHERE n.createdAt IS NOT NULL
                 WITH toString(n.createdAt) AS ca
                 RETURN sum(CASE WHEN ca >= $d1 THEN 1 ELSE 0 END) AS last24h,
                        sum(CASE WHEN ca >= $d7 THEN 1 ELSE 0 END) AS last7d,
                        sum(CASE WHEN ca >= $d30 THEN 1 ELSE 0 END) AS last30d`,
                { d1: iso(864e5), d7: iso(7 * 864e5), d30: iso(30 * 864e5) }
            );
            return {
                nodesCreatedLast24h: num(rows[0]?.last24h),
                nodesCreatedLast7d: num(rows[0]?.last7d),
                nodesCreatedLast30d: num(rows[0]?.last30d),
            };
        } catch {
            return null;
        }
    }
}

let _instance = null;
function getGraphStatsService() { if (!_instance) _instance = new GraphStatsService(); return _instance; }

module.exports = { GraphStatsService, getGraphStatsService };
