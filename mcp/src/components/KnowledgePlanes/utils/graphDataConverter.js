/**
 * Graph Data Converter
 * Converts graph data from GraphCatalog format to KnowledgePlanes format
 */

// Plane configuration
const PLANES = ['strategic', 'business', 'tasks', 'code', 'infrastructure'];

// Edge type list for random selection
const EDGE_TYPES_LIST = ['implements', 'subtask', 'submodule', 'depends', 'contains', 'deploys', 'uses', 'tracks', 'derives', 'configures'];

// Semantic domains for vector generation
const SEMANTIC_DOMAINS = {
    security: { vector: [0.9, 0.1, 0.2, 0.1] },
    payment: { vector: [0.2, 0.9, 0.3, 0.1] },
    data: { vector: [0.3, 0.2, 0.9, 0.2] },
    user: { vector: [0.1, 0.3, 0.2, 0.9] },
    infrastructure: { vector: [0.5, 0.5, 0.5, 0.5] },
    api: { vector: [0.4, 0.6, 0.4, 0.3] },
    monitoring: { vector: [0.6, 0.3, 0.7, 0.2] }
};

/**
 * Cosine similarity between two vectors
 */
const cosineSimilarity = (a, b) => {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magA * magB);
};

/**
 * Generate a random vector with optional domain bias
 */
const generateVector = (seed, domainBias = null, noise = 0.3) => {
    let rng = seed;
    const random = () => {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return rng / 0x7fffffff;
    };

    let base = [random(), random(), random(), random()];
    if (domainBias && SEMANTIC_DOMAINS[domainBias]) {
        const domainVec = SEMANTIC_DOMAINS[domainBias].vector;
        base = base.map((v, i) => v * noise + domainVec[i] * (1 - noise));
    }
    const mag = Math.sqrt(base.reduce((s, v) => s + v * v, 0));
    return base.map(v => v / mag);
};

/**
 * Convert vector to 2D position
 */
const vectorToPosition = (vector, scale = 150) => {
    const projX = vector[0] * 0.7 - vector[1] * 0.3 + vector[2] * 0.4 - vector[3] * 0.5;
    const projY = vector[0] * 0.3 + vector[1] * 0.6 - vector[2] * 0.5 + vector[3] * 0.4;
    return { x: projX * scale, y: projY * scale };
};

/**
 * Determine plane based on node type or position
 */
const determinePlane = (node, index, totalNodes) => {
    const nodeType = node.type || node.data?.type || '';
    const nodeName = (node.data?.label || node.data?.name || node.id || '').toLowerCase();

    // Try to infer plane from node type/name
    if (nodeType === 'start' || nodeName.includes('okr') || nodeName.includes('kpi') || nodeName.includes('strategy') || nodeName.includes('vision')) {
        return 'strategic';
    }
    if (nodeType === 'subprocess' || nodeName.includes('epic') || nodeName.includes('feature') || nodeName.includes('process') || nodeName.includes('workflow')) {
        return 'business';
    }
    if (nodeType === 'task' || nodeName.includes('task') || nodeName.includes('story') || nodeName.includes('bug') || nodeName.includes('sprint')) {
        return 'tasks';
    }
    if (nodeType === 'decision' || nodeName.includes('module') || nodeName.includes('service') || nodeName.includes('controller') || nodeName.includes('code')) {
        return 'code';
    }
    if (nodeType === 'end' || nodeName.includes('server') || nodeName.includes('database') || nodeName.includes('cluster') || nodeName.includes('infra')) {
        return 'infrastructure';
    }

    // Distribute evenly across planes based on index
    const planeIndex = Math.floor((index / totalNodes) * PLANES.length);
    return PLANES[Math.min(planeIndex, PLANES.length - 1)];
};

/**
 * Determine semantic domain from node content
 */
const determineSemanticDomain = (node) => {
    const content = (
        (node.data?.label || '') +
        (node.data?.name || '') +
        (node.data?.description || '') +
        (node.id || '')
    ).toLowerCase();

    if (content.includes('security') || content.includes('auth') || content.includes('token')) return 'security';
    if (content.includes('payment') || content.includes('billing') || content.includes('invoice')) return 'payment';
    if (content.includes('data') || content.includes('database') || content.includes('storage')) return 'data';
    if (content.includes('user') || content.includes('profile') || content.includes('account')) return 'user';
    if (content.includes('server') || content.includes('deploy') || content.includes('cluster')) return 'infrastructure';
    if (content.includes('api') || content.includes('endpoint') || content.includes('request')) return 'api';
    if (content.includes('monitor') || content.includes('log') || content.includes('metric')) return 'monitoring';

    // Random domain
    const domains = Object.keys(SEMANTIC_DOMAINS);
    const seed = content.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return domains[seed % domains.length];
};

