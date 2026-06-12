/**
 * Layout Engine — unified interface for graph layout algorithms.
 *
 * Algorithm registry:
 *   'dagre'   — dagre hierarchical (reliable default, browser-safe)
 *   'force'   — d3-force-3d 2D simulation (interactive, physics-based)
 *   'stress'  — ELK stress majorization (advanced, knowledge-graph optimal)
 *
 * All algorithms operate on ReactFlow node/edge format and return the same
 * format with updated node positions.  Errors are caught per-algorithm and
 * fall back to dagre so the graph is always renderable.
 */

import dagre from 'dagre';
import {
    forceSimulation,
    forceLink,
    forceManyBody,
    forceCenter,
    forceCollide,
    forceX,
    forceY,
} from 'd3-force-3d';

/* ── ELK is loaded lazily so Vite can pre-bundle it correctly ─────────────── */
let _elk = null;
async function getElk() {
    if (_elk) return _elk;
    try {
        const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
        _elk = new ELK();
        return _elk;
    } catch (err) {
        console.warn('[layoutEngine] elkjs load failed, stress unavailable:', err.message);
        return null;
    }
}

/* ── Algorithm descriptors ───────────────────────────────────────────────── */

export const ALGORITHMS = [
    {
        id: 'dagre',
        name: 'Hierarchical (Dagre)',
        description: 'Stable layered layout — great for directed graphs and trees',
    },
    {
        id: 'force',
        name: 'Force-Directed',
        description: 'Physics simulation — natural clustering, good for exploration',
    },
    {
        id: 'stress',
        name: 'Stress Majorization',
        description: 'ELK-based — minimises edge crossings for knowledge graphs',
    },
];

export function getAvailableAlgorithms() {
    return ALGORITHMS;
}

export function getDefaultConfig(algorithm) {
    const defaults = {
        dagre:  { algorithm: 'dagre',  spacing: 80,  edgeLength: 120, clusterStrength: 0,   groupByType: false },
        force:  { algorithm: 'force',  spacing: 100, edgeLength: 200, clusterStrength: 0.3, groupByType: false },
        stress: { algorithm: 'stress', spacing: 120, edgeLength: 200, clusterStrength: 0.5, groupByType: false },
    };
    return defaults[algorithm] ?? defaults.dagre;
}

/* ── Main entry point ────────────────────────────────────────────────────── */

/**
 * @param {Array}  nodes            ReactFlow nodes [{id, position, width?, height?}]
 * @param {Array}  edges            ReactFlow edges [{id, source, target}]
 * @param {Object} config           from entityStore.layoutConfig
 * @param {Object} frozenPositions  {nodeId: {x,y}} — keep these nodes in place
 * @returns {Promise<{nodes, edges}>}
 */
export async function computeLayout(nodes, edges, config = {}, frozenPositions = {}) {
    if (!nodes || nodes.length === 0) return { nodes, edges };

    const algorithm = config.algorithm || 'dagre';

    try {
        let result;
        switch (algorithm) {
            case 'stress': result = await _applyElkStress(nodes, edges, config, frozenPositions); break;
            case 'force':  result = await _applyForce(nodes, edges, config, frozenPositions); break;
            default:       result = _applyDagre(nodes, edges, config);
        }

        // Guard against degenerate output (all nodes at same position)
        if (result.nodes.length > 1) {
            const xs = result.nodes.map(n => n.position.x);
            const ys = result.nodes.map(n => n.position.y);
            const spread = Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys);
            if (spread < 10) {
                console.warn(`[layoutEngine] degenerate output (spread=${spread.toFixed(1)}), falling back to dagre`);
                return _applyDagre(nodes, edges, config);
            }
        }

        return result;
    } catch (err) {
        console.error(`[layoutEngine] ${algorithm} failed, falling back to dagre:`, err);
        try {
            return _applyDagre(nodes, edges, config);
        } catch (fallbackErr) {
            console.error('[layoutEngine] dagre fallback also failed:', fallbackErr);
            return { nodes, edges };
        }
    }
}

/* ── Dagre hierarchical (reliable, browser-safe) ─────────────────────────── */

function _applyDagre(nodes, edges, config) {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));

    // ranksep = gap between rank lines; nodesep = gap between nodes in same rank
    // TB (top-bottom) minimises rank-width for complex directed graphs
    const rankdir    = 'TB';
    const ranksep    = Math.max(80, config.spacing || 80);
    const nodesep    = Math.max(50, (config.spacing || 80) * 0.7);

    g.setGraph({ rankdir, ranksep, nodesep, marginx: 30, marginy: 30 });

    nodes.forEach(n => g.setNode(n.id, {
        width:  n.width  || 200,
        height: n.height || 70,
    }));

    edges.forEach(e => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        if (g.hasNode(src) && g.hasNode(tgt)) g.setEdge(src, tgt);
    });

    dagre.layout(g);

    const resultNodes = nodes.map(n => {
        const pos = g.node(n.id);
        if (!pos) return n;
        return {
            ...n,
            position: {
                x: pos.x - (n.width  || 200) / 2,
                y: pos.y - (n.height || 70)  / 2,
            },
        };
    });

    return { nodes: resultNodes, edges };
}

