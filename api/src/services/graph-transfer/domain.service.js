'use strict';

/**
 * Domain Service — turns the curated DOMAIN_MAP into a live "map" of the graph
 * KB (domains + node counts), domain drill-downs, and ExportRequest builder.
 * Powers the map-first Graph Transfer UI (TASK-GT-UI-001).
 */

const neo4j = require('neo4j-driver');
const { DOMAIN_MAP } = require('../../config/domain-map.config');

let _mg = null;
function mg() { if (!_mg) _mg = require('../memgraph.service'); return _mg; }
let _qd = null;
function qd() { if (!_qd) _qd = require('../qdrant.service'); return _qd; }

const num = (v) => (v && typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : Number(v || 0));

class DomainService {
    /** All labels → count (one scan). */
    async _labelCounts() {
        const rows = await mg().runQuery('MATCH (n) UNWIND labels(n) AS l WITH l, count(*) AS c RETURN l, c');
        const map = {};
        for (const r of rows) map[r.l] = num(r.c);
        return map;
    }

    /**
     * The domain map with live counts. nodeCount is the SUM of the domain's label
     * counts (a multi-label node is rare; exact per-domain distinct counts are on
     * the drill-down). Uncategorized labels are surfaced separately.
     */
    async getDomains() {
        const counts = await this._labelCounts();

        const domains = [];
        for (const cfg of Object.values(DOMAIN_MAP)) {
            let nodeCount = 0;
            const labelBreakdown = {};
            for (const label of cfg.labels) {
                const c = counts[label] || 0;
                if (c > 0) { labelBreakdown[label] = c; nodeCount += c; }
            }
            domains.push({
                id: cfg.id, name: cfg.name, icon: cfg.icon, description: cfg.description,
                color: cfg.color, namespaceHints: cfg.namespaceHints, vectorCollections: cfg.vectorCollections,
                useCatalogTree: !!cfg.useCatalogTree,
                labels: cfg.labels, labelBreakdown, nodeCount,
            });
        }

        const totalNodes = domains.reduce((s, d) => s + d.nodeCount, 0);
        for (const d of domains) d.percentage = totalNodes > 0 ? Math.round((d.nodeCount / totalNodes) * 10000) / 100 : 0;
        domains.sort((a, b) => b.nodeCount - a.nodeCount);

        // Labels not claimed by any domain.
        const claimed = new Set(Object.values(DOMAIN_MAP).flatMap((d) => d.labels));
        const uncategorized = Object.entries(counts)
            .filter(([label]) => !claimed.has(label))
            .map(([label, count]) => ({ label, count }))
            .sort((a, b) => b.count - a.count);

        return {
            domains,
            totalNodes,
            totalDomains: domains.length,
            uncategorizedLabels: uncategorized.slice(0, 25),
            uncategorizedCount: uncategorized.reduce((s, u) => s + u.count, 0),
        };
    }

    /** Single domain drill-down: exact distinct node count, namespace split, vectors. */
    async getDomainDetails(domainId) {
        const cfg = DOMAIN_MAP[domainId];
        if (!cfg) throw new Error('DOMAIN_NOT_FOUND');

        const [distinctRows, nsRows, byLabel] = await Promise.all([
            mg().runQuery('MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels) RETURN count(n) AS c', { labels: cfg.labels }),
            mg().runQuery(
                `MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels)
                 WITH coalesce(n.namespace, '(none)') AS ns, count(n) AS c
                 RETURN ns, c ORDER BY c DESC LIMIT 12`, { labels: cfg.labels }
            ),
            mg().runQuery(
                `MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels)
                 UNWIND labels(n) AS l WITH l, count(*) AS c WHERE l IN $labels
                 RETURN l, c ORDER BY c DESC`, { labels: cfg.labels }
            ),
        ]);

        const labelBreakdown = {};
        for (const r of byLabel) labelBreakdown[r.l] = num(r.c);

        // Vector collection point counts.
        const vectorInfo = { collections: [], hasVectors: false };
        for (const col of cfg.vectorCollections || []) {
            try {
                const info = await qd().client.getCollection(col);
                const pts = info.points_count || 0;
                vectorInfo.collections.push({ name: col, pointsCount: pts });
                if (pts > 0) vectorInfo.hasVectors = true;
            } catch { /* collection absent */ }
        }

        return {
            id: cfg.id, name: cfg.name, icon: cfg.icon, description: cfg.description,
            color: cfg.color, namespaceHints: cfg.namespaceHints, useCatalogTree: !!cfg.useCatalogTree,
            nodeCount: num(distinctRows[0]?.c),
            labelBreakdown,
            namespaceDistribution: nsRows.map((r) => ({ namespace: r.ns, count: num(r.c) })),
            vectorInfo,
        };
    }

    /**
     * Build an ExportRequest (LABELS mode) from selected domains. Unions labels +
     * their vector collections; caller/UI can still tweak policies/filters after.
     */
    buildExportRequest(domainIds = [], options = {}) {
        const labels = new Set();
        const selectedCollections = {};
        for (const id of domainIds) {
            const cfg = DOMAIN_MAP[id];
            if (!cfg) continue;
            cfg.labels.forEach((l) => labels.add(l));
            (cfg.vectorCollections || []).forEach((c) => { selectedCollections[c] = true; });
        }
        return {
            selectionMode: 'LABELS',
            labels: [...labels],
            boundaryPolicy: options.boundaryPolicy || 'STUB',
            vectorPolicy: options.vectorPolicy || 'EMBED_POINTS',
            selectedCollections: { ...selectedCollections, ...(options.selectedCollections || {}) },
            vectorFilters: options.vectorFilters || {},
            ...(options.name ? { name: options.name } : {}),
        };
    }
}

let _instance = null;
function getDomainService() { if (!_instance) _instance = new DomainService(); return _instance; }

module.exports = { DomainService, getDomainService, DOMAIN_MAP };
