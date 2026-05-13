const { KnowledgeNamespace, UserRole, WorkspaceStatus } = require('./enums');

/**
 * Storage configuration per namespace
 */
const NAMESPACE_CONFIGS = {
    [KnowledgeNamespace.CORE]: {
        namespace: KnowledgeNamespace.CORE,
        displayName: 'Core System Knowledge',
        description: 'Knowledge about UN ProjectAdvisor system itself',
        storage: {
            graphPrefix: 'core',
            qdrantCollection: 'core_knowledge',
            redisPrefix: 'core:',
            storagePath: '/knowledge/core'
        },
        access: {
            readRoles: [UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.ADMIN],
            writeRoles: [UserRole.ARCHITECT, UserRole.ADMIN],
            adminRoles: [UserRole.ADMIN],
            publicRead: false
        },
        allowedNodeLabels: [
            'Service', 'Pipeline', 'Component', 'Config', 'Schema',
            'API', 'Documentation', 'Architecture', 'Decision', 'Worker'
        ],
        cacheTTL: 3600,
        enabled: true
    },

    [KnowledgeNamespace.PROJECT]: {
        namespace: KnowledgeNamespace.PROJECT,
        displayName: 'Project Knowledge',
        description: 'Extracted knowledge from legacy systems',
        storage: {
            graphPrefix: 'project',           // becomes project:{projectId}
            qdrantCollection: 'project',       // becomes project_{projectId}
            redisPrefix: 'project:',           // becomes project:{projectId}:
            storagePath: '/knowledge/projects' // becomes /knowledge/projects/{projectId}
        },
        access: {
            readRoles: [UserRole.VIEWER, UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.MANAGER, UserRole.ADMIN],
            writeRoles: [UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.ADMIN, UserRole.SYSTEM],
            adminRoles: [UserRole.ADMIN],
            publicRead: true
        },
        allowedNodeLabels: [
            'File', 'Class', 'Interface', 'Method', 'Function', 'Property',
            'WorkItem', 'Epic', 'Feature', 'UserStory', 'Task', 'Bug', 'Sprint',
            'Repository', 'Branch', 'Commit', 'Changeset', 'PullRequest',
            'Document', 'WikiPage', 'Email', 'EmailThread', 'Comment',
            'Database', 'Schema', 'Table', 'Column', 'StoredProcedure',
            'Person', 'Team', 'Project', 'Organization',
            'BusinessRule', 'BusinessProcess', 'Concept', 'Term'
        ],
        cacheTTL: 1800,
        enabled: true
    },

    [KnowledgeNamespace.META]: {
        namespace: KnowledgeNamespace.META,
        displayName: 'Meta Knowledge',
        description: 'Methodological knowledge and extraction strategies',
        storage: {
            graphPrefix: 'meta',
            qdrantCollection: 'meta_knowledge',
            redisPrefix: 'meta:',
            storagePath: '/knowledge/meta'
        },
        access: {
            readRoles: [UserRole.ARCHITECT, UserRole.ADMIN, UserRole.SYSTEM],
            writeRoles: [UserRole.SYSTEM, UserRole.ADMIN],
            adminRoles: [UserRole.ADMIN],
            publicRead: false
        },
        allowedNodeLabels: [
            'Strategy', 'DataType', 'Tool', 'ContextPattern',
            'StrategyExecution', 'ExtractionCycle', 'DecisionRecord', 'QualityRule'
        ],
        cacheTTL: 7200,
        enabled: true
    },

    [KnowledgeNamespace.COMMON]: {
        namespace: KnowledgeNamespace.COMMON,
        displayName: 'Common Vocabulary',
        description: 'Shared terminology, dictionaries, and reference data',
        storage: {
            graphPrefix: 'common',
            qdrantCollection: 'common_vocabulary',
            redisPrefix: 'common:',
            storagePath: '/knowledge/common'
        },
        access: {
            readRoles: [UserRole.VIEWER, UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.MANAGER, UserRole.ADMIN],
            writeRoles: [UserRole.ADMIN],
            adminRoles: [UserRole.ADMIN],
            publicRead: true
        },
        allowedNodeLabels: [
            'Term', 'Concept', 'Organization', 'System', 'DocumentPattern',
            'Glossary', 'Acronym', 'UNEntity'
        ],
        cacheTTL: 86400,
        enabled: true
    },

    [KnowledgeNamespace.CODEX]: {
        namespace: KnowledgeNamespace.CODEX,
        displayName: 'Codex — System Constitution',
        description: 'Governance rules, standards, and Codex meta-structure',
        storage: {
            graphPrefix: 'codex',
            qdrantCollection: 'codex_knowledge',
            redisPrefix: 'codex:',
            storagePath: '/knowledge/codex'
        },
        access: {
            readRoles: [UserRole.VIEWER, UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SYSTEM],
            writeRoles: [UserRole.ADMIN],
            adminRoles: [UserRole.ADMIN],
            publicRead: true
        },
        allowedNodeLabels: [
            'CodexPrinciple',
            'CodexRule',
            'CodexDefinition',
            'CodexConstraint',
            'CodexPattern',
            'CodexSection',
            'CodexVersion',
            'CodexProposal',
            'CodexDecision',
            'CodexStakeholder'
        ],
        cacheTTL: 86400,
        enabled: true
    },

    [KnowledgeNamespace.BLACK_CODEX]: {
        namespace: KnowledgeNamespace.BLACK_CODEX,
        displayName: 'BlackCodex — Anti-patterns & Failures',
        description: 'Failed approaches, anti-patterns, rejected proposals',
        storage: {
            graphPrefix: 'blackcodex',
            qdrantCollection: 'blackcodex_knowledge',
            redisPrefix: 'blackcodex:',
            storagePath: '/knowledge/blackcodex'
        },
        access: {
            readRoles: [UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.ADMIN, UserRole.SYSTEM],
            writeRoles: [UserRole.ADMIN, UserRole.SYSTEM],
            adminRoles: [UserRole.ADMIN],
            publicRead: false
        },
        allowedNodeLabels: [
            'BlackCodexEntry'
        ],
        cacheTTL: 86400,
        enabled: true
    },

    [KnowledgeNamespace.UNIFIED]: {
        namespace: KnowledgeNamespace.UNIFIED,
        displayName: 'Unified Global Knowledge Base',
        description: 'Cross-namespace unified collection. Stores promoted knowledge quanta from all sources (dialogue sessions, work items, etc.). Read-only via search.',
        storage: {
            graphPrefix: 'unified',
            qdrantCollection: 'embeddings_unified',
            redisPrefix: 'unified:',
            storagePath: '/knowledge/unified'
        },
        access: {
            readRoles: [UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.MANAGER, UserRole.ADMIN, UserRole.SYSTEM],
            writeRoles: [UserRole.SYSTEM],
            adminRoles: [UserRole.ADMIN],
            publicRead: false
        },
        allowedNodeLabels: [
            'DialogueSession', 'KnowledgeQuantum', 'ProvenanceRound'
        ],
        cacheTTL: 300,
        enabled: true
    },

    [KnowledgeNamespace.WORKSPACE]: {
        namespace: KnowledgeNamespace.WORKSPACE,
        displayName: 'WorkSpace — Isolated Knowledge Extraction Sandbox',
        description: 'Isolated sandbox for knowledge extraction sessions. Read-only access to Global KB; writes to KB only via user-confirmed Promotion.',
        storage: {
            graphPrefix: 'workspace',              // becomes workspace:{workspaceId}
            qdrantCollection: 'workspace',          // becomes workspace_{workspaceId}
            redisPrefix: 'workspace:',              // becomes workspace:{workspaceId}:
            storagePath: '/knowledge/workspaces'    // becomes /knowledge/workspaces/{workspaceId}
        },
        access: {
            readRoles: [UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.MANAGER, UserRole.ADMIN],
            writeRoles: [UserRole.DEVELOPER, UserRole.ARCHITECT, UserRole.ADMIN, UserRole.SYSTEM],
            adminRoles: [UserRole.ADMIN],
            publicRead: false
        },
        allowedNodeLabels: [
            // WorkSpace management
            'WorkSpace', 'WorkSpaceSession',
            // Source references
            'SourceReference', 'SourceProfile',
            // Draft knowledge objects (isolated from Global KB)
            'DraftEntity', 'DraftRelationship', 'DraftBusinessRule',
            'DraftSchema', 'DraftWorkflow', 'DraftCalculation',
            'DraftConcept', 'DraftPolicy', 'DraftDecision',
            'DraftRequirement', 'DraftAnomaly', 'DraftAPIContract',
            // KB References (read-only pointers to Global KB nodes)
            'KBReference',
            // Experience & learning
            'ExperienceRecord', 'ExtractionStrategy',
            // Promotion tracking
            'PromotionRecord', 'PromotionItem'
        ],
        cacheTTL: 1800,
        enabled: true,
        // WorkSpace-specific configuration
        isolation: {
            readFromGlobalKB: true,
            writeToGlobalKB: false,     // Only via Promotion with user confirmation
            crossWorkspaceRead: false,  // WorkSpaces cannot read each other
            maxDraftNodes: 10000,       // Per-workspace node limit
            sessionTTL: 86400 * 7      // 7 days default workspace lifetime
        }
    }
};