/* ── d3-force-3d 2D simulation ───────────────────────────────────────────── */

function _applyForce(nodes, edges, config, frozenPositions) {
    return new Promise((resolve) => {
        const nodeMap  = {};

        const simNodes = nodes.map(n => {
            const fp = frozenPositions[n.id];
            const sn = {
                id:    n.id,
                _type: n.data?.type || n.type || 'default',
                x:     fp ? fp.x : (n.position?.x || (Math.random() - 0.5) * 100),
                y:     fp ? fp.y : (n.position?.y || (Math.random() - 0.5) * 100),
            };
            if (fp) { sn.fx = fp.x; sn.fy = fp.y; }
            nodeMap[n.id] = sn;
            return sn;
        });

        const simEdges = edges
            .filter(e => {
                const src = typeof e.source === 'object' ? e.source.id : e.source;
                const tgt = typeof e.target === 'object' ? e.target.id : e.target;
                return nodeMap[src] && nodeMap[tgt];
            })
            .map(e => ({
                source: typeof e.source === 'object' ? e.source.id : e.source,
                target: typeof e.target === 'object' ? e.target.id : e.target,
            }));

        // Node half-diagonal: actual collision boundary that prevents overlap
        const avgW         = nodes.reduce((s, n) => s + (n.width  || 200), 0) / nodes.length;
        const avgH         = nodes.reduce((s, n) => s + (n.height || 70),  0) / nodes.length;
        const nodeHalfDiag = Math.sqrt((avgW / 2) ** 2 + (avgH / 2) ** 2); // ≈ 106 for 200×70

        // Collision: node half-diagonal + user spacing as gap
        const gap      = config.spacing  || 80;
        const collide  = nodeHalfDiag + gap * 0.5;        // ≈ 146px for defaults

        // Charge: enough to prevent overlap but not so strong as to scatter the graph
        const charge   = -(collide * collide * 0.25);     // ≈ -5329 for collide=146

        // Link distance: 1.5× collision so connected nodes stay reasonably close
        const linkDist = Math.max(config.edgeLength || 120, collide * 1.5);

        // Initial spread: √N × collide × 2 — tight enough for the simulation to converge
        const initSpread = Math.sqrt(simNodes.length) * collide * 2;

        // Degree-based initialisation: hub nodes start near center, leaves at periphery.
        // This dramatically reduces long-range edge crossings in force layout.
        const degree = {};
        simEdges.forEach(e => {
            degree[e.source] = (degree[e.source] || 0) + 1;
            degree[e.target] = (degree[e.target] || 0) + 1;
        });
        const maxDegree = Math.max(1, ...Object.values(degree));

        simNodes.forEach(sn => {
            if (sn.fx === undefined) {
                const deg         = degree[sn.id] || 0;
                // High-degree nodes placed closer to center (small radius fraction)
                const radFrac     = 1 - (deg / maxDegree) * 0.75;
                const r           = radFrac * initSpread * (0.3 + Math.random() * 0.7);
                const angle       = Math.random() * 2 * Math.PI;
                sn.x = r * Math.cos(angle);
                sn.y = r * Math.sin(angle);
            }
        });

        const simulation = forceSimulation(simNodes, 2) // 2 = 2D
            .force('link', forceLink(simEdges)
                .id(d => d.id)
                .distance(linkDist)
                // Floor at 0.3 so weakly-connected hub pairs don't drift apart
                .strength(d => Math.max(0.3, 1 / Math.min(
                    degree[typeof d.source === 'object' ? d.source.id : d.source] || 1,
                    degree[typeof d.target === 'object' ? d.target.id : d.target] || 1,
                ))))
            .force('charge', forceManyBody().strength(charge))
            .force('center', forceCenter(0, 0))
            .force('collision', forceCollide(collide).strength(1).iterations(3))
            // Universal gravity keeps disconnected/isolated nodes from flying away
            .force('gravityX', forceX(0).strength(0.06))
            .force('gravityY', forceY(0).strength(0.06))
            // Extra pull for hub nodes toward center
            .force('hubX', forceX(0).strength(n => (degree[n.id] || 0) / maxDegree * 0.15))
            .force('hubY', forceY(0).strength(n => (degree[n.id] || 0) / maxDegree * 0.15))
            .stop();

        // Cluster pull: attract nodes of the same entity type toward a shared centroid
        const cs = config.clusterStrength || 0;
        if (cs > 0) {
            const typeSet = [...new Set(simNodes.map(n => n._type).filter(Boolean))];
            const typeCentroid = {};
            typeSet.forEach((t, i) => {
                const angle  = (i / typeSet.length) * 2 * Math.PI;
                const radius = linkDist * 3;
                typeCentroid[t] = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
            });
            simulation
                .force('clusterX', forceX(n => typeCentroid[n._type]?.x ?? 0).strength(cs * 0.25))
                .force('clusterY', forceY(n => typeCentroid[n._type]?.y ?? 0).strength(cs * 0.25));
        }

        // More ticks for larger graphs to reach convergence
        const ticks = Math.max(400, simNodes.length * 6);
        simulation.tick(ticks);

        const resultNodes = nodes.map(n => {
            const sn = nodeMap[n.id];
            return {
                ...n,
                position: frozenPositions[n.id]
                    ? frozenPositions[n.id]
                    : { x: sn?.x || 0, y: sn?.y || 0 },
            };
        });

        resolve({ nodes: _repackComponents(resultNodes, edges), edges });
    });
}

