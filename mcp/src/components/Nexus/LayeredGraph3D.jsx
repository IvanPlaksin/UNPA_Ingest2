import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useResizeDetector } from 'react-resize-detector';
import * as THREE from 'three';

const LayeredGraph3D = ({ graphData, themeMode = 'dark', onNodeClick }) => {
    const fgRef = useRef();
    const { width, height, ref: containerRef } = useResizeDetector();

    // Adapter for react-force-graph
    const safeGraphData = useMemo(() => {
        if (!graphData) return { nodes: [], links: [] };
        return {
            nodes: graphData.nodes || [],
            links: graphData.links || graphData.edges || []
        };
    }, [graphData]);

    // Theme Config
    const isDark = themeMode === 'dark';
    const bgColor = isDark ? '#000000' : '#ffffff';
    const linkColor = isDark ? '#ffffff33' : '#00000020';
    const textColor = isDark ? 'white' : 'black';
    const tileColor = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';

    // Node Visuals (Canvas Sprite)
    const nodeThreeObject = useCallback((node) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.Texture() }));

        // Canvas Setup
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const w = 256;
        const h = 128;
        canvas.width = w;
        canvas.height = h;

        // Colors
        let borderColor = '#009EDB'; // Default ADO Blue
        if (node.type === 'Commit' || node.source === 'Git') borderColor = '#F05033';
        if (node.type === 'File' || node.source === 'KB') borderColor = '#FFB13B';

        // Draw Background
        context.fillStyle = tileColor;
        context.fillRect(0, 0, w, h);

        // Draw Border
        context.strokeStyle = borderColor;
        context.lineWidth = 8;
        context.strokeRect(0, 0, w, h);

        // Draw Text
        context.font = 'bold 36px Sans-Serif';
        context.fillStyle = borderColor; // ID Color matches type
        context.textAlign = 'center';
        context.textBaseline = 'top';

        // Line 1: ID
        const idText = `#${node.id}`;
        context.fillText(idText, w / 2, 15);

        // Line 2: Label/Title (Truncated)
        context.font = '28px Sans-Serif';
        context.fillStyle = isDark ? '#ddd' : '#333';
        const label = node.label || node.name || 'Unknown';
        const truncatedLabel = label.length > 20 ? label.substring(0, 18) + '...' : label;
        context.fillText(truncatedLabel, w / 2, 60);

        // Update Texture
        sprite.material.map.image = canvas;
        sprite.material.map.needsUpdate = true;

        sprite.scale.set(30, 15, 1); // Scale in world units
        return sprite;
    }, [isDark, tileColor]);


    // Camera Interaction
    const handleNodeClick = useCallback((node) => {
        if (!node) return;

        // Always notify parent of selection first
        if (onNodeClick) onNodeClick(node);

        if (fgRef.current) {
            const x = node.x;
            const y = node.y;
            const z = node.z;

            // Strict check for valid coordinates
            if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number' || isNaN(x) || isNaN(y) || isNaN(z)) {
                console.warn("Invalid node coordinates, skipping fly-to:", node);
                return;
            }

            const hypot = Math.hypot(x, y, z);
            const distance = 150;
            const distRatio = hypot === 0 ? 0 : 1 + distance / hypot;

            const newPos = hypot === 0
                ? { x: 0, y: 0, z: distance }
                : { x: x * distRatio, y: y * distRatio, z: z + distance };

            try {
                fgRef.current.cameraPosition(
                    newPos, // new pos
                    { x, y, z }, // lookAt
                    2000  // ms transition duration
                );
            } catch (err) {
                console.warn("Camera fly-to failed", err);
            }
        }
    }, [onNodeClick]);

    useEffect(() => {
        if (fgRef.current) {
            const fg = fgRef.current;
            // Custom Z-Axis Force
            fg.d3Force('z-axis-layer', (alpha) => {
                safeGraphData.nodes.forEach(node => {
                    let targetZ = 0;
                    if (node.source === 'ADO' || node.type === 'WorkItem') targetZ = 0;
                    if (node.source === 'Git' || node.type === 'Commit') targetZ = 100;
                    if (node.source === 'KB' || node.type === 'File') targetZ = 200;

                    // Pull towards target Z 
                    if (node.vz !== undefined) {
                        node.vz += (targetZ - node.z) * 0.5 * alpha;
                    }
                });
            });
        }
    }, [safeGraphData]);

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', background: bgColor, position: 'relative' }}>
            {/* Legend (Left-Bottom) */}
            <div style={{
                position: 'absolute',
                bottom: 20,
                left: 20,
                zIndex: 10, // Ensure visual stack
                color: isDark ? 'white' : 'black',
                fontFamily: 'monospace',
                fontSize: 12,
                pointerEvents: 'none',
                background: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
                padding: '10px',
                borderRadius: '8px',
                backdropFilter: 'blur(4px)'
            }}>
                <div style={{ fontWeight: 'bold', marginBottom: 5 }}>Layers & Types</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ width: 10, height: 10, background: '#009EDB', borderRadius: '50%' }}></span> Work Items (Z=0)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                    <span style={{ width: 10, height: 10, background: '#F05033', borderRadius: '50%' }}></span> Commits (Z=100)
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 10, height: 10, background: '#FFB13B', borderRadius: '50%' }}></span> Files (Z=200)
                </div>
            </div>

            <ForceGraph3D
                ref={fgRef}
                width={width}
                height={height}
                graphData={safeGraphData}

                // Custom Node Visuals
                nodeThreeObject={nodeThreeObject}
                nodeThreeObjectExtend={false} // Don't draw the default sphere inside

                // Link Visuals
                linkColor={() => linkColor}
                linkOpacity={0.4}
                linkWidth={1}
                linkCurvature={0} // Straight lines
                linkDirectionalArrowLength={3.5} // Arrows
                linkDirectionalArrowRelPos={1} // At end

                backgroundColor={bgColor}
                showNavInfo={false}
                onNodeClick={handleNodeClick}
                controlType="orbit"
            />
        </div>
    );
};

export default LayeredGraph3D;
