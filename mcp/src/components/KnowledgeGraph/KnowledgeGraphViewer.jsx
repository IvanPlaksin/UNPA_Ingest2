import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useResizeDetector } from 'react-resize-detector';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { fetchKnowledgeGraphData } from '../../services/knowledgeGraphService';
import { listGraphs, getGraphById } from '../../services/graphCatalog.service';

// Configuration
const CONFIG = {
    colors: {
        background: '#0a0e1a',
        // Node Types
        project: '#3b82f6',      // Blue
        knowledge: '#10b981',     // Green
        chat: '#f59e0b',          // Orange
        artifact: '#ef4444',      // Red
        entity: '#8b5cf6',        // Purple
        concept: '#06b6d4',       // Cyan
        // Relations
        belongsTo: '#6366f1',
        createdIn: '#ec4899',
        dependsOn: '#f97316',
        implements: '#14b8a6',
        references: '#a855f7',
        relatesTo: '#64748b',
        partOf: '#84cc16',
        // UI
        highlight: '#fbbf24'
    },
    bloom: {
        strength: 1.2,
        radius: 0.5,
        threshold: 0.15
    }
};

// Node type to color mapping
const getNodeColor = (node) => {
    const type = (node.labels?.[0] || node.type || '').toLowerCase();

    if (type.includes('project')) return CONFIG.colors.project;
    if (type.includes('knowledge')) return CONFIG.colors.knowledge;
    if (type.includes('chat')) return CONFIG.colors.chat;
    if (type.includes('artifact')) return CONFIG.colors.artifact;
    if (type.includes('entity')) return CONFIG.colors.entity;
    if (type.includes('concept')) return CONFIG.colors.concept;

    return '#94a3b8'; // Default grey
};

// Link type to color mapping
const getLinkColor = (link) => {
    const type = (link.type || '').toLowerCase();

    if (type.includes('belongs')) return CONFIG.colors.belongsTo;
    if (type.includes('created')) return CONFIG.colors.createdIn;
    if (type.includes('depends')) return CONFIG.colors.dependsOn;
    if (type.includes('implements')) return CONFIG.colors.implements;
    if (type.includes('references')) return CONFIG.colors.references;
    if (type.includes('relates')) return CONFIG.colors.relatesTo;
    if (type.includes('part')) return CONFIG.colors.partOf;

    return 'rgba(255,255,255,0.3)';
};

