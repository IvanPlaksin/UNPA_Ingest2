const crypto = require('crypto');
const { KnowledgeNamespace, LifecycleState } = require('../config/enums');

/**
 * Namespace context - identifies where the quantum belongs
 */
class NamespaceContext {
    /**
     * @param {Object} params
     * @param {string} params.namespace - Primary namespace (core|project|meta|common)
     * @param {string|null} params.projectId - Project ID (required for PROJECT namespace)
     */
    constructor({ namespace, projectId = null }) {
        if (!Object.values(KnowledgeNamespace).includes(namespace)) {
            throw new Error(`Invalid namespace: ${namespace}`);
        }

        if (namespace === KnowledgeNamespace.PROJECT && !projectId) {
            throw new Error('projectId is required for PROJECT namespace');
        }

        if (namespace !== KnowledgeNamespace.PROJECT && projectId) {
            throw new Error('projectId should only be set for PROJECT namespace');
        }

        this.namespace = namespace;
        this.projectId = projectId;
        this.fullNamespace = this._buildFullNamespace();
        this.hasCrossNamespaceRefs = false;
        this.crossNamespaceRefs = [];
    }

    /**
     * Build fully qualified namespace string
     * @private
     */
    _buildFullNamespace() {
        if (this.namespace === KnowledgeNamespace.PROJECT && this.projectId) {
            return `project:${this.projectId}`;
        }
        return this.namespace;
    }

    /**
     * Add cross-namespace reference
     * @param {string} targetNamespace - Referenced namespace
     */
    addCrossNamespaceRef(targetNamespace) {
        if (!this.crossNamespaceRefs.includes(targetNamespace)) {
            this.crossNamespaceRefs.push(targetNamespace);
            this.hasCrossNamespaceRefs = true;
        }
    }

    /**
     * Create from full namespace string
     * @param {string} fullNamespace - e.g., "core", "project:imis", "meta"
     * @returns {NamespaceContext}
     */
    static fromFullNamespace(fullNamespace) {
        if (fullNamespace.startsWith('project:')) {
            const projectId = fullNamespace.slice(8);
            return new NamespaceContext({
                namespace: KnowledgeNamespace.PROJECT,
                projectId
            });
        }
        return new NamespaceContext({ namespace: fullNamespace });
    }

    /**
     * Convert to plain object for storage
     */
    toObject() {
        return {
            namespace: this.namespace,
            projectId: this.projectId,
            fullNamespace: this.fullNamespace,
            hasCrossNamespaceRefs: this.hasCrossNamespaceRefs,
            crossNamespaceRefs: [...this.crossNamespaceRefs]
        };
    }

    /**
     * Create from plain object
     * @param {Object} obj
     * @returns {NamespaceContext}
     */
    static fromObject(obj) {
        const ctx = new NamespaceContext({
            namespace: obj.namespace,
            projectId: obj.projectId
        });
        ctx.hasCrossNamespaceRefs = obj.hasCrossNamespaceRefs || false;
        ctx.crossNamespaceRefs = obj.crossNamespaceRefs || [];
        return ctx;
    }
}

/**
 * Core Identity - unique identification and lifecycle of a knowledge quantum
 */
class CoreIdentity {
    /**
     * @param {Object} params
     * @param {string} params.quantumId - UUID v7 identifier
     * @param {NamespaceContext} params.namespaceCtx - Namespace context
     * @param {Object} params.source - Source info for fingerprint
     */
    constructor({ quantumId, namespaceCtx, source = {} }) {
        // Primary identifier
        this.quantumId = quantumId || this._generateUUID();

        // Namespace context (NEW)
        this.namespaceCtx = namespaceCtx instanceof NamespaceContext
            ? namespaceCtx
            : new NamespaceContext(namespaceCtx);

        // Fingerprint includes namespace for uniqueness
        this.fingerprint = this._computeFingerprint(source);

        // Version tracking
        this.version = 1;

        // Timestamps
        this.createdAt = new Date();
        this.modifiedAt = new Date();
        this.sourceTimestamp = source.timestamp || null;

        // Lifecycle
        this.state = LifecycleState.DRAFT;
        this.supersededBy = null;
        this.supersedes = null;

        // Metadata
        this.tags = [];
        this.externalIds = {};
    }