/**
 * Get configuration for a namespace
 * @param {string} fullNamespace - e.g., "core", "project:imis"
 * @returns {Object} Namespace configuration
 */
function getNamespaceConfig(fullNamespace) {
    // Handle project sub-namespaces
    if (fullNamespace.startsWith('project:')) {
        return NAMESPACE_CONFIGS[KnowledgeNamespace.PROJECT] || null;
    }
    // Handle workspace sub-namespaces
    if (fullNamespace.startsWith('workspace:')) {
        return NAMESPACE_CONFIGS[KnowledgeNamespace.WORKSPACE] || null;
    }
    // Map lowercase keys to enum values for Codex/BlackCodex/Unified
    const nsMap = {
        codex: KnowledgeNamespace.CODEX,
        blackcodex: KnowledgeNamespace.BLACK_CODEX,
        unified: KnowledgeNamespace.UNIFIED,
    };
    const namespace = nsMap[fullNamespace] || fullNamespace;

    return NAMESPACE_CONFIGS[namespace] || null;
}

/**
 * Get storage paths for a full namespace
 * @param {string} fullNamespace
 * @returns {Object} Storage paths with projectId substituted
 */
function getStoragePaths(fullNamespace) {
    const config = getNamespaceConfig(fullNamespace);
    if (!config) return null;

    if (fullNamespace.startsWith('project:')) {
        const projectId = fullNamespace.slice(8);
        const sanitizedId = projectId.toLowerCase().replace(/-/g, '_');

        return {
            graphPrefix: `project:${projectId}`,
            qdrantCollection: `project_${sanitizedId}`,
            redisPrefix: `project:${projectId}:`,
            storagePath: `/knowledge/projects/${projectId}`
        };
    }

    if (fullNamespace.startsWith('workspace:')) {
        const workspaceId = fullNamespace.slice(10);
        const sanitizedId = workspaceId.toLowerCase().replace(/-/g, '_');

        return {
            graphPrefix: `workspace:${workspaceId}`,
            qdrantCollection: `workspace_${sanitizedId}`,
            redisPrefix: `workspace:${workspaceId}:`,
            storagePath: `/knowledge/workspaces/${workspaceId}`
        };
    }

    return { ...config.storage };
}