/**
 * Convert GraphCatalog data to KnowledgePlanes format
 * @param {Object} graphData - Graph data from GraphCatalog { nodes, edges, name, description, ... }
 * @returns {Object} - KnowledgePlanes format { nodes, edges, bridges, ancestorMap, metadata }
 */
export const convertToKnowledgePlanesFormat = (graphData) => {
    if (!graphData || !graphData.nodes) {
        return null;
    }

    const sourceNodes = graphData.nodes || [];
    const sourceEdges = graphData.edges || [];

    // Convert nodes
    const convertedNodes = sourceNodes.map((node, index) => {
        const plane = determinePlane(node, index, sourceNodes.length);
        const semanticDomain = determineSemanticDomain(node);
        const seed = (node.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) + index;
        const vector = generateVector(seed, semanticDomain, 0.4);
        const pos = vectorToPosition(vector);

        return {
            id: node.id,
            type: node.type || node.data?.type || 'task',
            plane,
            label: node.data?.label || node.data?.name || node.id,
            x: node.position?.x ?? pos.x,
            y: node.position?.y ?? pos.y,
            vector,
            semanticDomain,
            isBridge: false,
            originalData: node.data
        };
    });

    // Find cross-layer edges and mark bridge nodes
    const nodeMap = new Map(convertedNodes.map(n => [n.id, n]));
    const bridgeNodeIds = new Set();

    const convertedEdges = sourceEdges.map((edge, index) => {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);

        if (!sourceNode || !targetNode) {
            return null;
        }

        const crossLayer = sourceNode.plane !== targetNode.plane;

        if (crossLayer) {
            bridgeNodeIds.add(sourceNode.id);
            bridgeNodeIds.add(targetNode.id);
        }

        const seed = (edge.id || `${edge.source}-${edge.target}`).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const edgeType = edge.type || edge.data?.type || EDGE_TYPES_LIST[seed % EDGE_TYPES_LIST.length];

        return {
            source: edge.source,
            target: edge.target,
            crossLayer,
            plane: crossLayer ? null : sourceNode.plane,
            type: edgeType,
            description: edge.data?.label || `${sourceNode.label} → ${targetNode.label}`,
            similarity: sourceNode.vector && targetNode.vector
                ? cosineSimilarity(sourceNode.vector, targetNode.vector)
                : 0.5
        };
    }).filter(Boolean);

    // Mark bridge nodes
    const bridgeId = 'imported-bridge';
    convertedNodes.forEach(node => {
        if (bridgeNodeIds.has(node.id)) {
            node.isBridge = true;
            node.bridgeId = bridgeId;
        }
    });

    // Generate bridges structure
    const bridgeNodes = convertedNodes.filter(n => n.isBridge);
    const bridgePlanes = [...new Set(bridgeNodes.map(n => n.plane))].sort((a, b) =>
        PLANES.indexOf(a) - PLANES.indexOf(b)
    );

    const bridges = bridgeNodes.length > 0 ? [{
        bridgeId,
        label: graphData.name || 'Imported Graph',
        planes: bridgePlanes,
        instances: Object.fromEntries(bridgeNodes.map(n => [n.plane, n])),
        vector: bridgeNodes[0]?.vector || [0.5, 0.5, 0.5, 0.5],
        primaryDomain: bridgeNodes[0]?.semanticDomain || 'data',
        secondaryDomain: bridgeNodes[1]?.semanticDomain || 'api'
    }] : [];

    // Build ancestor map
    const ancestorMap = {};
    const buildAncestors = (nodeId, visited = new Set()) => {
        if (visited.has(nodeId)) return [];
        visited.add(nodeId);
        const ancestors = [];
        convertedEdges.forEach(edge => {
            if (edge.target === nodeId) {
                ancestors.push({ nodeId: edge.source, edgeType: edge.type });
                ancestors.push(...buildAncestors(edge.source, visited));
            }
        });
        return ancestors;
    };

    convertedNodes.forEach(node => {
        ancestorMap[node.id] = buildAncestors(node.id);
    });

    // Count nodes by plane
    const nodesByPlane = {};
    PLANES.forEach(plane => {
        nodesByPlane[plane] = convertedNodes.filter(n => n.plane === plane).length;
    });

    return {
        nodes: convertedNodes,
        edges: convertedEdges,
        bridges,
        ancestorMap,
        metadata: {
            seed: Date.now(),
            generatedAt: new Date().toISOString(),
            source: 'graph-catalog',
            sourceGraph: {
                id: graphData.id,
                name: graphData.name,
                type: graphData.type,
                description: graphData.description
            },
            stats: {
                totalNodes: convertedNodes.length,
                bridgeNodes: bridgeNodes.length,
                standaloneNodes: convertedNodes.length - bridgeNodes.length,
                totalEdges: convertedEdges.length,
                crossLayerEdges: convertedEdges.filter(e => e.crossLayer).length,
                nodesByPlane
            }
        }
    };
};

export default {
    convertToKnowledgePlanesFormat
};
