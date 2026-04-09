/**
 * @fileoverview 3D Graph Visualization for Incremental Knowledge Graph
 * @module components/IncrementalKG/IncrementalKG3DGraph
 * @version 1.0.0
 *
 * Features:
 * - NEW data highlighted in contrasting color (bright cyan/green)
 * - EXISTING connected data in muted color
 * - Real-time updates during extraction
 * - Interactive 3D navigation
 */

import React, { useRef, useEffect, useMemo, useCallback, useState } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import * as THREE from 'three';
import { Box, Paper, Typography, Stack, Chip, IconButton, Tooltip, Switch, FormControlLabel } from '@mui/material';
import { Maximize2, Minimize2, RotateCcw, Eye, EyeOff } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Color palette for graph visualization
 * NEW data is bright/contrasting, EXISTING data is muted
 */
const COLORS = {
  // NEW data (from current round) - bright contrasting colors
  NEW_NODE: '#00FF88',        // Bright green
  NEW_NODE_GLOW: '#00FFAA',   // Glow effect
  NEW_LINK: '#00FFCC',        // Cyan-green
  NEW_HIGHLIGHT: '#FFFFFF',   // White highlight

  // EXISTING connected data - muted colors
  EXISTING_NODE: '#6B7280',   // Muted gray
  EXISTING_LINK: '#4B5563',   // Dark gray
  EXISTING_CONNECTED: '#9CA3AF', // Lighter gray for connected existing

  // Entity types - NEW variants (bright)
  NEW_PERSON: '#FF6B6B',
  NEW_ORGANIZATION: '#4ECDC4',
  NEW_SYSTEM: '#45B7D1',
  NEW_DOCUMENT: '#96CEB4',
  NEW_FUNCTION: '#DDA0DD',
  NEW_CONCEPT: '#FFD93D',

  // Entity types - EXISTING variants (muted)
  EXISTING_PERSON: '#8B4A4A',
  EXISTING_ORGANIZATION: '#2F7A75',
  EXISTING_SYSTEM: '#2B6A7A',
  EXISTING_DOCUMENT: '#5A7A66',
  EXISTING_FUNCTION: '#8B6B8B',
  EXISTING_CONCEPT: '#8B7A2B',

  // Background
  BACKGROUND: '#0F172A'
};

/**
 * Entity type to color mapping
 */