/**
 * Get Qdrant collection name for namespace
 * @param {string} fullNamespace
 * @returns {string} Collection name
 */
function getQdrantCollectionName(fullNamespace) {
    const paths = getStoragePaths(fullNamespace);
    return paths ? paths.qdrantCollection : null;
}

/**
 * Get Redis key prefix for namespace
 * @param {string} fullNamespace
 * @returns {string} Redis prefix
 */
function getRedisPrefix(fullNamespace) {
    const paths = getStoragePaths(fullNamespace);
    return paths ? paths.redisPrefix : null;
}

/**
 * List all enabled namespaces
 * @returns {string[]}
 */
function listEnabledNamespaces() {
    return Object.values(NAMESPACE_CONFIGS)
        .filter(config => config.enabled)
        .map(config => config.namespace);
}

/**
 * Validate if a label is allowed for a namespace
 * @param {string} fullNamespace
 * @param {string} label
 * @returns {boolean}
 */
function isLabelAllowed(fullNamespace, label) {
    const config = getNamespaceConfig(fullNamespace);
    if (!config) return false;
    return config.allowedNodeLabels.includes(label);
}

module.exports = {
    NAMESPACE_CONFIGS,
    getNamespaceConfig,
    getStoragePaths,
    getQdrantCollectionName,
    getRedisPrefix,
    listEnabledNamespaces,
    isLabelAllowed
};
