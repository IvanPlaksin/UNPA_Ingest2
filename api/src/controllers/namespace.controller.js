const memgraphService = require('../services/memgraph.service');
const qdrantService = require('../services/qdrant.service');
const { NamespaceRouter } = require('../services/namespace-router.service');
const { NamespaceContext } = require('../models/core-identity');
const {
    KnowledgeNamespace,
    UserRole,
    NAMESPACE_CONFIGS,
    getNamespaceConfig,
    getStoragePaths,
    listEnabledNamespaces
} = require('../config');

const namespaceRouter = new NamespaceRouter();

/**
 * GET /api/v1/namespaces
 * List all available namespaces with their configuration
 */
async function listNamespaces(req, res) {
    try {
        const userRole = req.headers['x-user-role'] || UserRole.VIEWER;

        const namespaces = [];
        for (const [ns, config] of Object.entries(NAMESPACE_CONFIGS)) {
            if (!config.enabled) continue;

            const hasAccess = namespaceRouter.checkAccess(ns, userRole, 'read');

            namespaces.push({
                namespace: ns,
                displayName: config.displayName,
                description: config.description,
                hasReadAccess: hasAccess,
                hasWriteAccess: namespaceRouter.checkAccess(ns, userRole, 'write'),
                storage: {
                    qdrantCollection: config.storage.qdrantCollection,
                    redisPrefix: config.storage.redisPrefix
                },
                allowedNodeLabels: config.allowedNodeLabels,
                cacheTTL: config.cacheTTL
            });
        }

        res.json({
            success: true,
            namespaces,
            userRole,
            availableNamespaces: namespaceRouter.getAvailableNamespaces(userRole)
        });
    } catch (error) {
        console.error('Error listing namespaces:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * GET /api/v1/namespaces/:namespace/stats
 * Get statistics for a specific namespace
 */
async function getNamespaceStats(req, res) {
    try {
        const { namespace } = req.params;
        const userRole = req.headers['x-user-role'] || UserRole.VIEWER;

        // Check access
        if (!namespaceRouter.checkAccess(namespace, userRole, 'read')) {
            return res.status(403).json({
                success: false,
                error: `Access denied to namespace: ${namespace}`
            });
        }

        // Get stats from both storages
        const [graphStats, vectorStats] = await Promise.all([
            memgraphService.getNamespaceStats(namespace),
            qdrantService.getNamespaceStats(namespace)
        ]);

        const config = getNamespaceConfig(namespace);
        const storagePaths = getStoragePaths(namespace);

        res.json({
            success: true,
            namespace,
            config: {
                displayName: config?.displayName,
                description: config?.description
            },
            storage: storagePaths,
            graph: graphStats,
            vector: vectorStats,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error getting namespace stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * GET /api/v1/namespaces/:namespace/nodes
 * Get nodes from a specific namespace
 */
async function getNamespaceNodes(req, res) {
    try {
        const { namespace } = req.params;
        const { limit = 100, offset = 0, labels } = req.query;
        const userRole = req.headers['x-user-role'] || UserRole.VIEWER;

        // Check access
        if (!namespaceRouter.checkAccess(namespace, userRole, 'read')) {
            return res.status(403).json({
                success: false,
                error: `Access denied to namespace: ${namespace}`
            });
        }

        const labelArray = labels ? labels.split(',') : [];

        const nodes = await memgraphService.getByNamespace(namespace, {
            limit: parseInt(limit),
            offset: parseInt(offset),
            labels: labelArray
        });

        res.json({
            success: true,
            namespace,
            nodes,
            count: nodes.length,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Error getting namespace nodes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * POST /api/v1/namespaces/:namespace/nodes
 * Create a node in a specific namespace
 */
async function createNode(req, res) {
    try {
        const { namespace } = req.params;
        const { label, properties, projectId } = req.body;
        const userRole = req.headers['x-user-role'] || UserRole.DEVELOPER;

        // Check write access
        if (!namespaceRouter.checkAccess(namespace, userRole, 'write')) {
            return res.status(403).json({
                success: false,
                error: `Write access denied to namespace: ${namespace}`
            });
        }

        if (!label || !properties || !properties.id) {
            return res.status(400).json({
                success: false,
                error: 'label, properties, and properties.id are required'
            });
        }

        // Build namespace context
        let fullNamespace = namespace;
        if (namespace === KnowledgeNamespace.PROJECT) {
            if (!projectId) {
                return res.status(400).json({
                    success: false,
                    error: 'projectId is required for PROJECT namespace'
                });
            }
            fullNamespace = `project:${projectId}`;
        }

        const namespaceCtx = NamespaceContext.fromFullNamespace(fullNamespace);

        // Create node
        await memgraphService.mergeNode(label, properties, namespaceCtx);

        res.status(201).json({
            success: true,
            message: `Node created in namespace '${fullNamespace}'`,
            nodeId: properties.id,
            namespace: fullNamespace
        });
    } catch (error) {
        console.error('Error creating node:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * POST /api/v1/namespaces/route
 * Route a query to appropriate namespace(s)
 */
async function routeQuery(req, res) {
    try {
        const { query, explicitNamespace } = req.body;
        const userRole = req.headers['x-user-role'] || UserRole.VIEWER;
        const userId = req.headers['x-user-id'] || 'anonymous';

        if (!query) {
            return res.status(400).json({
                success: false,
                error: 'query is required'
            });
        }

        const routingDecision = await namespaceRouter.route({
            query,
            explicitNamespace,
            userRole,
            userId,
            source: 'api'
        });

        res.json({
            success: true,
            query,
            routing: routingDecision
        });
    } catch (error) {
        console.error('Error routing query:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * POST /api/v1/namespaces/search
 * Search across namespaces with namespace-aware routing
 */
async function searchAcrossNamespaces(req, res) {
    try {
        const { query, vector, namespaces, limit = 10 } = req.body;
        const userRole = req.headers['x-user-role'] || UserRole.VIEWER;

        if (!vector || !Array.isArray(vector)) {
            return res.status(400).json({
                success: false,
                error: 'vector array is required'
            });
        }

        // Determine which namespaces to search
        let targetNamespaces = namespaces;
        if (!targetNamespaces || targetNamespaces.length === 0) {
            // Route automatically based on query
            if (query) {
                const routing = await namespaceRouter.route({
                    query,
                    userRole,
                    source: 'api'
                });
                targetNamespaces = [routing.primaryNamespace, ...routing.additionalNamespaces];
            } else {
                // Search all accessible namespaces
                targetNamespaces = namespaceRouter.getAvailableNamespaces(userRole);
            }
        }

        // Filter to accessible namespaces
        targetNamespaces = targetNamespaces.filter(ns =>
            namespaceRouter.checkAccess(ns, userRole, 'read')
        );

        // Search across namespaces
        const results = await qdrantService.searchAcrossNamespaces(
            vector,
            targetNamespaces,
            parseInt(limit)
        );

        // Merge and sort results
        const allResults = [];
        for (const [ns, nsResult] of Object.entries(results)) {
            if (nsResult.results && nsResult.results.length > 0) {
                nsResult.results.forEach(r => {
                    allResults.push({
                        ...r,
                        namespace: ns
                    });
                });
            }
        }

        // Sort by score
        allResults.sort((a, b) => (b.score || 0) - (a.score || 0));

        res.json({
            success: true,
            query,
            searchedNamespaces: targetNamespaces,
            results: allResults.slice(0, parseInt(limit)),
            byNamespace: results,
            totalFound: allResults.length
        });
    } catch (error) {
        console.error('Error searching across namespaces:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * POST /api/v1/namespaces/migrate
 * Migrate nodes from one namespace to another
 */
async function migrateNodes(req, res) {
    try {
        const { nodeIds, sourceNamespace, targetNamespace } = req.body;
        const userRole = req.headers['x-user-role'] || UserRole.ADMIN;

        // Only admins can migrate
        if (userRole !== UserRole.ADMIN) {
            return res.status(403).json({
                success: false,
                error: 'Only administrators can migrate nodes between namespaces'
            });
        }

        if (!nodeIds || !Array.isArray(nodeIds) || nodeIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'nodeIds array is required'
            });
        }

        if (!targetNamespace) {
            return res.status(400).json({
                success: false,
                error: 'targetNamespace is required'
            });
        }

        // Migrate in graph
        const graphResult = await memgraphService.migrateToNamespace(nodeIds, targetNamespace);

        res.json({
            success: true,
            message: `Migration completed`,
            graph: graphResult,
            sourceNamespace,
            targetNamespace
        });
    } catch (error) {
        console.error('Error migrating nodes:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * POST /api/v1/namespaces/validate
 * Validate namespace consistency in the graph
 */
async function validateNamespaces(req, res) {
    try {
        const userRole = req.headers['x-user-role'] || UserRole.ADMIN;

        // Only admins can validate
        if (userRole !== UserRole.ADMIN && userRole !== UserRole.ARCHITECT) {
            return res.status(403).json({
                success: false,
                error: 'Only administrators and architects can validate namespaces'
            });
        }

        const validation = await memgraphService.validateNamespaceConsistency();

        res.json({
            success: true,
            validation,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error validating namespaces:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * POST /api/v1/namespaces/init
 * Initialize all namespace collections
 */
async function initializeNamespaces(req, res) {
    try {
        const userRole = req.headers['x-user-role'] || UserRole.ADMIN;

        // Only admins can initialize
        if (userRole !== UserRole.ADMIN) {
            return res.status(403).json({
                success: false,
                error: 'Only administrators can initialize namespaces'
            });
        }

        // Initialize Qdrant collections
        const qdrantResult = await qdrantService.initAllNamespaceCollections();

        // Create graph indexes
        const graphResult = await memgraphService.createNamespaceIndexes();

        res.json({
            success: true,
            message: 'Namespace storage initialized',
            qdrant: qdrantResult,
            graph: graphResult,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error initializing namespaces:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

/**
 * GET /api/v1/namespaces/projects
 * List all project namespaces (project:*)
 */
async function listProjects(req, res) {
    try {
        const userRole = req.headers['x-user-role'] || UserRole.VIEWER;

        // Check access to project namespace
        if (!namespaceRouter.checkAccess('project', userRole, 'read')) {
            return res.status(403).json({
                success: false,
                error: 'Access denied to project namespaces'
            });
        }

        // Query for distinct project IDs
        const result = await memgraphService.executeQuery(`
            MATCH (n)
            WHERE n.namespace = 'project' AND n.projectId IS NOT NULL
            RETURN DISTINCT n.projectId as projectId, count(n) as nodeCount
            ORDER BY nodeCount DESC
        `);

        const projects = result.records.map(r => ({
            projectId: r.get('projectId'),
            fullNamespace: `project:${r.get('projectId')}`,
            nodeCount: r.get('nodeCount').toNumber ? r.get('nodeCount').toNumber() : r.get('nodeCount')
        }));

        res.json({
            success: true,
            projects,
            count: projects.length
        });
    } catch (error) {
        console.error('Error listing projects:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = {
    listNamespaces,
    getNamespaceStats,
    getNamespaceNodes,
    createNode,
    routeQuery,
    searchAcrossNamespaces,
    migrateNodes,
    validateNamespaces,
    initializeNamespaces,
    listProjects
};
