/**
 * Knowledge Routes
 * IMPORTANT: Uses shared memgraph.service driver to avoid connection pool exhaustion.
 * Do NOT create separate neo4j.driver() instances!
 */

const express = require('express');
const router = express.Router();
const knowledgeController = require('../controllers/knowledge.controller');
const neo4j = require('neo4j-driver');

// Import text processing pipeline services
const { HybridSearch, createHybridSearch } = require('../services/retrieval/hybrid-search');
const { resultFusion, fuseMultiple } = require('../services/retrieval/result-fusion');
const { TextSanitizer } = require('../services/preprocessing/sanitizer.service');
const { LanguageDetector } = require('../services/preprocessing/language-detector');
const { TextChunker } = require('../services/chunking/text-chunker');
const { EntityExtractor } = require('../services/extraction/entity-extractor');
const { EmbeddingService } = require('../services/retrieval/embedding.service');
const { QueryExpansionService } = require('../services/retrieval/query-expansion.service');
const { RerankerService } = require('../services/retrieval/reranker.service');
const qdrantService = require('../services/qdrant.service');

// Use shared memgraph service (singleton) to avoid multiple driver instances
const memgraphService = require('../services/memgraph.service');

/**
 * Safely convert Neo4j Integer to string without creating many Integer objects.
 * Uses toNumber() which is more memory-efficient than toString() for identities.
 * @param {*} value - Neo4j Integer or regular number
 * @returns {string} String representation
 */
function safeIdToString(value) {
    if (value === null || value === undefined) return '';
    // Check if it's a Neo4j Integer (has low/high properties)
    if (typeof value === 'object' && 'low' in value && 'high' in value) {
        // Use toNumber for small values, toString only when necessary
        if (value.high === 0 || value.high === -1) {
            return String(value.toNumber());
        }
        return value.toString();
    }
    return String(value);
}

// Запуск задачи
router.post('/ingest', knowledgeController.ingestWorkItems);

// Поток событий (SSE)
router.get('/stream/:jobId', knowledgeController.streamIngestionStatus);

// Агрегация контекста
router.get('/context/:id', knowledgeController.getContext);

// Multer setup for file uploads
const multer = require('multer');
const upload = multer({ dest: 'uploads/' }); // Temp storage

// Симуляция Ingestion
router.post('/simulate', knowledgeController.processContext);
// Use multer to handle multipart/form-data (both file and fields)
router.post('/analyze-attachment', upload.single('file'), knowledgeController.analyzeAttachment);
router.post('/vectorize-query', knowledgeController.vectorizeQuery);

// ============================================================
// KNOWLEDGE GRAPH ROUTES (Memgraph Integration)
// ============================================================

// Memgraph URI for health check reporting
const MEMGRAPH_URI = process.env.MEMGRAPH_URI || 'bolt://localhost:7687';

// Helper function to execute Cypher queries using shared driver
async function executeCypher(query, params = {}) {
    const result = await memgraphService.executeQuery(query, params);
    return result.records || [];
}

/**
 * GET /api/v1/knowledge/graph
 * Fetch entire knowledge graph
 */
