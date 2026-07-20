'use strict';

/**
 * Vector Stats Service — aggregated composition of the vector side of the
 * knowledge base (Qdrant) for the Knowledge Dashboard. One sample-scroll per
 * non-empty collection yields BOTH payload field stats AND per-namespace counts
 * (avoids a second scroll). Empty collections (mostly idle workspace_*) are
 * summarized but not detailed.
 */

const { getCollectionLinkage } = require('../../lib/ugp');

let _qd = null;
function qd() { if (!_qd) _qd = require('../qdrant.service'); return _qd; }

const PAYLOAD_SAMPLE = 1000;
const MAX_DISTINCT = 50;

// Reverse of COLLECTION_LINKAGE: which graph label(s) a collection's points come from.
const COLLECTION_TO_LABELS = {
    documents_entities: ['EntityMention'],
    knowledge_entities: ['ESEntity'],
    dialogue_embeddings: ['DialogueSegment'],
    embeddings_unified: ['KnowledgeQuantum'],
};
function linkedLabelsFor(name) {
    if (COLLECTION_TO_LABELS[name]) return COLLECTION_TO_LABELS[name];
    if (/^workspace_/.test(name)) return ['DraftEntity'];
    return [];
}

const pct = (part, total) => (total > 0 ? Math.round((part / total) * 10000) / 100 : 0);

function extractVectorConfig(info) {
    const vectors = info?.config?.params?.vectors;
    if (!vectors) return { size: 0, distance: 'Unknown' };
    if (typeof vectors.size === 'number') {
        return { size: vectors.size, distance: vectors.distance || 'Cosine' };
    }
    if (typeof vectors === 'object') {
        const names = Object.keys(vectors);
        const first = vectors[names[0]] || {};
        return { size: first.size || 0, distance: first.distance || 'Cosine', namedVectors: names };
    }
    return { size: 0, distance: 'Unknown' };
}

class VectorStatsService {
    async getVectorStats() {
        let live;
        try { live = await qd().client.getCollections(); }
        catch (e) { return { timestamp: new Date().toISOString(), error: `Qdrant unavailable: ${e.message}`, summary: {}, collections: [], storage: {} }; }

        const names = (live.collections || []).map((c) => c.name);

        // Metadata for every collection (parallel).
        const basics = await Promise.all(names.map(async (name) => {
            try {
                const info = await qd().client.getCollection(name);
                const pointsCount = info.points_count || 0;
                const linkage = getCollectionLinkage(name);
                return {
                    name,
                    pointsCount,
                    vectorConfig: extractVectorConfig(info),
                    linkage: {
                        linked: !!linkage.linked,
                        field: linkage.field || null,
                        linkedLabels: linkage.linked ? linkedLabelsFor(name) : [],
                    },
                    payloadStats: null,
                };
            } catch { return null; }
        }));

        const all = basics.filter(Boolean);
        const nonEmpty = all.filter((c) => c.pointsCount > 0);
        const emptyCount = all.length - nonEmpty.length;

        // One sample-scroll per non-empty collection → payloadStats + per-namespace.
        const nsAgg = {}; // namespace → { count, collections:Set }
        await Promise.all(nonEmpty.map(async (col) => {
            try {
                const resp = await qd().client.scroll(col.name, {
                    limit: Math.min(PAYLOAD_SAMPLE, col.pointsCount), with_payload: true, with_vector: false,
                });
                const points = resp.points || [];
                const fieldCount = {};
                const fieldVals = {};
                for (const p of points) {
                    const payload = p.payload || {};
                    for (const [k, v] of Object.entries(payload)) {
                        fieldCount[k] = (fieldCount[k] || 0) + 1;
                        if (!fieldVals[k]) fieldVals[k] = new Set();
                        if (fieldVals[k].size < MAX_DISTINCT && (typeof v === 'string' || typeof v === 'boolean')) fieldVals[k].add(v);
                    }
                    const ns = payload.namespace || payload.fullNamespace;
                    if (ns) {
                        if (!nsAgg[ns]) nsAgg[ns] = { count: 0, collections: new Set() };
                        nsAgg[ns].count++;
                        nsAgg[ns].collections.add(col.name);
                    }
                }
                const seen = Math.max(1, points.length);
                col.payloadStats = {
                    sampleSize: points.length,
                    topFields: Object.entries(fieldCount)
                        .map(([name, cnt]) => ({ name, coverage: Math.round((cnt / seen) * 100) / 100, cardinality: fieldVals[name] && fieldVals[name].size <= MAX_DISTINCT ? fieldVals[name].size : null }))
                        .sort((a, b) => b.coverage - a.coverage).slice(0, 10),
                };
            } catch { /* leave payloadStats null */ }
        }));

        const totalPoints = nonEmpty.reduce((s, c) => s + c.pointsCount, 0);
        for (const c of nonEmpty) c.percentage = pct(c.pointsCount, totalPoints);
        nonEmpty.sort((a, b) => b.pointsCount - a.pointsCount);

        const summary = {
            totalCollections: nonEmpty.length,
            emptyCollections: emptyCount,
            totalPoints,
            totalVectorDimensions: nonEmpty.reduce((s, c) => s + (c.vectorConfig.size || 0), 0),
            linkedCollections: nonEmpty.filter((c) => c.linkage.linked).length,
            unlinkedCollections: nonEmpty.filter((c) => !c.linkage.linked).length,
        };

        const nsTotal = Object.values(nsAgg).reduce((s, n) => s + n.count, 0);
        const pointsByNamespace = Object.entries(nsAgg)
            .map(([namespace, d]) => ({ namespace, count: d.count, percentage: pct(d.count, nsTotal), collections: [...d.collections] }))
            .sort((a, b) => b.count - a.count);

        return {
            timestamp: new Date().toISOString(),
            summary,
            collections: nonEmpty,
            pointsByNamespace,
            storage: this._estimateStorage(nonEmpty),
        };
    }

    _estimateStorage(collections) {
        let vectorBytes = 0;
        let payloadBytes = 0;
        for (const c of collections) {
            const named = c.vectorConfig.namedVectors?.length || 1;
            vectorBytes += c.pointsCount * (c.vectorConfig.size || 0) * named * 4; // float32
            payloadBytes += c.pointsCount * 500; // rough ~500B/point
        }
        return {
            estimatedVectorBytes: vectorBytes,
            estimatedPayloadBytes: payloadBytes,
            totalEstimatedMB: Math.round(((vectorBytes + payloadBytes) / (1024 * 1024)) * 100) / 100,
        };
    }
}

let _instance = null;
function getVectorStatsService() { if (!_instance) _instance = new VectorStatsService(); return _instance; }

module.exports = { VectorStatsService, getVectorStatsService };
