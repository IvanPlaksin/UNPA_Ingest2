/**
 * TensorGraph - 3D visualization of tensor causal relationships
 * Based on SingularityGraph visual style with 3D navigation controls
 */

import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import { useResizeDetector } from 'react-resize-detector';
import * as THREE from 'three';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import {
  Box, Typography, Chip, Stack, IconButton, Paper, Slider, Tooltip, Divider, Collapse, ToggleButtonGroup, ToggleButton
} from '@mui/material';
import {
  Settings as SettingsIcon,
  CenterFocusStrong as CenterIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  SwapVert as InvertIcon,
  ThreeDRotation as OrbitIcon,
  PanTool as PanIcon,
  Flight as FlightIcon,
  ViewInAr as ArchIcon,
  KeyboardArrowUp as CollapseIcon,
  KeyboardArrowDown as ExpandIcon
} from '@mui/icons-material';

// Configuration matching Singularity style
const CONFIG = {
  colors: {
    background: '#050510',
    nodeOk: '#00FF88',       // Green - healthy
    nodeWarning: '#FFD700',  // Gold - slow
    nodeError: '#FF4444',    // Red - errors
    nodePending: '#4488FF',  // Blue - active
    link: '#336699',
    linkActive: '#00FFFF',
    highlight: '#FFFFFF'
  },
  bloom: {
    strength: 1.2,
    radius: 0.4,
    threshold: 0.2
  }
};

// Navigation modes
const NAV_MODES = {
  orbit: { name: 'Orbit', icon: OrbitIcon, desc: 'Вращение вокруг центра' },
  pan: { name: 'Pan', icon: PanIcon, desc: 'Перемещение камеры' },
  fly: { name: 'Fly', icon: FlightIcon, desc: 'Свободный полёт WASD' },
  arch: { name: 'Arch', icon: ArchIcon, desc: 'Стиль ArchiCAD' }
};

// Base values for multipliers
const BASE_LINK_DISTANCE = 80;
const BASE_CHARGE = -120;
const BASE_CAMERA_DISTANCE = 400;

