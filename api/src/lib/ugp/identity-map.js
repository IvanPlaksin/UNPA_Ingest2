/**
 * Per-label identity property map.
 *
 * AS-IS reality (TASK-EXP-000): there is no universal `uuid` (only ~20 nodes of
 * 1.34M carry it). `id` covers most labels, but executable graphs, dialogues and
 * Codex nodes use their own per-label keys. This map is the single source of
 * truth for which property carries a node's identity when we MERGE on import.
 *
 * Key = label. Value = ordered candidate property names; the first present &
 * non-null wins. DEFAULT is applied for any label not listed here.
 */
const IDENTITY_MAP = {
    DEFAULT: ['id'],

    // Executable graphs (GXE) — no `id`, carry their own keys
    GraphDefinition: ['graphId'],
    GraphVersion: ['versionId'],
    CatalogEntry: ['entryId'],

    // Dialogues
    DialogueSegment: ['segmentId'],
    DialogueSession: ['sessionId'],
    ChatSession: ['sessionId'],
    ChatTurn: ['turnId'],

    // Codex — CodexRule carries both `id` and `codexId` (confirmed live); prefer id
    CodexDefinition: ['definitionId'],
    CodexRule: ['id', 'codexId'],

    // Rare labels that actually carry uuid
    DocumentType: ['uuid', 'id'],
    EpistemicLayer: ['uuid', 'id'],
};

/**
 * Candidate identity properties for a label (never empty — falls back to DEFAULT).
 * @param {string} label
 * @returns {string[]}
 */
function getIdentityProperties(label) {
    return IDENTITY_MAP[label] || IDENTITY_MAP.DEFAULT;
}

/**
 * Resolve the identity {property, value} of a node from its labels + properties.
 * Tries each label's candidates in order, then the DEFAULT candidates.
 * @param {string[]} labels
 * @param {object} props
 * @returns {{ property: string, value: any } | null}
 */
function resolveIdentity(labels, props) {
    const safeLabels = Array.isArray(labels) ? labels : [labels].filter(Boolean);
    const props_ = props || {};

    for (const label of safeLabels) {
        for (const prop of getIdentityProperties(label)) {
            if (props_[prop] !== undefined && props_[prop] !== null) {
                return { property: prop, value: props_[prop] };
            }
        }
    }
    // Fallback to DEFAULT candidates (covers labels resolved via DEFAULT already,
    // but also the case where a listed label's own keys were all absent).
    for (const prop of IDENTITY_MAP.DEFAULT) {
        if (props_[prop] !== undefined && props_[prop] !== null) {
            return { property: prop, value: props_[prop] };
        }
    }
    return null;
}

module.exports = { IDENTITY_MAP, getIdentityProperties, resolveIdentity };
