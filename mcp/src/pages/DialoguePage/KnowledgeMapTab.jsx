/**
 * KnowledgeMapTab — 3D Vector Knowledge Field for DevDialogue Collector.
 *
 * Renders the semantic knowledge map of entities extracted from chat sessions.
 * Each node = one unique entity (technology / component / concept).
 * Spatial proximity = semantic similarity (UMAP embedding space).
 *
 * Interactions:
 *   Orbit      — left-drag to rotate, scroll to zoom, right-drag to pan
 *   Hover      — entity name label appears
 *   Click      — open EntityDetailPanel (right sidebar)
 *   SearchBar  — semantic search via API, nearest nodes highlighted + camera flies to centroid
 *   TypeFilter — toggle entity types on/off
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import ForceGraph3D from 'react-force-graph-3d';
import {
  Box, Typography, Chip, CircularProgress, TextField, IconButton,
  Paper, Stack, Divider, Tooltip, ToggleButton, ToggleButtonGroup,
  List, ListItem, ListItemText, Alert,
} from '@mui/material';
import {
  Search, Clear, Refresh, OpenInNew, ContentCopy, Check,
  Hub, Code, Psychology, Lightbulb,
} from '@mui/icons-material';
import * as THREE from 'three';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ── Colour palette by entity type ─────────────────────────────────────────────

const TYPE_COLOR = {
  technology: '#4fc3f7',   // light-blue
  component:  '#81c784',   // green
  concept:    '#ce93d8',   // purple
  decision:   '#ffb74d',   // orange
  person:     '#fff176',   // yellow
};

const TYPE_ICON = {
  technology: <Code sx={{ fontSize: 14 }} />,
  component:  <Hub sx={{ fontSize: 14 }} />,
  concept:    <Psychology sx={{ fontSize: 14 }} />,
  decision:   <Lightbulb sx={{ fontSize: 14 }} />,
};

const ALL_TYPES = Object.keys(TYPE_COLOR);

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

function useEntities() {
  const [entities, setEntities] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const [stats,    setStats]    = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/dialogue/knowledge-map/entities?limit=2000`),
        fetch(`${API_BASE}/dialogue/knowledge-map/stats`),
      ]);
      const entData   = await entRes.json();
      const statsData = await statsRes.json();
      setEntities(entData.entities || []);
      setStats(statsData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { entities, loading, error, stats, reload: load };
}

// ── Entity Detail Panel ────────────────────────────────────────────────────────

function EntityDetailPanel({ entity, onClose }) {
  const [detail,  setDetail]  = useState(null);
  const [copied,  setCopied]  = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!entity) return;
    setDetail(null);
    setLoading(true);
    fetch(`${API_BASE}/dialogue/knowledge-map/entity/${entity.entityId || entity.id}`)
      .then(r => r.json())
      .then(d => setDetail(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entity]);

  if (!entity) return null;

  const sessions = detail?.sessions || [];
  const typeColor = TYPE_COLOR[entity.type] || '#aaa';

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Paper
      elevation={4}
      sx={{
        position: 'absolute', right: 16, top: 16, bottom: 16,
        width: 320, zIndex: 10, display: 'flex', flexDirection: 'column',
        bgcolor: 'rgba(18,18,18,0.96)', backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ p: 2, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box sx={{ flex: 1, mr: 1 }}>
            <Typography variant="subtitle1" fontWeight={700} sx={{ color: typeColor, lineHeight: 1.3 }}>
              {entity.name}
            </Typography>
            <Chip
              label={entity.type}
              size="small"
              sx={{ mt: 0.5, height: 18, fontSize: 10, bgcolor: typeColor + '22', color: typeColor }}
            />
          </Box>
          <IconButton size="small" onClick={onClose} sx={{ color: 'text.secondary', mt: -0.5 }}>
            <Clear fontSize="small" />
          </IconButton>
        </Stack>

        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Chip label={`× ${entity.frequency ?? 1} sessions`} size="small" variant="outlined"
            sx={{ height: 20, fontSize: 10, color: 'text.secondary' }} />
          {entity.cluster != null && entity.cluster >= 0 && (
            <Chip label={`Cluster ${entity.cluster}`} size="small" variant="outlined"
              sx={{ height: 20, fontSize: 10, color: 'text.secondary' }} />
          )}
          {entity.confidence && (
            <Chip label={`${Math.round(entity.confidence * 100)}% conf`} size="small" variant="outlined"
              sx={{ height: 20, fontSize: 10, color: 'text.secondary' }} />
          )}
        </Stack>
      </Box>

      {/* Context summary */}
      {entity.contextSummary && (
        <Box sx={{ px: 2, pt: 1.5 }}>
          <Typography variant="caption" color="text.disabled" fontWeight={600}>CONTEXT</Typography>
          <Typography variant="body2" sx={{ mt: 0.5, color: 'text.secondary', fontSize: 12, lineHeight: 1.5 }}>
            {entity.contextSummary}
          </Typography>
        </Box>
      )}

      <Divider sx={{ mt: 1.5, borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* Source sessions */}
      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 1 }}>
        <Typography variant="caption" color="text.disabled" fontWeight={600}>
          SOURCE SESSIONS {loading ? '…' : `(${sessions.length})`}
        </Typography>
        {loading && <CircularProgress size={14} sx={{ ml: 1, mt: 0.5, display: 'block' }} />}
        <List dense disablePadding sx={{ mt: 0.5 }}>
          {sessions.map(s => (
            <ListItem key={s.sessionId} disablePadding sx={{ py: 0.5 }}>
              <ListItemText
                primary={s.title || s.sessionId.slice(0, 16) + '…'}
                secondary={s.branch || ''}
                primaryTypographyProps={{ variant: 'caption', sx: { color: 'text.primary', lineHeight: 1.3 } }}
                secondaryTypographyProps={{ variant: 'caption', sx: { color: 'text.disabled', fontSize: 10 } }}
              />
              <Tooltip title="Open in Claude Code">
                <IconButton size="small" onClick={() => { window.location.href = `vscode://devdialogue.connector/open/${s.sessionId}`; }}>
                  <OpenInNew sx={{ fontSize: 13, color: 'text.disabled' }} />
                </IconButton>
              </Tooltip>
            </ListItem>
          ))}
          {!loading && sessions.length === 0 && (
            <Typography variant="caption" color="text.disabled">No sessions found</Typography>
          )}
        </List>
      </Box>

      {/* Footer — copy entity id */}
      <Box sx={{ px: 2, py: 1, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Stack direction="row" alignItems="center" spacing={0.5}>
          <Typography variant="caption" color="text.disabled" sx={{ fontFamily: 'monospace', fontSize: 10, flex: 1 }}>
            {(entity.entityId || entity.id || '').slice(0, 18)}…
          </Typography>
          <Tooltip title={copied ? 'Copied!' : 'Copy entity ID'}>
            <IconButton size="small" onClick={() => copy(entity.entityId || entity.id)}>
              {copied ? <Check sx={{ fontSize: 12, color: 'success.main' }} /> : <ContentCopy sx={{ fontSize: 12, color: 'text.disabled' }} />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Box>
    </Paper>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function KnowledgeMapTab() {
  const graphRef  = useRef();
  const { entities, loading, error, stats, reload } = useEntities();

  const [selectedTypes,   setSelectedTypes]   = useState(ALL_TYPES);
  const [selectedEntity,  setSelectedEntity]  = useState(null);
  const [searchQuery,     setSearchQuery]      = useState('');
  const [searchResults,   setSearchResults]    = useState(null); // null = no search, [] = no results
  const [searchLoading,   setSearchLoading]    = useState(false);
  const [highlightIds,    setHighlightIds]     = useState(new Set());
  const [refreshing,      setRefreshing]       = useState(false);
  const [hoverEntity,     setHoverEntity]      = useState(null);

  // ── Build graph data for react-force-graph-3d ─────────────────────────────

  const graphData = useMemo(() => {
    const filtered = entities.filter(e => selectedTypes.includes(e.type));
    const nodes = filtered.map(e => ({
      id:       e.entityId || e.id,
      name:     e.name,
      type:     e.type,
      val:      Math.max(1, Math.log2((e.frequency || 1) + 1)) * 3,
      color:    TYPE_COLOR[e.type] || '#888',
      x:        e.x ?? null,
      y:        e.y ?? null,
      z:        e.z ?? null,
      cluster:  e.cluster,
      _entity:  e,
    }));
    // Edges: connect entities in the same cluster
    const links = [];
    const byCluster = {};
    nodes.forEach(n => {
      if (n.cluster != null && n.cluster >= 0) {
        if (!byCluster[n.cluster]) byCluster[n.cluster] = [];
        byCluster[n.cluster].push(n.id);
      }
    });
    Object.values(byCluster).forEach(ids => {
      for (let i = 0; i < ids.length - 1; i++) {
        links.push({ source: ids[i], target: ids[ids.length - 1], cluster: true });
      }
    });
    return { nodes, links };
  }, [entities, selectedTypes]);

  // Use pre-computed UMAP coordinates as initial positions — disable physics after settle
  const [engineStopped, setEngineStopped] = useState(false);
  useEffect(() => {
    const hasLayout = entities.some(e => e.x != null);
    if (hasLayout) {
      setTimeout(() => {
        graphRef.current?.d3Force('link')?.strength(0);
        graphRef.current?.d3Force('charge')?.strength(-20);
        graphRef.current?.d3Force('center')?.strength(0.02);
        setEngineStopped(false);
      }, 100);
    }
  }, [entities]);

  // ── 3-sphere node renderer ─────────────────────────────────────────────────

  const nodeThreeObject = useCallback((node) => {
    const isHighlighted = highlightIds.size > 0 && highlightIds.has(node.id);
    const isSelected    = selectedEntity?.entityId === node.id || selectedEntity?.id === node.id;
    const isHovered     = hoverEntity?.id === node.id;

    const radius = node.val * (isHighlighted || isSelected ? 1.6 : 1);
    const geo = new THREE.SphereGeometry(radius, 12, 12);
    const color = isSelected ? '#ffffff'
      : isHighlighted ? node.color
      : highlightIds.size > 0 ? '#333'
      : node.color;
    const mat = new THREE.MeshPhongMaterial({
      color,
      opacity:      isHighlighted || isSelected || highlightIds.size === 0 ? 1 : 0.25,
      transparent:  true,
      shininess:    80,
      emissive:     isSelected || isHovered ? new THREE.Color(color) : new THREE.Color(0),
      emissiveIntensity: isSelected ? 0.4 : isHovered ? 0.2 : 0,
    });
    return new THREE.Mesh(geo, mat);
  }, [highlightIds, selectedEntity, hoverEntity]);

  const linkColor = useCallback((link) => {
    if (!link.cluster) return 'rgba(100,100,100,0.1)';
    return 'rgba(120,120,120,0.15)';
  }, []);

  // ── Semantic search ────────────────────────────────────────────────────────

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      setHighlightIds(new Set());
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`${API_BASE}/dialogue/knowledge-map/search`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ query: searchQuery, topK: 15 }),
      });
      const data = await res.json();
      const results = data.results || [];
      setSearchResults(results);
      const ids = new Set(results.map(r => r.entityId || r.id));
      setHighlightIds(ids);

      // Fly camera to centroid of results
      if (results.length > 0 && graphRef.current) {
        const nodes = graphData.nodes.filter(n => ids.has(n.id));
        if (nodes.length > 0) {
          const cx = nodes.reduce((s, n) => s + (n.x || 0), 0) / nodes.length;
          const cy = nodes.reduce((s, n) => s + (n.y || 0), 0) / nodes.length;
          const cz = nodes.reduce((s, n) => s + (n.z || 0), 0) / nodes.length;
          graphRef.current.cameraPosition({ x: cx + 40, y: cy + 30, z: cz + 80 }, { x: cx, y: cy, z: cz }, 1200);
        }
      }
    } catch { /* non-fatal */ }
    finally { setSearchLoading(false); }
  }, [searchQuery, graphData.nodes]);

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults(null);
    setHighlightIds(new Set());
  };

  // ── Layout refresh ─────────────────────────────────────────────────────────

  const refreshLayout = async () => {
    setRefreshing(true);
    try {
      await fetch(`${API_BASE}/dialogue/knowledge-map/layout/refresh`, { method: 'POST' });
      await reload();
    } catch { /* non-fatal */ }
    finally { setRefreshing(false); }
  };

  // ── Type filter ────────────────────────────────────────────────────────────

  const handleTypeFilter = (_e, newTypes) => {
    if (newTypes.length === 0) return;
    setSelectedTypes(newTypes);
    setSelectedEntity(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasLayout = entities.some(e => e.x != null);

  return (
    <Box sx={{
      position: 'relative',
      height: 'calc(100vh - 220px)',
      minHeight: 500,
      bgcolor: '#0a0a0f',
      borderRadius: 2,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>

      {/* ── Top toolbar ─────────────────────────────────────────────────── */}
      <Box sx={{
        position: 'absolute', top: 12, left: 12, right: selectedEntity ? 348 : 12,
        zIndex: 10, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap',
      }}>
        {/* Search */}
        <Paper sx={{
          display: 'flex', alignItems: 'center', px: 1.5, py: 0.5,
          bgcolor: 'rgba(30,30,40,0.9)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, flex: 1, maxWidth: 360,
        }}>
          <Search sx={{ fontSize: 16, color: 'text.secondary', mr: 1 }} />
          <TextField
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runSearch()}
            placeholder="Search knowledge field…"
            variant="standard"
            fullWidth
            InputProps={{ disableUnderline: true, sx: { fontSize: 13, color: 'text.primary' } }}
          />
          {searchLoading && <CircularProgress size={14} sx={{ ml: 1 }} />}
          {searchQuery && !searchLoading && (
            <IconButton size="small" onClick={clearSearch}><Clear sx={{ fontSize: 14 }} /></IconButton>
          )}
          {searchQuery && !searchLoading && (
            <IconButton size="small" onClick={runSearch}><Search sx={{ fontSize: 14, color: 'primary.main' }} /></IconButton>
          )}
        </Paper>

        {/* Type filter */}
        <ToggleButtonGroup value={selectedTypes} onChange={handleTypeFilter} size="small" sx={{
          bgcolor: 'rgba(30,30,40,0.9)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2,
        }}>
          {ALL_TYPES.map(type => (
            <ToggleButton key={type} value={type} sx={{
              px: 1.5, py: 0.5, border: 'none', textTransform: 'none',
              color: selectedTypes.includes(type) ? TYPE_COLOR[type] : 'text.disabled',
              fontSize: 11,
              '&.Mui-selected': { bgcolor: 'transparent', color: TYPE_COLOR[type] },
            }}>
              {type}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {/* Stats & refresh */}
        <Paper sx={{
          display: 'flex', alignItems: 'center', px: 1.5, gap: 1,
          bgcolor: 'rgba(30,30,40,0.9)', backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, height: 36,
        }}>
          {stats && (
            <>
              <Typography variant="caption" color="text.secondary">{stats.totalEntities} entities</Typography>
              {stats.clusterCount > 0 && (
                <Typography variant="caption" color="text.disabled">· {stats.clusterCount} clusters</Typography>
              )}
            </>
          )}
          <Tooltip title={hasLayout ? 'Recompute UMAP layout' : 'Compute 3D layout (requires gnn-service)'}>
            <span>
              <IconButton size="small" onClick={refreshLayout} disabled={refreshing}>
                {refreshing ? <CircularProgress size={14} /> : <Refresh sx={{ fontSize: 16, color: 'text.secondary' }} />}
              </IconButton>
            </span>
          </Tooltip>
        </Paper>
      </Box>

      {/* ── Search result chips ──────────────────────────────────────────── */}
      {searchResults !== null && (
        <Box sx={{ position: 'absolute', bottom: 12, left: 12, zIndex: 10, maxWidth: 600 }}>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
            {searchResults.length === 0 ? (
              <Chip label="No results" size="small" sx={{ bgcolor: 'rgba(30,30,40,0.9)', color: 'text.secondary' }} />
            ) : searchResults.map(r => (
              <Chip
                key={r.entityId || r.id}
                label={`${r.name} ${Math.round((r.score || 0) * 100)}%`}
                size="small"
                onClick={() => setSelectedEntity(r)}
                sx={{
                  bgcolor: 'rgba(30,30,40,0.9)', cursor: 'pointer',
                  color: TYPE_COLOR[r.type] || 'text.primary',
                  border: `1px solid ${TYPE_COLOR[r.type] || '#555'}44`,
                }}
              />
            ))}
          </Stack>
        </Box>
      )}

      {/* ── Loading / empty states ───────────────────────────────────────── */}
      {loading && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
          <Stack alignItems="center" spacing={1}>
            <CircularProgress size={32} />
            <Typography variant="caption" color="text.secondary">Loading knowledge field…</Typography>
          </Stack>
        </Box>
      )}

      {!loading && error && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
          <Alert severity="error" sx={{ maxWidth: 400 }}>
            Failed to load knowledge map: {error}
            <br />Make sure the API is running on {API_BASE}
          </Alert>
        </Box>
      )}

      {!loading && !error && entities.length === 0 && (
        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5 }}>
          <Stack alignItems="center" spacing={2} sx={{ maxWidth: 400, textAlign: 'center' }}>
            <Hub sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography variant="h6" color="text.secondary">Knowledge field is empty</Typography>
            <Typography variant="body2" color="text.disabled">
              Re-analyze chat sessions to extract entities and populate the knowledge map.
              Then click Refresh to compute the 3D layout.
            </Typography>
          </Stack>
        </Box>
      )}

      {!loading && !error && entities.length > 0 && !hasLayout && (
        <Box sx={{ position: 'absolute', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 5 }}>
          <Alert severity="info" sx={{ bgcolor: 'rgba(30,30,40,0.95)' }}>
            Entities loaded but 3D layout not yet computed.
            Click <strong>Refresh</strong> to run UMAP (requires gnn-service on port 5001).
          </Alert>
        </Box>
      )}

      {/* ── 3D Graph ─────────────────────────────────────────────────────── */}
      {!loading && !error && graphData.nodes.length > 0 && (
        <ForceGraph3D
          ref={graphRef}
          graphData={graphData}
          backgroundColor="#0a0a0f"
          nodeThreeObject={nodeThreeObject}
          nodeThreeObjectExtend={false}
          nodeLabel={node => `<div style="background:rgba(0,0,0,.8);padding:4px 8px;border-radius:4px;font-size:12px;color:${node.color};font-family:sans-serif">${node.name}<br/><span style="color:#888;font-size:10px">${node.type}</span></div>`}
          linkColor={linkColor}
          linkWidth={0.3}
          linkOpacity={0.15}
          onNodeClick={node => setSelectedEntity(node._entity)}
          onNodeHover={node => setHoverEntity(node)}
          onBackgroundClick={() => { setSelectedEntity(null); setHoverEntity(null); }}
          enableNodeDrag={!engineStopped}
          cooldownTicks={hasLayout ? 30 : 120}
          onEngineStop={() => setEngineStopped(true)}
          d3AlphaDecay={hasLayout ? 0.05 : 0.02}
          d3VelocityDecay={0.4}
          showNavInfo={false}
        />
      )}

      {/* ── Hover label ──────────────────────────────────────────────────── */}
      {hoverEntity && !selectedEntity && (
        <Box sx={{
          position: 'absolute', bottom: 50, left: '50%', transform: 'translateX(-50%)',
          zIndex: 10, pointerEvents: 'none',
        }}>
          <Paper sx={{
            px: 1.5, py: 0.5, bgcolor: 'rgba(20,20,30,0.95)',
            border: `1px solid ${TYPE_COLOR[hoverEntity.type] || '#555'}66`,
            borderRadius: 1,
          }}>
            <Typography variant="caption" sx={{ color: TYPE_COLOR[hoverEntity.type] || '#fff', fontWeight: 600 }}>
              {hoverEntity.name}
            </Typography>
            <Typography variant="caption" color="text.disabled" sx={{ ml: 1 }}>
              {hoverEntity.type} · ×{hoverEntity._entity?.frequency ?? 1}
            </Typography>
          </Paper>
        </Box>
      )}

      {/* ── Entity Detail Panel ───────────────────────────────────────────── */}
      <EntityDetailPanel
        entity={selectedEntity}
        onClose={() => setSelectedEntity(null)}
      />

      {/* ── Legend ──────────────────────────────────────────────────────── */}
      <Box sx={{ position: 'absolute', bottom: 12, right: selectedEntity ? 348 : 12, zIndex: 10 }}>
        <Stack spacing={0.5}>
          {ALL_TYPES.map(type => (
            <Stack key={type} direction="row" alignItems="center" spacing={0.75}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: TYPE_COLOR[type] }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                {type} {stats?.byType?.[type] ? `(${stats.byType[type]})` : ''}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
