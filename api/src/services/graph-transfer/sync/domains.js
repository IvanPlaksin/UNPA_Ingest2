'use strict';

/**
 * Sync domain presets — the human-meaningful groupings a user reasons about
 * ("service schemas", "KB resolve layer") mapped to the underlying Memgraph
 * labels + Qdrant collections. These drive both the Compare view (group the
 * per-label/collection diff by domain) and domain-based selection (build an
 * export request from chosen domains, no Cypher).
 *
 * category: 'significant' — functional data that affects chat/resolution quality;
 *           'telemetry'   — runtime/experiment data that legitimately differs
 *                           between instances and usually should NOT be synced.
 */

const DOMAINS = [
    {
        id: 'service-schemas', label: 'Service schemas', category: 'significant',
        description: 'Form/service definitions, slots, enum options, sections.',
        labels: ['ServiceDef', 'SlotDef', 'EnumOption', 'SlotGroup', 'ServiceDescription'],
        collections: [],
    },
    {
        id: 'service-catalog', label: 'Service catalog', category: 'significant',
        description: 'The browsable service catalog tree + entries.',
        labels: ['ServiceCatalogItem', 'CatalogEntry', 'CatalogRoot', 'SourceCatalog'],
        collections: [],
    },
    {
        id: 'kb-resolve', label: 'KB resolve layer', category: 'significant',
        description: 'Per-slot/service knowledge + hybrid-search vectors used to resolve user text to services/slots.',
        labels: ['SlotKnowledge', 'ServiceKnowledge', 'KnowledgeNode', 'ServiceDescription'],
        collections: ['flowdesk_services', 'knowledge_entities', 'embeddings_unified', 'project_knowledge', 'altiora_knowledge'],
    },
    {
        id: 'chat-prompts', label: 'Chat prompts', category: 'significant',
        description: 'System-prompt graph + overlays that steer the chat.',
        labels: ['FlowdeskSystemPrompt', 'FlowdeskPromptOverlay'],
        collections: [],
    },
    {
        id: 'intake-graphs', label: 'Intake graphs', category: 'significant',
        description: 'Executable intake/dialogue graphs (GraphDefinition/Version).',
        labels: ['GraphDefinition', 'GraphVersion'],
        collections: [],
    },
    {
        id: 'dialogues', label: 'Dialogues & analytics', category: 'telemetry',
        description: 'Chat sessions/turns, dialogue-gym experiments — runtime telemetry (usually not synced).',
        labels: ['DialogueSegment', 'DialogueSession', 'ChatSession', 'ChatTurn', 'ArenaRun', 'ArenaTurn', 'JudgeRecord', 'DialogueGymPersona', 'DialogueGymScenario', 'FlowdeskSyncEvent'],
        collections: ['dialogue_embeddings'],
    },
];

const byId = new Map(DOMAINS.map((d) => [d.id, d]));

/** label -> domainId (first match wins) */
const labelDomain = new Map();
const collectionDomain = new Map();
for (const d of DOMAINS) {
    for (const l of d.labels) if (!labelDomain.has(l)) labelDomain.set(l, d.id);
    for (const c of d.collections) if (!collectionDomain.has(c)) collectionDomain.set(c, d.id);
}

/** Build one export request (LABELS union + collection union) from domain ids. */
function buildRequestFromDomains(domainIds, opts = {}) {
    const labels = new Set();
    const selectedCollections = {};
    for (const id of domainIds || []) {
        const d = byId.get(id);
        if (!d) continue;
        d.labels.forEach((l) => labels.add(l));
        d.collections.forEach((c) => { selectedCollections[c] = true; });
    }
    return {
        selectionMode: 'LABELS',
        labels: [...labels],
        boundaryPolicy: opts.boundaryPolicy || 'STUB',
        vectorPolicy: opts.vectorPolicy || 'EMBED_POINTS',
        selectedCollections,
    };
}

/** Sum a snapshot's counts for one domain, keeping the per-label/collection breakdown. */
function domainStat(snap, d) {
    let nodes = 0, vectors = 0; const labels = {}, collections = {};
    for (const l of d.labels) { const v = (snap.labels || {})[l] || 0; nodes += v; labels[l] = v; }
    for (const c of d.collections) { const v = (snap.collections || {})[c] || 0; vectors += v; collections[c] = v; }
    return { nodes, vectors, labels, collections };
}

/** Compare two snapshots grouped by domain (source vs target). SourceDocument and
 *  any label not mapped to a domain are intentionally ignored. */
function compareByDomain(source, target) {
    const domains = DOMAINS.map((d) => {
        const s = domainStat(source, d), t = domainStat(target, d);
        const nodesDelta = s.nodes - t.nodes, vectorsDelta = s.vectors - t.vectors;
        return {
            id: d.id, label: d.label, category: d.category, description: d.description,
            source: s, target: t, nodesDelta, vectorsDelta,
            inSync: nodesDelta === 0 && vectorsDelta === 0,
        };
    });
    const significantDrift = domains.filter((d) => d.category === 'significant' && !d.inSync).map((d) => d.id);
    return { domains, significantDrift };
}

module.exports = { DOMAINS, byId, labelDomain, collectionDomain, buildRequestFromDomains, domainStat, compareByDomain };
