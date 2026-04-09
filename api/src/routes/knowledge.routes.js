/**
 * Knowledge Graph API Routes
 * Provides REST API endpoints for knowledge graph operations
 *
 * IMPORTANT: Uses shared memgraph.service driver to avoid connection pool exhaustion.
 * Do NOT create separate neo4j.driver() instances!
 */

const express = require('express');
const router = express.Router();

// Use shared memgraph service (singleton) to avoid multiple driver instances
const memgraphService = require('../services/memgraph.service');

// Helper function to execute Cypher queries using shared driver
async function executeCypher(query, params = {}) {
    const result = await memgraphService.executeQuery(query, params);
    return result.records || [];
}

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

// Helper function to transform Neo4j records to simple objects
function transformRecord(record) {
    const node = record.get('n');
    return {
        id: safeIdToString(node.identity),
        labels: node.labels,
        properties: node.properties
    };
}

/**
 * GET /api/v1/knowledge/graph
 * Fetch entire knowledge graph
 */
router.get('/graph', async (req, res) => {
    try {
        const { type, limit = 100 } = req.query;

        // Build query based on filters
        let nodeQuery = 'MATCH (n)';
        const params = { limit: parseInt(limit) };

        if (type) {
            const types = Array.isArray(type) ? type : [type];
            nodeQuery += ` WHERE ${types.map((t, i) => `'${t}' IN labels(n)`).join(' OR ')}`;
        }

        nodeQuery += ` RETURN n LIMIT $limit`;

        // Fetch nodes
        const nodeRecords = await executeCypher(nodeQuery, params);
        const nodes = nodeRecords.map(record => {
            const node = record.get('n');
            return {
                id: safeIdToString(node.identity),
                labels: node.labels,
                properties: node.properties
            };
        });

        // Fetch edges
        const edgeQuery = `
            MATCH (a)-[r]->(b)
            WHERE id(a) IN $nodeIds AND id(b) IN $nodeIds
            RETURN id(a) as source, id(b) as target, type(r) as type, properties(r) as properties
        `;

        const nodeIds = nodes.map(n => parseInt(n.id));
        const edgeRecords = await executeCypher(edgeQuery, { nodeIds });
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
 * GET /api/v1/knowledge/graph/subgraph/:nodeId
 * Fetch subgraph around a specific node
 */
router.get('/graph/subgraph/:nodeId', async (req, res) => {
    try {
        const { nodeId } = req.params;
        // Limit depth to prevent memory issues with large graphs
        const depth = Math.min(parseInt(req.query.depth) || 2, 3);

        const query = `
            MATCH (center)
            WHERE id(center) = $nodeId
            CALL {
                WITH center
                MATCH path = (center)-[*1..${depth}]-(connected)
                RETURN DISTINCT connected as n
                LIMIT 200
                UNION
                WITH center
                RETURN center as n
            }
            WITH collect(DISTINCT n)[..250] as nodes
            UNWIND nodes as n
            MATCH (a)-[r]->(b)
            WHERE a IN nodes AND b IN nodes
            RETURN collect(DISTINCT n) as allNodes, collect(DISTINCT {source: id(a), target: id(b), type: type(r), properties: properties(r)})[..500] as edges
        `;

        const records = await executeCypher(query, { nodeId: parseInt(nodeId) });

        if (records.length === 0) {
            return res.status(404).json({ error: 'Node not found' });
        }

        const record = records[0];
        const nodes = record.get('allNodes').map(node => ({
            id: safeIdToString(node.identity),
            labels: node.labels,
            properties: node.properties
        }));
        const edges = record.get('edges');

        res.json({ nodes, edges });
    } catch (error) {
        console.error('Error fetching subgraph:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/search
 * Search nodes by property
 */
router.get('/search', async (req, res) => {
    try {
        const { property, value } = req.query;

        if (!property || !value) {
            return res.status(400).json({ error: 'Property and value are required' });
        }

        const query = `
            MATCH (n)
            WHERE n.${property} CONTAINS $value
            RETURN n
            LIMIT 50
        `;

        const records = await executeCypher(query, { value });
        const nodes = records.map(transformRecord);

        res.json(nodes);
    } catch (error) {
        console.error('Error searching nodes:', error);
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

        const node = transformRecord(records[0]);
        res.json(node);
    } catch (error) {
        console.error('Error fetching node details:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/node/:nodeId/relationships
 * Get relationships for a specific node
 */
router.get('/node/:nodeId/relationships', async (req, res) => {
    try {
        const { nodeId } = req.params;
        const { direction = 'both' } = req.query;

        let query;
        if (direction === 'in') {
            query = 'MATCH (a)-[r]->(n) WHERE id(n) = $nodeId RETURN a, r, n';
        } else if (direction === 'out') {
            query = 'MATCH (n)-[r]->(b) WHERE id(n) = $nodeId RETURN n, r, b';
        } else {
            query = 'MATCH (a)-[r]-(n) WHERE id(n) = $nodeId RETURN a, r, n';
        }

        const records = await executeCypher(query, { nodeId: parseInt(nodeId) });
        const relationships = records.map(record => {
            const rel = record.get('r');
            const otherNode = record.get(direction === 'in' ? 'a' : 'b');
            return {
                id: safeIdToString(rel.identity),
                type: rel.type,
                properties: rel.properties,
                otherNode: {
                    id: safeIdToString(otherNode.identity),
                    labels: otherNode.labels,
                    properties: otherNode.properties
                }
            };
        });

        res.json(relationships);
    } catch (error) {
        console.error('Error fetching node relationships:', error);
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
 * GET /api/v1/knowledge/related
 * Find related entities (using MCP-like logic)
 */
router.get('/related', async (req, res) => {
    try {
        const { entity, depth = 2, relation_type } = req.query;

        if (!entity) {
            return res.status(400).json({ error: 'Entity name is required' });
        }

        let query = `
            MATCH (start)
            WHERE start.name = $entity OR start.title = $entity
            CALL {
                WITH start
                MATCH path = (start)-[r${relation_type ? ':' + relation_type : ''}*1..${depth}]-(related)
                RETURN DISTINCT related, relationships(path) as rels
            }
            RETURN collect(DISTINCT related) as nodes, collect(DISTINCT rels) as relationships
        `;

        const records = await executeCypher(query, { entity });

        if (records.length === 0) {
            return res.status(404).json({ error: 'Entity not found' });
        }

        const record = records[0];
        const nodes = record.get('nodes').map(node => ({
            id: safeIdToString(node.identity),
            labels: node.labels,
            properties: node.properties
        }));

        const relationships = [];
        record.get('relationships').forEach(relArray => {
            relArray.forEach(rel => {
                relationships.push({
                    id: safeIdToString(rel.identity),
                    type: rel.type,
                    properties: rel.properties,
                    start: safeIdToString(rel.start),
                    end: safeIdToString(rel.end)
                });
            });
        });

        res.json({ nodes, relationships });
    } catch (error) {
        console.error('Error finding related entities:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/v1/knowledge/path
 * Find shortest path between two nodes
 */
router.get('/path', async (req, res) => {
    try {
        const { from, to, maxDepth = 5 } = req.query;
        // Limit maxDepth to prevent expensive traversals
        const safeMaxDepth = Math.min(parseInt(maxDepth) || 5, 10);

        if (!from || !to) {
            return res.status(400).json({ error: 'Both from and to node IDs are required' });
        }

        const query = `
            MATCH (a), (b)
            WHERE id(a) = $fromId AND id(b) = $toId
            MATCH path = shortestPath((a)-[*..${safeMaxDepth}]-(b))
            RETURN path, nodes(path) as pathNodes, relationships(path) as pathRels
        `;

        const records = await executeCypher(query, {
            fromId: parseInt(from),
            toId: parseInt(to)
        });

        if (records.length === 0) {
            return res.status(404).json({ error: 'No path found between nodes' });
        }

        const record = records[0];
        const nodes = record.get('pathNodes').map(node => ({
            id: safeIdToString(node.identity),
            labels: node.labels,
            properties: node.properties
        }));

        const relationships = record.get('pathRels').map(rel => ({
            id: safeIdToString(rel.identity),
            type: rel.type,
            properties: rel.properties,
            start: safeIdToString(rel.start),
            end: safeIdToString(rel.end)
        }));

        res.json({
            path: { nodes, relationships },
            length: nodes.length - 1
        });
    } catch (error) {
        console.error('Error finding shortest path:', error);
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

        // Layout configuration
        const MIN_NODE_DISTANCE = 40;  // Minimum distance between nodes
        const REPULSION_STRENGTH = 500;
        const LAYOUT_ITERATIONS = 50;
        const PLANE_WIDTH = 300;
        const PLANE_HEIGHT = 200;

        // Build query to fetch nodes with their embeddings if available
        let nodeQuery = `
            MATCH (n)
            WHERE n.projectId = $projectId OR $projectId IS NULL
        `;

        const params = {
            limit: parseInt(limit),
            projectId: projectId || null
        };

        nodeQuery += `
            RETURN n,
                   labels(n) as nodeLabels,
                   n.embedding as embedding,
                   n.embeddingX as embeddingX,
                   n.embeddingY as embeddingY
            LIMIT $limit
        `;

        const nodeRecords = await executeCypher(nodeQuery, params);

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
            const embedding = record.get('embedding');
            const embeddingX = record.get('embeddingX');
            const embeddingY = record.get('embeddingY');

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

            // Calculate position from embedding or properties
            let x = 0, y = 0;
            let vector = null;
            let hasVectorCoords = false;

            if (embedding && Array.isArray(embedding) && embedding.length >= 4) {
                // Use first 4 dimensions for positioning
                vector = embedding.slice(0, 4);
                // Project 4D to 2D
                x = (vector[0] * 0.7 - vector[1] * 0.3 + vector[2] * 0.4 - vector[3] * 0.5) * 150;
                y = (vector[0] * 0.3 + vector[1] * 0.6 - vector[2] * 0.5 + vector[3] * 0.4) * 150;
                hasVectorCoords = true;
            } else if (embeddingX !== null && embeddingY !== null) {
                x = embeddingX;
                y = embeddingY;
                hasVectorCoords = true;
            } else {
                // Initial position: use deterministic hash (will be refined by force layout)
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
                vx: 0,
                vy: 0,
                hasVectorCoords,
                vector: vector || [Math.random(), Math.random(), Math.random(), Math.random()],
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
                    if (nodeA.hasVectorCoords) continue;

                    for (let j = i + 1; j < planeNodes.length; j++) {
                        const nodeB = planeNodes[j];

                        const dx = nodeB.x - nodeA.x;
                        const dy = nodeB.y - nodeA.y;
                        const distSq = dx * dx + dy * dy;
                        const dist = Math.sqrt(distSq) || 0.1;

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

                    nodeA.vx -= nodeA.x * 0.01 * alpha;
                    nodeA.vy -= nodeA.y * 0.01 * alpha;
                }

                planeNodes.forEach(node => {
                    if (node.hasVectorCoords) return;

                    node.x += node.vx * 0.5;
                    node.y += node.vy * 0.5;
                    node.vx *= 0.8;
                    node.vy *= 0.8;

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
            WHERE id(a) IN $nodeIds AND id(b) IN $nodeIds
            RETURN id(a) as sourceId, id(b) as targetId, type(r) as relType, properties(r) as relProps
        `;

        const edgeRecords = await executeCypher(edgeQuery, { nodeIds });

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

// Note: driver cleanup is handled by memgraph.service singleton

module.exports = router;
