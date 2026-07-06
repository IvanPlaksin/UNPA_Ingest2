import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  Box, Button, CircularProgress, Alert, Typography, Slider,
  Tooltip, Chip, Divider,
} from '@mui/material';
import { Network, RefreshCw, Database } from 'lucide-react';
import ForceGraph3D from 'react-force-graph-3d';
import { getKNNGraph } from '../../services/vectorStore.service';

const TYPE_COLORS = {
  ACTOR: '#3b82f6', ORGANIZATION: '#3b82f6', CONCEPT: '#06b6d4',
  DOCUMENT: '#8b5cf6', DOCUMENTREF: '#8b5cf6', EVENT: '#eab308',
  PROCESS: '#eab308', PERSON: '#22c55e', TECHNOLOGY: '#a855f7',
  POLICY: '#ef4444', SYSTEM: '#0891b2', WORK_ITEM: '#6b7280',
  UNKNOWN: '#6b7280',
};

function getNodeColor(node) {
  return TYPE_COLORS[(node.entityType ?? '').toUpperCase()] ?? '#6b7280';
}

function fmtAge(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60)  return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function ControlSlider({ label, value, onChange, min, max, step, fmt }) {
  return (
    <Box sx={{ minWidth: 120, flex: '1 1 120px' }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
        {label}: <b style={{ color: '#e2e8f0' }}>{fmt ? fmt(value) : value}</b>
      </Typography>
      <Slider size="small" value={value} onChange={(_, v) => onChange(v)}
        min={min} max={max} step={step} />
    </Box>
  );
}

export default function KnnGraph({ collection, filters = {}, onNodeClick }) {
  const mountRef  = useRef(null);
  const graphRef  = useRef(null);

  // ── Graph data params (affect API / cache key) ──
  const [k,         setK]         = useState(5);
  const [nodeLimit, setNodeLimit] = useState(100);

  // ── Display params (client-side only) ──
  const [nodeSize,    setNodeSize]    = useState(3);
  const [minSim,      setMinSim]      = useState(0);
  const [linkOpacity, setLinkOpacity] = useState(0.6);

  // ── State ──
  const [rawGraph,  setRawGraph]  = useState(null);   // full server response
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [cacheInfo, setCacheInfo] = useState(null);   // { cached, cachedAt }

  // Apply minSim filter client-side — no round-trip needed
  const graphData = useMemo(() => {
    if (!rawGraph) return null;
    const links = minSim > 0
      ? rawGraph.links.filter(l => (l.similarity ?? 1) >= minSim)
      : rawGraph.links;
    return { nodes: rawGraph.nodes, links };
  }, [rawGraph, minSim]);

  const fetchGraph = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getKNNGraph(collection, { k, limit: nodeLimit, force, ...filters });
      const { _cached, _cachedAt, nodes, links } = data;
      setRawGraph({ nodes, links });
      setCacheInfo({ cached: _cached, cachedAt: _cachedAt });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [collection, k, nodeLimit, filters]);

  const containerH = mountRef.current?.clientHeight || 400;
  const containerW = mountRef.current?.clientWidth  || 600;

  const visibleNodes  = graphData?.nodes?.length  ?? 0;
  const visibleLinks  = graphData?.links?.length  ?? 0;
  const totalLinks    = rawGraph?.links?.length   ?? 0;
  const hiddenLinks   = totalLinks - visibleLinks;

  // Nearest round 100 strictly above the actual node count; fallback 500 when no graph loaded yet
  const nodeLimitMax = rawGraph?.nodes?.length != null
    ? Math.ceil((rawGraph.nodes.length + 1) / 100) * 100
    : 500;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 1.5 }}>

      {/* ── Controls row 1: data params ── */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <ControlSlider label="Nodes" value={nodeLimit} onChange={setNodeLimit}
          min={50} max={nodeLimitMax} step={50} />
        <ControlSlider label="k neighbors" value={k} onChange={setK}
          min={2} max={15} step={1} />
        <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />

        {/* ── Display params ── */}
        <ControlSlider label="Node size" value={nodeSize} onChange={setNodeSize}
          min={1} max={10} step={0.5} />
        <ControlSlider label="Min similarity" value={minSim} onChange={setMinSim}
          min={0} max={0.99} step={0.01} fmt={v => v.toFixed(2)} />
        <ControlSlider label="Link opacity" value={linkOpacity} onChange={setLinkOpacity}
          min={0.05} max={1} step={0.05} fmt={v => v.toFixed(2)} />
      </Box>

      {/* ── Controls row 2: actions + cache status ── */}
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button
          variant="contained" size="small"
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Network size={14} />}
          onClick={() => fetchGraph(false)}
          disabled={loading}
        >
          {loading ? 'Building…' : 'Build Graph'}
        </Button>

        {cacheInfo?.cached && (
          <Tooltip title="Bypass cache and recompute">
            <Button variant="outlined" size="small" color="warning"
              startIcon={<RefreshCw size={13} />}
              onClick={() => fetchGraph(true)}
              disabled={loading}
              sx={{ fontSize: '0.72rem', py: 0.3 }}
            >
              Force rebuild
            </Button>
          </Tooltip>
        )}

        {cacheInfo && (
          <Chip
            icon={<Database size={11} />}
            label={cacheInfo.cached
              ? `Cached · ${fmtAge(cacheInfo.cachedAt)}`
              : 'Fresh · just built'}
            size="small"
            sx={{
              height: 22, fontSize: '0.68rem',
              bgcolor: cacheInfo.cached ? '#0f2918' : '#0f1726',
              color:   cacheInfo.cached ? '#4ade80' : '#60a5fa',
              border:  `1px solid ${cacheInfo.cached ? '#4ade8040' : '#3b82f640'}`,
              '& .MuiChip-icon': { color: 'inherit', ml: '6px' },
            }}
          />
        )}

        {hiddenLinks > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
            {hiddenLinks} edges hidden by min-similarity filter
          </Typography>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ py: 0 }}>{error}</Alert>}

      {/* ── Graph canvas ── */}
      <Box ref={mountRef} sx={{ flex: 1, minHeight: 0, position: 'relative', borderRadius: 1,
                                overflow: 'hidden', bgcolor: '#0d1117' }}>
        {!graphData && !loading && (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                     color: 'text.secondary', flexDirection: 'column', gap: 1 }}>
            <Network size={32} />
            <Typography variant="body2">Click "Build Graph" to visualize k-NN structure</Typography>
          </Box>
        )}

        {graphData && (
          <ForceGraph3D
            ref={graphRef}
            width={containerW || 600}
            height={containerH || 400}
            graphData={graphData}
            nodeLabel={node => `${node.name} (${node.entityType ?? '?'})`}
            nodeColor={getNodeColor}
            nodeOpacity={0.9}
            nodeResolution={8}
            nodeVal={nodeSize}
            linkWidth={link => Math.max(0.3, (link.similarity ?? 0.5) * 2)}
            linkColor={() => '#334155'}
            linkOpacity={linkOpacity}
            backgroundColor="#0d1117"
            onNodeClick={node => onNodeClick?.(node)}
            enableNodeDrag={true}
            enableNavigationControls={true}
          />
        )}

        {/* ── Stats overlay ── */}
        {graphData && (
          <Box sx={{
            position: 'absolute', top: 8, right: 8,
            bgcolor: 'rgba(13,17,23,0.85)', border: '1px solid #1e293b',
            borderRadius: 1, px: 1.5, py: 0.5, fontSize: 13, color: '#94a3b8',
            display: 'flex', flexDirection: 'column', gap: 0.25, alignItems: 'flex-end',
          }}>
            <span>{visibleNodes} nodes · {visibleLinks} edges · k={k}</span>
            {hiddenLinks > 0 && (
              <span style={{ color: '#64748b', fontSize: 12 }}>
                ({hiddenLinks} edges filtered)
              </span>
            )}
            {cacheInfo?.cached && (
              <span style={{ color: '#4ade8080', fontSize: 12 }}>
                cache: {fmtAge(cacheInfo.cachedAt)}
              </span>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}
