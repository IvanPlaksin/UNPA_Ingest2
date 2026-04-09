import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
// import { forceCollide } from 'd3-force-3d';
import { useResizeDetector } from 'react-resize-detector';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { useNavigate } from 'react-router-dom';
import { API_ENDPOINTS } from '../../config/api.config';
import { getSubGraphForNode, getGraphById, expandSubgraphNode } from '../../services/graphCatalog.service';
import { convertToSingularityFormat } from './utils/graphDataConverter';

// --- CONFIGURATION ---
const CONFIG = {
    colors: {
        background: '#050510',
        workItem: '#00FFFF', // Cyan
        bug: '#FF4444',      // Red
        feature: '#44FF44',  // Green
        epic: '#FF00FF',     // Magenta
        file: '#AAAAAA',     // Grey
        link: '#4444FF',
        linkParent: '#FF00FF',
        highlight: '#FFD700', // Gold
        subGraph: '#00FFFF',      // Cyan for SubGraph nodes
        subGraphPort: '#FFD700',  // Gold for ports
        portIn: '#44FF44',        // Green for IN ports
        portOut: '#FF4444',       // Red for OUT ports
        portBidi: '#FFFF44',      // Yellow for BIDI ports
    },
    bloom: {
        strength: 1.5,
        radius: 0.4,
        threshold: 0.1
    }
};

// --- LAYOUT STRATEGIES ---
import { useGraphSettings } from '../../hooks/useGraphSettings';
import ViewControlPanel from './UI/ViewControlPanel';

// --- LAYOUT STRATEGIES (Mapped to ViewRegistry IDs) ---
const LAYOUTS = {
    DEFAULT: 'force_cluster',      // Was 'default'
    SINGULARITY: 'stratified',     // Was 'singularity'
    HIERARCHY: 'dependency_tree',  // Was 'hierarchy'
    RADIAL: 'radial_context'       // Was 'radial'
};