const TensorGraph = ({ data, onNodeClick, height = 500 }) => {
  const fgRef = useRef();
  const containerRef = useRef();
  const { width, ref: resizeRef } = useResizeDetector();

  const [highlightNodes, setHighlightNodes] = useState(new Set());
  const [highlightLinks, setHighlightLinks] = useState(new Set());
  const [selectedNode, setSelectedNode] = useState(null);

  // 3D Control States - using multipliers instead of absolute values
  const [showControls, setShowControls] = useState(true);
  const [navMode, setNavMode] = useState('orbit');
  const [invertControls, setInvertControls] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nodeScale, setNodeScale] = useState(1.2);          // 1x = normal size
  const [spreadMultiplier, setSpreadMultiplier] = useState(2.0);  // Controls both link distance and repulsion
  const [zoomLevel, setZoomLevel] = useState(1.0);          // 1x = default view

  // Computed values from multipliers
  const linkDistance = BASE_LINK_DISTANCE * spreadMultiplier;
  const chargeStrength = BASE_CHARGE * spreadMultiplier;
  const cameraDistance = BASE_CAMERA_DISTANCE * zoomLevel;

  // Transform API data to graph format
  const graphData = useMemo(() => {
    if (!data?.nodes || !data?.edges) {
      return { nodes: [], links: [] };
    }

    const nodes = data.nodes.map(node => ({
      id: node.id,
      name: node.name,
      type: node.type || 'tensor',
      metrics: node.metrics || {},
      status: node.status || 'ok',
      // Visual properties
      val: Math.max(1, (node.metrics?.count || 1) / 10), // Node size based on count
    }));

    const links = data.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      type: edge.type || 'causes',
    }));

    return { nodes, links };
  }, [data]);

  // Initialize bloom effect
  useEffect(() => {
    if (fgRef.current) {
      const scene = fgRef.current.scene();
      scene.background = new THREE.Color(CONFIG.colors.background);

      // Add bloom pass
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width || 800, height),
        CONFIG.bloom.strength,
        CONFIG.bloom.radius,
        CONFIG.bloom.threshold
      );
      fgRef.current.postProcessingComposer().addPass(bloomPass);
    }
  }, [width, height]);

  // Configure camera controls for proper zoom behavior
  useEffect(() => {
    if (fgRef.current) {
      const controls = fgRef.current.controls();
      if (controls) {
        // Set reasonable zoom limits
        controls.minDistance = 50;    // Minimum zoom (close)
        controls.maxDistance = 3000;  // Maximum zoom (far)
        controls.zoomSpeed = 0.8;     // Smoother zoom
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
      }
    }
  }, [graphData]);

  // Update camera position when zoom level changes
  useEffect(() => {
    if (fgRef.current && graphData.nodes.length > 0) {
      fgRef.current.cameraPosition(
        { x: 0, y: 0, z: cameraDistance },
        { x: 0, y: 0, z: 0 },
        500 // Smooth transition
      );
    }
  }, [zoomLevel, cameraDistance, graphData.nodes.length]);

  // Reset view to center and default zoom
  const handleResetView = useCallback(() => {
    setZoomLevel(1.0);
    if (fgRef.current) {
      fgRef.current.cameraPosition(
        { x: 0, y: 0, z: BASE_CAMERA_DISTANCE },
        { x: 0, y: 0, z: 0 },
        1000
      );
    }
  }, []);

  // Fullscreen toggle
  const handleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Handle fullscreen change events
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      switch (e.key.toLowerCase()) {
        case 'f':
          handleFullscreen();
          break;
        case 'h':
          setShowControls(prev => !prev);
          break;
        case 'r':
          handleResetView();
          break;
        case '1':
          setNavMode('orbit');
          break;
        case '2':
          setNavMode('pan');
          break;
        case '3':
          setNavMode('fly');
          break;
        case '4':
          setNavMode('arch');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleFullscreen, handleResetView]);

  // Apply navigation mode settings
  useEffect(() => {
    if (!fgRef.current) return;
    const controls = fgRef.current.controls();
    if (!controls) return;

    // Configure based on navigation mode
    switch (navMode) {
      case 'orbit':
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.rotateSpeed = invertControls ? -1 : 1;
        break;
      case 'pan':
        controls.enableRotate = false;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.panSpeed = invertControls ? -1 : 1;
        break;
      case 'fly':
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.rotateSpeed = invertControls ? -0.5 : 0.5;
        break;
      case 'arch':
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.rotateSpeed = invertControls ? -0.3 : 0.3;
        controls.panSpeed = 0.5;
        break;
      default:
        break;
    }
  }, [navMode, invertControls]);

  // Get node color based on status and metrics
  const getNodeColor = useCallback((node) => {
    if (highlightNodes.has(node.id)) return CONFIG.colors.highlight;

    switch (node.status) {
      case 'error': return CONFIG.colors.nodeError;
      case 'slow':
      case 'warning': return CONFIG.colors.nodeWarning;
      case 'active':
      case 'pending': return CONFIG.colors.nodePending;
      default: return CONFIG.colors.nodeOk;
    }
  }, [highlightNodes]);

  // Custom node rendering
  const nodeThreeObject = useCallback((node) => {
    const isHighlighted = highlightNodes.has(node.id);
    const size = Math.max(4, Math.min(12, node.val * 2)) * nodeScale;

    // Create sphere geometry
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshBasicMaterial({
      color: getNodeColor(node),
      transparent: true,
      opacity: isHighlighted ? 1 : 0.8,
    });

    const sphere = new THREE.Mesh(geometry, material);

    // Add glow effect for problematic nodes
    if (node.status === 'error' || node.status === 'slow') {
      const glowGeometry = new THREE.SphereGeometry(size * 1.3, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: getNodeColor(node),
        transparent: true,
        opacity: 0.3,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      sphere.add(glow);
    }

    // Add label
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 64;
    ctx.fillStyle = 'white';
    ctx.font = '24px Arial';
    ctx.textAlign = 'center';

    const shortName = node.name.split('.').pop() || node.name;
    ctx.fillText(shortName, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(40, 10, 1);
    sprite.position.y = size + 8;
    sphere.add(sprite);

    return sphere;
  }, [highlightNodes, getNodeColor, nodeScale]);

  // Handle node hover
  const handleNodeHover = useCallback((node) => {
    if (!node) {
      setHighlightNodes(new Set());
      setHighlightLinks(new Set());
      return;
    }

    const neighbors = new Set([node.id]);
    const links = new Set();

    graphData.links.forEach(link => {
      const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
      const targetId = typeof link.target === 'object' ? link.target.id : link.target;

      if (sourceId === node.id || targetId === node.id) {
        neighbors.add(sourceId);
        neighbors.add(targetId);
        links.add(link);
      }
    });

    setHighlightNodes(neighbors);
    setHighlightLinks(links);
  }, [graphData.links]);

  // Handle node click
  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node);
    if (onNodeClick) {
      onNodeClick(node);
    }

    // Camera focus - zoom to node with appropriate distance
    if (fgRef.current) {
      const nodePos = { x: node.x || 0, y: node.y || 0, z: node.z || 0 };
      const distance = Math.hypot(nodePos.x, nodePos.y, nodePos.z);
      const focusDistance = Math.max(100, distance * 0.3 + 80);

      if (distance > 0) {
        const distRatio = 1 + focusDistance / distance;
        fgRef.current.cameraPosition(
          { x: nodePos.x * distRatio, y: nodePos.y * distRatio, z: nodePos.z * distRatio },
          nodePos,
          800
        );
      } else {
        fgRef.current.cameraPosition(
          { x: 0, y: 0, z: focusDistance },
          nodePos,
          800
        );
      }
    }
  }, [onNodeClick]);

  // Link styling
  const getLinkColor = useCallback((link) => {
    return highlightLinks.has(link) ? CONFIG.colors.linkActive : CONFIG.colors.link;
  }, [highlightLinks]);

  // Merge container refs - must be before early return to preserve hook order
  const setRefs = useCallback((node) => {
    containerRef.current = node;
    resizeRef(node);
  }, [resizeRef]);

  if (!graphData.nodes.length) {
    return (
      <Box
        ref={containerRef}
        sx={{
          width: '100%',
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: CONFIG.colors.background,
          borderRadius: 2
        }}
      >
        <Typography color="text.secondary">
          No tensor data available. Start monitoring operations to see the graph.
        </Typography>
      </Box>
    );
  }

  return (
    <Box ref={setRefs} sx={{ width: '100%', height, position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
      <ForceGraph3D
        ref={fgRef}
        width={width || 800}
        height={isFullscreen ? window.innerHeight : height}
        graphData={graphData}
        nodeThreeObject={nodeThreeObject}
        nodeThreeObjectExtend={false}
        linkColor={getLinkColor}
        linkWidth={link => highlightLinks.has(link) ? 2 : 1}
        linkOpacity={0.6}
        linkDirectionalParticles={2}
        linkDirectionalParticleWidth={2}
        linkDirectionalParticleSpeed={0.005}
        linkDistance={linkDistance}
        d3AlphaDecay={0.01}
        d3VelocityDecay={0.3}
        d3Force={(d3) => {
          // Increase repulsion between nodes for better spacing
          d3.force('charge').strength(chargeStrength);
          // Spread nodes more in 3D space
          d3.force('center').strength(0.05);
        }}
        onNodeHover={handleNodeHover}
        onNodeClick={handleNodeClick}
        enableNodeDrag={true}
        enableNavigationControls={true}
        showNavInfo={false}
        cooldownTicks={100}
        warmupTicks={50}
      />

      {/* Collapsible Controls Toggle Button */}
      <Box sx={{ position: 'absolute', top: 16, left: 16, zIndex: 10 }}>
        <Tooltip title={showControls ? 'Hide controls (H)' : 'Show controls (H)'} placement="right">
          <IconButton
            onClick={() => setShowControls(!showControls)}
            sx={{
              bgcolor: 'rgba(0,0,0,0.7)',
              color: 'white',
              '&:hover': { bgcolor: 'rgba(0,0,0,0.9)' }
            }}
          >
            {showControls ? <CollapseIcon /> : <SettingsIcon />}
          </IconButton>
        </Tooltip>
      </Box>

      {/* 3D Controls Panel */}
      <Collapse in={showControls} timeout={300}>
        <Paper
          sx={{
            position: 'absolute',
            top: 60,
            left: 16,
            bgcolor: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(8px)',
            p: 2,
            borderRadius: 2,
            minWidth: 200,
            maxWidth: 240,
            zIndex: 10
          }}
        >
          {/* Navigation Mode */}
          <Typography variant="caption" color="grey.500" sx={{ mb: 1, display: 'block' }}>
            Navigation Mode
          </Typography>
          <ToggleButtonGroup
            value={navMode}
            exclusive
            onChange={(e, v) => v && setNavMode(v)}
            size="small"
            fullWidth
            sx={{ mb: 2 }}
          >
            {Object.entries(NAV_MODES).map(([key, { name, icon: Icon, desc }]) => (
              <Tooltip key={key} title={desc} placement="top">
                <ToggleButton
                  value={key}
                  sx={{
                    color: 'grey.400',
                    '&.Mui-selected': { bgcolor: 'primary.dark', color: 'white' }
                  }}
                >
                  <Icon fontSize="small" />
                </ToggleButton>
              </Tooltip>
            ))}
          </ToggleButtonGroup>

          <Divider sx={{ my: 1.5, borderColor: 'grey.800' }} />

          {/* Invert Controls */}
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
            <Typography variant="caption" color="grey.400">Invert Controls</Typography>
            <IconButton
              size="small"
              onClick={() => setInvertControls(!invertControls)}
              sx={{
                color: invertControls ? 'primary.main' : 'grey.600',
                bgcolor: invertControls ? 'primary.dark' : 'transparent'
              }}
            >
              <InvertIcon fontSize="small" />
            </IconButton>
          </Stack>

          {/* Node Scale Slider */}
          <Typography variant="caption" color="grey.500" sx={{ mb: 0.5, display: 'block' }}>
            Node Size: {nodeScale.toFixed(1)}x
          </Typography>
          <Slider
            value={nodeScale}
            min={0.5}
            max={3.0}
            step={0.1}
            onChange={(e, v) => setNodeScale(v)}
            size="small"
            sx={{ mb: 2, color: 'primary.main' }}
          />

          {/* Spread Multiplier - controls both link distance and repulsion */}
          <Typography variant="caption" color="grey.500" sx={{ mb: 0.5, display: 'block' }}>
            Graph Spread: {spreadMultiplier.toFixed(1)}x
          </Typography>
          <Slider
            value={spreadMultiplier}
            min={0.5}
            max={5.0}
            step={0.1}
            onChange={(e, v) => setSpreadMultiplier(v)}
            size="small"
            sx={{ mb: 2, color: 'primary.main' }}
          />

          {/* Zoom Level */}
          <Typography variant="caption" color="grey.500" sx={{ mb: 0.5, display: 'block' }}>
            Zoom: {zoomLevel.toFixed(1)}x
          </Typography>
          <Slider
            value={zoomLevel}
            min={0.3}
            max={3.0}
            step={0.1}
            onChange={(e, v) => setZoomLevel(v)}
            size="small"
            sx={{ mb: 2, color: 'primary.main' }}
          />

          <Divider sx={{ my: 1.5, borderColor: 'grey.800' }} />

          {/* Action Buttons */}
          <Stack direction="row" spacing={1} justifyContent="center">
            <Tooltip title="Reset View (R)">
              <IconButton
                onClick={handleResetView}
                size="small"
                sx={{ color: 'grey.400', '&:hover': { color: 'white' } }}
              >
                <CenterIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title="Fullscreen (F)">
              <IconButton
                onClick={handleFullscreen}
                size="small"
                sx={{ color: 'grey.400', '&:hover': { color: 'white' } }}
              >
                {isFullscreen ? <FullscreenExitIcon fontSize="small" /> : <FullscreenIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Stack>

          {/* Keyboard Shortcuts Hint */}
          <Typography variant="caption" color="grey.600" sx={{ display: 'block', mt: 2, textAlign: 'center' }}>
            Shortcuts: 1-4 modes, F full, H hide, R reset
          </Typography>
        </Paper>
      </Collapse>

      {/* Selected node info panel */}
      {selectedNode && (
        <Box
          sx={{
            position: 'absolute',
            top: 16,
            right: 16,
            bgcolor: 'rgba(0,0,0,0.8)',
            p: 2,
            borderRadius: 2,
            maxWidth: 280
          }}
        >
          <Typography variant="subtitle2" color="white" fontWeight="bold" sx={{ mb: 1 }}>
            {selectedNode.name}
          </Typography>
          <Stack spacing={0.5}>
            <Chip
              size="small"
              label={selectedNode.status}
              sx={{
                bgcolor: getNodeColor(selectedNode),
                color: 'black',
                fontWeight: 'bold'
              }}
            />
            {selectedNode.metrics && (
              <>
                <Typography variant="caption" color="grey.400">
                  Count: {selectedNode.metrics.count || 0}
                </Typography>
                <Typography variant="caption" color="grey.400">
                  Avg: {selectedNode.metrics.avg || 0}ms
                </Typography>
                <Typography variant="caption" color="grey.400">
                  P95: {selectedNode.metrics.p95 || 0}ms
                </Typography>
                <Typography variant="caption" color="grey.400">
                  Errors: {selectedNode.metrics.errors || 0}
                </Typography>
              </>
            )}
          </Stack>
        </Box>
      )}

      {/* Legend */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          bgcolor: 'rgba(0,0,0,0.6)',
          p: 1,
          borderRadius: 1
        }}
      >
        <Stack direction="row" spacing={1}>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CONFIG.colors.nodeOk }} />
            <Typography variant="caption" color="grey.400">OK</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CONFIG.colors.nodeWarning }} />
            <Typography variant="caption" color="grey.400">Slow</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CONFIG.colors.nodeError }} />
            <Typography variant="caption" color="grey.400">Error</Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: CONFIG.colors.nodePending }} />
            <Typography variant="caption" color="grey.400">Active</Typography>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
};

export default TensorGraph;
