import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
// import { forceCollide } from 'd3-force-3d';
import { useResizeDetector } from 'react-resize-detector';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { useNavigate } from 'react-router-dom';

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
        highlight: '#FFD700' // Gold
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

const SingularityGraph = ({ rootId }) => {
    const fgRef = useRef();
    const navigate = useNavigate();
    const { width, height, ref: containerRef } = useResizeDetector();

    // -- State --
    const [graphData, setGraphData] = useState({ nodes: [], links: [] });

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
            const res = await fetch(`http://localhost:3000/api/v1/nexus/entity/workitem/${sId}`);
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

    // -- INIT CRAWLER --
    useEffect(() => {
        if (rootId) {
            // Reset for new root
            setGraphData({ nodes: [], links: [] });
            visited.current = new Set();
            fetchNode(rootId, 0);
        }
    }, [rootId, fetchNode]);

    // -- INTERACTION STATE (Focus/X-Ray) --
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set());
    const [hoverNode, setHoverNode] = useState(null);
    const [activeLayer, setActiveLayer] = useState(null); // 'epic' | 'workitem' | 'file'

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
            setHighlightNodes(new Set());
            setHighlightLinks(new Set());
        }
    }, [graphData.links, hoverNode, highlightNodes, activeLayer]);

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

    const nodeThreeObject = useCallback((node) => {
        // BLOCK HIERARCHY MODE: Rectangular Text Blocks
        if (settings.activeView === 'BLOCK_HIERARCHY') {
            const group = new THREE.Group();

            // Note: We do NOT check highlightNodes here to prevent creating new objects on hover
            // Visual dimming is handled by the useEffect above

            // 1. Create Texture
            const canvas = document.createElement('canvas');
            const w = 400; // Hi-Res Canvas
            const h = 200;
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            // Background
            ctx.fillStyle = 'rgba(0, 10, 20, 0.95)';
            ctx.strokeStyle = node.color || '#00FFFF';
            ctx.lineWidth = 10;
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

            return group;
        }

        return null; // Default Spheres
    }, [settings.activeView]); // Stable dependency

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
            {/* 1. HUD OVERLAY (Cyberpunk UI) */}
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
                    <div style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>
                        NODES: {graphData.nodes.length} | LINKS: {graphData.links.length}
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
                                    onChange={(e) => setUseMockData(e.target.checked)}
                                    style={{ marginRight: '5px' }}
                                />
                                USE MOCK DATA
                            </label>
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
            </div>

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
                        // For default spheres (BLOCK not active), we return simple color
                        // ForceGraph3D doesn't support alpha here easily unless 'rgba(...)'.
                        // But we want to avoid string parsing overhead ideally.
                        // Let's just return dimmer color
                        return isDimmed ? '#444444' : (node.color || '#00FFFF');
                    }}
                    nodeOpacity={1}

                    // Links
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={2}
                    linkWidth={settings.activeView === 'BLOCK_HIERARCHY' ? 2 : 1}
                    linkColor={(link) => {
                        if (settings.activeView === 'BLOCK_HIERARCHY') {
                            // Gold, Silver, Orange (Copper-ish)
                            const palette = ['#FFD700', '#C0C0C0', '#CD7F32'];
                            // Use a hash or index to pick color, or level
                            // Let's use source ID hash to be consistent
                            const hash = (link.source.id || '').toString().charCodeAt(0) || 0;
                            return palette[hash % 3];
                        }
                        return 'rgba(255,255,255,0.2)';
                    }}

                    // Custom Objects
                    nodeThreeObject={nodeThreeObject}

                    // Interactions
                    onNodeHover={handleNodeHover}
                    onNodeClick={node => {
                        if (settings.activeView === 'BLOCK_HIERARCHY') {
                            // Focus on Node logic (Fly camera to 2.5D front view of node)
                            const distance = 400; // Distance to maintain 2.5D feel
                            if (fgRef.current) {
                                fgRef.current.cameraPosition(
                                    { x: node.x, y: node.y, z: distance + 50 }, // Look from front-ish
                                    { x: node.x, y: node.y, z: 0 }, // Look at node
                                    2000 // ms transition
                                );
                            }
                        } else {
                            navigate(`/nexus/workitem/${node.id}`);
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
        </div>
    );


};

export default SingularityGraph;
