import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useResizeDetector } from 'react-resize-detector';
import * as THREE from 'three';
import { Box, Paper, Typography, Stack, useTheme } from '@mui/material';

const LayeredGraph3D = ({ graphData, onNodeClick, selectedNode, mainPlaneZ = 0 }) => {
    const fgRef = useRef();
    const { width, height, ref: containerRef } = useResizeDetector(); // Keep this line as it's not explicitly removed by the instruction
    const theme = useTheme(); // Keep this line as it's used later for theme.palette

    useEffect(() => {
        console.log('[LayeredGraph3D] Received graphData:', graphData);
        if (graphData && graphData.nodes) {
            console.log('[LayeredGraph3D] Nodes:', graphData.nodes.map(n => `${n.id} (${n.label})`));
        }
    }, [graphData]);

    // Adapter for react-force-graph
    const safeGraphData = useMemo(() => {
        if (!graphData) return { nodes: [], links: [] };
        return {
            nodes: graphData.nodes || [],
            links: graphData.links || graphData.edges || []
        };
    }, [graphData]);

    // Theme Config
    const isDark = theme.palette.mode === 'dark';
    const bgColor = theme.palette.background.default;
    const linkColor = isDark ? '#ffffff33' : '#00000020';
    const tileColor = isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)';

    // Node Visuals (Plane Mesh)
    const nodeThreeObject = useCallback((node) => {
        // Use PlaneGeometry for flat cards that align with the XY plane
        const geometry = new THREE.PlaneGeometry(30, 15); // Width, Height matches previous scale
        const material = new THREE.MeshBasicMaterial({
            transparent: true,
            side: THREE.DoubleSide // Visible from both sides
        });
        const mesh = new THREE.Mesh(geometry, material);

        // Canvas Setup
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        const w = 256;
        const h = 128;
        canvas.width = w;
        canvas.height = h;

        // Check Selection
        const isSelected = selectedNode && node.id === selectedNode.id;

        // Colors
        let borderColor = '#009EDB'; // Default ADO Blue
        if (node.type === 'Commit' || node.source === 'Git') borderColor = '#F05033';
        if (node.type === 'File' || node.source === 'KB') borderColor = '#FFB13B';
        if (node.type === 'Artifact') borderColor = '#808080'; // Gray for generic artifacts

        // Override for Selection
        if (isSelected) {
            borderColor = '#FF6700'; // Neon Orange
        }

        // Draw Background
        context.fillStyle = tileColor;
        context.fillRect(0, 0, w, h);

        // Draw Border
        context.strokeStyle = borderColor;
        context.lineWidth = isSelected ? 12 : 8; // Thicker border for selection
        context.strokeRect(0, 0, w, h);

        // Draw Text
        context.font = 'bold 36px Sans-Serif';
        context.fillStyle = borderColor; // ID Color matches type or selection
        context.textAlign = 'center';
        context.textBaseline = 'top';

        // Line 1: ID
        const idText = `#${node.id} `;
        context.fillText(idText, w / 2, 15);

        // Line 2: Label/Title (Truncated)
        context.font = '28px Sans-Serif';
        context.fillStyle = isSelected ? borderColor : (isDark ? '#ddd' : '#333'); // Text color matches border if selected
        const label = node.label || node.name || 'Unknown';
        const truncatedLabel = label.length > 20 ? label.substring(0, 18) + '...' : label;
        context.fillText(truncatedLabel, w / 2, 60);

        // Update Texture
        const texture = new THREE.CanvasTexture(canvas);
        mesh.material.map = texture;
        mesh.material.needsUpdate = true;

        return mesh;
    }, [isDark, tileColor, selectedNode]);


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
                    const type = (node.type || '').toLowerCase();
                    const source = (node.source || '').toLowerCase();

                    if (type === 'workitem' || source === 'ado') targetZ = 0;
                    else if (type === 'commit' || source === 'git') targetZ = 100;
                    else if (type === 'file' || source === 'kb') targetZ = 200;
                    else if (type === 'artifact') targetZ = -100; // Generic Artifacts below
                    else targetZ = 200; // Default fallback

                    // Pull towards target Z 
                    if (node.vz !== undefined) {
                        node.vz += (targetZ - node.z) * 0.5 * alpha;
                    }
                });
            });

            // Custom Y-Axis Force for Parent Relations
            fg.d3Force('parent-position', (alpha) => {
                safeGraphData.links.forEach(link => {
                    if (link.label === 'Parent') {
                        const source = link.source;
                        const target = link.target;

                        // Ensure objects are fully initialized
                        if (source && target && typeof source.y === 'number' && typeof target.y === 'number') {
                            const targetY = source.y - 30; // Y is up? In 3D force graph, usually Y is up. Let's try +30 for "above". 
                            // Wait, if Y is up... let's assume +30. 
                            // Actually, standard webGL Y is up. 
                            // Let's use source.y + 30.
                            // If the user said "above", +Y is usually correct in 3D.

                            // Re-reading task: "выше по оси Y". So +30.
                            const desiredY = source.y + 40; // 30 is tight. 40 gives space. 

                            // Apply force to TARGET (Parent) to move it above source
                            if (target.vy !== undefined) {
                                target.vy += (desiredY - target.y) * 1 * alpha;
                            }

                            // Also align X to be close?
                            if (target.vx !== undefined) {
                                target.vx += (source.x - target.x) * 0.5 * alpha;
                            }
                        }
                    }
                });
            });
        }
    }, [safeGraphData]);

    // Tooltip Generator
    const getTooltipHtml = useCallback((item, type) => {
        const bgColor = isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
        const textColor = isDark ? '#ffffff' : '#000000';
        const borderColor = isDark ? 'rgba(0, 255, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)';

        const style = `
            background: ${bgColor};
            color: ${textColor};
            padding: 8px 12px;
            border-radius: 6px;
            border: 1px solid ${borderColor};
            font-family: 'Roboto', sans-serif;
            pointer-events: none;
            backdrop-filter: blur(4px);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            min-width: 120px;
            z-index: 1000;
        `;

        let content = '';
        if (type === 'node') {
            content = `
                <div style="font-weight: 700; font-size: 14px; margin-bottom: 4px; color: ${item.color || 'inherit'}">${item.type || 'Node'}</div>
                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 2px">${item.label || item.name || item.id}</div>
                ${item.state ? `<div style="font-size: 11px; opacity: 0.6; margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 4px">State: ${item.state}</div>` : ''}
                ${item.source ? `<div style="font-size: 10px; opacity: 0.5; margin-top: 2px">Source: ${item.source}</div>` : ''}
            `;
        } else {
            content = `
                <div style="font-size: 10px; text-transform: uppercase; letter-spacing: 1px; opacity: 0.6">Relationship</div>
                <div style="font-weight: 600; font-size: 13px">${item.type || 'LINK'}</div>
            `;
        }

        return `<div style="${style.replace(/\n/g, '')}">${content}</div>`;
    }, [isDark]);

    // Mouse-Centered Rotation Logic & Control Config
    useEffect(() => {
        if (!fgRef.current) return;

        const fg = fgRef.current;
        const controls = fg.controls();
        const camera = fg.camera();
        const renderer = fg.renderer();
        const domElement = renderer.domElement;

        // Configure Default Controls: PAN on Left Click
        if (controls) {
            // THREE.MOUSE.LEFT = 0
            // OrbitControls uses 'mouseButtons' object to map buttons to actions
            controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE; // Keep Right for Rotate as alternative? Or disable? 
            // User requirement: Left Drag = Pan. Ctrl+Left = Rotation.
            // We'll trust our pointerdown handler for the Ctrl logic.
            controls.update();
        }

        const handlePointerDown = (event) => {
            // Only handle left click (button 0)
            if (event.button !== 0) return;

            if (event.ctrlKey) {
                // SWITCH TO ROTATION MODE
                if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;

                // --- PIVOT LOGIC ---
                // Find intersection with Main Plane to set Pivot
                const rect = domElement.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

                const raycaster = new THREE.Raycaster();
                raycaster.setFromCamera({ x, y }, camera);

                // Intersect with Main Plane (e.g. Z=0 or Z=100 based on context)
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -mainPlaneZ);
                // Plane constructor normal + constant? Constant is -distance from origin to plane along normal?
                // Plane equation: Ax + By + Cz + D = 0.
                // For Z=k, normal=(0,0,1). z - k = 0 => z + (-k) = 0. So Constant D = -k.

                const targetPoint = new THREE.Vector3();
                const hit = raycaster.ray.intersectPlane(plane, targetPoint);

                if (hit) {
                    // Move target to hit point, Shift camera by same delta to keep visual stationary
                    const oldTarget = controls.target.clone();
                    const delta = new THREE.Vector3().subVectors(hit, oldTarget);

                    controls.target.copy(hit);
                    camera.position.add(delta);
                    controls.update();
                }

            } else {
                // DEFAULT PAN MODE
                if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
            }
        };

        const handlePointerUp = () => {
            // Reset to default on release? 
            // Actually, strictly speaking, we only need to reset if we were in a temporary mode.
            // But resetting ensures safety.
            if (controls) controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        };

        domElement.addEventListener('pointerdown', handlePointerDown);
        domElement.addEventListener('pointerup', handlePointerUp);
        // Also listen for keyup just in case?

        // Cleanup
        return () => {
            domElement.removeEventListener('pointerdown', handlePointerDown);
            domElement.removeEventListener('pointerup', handlePointerUp);
        };
    }, [mainPlaneZ]);

    return (
        <Box ref={containerRef} sx={{ width: '100%', height: '100%', bgcolor: 'background.default', position: 'relative' }}>
            {/* Legend (Left-Bottom) */}
            <Paper
                sx={{
                    position: 'absolute',
                    bottom: 20,
                    left: 20,
                    zIndex: 10,
                    p: 1.5,
                    bgcolor: 'background.paper',
                    backdropFilter: 'blur(4px)',
                    bgOpacity: 0.8,
                    borderRadius: 2
                }}
                elevation={4}
            >
                <Typography variant="caption" fontWeight="bold" display="block" gutterBottom fontFamily="monospace">Layers & Types</Typography>
                <Stack spacing={0.5}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 10, height: 10, bgcolor: '#009EDB', borderRadius: '50%' }} />
                        <Typography variant="caption" fontFamily="monospace">Work Items (Z=0)</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 10, height: 10, bgcolor: '#F05033', borderRadius: '50%' }} />
                        <Typography variant="caption" fontFamily="monospace">Commits (Z=100)</Typography>
                    </Stack>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Box sx={{ width: 10, height: 10, bgcolor: '#FFB13B', borderRadius: '50%' }} />
                        <Typography variant="caption" fontFamily="monospace">Files (Z=200)</Typography>
                    </Stack>
                </Stack>
            </Paper>

            <ForceGraph3D
                ref={fgRef}
                width={width}
                height={height}
                graphData={safeGraphData}

                // Custom Node Visuals
                nodeThreeObject={nodeThreeObject}
                nodeThreeObjectExtend={false} // Don't draw the default sphere inside
                nodeLabel={(node) => getTooltipHtml(node, 'node')}
                linkLabel={(link) => getTooltipHtml(link, 'link')}

                // Link Visuals
                linkColor={() => linkColor}
                linkOpacity={0.4}
                linkWidth={1}
                linkCurvature={0} // Straight lines
                linkDirectionalArrowLength={3.5} // Arrows
                linkDirectionalArrowRelPos={1} // At end

                backgroundColor={bgColor}
                showNavInfo={true}
                onNodeClick={handleNodeClick}
                controlType="orbit"
                enableNodeDrag={false}
                enableNavigationControls={true}
            />
        </Box>
    );
};

export default LayeredGraph3D;
