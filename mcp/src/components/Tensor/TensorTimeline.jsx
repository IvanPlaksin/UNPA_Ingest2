/**
 * TensorTimeline - Gantt-style visualization of tensor execution chains
 * Shows temporal sequence of tensor operations with causal relationships
 */

import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  Box, Typography, Paper, Stack, Chip, Tooltip, IconButton, Slider, ToggleButtonGroup, ToggleButton
} from '@mui/material';
import {
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon
} from '@mui/icons-material';

// Color palette for different tensor types
const TYPE_COLORS = {
  'db.memgraph': '#4CAF50',
  'db.redis': '#F44336',
  'db.qdrant': '#9C27B0',
  'ai.llm': '#2196F3',
  'ai.extraction': '#00BCD4',
  'gxe.mcp': '#FF9800',
  'gxe.claude': '#E91E63',
  'default': '#607D8B'
};

const STATUS_COLORS = {
  'completed': '#4CAF50',
  'failed': '#F44336',
  'started': '#2196F3'
};

const TensorTimeline = ({ tensors = [], timeWindow = 60000, height = 300 }) => {
  const containerRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredTensor, setHoveredTensor] = useState(null);
  const [selectedTypes, setSelectedTypes] = useState([]);

  // Process tensors into timeline data
  const timelineData = useMemo(() => {
    if (!tensors?.length) return { rows: [], minTime: 0, maxTime: 0, types: [] };

    const now = Date.now();
    const windowStart = now - timeWindow;

    // Filter tensors within time window
    const filtered = tensors.filter(t => {
      const startTime = t.startTime || t.timestamp;
      return startTime >= windowStart;
    });

    if (!filtered.length) return { rows: [], minTime: windowStart, maxTime: now, types: [] };

    // Get unique types
    const types = [...new Set(filtered.map(t => t.name?.split('.').slice(0, 2).join('.') || 'unknown'))];

    // Apply type filter
    const typesToShow = selectedTypes.length > 0 ? selectedTypes : types;
    const filteredByType = filtered.filter(t => {
      const type = t.name?.split('.').slice(0, 2).join('.') || 'unknown';
      return typesToShow.includes(type);
    });

    // Group by process chains (parent relationships)
    const chains = new Map();
    const orphans = [];

    filteredByType.forEach(tensor => {
      if (tensor.parentId) {
        const rootId = findRootParent(tensor, filteredByType);
        if (!chains.has(rootId)) {
          chains.set(rootId, []);
        }
        chains.get(rootId).push(tensor);
      } else {
        if (!chains.has(tensor.id)) {
          chains.set(tensor.id, []);
        }
        chains.get(tensor.id).unshift(tensor);
      }
    });

    // Build rows
    const rows = [];
    chains.forEach((chainTensors, rootId) => {
      // Sort by start time
      chainTensors.sort((a, b) => (a.startTime || a.timestamp) - (b.startTime || b.timestamp));

      const root = chainTensors[0];
      const type = root?.name?.split('.').slice(0, 2).join('.') || 'unknown';

      rows.push({
        id: rootId,
        type,
        tensors: chainTensors,
        minTime: Math.min(...chainTensors.map(t => t.startTime || t.timestamp)),
        maxTime: Math.max(...chainTensors.map(t => (t.endTime || t.startTime || t.timestamp) + (t.duration || 0)))
      });
    });

    // Sort rows by start time
    rows.sort((a, b) => a.minTime - b.minTime);

    return {
      rows,
      minTime: windowStart,
      maxTime: now,
      types
    };
  }, [tensors, timeWindow, selectedTypes]);

  // Find root parent of a tensor
  function findRootParent(tensor, allTensors) {
    let current = tensor;
    let iterations = 0;
    while (current.parentId && iterations < 100) {
      const parent = allTensors.find(t => t.id === current.parentId);
      if (!parent) break;
      current = parent;
      iterations++;
    }
    return current.id;
  }

  // Calculate position and width for a tensor bar
  const getBarStyle = (tensor) => {
    const { minTime, maxTime } = timelineData;
    const totalTime = maxTime - minTime;
    if (totalTime <= 0) return { left: 0, width: 0 };

    const startTime = tensor.startTime || tensor.timestamp;
    const duration = tensor.duration || (Date.now() - startTime);

    const left = ((startTime - minTime) / totalTime) * 100 * zoom;
    const width = Math.max(2, (duration / totalTime) * 100 * zoom);

    return { left: `${left}%`, width: `${Math.min(width, 100)}%` };
  };

  // Get color for tensor type
  const getTypeColor = (name) => {
    const type = name?.split('.').slice(0, 2).join('.');
    return TYPE_COLORS[type] || TYPE_COLORS.default;
  };

  // Format duration
  const formatDuration = (ms) => {
    if (!ms || ms < 0) return '0ms';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Handle zoom
  const handleZoom = (delta) => {
    setZoom(prev => Math.max(0.5, Math.min(5, prev + delta)));
  };

  if (!timelineData.rows.length) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'background.default' }}>
        <Typography color="text.secondary">
          No tensor activity in the last {timeWindow / 1000} seconds
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, bgcolor: 'background.paper' }}>
      {/* Header with controls */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold">
          Tensor Execution Timeline
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          {/* Type filter */}
          <Stack direction="row" spacing={0.5} sx={{ mr: 2 }}>
            {timelineData.types.slice(0, 5).map(type => (
              <Chip
                key={type}
                label={type}
                size="small"
                onClick={() => {
                  setSelectedTypes(prev =>
                    prev.includes(type)
                      ? prev.filter(t => t !== type)
                      : [...prev, type]
                  );
                }}
                sx={{
                  bgcolor: selectedTypes.includes(type) || selectedTypes.length === 0
                    ? TYPE_COLORS[type] || TYPE_COLORS.default
                    : 'action.disabledBackground',
                  color: 'white',
                  opacity: selectedTypes.length === 0 || selectedTypes.includes(type) ? 1 : 0.5,
                  '&:hover': { opacity: 0.8 }
                }}
              />
            ))}
          </Stack>

          {/* Zoom controls */}
          <IconButton size="small" onClick={() => handleZoom(-0.25)}>
            <ZoomOutIcon fontSize="small" />
          </IconButton>
          <Typography variant="caption" sx={{ minWidth: 40, textAlign: 'center' }}>
            {Math.round(zoom * 100)}%
          </Typography>
          <IconButton size="small" onClick={() => handleZoom(0.25)}>
            <ZoomInIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Stack>

      {/* Time axis */}
      <Box sx={{ position: 'relative', height: 20, borderBottom: 1, borderColor: 'divider', mb: 1 }}>
        {[0, 25, 50, 75, 100].map(pct => (
          <Typography
            key={pct}
            variant="caption"
            color="text.secondary"
            sx={{
              position: 'absolute',
              left: `${pct}%`,
              transform: 'translateX(-50%)',
              fontSize: 10
            }}
          >
            {pct === 100 ? 'now' : `-${Math.round((100 - pct) * timeWindow / 100000)}s`}
          </Typography>
        ))}
      </Box>

      {/* Timeline rows */}
      <Box
        ref={containerRef}
        sx={{
          height,
          overflowY: 'auto',
          overflowX: 'hidden',
          position: 'relative'
        }}
      >
        {timelineData.rows.map((row, rowIndex) => (
          <Box
            key={row.id}
            sx={{
              position: 'relative',
              height: 32,
              borderBottom: 1,
              borderColor: 'divider',
              '&:hover': { bgcolor: 'action.hover' }
            }}
          >
            {/* Row label */}
            <Typography
              variant="caption"
              sx={{
                position: 'absolute',
                left: 4,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 2,
                bgcolor: 'background.paper',
                px: 0.5,
                borderRadius: 0.5,
                maxWidth: 100,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontSize: 10
              }}
            >
              {row.type}
            </Typography>

            {/* Tensor bars */}
            {row.tensors.map((tensor, idx) => {
              const barStyle = getBarStyle(tensor);
              const isHovered = hoveredTensor === tensor.id;
              const color = tensor.state === 'failed'
                ? STATUS_COLORS.failed
                : getTypeColor(tensor.name);

              return (
                <Tooltip
                  key={tensor.id}
                  title={
                    <Box>
                      <Typography variant="caption" fontWeight="bold">{tensor.name}</Typography>
                      <Typography variant="caption" display="block">
                        Duration: {formatDuration(tensor.duration)}
                      </Typography>
                      <Typography variant="caption" display="block">
                        Status: {tensor.state}
                      </Typography>
                      {tensor.context && Object.keys(tensor.context).length > 0 && (
                        <Typography variant="caption" display="block" sx={{ opacity: 0.7 }}>
                          {JSON.stringify(tensor.context).substring(0, 100)}
                        </Typography>
                      )}
                    </Box>
                  }
                  placement="top"
                >
                  <Box
                    onMouseEnter={() => setHoveredTensor(tensor.id)}
                    onMouseLeave={() => setHoveredTensor(null)}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      height: 24,
                      left: barStyle.left,
                      width: barStyle.width,
                      minWidth: 4,
                      bgcolor: color,
                      borderRadius: 0.5,
                      cursor: 'pointer',
                      opacity: isHovered ? 1 : 0.85,
                      transform: isHovered ? 'scaleY(1.1)' : 'none',
                      transition: 'all 0.15s ease',
                      boxShadow: isHovered ? 2 : 0,
                      border: tensor.state === 'started' ? '2px solid white' : 'none',
                      // Nested depth indicator
                      borderLeft: idx > 0 ? `2px solid ${color}` : 'none',
                      ml: idx > 0 ? 0.5 : 0,
                      '&::after': tensor.parentId ? {
                        content: '""',
                        position: 'absolute',
                        left: -8,
                        top: '50%',
                        width: 8,
                        height: 1,
                        bgcolor: 'grey.500'
                      } : {}
                    }}
                  >
                    {/* Duration label inside bar if wide enough */}
                    {parseFloat(barStyle.width) > 5 && (
                      <Typography
                        variant="caption"
                        sx={{
                          position: 'absolute',
                          left: 4,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: 'white',
                          fontSize: 11,
                          fontWeight: 'bold',
                          textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                        }}
                      >
                        {formatDuration(tensor.duration)}
                      </Typography>
                    )}
                  </Box>
                </Tooltip>
              );
            })}
          </Box>
        ))}
      </Box>

      {/* Legend */}
      <Stack direction="row" spacing={2} sx={{ mt: 2, pt: 1, borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">Legend:</Typography>
        {Object.entries(TYPE_COLORS).filter(([k]) => k !== 'default').slice(0, 6).map(([type, color]) => (
          <Stack key={type} direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 12, height: 12, bgcolor: color, borderRadius: 0.5 }} />
            <Typography variant="caption" color="text.secondary">{type}</Typography>
          </Stack>
        ))}
        <Stack direction="row" spacing={0.5} alignItems="center">
          <Box sx={{ width: 12, height: 12, bgcolor: STATUS_COLORS.failed, borderRadius: 0.5 }} />
          <Typography variant="caption" color="text.secondary">failed</Typography>
        </Stack>
      </Stack>
    </Paper>
  );
};

export default TensorTimeline;
