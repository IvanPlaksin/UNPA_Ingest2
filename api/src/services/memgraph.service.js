const neo4j = require('neo4j-driver');
const { v4: uuidv4 } = require('uuid');
const { NamespaceContext } = require('../models/core-identity');
const { NamespaceRouter } = require('./namespace-router.service');

// CODEX-VALID: Schema Registry for pre-write validation
const { getSchemaRegistry, checkFingerprintCollision } = require('../validation/schema-registry');
const { RelationshipEndpointNotFoundError, SchemaValidationError } = require('../validation/errors');

// Lazy load tensor service to avoid circular dependency
let _tensorService = null;
function getTensorServiceLazy() {
    if (!_tensorService) {
        try {
            const { getTensorService } = require('./tensor.service');
            _tensorService = getTensorService();
        } catch (e) {
            // Tensor service not available
        }
    }
    return _tensorService;
}

const MEMGRAPH_URI = process.env.MEMGRAPH_URI || process.env.NEO4J_URI || 'bolt://localhost:7687';
const MEMGRAPH_USER = process.env.MEMGRAPH_USER || process.env.NEO4J_USERNAME || 'memgraph';
const MEMGRAPH_PASSWORD = process.env.MEMGRAPH_PASSWORD || process.env.NEO4J_PASSWORD || 'secret_password_123';

// CODEX-VALID: Global strict validation toggle (env override)
const CODEX_STRICT_VALIDATION = process.env.CODEX_STRICT_VALIDATION === 'true';

// ────────────────────────────────────────────────────────────────────────────
// SAFE QUERY BUILDER - Replaces regex-based WHERE injection
// ────────────────────────────────────────────────────────────────────────────

// Allowed labels whitelist for safe query building
const ALLOWED_LABELS = new Set([
    'KnowledgeQuantum', 'Document', 'Entity', 'WorkItem', 'Project',
    'NodeVersion', 'EdgeVersion', 'GodModeSession', 'DeletionMarker',
    'AOPEG_ExecutionGraph', 'AOPEG_GraphNode', 'AOPEG_GraphEdge',
    'AOPEG_Execution', 'AOPEG_NodeExecution',
    'ExecutionPattern',  // GXE PatternLibrary persistence
    // Codex namespace labels
    'CodexPrinciple',
    'CodexRule',
    'CodexDefinition',
    'CodexConstraint',
    'CodexPattern',
    'CodexSection',
    'CodexVersion',
    'CodexProposal',
    'CodexDecision',
    'CodexStakeholder',
    // BlackCodex namespace labels
    'BlackCodexEntry',
    // BackLog (CORE namespace)
    'BackLogItem',
    // FlowDesk notification/dialog templates
    'NotificationTemplate',
    // WorkSpace namespace labels
    'WorkSpace', 'WorkSpaceSession',
    'SourceReference', 'SourceProfile',
    'DraftEntity', 'DraftRelationship', 'DraftBusinessRule',
    'DraftSchema', 'DraftWorkflow', 'DraftCalculation',
    'DraftConcept', 'DraftPolicy', 'DraftDecision',
    'DraftRequirement', 'DraftAnomaly', 'DraftAPIContract',
    'KBReference',
    'ExperienceRecord', 'ExtractionStrategy',
    'PromotionRecord', 'PromotionItem',
    // Provenance (SIGILLUM namespace) — extraction round audit trail
    'ProvenanceRound',
]);

/**
 * Validates a label against the whitelist
 * @param {string} label - Label to validate
 * @returns {boolean} - Whether label is safe
 */
function isValidLabel(label) {
    return ALLOWED_LABELS.has(label);
}

/**
 * Sanitizes a label for Cypher (only allows alphanumeric and underscore)
 * @param {string} label - Label to sanitize
 * @returns {string|null} - Sanitized label or null if invalid
 */
function sanitizeLabel(label) {
    if (!label || typeof label !== 'string') return null;
    const sanitized = label.replace(/[^a-zA-Z0-9_]/g, '');
    return sanitized === label ? label : null;
}

class MemgraphService {
    constructor() {
        // Configure driver with settings optimized for Memgraph compatibility
        this.driver = neo4j.driver(
            MEMGRAPH_URI,
            neo4j.auth.basic(MEMGRAPH_USER, MEMGRAPH_PASSWORD),
            {
                disableLosslessIntegers: true,
                // Pool size: 30 connections (balanced for concurrent requests)
                maxConnectionPoolSize: 30,
                // Connection acquisition timeout (ms) - fail fast if pool exhausted
                connectionAcquisitionTimeout: 30000,
                // Connection timeout (ms)
                connectionTimeout: 20000,
                // Max connection lifetime (ms) - recycle connections after 30 min
                maxConnectionLifetime: 1800000,
                // Connection liveness check timeout (ms)
                connectionLivenessCheckTimeout: 60000,
            }
        );
        this.namespaceRouter = new NamespaceRouter();
        this._connectionVerified = false;
        this._activeQueries = 0;
    }

