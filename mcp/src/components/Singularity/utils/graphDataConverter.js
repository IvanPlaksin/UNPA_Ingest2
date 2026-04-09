/**
 * Graph Data Converter for SingularityGraph
 * Converts graph data from GraphCatalog format to SingularityGraph format
 */

// Node type colors matching SingularityGraph CONFIG
const TYPE_COLORS = {
    workItem: '#00FFFF',  // Cyan
    bug: '#FF4444',       // Red
    feature: '#44FF44',   // Green
    epic: '#FF00FF',      // Magenta
    file: '#AAAAAA',      // Grey
    task: '#00FFFF',      // Cyan
    decision: '#FFD700',  // Gold
    subprocess: '#FF00FF', // Magenta
    start: '#44FF44',     // Green
    end: '#FF4444',       // Red
    default: '#94a3b8'    // Grey
};

/**
 * Determine node type from GraphCatalog node
 */
const determineNodeType = (node) => {
    const nodeType = (node.type || node.data?.type || '').toLowerCase();
    const nodeName = (node.data?.label || node.data?.name || node.id || '').toLowerCase();

    if (nodeType === 'start' || nodeName.includes('start')) return 'start';
    if (nodeType === 'end' || nodeName.includes('end')) return 'end';
    if (nodeType === 'decision' || nodeName.includes('decision') || nodeName.includes('condition')) return 'decision';
    if (nodeType === 'subprocess' || nodeName.includes('subprocess') || nodeName.includes('subgraph')) return 'subprocess';
    if (nodeName.includes('bug') || nodeName.includes('defect') || nodeName.includes('issue')) return 'bug';
    if (nodeName.includes('epic') || nodeName.includes('initiative')) return 'epic';
    if (nodeName.includes('feature') || nodeName.includes('capability')) return 'feature';
    if (nodeName.includes('file') || nodeName.includes('artifact') || nodeName.includes('document')) return 'file';
    if (nodeName.includes('task') || nodeType === 'task') return 'task';

    return 'workItem';
};

/**
 * Calculate node level based on graph structure
 */
const calculateLevels = (nodes, links) => {
    const nodeMap = new Map(nodes.map(n => [n.id, { ...n, level: 0 }]));
    const incomingEdges = new Map();

    // Count incoming edges
    links.forEach(link => {
        const target = typeof link.target === 'object' ? link.target.id : link.target;
        incomingEdges.set(target, (incomingEdges.get(target) || 0) + 1);
    });

    // Find root nodes (no incoming edges)
    const rootNodes = nodes.filter(n => !incomingEdges.has(n.id));

    // BFS to calculate levels
    const queue = rootNodes.map(n => ({ id: n.id, level: 0 }));
    const visited = new Set();

    while (queue.length > 0) {
        const { id, level } = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);

        const node = nodeMap.get(id);
        if (node) {
            node.level = level;
        }

        // Find children
        links.forEach(link => {
            const source = typeof link.source === 'object' ? link.source.id : link.source;
            const target = typeof link.target === 'object' ? link.target.id : link.target;
            if (source === id && !visited.has(target)) {
                queue.push({ id: target, level: level + 1 });
            }
        });
    }

    return nodeMap;
};

/**
 * Check if node has a subgraph
 * @param {Object} node - The node to check
 * @param {Object} subgraphsMap - Map of nodeId -> subGraph data (from backend)
 */
const hasSubGraph = (node, subgraphsMap = {}) => {
    // Check direct subGraphId reference on node
    if (node.subGraphId || node.data?.subGraphId) {
        return true;
    }
    // Check in subgraphs map by node ID (backend returns nodeId -> subGraphData)
    if (subgraphsMap && subgraphsMap[node.id]) {
        return true;
    }
    // Subprocess type nodes are assumed to have subgraphs
    const nodeType = (node.type || node.data?.type || '').toLowerCase();
    if (nodeType === 'subprocess') {
        return true;
    }
    return false;
};

