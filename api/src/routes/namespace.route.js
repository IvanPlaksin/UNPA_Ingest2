const express = require('express');
const router = express.Router();
const namespaceController = require('../controllers/namespace.controller');

/**
 * Namespace Management API Routes
 *
 * These routes manage the CoreKnowledge / ProjectKnowledge namespace separation.
 *
 * Namespaces:
 * - core: Knowledge about UN ProjectAdvisor system itself
 * - project:{id}: Extracted knowledge from legacy systems (e.g., project:imis)
 * - meta: Methodological knowledge and extraction strategies
 * - common: Shared vocabulary and reference data
 */

// ============================================================
// NAMESPACE LISTING & INFO
// ============================================================

/**
 * GET /api/v1/namespaces
 * List all available namespaces with configuration
 *
 * Headers:
 *   x-user-role: User role for access control (default: VIEWER)
 *
 * Response: {
 *   success: boolean,
 *   namespaces: Array<{
 *     namespace: string,
 *     displayName: string,
 *     description: string,
 *     hasReadAccess: boolean,
 *     hasWriteAccess: boolean,
 *     storage: { qdrantCollection, redisPrefix },
 *     allowedNodeLabels: string[],
 *     cacheTTL: number
 *   }>,
 *   userRole: string,
 *   availableNamespaces: string[]
 * }
 */
router.get('/', namespaceController.listNamespaces);

/**
 * GET /api/v1/namespaces/projects
 * List all project namespaces (project:*)
 *
 * Response: {
 *   success: boolean,
 *   projects: Array<{
 *     projectId: string,
 *     fullNamespace: string,
 *     nodeCount: number
 *   }>
 * }
 */
router.get('/projects', namespaceController.listProjects);

/**
 * GET /api/v1/namespaces/:namespace/stats
 * Get statistics for a specific namespace
 *
 * Params:
 *   namespace: Full namespace (e.g., "core", "project:imis")
 *
 * Response: {
 *   success: boolean,
 *   namespace: string,
 *   config: { displayName, description },
 *   storage: { graphPrefix, qdrantCollection, redisPrefix },
 *   graph: { nodeCount, relationshipCount, crossNamespaceCount, labelDistribution },
 *   vector: { exists, pointsCount, segmentsCount }
 * }
 */
router.get('/:namespace/stats', namespaceController.getNamespaceStats);

/**
 * GET /api/v1/namespaces/:namespace/nodes
 * Get nodes from a specific namespace
 *
 * Params:
 *   namespace: Full namespace
 *
 * Query:
 *   limit: Max results (default: 100)
 *   offset: Skip results (default: 0)
 *   labels: Comma-separated node labels to filter
 *
 * Response: {
 *   success: boolean,
 *   namespace: string,
 *   nodes: Array,
 *   count: number,
 *   pagination: { limit, offset }
 * }
 */
router.get('/:namespace/nodes', namespaceController.getNamespaceNodes);

// ============================================================
// NAMESPACE OPERATIONS
// ============================================================

/**
 * POST /api/v1/namespaces/:namespace/nodes
 * Create a node in a specific namespace
 *
 * Params:
 *   namespace: Target namespace (core, project, meta, common)
 *
 * Body: {
 *   label: string,           // Node label (e.g., "WorkItem", "Class")
 *   properties: {            // Node properties
 *     id: string,            // Required: unique node ID
 *     name?: string,
 *     ...other properties
 *   },
 *   projectId?: string       // Required for PROJECT namespace
 * }
 *
 * Headers:
 *   x-user-role: User role (needs write access)
 */
router.post('/:namespace/nodes', namespaceController.createNode);

/**
 * POST /api/v1/namespaces/route
 * Route a query to appropriate namespace(s)
 *
 * Body: {
 *   query: string,                    // Query text to analyze
 *   explicitNamespace?: string        // Force specific namespace
 * }
 *
 * Response: {
 *   success: boolean,
 *   query: string,
 *   routing: {
 *     primaryNamespace: string,
 *     additionalNamespaces: string[],
 *     confidence: number,
 *     reasoning: string,
 *     isCrossNamespace: boolean
 *   }
 * }
 */
router.post('/route', namespaceController.routeQuery);

/**
 * POST /api/v1/namespaces/search
 * Search across namespaces with namespace-aware routing
 *
 * Body: {
 *   query?: string,           // Optional query for routing
 *   vector: number[],         // Search vector (required)
 *   namespaces?: string[],    // Specific namespaces to search (optional)
 *   limit?: number            // Results limit (default: 10)
 * }
 *
 * Response: {
 *   success: boolean,
 *   query: string,
 *   searchedNamespaces: string[],
 *   results: Array,           // Merged & sorted results
 *   byNamespace: Object,      // Results grouped by namespace
 *   totalFound: number
 * }
 */
router.post('/search', namespaceController.searchAcrossNamespaces);

// ============================================================
// ADMIN OPERATIONS
// ============================================================

/**
 * POST /api/v1/namespaces/migrate
 * Migrate nodes from one namespace to another (Admin only)
 *
 * Body: {
 *   nodeIds: string[],        // Node IDs to migrate
 *   sourceNamespace?: string, // Source namespace (for logging)
 *   targetNamespace: string   // Target namespace
 * }
 *
 * Headers:
 *   x-user-role: ADMIN (required)
 */
router.post('/migrate', namespaceController.migrateNodes);

/**
 * POST /api/v1/namespaces/validate
 * Validate namespace consistency in the graph (Admin/Architect only)
 *
 * Response: {
 *   success: boolean,
 *   validation: {
 *     valid: boolean,
 *     issues: Array<{ nodeId, issue }>
 *   }
 * }
 */
router.post('/validate', namespaceController.validateNamespaces);

/**
 * POST /api/v1/namespaces/init
 * Initialize all namespace collections (Admin only)
 *
 * Creates:
 * - Qdrant collections for each namespace
 * - Graph indexes for namespace properties
 *
 * Response: {
 *   success: boolean,
 *   message: string,
 *   qdrant: { [namespace]: { success: boolean } },
 *   graph: { created: boolean }
 * }
 */
router.post('/init', namespaceController.initializeNamespaces);

module.exports = router;
