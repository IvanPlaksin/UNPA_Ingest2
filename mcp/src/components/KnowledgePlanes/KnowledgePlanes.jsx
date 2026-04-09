import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Box, IconButton, Tooltip, Slider, Typography, Switch, FormControlLabel, Chip, Paper, CircularProgress, Alert } from '@mui/material';
import { Fullscreen, FullscreenExit, Refresh, Visibility, VisibilityOff, RestartAlt, CloudDownload, Storage, FolderSpecial } from '@mui/icons-material';
import { fetchKnowledgePlanesData } from '../../services/knowledgeGraphService';

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE PLANES VISUALIZATION v6.19
// Multi-layer 3D knowledge graph with wormholes (Einstein-Rosen Bridge)
// Adapted for UNPA Project Advisor
// ═══════════════════════════════════════════════════════════════════════════════

const PLANES_CONFIG = {
    strategic: {
        id: 'strategic',
        name: 'Strategic Layer',
        description: 'Vision, OKRs, KPIs',
        z: -400,
        color: '#ff2a6d',
        nodeColor: '#ff2a6d',
        icon: '◈',
        order: 0
    },
    business: {
        id: 'business',
        name: 'Business Logic',
        description: 'Epics, Features, Processes',
        z: -200,
        color: '#05d9e8',
        nodeColor: '#05d9e8',
        icon: '◆',
        order: 1
    },
    tasks: {
        id: 'tasks',
        name: 'Task Management',
        description: 'WorkItems, Sprints, Bugs',
        z: 0,
        color: '#01ffc3',
        nodeColor: '#01ffc3',
        icon: '▣',
        order: 2
    },
    code: {
        id: 'code',
        name: 'Implementation',
        description: 'Files, Commits, Modules',
        z: 200,
        color: '#f6019d',
        nodeColor: '#f6019d',
        icon: '●',
        order: 3
    },
    infrastructure: {
        id: 'infrastructure',
        name: 'Infrastructure',
        description: 'Servers, DBs, Services',
        z: 400,
        color: '#ff9500',
        nodeColor: '#ff9500',
        icon: '⬡',
        order: 4
    }
};

const EDGE_TYPES = {
    implements: { label: 'Implements', description: 'Implementation of requirement' },
    subtask: { label: 'Subtask', description: 'Is subtask of' },
    submodule: { label: 'Submodule', description: 'Is submodule of' },
    depends: { label: 'Depends on', description: 'Has dependency on' },
    contains: { label: 'Contains', description: 'Contains element' },
    deploys: { label: 'Deploys', description: 'Deployed on' },
    uses: { label: 'Uses', description: 'Uses resource' },
    tracks: { label: 'Tracks', description: 'Tracks metric' },
    derives: { label: 'Derives from', description: 'Derived from' },
    configures: { label: 'Configures', description: 'Configures component' }
};

const WORMHOLE_CONFIG = {
    throatRadius: 6,
    flareFactor: 1.25,
    meridians: 16,
    parallels: 32
};

const NAV_MODES = {
    orbit: { id: 'orbit', name: 'Orbit', description: 'Rotate around focused element' },
    pan: { id: 'pan', name: 'Pan', description: 'Move view horizontally/vertically' },
    flythrough: { id: 'flythrough', name: 'Fly', description: 'FPS-style WASD + mouse' },
    arch: { id: 'arch', name: 'Arch', description: 'MMB=Pan, Shift+MMB=Orbit, F=Fly' }
};

// ─────────────────────────────────────────────────────────────────────────────────
// SEMANTIC GRAPH DATA SIMULATOR
// ─────────────────────────────────────────────────────────────────────────────────

const SEMANTIC_DOMAINS = {
    security: { vector: [0.9, 0.1, 0.2, 0.1], color: '#ff6b6b' },
    payment: { vector: [0.2, 0.9, 0.3, 0.1], color: '#4ecdc4' },
    data: { vector: [0.3, 0.2, 0.9, 0.2], color: '#45b7d1' },
    user: { vector: [0.1, 0.3, 0.2, 0.9], color: '#96ceb4' },
    infrastructure: { vector: [0.5, 0.5, 0.5, 0.5], color: '#dda0dd' },
    api: { vector: [0.4, 0.6, 0.4, 0.3], color: '#ffeaa7' },
    monitoring: { vector: [0.6, 0.3, 0.7, 0.2], color: '#74b9ff' }
};

const NODE_TEMPLATES = {
    strategic: ['OKR', 'KPI', 'Vision', 'Goal', 'Strategy', 'Initiative'],
    business: ['Epic', 'Feature', 'Process', 'Workflow', 'Capability', 'Service'],
    tasks: ['Task', 'Story', 'Bug', 'Spike', 'Sprint', 'Milestone'],
    code: ['Module', 'Service', 'Controller', 'Repository', 'Config', 'Utils'],
    infrastructure: ['Cluster', 'Database', 'Cache', 'Queue', 'LoadBalancer', 'Pod']
};

const EDGE_TYPES_LIST = ['implements', 'subtask', 'submodule', 'depends', 'contains', 'deploys', 'uses', 'tracks', 'derives', 'configures'];

const cosineSimilarity = (a, b) => {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magA * magB);
};

const generateVector = (random, domainBias = null, noise = 0.3) => {
    let base = [random(), random(), random(), random()];
    if (domainBias && SEMANTIC_DOMAINS[domainBias]) {
        const domainVec = SEMANTIC_DOMAINS[domainBias].vector;
        base = base.map((v, i) => v * noise + domainVec[i] * (1 - noise));
    }
    const mag = Math.sqrt(base.reduce((s, v) => s + v * v, 0));
    return base.map(v => v / mag);
};

const vectorToPosition = (vector, scale = 150) => {
    const projX = vector[0] * 0.7 - vector[1] * 0.3 + vector[2] * 0.4 - vector[3] * 0.5;
    const projY = vector[0] * 0.3 + vector[1] * 0.6 - vector[2] * 0.5 + vector[3] * 0.4;
    return { x: projX * scale, y: projY * scale };
};