const getNodeColor = (node, isNew) => {
  const type = (node.type || node.label || 'Entity').toUpperCase();

  if (isNew) {
    switch (type) {
      case 'PERSON': return COLORS.NEW_PERSON;
      case 'ORGANIZATION': return COLORS.NEW_ORGANIZATION;
      case 'SYSTEM': return COLORS.NEW_SYSTEM;
      case 'DOCUMENT': return COLORS.NEW_DOCUMENT;
      case 'FUNCTION': return COLORS.NEW_FUNCTION;
      case 'CONCEPT': return COLORS.NEW_CONCEPT;
      default: return COLORS.NEW_NODE;
    }
  } else {
    switch (type) {
      case 'PERSON': return COLORS.EXISTING_PERSON;
      case 'ORGANIZATION': return COLORS.EXISTING_ORGANIZATION;
      case 'SYSTEM': return COLORS.EXISTING_SYSTEM;
      case 'DOCUMENT': return COLORS.EXISTING_DOCUMENT;
      case 'FUNCTION': return COLORS.EXISTING_FUNCTION;
      case 'CONCEPT': return COLORS.EXISTING_CONCEPT;
      default: return COLORS.EXISTING_NODE;
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 3D Graph for Incremental Knowledge Graph visualization
 * @param {Object} props
 * @param {Object[]} props.newEntities - Entities from current extraction round
 * @param {Object[]} props.newRelationships - Relationships from current extraction
 * @param {Object[]} props.existingEntities - Connected existing entities
 * @param {Object[]} props.existingRelationships - Connected existing relationships
 * @param {number} props.currentRound - Current extraction round number
 * @param {boolean} props.isProcessing - Whether extraction is in progress
 */
const IncrementalKG3DGraph = ({
  newEntities = [],
  newRelationships = [],
  existingEntities = [],
  existingRelationships = [],
  currentRound = 0,
  isProcessing = false,
  onNodeClick,
  height = 500
}) => {
  const graphRef = useRef();
  const containerRef = useRef();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [showExisting, setShowExisting] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [dimensions, setDimensions] = useState({ width: 800, height: height });

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        setDimensions({
          width: width,
          height: isFullscreen ? window.innerHeight - 100 : height
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isFullscreen, height]);

  // Prepare graph data
  const graphData = useMemo(() => {
    const nodes = [];
    const links = [];
    const nodeIds = new Set();

    // Add NEW entities (bright colors)
    newEntities.forEach(entity => {
      const id = entity.id || entity.name;
      if (!nodeIds.has(id)) {
        nodes.push({
          id,
          name: entity.name,
          type: entity.type || entity.graphLabel || 'Entity',
          isNew: true,
          round: currentRound,
          confidence: entity.provenance?.confidence || entity.confidence || 0.8,
          ...entity
        });
        nodeIds.add(id);
      }
    });

    // Add EXISTING connected entities (muted colors)
    if (showExisting) {
      existingEntities.forEach(entity => {
        const id = entity.id || entity.name;
        if (!nodeIds.has(id)) {
          nodes.push({
            id,
            name: entity.name,
            type: entity.type || entity.graphLabel || 'Entity',
            isNew: false,
            round: entity.provenance?.extractionRound || 0,
            confidence: entity.provenance?.confidence || entity.confidence || 0.5,
            isConnectedToNew: true,
            ...entity
          });
          nodeIds.add(id);
        }
      });
    }

    // Add NEW relationships
    newRelationships.forEach(rel => {
      const sourceId = rel.sourceId || rel.source;
      const targetId = rel.targetId || rel.target;

      if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
        links.push({
          source: sourceId,
          target: targetId,
          type: rel.type || 'RELATED_TO',
          isNew: true,
          weight: rel.weight || rel.confidence || 0.5
        });
      }
    });

    // Add EXISTING relationships
    if (showExisting) {
      existingRelationships.forEach(rel => {
        const sourceId = rel.sourceId || rel.source;
        const targetId = rel.targetId || rel.target;

        if (nodeIds.has(sourceId) && nodeIds.has(targetId)) {
          links.push({
            source: sourceId,
            target: targetId,
            type: rel.type || 'RELATED_TO',
            isNew: false,
            weight: rel.weight || rel.confidence || 0.3
          });
        }
      });
    }

    return { nodes, links };
  }, [newEntities, newRelationships, existingEntities, existingRelationships, currentRound, showExisting]);

  // Auto-rotate effect
  useEffect(() => {
    if (graphRef.current && autoRotate && !isProcessing) {
      const controls = graphRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
      }
    }
    return () => {
      if (graphRef.current) {
        const controls = graphRef.current.controls();
        if (controls) {
          controls.autoRotate = false;
        }
      }
    };
  }, [autoRotate, isProcessing]);

  // Focus on new nodes when they appear
  useEffect(() => {
    if (graphRef.current && newEntities.length > 0 && !isProcessing) {
      // Center camera on new nodes
      const newNodes = graphData.nodes.filter(n => n.isNew);
      if (newNodes.length > 0) {
        const centerNode = newNodes[Math.floor(newNodes.length / 2)];
        if (centerNode && centerNode.x !== undefined) {
          graphRef.current.cameraPosition(
            { x: centerNode.x, y: centerNode.y, z: centerNode.z + 200 },
            { x: centerNode.x, y: centerNode.y, z: centerNode.z },
            1000
          );
        }
      }
    }
  }, [newEntities.length]);

  // Custom node rendering with glow effect for new nodes
  const nodeThreeObject = useCallback((node) => {
    const isNew = node.isNew;
    const color = getNodeColor(node, isNew);
    const size = isNew ? 8 : 5;

    // Create group for node + label
    const group = new THREE.Group();

    // Main sphere
    const geometry = new THREE.SphereGeometry(size, 16, 16);
    const material = new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: isNew ? 1.0 : 0.7
    });
    const sphere = new THREE.Mesh(geometry, material);
    group.add(sphere);

    // Glow effect for new nodes
    if (isNew) {
      const glowGeometry = new THREE.SphereGeometry(size * 1.5, 16, 16);
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: COLORS.NEW_NODE_GLOW,
        transparent: true,
        opacity: 0.3
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      group.add(glow);

      // Pulsing animation
      const animate = () => {
        const scale = 1 + 0.1 * Math.sin(Date.now() / 300);
        glow.scale.set(scale, scale, scale);
      };
      group.userData.animate = animate;
    }

    // Label (if enabled)
    if (showLabels) {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;

      context.fillStyle = 'transparent';
      context.fillRect(0, 0, canvas.width, canvas.height);

      context.font = 'bold 24px Arial';
      context.fillStyle = isNew ? '#FFFFFF' : '#9CA3AF';
      context.textAlign = 'center';
      context.fillText(node.name?.substring(0, 20) || 'Entity', 128, 40);

      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        opacity: isNew ? 1.0 : 0.6
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(40, 10, 1);
      sprite.position.set(0, size + 8, 0);
      group.add(sprite);
    }

    return group;
  }, [showLabels]);

  // Link styling
  const linkColor = useCallback((link) => {
    return link.isNew ? COLORS.NEW_LINK : COLORS.EXISTING_LINK;
  }, []);

  const linkWidth = useCallback((link) => {
    return link.isNew ? 2 : 1;
  }, []);

  const linkOpacity = useCallback((link) => {
    return link.isNew ? 0.8 : 0.3;
  }, []);

  // Reset camera
  const handleResetCamera = () => {
    if (graphRef.current) {
      graphRef.current.cameraPosition({ x: 0, y: 0, z: 400 }, { x: 0, y: 0, z: 0 }, 1000);
    }
  };

  // Toggle fullscreen
  const handleToggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Stats for legend
  const stats = useMemo(() => ({
    newNodes: graphData.nodes.filter(n => n.isNew).length,
    existingNodes: graphData.nodes.filter(n => !n.isNew).length,
    newLinks: graphData.links.filter(l => l.isNew).length,
    existingLinks: graphData.links.filter(l => !l.isNew).length
  }), [graphData]);

  return (
    <Paper
      ref={containerRef}
      sx={{
        height: isFullscreen ? 'calc(100vh - 100px)' : height,
        position: 'relative',
        overflow: 'hidden',
        bgcolor: COLORS.BACKGROUND,
        borderRadius: 2
      }}
    >
      {/* Controls */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          bgcolor: 'rgba(0,0,0,0.6)',
          borderRadius: 1,
          p: 0.5
        }}
      >
        <Tooltip title={showLabels ? 'Hide Labels' : 'Show Labels'}>
          <IconButton size="small" onClick={() => setShowLabels(!showLabels)} sx={{ color: 'white' }}>
            {showLabels ? <Eye size={16} /> : <EyeOff size={16} />}
          </IconButton>
        </Tooltip>
        <Tooltip title="Reset Camera">
          <IconButton size="small" onClick={handleResetCamera} sx={{ color: 'white' }}>
            <RotateCcw size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
          <IconButton size="small" onClick={handleToggleFullscreen} sx={{ color: 'white' }}>
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
        </Tooltip>
      </Stack>

      {/* Legend */}
      <Box
        sx={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
          bgcolor: 'rgba(0,0,0,0.7)',
          borderRadius: 1,
          p: 1.5
        }}
      >
        <Typography variant="caption" color="white" fontWeight={600} sx={{ display: 'block', mb: 1 }}>
          Round #{currentRound}
        </Typography>

        <Stack spacing={0.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: COLORS.NEW_NODE, boxShadow: `0 0 8px ${COLORS.NEW_NODE_GLOW}` }} />
            <Typography variant="caption" color="white">
              New ({stats.newNodes})
            </Typography>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: COLORS.EXISTING_CONNECTED }} />
            <Typography variant="caption" color="grey.400">
              Connected ({stats.existingNodes})
            </Typography>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ width: 16, height: 2, bgcolor: COLORS.NEW_LINK }} />
            <Typography variant="caption" color="white">
              New Links ({stats.newLinks})
            </Typography>
          </Stack>

          <Stack direction="row" alignItems="center" spacing={1}>
            <Box sx={{ width: 16, height: 1, bgcolor: COLORS.EXISTING_LINK }} />
            <Typography variant="caption" color="grey.500">
              Existing ({stats.existingLinks})
            </Typography>
          </Stack>
        </Stack>

        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={showExisting}
              onChange={(e) => setShowExisting(e.target.checked)}
              sx={{ '& .MuiSwitch-thumb': { bgcolor: 'white' } }}
            />
          }
          label={<Typography variant="caption" color="grey.400">Show existing</Typography>}
          sx={{ mt: 1, ml: 0 }}
        />
      </Box>

      {/* Processing indicator */}
      {isProcessing && (
        <Box
          sx={{
            position: 'absolute',
            bottom: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            bgcolor: 'rgba(0,255,136,0.2)',
            border: '1px solid',
            borderColor: COLORS.NEW_NODE,
            borderRadius: 2,
            px: 2,
            py: 0.5
          }}
        >
          <Typography variant="caption" color={COLORS.NEW_NODE} fontWeight={600}>
            ● Extracting...
          </Typography>
        </Box>
      )}

      {/* Empty state */}
      {graphData.nodes.length === 0 && (
        <Box
          sx={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            zIndex: 5
          }}
        >
          <Typography variant="h6" color="grey.500">
            No entities extracted yet
          </Typography>
          <Typography variant="body2" color="grey.600">
            Process text to see the knowledge graph
          </Typography>
        </Box>
      )}

      {/* 3D Graph */}
      {graphData.nodes.length > 0 && (
        <ForceGraph3D
          ref={graphRef}
          graphData={graphData}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor={COLORS.BACKGROUND}
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkOpacity={linkOpacity}
          linkDirectionalParticles={link => link.isNew ? 4 : 0}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={2}
          linkDirectionalParticleColor={() => COLORS.NEW_NODE_GLOW}
          onNodeClick={(node) => onNodeClick?.(node)}
          enableNodeDrag={true}
          enableNavigationControls={true}
          showNavInfo={false}
        />
      )}
    </Paper>
  );
};

export default IncrementalKG3DGraph;