    /**
     * Verify driver connectivity. Call this before first query to catch
     * connection issues early with better error messages.
     * @returns {Promise<boolean>}
     */
    async verifyConnectivity() {
        if (this._connectionVerified) return true;
        try {
            await this.driver.verifyConnectivity();
            this._connectionVerified = true;
            console.log('[Memgraph] Connection verified to', MEMGRAPH_URI);
            return true;
        } catch (error) {
            console.error('[Memgraph] Connection verification failed:', error.message);
            throw new Error(`Failed to connect to Memgraph at ${MEMGRAPH_URI}: ${error.message}`);
        }
    }

    /**
     * Get connection pool status for monitoring.
     * @returns {Object} Pool configuration and status
     */
    getConnectionInfo() {
        return {
            uri: MEMGRAPH_URI,
            maxPoolSize: 30,
            activeQueries: this._activeQueries,
            verified: this._connectionVerified,
            driverType: 'neo4j-driver@5.x (shared singleton)',
        };
    }

    /**
     * Default query timeout in milliseconds.
     * Prevents queries from running forever and blocking connections.
     */
    static DEFAULT_QUERY_TIMEOUT_MS = 10000; // 10 seconds

    /**
     * Executes a Cypher query with optional timeout.
     * Uses Promise.race() for timeout since Memgraph doesn't support driver-level txConfig timeout.
     * On timeout, the session is closed to abort the running query.
     *
     * @param {string} cypher - Cypher query string.
     * @param {object} params - Query parameters.
     * @param {string|object} parentTensorIdOrOptions - Parent tensor ID (string) or options object.
     * @param {object} options - Query options (if third param is string).
     * @param {number} options.timeout - Query timeout in milliseconds (default: 10000, 0 = no timeout).
     * @returns {Promise<object>} - Result object.
     */
    async executeQuery(cypher, params = {}, parentTensorIdOrOptions = null, options = {}) {
        // Handle backward-compatible API: third param can be string (parentTensorId) or object (options)
        let parentTensorId = null;
        let queryOptions = options;
        if (typeof parentTensorIdOrOptions === 'string') {
            parentTensorId = parentTensorIdOrOptions;
        } else if (parentTensorIdOrOptions && typeof parentTensorIdOrOptions === 'object') {
            queryOptions = parentTensorIdOrOptions;
            parentTensorId = queryOptions.parentTensorId || null;
        }

        // Default timeout: 10 seconds to prevent hanging queries (0 = no timeout)
        const timeoutMs = queryOptions.timeout ?? MemgraphService.DEFAULT_QUERY_TIMEOUT_MS;

        // Validate query before attempting to run
        if (cypher === undefined || cypher === null) {
            throw new Error('Cypher query is undefined or null');
        }
        if (typeof cypher !== 'string') {
            throw new Error(`Cypher query must be a string, got ${typeof cypher}`);
        }

        // Verify connection on first use
        if (!this._connectionVerified) {
            await this.verifyConnectivity();
        }

        this._activeQueries++;
        const connectionId = uuidv4();
        const tensorService = getTensorServiceLazy();

        // Start tensor tracking
        const tensor = tensorService?.start('db.memgraph.query', {
            queryPreview: cypher.substring(0, 100),
            paramKeys: Object.keys(params),
            timeoutMs
        }, parentTensorId);

        // Track connection
        tensorService?.trackConnection(connectionId, 'memgraph', {
            queryPreview: cypher.substring(0, 100)
        });

        const session = this.driver.session();
        tensorService?.connectionAcquired(connectionId);

        // Track query within connection
        const queryTrackId = tensorService?.startQuery(connectionId, cypher, params);

        // Timeout tracking
        let timedOut = false;
        let timeoutId = null;

        try {
            // Create query promise
            const queryPromise = session.run(cypher, params);

            // Execute with JavaScript-level timeout (Memgraph doesn't support driver txConfig timeout)
            let result;
            if (timeoutMs > 0) {
                const timeoutPromise = new Promise((_, reject) => {
                    timeoutId = setTimeout(() => {
                        timedOut = true;
                        reject(new Error(`Query timeout after ${timeoutMs}ms`));
                    }, timeoutMs);
                });

                result = await Promise.race([queryPromise, timeoutPromise]);
                clearTimeout(timeoutId);
            } else {
                // No timeout - just run the query
                result = await queryPromise;
            }

            // Complete tracking
            tensorService?.completeQuery(connectionId, queryTrackId, {
                rowCount: result.records?.length || 0
            });
            tensorService?.complete(tensor?.id, {
                rowCount: result.records?.length || 0
            });

            return result;
        } catch (error) {
            // Clear timeout if still pending
            if (timeoutId) clearTimeout(timeoutId);

            // Check if this is a timeout error
            const isTimeout = timedOut || error.message?.includes('timeout') ||
                              error.code === 'Neo.TransientError.Transaction.TransactionTimedOut';

            if (isTimeout) {
                console.warn(`[Query ${connectionId}] Timeout (${timeoutMs}ms):`, cypher.substring(0, 100));
            } else {
                console.error(`[Query ${connectionId}] Error:`, error.message);
                console.error(`[Query ${connectionId}] Cypher:`, cypher.substring(0, 150));
            }

            // Track failure
            tensorService?.failQuery(connectionId, queryTrackId, error);
            tensorService?.fail(tensor?.id, error);

            throw error;
        } finally {
            this._activeQueries--;
            tensorService?.closeConnection(connectionId);
            await session.close();
        }
    }

