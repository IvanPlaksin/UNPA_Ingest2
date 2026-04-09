const crypto = require('crypto');
const { KnowledgeNamespace, UserRole } = require('../config/enums');
const { NAMESPACE_CONFIGS, getNamespaceConfig } = require('../config/namespace.config');

/**
 * Namespace detection patterns for query routing
 */
const DETECTION_PATTERNS = {
    core: [
        /\b(pipeline|service|component|api|architecture)\b/i,
        /\b(how does .* work)\b/i,
        /\b(system|projectadvisor|advisor)\s+(config|setup|install)/i,
        /\b(indexing|extraction|processing)\s+(pipeline|service)/i,
        /\b(memgraph|qdrant|redis|bullmq)\s+(service|config)/i
    ],
    project: [
        /\b(imis|umoja|inspira|galileo|mercury|atlas)\b/i,
        /\b(work\s*item|bug|feature|epic)\s*#?\d+/i,
        /\b(code|class|method|function)\s+in\s+(\w+)/i,
        /\b(business\s*rule|validation)\s+for/i,
        /\b(stored\s*proc|table|column)\s+in/i
    ],
    meta: [
        /\b(strategy|approach|method)\s+for\s+(extraction|analysis)/i,
        /\b(best\s+practice|pattern|effective)/i,
        /\b(how\s+to\s+extract|extraction\s+technique)/i,
        /\b(success\s+rate|accuracy|performance)\s+of/i
    ],
    common: [
        /\b(what\s+is|define|meaning\s+of)\s+(\w+)/i,
        /\b(acronym|abbreviation|term|glossary)/i,
        /\b(un\s+organization|department|unit|oict|dgacm)/i
    ],
    codex: [
        /\b(codex|rule|principle|standard|governance)\b/i,
        /\b(must|should|may|must\s*not|should\s*not)\s+(be|have|include)/i,
        /\b(constraint|pattern|anti.?pattern|definition)\s+(for|of)/i,
        /\b(proposal|decision|adr|stakeholder)\b/i,
        /\b(changeability|deontic|modality|prescriptive|constitutive)\b/i
    ],
    blackcodex: [
        /\b(black\s*codex|anti.?pattern|failure|rejected)\b/i,
        /\b(what\s+not\s+to|don'?t|avoid|never)\b/i,
        /\b(lesson\s+learned|failed\s+approach)\b/i
    ],
    workspace: [
        /\b(workspace|work\s*space)\s*(session|extract|source|draft)/i,
        /\b(extract\w*\s+from|analyze\s+source|source\s+profil)/i,
        /\b(draft\s+knowledge|promote\s+to\s+kb|promotion\s+review)/i
    ],
    projectNameExtractor: /\b(imis|umoja|inspira|galileo|mercury|atlas|undp|unicef)\b/i,
    workspaceIdExtractor: /\bworkspace[:\s]+([a-f0-9-]{8,36})\b/i
};

/**
 * NamespaceRouter - Intelligent query routing to appropriate namespace
 */
class NamespaceRouter {
    /**
     * @param {Object} redisClient - Redis client for caching
     */
    constructor(redisClient = null) {
        this.redis = redisClient;
        this.cacheTTL = 3600; // 1 hour
    }

    /**
     * Route a query to appropriate namespace(s)
     * @param {Object} context - Query context
     * @param {string} context.query - Query text
     * @param {string} [context.explicitNamespace] - Explicitly specified namespace
     * @param {string} context.userRole - User role
     * @param {string} context.userId - User ID
     * @param {string} context.source - Request source (rabbithole, singularity, api)
     * @returns {Promise<Object>} Routing decision
     */
    async route(context) {
        const { query, explicitNamespace, userRole, source } = context;

        // 1. Check explicit namespace
        if (explicitNamespace) {
            if (!this.checkAccess(explicitNamespace, userRole, 'read')) {
                throw new Error(`Access denied to namespace: ${explicitNamespace}`);
            }
            return this._buildDecision(explicitNamespace, [], 1.0, 'Explicit namespace specified');
        }

        // 2. Check cache
        const cacheKey = this._buildCacheKey(query);
        if (this.redis) {
            const cached = await this._getFromCache(cacheKey);
            if (cached) {
                return cached;
            }
        }

        // 3. Analyze query
        const analysis = this._analyzeQuery(query);

        // 4. Build routing decision
        const decision = this._buildRoutingDecision(analysis, userRole);
        decision.cacheKey = cacheKey;

        // 5. Cache decision
        if (this.redis) {
            await this._cacheDecision(cacheKey, decision);
        }

        return decision;
    }

    /**
     * Analyze query for namespace patterns
     * @private
     */
    _analyzeQuery(query) {
        const normalizedQuery = query.toLowerCase().trim();
        const scores = { core: 0, project: 0, meta: 0, common: 0, codex: 0, blackcodex: 0, workspace: 0 };
        let detectedProjectId = null;
        let detectedWorkspaceId = null;

        // Check each namespace pattern
        for (const [ns, patterns] of Object.entries(DETECTION_PATTERNS)) {
            if (ns === 'projectNameExtractor' || ns === 'workspaceIdExtractor') continue;

            for (const pattern of patterns) {
                if (pattern.test(normalizedQuery)) {
                    scores[ns] += 0.3;
                }
            }
        }

        // Extract project name if present
        const projectMatch = normalizedQuery.match(DETECTION_PATTERNS.projectNameExtractor);
        if (projectMatch) {
            detectedProjectId = projectMatch[1].toLowerCase();
            scores.project += 0.4;
        }

        // Extract workspace ID if present
        const workspaceMatch = normalizedQuery.match(DETECTION_PATTERNS.workspaceIdExtractor);
        if (workspaceMatch) {
            detectedWorkspaceId = workspaceMatch[1].toLowerCase();
            scores.workspace += 0.4;
        }

        return { scores, detectedProjectId, detectedWorkspaceId };
    }

    /**
     * Build routing decision from analysis
     * @private
     */
    _buildRoutingDecision(analysis, userRole) {
        const { scores, detectedProjectId, detectedWorkspaceId } = analysis;

        // Sort namespaces by score
        const sortedNamespaces = Object.entries(scores)
            .sort((a, b) => b[1] - a[1]);

        const [primaryNs, primaryScore] = sortedNamespaces[0];

        // Build full namespace
        let primaryNamespace = primaryNs;
        if (primaryNs === 'project') {
            primaryNamespace = detectedProjectId
                ? `project:${detectedProjectId}`
                : 'project:*'; // Wildcard for all projects
        } else if (primaryNs === 'workspace') {
            primaryNamespace = detectedWorkspaceId
                ? `workspace:${detectedWorkspaceId}`
                : 'workspace:*';
        }

        // Check access
        if (!this.checkAccess(primaryNamespace, userRole, 'read')) {
            // Fall back to next accessible namespace
            for (const [ns, score] of sortedNamespaces.slice(1)) {
                if (this.checkAccess(ns, userRole, 'read')) {
                    primaryNamespace = ns;
                    break;
                }
            }
        }

        // Determine additional namespaces
        const additionalNamespaces = [];
        for (const [ns, score] of sortedNamespaces.slice(1)) {
            if (score >= 0.2 && this.checkAccess(ns, userRole, 'read')) {
                additionalNamespaces.push(ns);
            }
        }

        // Always include COMMON for terminology
        if (!additionalNamespaces.includes('common') &&
            primaryNs !== 'common' &&
            this.checkAccess('common', userRole, 'read')) {
            additionalNamespaces.push('common');
        }

        return {
            primaryNamespace,
            additionalNamespaces,
            confidence: Math.min(primaryScore + 0.3, 1.0),
            reasoning: this._buildReasoning(scores, detectedProjectId),
            isCrossNamespace: additionalNamespaces.length > 0,
            cacheKey: null
        };
    }

    /**
     * Build human-readable reasoning
     * @private
     */
    _buildReasoning(scores, detectedProjectId) {
        const parts = [];

        if (detectedProjectId) {
            parts.push(`Detected project: ${detectedProjectId}`);
        }

        const significant = Object.entries(scores)
            .filter(([_, score]) => score > 0)
            .map(([ns, score]) => `${ns}(${(score * 100).toFixed(0)}%)`)
            .join(', ');

        if (significant) {
            parts.push(`Namespace signals: ${significant}`);
        }

        return parts.length > 0 ? parts.join('; ') : 'Default routing';
    }

    /**
     * Check if user has access to namespace
     * @param {string} namespace - Full namespace identifier
     * @param {string} userRole - User role
     * @param {string} operation - 'read' or 'write'
     * @returns {boolean}
     */
    checkAccess(namespace, userRole, operation = 'read') {
        // Handle wildcard project namespace
        if (namespace === 'project:*') {
            namespace = 'project';
        }

        const config = getNamespaceConfig(namespace);
        if (!config) return false;

        const allowedRoles = operation === 'read'
            ? config.access.readRoles
            : config.access.writeRoles;

        return allowedRoles.includes(userRole);
    }

    /**
     * Get all namespaces available to user
     * @param {string} userRole
     * @returns {string[]}
     */
    getAvailableNamespaces(userRole) {
        const available = [];

        for (const [ns, config] of Object.entries(NAMESPACE_CONFIGS)) {
            if (config.access.readRoles.includes(userRole)) {
                available.push(ns);
            }
        }

        return available;
    }

    /**
     * Parse namespace string into components
     * @param {string} namespaceStr - e.g., "core", "project:imis"
     * @returns {Object} { namespace, projectId }
     */
    parseNamespace(namespaceStr) {
        if (namespaceStr.startsWith('project:')) {
            const projectId = namespaceStr.slice(8);
            return {
                namespace: KnowledgeNamespace.PROJECT,
                projectId: projectId === '*' ? null : projectId,
                workspaceId: null
            };
        }
        if (namespaceStr.startsWith('workspace:')) {
            const workspaceId = namespaceStr.slice(10);
            return {
                namespace: KnowledgeNamespace.WORKSPACE,
                projectId: null,
                workspaceId: workspaceId === '*' ? null : workspaceId
            };
        }
        return { namespace: namespaceStr, projectId: null, workspaceId: null };
    }

    /**
     * Build full namespace string
     * @param {string} namespace - Base namespace
     * @param {string} [projectId] - Project ID
     * @returns {string}
     */
    buildFullNamespace(namespace, projectId = null, workspaceId = null) {
        if (namespace === KnowledgeNamespace.PROJECT && projectId) {
            return `project:${projectId}`;
        }
        if (namespace === KnowledgeNamespace.WORKSPACE && workspaceId) {
            return `workspace:${workspaceId}`;
        }
        return namespace;
    }

    /**
     * Check if a namespace string refers to a WorkSpace
     * @param {string} namespaceStr
     * @returns {boolean}
     */
    isWorkspaceNamespace(namespaceStr) {
        return namespaceStr === KnowledgeNamespace.WORKSPACE ||
               namespaceStr.startsWith('workspace:');
    }

    /**
     * Extract workspace ID from a full namespace string
     * @param {string} namespaceStr - e.g., "workspace:abc-123"
     * @returns {string|null} workspaceId or null
     */
    parseWorkspaceId(namespaceStr) {
        if (!namespaceStr.startsWith('workspace:')) return null;
        const id = namespaceStr.slice(10);
        return id === '*' ? null : id;
    }

    // Private cache helpers

    _buildCacheKey(query) {
        const hash = crypto.createHash('sha256')
            .update(query.toLowerCase().trim())
            .digest('hex')
            .slice(0, 16);
        return `routing:decision:${hash}`;
    }

    async _getFromCache(key) {
        if (!this.redis) return null;
        try {
            const cached = await this.redis.get(key);
            return cached ? JSON.parse(cached) : null;
        } catch (e) {
            return null;
        }
    }

    async _cacheDecision(key, decision) {
        if (!this.redis) return;
        try {
            await this.redis.setex(key, this.cacheTTL, JSON.stringify(decision));
        } catch (e) {
            // Ignore cache errors
        }
    }

    _buildDecision(primary, additional, confidence, reasoning) {
        return {
            primaryNamespace: primary,
            additionalNamespaces: additional,
            confidence,
            reasoning,
            isCrossNamespace: additional.length > 0,
            cacheKey: null
        };
    }
}

module.exports = { NamespaceRouter, DETECTION_PATTERNS };