/* ── ELK stress majorization (async, requires elkjs) ────────────────────── */

async function _applyElkStress(nodes, edges, config, frozenPositions) {
    const elk = await getElk();
    if (!elk) {
        console.warn('[layoutEngine] ELK not available, falling back to force');
        return _applyForce(nodes, edges, config, frozenPositions);
    }

    const elkGraph = {
        id: 'root',
        layoutOptions: {
            'elk.algorithm':                'stress',
            'elk.stress.desiredEdgeLength': String(config.edgeLength || 150),
            'elk.spacing.nodeNode':         String(config.spacing   || 100),
            'elk.stress.epsilon':           '0.001',
            'elk.stress.iterationLimit':    '300',
        },
        children: nodes.map(n => ({
            id:     n.id,
            width:  n.width  || 200,
            height: n.height || 70,
            ...(frozenPositions[n.id] ? {
                x: frozenPositions[n.id].x,
                y: frozenPositions[n.id].y,
            } : {}),
        })),
        edges: edges
            .filter(e => e.source && e.target)
            .map((e, i) => ({
                id:      e.id || `elk-e${i}`,
                sources: [typeof e.source === 'object' ? e.source.id : e.source],
                targets: [typeof e.target === 'object' ? e.target.id : e.target],
            })),
    };

    const layouted = await elk.layout(elkGraph);

    const positionMap = {};
    (layouted.children || []).forEach(c => { positionMap[c.id] = { x: c.x || 0, y: c.y || 0 }; });

    const resultNodes = nodes.map(n => ({
        ...n,
        position: frozenPositions[n.id]
            ? frozenPositions[n.id]
            : (positionMap[n.id] || n.position),
    }));

    return { nodes: _repackComponents(resultNodes, edges), edges };
}

/* ── Helper: repack disconnected components into a 2D grid below main cluster ─ */

function _repackComponents(nodes, edges) {
    if (nodes.length === 0) return nodes;

    // Build undirected adjacency list
    const adj = {};
    nodes.forEach(n => { adj[n.id] = []; });
    edges.forEach(e => {
        const src = typeof e.source === 'object' ? e.source.id : e.source;
        const tgt = typeof e.target === 'object' ? e.target.id : e.target;
        if (adj[src] !== undefined) adj[src].push(tgt);
        if (adj[tgt] !== undefined) adj[tgt].push(src);
    });

    // BFS to find connected components
    const visited = new Set();
    const components = [];
    nodes.forEach(n => {
        if (visited.has(n.id)) return;
        const comp = [];
        const q = [n.id];
        while (q.length) {
            const id = q.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            comp.push(id);
            (adj[id] || []).forEach(nb => { if (!visited.has(nb)) q.push(nb); });
        }
        components.push(comp);
    });

    if (components.length <= 1) return nodes;

    // Largest component stays in place; smaller ones are repacked below it
    components.sort((a, b) => b.length - a.length);

    const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

    const bboxes = components.map(ids => {
        const ns = ids.map(id => nodeById[id]).filter(Boolean);
        const xs = ns.map(n => n.position.x);
        const ys = ns.map(n => n.position.y);
        return {
            ids,
            minX:   Math.min(...xs),
            maxX:   Math.max(...xs) + 200,
            minY:   Math.min(...ys),
            maxY:   Math.max(...ys) + 70,
            width:  Math.max(...xs) + 200 - Math.min(...xs),
            height: Math.max(...ys) + 70  - Math.min(...ys),
        };
    });

    const main    = bboxes[0];
    const padding = 60;
    let curX = main.minX;
    let curY = main.maxY + padding;
    let rowH = 0;

    const shifts = {};

    bboxes.slice(1).forEach(bb => {
        // Wrap to next row if this component exceeds the main cluster's width
        if (bb.width < main.width && curX + bb.width > main.minX + main.width && curX > main.minX) {
            curX = main.minX;
            curY += rowH + padding;
            rowH = 0;
        }
        const dx = curX - bb.minX;
        const dy = curY - bb.minY;
        bb.ids.forEach(id => { shifts[id] = { dx, dy }; });
        curX += bb.width + padding;
        rowH  = Math.max(rowH, bb.height);
    });

    return nodes.map(n => {
        const s = shifts[n.id];
        if (!s) return n;
        return { ...n, position: { x: n.position.x + s.dx, y: n.position.y + s.dy } };
    });
}