    /**
     * Generate UUID v7 (time-ordered)
     * @private
     */
    _generateUUID() {
        // Simplified UUID v7 generation
        const timestamp = Date.now();
        const timestampHex = timestamp.toString(16).padStart(12, '0');
        const randomPart = crypto.randomBytes(10).toString('hex');

        return [
            timestampHex.slice(0, 8),
            timestampHex.slice(8, 12),
            '7' + randomPart.slice(0, 3),  // Version 7
            (parseInt(randomPart.slice(3, 4), 16) & 0x3f | 0x80).toString(16) + randomPart.slice(4, 7),
            randomPart.slice(7, 19)
        ].join('-');
    }

    /**
     * Compute content fingerprint
     * @private
     * @param {Object} source - Source information
     */
    _computeFingerprint(source) {
        const components = [
            this.namespaceCtx.fullNamespace,
            source.id || '',
            source.type || '',
            source.contentHash || ''
        ].join('|');

        return crypto.createHash('sha256')
            .update(components)
            .digest('hex');
    }

    /**
     * Update modification timestamp and increment version
     */
    touch() {
        this.modifiedAt = new Date();
        this.version += 1;
    }

    /**
     * Add external ID mapping
     * @param {string} system - External system name
     * @param {string} id - ID in that system
     */
    addExternalId(system, id) {
        this.externalIds[system] = id;
        this.touch();
    }

    /**
     * Add tag
     * @param {string} tag
     */
    addTag(tag) {
        if (!this.tags.includes(tag)) {
            this.tags.push(tag);
            this.touch();
        }
    }

    /**
     * Transition lifecycle state
     * @param {string} newState - New lifecycle state
     */
    transitionState(newState) {
        if (!Object.values(LifecycleState).includes(newState)) {
            throw new Error(`Invalid state: ${newState}`);
        }
        this.state = newState;
        this.touch();
    }

    /**
     * Mark as superseded by another quantum
     * @param {string} newQuantumId
     */
    markSuperseded(newQuantumId) {
        this.supersededBy = newQuantumId;
        this.transitionState(LifecycleState.SUPERSEDED);
    }

    /**
     * Convert to plain object for storage
     */
    toObject() {
        return {
            quantumId: this.quantumId,
            fingerprint: this.fingerprint,
            version: this.version,
            createdAt: this.createdAt.toISOString(),
            modifiedAt: this.modifiedAt.toISOString(),
            sourceTimestamp: this.sourceTimestamp?.toISOString() || null,
            state: this.state,
            supersededBy: this.supersededBy,
            supersedes: this.supersedes,
            tags: [...this.tags],
            externalIds: { ...this.externalIds },
            namespaceCtx: this.namespaceCtx.toObject()
        };
    }

    /**
     * Create from plain object
     * @param {Object} obj
     * @returns {CoreIdentity}
     */
    static fromObject(obj) {
        const identity = new CoreIdentity({
            quantumId: obj.quantumId,
            namespaceCtx: NamespaceContext.fromObject(obj.namespaceCtx),
            source: {}
        });

        identity.fingerprint = obj.fingerprint;
        identity.version = obj.version;
        identity.createdAt = new Date(obj.createdAt);
        identity.modifiedAt = new Date(obj.modifiedAt);
        identity.sourceTimestamp = obj.sourceTimestamp ? new Date(obj.sourceTimestamp) : null;
        identity.state = obj.state;
        identity.supersededBy = obj.supersededBy;
        identity.supersedes = obj.supersedes;
        identity.tags = obj.tags || [];
        identity.externalIds = obj.externalIds || {};

        return identity;
    }

    /**
     * Get properties for Graph DB node
     */
    toGraphProperties() {
        return {
            quantumId: this.quantumId,
            fingerprint: this.fingerprint,
            version: this.version,
            createdAt: this.createdAt.toISOString(),
            modifiedAt: this.modifiedAt.toISOString(),
            state: this.state,
            tags: this.tags,
            // Namespace properties (flattened for indexing)
            namespace: this.namespaceCtx.namespace,
            projectId: this.namespaceCtx.projectId,
            fullNamespace: this.namespaceCtx.fullNamespace,
            hasCrossNamespaceRefs: this.namespaceCtx.hasCrossNamespaceRefs,
            crossNamespaceRefs: this.namespaceCtx.crossNamespaceRefs
        };
    }
}

module.exports = {
    NamespaceContext,
    CoreIdentity
};