    /**
     * Get current query statistics
     */
    getStats() {
        return {
            activeQueries: this._activeQueries,
            connectionVerified: this._connectionVerified,
            uri: MEMGRAPH_URI
        };
    }

    /**
     * Execute multiple queries in a single session to reduce connection overhead.
     * Based on Memgraph best practice: minimize round-trips for related queries.
     * @param {Array<{cypher: string, params: object}>} queries - Array of queries to execute
     * @param {string} parentTensorId - Optional parent tensor ID
     * @returns {Promise<Array<object>>} - Array of results in same order as queries
     */
    async executeInSession(queries, parentTensorId = null) {
        if (!queries || queries.length === 0) return [];

        if (!this._connectionVerified) {
            await this.verifyConnectivity();
        }

        this._activeQueries++;
        const connectionId = uuidv4();
        const tensorService = getTensorServiceLazy();

        const tensor = tensorService?.start('db.memgraph.executeInSession', {
            queryCount: queries.length
        }, parentTensorId);

        tensorService?.trackConnection(connectionId, 'memgraph', {
            batchSize: queries.length
        });

        const session = this.driver.session();
        tensorService?.connectionAcquired(connectionId);

        try {
            const results = [];
            for (let i = 0; i < queries.length; i++) {
                const { cypher, params = {} } = queries[i];
                const queryTrackId = tensorService?.startQuery(connectionId, cypher, params);
                const result = await session.run(cypher, params);
                tensorService?.completeQuery(connectionId, queryTrackId, {
                    rowCount: result.records?.length || 0
                });
                results.push(result);
            }

            tensorService?.complete(tensor?.id, {
                queryCount: queries.length,
                totalRows: results.reduce((sum, r) => sum + (r.records?.length || 0), 0)
            });

            return results;
        } catch (error) {
            console.error(`[Batch ${connectionId}] Error:`, error.message);
            tensorService?.fail(tensor?.id, error);
            throw error;
        } finally {
            this._activeQueries--;
            tensorService?.closeConnection(connectionId);
            await session.close();
        }
    }

    /**
     * Execute query with optional namespace filter
     * Uses safe parameterized queries instead of regex injection.
     * @param {string} cypher - Cypher query (should use 'n' as node alias for filtering)
     * @param {Object} params - Query parameters
     * @param {string|string[]} namespaceFilter - Namespace(s) to filter
     * @param {string} parentTensorId - Optional parent tensor ID
     * @returns {Promise<Object[]>}
     */
    async queryWithNamespace(cypher, params = {}, namespaceFilter = null, parentTensorId = null) {
        const connectionId = uuidv4();
        const tensorService = getTensorServiceLazy();

        const tensor = tensorService?.start('db.memgraph.queryWithNamespace', {
            queryPreview: cypher.substring(0, 100),
            namespaceFilter
        }, parentTensorId);

        tensorService?.trackConnection(connectionId, 'memgraph', { namespaceFilter });
        const session = this.driver.session();
        tensorService?.connectionAcquired(connectionId);

        try {
            let finalQuery = cypher;
            let finalParams = params;

            // If no namespace filter, just execute the original query
            if (namespaceFilter) {
                const namespaces = Array.isArray(namespaceFilter) ? namespaceFilter : [namespaceFilter];
                const hasWildcard = namespaces.includes('project:*');
                const specificNamespaces = namespaces.filter(ns => ns !== 'project:*');

                // Build namespace filter query using WITH clause pattern
                finalQuery = `
                    CALL {
                        ${cypher}
                    }
                    WITH n
                    WHERE (
                        ($__hasSpecificNs = false OR n.fullNamespace IN $__namespaces)
                        AND ($__hasWildcard = false OR n.namespace = 'project')
                    )
                    RETURN n
                `;

                finalParams = {
                    ...params,
                    __namespaces: specificNamespaces,
                    __hasSpecificNs: specificNamespaces.length > 0,
                    __hasWildcard: hasWildcard
                };
            }

            const queryTrackId = tensorService?.startQuery(connectionId, finalQuery, finalParams);
            const result = await session.run(finalQuery, finalParams);

            tensorService?.completeQuery(connectionId, queryTrackId, { rowCount: result.records?.length || 0 });
            tensorService?.complete(tensor?.id, { rowCount: result.records?.length || 0 });

            return result.records.map(r => r.toObject());
        } catch (error) {
            tensorService?.fail(tensor?.id, error);
            throw error;
        } finally {
            tensorService?.closeConnection(connectionId);
            await session.close();
        }
    }

