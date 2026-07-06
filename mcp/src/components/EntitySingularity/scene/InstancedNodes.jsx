import React, { useRef, useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { NODE_VISUAL_CONFIG } from '../constants/visualConfig';

// Geometry cache — one geometry object per shape+size combination
const geoCache = {};
function getGeometry(shape, size) {
    const key = `${shape}_${size}`;
    if (geoCache[key]) return geoCache[key];
    let geo;
    switch (shape) {
        case 'icosahedron': geo = new THREE.IcosahedronGeometry(size, 0); break;
        case 'octahedron':  geo = new THREE.OctahedronGeometry(size, 0);  break;
        case 'box':         geo = new THREE.BoxGeometry(size, size, size); break;
        case 'cylinder':    geo = new THREE.CylinderGeometry(size * 0.7, size * 0.7, size * 0.5, 8); break;
        case 'tetrahedron': geo = new THREE.TetrahedronGeometry(size, 0); break;
        default:            geo = new THREE.SphereGeometry(size, 12, 8);  break;
    }
    geoCache[key] = geo;
    return geo;
}

// Material cache — one material per hex color
const matCache = {};
function getMaterial(hexColor) {
    if (matCache[hexColor]) return matCache[hexColor];
    const mat = new THREE.MeshLambertMaterial({
        color: hexColor,
        emissive: hexColor,
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.85,
    });
    matCache[hexColor] = mat;
    return mat;
}

/**
 * InstancedNodes — renders all graph nodes using THREE.InstancedMesh.
 * One InstancedMesh per node type → ~12 draw calls total instead of O(N).
 *
 * Props:
 *   nodes          — node array
 *   positionsRef   — Float32Array ref [x0,y0,z0, x1,y1,z1, ...]
 *   tick           — increments each physics tick
 *   highlightIds   — Set<string> of highlighted node ids (empty = all full opacity)
 *   visualSettings — { nodes: { opacity, sizeMultiplier, emissiveIntensity } }
 *   onHover(node|null)
 *   onClick(node)
 */
export function InstancedNodes({ nodes, positionsRef, tick, highlightIds, visualSettings, degreeMap, maxDegree, onClick }) {
    const nodeSettings = visualSettings?.nodes ?? { opacity: 0.85, sizeMultiplier: 1.0, emissiveIntensity: 0.25, degreeScale: 0 };

    const nodesByType = useMemo(() => {
        const groups = {};
        nodes.forEach((node, globalIdx) => {
            const type = (node.canonicalType || 'default').toUpperCase();
            if (!groups[type]) {
                groups[type] = {
                    config: NODE_VISUAL_CONFIG[type] || NODE_VISUAL_CONFIG.default,
                    nodes: [], indices: [],
                };
            }
            groups[type].nodes.push(node);
            groups[type].indices.push(globalIdx);
        });
        return groups;
    }, [nodes]);

    return (
        <group name="nodes">
            {Object.entries(nodesByType).map(([type, group]) => (
                <InstancedGroup
                    key={`${type}_${group.nodes.length}`}
                    type={type}
                    group={group}
                    positionsRef={positionsRef}
                    tick={tick}
                    highlightIds={highlightIds}
                    nodeSettings={nodeSettings}
                    degreeMap={degreeMap}
                    maxDegree={maxDegree}
                    onClick={onClick}
                />
            ))}
        </group>
    );
}

function InstancedGroup({ type, group, positionsRef, tick, highlightIds, nodeSettings, degreeMap, maxDegree, onClick }) {
    const meshRef = useRef();
    const { config, nodes, indices } = group;
    const count = nodes.length;

    const geometry = useMemo(
        () => getGeometry(config.shape, config.size),
        [config.shape, config.size]
    );
    const material = useMemo(() => getMaterial(config.color), [config.color]);

    // Update material properties when visual settings change
    useEffect(() => {
        material.opacity = nodeSettings.opacity;
        material.emissiveIntensity = nodeSettings.emissiveIntensity;
        material.needsUpdate = true;
    }, [material, nodeSettings.opacity, nodeSettings.emissiveIntensity]);

    // Update instance matrices every physics tick
    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh || !positionsRef.current.length) return;

        const buf = positionsRef.current;
        const sm = nodeSettings.sizeMultiplier;
        const ds = nodeSettings.degreeScale ?? 0;
        const mx = maxDegree > 1 ? maxDegree : 1;
        const mat = new THREE.Matrix4();

        indices.forEach((globalIdx, localIdx) => {
            const x = buf[globalIdx * 3];
            const y = buf[globalIdx * 3 + 1];
            const z = buf[globalIdx * 3 + 2];
            if (isNaN(x)) return;

            // Per-node scale: base × (1 + normalizedDegree × degreeScale)
            const degree = degreeMap ? (degreeMap.get(nodes[localIdx]?.id) || 0) : 0;
            const t = degree / mx;
            const scale = sm * (1 + t * ds);

            mat.makeScale(scale, scale, scale).setPosition(x, y, z);
            mesh.setMatrixAt(localIdx, mat);
        });

        // Ensure Three.js renders exactly `count` instances (critical after filter changes)
        mesh.count = count;
        mesh.instanceMatrix.needsUpdate = true;
    }, [tick, indices, nodes, positionsRef, nodeSettings.sizeMultiplier, nodeSettings.degreeScale, degreeMap, maxDegree, count]);

    // Dim non-highlighted nodes
    useEffect(() => {
        const mesh = meshRef.current;
        if (!mesh) return;
        if (!mesh.instanceColor) {
            mesh.instanceColor = new THREE.InstancedBufferAttribute(
                new Float32Array(count * 3), 3
            );
        }
        const baseColor = new THREE.Color(config.color);
        const dimColor  = new THREE.Color(config.color).multiplyScalar(0.12);
        const hasFilter = highlightIds && highlightIds.size > 0;

        nodes.forEach((node, localIdx) => {
            mesh.setColorAt(localIdx, hasFilter && !highlightIds.has(node.id) ? dimColor : baseColor);
        });
        mesh.instanceColor.needsUpdate = true;
    }, [highlightIds, nodes, config.color, count]);

    // Store nodes in userData so the scene-level HoverScanner can find them
    useEffect(() => {
        if (meshRef.current) {
            meshRef.current.userData.nodeGroup = nodes;
        }
    }, [nodes]);

    return (
        <instancedMesh
            ref={meshRef}
            args={[geometry, material, count]}
            frustumCulled={false}
            onClick={(e) => { e.stopPropagation(); onClick?.(nodes[e.instanceId]); }}
        />
    );
}
