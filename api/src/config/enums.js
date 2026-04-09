/**
 * Knowledge Namespace - Primary categorization of knowledge origin
 * @readonly
 * @enum {string}
 */
const KnowledgeNamespace = Object.freeze({
    /**
     * CORE - Knowledge about UN ProjectAdvisor system itself
     * Contains: architecture, pipelines, services, APIs, schemas
     * Update frequency: On system releases
     */
    CORE: 'core',

    /**
     * PROJECT - Extracted knowledge from legacy systems
     * Contains: code entities, work items, business rules, docs
     * Update frequency: On re-indexing
     * Always used with projectId qualifier
     */
    PROJECT: 'project',

    /**
     * META - Methodological knowledge and strategies
     * Contains: extraction strategies, patterns, metrics, decisions
     * Update frequency: As system learns
     */
    META: 'meta',

    /**
     * COMMON - Shared vocabulary and reference data
     * Contains: UN orgs dictionary, glossary, document patterns
     * Update frequency: Rarely
     */
    COMMON: 'common',

    /**
     * CODEX - Governance rules, standards, and system constitution
     * Contains: principles, rules, definitions, constraints, patterns
     * Update frequency: Via approved proposals only
     */
    CODEX: 'Codex',

    /**
     * BLACK_CODEX - Failed approaches, anti-patterns, rejected proposals
     * Contains: failure records, anti-patterns, lessons learned
     * Update frequency: Append-only
     */
    BLACK_CODEX: 'BlackCodex',

    /**
     * WORKSPACE - Isolated sandbox for knowledge extraction sessions
     * Contains: draft knowledge objects, source references, KB references, experience records
     * Update frequency: Per-session, isolated from Global KB
     * Always used with workspaceId qualifier: workspace:{workspaceId}
     * Read-only access to Global KB; write to Global KB only via Promotion
     */
    WORKSPACE: 'workspace'
});

/**
 * User roles for access control
 * @readonly
 * @enum {string}
 */
const UserRole = Object.freeze({
    VIEWER: 'VIEWER',
    DEVELOPER: 'DEVELOPER',
    ARCHITECT: 'ARCHITECT',
    MANAGER: 'MANAGER',
    ADMIN: 'ADMIN',
    SYSTEM: 'SYSTEM'
});

/**
 * Lifecycle state of a knowledge quantum
 * @readonly
 * @enum {string}
 */
/**
 * WorkSpace status - lifecycle of a WorkSpace session
 * @readonly
 * @enum {string}
 */
const WorkspaceStatus = Object.freeze({
    /** WorkSpace created, sources not yet loaded */
    CREATED: 'CREATED',
    /** Sources are being profiled and indexed */
    PROFILING: 'PROFILING',
    /** Ready for extraction — sources profiled, agent can begin */
    READY: 'READY',
    /** Extraction agent is actively running */
    EXTRACTING: 'EXTRACTING',
    /** Extraction paused — awaiting user input or review */
    PAUSED: 'PAUSED',
    /** Extraction complete, draft knowledge available for review */
    REVIEW: 'REVIEW',
    /** Some or all draft objects promoted to Global KB */
    PROMOTED: 'PROMOTED',
    /** WorkSpace archived — read-only, no further extraction */
    ARCHIVED: 'ARCHIVED'
});

/**
 * Draft Knowledge Object status within a WorkSpace
 * @readonly
 * @enum {string}
 */
const DraftKnowledgeStatus = Object.freeze({
    /** Freshly extracted, not yet reviewed */
    DRAFT: 'DRAFT',
    /** Validated by agent or user */
    VALIDATED: 'VALIDATED',
    /** Marked for promotion to Global KB */
    READY_TO_PROMOTE: 'READY_TO_PROMOTE',
    /** Successfully promoted to Global KB */
    PROMOTED: 'PROMOTED',
    /** Rejected during review — stays in WorkSpace */
    REJECTED: 'REJECTED',
    /** Conflicts with existing KB knowledge — needs resolution */
    CONFLICT: 'CONFLICT',
    /** Merged with existing KB knowledge during promotion */
    MERGED: 'MERGED'
});

/**
 * Promotion action — outcome of KB interaction during promotion
 * @readonly
 * @enum {string}
 */
const PromotionAction = Object.freeze({
    /** New node created in KB — no prior match */
    NEW: 'NEW',
    /** Existing KB node enriched with additional attributes */
    ENRICH: 'ENRICH',
    /** Existing KB node superseded by newer version */
    SUPERSEDE: 'SUPERSEDE',
    /** Draft merged with KB node (same concept, different perspectives) */
    MERGE: 'MERGE',
    /** Conflict detected — requires user resolution */
    CONFLICT: 'CONFLICT',
    /** Draft rejected — insufficient quality or duplicate */
    REJECT: 'REJECT'
});

const LifecycleState = Object.freeze({
    DRAFT: 'DRAFT',
    PENDING_REVIEW: 'PENDING_REVIEW',
    VALIDATED: 'VALIDATED',
    PUBLISHED: 'PUBLISHED',
    DEPRECATED: 'DEPRECATED',
    SUPERSEDED: 'SUPERSEDED',
    ARCHIVED: 'ARCHIVED',
    CONFLICTING: 'CONFLICTING'
});

module.exports = {
    KnowledgeNamespace,
    UserRole,
    LifecycleState,
    WorkspaceStatus,
    DraftKnowledgeStatus,
    PromotionAction
};