/**
 * Get subgraph ID for a node
 * @param {Object} node - The node to check
 * @param {Object} subgraphsMap - Map of nodeId -> subGraph data (from backend)
 * @returns {string|null} The subgraph ID or null
 */
const getSubGraphId = (node, subgraphsMap = {}) => {
    // Direct reference on node
    if (node.subGraphId) return node.subGraphId;
    if (node.data?.subGraphId) return node.data.subGraphId;

    // Check in subgraphs map - backend returns full subGraph object with id
    if (subgraphsMap && subgraphsMap[node.id]) {
        const subGraph = subgraphsMap[node.id];
        // subGraph can be the full graph data or just an id string
        return typeof subGraph === 'object' ? subGraph.id : subGraph;
    }
    return null;
};

/**
 * Convert GraphCatalog data to SingularityGraph format
 * @param {Object} graphData - Graph data from GraphCatalog { nodes, edges, name, subgraphs, ... }
 * @returns {Object} - SingularityGraph format { nodes, links }
 */
export const convertToSingularityFormat = (graphData) => {
    if (!graphData || !graphData.nodes) {
        return { nodes: [], links: [] };
    }

    const sourceNodes = graphData.nodes || [];
    const sourceEdges = graphData.edges || [];
    // Map of nodeId -> subGraph data for quick lookup
    // Backend returns 'subGraphs' (camelCase), also support 'subgraphs' for flexibility
    const subgraphsMap = graphData.subGraphs || graphData.subgraphs || {};

    // Debug: log subgraph info
    const subgraphKeys = Object.keys(subgraphsMap);
    if (subgraphKeys.length > 0) {
        console.log('[GraphDataConverter] Found subGraphs for nodes:', subgraphKeys);
    } else {
        console.log('[GraphDataConverter] No subGraphs in graphData. Keys available:', Object.keys(graphData));
        // Debug: also check if any nodes have subprocess type
        const subprocessNodes = sourceNodes.filter(n => {
            const nodeType = (n.type || n.data?.type || '').toLowerCase();
            return nodeType === 'subprocess';
        });
        if (subprocessNodes.length > 0) {
            console.log('[GraphDataConverter] Found subprocess nodes:', subprocessNodes.map(n => n.id));
        }
    }

    // Convert edges to links format first (for level calculation)
    const links = sourceEdges.map(edge => ({
        source: edge.source,
        target: edge.target,
        type: edge.type || edge.data?.type || 'related'
    }));

    // Calculate levels
    const nodeMapWithLevels = calculateLevels(sourceNodes, links);

    // Convert nodes
    const nodes = sourceNodes.map(node => {
        const nodeType = determineNodeType(node);
        const nodeWithLevel = nodeMapWithLevels.get(node.id);
        const level = nodeWithLevel?.level || 0;
        const nodeHasSubGraph = hasSubGraph(node, subgraphsMap);
        const subGraphId = getSubGraphId(node, subgraphsMap);

        return {
            id: node.id,
            type: nodeType,
            name: node.data?.label || node.data?.name || node.id,
            data: node.data || {},
            level: level,
            loaded: true,
            color: TYPE_COLORS[nodeType] || TYPE_COLORS.default,
            val: 10 - level * 2, // Smaller nodes at deeper levels
            // Subgraph info
            hasSubGraph: nodeHasSubGraph,
            subGraphId: subGraphId,
            isExpanded: false, // Initially collapsed
            // Original data for reference
            originalNode: node
        };
    });

    // Count nodes with subgraphs
    const nodesWithSubGraphs = nodes.filter(n => n.hasSubGraph).length;

    return {
        nodes,
        links,
        metadata: {
            source: 'graph-catalog',
            sourceGraph: {
                id: graphData.id,
                name: graphData.name,
                type: graphData.type,
                description: graphData.description
            },
            stats: {
                totalNodes: nodes.length,
                totalLinks: links.length,
                maxLevel: Math.max(...nodes.map(n => n.level), 0),
                nodesWithSubGraphs
            }
        }
    };
};

export default {
    convertToSingularityFormat
};