router.get('/graph', async (req, res) => {
    try {
        const { type, limit = 100 } = req.query;
        const limitValue = parseInt(limit) || 100;

        // Build query based on filters
        let nodeQuery = 'MATCH (n)';

        if (type) {
            const types = Array.isArray(type) ? type : [type];
            nodeQuery += ` WHERE ${types.map((t, i) => `'${t}' IN labels(n)`).join(' OR ')}`;
        }

        // Use inline limit value instead of parameter (Memgraph limitation)
        nodeQuery += ` RETURN n LIMIT ${limitValue}`;

        // Fetch nodes
        const nodeRecords = await executeCypher(nodeQuery, {});
        const nodes = nodeRecords.map(record => {
            const node = record.get('n');
            return {
                id: safeIdToString(node.identity),
                labels: node.labels,
                properties: node.properties
            };
        });

        // Fetch edges
        const nodeIds = nodes.map(n => parseInt(n.id));

        if (nodeIds.length === 0) {
            return res.json({ nodes: [], edges: [] });
        }

        const edgeQuery = `
            MATCH (a)-[r]->(b)
            WHERE id(a) IN [${nodeIds.join(',')}] AND id(b) IN [${nodeIds.join(',')}]
            RETURN id(a) as source, id(b) as target, type(r) as type, properties(r) as properties
        `;

        const edgeRecords = await executeCypher(edgeQuery, {});
        const edges = edgeRecords.map(record => ({
            source: safeIdToString(record.get('source')),
            target: safeIdToString(record.get('target')),
            type: record.get('type'),
            properties: record.get('properties') || {}
        }));

        res.json({ nodes, edges });
    } catch (error) {
        console.error('Error fetching knowledge graph:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/stats
 * Get graph statistics
 */
router.get('/stats', async (req, res) => {
    try {
        // Count nodes by type
        const nodeCountQuery = `
            MATCH (n)
            RETURN labels(n)[0] as type, count(n) as count
        `;
        const nodeRecords = await executeCypher(nodeCountQuery);
        const nodeCounts = {};
        nodeRecords.forEach(record => {
            const type = record.get('type');
            const count = record.get('count').toNumber();
            nodeCounts[type] = count;
        });

        // Count relationships by type
        const relCountQuery = `
            MATCH ()-[r]->()
            RETURN type(r) as type, count(r) as count
        `;
        const relRecords = await executeCypher(relCountQuery);
        const relCounts = {};
        relRecords.forEach(record => {
            const type = record.get('type');
            const count = record.get('count').toNumber();
            relCounts[type] = count;
        });

        // Total counts
        const totalNodesQuery = 'MATCH (n) RETURN count(n) as count';
        const totalEdgesQuery = 'MATCH ()-[r]->() RETURN count(r) as count';

        const totalNodesRecords = await executeCypher(totalNodesQuery);
        const totalEdgesRecords = await executeCypher(totalEdgesQuery);

        const totalNodes = totalNodesRecords[0].get('count').toNumber();
        const totalEdges = totalEdgesRecords[0].get('count').toNumber();

        res.json({
            totalNodes,
            totalEdges,
            nodesByType: nodeCounts,
            edgesByType: relCounts
        });
    } catch (error) {
        console.error('Error fetching graph stats:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/node/:nodeId
 * Get node details by ID
 */
router.get('/node/:nodeId', async (req, res) => {
    try {
        const { nodeId } = req.params;

        const query = 'MATCH (n) WHERE id(n) = $nodeId RETURN n';
        const records = await executeCypher(query, { nodeId: parseInt(nodeId) });

        if (records.length === 0) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const node = records[0].get('n');
        res.json({
            id: safeIdToString(node.identity),
            labels: node.labels,
            properties: node.properties
        });
    } catch (error) {
        console.error('Error fetching node details:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/knowledge/query
 * Execute custom Cypher query (read-only)
 */
router.post('/query', async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        // Security: Only allow read queries
        const upperQuery = query.trim().toUpperCase();
        if (!upperQuery.startsWith('MATCH') && !upperQuery.startsWith('RETURN')) {
            return res.status(403).json({ error: 'Only read queries (MATCH/RETURN) are allowed' });
        }

        const records = await executeCypher(query);
        const results = records.map(record => {
            const obj = {};
            record.keys.forEach(key => {
                const value = record.get(key);
                if (value && value.labels && value.properties) {
                    // It's a node
                    obj[key] = {
                        id: safeIdToString(value.identity),
                        labels: value.labels,
                        properties: value.properties
                    };
                } else {
                    obj[key] = value;
                }
            });
            return obj;
        });

        res.json({ results, count: results.length });
    } catch (error) {
        console.error('Error executing Cypher query:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/planes
 * Fetch data formatted for Knowledge Planes visualization
 * Maps node types to 5 knowledge layers with vector-based positioning
 */
router.get('/planes', async (req, res) => {
    try {
        const { projectId, limit = 200 } = req.query;

        // Define layer mappings - includes actual node types from database
        const layerMappings = {
            strategic: ['KPI', 'OKR', 'Goal', 'Strategy', 'Vision', 'Initiative', 'Project'],
            business: ['Epic', 'Feature', 'Process', 'Workflow', 'Capability', 'BusinessRule', 'Requirement', 'Knowledge'],
            tasks: ['WorkItem', 'Task', 'Bug', 'Story', 'Spike', 'Sprint', 'Milestone', 'UserStory'],
            code: ['File', 'Class', 'Function', 'Method', 'Module', 'Interface', 'Commit', 'Changeset', 'Component', 'Artifact'],
            infrastructure: ['Database', 'Service', 'Server', 'Cluster', 'Queue', 'Cache', 'LoadBalancer', 'Pod', 'Container']
        };

        const limitValue = parseInt(limit) || 200;

        // Layout configuration
        const MIN_NODE_DISTANCE = 40;  // Minimum distance between nodes
        const REPULSION_STRENGTH = 500;
        const LAYOUT_ITERATIONS = 50;
        const PLANE_WIDTH = 300;
        const PLANE_HEIGHT = 200;

        // Build query to fetch nodes
        let nodeQuery = `MATCH (n)`;
        if (projectId) {
            nodeQuery += ` WHERE n.projectId = '${projectId}'`;
        }
        nodeQuery += ` RETURN n, labels(n) as nodeLabels LIMIT ${limitValue}`;

        const nodeRecords = await executeCypher(nodeQuery);

        // Process nodes and assign to layers
        const nodes = [];
        const nodeIdMap = new Map();
        const nodesByPlane = {
            strategic: [],
            business: [],
            tasks: [],
            code: [],
            infrastructure: []
        };

        nodeRecords.forEach(record => {
            const node = record.get('n');
            const nodeLabels = record.get('nodeLabels') || [];
            const nodeId = safeIdToString(node.identity);

            // Determine which layer this node belongs to
            let assignedPlane = null;
            for (const [plane, types] of Object.entries(layerMappings)) {
                if (nodeLabels.some(label => types.includes(label))) {
                    assignedPlane = plane;
                    break;
                }
            }

            // Skip nodes that don't fit any layer
            if (!assignedPlane) return;

            // Check if node has vector coordinates from database
            const hasVectorCoords = node.properties.embeddingX !== undefined &&
                                    node.properties.embeddingY !== undefined;

            // Initial position: use vector coords or generate seeded random
            let x, y;
            if (hasVectorCoords) {
                x = node.properties.embeddingX;
                y = node.properties.embeddingY;
            } else {
                // Use deterministic hash for initial position (reproducible)
                const hash = nodeId.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) | 0, 0);
                const angle = (hash & 0xFFFF) / 0xFFFF * Math.PI * 2;
                const radius = 50 + ((hash >> 16) & 0xFF) / 255 * 100;
                x = Math.cos(angle) * radius;
                y = Math.sin(angle) * radius;
            }

            const nodeData = {
                id: nodeId,
                label: node.properties.name || node.properties.title || node.properties.workItemId || `Node ${nodeId}`,
                type: nodeLabels[0]?.toLowerCase() || 'unknown',
                plane: assignedPlane,
                x,
                y,
                vx: 0,  // velocity for force simulation
                vy: 0,
                hasVectorCoords,
                vector: [Math.random(), Math.random(), Math.random(), Math.random()],
                semanticDomain: node.properties.semanticDomain || assignedPlane,
                properties: node.properties,
                isBridge: false
            };

            nodes.push(nodeData);
            nodeIdMap.set(nodeId, nodeData);
            nodesByPlane[assignedPlane].push(nodeData);
        });

        // Force-directed layout simulation per plane
        // Only apply to nodes without vector coordinates
        Object.entries(nodesByPlane).forEach(([plane, planeNodes]) => {
            if (planeNodes.length <= 1) return;

            // Run force simulation iterations
            for (let iter = 0; iter < LAYOUT_ITERATIONS; iter++) {
                const alpha = 1 - iter / LAYOUT_ITERATIONS;  // Cooling factor

                // Calculate repulsion forces between all node pairs
                for (let i = 0; i < planeNodes.length; i++) {
                    const nodeA = planeNodes[i];
                    if (nodeA.hasVectorCoords) continue;  // Skip nodes with fixed coordinates

                    for (let j = i + 1; j < planeNodes.length; j++) {
                        const nodeB = planeNodes[j];

                        const dx = nodeB.x - nodeA.x;
                        const dy = nodeB.y - nodeA.y;
                        const distSq = dx * dx + dy * dy;
                        const dist = Math.sqrt(distSq) || 0.1;

                        // Repulsion force (inverse square law with minimum distance)
                        if (dist < MIN_NODE_DISTANCE * 2) {
                            const force = REPULSION_STRENGTH / (distSq + 100) * alpha;
                            const fx = (dx / dist) * force;
                            const fy = (dy / dist) * force;

                            if (!nodeA.hasVectorCoords) {
                                nodeA.vx -= fx;
                                nodeA.vy -= fy;
                            }
                            if (!nodeB.hasVectorCoords) {
                                nodeB.vx += fx;
                                nodeB.vy += fy;
                            }
                        }
                    }

                    // Center attraction (weak) to prevent drift
                    nodeA.vx -= nodeA.x * 0.01 * alpha;
                    nodeA.vy -= nodeA.y * 0.01 * alpha;
                }

                // Apply velocities and damping
                planeNodes.forEach(node => {
                    if (node.hasVectorCoords) return;

                    node.x += node.vx * 0.5;
                    node.y += node.vy * 0.5;
                    node.vx *= 0.8;  // Damping
                    node.vy *= 0.8;

                    // Constrain to plane bounds
                    node.x = Math.max(-PLANE_WIDTH / 2, Math.min(PLANE_WIDTH / 2, node.x));
                    node.y = Math.max(-PLANE_HEIGHT / 2, Math.min(PLANE_HEIGHT / 2, node.y));
                });
            }

            // Final collision resolution pass
            for (let pass = 0; pass < 10; pass++) {
                let hasCollision = false;
                for (let i = 0; i < planeNodes.length; i++) {
                    const nodeA = planeNodes[i];
                    for (let j = i + 1; j < planeNodes.length; j++) {
                        const nodeB = planeNodes[j];

                        const dx = nodeB.x - nodeA.x;
                        const dy = nodeB.y - nodeA.y;
                        const dist = Math.sqrt(dx * dx + dy * dy) || 0.1;

                        if (dist < MIN_NODE_DISTANCE) {
                            hasCollision = true;
                            const overlap = MIN_NODE_DISTANCE - dist;
                            const pushX = (dx / dist) * overlap * 0.5;
                            const pushY = (dy / dist) * overlap * 0.5;

                            if (!nodeA.hasVectorCoords) {
                                nodeA.x -= pushX;
                                nodeA.y -= pushY;
                            }
                            if (!nodeB.hasVectorCoords) {
                                nodeB.x += pushX;
                                nodeB.y += pushY;
                            }
                        }
                    }
                }
                if (!hasCollision) break;
            }

            // Clean up temporary velocity properties
            planeNodes.forEach(node => {
                delete node.vx;
                delete node.vy;
            });
        });

        // Fetch relationships
        const nodeIds = nodes.map(n => parseInt(n.id));

        if (nodeIds.length === 0) {
            return res.json({
                nodes: [],
                edges: [],
                bridges: [],
                ancestorMap: {},
                metadata: {
                    projectId,
                    generatedAt: new Date().toISOString(),
                    stats: { totalNodes: 0, totalEdges: 0, crossLayerEdges: 0 }
                }
            });
        }

        const edgeQuery = `
            MATCH (a)-[r]->(b)
            WHERE id(a) IN [${nodeIds.join(',')}] AND id(b) IN [${nodeIds.join(',')}]
            RETURN id(a) as sourceId, id(b) as targetId, type(r) as relType, properties(r) as relProps
        `;

        const edgeRecords = await executeCypher(edgeQuery);

        const edges = [];
        const crossLayerNodeIds = new Set();

        edgeRecords.forEach(record => {
            const sourceId = record.get('sourceId').toString();
            const targetId = record.get('targetId').toString();
            const relType = record.get('relType');
            const relProps = record.get('relProps') || {};

            const sourceNode = nodeIdMap.get(sourceId);
            const targetNode = nodeIdMap.get(targetId);

            if (!sourceNode || !targetNode) return;

            const crossLayer = sourceNode.plane !== targetNode.plane;

            if (crossLayer) {
                crossLayerNodeIds.add(sourceId);
                crossLayerNodeIds.add(targetId);
            }

            // Map relationship type to edge type
            const edgeTypeMap = {
                'IMPLEMENTS': 'implements',
                'SUBTASK_OF': 'subtask',
                'CONTAINS': 'contains',
                'DEPENDS_ON': 'depends',
                'REFERENCES': 'uses',
                'DEPLOYED_ON': 'deploys',
                'TRACKS': 'tracks',
                'DERIVES_FROM': 'derives',
                'CONFIGURES': 'configures',
                'RELATES_TO': 'depends',
                'CHILD_OF': 'subtask',
                'PARENT_OF': 'contains'
            };

            edges.push({
                source: sourceId,
                target: targetId,
                type: edgeTypeMap[relType] || relType.toLowerCase(),
                crossLayer,
                plane: crossLayer ? null : sourceNode.plane,
                description: relProps.description || `${relType}: ${sourceNode.label} → ${targetNode.label}`,
                similarity: relProps.similarity || 0.8
            });
        });

        // Mark bridge nodes
        crossLayerNodeIds.forEach(nodeId => {
            const node = nodeIdMap.get(nodeId);
            if (node) {
                node.isBridge = true;
                node.bridgeId = `bridge-${nodeId}`;
            }
        });

        // Build ancestor map for highlighting
        const ancestorMap = {};
        const buildAncestors = (nodeId, visited = new Set()) => {
            if (visited.has(nodeId)) return [];
            visited.add(nodeId);

            const ancestors = [];
            edges.forEach(edge => {
                if (edge.target === nodeId) {
                    ancestors.push({ nodeId: edge.source, edgeType: edge.type });
                    ancestors.push(...buildAncestors(edge.source, visited));
                }
            });
            return ancestors;
        };

        nodes.forEach(node => {
            ancestorMap[node.id] = buildAncestors(node.id);
        });

        // Build bridges array
        const bridges = [];
        const processedBridges = new Set();

        crossLayerNodeIds.forEach(nodeId => {
            const node = nodeIdMap.get(nodeId);
            if (!node || processedBridges.has(node.bridgeId)) return;

            // Find all nodes connected across layers
            const bridgePlanes = new Set([node.plane]);
            const instances = { [node.plane]: node };

            edges.filter(e => e.crossLayer && (e.source === nodeId || e.target === nodeId))
                .forEach(edge => {
                    const otherId = edge.source === nodeId ? edge.target : edge.source;
                    const otherNode = nodeIdMap.get(otherId);
                    if (otherNode && !bridgePlanes.has(otherNode.plane)) {
                        bridgePlanes.add(otherNode.plane);
                        instances[otherNode.plane] = otherNode;
                    }
                });

            if (bridgePlanes.size > 1) {
                bridges.push({
                    bridgeId: node.bridgeId,
                    label: node.label,
                    planes: Array.from(bridgePlanes),
                    instances,
                    vector: node.vector,
                    primaryDomain: node.semanticDomain
                });
                processedBridges.add(node.bridgeId);
            }
        });

        res.json({
            nodes,
            edges,
            bridges,
            ancestorMap,
            metadata: {
                projectId,
                generatedAt: new Date().toISOString(),
                stats: {
                    totalNodes: nodes.length,
                    totalEdges: edges.length,
                    crossLayerEdges: edges.filter(e => e.crossLayer).length,
                    bridgeNodes: bridges.length,
                    nodesByPlane: {
                        strategic: nodes.filter(n => n.plane === 'strategic').length,
                        business: nodes.filter(n => n.plane === 'business').length,
                        tasks: nodes.filter(n => n.plane === 'tasks').length,
                        code: nodes.filter(n => n.plane === 'code').length,
                        infrastructure: nodes.filter(n => n.plane === 'infrastructure').length
                    }
                }
            }
        });
    } catch (error) {
        console.error('Error fetching knowledge planes data:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================
// HYBRID SEARCH ROUTES
// ============================================================

// Initialize text processing services
const sanitizer = new TextSanitizer({
    removeHtml: true,
    normalizeWhitespace: true,
    preserveCodeBlocks: true
});

const languageDetector = new LanguageDetector({
    defaultLanguage: 'en',
    minConfidence: 0.3
});

const entityExtractor = new EntityExtractor({
    extractStructuredData: true,
    enableSemanticExtraction: false
});

// Initialize embedding service for vector search
const embeddingService = new EmbeddingService({
    teiUrl: process.env.TEI_URL || 'http://localhost:8081',
    vectorSize: parseInt(process.env.VECTOR_SIZE) || 1024,
    enableCache: true,
    cacheMaxSize: 500
});

// Qdrant collection name
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'embeddings_unified';

// Initialize query expansion service with UN-specific terminology
const queryExpander = new QueryExpansionService({
    maxSynonyms: 3,
    maxSystemExpansions: 2,
    enableRelatedExpansion: true,
    expandAcronyms: true
});

// Initialize reranker service
const reranker = new RerankerService({
    diversityWeight: 0.3,
    recencyWeight: 0.1,
    titleMatchBoost: 0.05,
    exactPhraseBoost: 0.1,
    entityMatchBoost: 0.03,
    useCrossEncoder: false // Will enable when cross-encoder service is available
});

/**
 * POST /api/v1/knowledge/search/hybrid
 * Perform hybrid search combining vector similarity and graph traversal
 *
 * Body: {
 *   query: string,           // Search query
 *   options?: {
 *     vectorWeight?: number, // Weight for vector results (0-1)
 *     graphWeight?: number,  // Weight for graph results (0-1)
 *     maxResults?: number,   // Maximum results to return
 *     fusionMethod?: 'rrf' | 'linear' | 'max', // Fusion algorithm
 *     layer?: string,        // Filter by layer (Strategic, Business, Code)
 *     entityTypes?: string[] // Filter by entity types
 *   }
 * }
 */
router.post('/search/hybrid', async (req, res) => {
    try {
        const { query, options = {} } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Query string is required'
            });
        }

        const startTime = Date.now();

        // Default options
        const searchOptions = {
            vectorWeight: parseFloat(process.env.VECTOR_WEIGHT) || 0.6,
            graphWeight: parseFloat(process.env.GRAPH_WEIGHT) || 0.4,
            maxResults: parseInt(process.env.SEARCH_MAX_RESULTS) || 15,
            fusionMethod: 'rrf',
            rrf_k: parseInt(process.env.RRF_K) || 60,
            ...options
        };

        // Step 1: Sanitize and analyze query
        const sanitized = sanitizer.clean(query);
        const language = languageDetector.detect(sanitized);

        // Step 2: Extract entities from query for graph search
        const queryEntities = await entityExtractor.extract(sanitized, {
            context: 'search_query',
            language: language.language
        });

        // Step 3: Extract keywords for graph keyword search
        const keywords = sanitized
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3)
            .slice(0, 10);

        // Step 4: Vector search using embedding service + Qdrant
        let vectorResults = [];

        try {
            // Generate query embedding
            const embeddingResult = await embeddingService.embed(sanitized);

            if (embeddingResult.embedding && !embeddingResult.error) {
                // Search in Qdrant
                const qdrantResults = await qdrantService.searchSimilar(
                    embeddingResult.embedding,
                    searchOptions.maxResults * 2, // Get more for fusion
                    searchOptions.vectorFilter || null
                );

                vectorResults = qdrantResults.map((r, index) => ({
                    id: r.payload?.original_id || r.id,
                    content: r.payload?.text || r.payload?.content,
                    score: r.score,
                    source: 'vector',
                    rank: index + 1,
                    type: r.payload?.type || 'unknown',
                    layer: r.payload?.layer || 'Business',
                    payload: r.payload
                }));
            }
        } catch (vectorError) {
            console.warn('Vector search error (continuing with graph only):', vectorError.message);
        }

        // Step 5: Graph-based keyword search
        const graphResults = [];

        if (keywords.length > 0) {
            const keywordQuery = `
                MATCH (n)
                WHERE any(kw IN $keywords WHERE
                    toLower(coalesce(n.name, '')) CONTAINS kw OR
                    toLower(coalesce(n.title, '')) CONTAINS kw OR
                    toLower(coalesce(n.description, '')) CONTAINS kw OR
                    toLower(coalesce(n.content, '')) CONTAINS kw
                )
                RETURN n, labels(n) as labels
                LIMIT 30
            `;

            try {
                const records = await executeCypher(keywordQuery, { keywords });

                records.forEach((record, index) => {
                    const node = record.get('n');
                    const labels = record.get('labels');

                    // Calculate relevance score based on keyword matches
                    const text = [
                        node.properties.name || '',
                        node.properties.title || '',
                        node.properties.description || ''
                    ].join(' ').toLowerCase();

                    const matchCount = keywords.filter(kw => text.includes(kw)).length;
                    const score = matchCount / keywords.length;

                    graphResults.push({
                        id: node.properties.id || safeIdToString(node.identity),
                        content: node.properties.name || node.properties.title || node.properties.content,
                        score: score,
                        source: 'graph_keyword',
                        rank: index + 1,
                        type: labels[0],
                        layer: node.properties.layer || 'Business',
                        properties: node.properties
                    });
                });
            } catch (error) {
                console.warn('Graph keyword search error:', error.message);
            }
        }

        // Step 6: Entity-based graph expansion
        if (queryEntities.entities.length > 0) {
            const entityNames = queryEntities.entities
                .map(e => (e.name || e.text || '').toLowerCase())
                .filter(Boolean)
                .slice(0, 5);

            if (entityNames.length > 0) {
                const entityQuery = `
                    MATCH (n)
                    WHERE any(name IN $entityNames WHERE toLower(coalesce(n.name, '')) CONTAINS name)
                    OPTIONAL MATCH (n)-[r]-(related)
                    RETURN DISTINCT
                        coalesce(related, n) as node,
                        labels(coalesce(related, n)) as labels,
                        CASE WHEN related IS NULL THEN 1.0 ELSE 0.7 END as relevance
                    LIMIT 20
                `;

                try {
                    const records = await executeCypher(entityQuery, { entityNames });

                    records.forEach((record, index) => {
                        const node = record.get('node');
                        const labels = record.get('labels');
                        const relevance = record.get('relevance');

                        const nodeId = node.properties.id || safeIdToString(node.identity);

                        // Avoid duplicates
                        if (!graphResults.some(r => r.id === nodeId)) {
                            graphResults.push({
                                id: nodeId,
                                content: node.properties.name || node.properties.title,
                                score: relevance * 0.8,
                                source: 'graph_entity',
                                rank: index + 1,
                                type: labels[0],
                                layer: node.properties.layer || 'Business',
                                properties: node.properties
                            });
                        }
                    });
                } catch (error) {
                    console.warn('Entity graph search error:', error.message);
                }
            }
        }

        // Step 7: Fuse results
        const fusedResults = fuseMultiple(
            [
                { results: vectorResults, weight: searchOptions.vectorWeight },
                { results: graphResults, weight: searchOptions.graphWeight }
            ],
            {
                method: searchOptions.fusionMethod,
                k: searchOptions.rrf_k,
                deduplicateBy: 'id'
            }
        );

        // Step 8: Apply layer filter if specified
        let filteredResults = fusedResults;
        if (searchOptions.layer) {
            filteredResults = fusedResults.filter(r =>
                r.layer?.toLowerCase() === searchOptions.layer.toLowerCase()
            );
        }

        // Step 9: Apply entity type filter if specified
        if (searchOptions.entityTypes && searchOptions.entityTypes.length > 0) {
            filteredResults = filteredResults.filter(r =>
                searchOptions.entityTypes.includes(r.type)
            );
        }

        // Step 10: Limit results
        const finalResults = filteredResults.slice(0, searchOptions.maxResults);

        // Build response
        const searchTime = Date.now() - startTime;

        res.json({
            success: true,
            query: query,
            sanitizedQuery: sanitized,
            language: language,
            results: finalResults,
            metadata: {
                totalFound: fusedResults.length,
                vectorHits: vectorResults.length,
                graphHits: graphResults.length,
                fusionMethod: searchOptions.fusionMethod,
                weights: {
                    vector: searchOptions.vectorWeight,
                    graph: searchOptions.graphWeight
                },
                searchTime,
                queryEntities: queryEntities.entities.map(e => ({
                    type: e.type,
                    name: e.name || e.text
                }))
            }
        });

    } catch (error) {
        console.error('Hybrid search error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            query: req.body.query
        });
    }
});

/**
 * POST /api/v1/knowledge/search/enhanced
 * Enhanced search with query expansion, hybrid search, and reranking
 *
 * This is the most advanced search endpoint combining:
 * 1. Query Expansion - UN-specific synonyms, acronym expansion
 * 2. Hybrid Search - Vector + Graph fusion
 * 3. Reranking - MMR diversity, heuristic boosts
 *
 * Body: {
 *   query: string,
 *   options?: {
 *     expandQuery?: boolean,      // Enable query expansion (default: true)
 *     enableReranking?: boolean,  // Enable result reranking (default: true)
 *     applyDiversity?: boolean,   // Apply MMR diversity (default: true)
 *     boostRecent?: boolean,      // Boost recent documents (default: false)
 *     boostLayer?: string,        // Preferred layer ('Strategic', 'Business', 'Code')
 *     vectorWeight?: number,      // Weight for vector results (0-1)
 *     graphWeight?: number,       // Weight for graph results (0-1)
 *     maxResults?: number,        // Maximum results to return
 *     fusionMethod?: string,      // 'rrf' | 'linear' | 'max' | 'borda'
 *     layer?: string,             // Filter by layer
 *     entityTypes?: string[]      // Filter by entity types
 *   }
 * }
 */
router.post('/search/enhanced', async (req, res) => {
    try {
        const { query, options = {} } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Query string is required'
            });
        }

        const startTime = Date.now();

        // Default options
        const searchOptions = {
            expandQuery: true,
            enableReranking: true,
            applyDiversity: true,
            boostRecent: false,
            boostLayer: null,
            vectorWeight: parseFloat(process.env.VECTOR_WEIGHT) || 0.6,
            graphWeight: parseFloat(process.env.GRAPH_WEIGHT) || 0.4,
            maxResults: parseInt(process.env.SEARCH_MAX_RESULTS) || 15,
            fusionMethod: 'rrf',
            rrf_k: parseInt(process.env.RRF_K) || 60,
            ...options
        };

        // Step 1: Sanitize query
        const sanitized = sanitizer.clean(query);
        const language = languageDetector.detect(sanitized);

        // Step 2: Query Expansion (if enabled)
        let searchQuery = sanitized;
        let expansionInfo = null;

        if (searchOptions.expandQuery) {
            const expansion = await queryExpander.expand(sanitized, {
                maxTerms: 15,
                context: options.context || 'general',
                boostOriginal: true
            });

            searchQuery = expansion.expanded;
            expansionInfo = {
                originalQuery: sanitized,
                expandedQuery: expansion.expanded,
                expansions: expansion.expansions,
                detectedSystems: expansion.detectedSystems,
                stats: expansion.stats
            };
        }

        // Step 3: Extract entities from expanded query
        const queryEntities = await entityExtractor.extract(searchQuery, {
            context: 'search_query',
            language: language.language
        });

        // Step 4: Extract keywords for graph search
        const keywords = searchQuery
            .toLowerCase()
            .split(/\s+/)
            .filter(w => w.length > 3)
            .slice(0, 15); // More keywords due to expansion

        // Step 5: Vector search
        let vectorResults = [];

        try {
            const embeddingResult = await embeddingService.embed(sanitized); // Use original for embedding

            if (embeddingResult.embedding && !embeddingResult.error) {
                const qdrantResults = await qdrantService.searchSimilar(
                    embeddingResult.embedding,
                    searchOptions.maxResults * 3, // Get more for reranking
                    searchOptions.vectorFilter || null
                );

                vectorResults = qdrantResults.map((r, index) => ({
                    id: r.payload?.original_id || r.id,
                    content: r.payload?.text || r.payload?.content,
                    title: r.payload?.title,
                    score: r.score,
                    source: 'vector',
                    rank: index + 1,
                    type: r.payload?.type || 'unknown',
                    layer: r.payload?.layer || 'Business',
                    changedDate: r.payload?.changedDate,
                    createdDate: r.payload?.createdDate,
                    entities: r.payload?.entities || [],
                    payload: r.payload
                }));
            }
        } catch (vectorError) {
            console.warn('Vector search error (continuing with graph only):', vectorError.message);
        }

        // Step 6: Graph-based keyword search (with expanded keywords)
        const graphResults = [];

        if (keywords.length > 0) {
            const keywordQuery = `
                MATCH (n)
                WHERE any(kw IN $keywords WHERE
                    toLower(coalesce(n.name, '')) CONTAINS kw OR
                    toLower(coalesce(n.title, '')) CONTAINS kw OR
                    toLower(coalesce(n.description, '')) CONTAINS kw OR
                    toLower(coalesce(n.content, '')) CONTAINS kw
                )
                RETURN n, labels(n) as labels
                LIMIT 50
            `;

            try {
                const records = await executeCypher(keywordQuery, { keywords });

                records.forEach((record, index) => {
                    const node = record.get('n');
                    const labels = record.get('labels');

                    const text = [
                        node.properties.name || '',
                        node.properties.title || '',
                        node.properties.description || ''
                    ].join(' ').toLowerCase();

                    const matchCount = keywords.filter(kw => text.includes(kw)).length;
                    const score = matchCount / keywords.length;

                    graphResults.push({
                        id: node.properties.id || safeIdToString(node.identity),
                        content: node.properties.description || node.properties.content,
                        title: node.properties.name || node.properties.title,
                        score: score,
                        source: 'graph_keyword',
                        rank: index + 1,
                        type: labels[0],
                        layer: node.properties.layer || 'Business',
                        changedDate: node.properties.changedDate,
                        createdDate: node.properties.createdDate,
                        entities: node.properties.entities || [],
                        properties: node.properties
                    });
                });
            } catch (error) {
                console.warn('Graph keyword search error:', error.message);
            }
        }

        // Step 7: Entity-based graph expansion
        if (queryEntities.entities.length > 0) {
            const entityNames = queryEntities.entities
                .map(e => (e.name || e.text || '').toLowerCase())
                .filter(Boolean)
                .slice(0, 5);

            if (entityNames.length > 0) {
                const entityQuery = `
                    MATCH (n)
                    WHERE any(name IN $entityNames WHERE toLower(coalesce(n.name, '')) CONTAINS name)
                    OPTIONAL MATCH (n)-[r]-(related)
                    RETURN DISTINCT
                        coalesce(related, n) as node,
                        labels(coalesce(related, n)) as labels,
                        CASE WHEN related IS NULL THEN 1.0 ELSE 0.7 END as relevance
                    LIMIT 30
                `;

                try {
                    const records = await executeCypher(entityQuery, { entityNames });

                    records.forEach((record, index) => {
                        const node = record.get('node');
                        const labels = record.get('labels');
                        const relevance = record.get('relevance');

                        const nodeId = node.properties.id || safeIdToString(node.identity);

                        if (!graphResults.some(r => r.id === nodeId)) {
                            graphResults.push({
                                id: nodeId,
                                content: node.properties.description || node.properties.content,
                                title: node.properties.name || node.properties.title,
                                score: relevance * 0.8,
                                source: 'graph_entity',
                                rank: index + 1,
                                type: labels[0],
                                layer: node.properties.layer || 'Business',
                                changedDate: node.properties.changedDate,
                                createdDate: node.properties.createdDate,
                                entities: node.properties.entities || [],
                                properties: node.properties
                            });
                        }
                    });
                } catch (error) {
                    console.warn('Entity graph search error:', error.message);
                }
            }
        }

        // Step 8: Fuse results
        const fusedResults = fuseMultiple(
            [
                { results: vectorResults, weight: searchOptions.vectorWeight },
                { results: graphResults, weight: searchOptions.graphWeight }
            ],
            {
                method: searchOptions.fusionMethod,
                k: searchOptions.rrf_k,
                deduplicateBy: 'id'
            }
        );

        // Step 9: Apply layer filter if specified
        let filteredResults = fusedResults;
        if (searchOptions.layer) {
            filteredResults = fusedResults.filter(r =>
                r.layer?.toLowerCase() === searchOptions.layer.toLowerCase()
            );
        }

        // Step 10: Apply entity type filter if specified
        if (searchOptions.entityTypes && searchOptions.entityTypes.length > 0) {
            filteredResults = filteredResults.filter(r =>
                searchOptions.entityTypes.includes(r.type)
            );
        }

        // Step 11: Reranking (if enabled)
        let finalResults = filteredResults;
        let rerankingInfo = null;

        if (searchOptions.enableReranking && filteredResults.length > 1) {
            finalResults = await reranker.rerank(sanitized, filteredResults, {
                topK: searchOptions.maxResults,
                applyDiversity: searchOptions.applyDiversity,
                boostRecent: searchOptions.boostRecent,
                boostLayer: searchOptions.boostLayer
            });

            rerankingInfo = reranker.getStats(finalResults);
        } else {
            finalResults = filteredResults.slice(0, searchOptions.maxResults);
        }

        // Build response
        const searchTime = Date.now() - startTime;

        res.json({
            success: true,
            query: query,
            sanitizedQuery: sanitized,
            expandedQuery: searchOptions.expandQuery ? searchQuery : null,
            language: language,
            results: finalResults,
            metadata: {
                totalFound: fusedResults.length,
                returnedCount: finalResults.length,
                vectorHits: vectorResults.length,
                graphHits: graphResults.length,
                fusionMethod: searchOptions.fusionMethod,
                weights: {
                    vector: searchOptions.vectorWeight,
                    graph: searchOptions.graphWeight
                },
                searchTime,
                queryEntities: queryEntities.entities.map(e => ({
                    type: e.type,
                    name: e.name || e.text
                })),
                expansion: expansionInfo,
                reranking: rerankingInfo,
                options: {
                    expandQuery: searchOptions.expandQuery,
                    enableReranking: searchOptions.enableReranking,
                    applyDiversity: searchOptions.applyDiversity,
                    boostRecent: searchOptions.boostRecent,
                    boostLayer: searchOptions.boostLayer
                }
            }
        });

    } catch (error) {
        console.error('Enhanced search error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            query: req.body.query
        });
    }
});

/**
 * POST /api/v1/knowledge/search/semantic
 * Perform semantic search with entity extraction
 */
router.post('/search/semantic', async (req, res) => {
    try {
        const { query, limit = 10 } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const startTime = Date.now();

        // Sanitize and detect language
        const sanitized = sanitizer.clean(query);
        const language = languageDetector.detect(sanitized);

        // Extract entities
        const extraction = await entityExtractor.extract(sanitized, {
            context: 'search',
            language: language.language
        });

        // Search by entity names in graph
        const entityNames = extraction.entities
            .map(e => (e.name || e.text || '').toLowerCase())
            .filter(Boolean);

        let results = [];

        if (entityNames.length > 0) {
            const searchQuery = `
                MATCH (n)
                WHERE any(name IN $names WHERE
                    toLower(coalesce(n.name, '')) CONTAINS name OR
                    toLower(coalesce(n.title, '')) CONTAINS name
                )
                OPTIONAL MATCH (n)-[r]-(related)
                RETURN n, labels(n) as labels,
                       collect(DISTINCT {
                           id: related.id,
                           name: related.name,
                           type: labels(related)[0],
                           relation: type(r)
                       })[0..3] as relations
                LIMIT $limit
            `;

            const records = await executeCypher(searchQuery, {
                names: entityNames,
                limit: neo4j.int(limit)
            });

            results = records.map(record => {
                const node = record.get('n');
                const labels = record.get('labels');
                const relations = record.get('relations');

                return {
                    id: node.properties.id || safeIdToString(node.identity),
                    name: node.properties.name || node.properties.title,
                    type: labels[0],
                    layer: node.properties.layer,
                    properties: node.properties,
                    relations: relations.filter(r => r && r.id)
                };
            });
        }

        res.json({
            success: true,
            query: sanitized,
            language: language,
            extractedEntities: extraction.entities,
            results,
            metadata: {
                searchTime: Date.now() - startTime,
                entityCount: extraction.entities.length,
                resultCount: results.length
            }
        });

    } catch (error) {
        console.error('Semantic search error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/knowledge/analyze
 * Analyze text and extract entities, language, etc.
 */
router.post('/analyze', async (req, res) => {
    try {
        const { text, options = {} } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        const startTime = Date.now();

        // Sanitize
        const sanitized = sanitizer.sanitize(text, {
            removePII: options.removePII || false
        });

        // Detect language
        const language = languageDetector.detect(sanitized.text);

        // Extract entities
        const extraction = await entityExtractor.extract(sanitized.text, {
            context: options.context || 'general',
            language: language.language
        });

        // Chunk if requested
        let chunks = null;
        if (options.chunk) {
            const chunker = new TextChunker({
                maxTokens: options.chunkSize || 512,
                overlapTokens: options.overlap || 50
            });
            chunks = chunker.chunkForEmbedding(sanitized.text);
        }

        res.json({
            success: true,
            original: {
                length: text.length,
                preview: text.substring(0, 200)
            },
            sanitized: {
                text: sanitized.text,
                changes: sanitized.changes,
                metadata: sanitized.metadata
            },
            language: language,
            entities: extraction.entities,
            chunks: chunks ? {
                count: chunks.length,
                items: chunks.map(c => ({
                    index: c.index,
                    content: c.content.substring(0, 100) + '...',
                    tokens: c.tokenEstimate
                }))
            } : null,
            metadata: {
                processingTime: Date.now() - startTime
            }
        });

    } catch (error) {
        console.error('Text analysis error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/knowledge/search/expand
 * Preview query expansion without performing search
 *
 * Useful for debugging and understanding how queries are expanded
 *
 * Body: {
 *   query: string,
 *   options?: {
 *     maxTerms?: number,
 *     context?: string,
 *     maxSynonyms?: number,
 *     expandAcronyms?: boolean
 *   }
 * }
 */
router.post('/search/expand', async (req, res) => {
    try {
        const { query, options = {} } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const startTime = Date.now();

        // Sanitize first
        const sanitized = sanitizer.clean(query);
        const language = languageDetector.detect(sanitized);

        // Full expansion
        const expansion = await queryExpander.expand(sanitized, {
            maxTerms: options.maxTerms || 20,
            context: options.context || 'general',
            boostOriginal: true
        });

        // Quick expansion for comparison
        const quickExpansion = queryExpander.quickExpand(sanitized);

        res.json({
            success: true,
            original: query,
            sanitized: sanitized,
            language: language,
            expansion: {
                full: {
                    expanded: expansion.expanded,
                    expansions: expansion.expansions,
                    detectedSystems: expansion.detectedSystems,
                    stats: expansion.stats
                },
                quick: quickExpansion
            },
            metadata: {
                processingTime: Date.now() - startTime
            }
        });

    } catch (error) {
        console.error('Query expansion error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/knowledge/search/vector
 * Perform pure vector similarity search
 *
 * Body: {
 *   query: string,
 *   limit?: number,
 *   filter?: object,
 *   threshold?: number
 * }
 */
router.post('/search/vector', async (req, res) => {
    try {
        const { query, limit = 10, filter = null, threshold = 0 } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        const startTime = Date.now();

        // Sanitize query
        const sanitized = sanitizer.clean(query);

        // Generate embedding
        const embeddingResult = await embeddingService.embed(sanitized);

        if (embeddingResult.error) {
            return res.status(503).json({
                success: false,
                error: `Embedding service error: ${embeddingResult.error}`,
                suggestion: 'Check if TEI service is running'
            });
        }

        // Search in Qdrant
        const results = await qdrantService.searchSimilar(
            embeddingResult.embedding,
            limit,
            filter
        );

        // Filter by threshold and format
        const filteredResults = results
            .filter(r => r.score >= threshold)
            .map((r, index) => ({
                id: r.payload?.original_id || r.id,
                content: r.payload?.text || r.payload?.content,
                score: r.score,
                rank: index + 1,
                type: r.payload?.type,
                layer: r.payload?.layer,
                metadata: {
                    adoId: r.payload?.adoId,
                    title: r.payload?.title,
                    language: r.payload?.language,
                    chunkIndex: r.payload?.chunkIndex
                }
            }));

        res.json({
            success: true,
            query: sanitized,
            results: filteredResults,
            metadata: {
                totalFound: results.length,
                filtered: filteredResults.length,
                vectorSize: embeddingResult.vectorSize,
                searchTime: Date.now() - startTime,
                threshold
            }
        });

    } catch (error) {
        console.error('Vector search error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/v1/knowledge/search/health
 * Check health of search services (embedding, qdrant, memgraph)
 */
router.get('/search/health', async (req, res) => {
    const health = {
        timestamp: new Date().toISOString(),
        services: {}
    };

    // Check embedding service
    try {
        const isHealthy = await embeddingService.isHealthy();
        const info = await embeddingService.getInfo();
        health.services.embedding = {
            status: isHealthy ? 'healthy' : 'unhealthy',
            url: process.env.TEI_URL || 'http://localhost:8081',
            info: isHealthy ? info : null
        };
    } catch (error) {
        health.services.embedding = {
            status: 'error',
            error: error.message
        };
    }

    // Check Qdrant
    try {
        // Simple search to verify connection
        const testVector = new Array(1024).fill(0);
        await qdrantService.searchSimilar(testVector, 1);
        health.services.qdrant = {
            status: 'healthy',
            url: process.env.QDRANT_URL || 'http://localhost:6333',
            collection: QDRANT_COLLECTION
        };
    } catch (error) {
        health.services.qdrant = {
            status: 'error',
            error: error.message
        };
    }

    // Check Memgraph
    try {
        await executeCypher('RETURN 1 as test');
        health.services.memgraph = {
            status: 'healthy',
            url: MEMGRAPH_URI
        };
    } catch (error) {
        health.services.memgraph = {
            status: 'error',
            error: error.message
        };
    }

    // Overall status
    const allHealthy = Object.values(health.services).every(s => s.status === 'healthy');
    health.overall = allHealthy ? 'healthy' : 'degraded';

    res.status(allHealthy ? 200 : 503).json(health);
});

/**
 * POST /api/v1/knowledge/validate/roundtrip
 * Perform end-to-end round-trip validation
 *
 * This endpoint validates the entire pipeline by:
 * 1. Processing input text through sanitization, language detection, entity extraction
 * 2. Searching the knowledge base for matching content
 * 3. Comparing input with retrieved results
 * 4. Calculating quality metrics and pass/fail verdict
 *
 * Body: {
 *   text: string,                    // Text to validate
 *   expectedEntities?: string[],     // Expected entities (optional)
 *   expectedConcepts?: string[],     // Expected concepts (optional)
 *   options?: {
 *     expandQuery?: boolean,         // Enable query expansion (default: true)
 *     enableReranking?: boolean,     // Enable reranking (default: true)
 *     maxResults?: number,           // Max search results (default: 5)
 *     thresholds?: {                 // Custom pass/fail thresholds
 *       excellent?: number,          // >= 0.85 (default)
 *       good?: number,               // >= 0.70 (default)
 *       acceptable?: number,         // >= 0.55 (default)
 *       poor?: number                // >= 0.40 (default)
 *     }
 *   }
 * }
 */
router.post('/validate/roundtrip', async (req, res) => {
    try {
        const { text, expectedEntities = [], expectedConcepts = [], options = {} } = req.body;

        if (!text || typeof text !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Text is required for validation'
            });
        }

        const startTime = Date.now();
        const timings = {};

        // Default thresholds
        const thresholds = {
            excellent: 0.85,
            good: 0.70,
            acceptable: 0.55,
            poor: 0.40,
            ...(options.thresholds || {})
        };

        // Step 1: Analyze text (sanitize + detect + extract)
        const analyzeStart = Date.now();
        const sanitized = sanitizer.sanitize(text);
        const language = languageDetector.detect(sanitized.text);
        const extraction = await entityExtractor.extract(sanitized.text, {
            context: 'validation',
            language: language.language
        });

        // Chunk for comparison
        const chunker = new TextChunker({
            maxTokens: 512,
            overlapTokens: 50
        });
        const chunks = chunker.chunkForEmbedding(sanitized.text);
        timings.analyze = Date.now() - analyzeStart;

        // Step 2: Search for matching content
        const searchStart = Date.now();
        const searchQuery = text.substring(0, 500);

        let searchResults = [];
        let searchMetadata = {};

        try {
            // Use enhanced search with query expansion and reranking
            const embeddingResult = await embeddingService.embed(searchQuery);

            if (embeddingResult.embedding && !embeddingResult.error) {
                // Vector search
                const vectorResults = await qdrantService.searchSimilar(
                    embeddingResult.embedding,
                    (options.maxResults || 5) * 2,
                    null
                );

                // Expand query for graph search
                const expansion = options.expandQuery !== false
                    ? await queryExpander.expand(searchQuery, { maxTerms: 15 })
                    : { expanded: searchQuery, expansions: [] };

                const keywords = expansion.expanded
                    .toLowerCase()
                    .split(/\s+/)
                    .filter(w => w.length > 3)
                    .slice(0, 15);

                // Graph search
                let graphResults = [];
                if (keywords.length > 0) {
                    const keywordQuery = `
                        MATCH (n)
                        WHERE any(kw IN $keywords WHERE
                            toLower(coalesce(n.name, '')) CONTAINS kw OR
                            toLower(coalesce(n.title, '')) CONTAINS kw OR
                            toLower(coalesce(n.description, '')) CONTAINS kw
                        )
                        RETURN n, labels(n) as labels
                        LIMIT 30
                    `;

                    try {
                        const records = await executeCypher(keywordQuery, { keywords });
                        graphResults = records.map((record, index) => {
                            const node = record.get('n');
                            const labels = record.get('labels');
                            const nodeText = [
                                node.properties.name || '',
                                node.properties.title || '',
                                node.properties.description || ''
                            ].join(' ').toLowerCase();

                            const matchCount = keywords.filter(kw => nodeText.includes(kw)).length;
                            return {
                                id: node.properties.id || safeIdToString(node.identity),
                                content: node.properties.description || node.properties.content,
                                title: node.properties.name || node.properties.title,
                                score: matchCount / keywords.length,
                                source: 'graph',
                                type: labels[0],
                                entities: node.properties.entities || []
                            };
                        });
                    } catch (e) {
                        console.warn('Graph search error:', e.message);
                    }
                }

                // Format vector results
                const formattedVector = vectorResults.map((r, index) => ({
                    id: r.payload?.original_id || r.id,
                    content: r.payload?.text || r.payload?.content,
                    title: r.payload?.title,
                    score: r.score,
                    source: 'vector',
                    type: r.payload?.type,
                    entities: r.payload?.entities || []
                }));

                // Fuse results
                const allResults = [...formattedVector, ...graphResults];
                const deduped = new Map();
                allResults.forEach(r => {
                    const key = r.id || r.title;
                    if (!deduped.has(key) || deduped.get(key).score < r.score) {
                        deduped.set(key, r);
                    }
                });

                searchResults = Array.from(deduped.values())
                    .sort((a, b) => b.score - a.score)
                    .slice(0, options.maxResults || 5);

                // Apply reranking if enabled
                if (options.enableReranking !== false && searchResults.length > 1) {
                    searchResults = await reranker.rerank(searchQuery, searchResults, {
                        topK: options.maxResults || 5,
                        applyDiversity: true
                    });
                }

                searchMetadata = {
                    vectorHits: formattedVector.length,
                    graphHits: graphResults.length,
                    queryExpanded: options.expandQuery !== false,
                    expansionTerms: expansion.expansions?.length || 0
                };
            }
        } catch (searchError) {
            console.warn('Search error during validation:', searchError.message);
        }

        timings.search = Date.now() - searchStart;

        // Step 3: Calculate quality metrics
        const metricsStart = Date.now();
        const originalText = sanitized.text;
        const retrievedTexts = searchResults.map(r => r.content || r.title || '').join(' ');

        // Jaccard similarity (word overlap)
        const origWords = new Set(originalText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const retWords = new Set(retrievedTexts.toLowerCase().split(/\s+/).filter(w => w.length > 2));
        const intersection = new Set([...origWords].filter(x => retWords.has(x)));
        const union = new Set([...origWords, ...retWords]);
        const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

        // Term preservation (key terms retained)
        const criticalTerms = [...origWords].filter(w => w.length > 4).slice(0, 30);
        const preservedTerms = criticalTerms.filter(t => retWords.has(t));
        const termPreservation = criticalTerms.length > 0 ? preservedTerms.length / criticalTerms.length : 1;

        // Entity preservation
        const originalEntities = [...extraction.entities, ...expectedEntities.map(e => ({ name: e }))];
        const retrievedEntities = searchResults.flatMap(r => r.entities || []);
        let entityMatches = 0;
        const originalEntityNames = originalEntities.map(e => (e.name || e.text || e).toLowerCase());
        const retrievedEntityNames = retrievedEntities.map(e => (e.name || e.text || e).toLowerCase());

        originalEntityNames.forEach(orig => {
            for (const ret of retrievedEntityNames) {
                if (orig.includes(ret) || ret.includes(orig)) {
                    entityMatches++;
                    break;
                }
            }
        });
        const entityPreservation = originalEntityNames.length > 0 ? entityMatches / originalEntityNames.length : 1;

        // Semantic/concept overlap
        let semanticOverlap = 0.5;
        if (expectedConcepts.length > 0) {
            const combinedText = (originalText + ' ' + retrievedTexts).toLowerCase();
            const foundConcepts = expectedConcepts.filter(c => combinedText.includes(c.toLowerCase()));
            semanticOverlap = foundConcepts.length / expectedConcepts.length;
        }

        // Top result score
        const topSearchScore = searchResults[0]?.score || 0;

        timings.metrics = Date.now() - metricsStart;
        timings.total = Date.now() - startTime;

        // Step 4: Calculate overall score and verdict
        const metrics = {
            jaccardSimilarity,
            termPreservation,
            entityPreservation,
            semanticOverlap,
            topSearchScore,
            resultsFound: searchResults.length
        };

        const overallScore = (
            jaccardSimilarity * 0.25 +
            termPreservation * 0.25 +
            entityPreservation * 0.25 +
            semanticOverlap * 0.25
        );

        // Determine quality level
        let qualityLevel = 'poor';
        if (overallScore >= thresholds.excellent) qualityLevel = 'excellent';
        else if (overallScore >= thresholds.good) qualityLevel = 'good';
        else if (overallScore >= thresholds.acceptable) qualityLevel = 'acceptable';

        const passed = overallScore >= thresholds.acceptable;

        // Identify issues
        const issues = [];
        if (jaccardSimilarity < thresholds.acceptable) {
            issues.push({
                metric: 'jaccardSimilarity',
                message: `Low word overlap: ${(jaccardSimilarity * 100).toFixed(0)}% (threshold: ${(thresholds.acceptable * 100).toFixed(0)}%)`,
                severity: jaccardSimilarity < thresholds.poor ? 'error' : 'warning'
            });
        }
        if (termPreservation < thresholds.acceptable) {
            issues.push({
                metric: 'termPreservation',
                message: `Key terms not preserved: ${(termPreservation * 100).toFixed(0)}%`,
                severity: termPreservation < thresholds.poor ? 'error' : 'warning'
            });
        }
        if (entityPreservation < thresholds.acceptable) {
            issues.push({
                metric: 'entityPreservation',
                message: `Entities not found: ${(entityPreservation * 100).toFixed(0)}%`,
                severity: entityPreservation < thresholds.poor ? 'error' : 'warning'
            });
        }
        if (searchResults.length === 0) {
            issues.push({
                metric: 'searchResults',
                message: 'No matching content found in knowledge base',
                severity: 'error'
            });
        }
        if (topSearchScore < 0.3) {
            issues.push({
                metric: 'topSearchScore',
                message: `Low relevance score: ${(topSearchScore * 100).toFixed(0)}%`,
                severity: 'warning'
            });
        }

        // Build response
        res.json({
            success: true,
            passed,
            qualityLevel,
            overallScore,
            metrics,
            thresholds,
            issues,
            analysis: {
                originalLength: text.length,
                sanitizedLength: sanitized.text.length,
                language: language,
                chunksCreated: chunks.length,
                entitiesExtracted: extraction.entities.length
            },
            search: {
                resultsCount: searchResults.length,
                topScore: topSearchScore,
                results: searchResults.slice(0, 3).map(r => ({
                    title: r.title,
                    score: r.score,
                    source: r.source
                })),
                ...searchMetadata
            },
            timings,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Round-trip validation error:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            passed: false
        });
    }
});

/**
 * POST /api/v1/knowledge/validate/batch
 * Validate multiple texts in batch
 *
 * Body: {
 *   testCases: Array<{
 *     id: string,
 *     name?: string,
 *     text: string,
 *     expectedEntities?: string[],
 *     expectedConcepts?: string[]
 *   }>,
 *   options?: object  // Same as single validation options
 * }
 */
router.post('/validate/batch', async (req, res) => {
    try {
        const { testCases, options = {} } = req.body;

        if (!Array.isArray(testCases) || testCases.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'testCases array is required'
            });
        }

        if (testCases.length > 20) {
            return res.status(400).json({
                success: false,
                error: 'Maximum 20 test cases per batch'
            });
        }

        const startTime = Date.now();
        const results = [];

        for (const testCase of testCases) {
            // Process each test case using the same logic as single validation
            try {
                const singleResult = await processSingleValidation(testCase, options);
                results.push({
                    id: testCase.id,
                    name: testCase.name || testCase.id,
                    ...singleResult
                });
            } catch (error) {
                results.push({
                    id: testCase.id,
                    name: testCase.name || testCase.id,
                    success: false,
                    passed: false,
                    error: error.message
                });
            }
        }

        // Calculate summary
        const passed = results.filter(r => r.passed).length;
        const avgOverall = results.reduce((sum, r) => sum + (r.overallScore || 0), 0) / results.length;
        const avgMetrics = {
            jaccardSimilarity: results.reduce((sum, r) => sum + (r.metrics?.jaccardSimilarity || 0), 0) / results.length,
            termPreservation: results.reduce((sum, r) => sum + (r.metrics?.termPreservation || 0), 0) / results.length,
            entityPreservation: results.reduce((sum, r) => sum + (r.metrics?.entityPreservation || 0), 0) / results.length,
            semanticOverlap: results.reduce((sum, r) => sum + (r.metrics?.semanticOverlap || 0), 0) / results.length
        };

        res.json({
            success: true,
            summary: {
                total: results.length,
                passed,
                failed: results.length - passed,
                passRate: passed / results.length,
                avgOverallScore: avgOverall,
                avgMetrics,
                totalTime: Date.now() - startTime
            },
            results,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Batch validation error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Helper function for single validation (used by both single and batch endpoints)
async function processSingleValidation(testCase, options = {}) {
    const text = testCase.text;
    const expectedEntities = testCase.expectedEntities || [];
    const expectedConcepts = testCase.expectedConcepts || [];

    const thresholds = {
        excellent: 0.85,
        good: 0.70,
        acceptable: 0.55,
        poor: 0.40,
        ...(options.thresholds || {})
    };

    const startTime = Date.now();

    // Analyze
    const sanitized = sanitizer.sanitize(text);
    const language = languageDetector.detect(sanitized.text);
    const extraction = await entityExtractor.extract(sanitized.text, {
        context: 'validation',
        language: language.language
    });

    // Search
    const searchQuery = text.substring(0, 500);
    let searchResults = [];

    try {
        const embeddingResult = await embeddingService.embed(searchQuery);

        if (embeddingResult.embedding && !embeddingResult.error) {
            const vectorResults = await qdrantService.searchSimilar(
                embeddingResult.embedding,
                (options.maxResults || 5) * 2,
                null
            );

            searchResults = vectorResults.map(r => ({
                id: r.payload?.original_id || r.id,
                content: r.payload?.text || r.payload?.content,
                title: r.payload?.title,
                score: r.score,
                entities: r.payload?.entities || []
            })).slice(0, options.maxResults || 5);
        }
    } catch (e) {
        console.warn('Search error:', e.message);
    }

    // Calculate metrics
    const originalText = sanitized.text;
    const retrievedTexts = searchResults.map(r => r.content || r.title || '').join(' ');

    const origWords = new Set(originalText.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const retWords = new Set(retrievedTexts.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const intersection = new Set([...origWords].filter(x => retWords.has(x)));
    const union = new Set([...origWords, ...retWords]);
    const jaccardSimilarity = union.size > 0 ? intersection.size / union.size : 0;

    const criticalTerms = [...origWords].filter(w => w.length > 4).slice(0, 30);
    const preservedTerms = criticalTerms.filter(t => retWords.has(t));
    const termPreservation = criticalTerms.length > 0 ? preservedTerms.length / criticalTerms.length : 1;

    const originalEntities = [...extraction.entities, ...expectedEntities.map(e => ({ name: e }))];
    const retrievedEntities = searchResults.flatMap(r => r.entities || []);
    let entityMatches = 0;
    const originalEntityNames = originalEntities.map(e => (e.name || e.text || e).toLowerCase());
    const retrievedEntityNames = retrievedEntities.map(e => (e.name || e.text || e).toLowerCase());

    originalEntityNames.forEach(orig => {
        for (const ret of retrievedEntityNames) {
            if (orig.includes(ret) || ret.includes(orig)) {
                entityMatches++;
                break;
            }
        }
    });
    const entityPreservation = originalEntityNames.length > 0 ? entityMatches / originalEntityNames.length : 1;

    let semanticOverlap = 0.5;
    if (expectedConcepts.length > 0) {
        const combinedText = (originalText + ' ' + retrievedTexts).toLowerCase();
        const foundConcepts = expectedConcepts.filter(c => combinedText.includes(c.toLowerCase()));
        semanticOverlap = foundConcepts.length / expectedConcepts.length;
    }

    const metrics = {
        jaccardSimilarity,
        termPreservation,
        entityPreservation,
        semanticOverlap,
        topSearchScore: searchResults[0]?.score || 0,
        resultsFound: searchResults.length
    };

    const overallScore = (
        jaccardSimilarity * 0.25 +
        termPreservation * 0.25 +
        entityPreservation * 0.25 +
        semanticOverlap * 0.25
    );

    let qualityLevel = 'poor';
    if (overallScore >= thresholds.excellent) qualityLevel = 'excellent';
    else if (overallScore >= thresholds.good) qualityLevel = 'good';
    else if (overallScore >= thresholds.acceptable) qualityLevel = 'acceptable';

    const passed = overallScore >= thresholds.acceptable;

    const issues = [];
    if (jaccardSimilarity < thresholds.acceptable) issues.push(`Low word overlap: ${(jaccardSimilarity * 100).toFixed(0)}%`);
    if (termPreservation < thresholds.acceptable) issues.push(`Terms not preserved: ${(termPreservation * 100).toFixed(0)}%`);
    if (entityPreservation < thresholds.acceptable) issues.push(`Entities missing: ${(entityPreservation * 100).toFixed(0)}%`);
    if (searchResults.length === 0) issues.push('No search results');

    return {
        success: true,
        passed,
        qualityLevel,
        overallScore,
        metrics,
        issues,
        timings: { total: Date.now() - startTime }
    };
}

/**
 * GET /api/v1/knowledge/search/layers
 * Get available layers, entity types, and search configuration
 */
router.get('/search/layers', (req, res) => {
    res.json({
        layers: {
            Strategic: {
                zPosition: -200,
                color: '#9C27B0',
                types: ['Epic', 'Feature', 'Strategy', 'Goal', 'KPI', 'Concept', 'Objective']
            },
            Business: {
                zPosition: 0,
                color: '#2196F3',
                types: ['WorkItem', 'Task', 'Bug', 'UserStory', 'Document', 'Person', 'Team', 'Organization', 'Process', 'System']
            },
            Code: {
                zPosition: 200,
                color: '#4CAF50',
                types: ['File', 'Class', 'Function', 'Method', 'Module', 'Interface', 'API', 'Database', 'Component', 'Commit']
            }
        },
        fusionMethods: ['rrf', 'linear', 'max', 'borda'],
        defaults: {
            vectorWeight: parseFloat(process.env.VECTOR_WEIGHT) || 0.6,
            graphWeight: parseFloat(process.env.GRAPH_WEIGHT) || 0.4,
            maxResults: parseInt(process.env.SEARCH_MAX_RESULTS) || 15,
            fusionMethod: 'rrf'
        },
        endpoints: {
            hybrid: {
                path: '/search/hybrid',
                method: 'POST',
                description: 'Basic hybrid search combining vector + graph'
            },
            enhanced: {
                path: '/search/enhanced',
                method: 'POST',
                description: 'Enhanced search with query expansion + reranking'
            },
            vector: {
                path: '/search/vector',
                method: 'POST',
                description: 'Pure vector similarity search'
            },
            semantic: {
                path: '/search/semantic',
                method: 'POST',
                description: 'Semantic search with entity extraction'
            },
            expand: {
                path: '/search/expand',
                method: 'POST',
                description: 'Preview query expansion'
            },
            health: {
                path: '/search/health',
                method: 'GET',
                description: 'Check health of search services'
            }
        },
        enhancedOptions: {
            expandQuery: {
                type: 'boolean',
                default: true,
                description: 'Enable UN-specific query expansion with synonyms'
            },
            enableReranking: {
                type: 'boolean',
                default: true,
                description: 'Enable result reranking with diversity'
            },
            applyDiversity: {
                type: 'boolean',
                default: true,
                description: 'Apply MMR diversity filtering'
            },
            boostRecent: {
                type: 'boolean',
                default: false,
                description: 'Boost recently modified documents'
            },
            boostLayer: {
                type: 'string',
                enum: ['Strategic', 'Business', 'Code'],
                default: null,
                description: 'Preferred layer for result boosting'
            }
        }
    });
});

// ============================================================
// CRUD OPERATIONS FOR GRAPH MANAGEMENT
// ============================================================

// Allowed labels for node creation/updates (security whitelist)
const ALLOWED_NODE_LABELS = [
    'Entity', 'Document', 'WorkItem', 'Task', 'Bug', 'Feature', 'Epic',
    'Person', 'Team', 'Organization', 'Project', 'File', 'Class', 'Function',
    'Module', 'Component', 'Service', 'Database', 'API', 'Concept', 'Knowledge',
    'Strategy', 'Goal', 'KPI', 'Process', 'System', 'Requirement', 'Milestone'
];

// Allowed relationship types
const ALLOWED_RELATIONSHIP_TYPES = [
    'RELATES_TO', 'DEPENDS_ON', 'IMPLEMENTS', 'CONTAINS', 'REFERENCES',
    'PARENT_OF', 'CHILD_OF', 'BELONGS_TO', 'OWNS', 'ASSIGNED_TO',
    'CREATED_BY', 'MODIFIED_BY', 'SUBTASK_OF', 'BLOCKS', 'BLOCKED_BY',
    'DERIVES_FROM', 'TRACKS', 'CONFIGURES', 'DEPLOYED_ON', 'USES'
];

/**
 * GET /api/v1/knowledge/crud/labels
 * Get available node labels and relationship types
 */
router.get('/crud/labels', (req, res) => {
    res.json({
        nodeLabels: ALLOWED_NODE_LABELS,
        relationshipTypes: ALLOWED_RELATIONSHIP_TYPES
    });
});

/**
 * GET /api/v1/knowledge/crud/nodes
 * List all nodes with pagination and filtering
 */
router.get('/crud/nodes', async (req, res) => {
    try {
        const { label, limit = 50, offset = 0, search } = req.query;
        const limitValue = Math.min(parseInt(limit) || 50, 200);
        const offsetValue = parseInt(offset) || 0;

        let query = 'MATCH (n)';
        const params = {};

        // Filter by label
        if (label && ALLOWED_NODE_LABELS.includes(label)) {
            query = `MATCH (n:${label})`;
        }

        // Search filter
        if (search) {
            query += ` WHERE toLower(coalesce(n.name, '')) CONTAINS toLower($search)
                       OR toLower(coalesce(n.title, '')) CONTAINS toLower($search)
                       OR toLower(coalesce(n.id, '')) CONTAINS toLower($search)`;
            params.search = search;
        }

        query += ` RETURN n, labels(n) as nodeLabels, id(n) as internalId
                   ORDER BY id(n) DESC
                   SKIP ${offsetValue} LIMIT ${limitValue}`;

        const records = await executeCypher(query, params);

        // Count total
        let countQuery = 'MATCH (n)';
        if (label && ALLOWED_NODE_LABELS.includes(label)) {
            countQuery = `MATCH (n:${label})`;
        }
        if (search) {
            countQuery += ` WHERE toLower(coalesce(n.name, '')) CONTAINS toLower($search)
                           OR toLower(coalesce(n.title, '')) CONTAINS toLower($search)
                           OR toLower(coalesce(n.id, '')) CONTAINS toLower($search)`;
        }
        countQuery += ' RETURN count(n) as total';

        const countRecords = await executeCypher(countQuery, params);
        const total = countRecords[0]?.get('total')?.toNumber?.() || countRecords[0]?.get('total') || 0;

        const nodes = records.map(record => {
            const node = record.get('n');
            return {
                internalId: record.get('internalId').toString(),
                id: node.properties.id || record.get('internalId').toString(),
                labels: record.get('nodeLabels'),
                properties: node.properties
            };
        });

        res.json({
            nodes,
            pagination: {
                total,
                limit: limitValue,
                offset: offsetValue,
                hasMore: offsetValue + nodes.length < total
            }
        });
    } catch (error) {
        console.error('Error listing nodes:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/knowledge/crud/node
 * Create a new node
 */
router.post('/crud/node', async (req, res) => {
    try {
        const { label, properties } = req.body;

        if (!label || !ALLOWED_NODE_LABELS.includes(label)) {
            return res.status(400).json({
                error: 'Invalid or missing label',
                allowedLabels: ALLOWED_NODE_LABELS
            });
        }

        if (!properties || typeof properties !== 'object') {
            return res.status(400).json({ error: 'Properties object is required' });
        }

        // Generate ID if not provided
        const nodeId = properties.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();

        const nodeProperties = {
            ...properties,
            id: nodeId,
            createdAt: now,
            updatedAt: now
        };

        const query = `
            CREATE (n:${label} $properties)
            RETURN n, labels(n) as nodeLabels, id(n) as internalId
        `;

        const records = await executeCypher(query, { properties: nodeProperties });

        if (records.length === 0) {
            return res.status(500).json({ error: 'Failed to create node' });
        }

        const node = records[0].get('n');
        res.status(201).json({
            success: true,
            node: {
                internalId: records[0].get('internalId').toString(),
                id: node.properties.id,
                labels: records[0].get('nodeLabels'),
                properties: node.properties
            }
        });
    } catch (error) {
        console.error('Error creating node:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * PUT /api/v1/knowledge/crud/node/:nodeId
 * Update an existing node
 */
router.put('/crud/node/:nodeId', async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { properties, addLabels, removeLabels } = req.body;

        if (!properties && !addLabels && !removeLabels) {
            return res.status(400).json({ error: 'No updates provided' });
        }

        const parsedId = parseInt(nodeId);
        const isInternalId = !isNaN(parsedId);

        // Update properties
        if (properties && typeof properties === 'object') {
            const updatedProperties = {
                ...properties,
                updatedAt: new Date().toISOString()
            };
            delete updatedProperties.id; // Don't allow ID modification
            delete updatedProperties.createdAt; // Preserve original creation time

            const query = isInternalId
                ? `MATCH (n) WHERE id(n) = $id SET n += $properties RETURN n, labels(n) as nodeLabels, id(n) as internalId`
                : `MATCH (n {id: $id}) SET n += $properties RETURN n, labels(n) as nodeLabels, id(n) as internalId`;

            await executeCypher(query, { id: isInternalId ? parsedId : nodeId, properties: updatedProperties });
        }

        // Add labels
        if (addLabels && Array.isArray(addLabels)) {
            for (const label of addLabels) {
                if (ALLOWED_NODE_LABELS.includes(label)) {
                    const query = isInternalId
                        ? `MATCH (n) WHERE id(n) = $id SET n:${label} RETURN n`
                        : `MATCH (n {id: $id}) SET n:${label} RETURN n`;
                    await executeCypher(query, { id: isInternalId ? parsedId : nodeId });
                }
            }
        }

        // Remove labels
        if (removeLabels && Array.isArray(removeLabels)) {
            for (const label of removeLabels) {
                if (ALLOWED_NODE_LABELS.includes(label)) {
                    const query = isInternalId
                        ? `MATCH (n) WHERE id(n) = $id REMOVE n:${label} RETURN n`
                        : `MATCH (n {id: $id}) REMOVE n:${label} RETURN n`;
                    await executeCypher(query, { id: isInternalId ? parsedId : nodeId });
                }
            }
        }

        // Fetch updated node
        const fetchQuery = isInternalId
            ? `MATCH (n) WHERE id(n) = $id RETURN n, labels(n) as nodeLabels, id(n) as internalId`
            : `MATCH (n {id: $id}) RETURN n, labels(n) as nodeLabels, id(n) as internalId`;

        const records = await executeCypher(fetchQuery, { id: isInternalId ? parsedId : nodeId });

        if (records.length === 0) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const node = records[0].get('n');
        res.json({
            success: true,
            node: {
                internalId: records[0].get('internalId').toString(),
                id: node.properties.id,
                labels: records[0].get('nodeLabels'),
                properties: node.properties
            }
        });
    } catch (error) {
        console.error('Error updating node:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/v1/knowledge/crud/node/:nodeId
 * Delete a node and its relationships
 */
router.delete('/crud/node/:nodeId', async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { detachRelationships = true } = req.query;

        const parsedId = parseInt(nodeId);
        const isInternalId = !isNaN(parsedId);

        // First check if node exists
        const checkQuery = isInternalId
            ? `MATCH (n) WHERE id(n) = $id RETURN n, id(n) as internalId`
            : `MATCH (n {id: $id}) RETURN n, id(n) as internalId`;

        const checkRecords = await executeCypher(checkQuery, { id: isInternalId ? parsedId : nodeId });

        if (checkRecords.length === 0) {
            return res.status(404).json({ error: 'Node not found' });
        }

        // Count relationships before deletion
        const countQuery = isInternalId
            ? `MATCH (n)-[r]-() WHERE id(n) = $id RETURN count(r) as relCount`
            : `MATCH (n {id: $id})-[r]-() RETURN count(r) as relCount`;

        const countRecords = await executeCypher(countQuery, { id: isInternalId ? parsedId : nodeId });
        const relCount = countRecords[0]?.get('relCount')?.toNumber?.() || countRecords[0]?.get('relCount') || 0;

        // Delete node (DETACH removes all relationships)
        const deleteQuery = isInternalId
            ? `MATCH (n) WHERE id(n) = $id DETACH DELETE n`
            : `MATCH (n {id: $id}) DETACH DELETE n`;

        await executeCypher(deleteQuery, { id: isInternalId ? parsedId : nodeId });

        res.json({
            success: true,
            message: 'Node deleted successfully',
            deletedRelationships: relCount
        });
    } catch (error) {
        console.error('Error deleting node:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/crud/relationships
 * List relationships with pagination
 */
router.get('/crud/relationships', async (req, res) => {
    try {
        const { type, nodeId, limit = 50, offset = 0 } = req.query;
        const limitValue = Math.min(parseInt(limit) || 50, 200);
        const offsetValue = parseInt(offset) || 0;

        let query = 'MATCH (a)-[r]->(b)';
        const params = {};

        // Filter by relationship type
        if (type && ALLOWED_RELATIONSHIP_TYPES.includes(type)) {
            query = `MATCH (a)-[r:${type}]->(b)`;
        }

        // Filter by node involvement
        if (nodeId) {
            const parsedId = parseInt(nodeId);
            const isInternalId = !isNaN(parsedId);

            if (isInternalId) {
                query += ` WHERE id(a) = $nodeId OR id(b) = $nodeId`;
                params.nodeId = parsedId;
            } else {
                query += ` WHERE a.id = $nodeId OR b.id = $nodeId`;
                params.nodeId = nodeId;
            }
        }

        query += ` RETURN a, r, b, id(r) as relId, type(r) as relType
                   SKIP ${offsetValue} LIMIT ${limitValue}`;

        const records = await executeCypher(query, params);

        const relationships = records.map(record => {
            const source = record.get('a');
            const target = record.get('b');
            const rel = record.get('r');

            return {
                id: record.get('relId').toString(),
                type: record.get('relType'),
                properties: rel.properties,
                source: {
                    id: source.properties.id || safeIdToString(source.identity),
                    name: source.properties.name || source.properties.title || source.properties.id
                },
                target: {
                    id: target.properties.id || safeIdToString(target.identity),
                    name: target.properties.name || target.properties.title || target.properties.id
                }
            };
        });

        res.json({
            relationships,
            pagination: {
                limit: limitValue,
                offset: offsetValue
            }
        });
    } catch (error) {
        console.error('Error listing relationships:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/knowledge/crud/relationship
 * Create a new relationship between nodes
 */
router.post('/crud/relationship', async (req, res) => {
    try {
        const { sourceId, targetId, type, properties = {} } = req.body;

        if (!sourceId || !targetId) {
            return res.status(400).json({ error: 'sourceId and targetId are required' });
        }

        if (!type || !ALLOWED_RELATIONSHIP_TYPES.includes(type)) {
            return res.status(400).json({
                error: 'Invalid or missing relationship type',
                allowedTypes: ALLOWED_RELATIONSHIP_TYPES
            });
        }

        const relProperties = {
            ...properties,
            createdAt: new Date().toISOString()
        };

        // Check if source and target are internal IDs
        const sourceIsInternal = !isNaN(parseInt(sourceId));
        const targetIsInternal = !isNaN(parseInt(targetId));

        let query;
        const params = { relProperties };

        if (sourceIsInternal && targetIsInternal) {
            params.sourceId = parseInt(sourceId);
            params.targetId = parseInt(targetId);
            query = `
                MATCH (a), (b)
                WHERE id(a) = $sourceId AND id(b) = $targetId
                CREATE (a)-[r:${type} $relProperties]->(b)
                RETURN a, r, b, id(r) as relId
            `;
        } else {
            params.sourceId = sourceId;
            params.targetId = targetId;
            query = `
                MATCH (a {id: $sourceId}), (b {id: $targetId})
                CREATE (a)-[r:${type} $relProperties]->(b)
                RETURN a, r, b, id(r) as relId
            `;
        }

        const records = await executeCypher(query, params);

        if (records.length === 0) {
            return res.status(404).json({ error: 'Source or target node not found' });
        }

        const source = records[0].get('a');
        const target = records[0].get('b');
        const rel = records[0].get('r');

        res.status(201).json({
            success: true,
            relationship: {
                id: records[0].get('relId').toString(),
                type,
                properties: rel.properties,
                source: {
                    id: source.properties.id || safeIdToString(source.identity),
                    name: source.properties.name || source.properties.title
                },
                target: {
                    id: target.properties.id || safeIdToString(target.identity),
                    name: target.properties.name || target.properties.title
                }
            }
        });
    } catch (error) {
        console.error('Error creating relationship:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * DELETE /api/v1/knowledge/crud/relationship/:relId
 * Delete a relationship by ID
 */
router.delete('/crud/relationship/:relId', async (req, res) => {
    try {
        const { relId } = req.params;
        const parsedId = parseInt(relId);

        if (isNaN(parsedId)) {
            return res.status(400).json({ error: 'Invalid relationship ID' });
        }

        // Check if relationship exists
        const checkQuery = `MATCH ()-[r]->() WHERE id(r) = $relId RETURN r, type(r) as relType`;
        const checkRecords = await executeCypher(checkQuery, { relId: parsedId });

        if (checkRecords.length === 0) {
            return res.status(404).json({ error: 'Relationship not found' });
        }

        const relType = checkRecords[0].get('relType');

        // Delete relationship
        const deleteQuery = `MATCH ()-[r]->() WHERE id(r) = $relId DELETE r`;
        await executeCypher(deleteQuery, { relId: parsedId });

        res.json({
            success: true,
            message: 'Relationship deleted successfully',
            deletedType: relType
        });
    } catch (error) {
        console.error('Error deleting relationship:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/crud/node/:nodeId/neighbors
 * Get a node and its immediate neighbors
 */
router.get('/crud/node/:nodeId/neighbors', async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { depth = 1 } = req.query;

        const parsedId = parseInt(nodeId);
        const isInternalId = !isNaN(parsedId);
        const safeDepth = Math.min(Math.max(1, parseInt(depth) || 1), 3);

        const query = isInternalId
            ? `MATCH (center) WHERE id(center) = $id
               OPTIONAL MATCH (center)-[r*1..${safeDepth}]-(neighbor)
               RETURN center, collect(DISTINCT neighbor) as neighbors,
                      collect(DISTINCT r) as paths`
            : `MATCH (center {id: $id})
               OPTIONAL MATCH (center)-[r*1..${safeDepth}]-(neighbor)
               RETURN center, collect(DISTINCT neighbor) as neighbors,
                      collect(DISTINCT r) as paths`;

        const records = await executeCypher(query, { id: isInternalId ? parsedId : nodeId });

        if (records.length === 0) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const centerNode = records[0].get('center');
        const neighbors = records[0].get('neighbors') || [];

        res.json({
            center: {
                id: centerNode.properties.id || safeIdToString(centerNode.identity),
                labels: centerNode.labels,
                properties: centerNode.properties
            },
            neighbors: neighbors.filter(n => n).map(n => ({
                id: n.properties.id || safeIdToString(n.identity),
                labels: n.labels,
                properties: n.properties
            })),
            depth: safeDepth
        });
    } catch (error) {
        console.error('Error getting node neighbors:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/crud/node/:nodeId/structure
 * Get a node's graph structure with directed edges (not just horizontal neighbors).
 * Returns incoming and outgoing relationships with proper direction.
 * OPTIMIZED: Uses UNION for parallel execution, LIMIT for bounded results
 */
router.get('/crud/node/:nodeId/structure', async (req, res) => {
    const { getTensorService } = require('../services/tensor.service');
    const tensorService = getTensorService();
    const requestTensor = tensorService.start('api.request.structure', {
        nodeId: req.params.nodeId,
        depth: req.query.depth
    });

    try {
        const { nodeId } = req.params;
        const { depth = 1, limit = 50 } = req.query;

        const parsedId = parseInt(nodeId);
        const isInternalId = !isNaN(parsedId);
        const safeLimit = Math.min(Math.max(1, parseInt(limit) || 50), 200);

        // Three flat queries (no CALL subqueries — AGE v1.6 does not support them).
        // Rename 'center' (PostgreSQL geometric reserved) and 'node' (reserved) to safe aliases.
        const queryTensor = tensorService.start('db.query.structure', {
            nodeId, isInternalId, limit: safeLimit
        }, requestTensor.id);

        // For AGE internal IDs: extract the label from ag_catalog (top 16 bits of graphid)
        // so MATCH (ctr:Label) uses the label table's primary key instead of scanning all labels.
        let matchCtr;
        let idParam = {};
        if (isInternalId) {
            const label = await memgraphService.getVertexLabelById(nodeId);
            if (label) {
                matchCtr = `MATCH (ctr:${label}) WHERE id(ctr) = ${nodeId}`;
            } else {
                matchCtr = `MATCH (ctr) WHERE id(ctr) = ${nodeId}`;
            }
        } else {
            matchCtr = 'MATCH (ctr {id: $id})';
            idParam = { id: nodeId };
        }

        const [centerRecords, outRecords, inRecords] = await Promise.all([
            executeCypher(`${matchCtr} RETURN ctr`, idParam),
            executeCypher(`${matchCtr} MATCH (ctr)-[r]->(nbr) RETURN ctr, r AS rel, nbr, 'outgoing' AS dir LIMIT ${safeLimit}`, idParam),
            executeCypher(`${matchCtr} MATCH (nbr)-[r]->(ctr) RETURN ctr, r AS rel, nbr, 'incoming' AS dir LIMIT ${safeLimit}`, idParam)
        ]);
        tensorService.complete(queryTensor.id, { recordCount: outRecords.length + inRecords.length });

        if (centerRecords.length === 0) {
            tensorService.complete(requestTensor.id, { status: 404 });
            return res.status(404).json({ error: 'Node not found' });
        }

        // Processing tensor
        const processTensor = tensorService.start('api.process.structure', {
            recordCount: outRecords.length + inRecords.length
        }, requestTensor.id);

        // Build nodes and edges
        const nodes = new Map();
        const edges = [];

        const centerNodeRaw = centerRecords[0].get('ctr');
        const centerId = safeIdToString(centerNodeRaw.identity);
        nodes.set(centerId, {
            id: centerId,
            externalId: centerNodeRaw.properties.id,
            labels: centerNodeRaw.labels,
            properties: centerNodeRaw.properties,
            isCenter: true
        });

        for (const record of [...outRecords, ...inRecords]) {
            const rel = record.get('rel');
            const nbr = record.get('nbr');
            const direction = record.get('dir');

            if (nbr) {
                const nbrId = safeIdToString(nbr.identity);
                if (!nodes.has(nbrId)) {
                    nodes.set(nbrId, {
                        id: nbrId,
                        externalId: nbr.properties.id,
                        labels: nbr.labels,
                        properties: nbr.properties,
                        isCenter: false
                    });
                }

                if (rel) {
                    const edgeId = direction === 'outgoing'
                        ? `edge-${centerId}-${nbrId}-${rel.type}`
                        : `edge-${nbrId}-${centerId}-${rel.type}`;

                    if (!edges.find(e => e.id === edgeId)) {
                        edges.push({
                            id: edgeId,
                            source: direction === 'outgoing' ? centerId : nbrId,
                            target: direction === 'outgoing' ? nbrId : centerId,
                            type: rel.type,
                            properties: rel.properties || {},
                            direction
                        });
                    }
                }
            }
        }

        tensorService.complete(processTensor.id, {
            nodeCount: nodes.size,
            edgeCount: edges.length
        });

        // Calculate stats from edges
        const incomingCount = edges.filter(e => e.direction === 'incoming').length;
        const outgoingCount = edges.filter(e => e.direction === 'outgoing').length;

        tensorService.complete(requestTensor.id, {
            status: 200,
            nodeCount: nodes.size,
            edgeCount: edges.length
        });

        res.json({
            center: nodes.get(centerId),
            nodes: Array.from(nodes.values()),
            edges: edges,
            stats: {
                totalNodes: nodes.size,
                incomingEdges: incomingCount,
                outgoingEdges: outgoingCount
            }
        });
    } catch (error) {
        // Fail all active tensors for this request
        const { getTensorService } = require('../services/tensor.service');
        getTensorService().fail(requestTensor?.id, error);

        console.error('Error getting node structure:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/v1/knowledge/crud/execute
 * Execute a custom Cypher query (with safety validation)
 */
router.post('/crud/execute', async (req, res) => {
    try {
        const { query, params = {} } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ error: 'Query string is required' });
        }

        // Security: block dangerous operations
        const upperQuery = query.trim().toUpperCase();
        const dangerousKeywords = ['DROP', 'DELETE ALL', 'DETACH DELETE', 'REMOVE', 'CREATE INDEX', 'DROP INDEX'];

        for (const keyword of dangerousKeywords) {
            if (upperQuery.includes(keyword) && !req.query.force) {
                return res.status(403).json({
                    error: `Query contains potentially dangerous operation: ${keyword}`,
                    hint: 'Use specific CRUD endpoints for modifications or add ?force=true'
                });
            }
        }

        const records = await executeCypher(query, params);
        const results = records.map(record => {
            const obj = {};
            record.keys.forEach(key => {
                const value = record.get(key);
                if (value && value.labels && value.properties) {
                    obj[key] = {
                        id: safeIdToString(value.identity),
                        labels: value.labels,
                        properties: value.properties
                    };
                } else if (value && typeof value.toNumber === 'function') {
                    obj[key] = value.toNumber();
                } else {
                    obj[key] = value;
                }
            });
            return obj;
        });

        res.json({
            success: true,
            results,
            count: results.length
        });
    } catch (error) {
        console.error('Error executing custom query:', error);
        res.status(500).json({ error: error.message });
    }
});

// Note: driver cleanup is handled by memgraph.service singleton

module.exports = router;
