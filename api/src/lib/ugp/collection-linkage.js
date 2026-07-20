/**
 * Qdrant collection → Memgraph linkage configuration.
 *
 * AS-IS reality (TASK-EXP-000): the Qdrant↔Memgraph link is REVERSE and
 * payload-centric. A point's own id is an independent UUID/int; the tie to the
 * graph lives in the point PAYLOAD, under a field whose name depends on the
 * collection. There is no `qdrant_vector_id` on the Memgraph side.
 *
 * This map tells the exporter which payload field to reverse-look-up against the
 * selected node slice, which graph label it references, and whether a collection
 * uses named vectors.
 *
 *   linked: true|false  — false = not tied to the graph slice (e.g. Altiora-derived)
 *   field:  string      — payload key holding the referenced node identity value
 *   graphLabel: string  — the label whose identity `field` references (informational)
 *   namedVectors: []    — vector names when the collection uses named vectors
 */
const COLLECTION_LINKAGE = {
    documents_entities: {
        linked: true,
        field: 'memgraphNodeId', // payload also carries graphNodeId (alias); see resolveLinkageValue
        altFields: ['graphNodeId'],
        graphLabel: null, // references whatever label the entity node has (by id)
    },
    dialogue_embeddings: {
        linked: true,
        field: 'segmentId',
        graphLabel: 'DialogueSegment',
        namedVectors: ['content', 'summary'],
    },
    knowledge_entities: {
        linked: true,
        field: 'entityId',
        graphLabel: 'ESEntity',
        namedVectors: ['entity'],
    },
    embeddings_unified: {
        linked: true,
        field: 'quantum_id',
        graphLabel: 'KnowledgeQuantum',
    },

    // Graph-unlinked collections (Altiora-derived / free-standing knowledge).
    // Never auto-selected; user may include them explicitly (per-collection checkbox).
    flowdesk_services: { linked: false },
    altiora_knowledge: { linked: false },
    project_knowledge: { linked: false },
};

// workspace_* collections share one config: payload.draftNodeId references DraftEntity.id
const WORKSPACE_PATTERN = /^workspace_/;
const WORKSPACE_CONFIG = {
    linked: true,
    field: 'draftNodeId',
    altFields: ['entityId'],
    graphLabel: 'DraftEntity',
};

/**
 * Linkage config for a collection (falls back to unlinked+unknown for unmapped names).
 * @param {string} collectionName
 * @returns {{ linked: boolean, field?: string, altFields?: string[], graphLabel?: string|null, namedVectors?: string[], unknown?: boolean }}
 */
function getCollectionLinkage(collectionName) {
    if (Object.prototype.hasOwnProperty.call(COLLECTION_LINKAGE, collectionName)) {
        return COLLECTION_LINKAGE[collectionName];
    }
    if (WORKSPACE_PATTERN.test(collectionName)) {
        return WORKSPACE_CONFIG;
    }
    // Unknown collection — treat as unlinked, flag it so the UI/CLI can surface it.
    return { linked: false, unknown: true };
}

/**
 * Whether a collection stores named vectors (content/summary, entity, …).
 * @param {string} collectionName
 * @returns {boolean}
 */
function hasNamedVectors(collectionName) {
    const cfg = getCollectionLinkage(collectionName);
    return Array.isArray(cfg.namedVectors) && cfg.namedVectors.length > 0;
}

/**
 * Extract the linkage value from a point payload, honouring field + altFields.
 * @param {string} collectionName
 * @param {object} payload
 * @returns {any|null} the referenced node identity value, or null if absent
 */
function resolveLinkageValue(collectionName, payload) {
    const cfg = getCollectionLinkage(collectionName);
    if (!cfg.linked || !payload) return null;
    const candidates = [cfg.field, ...(cfg.altFields || [])].filter(Boolean);
    for (const key of candidates) {
        if (payload[key] !== undefined && payload[key] !== null) {
            return payload[key];
        }
    }
    return null;
}

module.exports = {
    COLLECTION_LINKAGE,
    WORKSPACE_PATTERN,
    WORKSPACE_CONFIG,
    getCollectionLinkage,
    hasNamedVectors,
    resolveLinkageValue,
};