    /**
     * Merges a node into the graph using 'id' as the key.
     * @param {string} label - Node label.
     * @param {object} properties - Node properties. Must contain 'id'.
     * @param {NamespaceContext|Object} namespaceCtx - Optional namespace context
     */
    async mergeNode(label, properties, namespaceCtx = null, options = {}) {
        if (!properties.id) {
            throw new Error('Properties must contain an "id" field for merging.');
        }

        // FIX-KB-002: Normalize namespace casing to prevent Core/core/CORE inconsistency
        if (properties.namespace) {
            const CANONICAL_NS = { 'core': 'CORE', 'meta': 'META', 'gxe': 'GXE', 'common': 'COMMON', 'project': 'PROJECT', 'youneed': 'YOUNEED' };
            const lower = properties.namespace.toLowerCase();
            if (CANONICAL_NS[lower]) {
                properties.namespace = CANONICAL_NS[lower];
            }
        }

        // CODEX-VALID: Pre-write validation (opt-out via options.skipValidation)
        if (!options.skipValidation) {
            const validationResult = await this.validateBeforeWrite(label, properties);
            if (!validationResult.valid) {
                const isStrict = options.strictValidation ?? CODEX_STRICT_VALIDATION;
                if (isStrict) {
                    throw new SchemaValidationError(
                        validationResult.stage, validationResult.errors, label
                    );
                }
                console.warn(`[CODEX-VALID] Validation failed for ${label} (warn mode):`, validationResult.errors);
            }
        }

        const session = this.driver.session();
        try {
            // Build namespace properties
            let nsProps = {};
            if (namespaceCtx) {
                const ctx = namespaceCtx instanceof NamespaceContext
                    ? namespaceCtx
                    : NamespaceContext.fromObject(namespaceCtx);

                nsProps = {
                    namespace: ctx.namespace,
                    projectId: ctx.projectId,
                    fullNamespace: ctx.fullNamespace,
                    hasCrossNamespaceRefs: ctx.hasCrossNamespaceRefs,
                    crossNamespaceRefs: ctx.crossNamespaceRefs
                };
            }

            // Merge properties with namespace info
            const allProperties = {
                ...properties,
                ...nsProps,
                updatedAt: new Date().toISOString()
            };

            // Ensure createdAt exists
            if (!allProperties.createdAt) {
                allProperties.createdAt = allProperties.updatedAt;
            }

            const query = `
                MERGE (n:${label} { id: $id })
                SET n += $properties
                RETURN n
            `;

            await session.run(query, { id: properties.id, properties: allProperties });
            console.log(`Merged node with label '${label}' and id '${properties.id}'${namespaceCtx ? ` in namespace '${nsProps.fullNamespace}'` : ''}.`);
        } catch (error) {
            console.error('Error merging node:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Merges a relationship between two nodes.
     * @param {string} fromId - ID of the source node.
     * @param {string} toId - ID of the target node.
     * @param {string} type - Relationship type.
     * @param {object} properties - Relationship properties.
     * @param {boolean} isCrossNamespace - Whether this crosses namespaces
     */
    async mergeRelationship(fromId, toId, type, properties = {}, isCrossNamespace = false, options = {}) {
        const session = this.driver.session();
        try {
            // CODEX-CRUD §1.3: Verify both endpoints exist before creating edge
            // Throws RelationshipEndpointNotFoundError by default (explicit failure over silent data loss).
            // Use options.skipEndpointCheck = true to bypass (legacy mode).
            if (!options.skipEndpointCheck) {
                const checkQuery = `
                    OPTIONAL MATCH (a {id: $fromId})
                    OPTIONAL MATCH (b {id: $toId})
                    RETURN a IS NOT NULL AS sourceExists, b IS NOT NULL AS targetExists
                `;
                const checkResult = await session.run(checkQuery, { fromId, toId });
                const record = checkResult.records[0];
                const sourceExists = record?.get('sourceExists');
                const targetExists = record?.get('targetExists');

                if (!sourceExists && !targetExists) {
                    throw new RelationshipEndpointNotFoundError(
                        'BOTH_NOT_FOUND', `${fromId}, ${toId}`, type
                    );
                }
                if (!sourceExists) {
                    throw new RelationshipEndpointNotFoundError(
                        'SOURCE_NOT_FOUND', fromId, type
                    );
                }
                if (!targetExists) {
                    throw new RelationshipEndpointNotFoundError(
                        'TARGET_NOT_FOUND', toId, type
                    );
                }
            }

            const relProps = {
                ...properties,
                isCrossNamespace,
                createdAt: new Date().toISOString()
            };

            const query = `
                MATCH (a), (b)
                WHERE a.id = $fromId AND b.id = $toId
                MERGE (a)-[r:${type}]->(b)
                SET r += $properties
                RETURN r
            `;

            await session.run(query, { fromId, toId, properties: relProps });
            console.log(`Merged relationship '${type}' from '${fromId}' to '${toId}'.`);

            // Mark cross-namespace refs on nodes
            if (isCrossNamespace) {
                await this._markCrossNamespaceRefs(session, fromId, toId);
            }
        } catch (error) {
            console.error('Error merging relationship:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * CODEX-VALID: Pre-write validation for nodes.
     * Validates against BaseNode schema and checks fingerprint collisions.
     * @param {string} label - Node label
     * @param {object} properties - Node properties to validate
     * @returns {{ valid: boolean, errors: Array|null, stage: string }}
     */
    async validateBeforeWrite(label, properties) {
        const registry = getSchemaRegistry();

        // 1. Base schema validation (id, createdAt, namespace)
        const baseResult = registry.validateBaseNode(properties);
        if (!baseResult.valid) {
            return { valid: false, errors: baseResult.errors, stage: 'BASE_SCHEMA' };
        }

        // 2. Domain-specific schema (if registered)
        const domainSchemaId = `codex://schemas/${label.toLowerCase()}`;
        const domainSchema = registry.getSchema(domainSchemaId);
        if (domainSchema) {
            const domainResult = registry.validate(domainSchemaId, properties);
            if (!domainResult.valid) {
                return { valid: false, errors: domainResult.errors, stage: 'DOMAIN_SCHEMA' };
            }
        }

        // 3. Fingerprint collision check (if contentHash present)
        if (properties.contentHash) {
            try {
                const collision = await checkFingerprintCollision(
                    this, properties.contentHash, properties.namespace
                );
                if (collision.exists && collision.action === 'reject') {
                    return {
                        valid: false,
                        errors: [{
                            message: `Fingerprint collision: node ${collision.existingNodeId} has same contentHash`,
                            existingNodeId: collision.existingNodeId,
                        }],
                        stage: 'FINGERPRINT',
                    };
                }
            } catch {
                // Fingerprint check failure should not block writes
            }
        }

        return { valid: true, errors: null, stage: 'PASSED' };
    }

    /**
     * Mark nodes as having cross-namespace references
     * @private
     */
    async _markCrossNamespaceRefs(session, fromId, toId) {
        const query = `
            MATCH (a {id: $fromId}), (b {id: $toId})
            WHERE a.fullNamespace <> b.fullNamespace
            SET a.hasCrossNamespaceRefs = true,
                a.crossNamespaceRefs =
                    CASE WHEN b.fullNamespace IN coalesce(a.crossNamespaceRefs, [])
                    THEN a.crossNamespaceRefs
                    ELSE coalesce(a.crossNamespaceRefs, []) + [b.fullNamespace]
                    END,
                b.hasCrossNamespaceRefs = true,
                b.crossNamespaceRefs =
                    CASE WHEN a.fullNamespace IN coalesce(b.crossNamespaceRefs, [])
                    THEN b.crossNamespaceRefs
                    ELSE coalesce(b.crossNamespaceRefs, []) + [a.fullNamespace]
                    END
            RETURN a.id, b.id
        `;

        await session.run(query, { fromId, toId });
    }

    /**
     * Finds a node by its fileHash property.
     * @param {string} hash - The SHA-256 hash of the file.
     * @returns {Promise<object|null>} - The node object or null if not found.
     */
    async findNodeByHash(hash) {
        const session = this.driver.session();
        try {
            const query = `
                MATCH (n:Document {fileHash: $hash})
                RETURN n
                LIMIT 1
            `;
            const result = await session.run(query, { hash });
            if (result.records.length > 0) {
                return result.records[0].get('n').properties;
            }
            return null;
        } catch (error) {
            console.error('Error finding node by hash:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Get neighbors with namespace awareness
     * Optimized: uses single UNWIND with REDUCE instead of double UNWIND pattern
     * @param {string} nodeId - Center node ID
     * @param {number} depth - Traversal depth
     * @param {string|string[]} namespaceFilter - Filter by namespace(s)
     * @param {boolean} includeCrossNamespace - Include cross-namespace relationships
     */
    async getNeighbors(nodeId, depth = 1, namespaceFilter = null, includeCrossNamespace = false) {
        const session = this.driver.session();

        // Validate depth to prevent injection
        const safeDepth = Math.min(Math.max(1, parseInt(depth) || 1), 5);

        try {
            const params = { nodeId };
            let whereClause = '';

            if (namespaceFilter && !includeCrossNamespace) {
                const namespaces = Array.isArray(namespaceFilter) ? namespaceFilter : [namespaceFilter];
                params.namespaces = namespaces;
                whereClause = 'WHERE neighbor.fullNamespace IN $namespaces';
            } else if (!includeCrossNamespace) {
                whereClause = 'WHERE neighbor.fullNamespace = center.fullNamespace';
            }

            // Optimized query: collect nodes/rels directly during traversal
            // Avoids double UNWIND by using apoc.coll.flatten pattern via REDUCE
            // Added LIMIT to prevent memory issues with large graphs
            const query = `
                MATCH (center {id: $nodeId})
                MATCH path = (center)-[*1..${safeDepth}]-(neighbor)
                ${whereClause}
                WITH path LIMIT 500
                WITH collect(path) AS paths
                WITH REDUCE(allNodes = [], p IN paths |
                    allNodes + [n IN nodes(p) WHERE NOT n IN allNodes | n]
                ) AS nodeList,
                REDUCE(allRels = [], p IN paths |
                    allRels + [r IN relationships(p) WHERE NOT r IN allRels | r]
                ) AS relList
                RETURN nodeList[..300] AS nodes, relList[..500] AS relationships
            `;

            const result = await session.run(query, params);
            const record = result.records[0];

            if (!record) {
                return { nodes: [], relationships: [] };
            }

            const nodes = record.get('nodes') || [];
            const relationships = record.get('relationships') || [];

            // Helper to safely convert Neo4j Integer to string
            const safeIdToString = (value) => {
                if (value === null || value === undefined) return '';
                if (typeof value === 'object' && 'low' in value && 'high' in value) {
                    if (value.high === 0 || value.high === -1) {
                        return String(value.toNumber());
                    }
                    return value.toString();
                }
                return String(value);
            };

            return {
                nodes: nodes.map(n => n.properties),
                relationships: relationships.map(r => ({
                    type: r.type,
                    properties: r.properties,
                    startNodeId: safeIdToString(r.start),
                    endNodeId: safeIdToString(r.end)
                }))
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Get all nodes in a namespace
     * Uses safe label validation instead of direct string interpolation.
     * @param {string} namespace - Full namespace identifier
     * @param {Object} options - Query options
     */
    async getByNamespace(namespace, options = {}) {
        const { limit = 100, offset = 0, labels = [] } = options;
        const session = this.driver.session();

        try {
            // Validate and sanitize labels - only allow whitelisted labels
            const safeLabels = labels
                .map(l => sanitizeLabel(l))
                .filter(l => l && isValidLabel(l));

            // Build label filter only with validated labels
            let labelFilter = '';
            if (safeLabels.length > 0) {
                // Safe: labels have been validated against whitelist
                labelFilter = `AND (${safeLabels.map(l => `n:${l}`).join(' OR ')})`;
            }

            const query = `
                MATCH (n)
                WHERE n.fullNamespace = $namespace ${labelFilter}
                RETURN n
                ORDER BY n.createdAt DESC
                SKIP $offset
                LIMIT $limit
            `;

            const result = await session.run(query, { namespace, offset: neo4j.int(offset), limit: neo4j.int(limit) });
            return result.records.map(r => r.get('n').properties);
        } finally {
            await session.close();
        }
    }

    /**
     * Get statistics for a namespace
     * @param {string} namespace - Full namespace identifier
     */
    async getNamespaceStats(namespace) {
        const session = this.driver.session();

        try {
            // Count nodes by label
            const nodeQuery = `
                MATCH (n)
                WHERE n.fullNamespace = $namespace
                WITH labels(n) as nodeLabels
                UNWIND nodeLabels as label
                RETURN label, count(*) as count
                ORDER BY count DESC
            `;

            const nodeResult = await session.run(nodeQuery, { namespace });
            const labelDistribution = {};
            let nodeCount = 0;

            for (const record of nodeResult.records) {
                const label = record.get('label');
                const count = record.get('count').toNumber ? record.get('count').toNumber() : record.get('count');
                labelDistribution[label] = count;
                nodeCount += count;
            }

            // Count relationships
            const relQuery = `
                MATCH (a)-[r]->(b)
                WHERE a.fullNamespace = $namespace OR b.fullNamespace = $namespace
                RETURN count(DISTINCT r) as relCount
            `;

            const relResult = await session.run(relQuery, { namespace });
            const relationshipCount = relResult.records[0]?.get('relCount')?.toNumber?.() || relResult.records[0]?.get('relCount') || 0;

            // Count cross-namespace relationships
            const crossQuery = `
                MATCH (a)-[r]->(b)
                WHERE a.fullNamespace = $namespace
                    AND b.fullNamespace <> $namespace
                RETURN count(r) as crossCount
            `;

            const crossResult = await session.run(crossQuery, { namespace });
            const crossNamespaceCount = crossResult.records[0]?.get('crossCount')?.toNumber?.() || crossResult.records[0]?.get('crossCount') || 0;

            return {
                nodeCount,
                relationshipCount,
                crossNamespaceCount,
                labelDistribution
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Migrate nodes to a new namespace
     * @param {string[]} nodeIds - Node IDs to migrate
     * @param {string} targetNamespace - Target full namespace
     */
    async migrateToNamespace(nodeIds, targetNamespace) {
        const session = this.driver.session();
        const { namespace, projectId } = this.namespaceRouter.parseNamespace(targetNamespace);

        try {
            const query = `
                UNWIND $nodeIds as nodeId
                MATCH (n {id: nodeId})
                SET n.namespace = $namespace,
                    n.projectId = $projectId,
                    n.fullNamespace = $fullNamespace,
                    n.migratedAt = datetime()
                RETURN n.id as migratedId
            `;

            const result = await session.run(query, {
                nodeIds,
                namespace,
                projectId,
                fullNamespace: targetNamespace
            });

            const migrated = result.records.map(r => r.get('migratedId'));
            const failed = nodeIds.filter(id => !migrated.includes(id));

            return { migrated: migrated.length, failed };
        } finally {
            await session.close();
        }
    }

    /**
     * Validate namespace consistency
     */
    async validateNamespaceConsistency() {
        const session = this.driver.session();

        try {
            const query = `
                MATCH (n)
                WHERE n.namespace IS NOT NULL
                WITH n,
                     n.namespace as ns,
                     n.projectId as pid,
                     n.fullNamespace as fns
                WHERE (ns = 'project' AND pid IS NULL)
                     OR (ns <> 'project' AND pid IS NOT NULL)
                     OR (fns IS NULL)
                     OR (ns = 'project' AND fns <> 'project:' + pid)
                RETURN n.id as nodeId,
                       CASE
                           WHEN ns = 'project' AND pid IS NULL THEN 'Missing projectId for project namespace'
                           WHEN ns <> 'project' AND pid IS NOT NULL THEN 'projectId set for non-project namespace'
                           WHEN fns IS NULL THEN 'Missing fullNamespace'
                           ELSE 'fullNamespace mismatch'
                       END as issue
            `;

            const result = await session.run(query);
            const issues = result.records.map(r => ({
                nodeId: r.get('nodeId'),
                issue: r.get('issue')
            }));

            return {
                valid: issues.length === 0,
                issues
            };
        } finally {
            await session.close();
        }
    }

    /**
     * Create indexes for performance
     * Includes namespace, entity, and document indexes
     */
    async createNamespaceIndexes() {
        const session = this.driver.session();

        try {
            const indexes = [
                // KnowledgeQuantum indexes
                'CREATE INDEX ON :KnowledgeQuantum(namespace)',
                'CREATE INDEX ON :KnowledgeQuantum(fullNamespace)',
                'CREATE INDEX ON :KnowledgeQuantum(projectId)',
                'CREATE INDEX ON :KnowledgeQuantum(quantumId)',
                // Entity indexes for normalized form lookups
                'CREATE INDEX ON :Entity(normalizedForm)',
                'CREATE INDEX ON :Entity(name)',
                // Document indexes for hash-based deduplication
                'CREATE INDEX ON :Document(sourceHash)',
                'CREATE INDEX ON :Document(fileHash)',
                'CREATE INDEX ON :Document(url)'
            ];

            const results = { created: 0, skipped: 0 };

            for (const indexQuery of indexes) {
                try {
                    await session.run(indexQuery);
                    results.created++;
                } catch (e) {
                    // Index might already exist
                    if (e.message.includes('already exists') || e.message.includes('equivalent index')) {
                        results.skipped++;
                    } else {
                        console.warn(`Index creation warning: ${e.message}`);
                    }
                }
            }

            return results;
        } finally {
            await session.close();
        }
    }

    /**
     * Alias for executeQuery — used by IngestionGraphService and MetaLearningRetriever.
     */
    async runQuery(cypher, params = {}) {
        const result = await this.executeQuery(cypher, params, null, { timeout: 30000 });
        if (!result || !result.records) return [];
        return result.records.map(rec => {
            const obj = {};
            for (const key of rec.keys) {
                obj[key] = rec.get(key);
            }
            return obj;
        });
    }

    async close() {
        await this.driver.close();
    }
}

// ────────────────────────────────────────────────────────────────────────────
// POSTGRES-AGE SHIM
// When GRAPH_DB_BACKEND=postgres-age, export a compatibility shim that
// implements the MemgraphService interface on top of PostgresAGEAdapter.
// This lets existing callers (memgraphService.driver, executeQuery, etc.)
// work without code changes during the Memgraph → PostgreSQL+AGE migration.
// ────────────────────────────────────────────────────────────────────────────

if (process.env.GRAPH_DB_BACKEND === 'postgres-age') {
    const { PostgresAGEAdapter } = require('./storage/adapters/PostgresAGEAdapter');

    class AGESession {
        constructor(adapter) { this._adapter = adapter; }

        run(cypher, params = {}) {
            return this._adapter.runQuery(cypher, params);
        }

        writeTransaction(fn) {
            return fn({ run: (c, p = {}) => this._adapter.runQuery(c, p) });
        }

        readTransaction(fn) {
            return fn({ run: (c, p = {}) => this._adapter.runQuery(c, p) });
        }

        close() { return Promise.resolve(); }
    }

    class AGEDriver {
        constructor(adapter) { this._adapter = adapter; }

        session() { return new AGESession(this._adapter); }

        executeRead(fn) {
            return fn({ run: (c, p = {}) => this._adapter.runQuery(c, p) });
        }

        executeWrite(fn) {
            return fn({ run: (c, p = {}) => this._adapter.runQuery(c, p) });
        }

        verifyConnectivity() { return this._adapter.verifyConnectivity(); }

        close() { return Promise.resolve(); }
    }

    class AGEMemgraphShim {
        constructor() {
            this._adapter = new PostgresAGEAdapter();
            this.driver = new AGEDriver(this._adapter);
            this._connectionVerified = false;
        }

        async verifyConnectivity() {
            if (this._connectionVerified) return true;
            const ok = await this._adapter.verifyConnectivity();
            this._connectionVerified = ok;
            console.log('[AGEShim] PostgreSQL+AGE connectivity verified');
            return ok;
        }

        // Returns plain objects (array), matching MemgraphService.runQuery() contract
        async runQuery(cypher, params = {}) {
            const result = await this._adapter.runQuery(cypher, params);
            if (!result || !result.records) return [];
            return result.records.map(rec => rec.toObject());
        }

        async executeQuery(cypher, params = {}) {
            return this._adapter.runQuery(cypher, params);
        }

        async executeInSession(queries) {
            if (!queries || queries.length === 0) return [];
            const normalized = queries.map(q =>
                typeof q === 'string'
                    ? { cypher: q, params: {} }
                    : { cypher: q.cypher || q.query || q, params: q.params || {} }
            );
            return this._adapter.runBatch(normalized);
        }

        async queryWithNamespace(cypher, params = {}, namespaceFilter = null) {
            return this._adapter.runWithNamespace(cypher, params, namespaceFilter);
        }

        getConnectionInfo() {
            return { type: 'postgres-age', uri: process.env.POSTGRES_CONNECTION_STRING ? '(configured)' : '(missing)', ...this._adapter.getStats() };
        }

        getStats() { return this._adapter.getStats(); }

        async getVertexLabelById(graphId) {
            return this._adapter.getVertexLabelById ? this._adapter.getVertexLabelById(graphId) : null;
        }

        async ensureNamespaceIndexes() {
            return this._adapter.ensureNamespaceIndexes();
        }

        async countNodesByNamespace(namespace) {
            return this._adapter.countNodesByNamespace(namespace);
        }

        async countEdgesByNamespace(namespace) {
            return this._adapter.countEdgesByNamespace(namespace);
        }
    }

    const shimInstance = new AGEMemgraphShim();
    module.exports = shimInstance;
    module.exports.MemgraphService = AGEMemgraphShim;
    module.exports.getMemgraphService = () => shimInstance;
    module.exports.getSharedDriver = () => shimInstance.driver;
} else {
    // ────────────────────────────────────────────────────────────────────────
    // SINGLETON FACTORY (Memgraph / default path)
    // ────────────────────────────────────────────────────────────────────────

    /** @type {MemgraphService} */
    let instance = null;

    function getMemgraphService() {
        if (!instance) {
            instance = new MemgraphService();
        }
        return instance;
    }

    function getSharedDriver() {
        return getMemgraphService().driver;
    }

    const singletonInstance = getMemgraphService();
    module.exports = singletonInstance;
    module.exports.MemgraphService = MemgraphService;
    module.exports.getMemgraphService = getMemgraphService;
    module.exports.getSharedDriver = getSharedDriver;
}