const SingularityGraph = ({ rootId, externalData = null }) => {
    const fgRef = useRef();
    const navigate = useNavigate();
    const { width, height, ref: containerRef } = useResizeDetector();

    // -- State --
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });
    const [dataSource, setDataSource] = useState('crawler'); // 'crawler' | 'external' | 'mock'

    // -- SUBGRAPH STATE --
    // Map of nodeId -> { originalNode, subgraphData, parentGraphId }
    const [expandedSubgraphs, setExpandedSubgraphs] = useState(new Map());
    // Set of node IDs that are currently loading subgraph data
    const [loadingSubgraphs, setLoadingSubgraphs] = useState(new Set());
    // Current parent graph ID for subgraph operations
    const currentGraphIdRef = useRef(null);

    // -- VIEW MANAGEMENT --
    const { settings, actions } = useGraphSettings();
    const settingsRef = useRef(settings);
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    const [loading, setLoading] = useState(false);
    // const [fgInstance, setFgInstance] = useState(null); // REMOVED to avoid re-renders

    // ... (rest of crawler state is same) ...

    // Crawler State
    const visited = useRef(new Set());
    const queue = useRef([]);
    const [crawlerDepth, setCrawlerDepth] = useState(2); // Default depth

    // -- CRAWLER ENGINE --
    // -- CRAWLER ENGINE --
    const fetchNode = useCallback(async (id, depth = 0) => {
        if (!id) return;
        const sId = String(id);

        // If we've already visited (= completely fetched) this node, skip re-fetching
        // BUT we might want to update a Stub to a Full node.
        // So we check if it is in 'visited' set.
        if (visited.current.has(sId)) return;

        setLoading(true);

        try {
            console.log(`[Crawler] Fetching ${sId} at depth ${depth}`);
            const res = await fetch(API_ENDPOINTS.NEXUS_ENTITY('workitem', sId));
            if (!res.ok) throw new Error(`Failed to fetch ${sId}`);

            const item = await res.json();
            const nodeId = String(item.id);

            // Mark as visited so we don't fetch again
            visited.current.add(nodeId);

            // 1. Prepare Full Node Data
            const fullNode = {
                id: nodeId,
                type: 'workItem',
                name: item.label,
                data: item.data,
                level: depth,
                loaded: true,
                // Visual Properties
                color: item.data.fields['System.WorkItemType'] === 'Bug' ? CONFIG.colors.bug :
                    item.data.fields['System.WorkItemType'] === 'Feature' ? CONFIG.colors.feature :
                        item.data.fields['System.WorkItemType'] === 'Epic' ? CONFIG.colors.epic :
                            CONFIG.colors.workItem
            };

            // 2. Prepare Links & Stubs
            const linksToAdd = [];
            const stubsToAdd = [];
            const neighborsToQueue = [];

            // Helper to collect neighbors
            const addNeighbor = (targetId, relType) => {
                const tId = String(targetId);
                linksToAdd.push({ source: nodeId, target: tId, type: relType });
                stubsToAdd.push(tId);
                neighborsToQueue.push(tId);
            };

            // Parent Relation
            if (item.data.ParentWorkItem) {
                addNeighbor(item.data.ParentWorkItem.id, 'parent');
            }

            // Other Relations
            if (item.data.relations) {
                item.data.relations.forEach(rel => {
                    const urlParts = rel.url.split('/');
                    const targetId = urlParts[urlParts.length - 1];

                    if (targetId) {
                        // Check if it's a Work Item (Numeric ID)
                        // If numeric, we fetch it.
                        // If string (UUID), it's likely a file/commit/artifact, we display but don't crawl.
                        const isWorkItem = !isNaN(targetId);

                        // Determine type based on ID format
                        // We could also check rel.attributes.name or rel.rel if available
                        const type = isWorkItem ? 'related' : 'artifact';

                        // Add Link & Stub
                        const tId = String(targetId);
                        linksToAdd.push({ source: nodeId, target: tId, type: type });

                        // We need to add the node to the map if it doesn't exist
                        // For WorkItems, we add to queue.
                        // For Artifacts, we just show them (Leaf nodes).
                        stubsToAdd.push({ id: tId, isWorkItem });

                        if (isWorkItem) {
                            neighborsToQueue.push(tId);
                        }
                    }
                });
            }

            // 3. Update Graph State (Atomic Update)
            setGraphData(prev => {
                const nodeMap = new Map(prev.nodes.map(n => [n.id, n]));
                const existingLinkKeys = new Set(prev.links.map(l =>
                    `${typeof l.source === 'object' ? l.source.id : l.source}-${typeof l.target === 'object' ? l.target.id : l.target}`
                ));

                // A. Update/Add Current Node (Replace Stub if exists)
                const existingNode = nodeMap.get(nodeId);
                nodeMap.set(nodeId, { ...(existingNode || {}), ...fullNode });

                // B. Add Stubs for neighbors if they don't exist
                stubsToAdd.forEach(stubInfo => {
                    // stubInfo can be string (parent) or object (relation)
                    const stubId = typeof stubInfo === 'object' ? stubInfo.id : stubInfo;
                    const isStubWorkItem = typeof stubInfo === 'object' ? stubInfo.isWorkItem : true; // Parent is always WI

                    if (!nodeMap.has(stubId)) {
                        nodeMap.set(stubId, {
                            id: stubId,
                            type: isStubWorkItem ? 'stub' : 'file', // Use 'file' visual for artifacts
                            name: isStubWorkItem ? `Loading ${stubId}...` : `Artifact ${stubId.substring(0, 8)}...`,
                            level: depth + 1,
                            loaded: false,
                            color: isStubWorkItem ? '#AAAAAA' : CONFIG.colors.file,
                            val: isStubWorkItem ? 5 : 3
                        });
                    }
                });

                // C. Add Links
                // Only add links if they don't exist yet
                // Note: D3 might crash if we add a link where nodes don't exist in 'nodes' array.
                // But we just ensured all targets are in 'nodeMap' (either existing or new stub).
                const validLinks = [];
                linksToAdd.forEach(link => {
                    const key = `${link.source}-${link.target}`;
                    if (!existingLinkKeys.has(key)) {
                        validLinks.push(link);
                    }
                });

                return {
                    nodes: Array.from(nodeMap.values()),
                    links: [...prev.links, ...validLinks]
                };
            });

            // 4. Recurse / Queue
            if (depth < crawlerDepth) {
                neighborsToQueue.forEach(neighborId => {
                    // Check visited again to avoid race conditions/redundant calls
                    if (!visited.current.has(neighborId)) {
                        fetchNode(neighborId, depth + 1);
                    }
                });
            }

        } catch (err) {
            console.error(`[Crawler] Error fetching ${sId}:`, err);
        } finally {
            setLoading(false);
        }
    }, [crawlerDepth]);

    // -- HANDLE EXTERNAL DATA --
    useEffect(() => {
        if (externalData && externalData.nodes && externalData.nodes.length > 0) {
            console.log('[SingularityGraph] Loading external data:', externalData.nodes.length, 'nodes');

            // Debug: check for subgraph markers
            const nodesWithSubgraphs = externalData.nodes.filter(n => n.hasSubGraph);
            if (nodesWithSubgraphs.length > 0) {
                console.log('[SingularityGraph] Nodes with subgraphs:', nodesWithSubgraphs.map(n => ({
                    id: n.id,
                    name: n.name,
                    hasSubGraph: n.hasSubGraph,
                    subGraphId: n.subGraphId
                })));
            } else {
                console.log('[SingularityGraph] No nodes with subgraphs detected');
            }

            // Debug: check metadata
            if (externalData.metadata) {
                console.log('[SingularityGraph] Metadata:', externalData.metadata);
            }

            setGraphData({
                nodes: externalData.nodes,
                links: externalData.links || []
            });
            setDataSource('external');
            visited.current = new Set(externalData.nodes.map(n => n.id));
            // Track current graph ID for subgraph operations
            currentGraphIdRef.current = externalData.metadata?.sourceGraph?.id || null;
            // Clear expanded subgraphs when loading new graph
            setExpandedSubgraphs(new Map());
        }
    }, [externalData]);

    // -- INIT CRAWLER --
    useEffect(() => {
        // Skip crawler if external data is provided
        if (externalData) return;

        if (rootId) {
            // Reset for new root
            setGraphData({ nodes: [], links: [] });
            visited.current = new Set();
            setDataSource('crawler');
            fetchNode(rootId, 0);
        }
    }, [rootId, fetchNode, externalData]);

    // -- INTERACTION STATE (Focus/X-Ray) --
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set());
    const [hoverNode, setHoverNode] = useState(null);
    const [activeLayer, setActiveLayer] = useState(null); // 'epic' | 'workitem' | 'file'

    // -- TOOLTIP STATE --
    const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: null, type: null });
    const mousePos = useRef({ x: 0, y: 0 });

    // Track Global Mouse Position for Tooltip
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

    // -- HOVER LOGIC --
    // LAYER HOVER (LEGEND)
    const handleLayerHover = useCallback((layerId) => {
        setActiveLayer(layerId);
        if (layerId) {
            const validTypes = new Set();
            if (layerId === 'epic') { validTypes.add('epic'); validTypes.add('feature'); validTypes.add('changerequest'); }
            else if (layerId === 'workitem') { validTypes.add('workitem'); validTypes.add('bug'); validTypes.add('task'); }
            else if (layerId === 'file') { validTypes.add('file'); validTypes.add('artifact'); }

            const nodesInLayer = new Set();
            graphData.nodes.forEach(n => {
                const t = (n.type || '').toLowerCase();
                if (validTypes.has(t)) nodesInLayer.add(n.id);
            });
            setHighlightNodes(nodesInLayer);

            // Highlight links within layer
            const linksInLayer = new Set();
            graphData.links.forEach(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                if (nodesInLayer.has(s) && nodesInLayer.has(t)) {
                    linksInLayer.add(l);
                }
            });
            setHighlightLinks(linksInLayer);

        } else {
            setHighlightNodes(new Set());
            setHighlightLinks(new Set());
        }
    }, [graphData.nodes, graphData.links]);

    const handleNodeHover = useCallback((node) => {
        // If Layer Highlight is active, ignore node hover to avoid conflict
        if (activeLayer) return;

        if ((!node && !highlightNodes.size) || (node && hoverNode === node)) return;

        setHoverNode(node || null);

        if (node) {
            // Tooltip Logic
            setTooltip({
                visible: true,
                x: mousePos.current.x,
                y: mousePos.current.y,
                type: 'node',
                content: {
                    title: node.name || `Node ${node.id}`,
                    subtitle: `${(node.type || 'Item').toUpperCase()} | ID: ${node.id}`,
                    details: node.data?.fields?.['System.State'] || 'Active'
                }
            });

            const neighbors = new Set();
            const links = new Set();

            graphData.links.forEach(link => {
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
    }, [graphData.links, hoverNode, highlightNodes, activeLayer]);

    const handleLinkHover = useCallback((link) => {
        if (activeLayer) return;

        if (link) {
            setHighlightLinks(new Set([link]));
            const s = typeof link.source === 'object' ? link.source.id : link.source;
            const t = typeof link.target === 'object' ? link.target.id : link.target;
            setHighlightNodes(new Set([s, t]));

            setTooltip({
                visible: true,
                x: mousePos.current.x,
                y: mousePos.current.y,
                type: 'link',
                content: {
                    title: link.type || 'Relation',
                    subtitle: `${link.source.name || s} -> ${link.target.name || t}`,
                    details: 'Link'
                }
            });
        } else {
            setHighlightLinks(new Set());
            setHighlightNodes(new Set());
            setTooltip(prev => ({ ...prev, visible: false }));
        }
    }, [activeLayer]);

    // -- SUBGRAPH EXPAND/COLLAPSE HANDLERS --
    const handleExpandSubgraph = useCallback(async (node) => {
        if (!node.hasSubGraph || loadingSubgraphs.has(node.id)) return;

        console.log('[Subgraph] Expanding subgraph for node:', node.id);
        setLoadingSubgraphs(prev => new Set([...prev, node.id]));

        try {
            const parentGraphId = currentGraphIdRef.current;
            const subGraphId = node.subGraphId;

            let subgraphData = null;

            // Try to expand via SubGraph API (from consolidation pipeline)
            if (subGraphId && subGraphId.startsWith('subgraph-')) {
                const expanded = await expandSubgraphNode(subGraphId);
                if (expanded) {
                    subgraphData = expanded;
                }
            }

            // Try to get subgraph by ID from catalog
            if (!subgraphData && subGraphId) {
                const graphData = await getGraphById(subGraphId);
                if (graphData) {
                    subgraphData = convertToSingularityFormat(graphData);
                }
            }

            // Fallback: try to get subgraph for node from parent graph
            if (!subgraphData && parentGraphId) {
                const graphData = await getSubGraphForNode(parentGraphId, node.id);
                if (graphData) {
                    subgraphData = convertToSingularityFormat(graphData);
                }
            }

            if (subgraphData && subgraphData.nodes.length > 0) {
                // Store original node for collapse
                setExpandedSubgraphs(prev => {
                    const next = new Map(prev);
                    next.set(node.id, {
                        originalNode: { ...node },
                        subgraphData,
                        parentGraphId,
                        // Store position for boundary visualization
                        centerX: node.x || 0,
                        centerY: node.y || 0,
                        centerZ: node.z || 0
                    });
                    return next;
                });

                // Update graph data: replace node with subgraph nodes
                setGraphData(prev => {
                    // Remove the expanded node
                    const nodesWithoutExpanded = prev.nodes.filter(n => n.id !== node.id);

                    // Add subgraph nodes with position offset and parent marker
                    const subgraphNodes = subgraphData.nodes.map(n => ({
                        ...n,
                        id: `${node.id}:${n.id}`, // Namespace to avoid ID conflicts
                        parentSubgraphId: node.id,
                        isSubgraphNode: true,
                        // Initial position near parent node
                        x: (node.x || 0) + (Math.random() - 0.5) * 50,
                        y: (node.y || 0) + (Math.random() - 0.5) * 50,
                        z: (node.z || 0) + (Math.random() - 0.5) * 50
                    }));

                    // Update links: remove links to expanded node, add internal subgraph links
                    const linksWithoutExpanded = prev.links.filter(l => {
                        const s = typeof l.source === 'object' ? l.source.id : l.source;
                        const t = typeof l.target === 'object' ? l.target.id : l.target;
                        return s !== node.id && t !== node.id;
                    });

                    // Add subgraph internal links
                    const subgraphLinks = subgraphData.links.map(l => ({
                        ...l,
                        source: `${node.id}:${typeof l.source === 'object' ? l.source.id : l.source}`,
                        target: `${node.id}:${typeof l.target === 'object' ? l.target.id : l.target}`
                    }));

                    return {
                        nodes: [...nodesWithoutExpanded, ...subgraphNodes],
                        links: [...linksWithoutExpanded, ...subgraphLinks]
                    };
                });

                console.log('[Subgraph] Expanded:', subgraphData.nodes.length, 'nodes');
            } else {
                console.warn('[Subgraph] No subgraph data found for node:', node.id);
            }
        } catch (error) {
            console.error('[Subgraph] Error expanding:', error);
        } finally {
            setLoadingSubgraphs(prev => {
                const next = new Set(prev);
                next.delete(node.id);
                return next;
            });
        }
    }, [loadingSubgraphs]);

    const handleCollapseSubgraph = useCallback((parentNodeId) => {
        const expanded = expandedSubgraphs.get(parentNodeId);
        if (!expanded) return;

        console.log('[Subgraph] Collapsing subgraph:', parentNodeId);

        setGraphData(prev => {
            // Remove subgraph nodes
            const nodesWithoutSubgraph = prev.nodes.filter(n => n.parentSubgraphId !== parentNodeId);

            // Remove subgraph links
            const linksWithoutSubgraph = prev.links.filter(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                return !s.startsWith(`${parentNodeId}:`) && !t.startsWith(`${parentNodeId}:`);
            });

            // Restore original node
            const restoredNode = {
                ...expanded.originalNode,
                x: expanded.centerX,
                y: expanded.centerY,
                z: expanded.centerZ
            };

            return {
                nodes: [...nodesWithoutSubgraph, restoredNode],
                links: linksWithoutSubgraph
            };
        });

        // Remove from expanded map
        setExpandedSubgraphs(prev => {
            const next = new Map(prev);
            next.delete(parentNodeId);
            return next;
        });
    }, [expandedSubgraphs]);

    // -- CAMERA CONTROL --
    const moveCamera = useCallback((viewType) => {
        if (!fgRef.current) return;
        const cam = fgRef.current.camera();
        if (!cam) return;

        // Ensure standard FOV
        cam.fov = 10;
        cam.updateProjectionMatrix();

        if (viewType === 'top') {
            fgRef.current.cameraPosition({ x: 0, y: 1500, z: 0 }, { x: 0, y: 0, z: 0 }, 1500);
        } else if (viewType === 'side') {
            fgRef.current.cameraPosition({ x: 1500, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 1500);
        } else {
            // ISO
            fgRef.current.cameraPosition({ x: 1000, y: 1000, z: 1000 }, { x: 0, y: 0, z: 0 }, 1500);
        }
    }, []);

    // Initial Camera
    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            setTimeout(() => moveCamera('iso'), 1000);
        }
    }, [fgRef.current, graphData.nodes.length, moveCamera]);


    // -- PHYSICS ENGINE (STABLE) --
    // Use Ref to track settings without breaking closure
    // (settingsRef is defined above)

    // MOVED INIT LOGIC TO handleRef TO AVOID STATE RE-RENDERS
    const initForces = useCallback((node) => {
        if (!node) return;

        // Initialize Forces (ONE TIME SETUP)
        // Delay slightly to ensure D3 engine is ready
        setTimeout(() => {
            let nodes = [];
            if (!node.d3Force) return; // Safety check

            const customLayoutForce = (alpha) => {
                const currentSettings = settingsRef.current;
                const mode = currentSettings.activeView;
                if (!nodes || nodes.length === 0) return;

                // Helper for safety
                const safe = (v) => v !== undefined && !isNaN(v);

                // 1. SINGULARITY (Stratified by Type)
                if (mode === LAYOUTS.SINGULARITY) {
                    const k = 0.1 * alpha;
                    nodes.forEach(node => {
                        let targetZ = 0;
                        const t = (node.type || '').toLowerCase();

                        // Stratification Levels (WIDER GAPS for Isometric View)
                        if (t === 'epic' || t === 'changerequest') targetZ = 300; // Top Layer (Input)
                        else if (t === 'feature') targetZ = 200;
                        else if (t === 'workitem' || t === 'bug' || t === 'task') targetZ = 0; // Middle Layer (Work)
                        else if (t === 'file' || t === 'artifact') targetZ = -300; // Bottom Layer (Data)
                        else if (t === 'person') targetZ = 400; // Meta Layer
                        else targetZ = 50;

                        if (safe(node.z) && safe(node.vz)) {
                            node.vz += (targetZ - node.z) * k;
                        }
                    });
                }
                // 2. HIERARCHY
                else if (mode === LAYOUTS.HIERARCHY) {
                    const k = 0.5 * alpha;
                    nodes.forEach(node => {
                        const targetY = (1 - (node.level || 0)) * 100;
                        if (safe(node.y) && safe(node.vy)) {
                            node.vy += (targetY - node.y) * k;
                        }
                    });
                }
                // 3. RADIAL
                else if (mode === LAYOUTS.RADIAL) {
                    const k = 0.1 * alpha;
                    nodes.forEach(node => {
                        if (safe(node.z) && safe(node.vz)) {
                            node.vz += (0 - node.z) * k;
                        }
                    });
                }
                // 0. DEFAULT
                else if (mode === LAYOUTS.DEFAULT) {
                    const k = 0.05 * alpha;
                    nodes.forEach(node => {
                        // Flatten Z slightly
                        if (safe(node.z) && safe(node.vz)) {
                            node.vz += (0 - node.z) * k;
                        }
                    });
                }
            };

            customLayoutForce.initialize = (_nodes) => {
                nodes = _nodes;
            };

            // Re-enable Custom Layout with Safety Checks
            node.d3Force('customLayout', customLayoutForce);

            // Standard Forces
            node.d3Force('charge').strength(-100); // Reduced from -200
            node.d3Force('link').distance(50);

            console.log("Forces Initialized on Instance");

            // Force a reheat after init
            node.d3ReheatSimulation();

        }, 100); // 100ms delay for safety
    }, []); // Empty dependency (stable)

    // Trigger Init when Data and Ref are ready
    useEffect(() => {
        if (fgRef.current && graphData.nodes.length > 0) {
            initForces(fgRef.current);
        }
    }, [fgRef.current, graphData.nodes.length, initForces]);

    // Reheat simulation when layout or data changes
    // Reheat simulation when layout or data changes
    useEffect(() => {
        if (fgRef.current) {
            // Update Standard Forces dynamic parameters
            fgRef.current.d3Force('charge').strength(settings.physics.gravity);
            fgRef.current.d3Force('link').distance(settings.physics.linkDistance);

            // Safely reheat simulation with a slight delay to prevent thread freeze
            setTimeout(() => {
                if (fgRef.current) {
                    fgRef.current.d3ReheatSimulation();
                }
            }, 50);
        }
    }, [settings.activeView, settings.physics, graphData]);

    // -- VISUALS --
    // --- BLOOM EFFECT ---
    useEffect(() => {
        if (fgRef.current) {
            // Configure Bloom Filter
            const bloomPass = new UnrealBloomPass();
            bloomPass.strength = CONFIG.bloom.strength;
            bloomPass.radius = CONFIG.bloom.radius;
            bloomPass.threshold = CONFIG.bloom.threshold;

            // Access internal Three.js composer via exposed method if available
            // React-Force-Graph-3D exposes postProcessingComposer()
            if (fgRef.current.postProcessingComposer) {
                fgRef.current.postProcessingComposer().addPass(bloomPass);
            }
        }
    }, []);

    // --- DATA VALIDATION ---
    // (Resize logic handled by useResizeDetector at top)

    // 2. Camera Positioning (Force visible Frustum)
    useEffect(() => {
        if (graphData.nodes.length > 0 && fgRef.current) {
            // Wait a tick for graph to ingest data
            setTimeout(() => {
                if (fgRef.current) {
                    try {
                        // Position camera at a safe distance to see the center
                        // fgRef.current.cameraPosition(
                        //    { x: 0, y: 0, z: 400 }, // Position
                        //    { x: 0, y: 0, z: 0 },   // LookAt
                        //    2000                    // Transition Time (ms)
                        // );
                    } catch (e) {
                        console.error("Camera position error:", e);
                    }
                }
            }, 500);
        }
    }, [graphData.nodes.length]);

    // Debug Data Check
    useEffect(() => {
        if (graphData.nodes.length > 0) {
            console.log("--- SINGULARITY CHECK ---");
            console.log(`Dims: ${width}x${height}`); // Use hook values
            console.log(`Nodes: ${graphData.nodes.length}`);
            console.log("Link Integrity: Checking...");
            // 3. Check Dangling Links
            const nodeIds = new Set(graphData.nodes.map(n => n.id));
            const badLinks = graphData.links.filter(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                return !nodeIds.has(s) || !nodeIds.has(t);
            });
            if (badLinks.length > 0) console.error("CRITICAL: Dangling links", badLinks);
            else console.log("Link Integrity: OK");
        }
    }, [graphData, width, height]);

    // --- RENDER ---
    // Debug logging
    console.log(`[SingularityGraph] Render: ${graphData.nodes.length} nodes, ${graphData.links.length} links. Loading: ${loading}`);

    // Stable ref callback to avoid infinite loop
    // Stable ref callback to avoid infinite loop
    const handleRef = useCallback((node) => {
        fgRef.current = node;
        // initForces moved to useEffect to ensure data readiness
    }, []);







    // --- MOCK DATA GENERATOR ---
    const MOCK_DATA = useMemo(() => {
        const nodes = Array.from({ length: 15 }, (_, i) => ({
            id: `mock-${i}`,
            name: `Mock Node ${i}`,
            val: Math.random() * 20 + 5,
            type: i === 0 ? 'workItem' : 'file'
        }));
        const links = [];
        nodes.forEach((node, i) => {
            if (i > 0) {
                // Link to random previous node to ensure connectivity
                const target = Math.floor(Math.random() * i);
                links.push({ source: node.id, target: `mock-${target}` });
                // Chance for extra link
                if (Math.random() > 0.7) {
                    const extra = Math.floor(Math.random() * i);
                    links.push({ source: node.id, target: `mock-${extra}` });
                }
            }
        });
        return { nodes, links };
    }, []);

    const [useMockData, setUseMockData] = useState(false);

    // --- DATA SANITIZATION ---
    // Strict schema compliance based on ExperimentalGraph pattern
    // Removes all extra fields and circular references
    // --- DATA SANITIZATION ---
    // --- DATA STABILITY FOR D3 ---
    // D3 mutates node objects. We MUST preserve references across renders to prevent layout resets.
    const nodeMapRef = useRef(new Map());

    const visualGraphData = useMemo(() => {
        const sourceData = useMockData ? MOCK_DATA : graphData;
        const prevNodeMap = nodeMapRef.current;
        const nextNodeMap = new Map();

        // 1. Process Nodes (Reuse existing objects if possible)
        const nodes = sourceData.nodes
            .filter(n => {
                if (n.type === 'file' && !settings.vis.showFiles) return false;
                return true;
            })
            .map(n => {
                // Reuse existing D3 state if available
                const prev = prevNodeMap.get(n.id);
                if (prev) {
                    // Update data properties but keep D3 props (x, y, z, vx, vy, vz)
                    Object.assign(prev, {
                        ...n,
                        // Don't overwrite D3 props
                        x: prev.x, y: prev.y, z: prev.z,
                        vx: prev.vx, vy: prev.vy, vz: prev.vz,
                        fx: prev.fx, fy: prev.fy, fz: prev.fz
                    });
                    nextNodeMap.set(n.id, prev);
                    return prev;
                } else {
                    // New Node
                    const newNode = { ...n, val: n.val || 5 };
                    nextNodeMap.set(n.id, newNode);
                    return newNode;
                }
            });

        // Update Ref
        nodeMapRef.current = nextNodeMap;
        const nodeIds = new Set(nodes.map(n => n.id));

        // 2. Process Links
        // Filter links where both source/target exist in valid nodes
        const links = sourceData.links
            .filter(l => settings.vis.showLinks)
            .filter(l => {
                const s = typeof l.source === 'object' ? l.source.id : l.source;
                const t = typeof l.target === 'object' ? l.target.id : l.target;
                return nodeIds.has(s) && nodeIds.has(t);
            })
            .map(l => ({ ...l })); // Shallow copy to protect source

        return { nodes, links };

    }, [graphData, useMockData, MOCK_DATA, settings.vis]);

    console.log("[SingularityGraph] Visual Data (Stable):", visualGraphData.nodes.length);

    // 5. Force Physics Updates (Collision)
    useEffect(() => {
        if (!fgRef.current) return;
        // Collision is handled via d3-force-3d if imports worked, else disabled.
        // We explicitly disable standard collision if not in use.
        if (settings.activeView !== 'TRACEABILITY_DAG' && settings.activeView !== 'dependency_tree') {
            fgRef.current.d3Force('collision', null);
        }
    }, [settings.activeView, graphData.nodes.length]);

    // --- VISUAL STABILITY FOR CUSTOM NODES ---
    // Update custom node visuals (opacity/materials) IMPERATIVELY to avoid rebuilding meshes
    useEffect(() => {
        if (!fgRef.current) return;
        const scene = fgRef.current.scene();

        // Traverse all nodes and update opacity based on highlight
        visualGraphData.nodes.forEach(node => {
            const obj = node.__threeObj;
            if (!obj) return;

            const isDimmed = highlightNodes.size > 0 && !highlightNodes.has(node.id);
            const targetOpacity = isDimmed ? 0.2 : 1.0;

            // Handle Custom Groups (Block Hierarchy)
            if (node.type && settings.activeView === 'BLOCK_HIERARCHY') {
                obj.traverse(child => {
                    if (child.isMesh && child.material) {
                        child.material.opacity = targetOpacity;
                        child.material.transparent = true;
                        // Optional: Update Canvas Texture colors if needed (complex)
                        // For now just opacity is enough for performance
                    }
                });
            }
        });
    }, [highlightNodes, settings.activeView, visualGraphData.nodes]);

    // --- SUBGRAPH BOUNDARY VISUALIZATION ---
    const subgraphBoundariesRef = useRef(new Map()); // Map<parentNodeId, THREE.Group>

    useEffect(() => {
        if (!fgRef.current) return;
        const scene = fgRef.current.scene();
        if (!scene) return;

        // Clean up old boundaries that are no longer expanded
        subgraphBoundariesRef.current.forEach((boundaryGroup, parentId) => {
            if (!expandedSubgraphs.has(parentId)) {
                scene.remove(boundaryGroup);
                subgraphBoundariesRef.current.delete(parentId);
            }
        });

        // Create/update boundaries for expanded subgraphs
        expandedSubgraphs.forEach((expanded, parentId) => {
            // Get all nodes belonging to this subgraph
            const subgraphNodes = visualGraphData.nodes.filter(n => n.parentSubgraphId === parentId);
            if (subgraphNodes.length === 0) return;

            // Calculate bounding box
            let minX = Infinity, maxX = -Infinity;
            let minY = Infinity, maxY = -Infinity;
            let minZ = Infinity, maxZ = -Infinity;

            subgraphNodes.forEach(node => {
                const x = node.x || 0;
                const y = node.y || 0;
                const z = node.z || 0;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                minZ = Math.min(minZ, z);
                maxZ = Math.max(maxZ, z);
            });

            // Add padding
            const padding = 30;
            minX -= padding; maxX += padding;
            minY -= padding; maxY += padding;
            minZ -= padding; maxZ += padding;

            const centerX = (minX + maxX) / 2;
            const centerY = (minY + maxY) / 2;
            const centerZ = (minZ + maxZ) / 2;
            const sizeX = maxX - minX;
            const sizeY = maxY - minY;
            const sizeZ = maxZ - minZ;

            // Get or create boundary group
            let boundaryGroup = subgraphBoundariesRef.current.get(parentId);
            if (!boundaryGroup) {
                boundaryGroup = new THREE.Group();
                boundaryGroup.name = `subgraph-boundary-${parentId}`;
                scene.add(boundaryGroup);
                subgraphBoundariesRef.current.set(parentId, boundaryGroup);

                // Create wireframe box
                const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
                const edges = new THREE.EdgesGeometry(boxGeometry);
                const lineMaterial = new THREE.LineBasicMaterial({
                    color: '#00FF88',
                    transparent: true,
                    opacity: 0.6
                });
                const wireframe = new THREE.LineSegments(edges, lineMaterial);
                wireframe.name = 'wireframe';
                boundaryGroup.add(wireframe);

                // Create semi-transparent face
                const faceMaterial = new THREE.MeshBasicMaterial({
                    color: '#00FF88',
                    transparent: true,
                    opacity: 0.05,
                    side: THREE.DoubleSide
                });
                const faceMesh = new THREE.Mesh(boxGeometry.clone(), faceMaterial);
                faceMesh.name = 'faces';
                boundaryGroup.add(faceMesh);

                // Create collapse indicator at the top
                const indicatorGeometry = new THREE.SphereGeometry(4, 16, 16);
                const indicatorMaterial = new THREE.MeshBasicMaterial({
                    color: '#FF6B6B',
                    transparent: true,
                    opacity: 0.9
                });
                const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
                indicator.name = 'collapseIndicator';
                boundaryGroup.add(indicator);

                // Create label
                const canvas = document.createElement('canvas');
                canvas.width = 256;
                canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'rgba(0, 255, 136, 0.8)';
                ctx.font = 'bold 24px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`SUBGRAPH: ${expanded.originalNode?.name || parentId}`, 128, 40);
                const labelTexture = new THREE.CanvasTexture(canvas);
                const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
                const label = new THREE.Sprite(labelMaterial);
                label.name = 'label';
                label.scale.set(50, 12.5, 1);
                boundaryGroup.add(label);
            }

            // Update position and scale
            boundaryGroup.position.set(centerX, centerY, centerZ);

            const wireframe = boundaryGroup.getObjectByName('wireframe');
            const faces = boundaryGroup.getObjectByName('faces');
            if (wireframe) wireframe.scale.set(sizeX, sizeY, sizeZ);
            if (faces) faces.scale.set(sizeX, sizeY, sizeZ);

            const indicator = boundaryGroup.getObjectByName('collapseIndicator');
            if (indicator) {
                indicator.position.set(0, sizeY / 2 + 8, 0);
            }

            const label = boundaryGroup.getObjectByName('label');
            if (label) {
                label.position.set(0, sizeY / 2 + 20, 0);
            }
        });

    }, [expandedSubgraphs, visualGraphData.nodes]);

    // Cleanup boundaries on unmount
    useEffect(() => {
        return () => {
            if (fgRef.current) {
                const scene = fgRef.current.scene();
                if (scene) {
                    subgraphBoundariesRef.current.forEach((boundaryGroup) => {
                        scene.remove(boundaryGroup);
                    });
                }
            }
            subgraphBoundariesRef.current.clear();
        };
    }, []);

    const nodeThreeObject = useCallback((node) => {
        // BLOCK HIERARCHY MODE: Rectangular Text Blocks
        if (settings.activeView === 'BLOCK_HIERARCHY') {
            const group = new THREE.Group();

            // Note: We do NOT check highlightNodes here to prevent creating new objects on hover
            // Visual dimming is handled by the useEffect above

            // Check subgraph status for this node
            const hasSubgraph = node.hasSubGraph && !node.isSubgraphNode;
            const isSubgraphNode = node.isSubgraphNode;
            const isLoading = hasSubgraph && loadingSubgraphs.has(node.id);

            // 1. Create Texture
            const canvas = document.createElement('canvas');
            const w = 400; // Hi-Res Canvas
            const h = 200;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            // Background - special border for nodes with subgraphs
            ctx.fillStyle = 'rgba(0, 10, 20, 0.95)';
            // Use green border for subgraph nodes, yellow for loading, default color otherwise
            let borderColor = node.color || '#00FFFF';
            if (hasSubgraph) {
                borderColor = isLoading ? '#FFD700' : '#00FF88'; // Gold when loading, green otherwise
            } else if (isSubgraphNode) {
                borderColor = '#FF6B6B'; // Red-ish for subgraph member nodes
            }
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = hasSubgraph ? 14 : 10; // Thicker border for subgraph nodes
            ctx.beginPath();
            ctx.roundRect(5, 5, w - 10, h - 10, 20); // Rounded Corner
            ctx.fill();
            ctx.stroke();

            // Header Band
            ctx.fillStyle = node.color || '#00FFFF';
            ctx.beginPath();
            ctx.roundRect(10, 10, w - 20, 40, [15, 15, 0, 0]);
            ctx.fill();

            // ID Text (In Header)
            ctx.fillStyle = '#000000';
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(`ID: ${node.id}`, 25, 30);

            // Type Label (In Header Right)
            ctx.textAlign = 'right';
            ctx.fillText((node.type || 'ITEM').toUpperCase(), w - 25, 30);

            // Body Text (Title/Name)
            ctx.fillStyle = '#FFFFFF';
            ctx.font = 'bold 36px Arial'; // Larger title
            ctx.textAlign = 'center';
            const label = node.name || `Node ${node.id}`;
            const maxWidth = w - 40;

            // Simple text wrap or truncation
            if (ctx.measureText(label).width > maxWidth) {
                // Truncate for now complexity
                ctx.fillText(label.substring(0, 20) + '...', w / 2, h / 2);
            } else {
                ctx.fillText(label, w / 2, h / 2);
            }

            // Details (Bottom)
            ctx.font = '24px monospace';
            ctx.fillStyle = '#AAAAAA';
            ctx.fillText(`LVL: ${node.level || 0}`, w / 2, h - 30);

            // SUBGRAPH INDICATOR on canvas: Draw expand icon (+) or loading spinner
            if (hasSubgraph) {
                const iconX = w - 50;
                const iconY = h - 50;
                const iconRadius = 25;

                // Circle background
                ctx.fillStyle = isLoading ? '#FFD700' : '#00FF88';
                ctx.beginPath();
                ctx.arc(iconX, iconY, iconRadius, 0, Math.PI * 2);
                ctx.fill();

                // Plus icon or loading indicator
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';

                if (isLoading) {
                    // Draw rotating loading indicator (simplified as arc)
                    ctx.beginPath();
                    ctx.arc(iconX, iconY, iconRadius - 8, 0, Math.PI * 1.5);
                    ctx.stroke();
                } else {
                    // Draw plus sign
                    ctx.beginPath();
                    ctx.moveTo(iconX - 12, iconY);
                    ctx.lineTo(iconX + 12, iconY);
                    ctx.moveTo(iconX, iconY - 12);
                    ctx.lineTo(iconX, iconY + 12);
                    ctx.stroke();
                }
            }

            // SUBGRAPH MEMBER BADGE: Small indicator showing this is part of expanded subgraph
            if (isSubgraphNode) {
                const badgeX = w - 45;
                const badgeY = h - 45;

                // Circle badge
                ctx.fillStyle = '#FF6B6B';
                ctx.beginPath();
                ctx.arc(badgeX, badgeY, 18, 0, Math.PI * 2);
                ctx.fill();

                // Minus sign (collapse hint)
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(badgeX - 8, badgeY);
                ctx.lineTo(badgeX + 8, badgeY);
                ctx.stroke();
            }

            const texture = new THREE.CanvasTexture(canvas);

            // 2. Geometry: Thin Box (Card)
            const geometry = new THREE.BoxGeometry(40, 20, 2);
            const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                opacity: 1.0, // Default, updated by Effect
                depthWrite: true
            });

            const mesh = new THREE.Mesh(geometry, material);
            group.add(mesh);

            // 3. SUBGRAPH INDICATOR - 3D glowing ring around card (additional to canvas indicator)
            if (hasSubgraph) {
                // Outer ring indicator - horizontal around the card
                const ringGeometry = new THREE.TorusGeometry(25, 0.8, 8, 32);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: isLoading ? '#FFD700' : '#00FF88',
                    transparent: true,
                    opacity: isLoading ? 0.9 : 0.6
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.rotation.x = Math.PI / 2; // Horizontal ring
                ring.position.z = 1; // Slightly in front of card
                ring.name = 'subgraphIndicator';
                group.add(ring);

                // Animate ring if loading
                if (isLoading) {
                    ring.userData.isAnimating = true;
                }
            }

            // 4. COLLAPSE INDICATOR for subgraph nodes - shows parent relationship
            if (isSubgraphNode) {
                // Small sphere badge showing this is part of an expanded subgraph
                const badgeGeometry = new THREE.SphereGeometry(2.5, 8, 8);
                const badgeMaterial = new THREE.MeshBasicMaterial({
                    color: '#FF6B6B',
                    transparent: true,
                    opacity: 0.9
                });
                const badge = new THREE.Mesh(badgeGeometry, badgeMaterial);
                badge.position.set(22, 12, 2); // Top-right corner of card
                badge.name = 'subgraphBadge';
                group.add(badge);
            }

            return group;
        }

        // -- CUSTOM 3D GEOMETRY BY TYPE --
        const type = (node.type || 'item').toLowerCase();
        let geometry;
        let color = node.color || '#00FFFF';
        let nodeSize = 6;

        // Select Geometry based on Type matches
        if (['epic', 'feature', 'changerequest', 'capability', 'portfolio'].some(t => type.includes(t))) {
            // STRATEGIC: Gem / Diamond
            geometry = new THREE.IcosahedronGeometry(8, 0);
            color = '#d946ef'; // Magenta
            nodeSize = 8;
        }
        else if (['bug', 'impediment', 'problem'].some(t => type.includes(t))) {
            // DEFECT: Spiky / Red Cube
            geometry = new THREE.BoxGeometry(10, 10, 10);
            color = '#ef4444'; // Red
            nodeSize = 10;
        }
        else if (['task', 'user story', 'issue', 'workitem', 'requirement'].some(t => type.includes(t))) {
            // WORK: Cube / Box
            geometry = new THREE.BoxGeometry(9, 9, 9);
            color = '#06b6d4'; // Cyan
            nodeSize = 9;
        }
        else if (['file', 'commit', 'changeset', 'code'].some(t => type.includes(t))) {
            // CODE: Tetrahedron (Pyramid) / Abstract
            geometry = new THREE.TetrahedronGeometry(7);
            color = '#22c55e'; // Green
            nodeSize = 7;
        }
        else if (['artifact', 'release', 'wiki', 'document'].some(t => type.includes(t))) {
            // ARTIFACT: Disc / Cylinder
            geometry = new THREE.CylinderGeometry(6, 6, 2, 16);
            color = '#eab308'; // Gold
            nodeSize = 6;
        }
        else {
            // DEFAULT: Sphere
            geometry = new THREE.SphereGeometry(6, 16, 16);
            color = '#94a3b8'; // Grey
            nodeSize = 6;
        }

        // Apply Hover / Dim Logic (Note: Opacity handled in Effect, but base material needed)
        // We create a wrapper group to hold mesh + wireframe
        const group = new THREE.Group();

        // 1. Base Mesh
        const material = new THREE.MeshLambertMaterial({
            color: color,
            transparent: true,
            opacity: 0.8, // Base opacity
            emissive: color,
            emissiveIntensity: 0.2
        });
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);

        // 2. Wireframe Overlay (Technical Look)
        const wiregeo = new THREE.WireframeGeometry(geometry);
        const wiremat = new THREE.LineBasicMaterial({
            color: '#FFFFFF',
            transparent: true,
            opacity: 0.15
        });
        const wireframe = new THREE.LineSegments(wiregeo, wiremat);
        group.add(wireframe);

        // 3. SUBGRAPH INDICATOR - Glowing ring around nodes with subgraphs
        // Debug: log subgraph check for each node
        if (node.hasSubGraph) {
            console.log('[nodeThreeObject] Node has subgraph:', node.id, node.name, 'isSubgraphNode:', node.isSubgraphNode);
        }

        if (node.hasSubGraph && !node.isSubgraphNode) {
            console.log('[nodeThreeObject] Rendering subgraph indicator for:', node.id);
            const isLoading = loadingSubgraphs.has(node.id);

            // Outer ring indicator
            const ringGeometry = new THREE.TorusGeometry(nodeSize + 3, 0.8, 8, 32);
            const ringMaterial = new THREE.MeshBasicMaterial({
                color: isLoading ? '#FFD700' : '#00FF88',
                transparent: true,
                opacity: isLoading ? 0.9 : 0.7
            });
            const ring = new THREE.Mesh(ringGeometry, ringMaterial);
            ring.rotation.x = Math.PI / 2; // Horizontal ring
            ring.name = 'subgraphIndicator';
            group.add(ring);

            // Small expand icon (plus sign using lines)
            const iconSize = 2.5;
            const iconGeometry = new THREE.BufferGeometry();
            const iconVertices = new Float32Array([
                // Horizontal line
                -iconSize, 0, nodeSize + 5,
                iconSize, 0, nodeSize + 5,
                // Vertical line
                0, -iconSize, nodeSize + 5,
                0, iconSize, nodeSize + 5
            ]);
            iconGeometry.setAttribute('position', new THREE.BufferAttribute(iconVertices, 3));
            const iconMaterial = new THREE.LineBasicMaterial({
                color: '#00FF88',
                linewidth: 2
            });
            const expandIcon = new THREE.LineSegments(iconGeometry, iconMaterial);
            expandIcon.name = 'expandIcon';
            group.add(expandIcon);

            // Animate ring if loading
            if (isLoading) {
                ring.userData.isAnimating = true;
            }
        }

        // 4. COLLAPSE INDICATOR for subgraph nodes - shows parent relationship
        if (node.isSubgraphNode) {
            // Small badge showing this is part of an expanded subgraph
            const badgeGeometry = new THREE.SphereGeometry(2, 8, 8);
            const badgeMaterial = new THREE.MeshBasicMaterial({
                color: '#FF6B6B',
                transparent: true,
                opacity: 0.9
            });
            const badge = new THREE.Mesh(badgeGeometry, badgeMaterial);
            badge.position.set(nodeSize + 2, nodeSize + 2, 0);
            badge.name = 'subgraphBadge';
            group.add(badge);
        }

        return group;

    // Note: we need graphData.nodes in deps to force recreation of THREE objects when hasSubGraph changes
    }, [settings.activeView, loadingSubgraphs, graphData.nodes]); // Re-create THREE objects when nodes change

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>

            {/* 1. GRAPH LAYER (Rendered First) */}
            {width > 100 && height > 100 ? (
                <ForceGraph3D
                    ref={handleRef}
                    width={width}
                    height={height}
                    graphData={visualGraphData}
                    backgroundColor="#101020"

                    // DAG Layout
                    dagMode={(settings.activeView === 'TRACEABILITY_DAG' || settings.activeView === 'dependency_tree' || settings.activeView === 'BLOCK_HIERARCHY') ? 'td' : null}
                    dagLevelDistance={settings.activeView === 'BLOCK_HIERARCHY' ? 100 : 300}
                    d3VelocityDecay={(settings.activeView.includes('DAG') || settings.activeView === 'dependency_tree' || settings.activeView === 'BLOCK_HIERARCHY') ? 0.3 : 0.05}

                    // Nodes
                    nodeRelSize={1}
                    nodeId="id"
                    nodeVal={node => {
                        const lvl = node.level || 0;
                        return 100 / (lvl + 1);
                    }}
                    nodeLabel="name"
                    nodeColor={node => {
                        // Use nodeColor for default spheres dimming
                        const isDimmed = highlightNodes.size > 0 && !highlightNodes.has(node.id);
                        return isDimmed ? '#444444' : (node.color || '#00FFFF');
                    }}
                    nodeOpacity={1}

                    // Links
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={2}
                    linkWidth={settings.activeView === 'BLOCK_HIERARCHY' ? 2 : 1}
                    linkColor={(link) => {
                        if (settings.activeView === 'BLOCK_HIERARCHY') {
                            const palette = ['#FFD700', '#C0C0C0', '#CD7F32'];
                            const hash = (link.source.id || '').toString().charCodeAt(0) || 0;
                            return palette[hash % 3];
                        }
                        return 'rgba(255,255,255,0.2)';
                    }}

                    // Custom Objects
                    nodeThreeObject={nodeThreeObject}

                    // Interactions
                    onNodeHover={handleNodeHover}
                    onLinkHover={handleLinkHover}
                    onNodeClick={(node, event) => {
                        // Handle subgraph nodes - collapse parent subgraph
                        if (node.isSubgraphNode && node.parentSubgraphId) {
                            // Single click on subgraph node - just focus
                            if (fgRef.current) {
                                fgRef.current.cameraPosition(
                                    { x: node.x, y: node.y + 50, z: node.z + 150 },
                                    { x: node.x, y: node.y, z: node.z },
                                    1500
                                );
                            }
                            return;
                        }

                        // Handle nodes with subgraphs - expand on click
                        if (node.hasSubGraph && !node.isSubgraphNode) {
                            handleExpandSubgraph(node);
                            return;
                        }

                        if (settings.activeView === 'BLOCK_HIERARCHY') {
                            const distance = 400;
                            if (fgRef.current) {
                                fgRef.current.cameraPosition(
                                    { x: node.x, y: node.y, z: distance + 50 },
                                    { x: node.x, y: node.y, z: 0 },
                                    2000
                                );
                            }
                        } else {
                            // Only navigate for crawler nodes (numeric IDs)
                            const isWorkItemId = /^\d+$/.test(node.id);
                            if (isWorkItemId) {
                                navigate(`/nexus/workitem/${node.id}`);
                            }
                        }
                    }}
                    onNodeRightClick={(node, event) => {
                        // Right-click to collapse subgraph
                        if (node.isSubgraphNode && node.parentSubgraphId) {
                            event.preventDefault();
                            handleCollapseSubgraph(node.parentSubgraphId);
                        }
                    }}
                />
            ) : (
                <div style={{
                    display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%',
                    color: '#00FFFF', fontFamily: 'monospace', flexDirection: 'column'
                }}>
                    <div style={{ fontSize: '24px', marginBottom: '10px' }}>INITIALIZING SINGULARITY FIELD</div>
                    <div style={{ fontSize: '14px', opacity: 0.7 }}>Calibrating Dimensions...</div>
                </div>
            )}

            {/* 2. HUD OVERLAY (Rendered Second, On Top) */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: 10
            }}>
                {/* TOP LEFT: TITLE */}
                <div style={{ position: 'absolute', top: 20, left: 20 }}>
                    <h1 style={{ margin: 0, color: '#00FFFF', fontSize: '24px', letterSpacing: '2px', textShadow: '0 0 10px #00FFFF' }}>
                        SINGULARITY FIELD // {settings.activeView.replace('_', ' ')}
                    </h1>
                    <div style={{ color: '#888', fontSize: '12px', marginTop: '5px', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <span>NODES: {graphData.nodes.length} | LINKS: {graphData.links.length}</span>
                        {graphData.nodes.filter(n => n.hasSubGraph).length > 0 && (
                            <span style={{ color: '#00FF88' }}>
                                ◎ {graphData.nodes.filter(n => n.hasSubGraph && !n.isSubgraphNode).length} WITH SUBGRAPHS
                            </span>
                        )}
                        {expandedSubgraphs.size > 0 && (
                            <span style={{ color: '#FFD700' }}>
                                ▸ {expandedSubgraphs.size} EXPANDED
                            </span>
                        )}
                        <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            background: dataSource === 'external' ? 'rgba(5, 217, 232, 0.2)' :
                                       dataSource === 'mock' ? 'rgba(255, 149, 0, 0.2)' :
                                       'rgba(1, 255, 195, 0.2)',
                            color: dataSource === 'external' ? '#05d9e8' :
                                   dataSource === 'mock' ? '#ff9500' :
                                   '#01ffc3',
                            border: `1px solid ${
                                dataSource === 'external' ? '#05d9e8' :
                                dataSource === 'mock' ? '#ff9500' :
                                '#01ffc3'
                            }33`
                        }}>
                            {dataSource === 'external' ? 'CATALOG' :
                             dataSource === 'mock' ? 'MOCK' : 'CRAWLER'}
                        </span>
                    </div>
                </div>

                {/* TOP RIGHT: CONTROL PANEL */}
                <div style={{ position: 'absolute', top: 20, right: 20, pointerEvents: 'auto' }}>
                    <ViewControlPanel
                        settings={settings}
                        actions={{
                            setGraphView: actions.setViewMode,
                            setViewMode: actions.setViewMode,
                            updatePhysics: actions.updatePhysics,
                            setCameraView: moveCamera,
                            highlightLayer: handleLayerHover,
                            toggleVisibility: actions.toggleVisibility
                        }}
                    />
                </div>

                {/* BOTTOM LEFT: CRAWLER CONTROLS */}
                <div style={{ position: 'absolute', bottom: 20, left: 20, pointerEvents: 'auto' }}>
                    <div style={{
                        background: 'rgba(0, 10, 20, 0.8)',
                        border: '1px solid #00FFFF',
                        padding: '15px',
                        backdropFilter: 'blur(5px)',
                        minWidth: '250px'
                    }}>
                        <div style={{ color: '#00FFFF', fontSize: '12px', marginBottom: '10px', letterSpacing: '1px' }}>
                            DATA CRAWLER
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#ccc' }}>
                                <span>DEPTH LEVEL: {crawlerDepth}</span>
                                <input
                                    type="range"
                                    min="1"
                                    max="5"
                                    value={crawlerDepth}
                                    onChange={(e) => setCrawlerDepth(parseInt(e.target.value))}
                                    style={{ width: '100px', accentColor: '#00FFFF' }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', color: '#ccc' }}>
                                <span>MAX NODES:</span>
                                <span style={{ color: '#00FFFF' }}>500</span>
                            </div>
                            <button
                                onClick={() => {
                                    setGraphData({ nodes: [], links: [] });
                                    visited.current = new Set();
                                    fetchNode(rootId, 0);
                                }}
                                style={{
                                    background: 'rgba(0, 255, 255, 0.1)',
                                    border: '1px solid #00FFFF',
                                    color: '#00FFFF',
                                    padding: '5px',
                                    cursor: 'pointer',
                                    marginTop: '5px',
                                    fontSize: '11px'
                                }}
                            >
                                RESTART SCAN
                            </button>
                            <label style={{ cursor: 'pointer', fontSize: '11px', color: '#bbb', display: 'flex', alignItems: 'center', marginTop: '5px' }}>
                                <input
                                    type="checkbox"
                                    checked={useMockData}
                                    onChange={(e) => {
                                        setUseMockData(e.target.checked);
                                        setDataSource(e.target.checked ? 'mock' : 'crawler');
                                    }}
                                    style={{ marginRight: '5px' }}
                                />
                                USE MOCK DATA
                            </label>
                            {/* TEST BUTTON: Simulate subgraph markers */}
                            <button
                                onClick={() => {
                                    // Mark first 3 nodes as having subgraphs (for testing visual indicators)
                                    const updatedNodes = graphData.nodes.map((n, i) => ({
                                        ...n,
                                        hasSubGraph: i < 3, // First 3 nodes have subgraphs
                                        subGraphId: i < 3 ? `test-subgraph-${i}` : null
                                    }));

                                    // Clear the node map to force THREE object recreation
                                    nodeMapRef.current.clear();

                                    setGraphData({
                                        nodes: updatedNodes,
                                        links: graphData.links
                                    });

                                    console.log('[Test] Marked first 3 nodes as having subgraphs:', updatedNodes.slice(0, 3).map(n => ({ id: n.id, hasSubGraph: n.hasSubGraph })));
                                }}
                                style={{
                                    background: 'rgba(0, 255, 136, 0.1)',
                                    border: '1px solid #00FF88',
                                    color: '#00FF88',
                                    padding: '5px',
                                    cursor: 'pointer',
                                    marginTop: '5px',
                                    fontSize: '10px',
                                    width: '100%'
                                }}
                            >
                                🧪 TEST SUBGRAPH INDICATORS
                            </button>
                        </div>
                    </div>
                </div>

                {/* BOTTOM RIGHT: TRACEABILITY LEGEND (Contextual) */}
                {settings.activeView === 'TRACEABILITY_DAG' && (
                    <div style={{
                        position: 'absolute',
                        bottom: 20,
                        right: 20,
                        background: 'rgba(0,0,0,0.8)',
                        border: '1px solid #444',
                        padding: '10px',
                        fontSize: '11px',
                        color: '#ccc',
                        pointerEvents: 'none' // Passthrough
                    }}>
                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '5px' }}>LAYERS (Z-AXIS)</div>
                        <div style={{ color: '#FF00FF' }}>● +50: CHANGE REQUESTS</div>
                        <div style={{ color: '#00FFFF' }}>● 0: WORK ITEMS</div>
                        <div style={{ color: '#FFFF00' }}>● -50: ARTIFACTS</div>
                    </div>
                )}

                {/* LOADING SUBGRAPH INDICATOR */}
                {loadingSubgraphs.size > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(0, 20, 10, 0.95)',
                        border: '2px solid #FFD700',
                        borderRadius: '8px',
                        padding: '20px 30px',
                        color: '#FFD700',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        zIndex: 100,
                        boxShadow: '0 0 30px rgba(255, 215, 0, 0.3)'
                    }}>
                        <div style={{
                            width: 24,
                            height: 24,
                            border: '3px solid transparent',
                            borderTopColor: '#FFD700',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }} />
                        LOADING SUBGRAPH...
                        <style>{`
                            @keyframes spin {
                                from { transform: rotate(0deg); }
                                to { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                )}

                {/* EXPANDED SUBGRAPHS PANEL */}
                {expandedSubgraphs.size > 0 && (
                    <div style={{
                        position: 'absolute',
                        top: 100,
                        left: 20,
                        background: 'rgba(0, 20, 10, 0.9)',
                        border: '1px solid #00FF88',
                        borderRadius: '4px',
                        padding: '12px',
                        fontSize: '11px',
                        color: '#ccc',
                        pointerEvents: 'auto',
                        maxWidth: '250px',
                        backdropFilter: 'blur(5px)'
                    }}>
                        <div style={{
                            color: '#00FF88',
                            fontWeight: 'bold',
                            marginBottom: '8px',
                            fontSize: '12px',
                            letterSpacing: '1px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}>
                            <span>◎</span> EXPANDED SUBGRAPHS ({expandedSubgraphs.size})
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {Array.from(expandedSubgraphs.entries()).map(([parentId, data]) => (
                                <div key={parentId} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    background: 'rgba(0, 255, 136, 0.1)',
                                    padding: '6px 8px',
                                    borderRadius: '3px',
                                    border: '1px solid rgba(0, 255, 136, 0.3)'
                                }}>
                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                                        <span style={{ color: '#00FF88' }}>▸</span>{' '}
                                        {data.originalNode?.name || parentId}
                                    </div>
                                    <button
                                        onClick={() => handleCollapseSubgraph(parentId)}
                                        style={{
                                            background: 'rgba(255, 107, 107, 0.2)',
                                            border: '1px solid #FF6B6B',
                                            color: '#FF6B6B',
                                            padding: '2px 8px',
                                            cursor: 'pointer',
                                            fontSize: '10px',
                                            borderRadius: '2px'
                                        }}
                                        title="Collapse subgraph"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '10px', color: '#666', fontStyle: 'italic' }}>
                            Right-click subgraph nodes to collapse
                        </div>
                    </div>
                )}
            </div>

            {/* CUSTOM CURSOR TOOLTIP (Rendered Last) */}
            {tooltip.visible && tooltip.content && (
                <div style={{
                    position: 'fixed',
                    top: tooltip.y + 20,
                    left: tooltip.x + 20,
                    backgroundColor: 'rgba(0, 5, 10, 0.9)',
                    border: '1px solid #00FFFF',
                    borderRadius: '4px',
                    padding: '10px',
                    zIndex: 9999,
                    pointerEvents: 'none',
                    backdropFilter: 'blur(5px)',
                    boxShadow: '0 0 15px rgba(0, 255, 255, 0.3)',
                    maxWidth: '300px',
                    color: '#FFF',
                    fontFamily: 'Orbitron, monospace'
                }}>
                    <div style={{
                        fontSize: '14px',
                        fontWeight: 'bold',
                        color: tooltip.type === 'node' ? '#00FFFF' : '#FFD700',
                        borderBottom: '1px solid rgba(255,255,255,0.2)',
                        paddingBottom: '5px',
                        marginBottom: '5px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        {tooltip.type === 'node' && <span>⬢</span>}
                        {tooltip.type === 'link' && <span>🔗</span>}
                        {tooltip.content.title}
                    </div>
                    <div style={{ fontSize: '11px', color: '#AAAAAA', marginBottom: '3px' }}>
                        {tooltip.content.subtitle}
                    </div>
                    <div style={{ fontSize: '10px', color: '#666', fontStyle: 'italic' }}>
                        {tooltip.content.details}
                    </div>
                </div>
            )}
        </div>
    );


};

export default SingularityGraph;