const generateGraphData = (seed = Date.now()) => {
    let rng = seed;
    const random = () => {
        rng = (rng * 1103515245 + 12345) & 0x7fffffff;
        return rng / 0x7fffffff;
    };

    const domains = Object.keys(SEMANTIC_DOMAINS);
    const planes = Object.keys(NODE_TEMPLATES);

    // Generate bridge concepts
    const numBridges = 3 + Math.floor(random() * 4);
    const bridges = [];

    for (let i = 0; i < numBridges; i++) {
        const primaryDomain = domains[Math.floor(random() * domains.length)];
        const secondaryDomain = domains[Math.floor(random() * domains.length)];
        const primaryVec = generateVector(random, primaryDomain, 0.4);
        const secondaryVec = generateVector(random, secondaryDomain, 0.5);
        const bridgeVector = primaryVec.map((v, idx) => v * 0.6 + secondaryVec[idx] * 0.4);

        const numPlanes = 2 + Math.floor(random() * 4);
        const shuffledPlanes = [...planes].sort(() => random() - 0.5);
        const bridgePlanes = shuffledPlanes.slice(0, numPlanes).sort((a, b) =>
            planes.indexOf(a) - planes.indexOf(b)
        );

        const bridgeId = `bridge-${i}`;
        const bridgeLabel = `${primaryDomain.charAt(0).toUpperCase() + primaryDomain.slice(1)} ${secondaryDomain !== primaryDomain ? secondaryDomain.charAt(0).toUpperCase() + secondaryDomain.slice(1) : 'Core'}`;

        const instances = {};
        bridgePlanes.forEach(planeId => {
            const instanceVector = bridgeVector.map(v => v + (random() - 0.5) * 0.15);
            const pos = vectorToPosition(instanceVector);
            const templates = NODE_TEMPLATES[planeId];
            instances[planeId] = {
                id: `${bridgeId}-${planeId}`,
                type: templates[Math.floor(random() * templates.length)].toLowerCase(),
                label: `${bridgeLabel} ${templates[Math.floor(random() * templates.length)]}`,
                x: pos.x,
                y: pos.y,
                vector: instanceVector,
                semanticDomain: primaryDomain
            };
        });

        bridges.push({
            bridgeId,
            label: bridgeLabel,
            planes: bridgePlanes,
            instances,
            vector: bridgeVector,
            primaryDomain,
            secondaryDomain
        });
    }

    // Generate standalone nodes
    const standaloneNodes = [];
    const numStandalone = 8 + Math.floor(random() * 8);

    for (let i = 0; i < numStandalone; i++) {
        const planeId = planes[Math.floor(random() * planes.length)];
        const domain = domains[Math.floor(random() * domains.length)];
        const nodeVector = generateVector(random, domain, 0.3 + random() * 0.4);
        const pos = vectorToPosition(nodeVector);
        const templates = NODE_TEMPLATES[planeId];

        standaloneNodes.push({
            id: `node-${planeId}-${i}`,
            type: templates[Math.floor(random() * templates.length)].toLowerCase(),
            plane: planeId,
            label: `${domain.charAt(0).toUpperCase() + domain.slice(1)} ${templates[Math.floor(random() * templates.length)]}`,
            x: pos.x + (random() - 0.5) * 30,
            y: pos.y + (random() - 0.5) * 30,
            vector: nodeVector,
            semanticDomain: domain
        });
    }

    // Build bridge nodes
    const bridgeNodes = [];
    bridges.forEach(bridge => {
        bridge.planes.forEach(planeId => {
            const instance = bridge.instances[planeId];
            bridgeNodes.push({
                ...instance,
                plane: planeId,
                bridgeId: bridge.bridgeId,
                isBridge: true
            });
        });
    });

    const nodes = [...bridgeNodes, ...standaloneNodes];

    // Generate edges based on semantic similarity
    const edges = [];

    // Cross-layer edges for bridges (wormhole connections)
    bridges.forEach(bridge => {
        for (let i = 0; i < bridge.planes.length - 1; i++) {
            const sourcePlane = bridge.planes[i];
            const targetPlane = bridge.planes[i + 1];
            const source = bridge.instances[sourcePlane];
            const target = bridge.instances[targetPlane];

            edges.push({
                source: source.id,
                target: target.id,
                crossLayer: true,
                type: EDGE_TYPES_LIST[Math.floor(random() * 4)],
                description: `${source.label} connects to ${target.label}`,
                similarity: cosineSimilarity(source.vector, target.vector)
            });
        }
    });

    // Intra-plane edges
    planes.forEach(planeId => {
        const planeNodes = nodes.filter(n => n.plane === planeId);
        planeNodes.forEach(node => {
            const candidates = planeNodes.filter(n => n.id !== node.id);
            const similarities = candidates.map(candidate => ({
                node: candidate,
                similarity: cosineSimilarity(node.vector, candidate.vector)
            })).sort((a, b) => b.similarity - a.similarity);

            const numConnections = 1 + Math.floor(random() * 2);
            similarities.slice(0, numConnections).forEach(({ node: target, similarity }) => {
                if (similarity > 0.5 && random() < similarity) {
                    const exists = edges.some(e =>
                        (e.source === node.id && e.target === target.id) ||
                        (e.source === target.id && e.target === node.id && !e.crossLayer)
                    );
                    if (!exists) {
                        edges.push({
                            source: node.id,
                            target: target.id,
                            plane: planeId,
                            type: EDGE_TYPES_LIST[Math.floor(random() * EDGE_TYPES_LIST.length)],
                            description: `Semantic relation (similarity: ${(similarity * 100).toFixed(0)}%)`,
                            similarity
                        });
                    }
                }
            });
        });
    });

    // Build ancestor map
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

    return {
        nodes,
        edges,
        bridges,
        ancestorMap,
        metadata: {
            seed,
            generatedAt: new Date().toISOString(),
            stats: {
                totalNodes: nodes.length,
                bridgeNodes: bridgeNodes.length,
                standaloneNodes: standaloneNodes.length,
                totalEdges: edges.length,
                crossLayerEdges: edges.filter(e => e.crossLayer).length
            }
        }
    };
};

// ─────────────────────────────────────────────────────────────────────────────────
// 3D MATH
// ─────────────────────────────────────────────────────────────────────────────────

const project3Dto2D = (x, y, z, camera, canvas, scaling) => {
    const { position, rotation, fov } = camera;
    const { planeScale, layerScale } = scaling;

    const scaledX = x * planeScale;
    const scaledY = y * planeScale;
    const scaledZ = z * layerScale;

    const dx = scaledX - position.x;
    const dy = scaledY - position.y;
    const dz = scaledZ - position.z;

    const cosY = Math.cos(rotation.y);
    const sinY = Math.sin(rotation.y);
    const x1 = dx * cosY + dz * sinY;
    const z1 = -dx * sinY + dz * cosY;

    const cosX = Math.cos(rotation.x);
    const sinX = Math.sin(rotation.x);
    const y1 = dy * cosX - z1 * sinX;
    const z2 = dy * sinX + z1 * cosX;

    const perspective = fov;
    if (z2 <= 10) return null;

    const scale = perspective / z2;
    const screenX = canvas.width / 2 + x1 * scale;
    const screenY = canvas.height / 2 - y1 * scale;

    return { x: screenX, y: screenY, scale: Math.min(scale / 2, 2), z: z2 };
};

// ─────────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────────

