/**
 * Entity Store → EntitySingularity graph format converter
 * Extracted from FloatingGraphCatalog.jsx for reuse in EntitySingularity.
 */

export const ES_COLORS = {
    ACTOR: '#3b82f6',
    ORGANIZATION: '#3b82f6',
    CONCEPT: '#06b6d4',
    DOCUMENT: '#8b5cf6',
    DOCUMENTREF: '#8b5cf6',
    EVENT: '#eab308',
    PROCESS: '#eab308',
    PERSON: '#22c55e',
    TECHNOLOGY: '#a855f7',
    POLICY: '#ef4444',
    SYSTEM: '#0891b2',
    WORK_ITEM: '#6b7280',
};

// Z-layer assignment by canonical type for stratified layout
const TYPE_LAYERS = {
    POLICY: 400,
    ORGANIZATION: 300,
    ACTOR: 300,
    PERSON: 200,
    PROCESS: 100,
    EVENT: 100,
    CONCEPT: 0,
    TECHNOLOGY: -100,
    SYSTEM: -100,
    DOCUMENT: -200,
    DOCUMENTREF: -200,
    WORK_ITEM: -300,
};

export function getColorByType(type) {
    return ES_COLORS[(type || '').toUpperCase()] || '#6b7280';
}

export function getLayerByType(type) {
    return TYPE_LAYERS[(type || '').toUpperCase()] ?? 0;
}

export function getSizeByType(type, mentionCount = 0) {
    const base = mentionCount > 5 ? 12 : mentionCount > 0 ? 10 : 6;
    const typeBoost = {
        ORGANIZATION: 4, POLICY: 4, SYSTEM: 2, ACTOR: 2,
    }[(type || '').toUpperCase()] || 0;
    return base + typeBoost;
}

/**
 * Converts Entity Store API response to EntitySingularity graph format.
 * @param {object} graphData  - { entities: [], relationships: [] }
 * @param {string} [namespace]
 * @returns {{ nodes: [], links: [], meta: {} }}
 */
export function convertEntityStoreToGraph(graphData, namespace) {
    const entities = graphData?.entities || [];
    const relationships = graphData?.relationships || [];

    const nodes = entities.map(e => ({
        id: e.id,
        name: e.name || e.id,
        type: (e.type || 'concept').toLowerCase(),
        canonicalType: (e.type || 'CONCEPT').toUpperCase(),
        val: getSizeByType(e.type, e.mentionCount),
        color: getColorByType(e.type),
        layer: getLayerByType(e.type),
        level: 0,
        loaded: true,
        hasSubGraph: false,
        mentionCount: e.mentionCount || 0,
        data: e,
    }));

    const nodeIds = new Set(nodes.map(n => n.id));
    const links = relationships
        .filter(r => r.sourceId && r.targetId && nodeIds.has(r.sourceId) && nodeIds.has(r.targetId))
        .map(r => ({
            source: r.sourceId,
            target: r.targetId,
            type: r.relType || 'RELATED_TO',
            weight: r.weight || 1,
            context: r.context || null,
            confidence: r.confidence ?? null,
            documentId: r.documentId || null,
        }));

    return {
        nodes,
        links,
        meta: {
            namespace: namespace || 'ALL',
            entityCount: nodes.length,
            relationshipCount: links.length,
            sourceType: 'Entity Store',
            sourceName: `Entity Store${namespace ? ` · ${namespace}` : ' · All'}`,
        },
    };
}