const KnowledgeGraphViewer = () => {
    const fgRef = useRef();
    const { width, height, ref: containerRef } = useResizeDetector();

    // State
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Interaction State
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set());
    const [hoverNode, setHoverNode] = useState(null);
    const [selectedNode, setSelectedNode] = useState(null);

    // Tooltip State
    const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null });
    const mousePos = useRef({ x: 0, y: 0 });

    // Filter State
    const [filters, setFilters] = useState({
        showProjects: true,
        showKnowledge: true,
        showChats: true,
        showArtifacts: true,
        showEntities: true,
        showConcepts: true,
        maxDepth: null // null = show all
    });

    // Graph Catalog Selection state
    const [catalogGraphs, setCatalogGraphs] = useState([]);
    const [catalogGraphsLoading, setCatalogGraphsLoading] = useState(false);
    const [selectedCatalogGraphId, setSelectedCatalogGraphId] = useState('');
    const [selectedCatalogGraph, setSelectedCatalogGraph] = useState(null);
    const [isCatalogMode, setIsCatalogMode] = useState(false);

    // Load Data
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await fetchKnowledgeGraphData();

                // Transform Memgraph data to graph format
                const nodes = data.nodes.map(n => ({
                    id: n.id,
                    name: n.properties.name || n.properties.title || `Node ${n.id}`,
                    type: n.labels[0],
                    labels: n.labels,
                    properties: n.properties,
                    val: 10 // Base size
                }));

                const links = data.edges.map(e => ({
                    source: e.source,
                    target: e.target,
                    type: e.type,
                    properties: e.properties || {}
                }));

                setGraphData({ nodes, links });
            } catch (err) {
                console.error('Failed to load knowledge graph:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    // Load catalog graphs list on mount
    useEffect(() => {
        const loadCatalogGraphs = async () => {
            setCatalogGraphsLoading(true);
            try {
                const result = await listGraphs({});
                setCatalogGraphs(result.data || []);
            } catch (err) {
                console.error('Failed to fetch catalog graphs:', err);
                setCatalogGraphs([]);
            } finally {
                setCatalogGraphsLoading(false);
            }
        };
        loadCatalogGraphs();
    }, []);

    // Load a specific graph from catalog
    const loadCatalogGraph = useCallback(async (graphId) => {
        if (!graphId) {
            clearCatalogSelection();
            return;
        }

        setLoading(true);
        try {
            const graph = await getGraphById(graphId);
            if (!graph) {
                setError('Graph not found in catalog');
                return;
            }

            setSelectedCatalogGraph(graph);
            setSelectedCatalogGraphId(graphId);
            setIsCatalogMode(true);

            // Map catalog nodes to ForceGraph3D format
            const nodes = (graph.nodes || []).map(n => ({
                id: n.id,
                name: n.data?.label || n.data?.name || n.id,
                type: n.data?.kind || n.type || 'Node',
                labels: [n.data?.kind || n.type || 'Node'].filter(Boolean),
                properties: n.data || {},
                val: 10
            }));

            const links = (graph.edges || []).map(e => ({
                source: e.source,
                target: e.target,
                type: e.label || e.data?.label || e.type || 'RELATES_TO',
                properties: e.data || {}
            }));

            setGraphData({ nodes, links });
            setSelectedNode(null);
            setError(null);
        } catch (err) {
            setError('Failed to load catalog graph: ' + err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Clear catalog selection, reload full knowledge graph
    const clearCatalogSelection = useCallback(async () => {
        setSelectedCatalogGraph(null);
        setSelectedCatalogGraphId('');
        setIsCatalogMode(false);
        setSelectedNode(null);

        // Reload the full knowledge graph
        setLoading(true);
        try {
            const data = await fetchKnowledgeGraphData();
            const nodes = data.nodes.map(n => ({
                id: n.id,
                name: n.properties.name || n.properties.title || `Node ${n.id}`,
                type: n.labels[0],
                labels: n.labels,
                properties: n.properties,
                val: 10
            }));
            const links = data.edges.map(e => ({
                source: e.source,
                target: e.target,
                type: e.type,
                properties: e.properties || {}
            }));
            setGraphData({ nodes, links });
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Handle catalog graph selection
    const handleCatalogSelect = useCallback((e) => {
        const graphId = e.target.value;
        if (graphId) {
            loadCatalogGraph(graphId);
        } else {
            clearCatalogSelection();
        }
    }, [loadCatalogGraph, clearCatalogSelection]);

    // Track mouse position
    useEffect(() => {
        const handleMouseMove = (e) => {
            mousePos.current = { x: e.clientX, y: e.clientY };
            if (tooltip.visible) {
                setTooltip(prev => ({ ...prev, x: e.clientX, y: e.clientY }));
            }
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, [tooltip.visible]);

    // Filter data based on settings
    const filteredGraphData = useMemo(() => {
        const typeFilters = {
            'Project': filters.showProjects,
            'Knowledge': filters.showKnowledge,
            'Chat': filters.showChats,
            'Artifact': filters.showArtifacts,
            'Entity': filters.showEntities,
            'Concept': filters.showConcepts
        };

        const nodes = graphData.nodes.filter(node => {
            const primaryLabel = node.labels?.[0] || node.type || '';
            return typeFilters[primaryLabel] !== false;
        });

        const nodeIds = new Set(nodes.map(n => n.id));
        const links = graphData.links.filter(link => {
            const s = typeof link.source === 'object' ? link.source.id : link.source;
            const t = typeof link.target === 'object' ? link.target.id : link.target;
            return nodeIds.has(s) && nodeIds.has(t);
        });

        return { nodes, links };
    }, [graphData, filters]);

    // Node Hover Handler
    const handleNodeHover = useCallback((node) => {
        if ((!node && !highlightNodes.size) || (node && hoverNode === node)) return;

        setHoverNode(node || null);

        if (node) {
            setTooltip({
                visible: true,
                x: mousePos.current.x,
                y: mousePos.current.y,
                content: {
                    title: node.name,
                    subtitle: `${(node.labels?.[0] || 'Node').toUpperCase()} | ID: ${node.id}`,
                    details: node.properties.type || node.properties.description || 'Knowledge Graph Node',
                    tags: node.properties.tags || []
                }
            });

            // Highlight connected nodes
            const neighbors = new Set();
            const links = new Set();

            filteredGraphData.links.forEach(link => {
                const s = typeof link.source === 'object' ? link.source.id : link.source;
                const t = typeof link.target === 'object' ? link.target.id : link.target;

                if (s === node.id || t === node.id) {
                    neighbors.add(s);
                    neighbors.add(t);
                    links.add(link);
                }
            });

            setHighlightNodes(neighbors);
            setHighlightLinks(links);
        } else {
            setTooltip(prev => ({ ...prev, visible: false }));
            setHighlightNodes(new Set());
            setHighlightLinks(new Set());
        }
    }, [filteredGraphData.links, hoverNode, highlightNodes]);

    // Link Hover Handler
    const handleLinkHover = useCallback((link) => {
        if (link) {
            setHighlightLinks(new Set([link]));
            const s = typeof link.source === 'object' ? link.source.id : link.source;
            const t = typeof link.target === 'object' ? link.target.id : link.target;
            setHighlightNodes(new Set([s, t]));

            setTooltip({
                visible: true,
                x: mousePos.current.x,
                y: mousePos.current.y,
                content: {
                    title: link.type || 'Relation',
                    subtitle: `${link.source.name || s} → ${link.target.name || t}`,
                    details: 'Knowledge Relation'
                }
            });
        } else {
            setHighlightLinks(new Set());
            setHighlightNodes(new Set());
            setTooltip(prev => ({ ...prev, visible: false }));
        }
    }, []);

    // Node Click Handler
    const handleNodeClick = useCallback((node) => {
        setSelectedNode(node);

        // Focus camera on node
        if (fgRef.current) {
            const distance = 200;
            fgRef.current.cameraPosition(
                { x: node.x, y: node.y, z: node.z + distance },
                { x: node.x, y: node.y, z: node.z },
                1500
            );
        }
    }, []);

    // Custom Node Rendering
    const nodeThreeObject = useCallback((node) => {
        const group = new THREE.Group();
        const type = (node.labels?.[0] || node.type || '').toLowerCase();
        const color = getNodeColor(node);

        let geometry;

        // Select geometry based on type
        if (type.includes('project')) {
            geometry = new THREE.OctahedronGeometry(8, 0);
        } else if (type.includes('knowledge')) {
            geometry = new THREE.IcosahedronGeometry(7, 0);
        } else if (type.includes('chat')) {
            geometry = new THREE.BoxGeometry(10, 10, 10);
        } else if (type.includes('artifact')) {
            geometry = new THREE.CylinderGeometry(6, 6, 12, 8);
        } else if (type.includes('entity')) {
            geometry = new THREE.TetrahedronGeometry(8);
        } else if (type.includes('concept')) {
            geometry = new THREE.TorusGeometry(6, 2, 8, 12);
        } else {
            geometry = new THREE.SphereGeometry(6, 16, 16);
        }

        // Main mesh
        const material = new THREE.MeshLambertMaterial({
            color: color,
            transparent: true,
            opacity: 0.85,
            emissive: color,
            emissiveIntensity: 0.3
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);

        // Wireframe overlay
        const wiregeo = new THREE.WireframeGeometry(geometry);
        const wiremat = new THREE.LineBasicMaterial({
            color: '#FFFFFF',
            transparent: true,
            opacity: 0.2
        });
        const wireframe = new THREE.LineSegments(wiregeo, wiremat);
        group.add(wireframe);

        return group;
    }, []);

    // Bloom Effect
    useEffect(() => {
        if (fgRef.current) {
            const bloomPass = new UnrealBloomPass();
            bloomPass.strength = CONFIG.bloom.strength;
            bloomPass.radius = CONFIG.bloom.radius;
            bloomPass.threshold = CONFIG.bloom.threshold;

            if (fgRef.current.postProcessingComposer) {
                fgRef.current.postProcessingComposer().addPass(bloomPass);
            }
        }
    }, []);

    // Camera positioning after load
    useEffect(() => {
        if (filteredGraphData.nodes.length > 0 && fgRef.current) {
            setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.cameraPosition(
                        { x: 300, y: 300, z: 300 },
                        { x: 0, y: 0, z: 0 },
                        2000
                    );
                }
            }, 500);
        }
    }, [filteredGraphData.nodes.length]);

    // Loading State
    if (loading) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                color: '#3b82f6',
                fontFamily: 'monospace',
                flexDirection: 'column',
                background: CONFIG.colors.background
            }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>
                    {isCatalogMode ? 'LOADING CATALOG GRAPH' : 'LOADING KNOWLEDGE GRAPH'}
                </div>
                <div style={{ fontSize: '14px', opacity: 0.7 }}>
                    {isCatalogMode ? 'Loading graph from catalog...' : 'Fetching data from Memgraph...'}
                </div>
            </div>
        );
    }

    // Error State
    if (error) {
        return (
            <div style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                color: '#ef4444',
                fontFamily: 'monospace',
                flexDirection: 'column',
                background: CONFIG.colors.background,
                gap: '10px'
            }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>ERROR</div>
                <div style={{ fontSize: '14px', opacity: 0.7 }}>{error}</div>
                {isCatalogMode && (
                    <button
                        onClick={clearCatalogSelection}
                        style={{
                            marginTop: '15px',
                            background: 'rgba(59, 130, 246, 0.2)',
                            border: '1px solid #3b82f6',
                            color: '#3b82f6',
                            padding: '8px 16px',
                            cursor: 'pointer',
                            fontSize: '12px',
                            borderRadius: '4px',
                            fontFamily: 'monospace',
                            letterSpacing: '1px'
                        }}
                    >
                        BACK TO FULL GRAPH
                    </button>
                )}
            </div>
        );
    }

    return (
        <div ref={containerRef} style={{
            width: '100%',
            height: '100%',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* 3D Graph */}
            {width > 100 && height > 100 && (
                <ForceGraph3D
                    ref={fgRef}
                    width={width}
                    height={height}
                    graphData={filteredGraphData}
                    backgroundColor={CONFIG.colors.background}

                    // Nodes
                    nodeId="id"
                    nodeLabel="name"
                    nodeVal={node => node.val || 10}
                    nodeColor={node => {
                        const isDimmed = highlightNodes.size > 0 && !highlightNodes.has(node.id);
                        return isDimmed ? '#444444' : getNodeColor(node);
                    }}
                    nodeOpacity={0.95}
                    nodeThreeObject={nodeThreeObject}

                    // Links
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={2}
                    linkWidth={link => highlightLinks.has(link) ? 3 : 1}
                    linkColor={link => {
                        const isDimmed = highlightLinks.size > 0 && !highlightLinks.has(link);
                        return isDimmed ? 'rgba(100,100,100,0.1)' : getLinkColor(link);
                    }}
                    linkDirectionalArrowLength={4}
                    linkDirectionalArrowRelPos={1}

                    // Interactions
                    onNodeHover={handleNodeHover}
                    onLinkHover={handleLinkHover}
                    onNodeClick={handleNodeClick}

                    // Physics
                    d3VelocityDecay={0.3}
                    d3AlphaDecay={0.02}
                />
            )}

            {/* HUD Overlay */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 10
            }}>
                {/* Title + Graph Catalog Selector */}
                <div style={{ position: 'absolute', top: 20, left: 20, pointerEvents: 'auto' }}>
                    <h1 style={{
                        margin: 0,
                        color: isCatalogMode ? '#8b5cf6' : '#3b82f6',
                        fontSize: '24px',
                        letterSpacing: '2px',
                        textShadow: isCatalogMode ? '0 0 10px #8b5cf6' : '0 0 10px #3b82f6'
                    }}>
                        {isCatalogMode ? 'CATALOG GRAPH' : 'KNOWLEDGE GRAPH'}
                    </h1>
                    <div style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>
                        NODES: {filteredGraphData.nodes.length} | EDGES: {filteredGraphData.links.length}
                    </div>

                    {/* Graph Catalog Selector */}
                    <div style={{
                        marginTop: '12px',
                        background: 'rgba(0, 10, 26, 0.9)',
                        border: `1px solid ${isCatalogMode ? '#8b5cf6' : '#3b82f6'}`,
                        borderRadius: '8px',
                        padding: '10px 12px',
                        backdropFilter: 'blur(10px)',
                        minWidth: '280px'
                    }}>
                        <div style={{
                            color: isCatalogMode ? '#8b5cf6' : '#3b82f6',
                            fontSize: '11px',
                            marginBottom: '8px',
                            letterSpacing: '1px',
                            fontWeight: 'bold'
                        }}>
                            GRAPH CATALOG
                        </div>
                        <select
                            value={selectedCatalogGraphId}
                            onChange={handleCatalogSelect}
                            disabled={catalogGraphsLoading}
                            style={{
                                width: '100%',
                                background: '#0d1117',
                                color: '#e6edf3',
                                border: '1px solid #30363d',
                                borderRadius: '4px',
                                padding: '6px 8px',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                        >
                            <option value="">
                                {catalogGraphsLoading ? 'Loading...' : '-- Full Knowledge Graph --'}
                            </option>
                            {catalogGraphs.map(graph => (
                                <option key={graph.id} value={graph.id}>
                                    [{graph.type || 'graph'}] {graph.name || graph.id}
                                </option>
                            ))}
                        </select>

                        {/* Catalog mode info */}
                        {isCatalogMode && selectedCatalogGraph && (
                            <div style={{ marginTop: '8px' }}>
                                <div style={{ color: '#d8b4fe', fontSize: '11px', fontWeight: 'bold' }}>
                                    {selectedCatalogGraph.name}
                                </div>
                                {selectedCatalogGraph.description && (
                                    <div style={{ color: '#888', fontSize: '10px', marginTop: '2px' }}>
                                        {selectedCatalogGraph.description}
                                    </div>
                                )}
                                {selectedCatalogGraph.tags?.length > 0 && (
                                    <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {selectedCatalogGraph.tags.map(tag => (
                                            <span key={tag} style={{
                                                fontSize: '9px',
                                                backgroundColor: 'rgba(139, 92, 246, 0.2)',
                                                color: '#8b5cf6',
                                                padding: '2px 6px',
                                                borderRadius: '3px'
                                            }}>
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <button
                                    onClick={clearCatalogSelection}
                                    style={{
                                        marginTop: '8px',
                                        background: 'rgba(139, 92, 246, 0.2)',
                                        border: '1px solid #8b5cf6',
                                        color: '#8b5cf6',
                                        padding: '4px 10px',
                                        cursor: 'pointer',
                                        fontSize: '10px',
                                        borderRadius: '4px',
                                        fontFamily: 'monospace',
                                        letterSpacing: '1px'
                                    }}
                                >
                                    BACK TO FULL GRAPH
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Filter Panel */}
                <div style={{
                    position: 'absolute',
                    top: 20,
                    right: 20,
                    pointerEvents: 'auto',
                    background: 'rgba(0, 10, 26, 0.9)',
                    border: '1px solid #3b82f6',
                    borderRadius: '8px',
                    padding: '15px',
                    backdropFilter: 'blur(10px)',
                    minWidth: '200px'
                }}>
                    <div style={{
                        color: '#3b82f6',
                        fontSize: '12px',
                        marginBottom: '10px',
                        letterSpacing: '1px',
                        fontWeight: 'bold'
                    }}>
                        FILTERS
                    </div>

                    {[
                        { key: 'showProjects', label: 'Projects', color: CONFIG.colors.project },
                        { key: 'showKnowledge', label: 'Knowledge', color: CONFIG.colors.knowledge },
                        { key: 'showChats', label: 'Chats', color: CONFIG.colors.chat },
                        { key: 'showArtifacts', label: 'Artifacts', color: CONFIG.colors.artifact },
                        { key: 'showEntities', label: 'Entities', color: CONFIG.colors.entity },
                        { key: 'showConcepts', label: 'Concepts', color: CONFIG.colors.concept }
                    ].map(({ key, label, color }) => (
                        <label key={key} style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '8px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            color: filters[key] ? '#fff' : '#666'
                        }}>
                            <input
                                type="checkbox"
                                checked={filters[key]}
                                onChange={(e) => setFilters(prev => ({
                                    ...prev,
                                    [key]: e.target.checked
                                }))}
                                style={{ marginRight: '8px', accentColor: color }}
                            />
                            <span style={{
                                width: '10px',
                                height: '10px',
                                backgroundColor: color,
                                marginRight: '8px',
                                borderRadius: '2px'
                            }} />
                            {label}
                        </label>
                    ))}
                </div>

                {/* Legend */}
                <div style={{
                    position: 'absolute',
                    bottom: 20,
                    right: 20,
                    background: 'rgba(0, 10, 26, 0.9)',
                    border: '1px solid #3b82f6',
                    borderRadius: '8px',
                    padding: '15px',
                    backdropFilter: 'blur(10px)',
                    fontSize: '11px',
                    color: '#ccc'
                }}>
                    <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}>
                        RELATIONS
                    </div>
                    {[
                        { type: 'BELONGS_TO', color: CONFIG.colors.belongsTo },
                        { type: 'CREATED_IN', color: CONFIG.colors.createdIn },
                        { type: 'DEPENDS_ON', color: CONFIG.colors.dependsOn },
                        { type: 'IMPLEMENTS', color: CONFIG.colors.implements },
                        { type: 'REFERENCES', color: CONFIG.colors.references },
                        { type: 'RELATES_TO', color: CONFIG.colors.relatesTo },
                        { type: 'PART_OF', color: CONFIG.colors.partOf }
                    ].map(({ type, color }) => (
                        <div key={type} style={{
                            display: 'flex',
                            alignItems: 'center',
                            marginBottom: '4px'
                        }}>
                            <div style={{
                                width: '20px',
                                height: '2px',
                                backgroundColor: color,
                                marginRight: '8px'
                            }} />
                            {type}
                        </div>
                    ))}
                </div>

                {/* Selected Node Info */}
                {selectedNode && (
                    <div style={{
                        position: 'absolute',
                        bottom: 20,
                        left: 20,
                        background: 'rgba(0, 10, 26, 0.95)',
                        border: '2px solid #3b82f6',
                        borderRadius: '8px',
                        padding: '15px',
                        backdropFilter: 'blur(10px)',
                        maxWidth: '300px',
                        pointerEvents: 'auto'
                    }}>
                        <div style={{
                            color: '#3b82f6',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            marginBottom: '8px'
                        }}>
                            SELECTED NODE
                        </div>
                        <div style={{ color: '#fff', fontSize: '12px', marginBottom: '4px' }}>
                            {selectedNode.name}
                        </div>
                        <div style={{ color: '#888', fontSize: '10px', marginBottom: '8px' }}>
                            Type: {selectedNode.labels?.[0] || selectedNode.type}
                        </div>
                        {selectedNode.properties.description && (
                            <div style={{ color: '#ccc', fontSize: '10px', marginBottom: '8px' }}>
                                {selectedNode.properties.description}
                            </div>
                        )}
                        <button
                            onClick={() => setSelectedNode(null)}
                            style={{
                                background: 'rgba(59, 130, 246, 0.2)',
                                border: '1px solid #3b82f6',
                                color: '#3b82f6',
                                padding: '5px 10px',
                                cursor: 'pointer',
                                fontSize: '10px',
                                borderRadius: '4px',
                                marginTop: '5px'
                            }}
                        >
                            CLOSE
                        </button>
                    </div>
                )}
            </div>

            {/* Tooltip */}
            {tooltip.visible && tooltip.content && (
                <div style={{
                    position: 'fixed',
                    top: tooltip.y + 20,
                    left: tooltip.x + 20,
                    backgroundColor: 'rgba(10, 14, 26, 0.95)',
                    border: '1px solid #3b82f6',
                    borderRadius: '6px',
                    padding: '12px',
                    zIndex: 9999,
                    pointerEvents: 'none',
                    backdropFilter: 'blur(10px)',
                    boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
                    maxWidth: '300px',
                    color: '#FFF',
                    fontFamily: 'monospace'
                }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: '#3b82f6',
                        borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
                        paddingBottom: '6px',
                        marginBottom: '6px'
                    }}>
                        {tooltip.content.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#AAAAAA', marginBottom: '4px' }}>
                        {tooltip.content.subtitle}
                    </div>
                    <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>
                        {tooltip.content.details}
                    </div>
                    {tooltip.content.tags && tooltip.content.tags.length > 0 && (
                        <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {tooltip.content.tags.map((tag, i) => (
                                <span key={i} style={{
                                    fontSize: '9px',
                                    backgroundColor: 'rgba(59, 130, 246, 0.2)',
                                    color: '#3b82f6',
                                    padding: '2px 6px',
                                    borderRadius: '3px'
                                }}>
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default KnowledgeGraphViewer;