const KnowledgePlanes = ({ externalData = null, projectId = null }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [data, setData] = useState(() => externalData || generateGraphData());
    const [graphSeed, setGraphSeed] = useState(Date.now());
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

    // Data source state
    const [dataSource, setDataSource] = useState('mock'); // 'mock' or 'database'
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);

    // Load data from database
    const loadFromDatabase = useCallback(async () => {
        setIsLoading(true);
        setLoadError(null);
        try {
            const dbData = await fetchKnowledgePlanesData(projectId, 200);
            if (dbData && dbData.nodes && dbData.nodes.length > 0) {
                setData(dbData);
                setDataSource('database');
            } else {
                setLoadError('No data found in database. Using mock data.');
                setData(generateGraphData());
                setDataSource('mock');
            }
        } catch (error) {
            console.error('Failed to load from database:', error);
            setLoadError(`Database error: ${error.message}. Using mock data.`);
            setData(generateGraphData());
            setDataSource('mock');
        } finally {
            setIsLoading(false);
        }
    }, [projectId]);

    // Generate mock data
    const regenerateGraph = useCallback(() => {
        const newSeed = Date.now();
        setGraphSeed(newSeed);
        setData(generateGraphData(newSeed));
        setDataSource('mock');
        setLoadError(null);
    }, []);

    // Update data when externalData prop changes
    useEffect(() => {
        if (externalData) {
            setData(externalData);
            setDataSource('external');
            setLoadError(null);
        }
    }, [externalData]);

    // Auto-load from database on mount if no external data provided
    useEffect(() => {
        if (!externalData) {
            loadFromDatabase();
        }
    }, [externalData, loadFromDatabase]);

    const DEFAULT_CAMERA = {
        position: { x: 0, y: 100, z: -900 },
        rotation: { x: 0.35, y: 0 },
        fov: 600
    };

    const [camera, setCamera] = useState({ ...DEFAULT_CAMERA });
    const [scaling, setScaling] = useState({
        planeScale: 1.0,
        layerScale: 1.0,
        nodeDistance: 1.0
    });

    const [navMode, setNavMode] = useState('orbit');
    const [keysPressed, setKeysPressed] = useState({});

    const [interaction, setInteraction] = useState({
        isDragging: false,
        mouseButton: 0,
        lastX: 0,
        lastY: 0,
        hoveredNode: null,
        hoveredEdge: null,
        selectedBridge: null
    });

    const [visiblePlanes, setVisiblePlanes] = useState({
        strategic: true,
        business: true,
        tasks: true,
        code: true,
        infrastructure: true
    });

    const [showWormholes, setShowWormholes] = useState(true);
    const [showControls, setShowControls] = useState(true);
    const [tooltip, setTooltip] = useState(null);
    const [orbitTarget, setOrbitTarget] = useState({ x: 0, y: 0, z: 0 });
    const [invertControls, setInvertControls] = useState(false);
    const [archFlyMode, setArchFlyMode] = useState(false);
    const [archFlySpeed, setArchFlySpeed] = useState(1.0);
    const [rightClickPivot, setRightClickPivot] = useState(null);

    const resetView = useCallback(() => {
        setCamera({ ...DEFAULT_CAMERA });
        setOrbitTarget({ x: 0, y: 0, z: 0 });
        setScaling({ planeScale: 1.0, layerScale: 1.0, nodeDistance: 1.0 });
        setArchFlyMode(false);
        setArchFlySpeed(1.0);
    }, []);

    // ─────────────────────────────────────────────────────────────────────────────
    // FULLSCREEN & RESIZE
    // ─────────────────────────────────────────────────────────────────────────────

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    }, []);

    const updateCanvasSize = useCallback(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            setCanvasSize({
                width: Math.floor(rect.width * dpr),
                height: Math.floor(rect.height * dpr)
            });
        }
    }, []);

    useEffect(() => {
        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
            setTimeout(updateCanvasSize, 100);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => {
            window.removeEventListener('resize', updateCanvasSize);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, [updateCanvasSize]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = canvasSize.width;
            canvas.height = canvasSize.height;
        }
    }, [canvasSize]);

    // ─────────────────────────────────────────────────────────────────────────────
    // FLYTHROUGH MOVEMENT
    // ─────────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (navMode !== 'flythrough') return;

        const baseSpeed = 10;
        const sprintMultiplier = 3;

        const interval = setInterval(() => {
            setCamera(prev => {
                const { position, rotation } = prev;
                const isShift = keysPressed['shift'];
                const moveSpeed = isShift ? baseSpeed * sprintMultiplier : baseSpeed;

                const cosX = Math.cos(rotation.x);
                const sinX = Math.sin(rotation.x);
                const cosY = Math.cos(rotation.y);
                const sinY = Math.sin(rotation.y);

                const forward = { x: -sinY * cosX, y: sinX, z: cosY * cosX };
                const right = { x: cosY, y: 0, z: sinY };
                const up = { x: sinY * sinX, y: cosX, z: -cosY * sinX };

                let dx = 0, dy = 0, dz = 0;

                if (keysPressed['w'] || keysPressed['arrowup']) {
                    dx += forward.x * moveSpeed; dy += forward.y * moveSpeed; dz += forward.z * moveSpeed;
                }
                if (keysPressed['s'] || keysPressed['arrowdown']) {
                    dx -= forward.x * moveSpeed; dy -= forward.y * moveSpeed; dz -= forward.z * moveSpeed;
                }
                if (keysPressed['a'] || keysPressed['arrowleft']) {
                    dx -= right.x * moveSpeed; dz -= right.z * moveSpeed;
                }
                if (keysPressed['d'] || keysPressed['arrowright']) {
                    dx += right.x * moveSpeed; dz += right.z * moveSpeed;
                }
                if (keysPressed[' ']) dy += moveSpeed;
                if (keysPressed['c'] || keysPressed['control']) dy -= moveSpeed;
                if (keysPressed['q']) {
                    dx += up.x * moveSpeed; dy += up.y * moveSpeed; dz += up.z * moveSpeed;
                }
                if (keysPressed['e']) {
                    dx -= up.x * moveSpeed; dy -= up.y * moveSpeed; dz -= up.z * moveSpeed;
                }
                if (keysPressed['r']) dy += moveSpeed;
                if (keysPressed['f']) dy -= moveSpeed;

                if (dx === 0 && dy === 0 && dz === 0) return prev;

                return {
                    ...prev,
                    position: { x: position.x + dx, y: position.y + dy, z: position.z + dz }
                };
            });
        }, 16);

        return () => clearInterval(interval);
    }, [navMode, keysPressed]);

    // ─────────────────────────────────────────────────────────────────────────────
    // ARCHICAD FLY MODE
    // ─────────────────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (navMode !== 'arch' || !archFlyMode) return;

        const baseSpeed = 8 * archFlySpeed;
        const shiftMultiplier = 3;

        const interval = setInterval(() => {
            setCamera(prev => {
                const { position, rotation } = prev;
                const isShift = keysPressed['shift'];
                const moveSpeed = isShift ? baseSpeed * shiftMultiplier : baseSpeed;

                const cosX = Math.cos(rotation.x);
                const sinX = Math.sin(rotation.x);
                const cosY = Math.cos(rotation.y);
                const sinY = Math.sin(rotation.y);

                const forward = { x: -sinY * cosX, y: sinX, z: cosY * cosX };
                const right = { x: cosY, y: 0, z: sinY };

                let dx = 0, dy = 0, dz = 0;

                if (keysPressed['w'] || keysPressed['arrowup']) {
                    dx += forward.x * moveSpeed; dy += forward.y * moveSpeed; dz += forward.z * moveSpeed;
                }
                if (keysPressed['s'] || keysPressed['arrowdown']) {
                    dx -= forward.x * moveSpeed; dy -= forward.y * moveSpeed; dz -= forward.z * moveSpeed;
                }
                if (keysPressed['a'] || keysPressed['arrowleft']) {
                    dx -= right.x * moveSpeed; dz -= right.z * moveSpeed;
                }
                if (keysPressed['d'] || keysPressed['arrowright']) {
                    dx += right.x * moveSpeed; dz += right.z * moveSpeed;
                }
                if (keysPressed['pageup'] || keysPressed[' ']) dy += moveSpeed;
                if (keysPressed['pagedown'] || keysPressed['c']) dy -= moveSpeed;

                if (dx === 0 && dy === 0 && dz === 0) return prev;

                return {
                    ...prev,
                    position: { x: position.x + dx, y: position.y + dy, z: position.z + dz }
                };
            });
        }, 16);

        return () => clearInterval(interval);
    }, [navMode, archFlyMode, archFlySpeed, keysPressed]);

    // ─────────────────────────────────────────────────────────────────────────────
    // DRAWING FUNCTIONS
    // ─────────────────────────────────────────────────────────────────────────────

    const drawGrid = (ctx, width, height) => {
        const gridSize = 50;
        ctx.strokeStyle = '#0a1628';
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        for (let y = 0; y < height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
    };

    const drawPlane = (ctx, planeConfig, camera, canvas, scaling) => {
        const basePlaneSize = 220;
        const nd = scaling.nodeDistance || 1.0;
        const planeSizeFactor = Math.pow(nd, 0.7);
        const planeSize = basePlaneSize * planeSizeFactor;
        const z = planeConfig.z;
        const corners = [
            { x: -planeSize, y: -planeSize * 0.6, z },
            { x: planeSize, y: -planeSize * 0.6, z },
            { x: planeSize, y: planeSize * 0.6, z },
            { x: -planeSize, y: planeSize * 0.6, z }
        ];

        const projected = corners.map(c => project3Dto2D(c.x, c.y, c.z, camera, canvas, scaling));
        if (projected.some(p => !p)) return;

        ctx.save();

        ctx.beginPath();
        ctx.moveTo(projected[0].x, projected[0].y);
        projected.forEach(p => ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.fillStyle = `${planeConfig.color}0a`;
        ctx.fill();
        ctx.strokeStyle = `${planeConfig.color}aa`;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Grid lines
        ctx.strokeStyle = `${planeConfig.color}15`;
        ctx.lineWidth = 1;
        const gridStep = 44;
        const gridCount = Math.ceil(planeSize / gridStep);
        for (let gi = -gridCount; gi <= gridCount; gi++) {
            const i = gi * gridStep;
            const v1 = project3Dto2D(i, -planeSize * 0.6, z, camera, canvas, scaling);
            const v2 = project3Dto2D(i, planeSize * 0.6, z, camera, canvas, scaling);
            if (v1 && v2) {
                ctx.beginPath();
                ctx.moveTo(v1.x, v1.y);
                ctx.lineTo(v2.x, v2.y);
                ctx.stroke();
            }
        }

        // Label
        const labelPos = project3Dto2D(-planeSize + 15, -planeSize * 0.6 + 20, z, camera, canvas, scaling);
        if (labelPos) {
            ctx.font = `bold ${Math.max(10, 12 * labelPos.scale)}px "Courier New", monospace`;
            ctx.fillStyle = planeConfig.color;
            ctx.fillText(`${planeConfig.icon} ${planeConfig.name.toUpperCase()}`, labelPos.x, labelPos.y);
        }

        ctx.restore();
    };

    const drawWormhole = (ctx, sourceNode, targetNode, camera, canvas, scaling, isHighlighted) => {
        const { throatRadius, flareFactor, meridians, parallels } = WORMHOLE_CONFIG;
        const nd = scaling.nodeDistance || 1.0;

        const sourceZ = PLANES_CONFIG[sourceNode.plane].z;
        const targetZ = PLANES_CONFIG[targetNode.plane].z;

        const srcX = sourceNode.x * nd;
        const srcY = sourceNode.y * nd;
        const tgtX = targetNode.x * nd;
        const tgtY = targetNode.y * nd;

        const lineColor = isHighlighted ? '#ffcc44' : '#8899aa';
        const lineWidth = isHighlighted ? 1.5 : 0.7;

        ctx.save();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;

        const b = throatRadius;
        const maxL = flareFactor;

        const mesh = [];
        for (let vi = 0; vi <= parallels; vi++) {
            const t = vi / parallels;
            const z = sourceZ + (targetZ - sourceZ) * t;
            const l = (t - 0.5) * 2 * maxL;
            const radius = b * Math.cosh(l);

            const px = srcX + (tgtX - srcX) * t;
            const py = srcY + (tgtY - srcY) * t;

            const ring = [];
            for (let ui = 0; ui <= meridians; ui++) {
                const angle = (ui / meridians) * Math.PI * 2;
                const wx = px + Math.cos(angle) * radius;
                const wy = py + Math.sin(angle) * radius;
                const projected = project3Dto2D(wx, wy, z, camera, canvas, scaling);
                if (projected) ring.push(projected);
            }
            if (ring.length > 0) mesh.push(ring);
        }

        // Draw rings
        mesh.forEach(ring => {
            ctx.beginPath();
            ring.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
            ctx.stroke();
        });

        // Draw meridians
        for (let ui = 0; ui < meridians; ui += 2) {
            ctx.beginPath();
            mesh.forEach((ring, vi) => {
                if (ring[ui]) {
                    vi === 0 ? ctx.moveTo(ring[ui].x, ring[ui].y) : ctx.lineTo(ring[ui].x, ring[ui].y);
                }
            });
            ctx.stroke();
        }

        ctx.restore();
    };

    const drawEdge = (ctx, edge, nodes, camera, canvas, scaling, isHighlighted, isHovered) => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        if (!sourceNode || !targetNode) return null;

        const sourceZ = PLANES_CONFIG[sourceNode.plane].z;
        const targetZ = PLANES_CONFIG[targetNode.plane].z;

        const nd = scaling.nodeDistance || 1.0;
        const start = project3Dto2D(sourceNode.x * nd, sourceNode.y * nd, sourceZ, camera, canvas, scaling);
        const end = project3Dto2D(targetNode.x * nd, targetNode.y * nd, targetZ, camera, canvas, scaling);
        if (!start || !end) return null;

        const edgeType = EDGE_TYPES[edge.type] || { label: edge.type };

        ctx.save();

        const baseWidth = isHighlighted ? 4 : (isHovered ? 3 : 2);
        const alpha = isHighlighted ? 'dd' : (isHovered ? 'bb' : '80');

        if (edge.crossLayer) {
            const gradient = ctx.createLinearGradient(start.x, start.y, end.x, end.y);
            const sourceColor = PLANES_CONFIG[sourceNode.plane].color;
            const targetColor = PLANES_CONFIG[targetNode.plane].color;
            gradient.addColorStop(0, sourceColor + alpha);
            gradient.addColorStop(1, targetColor + alpha);
            ctx.strokeStyle = gradient;
        } else {
            const color = isHighlighted ? '#ffaa00' : PLANES_CONFIG[edge.plane].color;
            ctx.strokeStyle = color + alpha;
        }

        ctx.lineWidth = baseWidth;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();

        // Arrow head
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const arrowSize = 8 + baseWidth;
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - arrowSize * Math.cos(angle - 0.4), end.y - arrowSize * Math.sin(angle - 0.4));
        ctx.lineTo(end.x - arrowSize * Math.cos(angle + 0.4), end.y - arrowSize * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle;
        ctx.fill();

        ctx.restore();

        return {
            edge,
            start,
            end,
            midX: (start.x + end.x) / 2,
            midY: (start.y + end.y) / 2,
            description: edge.description,
            type: edgeType
        };
    };

    const drawNode = (ctx, node, camera, canvas, scaling, isHovered, isSelected, isAncestorHighlighted) => {
        const planeConfig = PLANES_CONFIG[node.plane];
        const z = PLANES_CONFIG[node.plane].z;
        const nodeX = node.x * (scaling.nodeDistance || 1.0);
        const nodeY = node.y * (scaling.nodeDistance || 1.0);
        const projected = project3Dto2D(nodeX, nodeY, z, camera, canvas, scaling);
        if (!projected) return null;

        const { x, y, scale } = projected;
        const baseRadius = node.isBridge ? 12 : 8;
        const radius = baseRadius * Math.min(scale, 1.5);

        ctx.save();

        // Glow for highlighted/selected
        if (isHovered || isSelected || isAncestorHighlighted) {
            const glowRadius = radius * 3;
            const gradient = ctx.createRadialGradient(x, y, radius * 0.5, x, y, glowRadius);
            const glowColor = isAncestorHighlighted ? '#ffaa00' : planeConfig.color;
            gradient.addColorStop(0, glowColor + '60');
            gradient.addColorStop(1, 'transparent');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.translate(x, y);

        const fillColor = isAncestorHighlighted ? '#ffaa0050' : `${planeConfig.nodeColor}40`;
        const strokeColor = isAncestorHighlighted ? '#ffaa00' : (isSelected ? planeConfig.color : `${planeConfig.color}cc`);
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = (node.isBridge ? 2.5 : 2) * Math.min(scale, 1);

        // Draw shape based on plane
        ctx.beginPath();
        if (node.plane === 'strategic') {
            for (let i = 0; i < 6; i++) {
                const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
        } else if (node.plane === 'business') {
            ctx.moveTo(0, -radius);
            ctx.lineTo(radius, 0);
            ctx.lineTo(0, radius);
            ctx.lineTo(-radius, 0);
            ctx.closePath();
        } else if (node.plane === 'tasks') {
            const r = radius * 0.85;
            ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.25);
        } else if (node.plane === 'code') {
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
        } else {
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2 - Math.PI / 8;
                const px = Math.cos(angle) * radius;
                const py = Math.sin(angle) * radius;
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.closePath();
        }

        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Label
        if (scale > 0.3) {
            ctx.save();
            ctx.font = `${Math.max(9, 11 * scale)}px "Courier New", monospace`;
            ctx.fillStyle = isAncestorHighlighted ? '#ffaa00' : `${planeConfig.color}cc`;
            ctx.textAlign = 'center';
            ctx.fillText(node.label, x, y + radius + 14 * scale);
            ctx.restore();
        }

        return { node, x, y, radius, projected };
    };

    const drawHUD = (ctx, width, height) => {
        ctx.save();

        ctx.fillStyle = '#05d9e8';
        ctx.font = 'bold 14px "Courier New", monospace';
        ctx.fillText('// KNOWLEDGE_PLANES v6.19', 15, 25);

        ctx.font = '9px "Courier New", monospace';
        ctx.fillStyle = '#666';
        ctx.fillText(`MODE: ${NAV_MODES[navMode].name.toUpperCase()}`, 15, 42);

        if (navMode === 'flythrough') {
            ctx.fillStyle = '#01ffc3';
            ctx.fillText('W/S: fly toward/away | A/D: strafe | Space/C: up/down | Shift: boost', 15, 56);
        } else if (navMode === 'orbit') {
            ctx.fillText('Drag: orbit around nearest element | Scroll: zoom | R: reset', 15, 56);
        } else if (navMode === 'arch') {
            ctx.fillStyle = '#ff9500';
            if (archFlyMode) {
                ctx.fillText(`FLY MODE (speed: ${archFlySpeed.toFixed(1)}x) | WASD: move | Space/C: lift | Shift: boost`, 15, 56);
                ctx.fillStyle = '#01ffc3';
                ctx.fillText('F: exit fly | +/-: speed | ESC: exit', 15, 70);
            } else {
                ctx.fillText('Scroll: zoom | MMB: pan | MMB+Shift: orbit | RMB: rotate | F: fly', 15, 56);
            }
        } else {
            ctx.fillText('Drag: pan view | Scroll: zoom | R: reset', 15, 56);
        }

        // Stats
        ctx.textAlign = 'right';
        ctx.fillStyle = '#444';
        ctx.fillText(`Nodes: ${data.nodes.length}`, width - 15, 25);
        ctx.fillText(`Edges: ${data.edges.length}`, width - 15, 40);
        if (data.metadata) {
            ctx.fillText(`Bridges: ${data.bridges.length}`, width - 15, 55);
            ctx.fillStyle = '#333';
            ctx.fillText(`Seed: ${data.metadata.seed}`, width - 15, 70);
        }
        ctx.textAlign = 'left';

        if (isFullscreen) {
            ctx.fillStyle = '#01ffc3';
            ctx.fillText('◉ FULLSCREEN', 15, height - 15);
        }

        ctx.restore();
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // RENDER
    // ─────────────────────────────────────────────────────────────────────────────

    const render = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.fillStyle = '#030810';
        ctx.fillRect(0, 0, width, height);
        drawGrid(ctx, width, height);

        // Get highlighted ancestors
        const highlightedNodes = new Set();
        const highlightedEdges = new Set();

        if (interaction.hoveredNode) {
            const ancestors = data.ancestorMap[interaction.hoveredNode] || [];
            ancestors.forEach(a => highlightedNodes.add(a.nodeId));

            data.edges.forEach(edge => {
                if (ancestors.some(a => a.nodeId === edge.source) &&
                    (edge.target === interaction.hoveredNode || ancestors.some(a => a.nodeId === edge.target))) {
                    highlightedEdges.add(edge);
                }
                if (edge.target === interaction.hoveredNode) {
                    highlightedEdges.add(edge);
                }
            });
        }

        // Sort planes by depth
        const planeOrder = Object.values(PLANES_CONFIG)
            .filter(p => visiblePlanes[p.id])
            .map(p => {
                const projected = project3Dto2D(0, 0, p.z, camera, canvas, scaling);
                return { ...p, depth: projected ? projected.z : 0 };
            })
            .sort((a, b) => b.depth - a.depth);

        // Draw planes
        planeOrder.forEach(p => drawPlane(ctx, p, camera, canvas, scaling));

        // Draw wormholes
        if (showWormholes) {
            data.edges.filter(e => e.crossLayer).forEach(edge => {
                const sourceNode = data.nodes.find(n => n.id === edge.source);
                const targetNode = data.nodes.find(n => n.id === edge.target);
                if (sourceNode && targetNode && visiblePlanes[sourceNode.plane] && visiblePlanes[targetNode.plane]) {
                    const isHighlighted = highlightedEdges.has(edge);
                    drawWormhole(ctx, sourceNode, targetNode, camera, canvas, scaling, isHighlighted);
                }
            });
        }

        // Draw edges
        const edgeBounds = [];
        data.edges.forEach(edge => {
            if (edge.crossLayer) return;
            if (!visiblePlanes[edge.plane]) return;

            const isHighlighted = highlightedEdges.has(edge);
            const isHovered = interaction.hoveredEdge === edge;
            const bounds = drawEdge(ctx, edge, data.nodes, camera, canvas, scaling, isHighlighted, isHovered);
            if (bounds) edgeBounds.push(bounds);
        });

        // Draw nodes
        const nodeBounds = [];
        const sortedNodes = [...data.nodes]
            .filter(n => visiblePlanes[n.plane])
            .map(n => {
                const z = PLANES_CONFIG[n.plane].z;
                const projected = project3Dto2D(n.x, n.y, z, camera, canvas, scaling);
                return { ...n, depth: projected ? projected.z : 0 };
            })
            .sort((a, b) => b.depth - a.depth);

        sortedNodes.forEach(node => {
            const isSelected = interaction.selectedBridge && node.bridgeId === interaction.selectedBridge;
            const isHovered = interaction.hoveredNode === node.id;
            const isAncestor = highlightedNodes.has(node.id);
            const bounds = drawNode(ctx, node, camera, canvas, scaling, isHovered, isSelected, isAncestor);
            if (bounds) nodeBounds.push(bounds);
        });

        drawHUD(ctx, width, height);

        // Store bounds for hit testing
        canvasRef.current._nodeBounds = nodeBounds;
        canvasRef.current._edgeBounds = edgeBounds;

    }, [camera, data, visiblePlanes, showWormholes, interaction, scaling, isFullscreen, navMode, archFlyMode, archFlySpeed]);

    // ─────────────────────────────────────────────────────────────────────────────
    // EVENT HANDLERS
    // ─────────────────────────────────────────────────────────────────────────────

    const handleMouseDown = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const mouseX = (e.clientX - rect.left) * scaleX;
        const mouseY = (e.clientY - rect.top) * scaleY;

        if (navMode === 'arch' && e.button === 2) {
            const nodeBounds = canvas._nodeBounds || [];
            let hoveredNode = null;

            for (const { node, x: nx, y: ny, radius } of nodeBounds) {
                if (Math.hypot(mouseX - nx, mouseY - ny) < radius + 5) {
                    hoveredNode = node;
                    break;
                }
            }

            if (hoveredNode) {
                const nodeZ = PLANES_CONFIG[hoveredNode.plane].z;
                setRightClickPivot({
                    x: hoveredNode.x * scaling.planeScale,
                    y: hoveredNode.y * scaling.planeScale,
                    z: nodeZ * scaling.layerScale,
                    type: 'node',
                    label: hoveredNode.label
                });
            } else {
                setRightClickPivot({ x: 0, y: 0, z: 0, type: 'model', label: 'Model Center' });
            }
        }

        setInteraction(prev => ({
            ...prev,
            isDragging: true,
            mouseButton: e.button,
            lastX: mouseX,
            lastY: mouseY
        }));
    };

    const handleMouseMove = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (interaction.isDragging) {
            const deltaX = x - interaction.lastX;
            const deltaY = y - interaction.lastY;
            const inv = invertControls ? -1 : 1;

            if (navMode === 'orbit') {
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const nodeBounds = canvas._nodeBounds || [];

                let nearestNode = null;
                let nearestDist = Infinity;

                for (const { node, x: nx, y: ny } of nodeBounds) {
                    const dist = Math.hypot(nx - centerX, ny - centerY);
                    if (dist < nearestDist) {
                        nearestDist = dist;
                        nearestNode = node;
                    }
                }

                let targetPos = orbitTarget;
                if (nearestNode) {
                    const nodeZ = PLANES_CONFIG[nearestNode.plane].z;
                    targetPos = {
                        x: nearestNode.x * scaling.planeScale,
                        y: nearestNode.y * scaling.planeScale,
                        z: nodeZ * scaling.layerScale
                    };
                    if (Math.hypot(targetPos.x - orbitTarget.x, targetPos.y - orbitTarget.y, targetPos.z - orbitTarget.z) > 1) {
                        setOrbitTarget(targetPos);
                    }
                }

                setCamera(prev => {
                    const dx = prev.position.x - targetPos.x;
                    const dy = prev.position.y - targetPos.y;
                    const dz = prev.position.z - targetPos.z;
                    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                    const newRotX = Math.max(-1.4, Math.min(1.4, prev.rotation.x - deltaY * 0.005 * inv));
                    const newRotY = prev.rotation.y - deltaX * 0.005 * inv;

                    const cosElevation = Math.cos(newRotX);
                    const sinElevation = Math.sin(newRotX);
                    const cosAzimuth = Math.cos(newRotY);
                    const sinAzimuth = Math.sin(newRotY);

                    const newPosition = {
                        x: targetPos.x + distance * sinAzimuth * cosElevation,
                        y: targetPos.y + distance * sinElevation,
                        z: targetPos.z - distance * cosAzimuth * cosElevation
                    };

                    return {
                        ...prev,
                        rotation: { x: newRotX, y: newRotY },
                        position: newPosition
                    };
                });
            } else if (navMode === 'pan') {
                setCamera(prev => ({
                    ...prev,
                    position: {
                        ...prev.position,
                        x: prev.position.x + deltaX * 0.5 * inv,
                        y: prev.position.y - deltaY * 0.5 * inv
                    }
                }));
            } else if (navMode === 'flythrough') {
                setCamera(prev => ({
                    ...prev,
                    rotation: {
                        x: Math.max(-1.5, Math.min(1.5, prev.rotation.x + deltaY * 0.002 * inv)),
                        y: prev.rotation.y + deltaX * 0.002 * inv
                    }
                }));
            } else if (navMode === 'arch') {
                const isMiddleButton = interaction.mouseButton === 1;
                const isShiftHeld = keysPressed['shift'];

                if (isMiddleButton && isShiftHeld) {
                    setCamera(prev => {
                        const dx = prev.position.x - orbitTarget.x;
                        const dy = prev.position.y - orbitTarget.y;
                        const dz = prev.position.z - orbitTarget.z;
                        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                        const newRotX = Math.max(-1.4, Math.min(1.4, prev.rotation.x - deltaY * 0.005 * inv));
                        const newRotY = prev.rotation.y - deltaX * 0.005 * inv;

                        const cosElevation = Math.cos(newRotX);
                        const sinElevation = Math.sin(newRotX);
                        const cosAzimuth = Math.cos(newRotY);
                        const sinAzimuth = Math.sin(newRotY);

                        return {
                            ...prev,
                            rotation: { x: newRotX, y: newRotY },
                            position: {
                                x: orbitTarget.x + distance * sinAzimuth * cosElevation,
                                y: orbitTarget.y + distance * sinElevation,
                                z: orbitTarget.z - distance * cosAzimuth * cosElevation
                            }
                        };
                    });
                } else if (isMiddleButton) {
                    setCamera(prev => ({
                        ...prev,
                        position: {
                            ...prev.position,
                            x: prev.position.x + deltaX * 0.5 * inv,
                            y: prev.position.y - deltaY * 0.5 * inv
                        }
                    }));
                } else if (archFlyMode) {
                    setCamera(prev => ({
                        ...prev,
                        rotation: {
                            x: Math.max(-1.5, Math.min(1.5, prev.rotation.x + deltaY * 0.003 * inv)),
                            y: prev.rotation.y + deltaX * 0.003 * inv
                        }
                    }));
                } else if (interaction.mouseButton === 2 && rightClickPivot) {
                    setCamera(prev => {
                        const pivotX = rightClickPivot.x;
                        const pivotY = rightClickPivot.y;
                        const pivotZ = rightClickPivot.z;

                        const dx = prev.position.x - pivotX;
                        const dy = prev.position.y - pivotY;
                        const dz = prev.position.z - pivotZ;
                        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

                        const currentAzimuth = Math.atan2(dx, -dz);
                        const horizontalDist = Math.sqrt(dx * dx + dz * dz);
                        const currentElevation = Math.atan2(dy, horizontalDist);

                        const newAzimuth = currentAzimuth - deltaX * 0.005 * inv;
                        const newElevation = Math.max(-1.4, Math.min(1.4, currentElevation - deltaY * 0.005 * inv));

                        const cosElev = Math.cos(newElevation);
                        const sinElev = Math.sin(newElevation);
                        const cosAzi = Math.cos(newAzimuth);
                        const sinAzi = Math.sin(newAzimuth);

                        const newPosition = {
                            x: pivotX + distance * sinAzi * cosElev,
                            y: pivotY + distance * sinElev,
                            z: pivotZ - distance * cosAzi * cosElev
                        };

                        const lookDx = pivotX - newPosition.x;
                        const lookDy = pivotY - newPosition.y;
                        const lookDz = pivotZ - newPosition.z;
                        const lookHorizDist = Math.sqrt(lookDx * lookDx + lookDz * lookDz);

                        const newRotY = Math.atan2(-lookDx, lookDz);
                        const newRotX = Math.atan2(lookDy, lookHorizDist);

                        return {
                            ...prev,
                            position: newPosition,
                            rotation: { x: newRotX, y: newRotY }
                        };
                    });
                }
            }

            setInteraction(prev => ({ ...prev, lastX: x, lastY: y }));
        } else {
            // Hit testing for nodes
            const nodeBounds = canvas._nodeBounds || [];
            let hoveredNode = null;

            for (const { node, x: nx, y: ny, radius } of nodeBounds) {
                if (Math.hypot(x - nx, y - ny) < radius + 5) {
                    hoveredNode = node.id;
                    break;
                }
            }

            // Hit testing for edges
            const edgeBounds = canvas._edgeBounds || [];
            let hoveredEdge = null;

            if (!hoveredNode) {
                for (const { edge, start, end } of edgeBounds) {
                    const A = x - start.x;
                    const B = y - start.y;
                    const C = end.x - start.x;
                    const D = end.y - start.y;
                    const dot = A * C + B * D;
                    const lenSq = C * C + D * D;
                    const param = lenSq !== 0 ? dot / lenSq : -1;

                    let xx, yy;
                    if (param < 0) { xx = start.x; yy = start.y; }
                    else if (param > 1) { xx = end.x; yy = end.y; }
                    else { xx = start.x + param * C; yy = start.y + param * D; }

                    const dist = Math.hypot(x - xx, y - yy);
                    if (dist < 10) {
                        hoveredEdge = edge;
                        setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            edge: edge,
                            type: EDGE_TYPES[edge.type] || { label: edge.type }
                        });
                        break;
                    }
                }
            }

            if (!hoveredEdge) setTooltip(null);
            setInteraction(prev => ({ ...prev, hoveredNode, hoveredEdge }));
        }
    };

    const handleMouseUp = () => {
        setInteraction(prev => ({ ...prev, isDragging: false }));
        setRightClickPivot(null);
    };

    const handleWheel = (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

        if (navMode === 'flythrough') {
            setCamera(prev => ({
                ...prev,
                fov: Math.max(200, Math.min(1200, prev.fov * zoomFactor))
            }));
        } else {
            setCamera(prev => {
                const dx = prev.position.x - orbitTarget.x;
                const dy = prev.position.y - orbitTarget.y;
                const dz = prev.position.z - orbitTarget.z;
                const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
                const newDistance = Math.max(100, Math.min(3000, distance * zoomFactor));
                const scale = newDistance / distance;

                return {
                    ...prev,
                    position: {
                        x: orbitTarget.x + dx * scale,
                        y: orbitTarget.y + dy * scale,
                        z: orbitTarget.z + dz * scale
                    }
                };
            });
        }
    };

    const handleKeyDown = useCallback((e) => {
        const key = e.key.toLowerCase();

        if (navMode === 'flythrough' && (key === 'r' || key === 'f')) {
            setKeysPressed(prev => ({ ...prev, [key]: true }));
            return;
        }

        if (navMode === 'arch' && archFlyMode && (key === 'c' || key === ' ' || key === 'pageup' || key === 'pagedown')) {
            setKeysPressed(prev => ({ ...prev, [key]: true }));
            e.preventDefault();
            return;
        }

        setKeysPressed(prev => ({ ...prev, [key]: true }));

        if (key === 'f') {
            if (navMode === 'arch') {
                setArchFlyMode(prev => !prev);
            } else if (navMode !== 'flythrough') {
                toggleFullscreen();
            }
        }

        if (navMode === 'arch' && archFlyMode) {
            if (key === '+' || key === '=') setArchFlySpeed(prev => Math.min(5.0, prev + 0.5));
            if (key === '-' || key === '_') setArchFlySpeed(prev => Math.max(0.5, prev - 0.5));
        }

        if (key === 'h') setShowControls(prev => !prev);
        if (key === 'i') setInvertControls(prev => !prev);
        if (key === 'g') regenerateGraph();
        if (key === '1') { setNavMode('orbit'); setArchFlyMode(false); }
        if (key === '2') { setNavMode('pan'); setArchFlyMode(false); }
        if (key === '3') { setNavMode('flythrough'); setArchFlyMode(false); }
        if (key === '4') setNavMode('arch');
        if (key === 'r' && navMode !== 'flythrough' && !(navMode === 'arch' && archFlyMode)) resetView();
        if (key === '0') resetView();
        if (key === 'escape') {
            if (archFlyMode) setArchFlyMode(false);
            else if (isFullscreen) document.exitFullscreen();
        }
    }, [toggleFullscreen, isFullscreen, navMode, resetView, archFlyMode, regenerateGraph]);

    const handleKeyUp = useCallback((e) => {
        const key = e.key.toLowerCase();
        setKeysPressed(prev => ({ ...prev, [key]: false }));
    }, []);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    useEffect(() => {
        let frameId;
        const animate = () => {
            render();
            frameId = requestAnimationFrame(animate);
        };
        animate();
        return () => cancelAnimationFrame(frameId);
    }, [render]);

    // ─────────────────────────────────────────────────────────────────────────────
    // UI
    // ─────────────────────────────────────────────────────────────────────────────

    return (
        <Box
            ref={containerRef}
            sx={{
                width: '100%',
                height: '100%',
                bgcolor: '#030810',
                overflow: 'hidden',
                position: 'relative',
                fontFamily: '"Courier New", monospace'
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    cursor: 'crosshair'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => {
                    setInteraction(prev => ({ ...prev, isDragging: false, hoveredNode: null, hoveredEdge: null }));
                    setTooltip(null);
                }}
                onWheel={handleWheel}
                onContextMenu={(e) => e.preventDefault()}
                tabIndex={0}
            />

            {/* Tooltip for edges */}
            {tooltip && (
                <Paper
                    elevation={8}
                    sx={{
                        position: 'absolute',
                        pointerEvents: 'none',
                        zIndex: 50,
                        px: 1.5,
                        py: 1,
                        left: tooltip.x + 15,
                        top: tooltip.y + 15,
                        bgcolor: 'rgba(5, 10, 20, 0.95)',
                        border: '1px solid #05d9e8',
                        maxWidth: 280
                    }}
                >
                    <Typography variant="caption" sx={{ color: '#05d9e8', fontWeight: 'bold', display: 'block' }}>
                        {tooltip.type.label}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#aaa', mt: 0.5, display: 'block' }}>
                        {tooltip.edge.description}
                    </Typography>
                </Paper>
            )}

            {/* Control Panel */}
            {showControls && (
                <Paper
                    elevation={4}
                    sx={{
                        position: 'absolute',
                        top: 16,
                        left: 16,
                        p: 1.5,
                        width: 220,
                        bgcolor: 'rgba(5, 10, 20, 0.9)',
                        border: '1px solid rgba(5, 217, 232, 0.2)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 10
                    }}
                >
                    {/* Navigation Mode */}
                    <Typography variant="caption" sx={{ color: '#05d9e8', fontWeight: 'bold', display: 'block', mb: 1 }}>
                        // NAVIGATION
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                        {Object.values(NAV_MODES).map((mode, i) => (
                            <Chip
                                key={mode.id}
                                label={mode.name}
                                size="small"
                                onClick={() => setNavMode(mode.id)}
                                sx={{
                                    bgcolor: navMode === mode.id ? '#05d9e8' : 'transparent',
                                    color: navMode === mode.id ? '#030810' : '#05d9e8',
                                    border: `1px solid ${navMode === mode.id ? '#05d9e8' : '#333'}`,
                                    fontSize: '0.65rem',
                                    height: 22,
                                    '&:hover': { bgcolor: navMode === mode.id ? '#05d9e8' : 'rgba(5, 217, 232, 0.1)' }
                                }}
                            />
                        ))}
                    </Box>

                    <FormControlLabel
                        control={
                            <Switch
                                checked={invertControls}
                                onChange={() => setInvertControls(prev => !prev)}
                                size="small"
                                sx={{ '& .MuiSwitch-thumb': { bgcolor: invertControls ? '#ff9500' : '#666' } }}
                            />
                        }
                        label={<Typography variant="caption" sx={{ color: invertControls ? '#ff9500' : '#666' }}>Invert</Typography>}
                        sx={{ ml: 0, mb: 1 }}
                    />

                    {/* Layers */}
                    <Typography variant="caption" sx={{ color: '#05d9e8', fontWeight: 'bold', display: 'block', mb: 1 }}>
                        // LAYERS
                    </Typography>
                    {Object.values(PLANES_CONFIG).map(plane => (
                        <FormControlLabel
                            key={plane.id}
                            control={
                                <Switch
                                    checked={visiblePlanes[plane.id]}
                                    onChange={() => setVisiblePlanes(prev => ({ ...prev, [plane.id]: !prev[plane.id] }))}
                                    size="small"
                                    sx={{ '& .MuiSwitch-thumb': { bgcolor: visiblePlanes[plane.id] ? plane.color : '#333' } }}
                                />
                            }
                            label={
                                <Typography variant="caption" sx={{ color: plane.color }}>
                                    {plane.icon} {plane.name}
                                </Typography>
                            }
                            sx={{ ml: 0, display: 'flex', mb: 0.5 }}
                        />
                    ))}

                    <FormControlLabel
                        control={
                            <Switch
                                checked={showWormholes}
                                onChange={() => setShowWormholes(prev => !prev)}
                                size="small"
                            />
                        }
                        label={<Typography variant="caption" sx={{ color: '#888' }}>⟁ Wormholes</Typography>}
                        sx={{ ml: 0, mt: 0.5, mb: 1 }}
                    />

                    {/* Scaling */}
                    <Box sx={{ borderTop: '1px solid #333', pt: 1, mt: 1 }}>
                        <Typography variant="caption" sx={{ color: '#05d9e8', fontWeight: 'bold', display: 'block', mb: 1 }}>
                            // SCALING
                        </Typography>

                        <Box sx={{ mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ color: '#666' }}>Plane Scale</Typography>
                                <Typography variant="caption" sx={{ color: '#05d9e8' }}>{scaling.planeScale.toFixed(1)}x</Typography>
                            </Box>
                            <Slider
                                value={scaling.planeScale}
                                onChange={(e, v) => setScaling(prev => ({ ...prev, planeScale: v }))}
                                min={0.5}
                                max={3}
                                step={0.1}
                                size="small"
                                sx={{ color: '#05d9e8', py: 0 }}
                            />
                        </Box>

                        <Box sx={{ mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ color: '#666' }}>Layer Distance</Typography>
                                <Typography variant="caption" sx={{ color: '#05d9e8' }}>{scaling.layerScale.toFixed(1)}x</Typography>
                            </Box>
                            <Slider
                                value={scaling.layerScale}
                                onChange={(e, v) => setScaling(prev => ({ ...prev, layerScale: v }))}
                                min={0.5}
                                max={3}
                                step={0.1}
                                size="small"
                                sx={{ color: '#05d9e8', py: 0 }}
                            />
                        </Box>

                        <Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="caption" sx={{ color: '#666' }}>Node Distance</Typography>
                                <Typography variant="caption" sx={{ color: '#ff9500' }}>{scaling.nodeDistance.toFixed(1)}x</Typography>
                            </Box>
                            <Slider
                                value={scaling.nodeDistance}
                                onChange={(e, v) => setScaling(prev => ({ ...prev, nodeDistance: v }))}
                                min={0.3}
                                max={3}
                                step={0.1}
                                size="small"
                                sx={{ color: '#ff9500', py: 0 }}
                            />
                        </Box>
                    </Box>

                    {/* Keyboard hints */}
                    <Box sx={{ borderTop: '1px solid #333', pt: 1, mt: 1 }}>
                        <Typography variant="caption" sx={{ color: '#555', display: 'block' }}>
                            F: fullscreen | H: hide UI
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#555', display: 'block' }}>
                            1/2/3/4: nav mode | R: reset
                        </Typography>
                    </Box>
                </Paper>
            )}

            {/* Top-right buttons */}
            <Box sx={{ position: 'absolute', top: 16, right: 16, display: 'flex', gap: 1, zIndex: 10 }}>
                {/* Data source indicator */}
                <Chip
                    icon={
                        dataSource === 'database' ? <Storage sx={{ fontSize: 14 }} /> :
                        dataSource === 'external' ? <FolderSpecial sx={{ fontSize: 14 }} /> :
                        <Refresh sx={{ fontSize: 14 }} />
                    }
                    label={
                        dataSource === 'database' ? 'DB' :
                        dataSource === 'external' ? 'Catalog' :
                        'Mock'
                    }
                    size="small"
                    sx={{
                        bgcolor:
                            dataSource === 'database' ? 'rgba(1, 255, 195, 0.15)' :
                            dataSource === 'external' ? 'rgba(5, 217, 232, 0.15)' :
                            'rgba(255, 149, 0, 0.15)',
                        color:
                            dataSource === 'database' ? '#01ffc3' :
                            dataSource === 'external' ? '#05d9e8' :
                            '#ff9500',
                        border: `1px solid ${
                            dataSource === 'database' ? '#01ffc3' :
                            dataSource === 'external' ? '#05d9e8' :
                            '#ff9500'
                        }33`,
                        height: 28,
                        '& .MuiChip-icon': { color: 'inherit' }
                    }}
                />

                <Tooltip title="Load from Knowledge Base">
                    <IconButton
                        onClick={loadFromDatabase}
                        disabled={isLoading}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(5, 10, 20, 0.85)',
                            border: '1px solid rgba(1, 255, 195, 0.2)',
                            color: '#01ffc3',
                            '&:hover': { bgcolor: 'rgba(1, 255, 195, 0.1)' },
                            '&.Mui-disabled': { color: '#333' }
                        }}
                    >
                        {isLoading ? <CircularProgress size={18} color="inherit" /> : <CloudDownload fontSize="small" />}
                    </IconButton>
                </Tooltip>

                <Tooltip title="Generate mock data (G)">
                    <IconButton
                        onClick={regenerateGraph}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(5, 10, 20, 0.85)',
                            border: '1px solid rgba(255, 149, 0, 0.2)',
                            color: '#ff9500',
                            '&:hover': { bgcolor: 'rgba(255, 149, 0, 0.1)' }
                        }}
                    >
                        <Refresh fontSize="small" />
                    </IconButton>
                </Tooltip>

                <Tooltip title="Reset View (R)">
                    <IconButton
                        onClick={resetView}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(5, 10, 20, 0.85)',
                            border: '1px solid rgba(1, 255, 195, 0.2)',
                            color: '#01ffc3',
                            '&:hover': { bgcolor: 'rgba(1, 255, 195, 0.1)' }
                        }}
                    >
                        <RestartAlt fontSize="small" />
                    </IconButton>
                </Tooltip>

                <Tooltip title={showControls ? 'Hide controls (H)' : 'Show controls (H)'}>
                    <IconButton
                        onClick={() => setShowControls(prev => !prev)}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(5, 10, 20, 0.85)',
                            border: '1px solid rgba(5, 217, 232, 0.2)',
                            color: showControls ? '#05d9e8' : '#555',
                            '&:hover': { bgcolor: 'rgba(5, 217, 232, 0.1)' }
                        }}
                    >
                        {showControls ? <Visibility fontSize="small" /> : <VisibilityOff fontSize="small" />}
                    </IconButton>
                </Tooltip>

                <Tooltip title={isFullscreen ? 'Exit fullscreen (ESC)' : 'Fullscreen (F)'}>
                    <IconButton
                        onClick={toggleFullscreen}
                        size="small"
                        sx={{
                            bgcolor: 'rgba(5, 10, 20, 0.85)',
                            border: '1px solid rgba(5, 217, 232, 0.2)',
                            color: '#05d9e8',
                            '&:hover': { bgcolor: 'rgba(5, 217, 232, 0.1)' }
                        }}
                    >
                        {isFullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Legend */}
            {showControls && (
                <Paper
                    elevation={4}
                    sx={{
                        position: 'absolute',
                        bottom: 16,
                        left: 16,
                        p: 1,
                        bgcolor: 'rgba(5, 10, 20, 0.85)',
                        border: '1px solid rgba(51, 51, 51, 0.4)',
                        zIndex: 10
                    }}
                >
                    <Typography variant="caption" sx={{ color: '#ffaa00', display: 'block', mb: 0.5 }}>
                        ⬆ Hover node to trace ancestry
                    </Typography>
                    {Object.values(PLANES_CONFIG).map(plane => (
                        <Box key={plane.id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="caption" sx={{ color: plane.color }}>{plane.icon}</Typography>
                            <Typography variant="caption" sx={{ color: '#666' }}>
                                {plane.name}
                                {data?.metadata?.stats?.nodesByPlane?.[plane.id] !== undefined && (
                                    <span style={{ color: '#444', marginLeft: 4 }}>
                                        ({data.metadata.stats.nodesByPlane[plane.id]})
                                    </span>
                                )}
                            </Typography>
                        </Box>
                    ))}
                </Paper>
            )}

            {/* Error notification */}
            {loadError && (
                <Alert
                    severity="warning"
                    onClose={() => setLoadError(null)}
                    sx={{
                        position: 'absolute',
                        bottom: 16,
                        right: 16,
                        maxWidth: 350,
                        zIndex: 20,
                        bgcolor: 'rgba(255, 152, 0, 0.15)',
                        color: '#ffaa00',
                        border: '1px solid rgba(255, 152, 0, 0.3)',
                        '& .MuiAlert-icon': { color: '#ffaa00' }
                    }}
                >
                    {loadError}
                </Alert>
            )}

            {/* Loading overlay */}
            {isLoading && (
                <Box
                    sx={{
                        position: 'absolute',
                        inset: 0,
                        bgcolor: 'rgba(3, 8, 16, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 30
                    }}
                >
                    <Paper sx={{ p: 3, bgcolor: 'rgba(5, 10, 20, 0.95)', border: '1px solid #05d9e8', textAlign: 'center' }}>
                        <CircularProgress size={40} sx={{ color: '#05d9e8', mb: 2 }} />
                        <Typography variant="body2" sx={{ color: '#05d9e8' }}>
                            Loading from Knowledge Base...
                        </Typography>
                    </Paper>
                </Box>
            )}
        </Box>
    );
};

export default KnowledgePlanes;
