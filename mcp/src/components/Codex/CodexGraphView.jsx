/**
 * CodexGraphView — interactive Codex graph with lazy expansion.
 *
 * Two layout modes:
 *   1. Circular — when nothing is expanded (Parts + ADRs + cross-refs)
 *   2. Tree    — when any node is expanded (subtree widths prevent overlaps)
 *
 * Click ▶ on Part  → lazy-loads Sections.
 * Click ▶ on Section → lazy-loads Rules.
 * Rules render in a grid (max 8 cols) to stay compact.
 */
import React, { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, MarkerType,
  Handle, Position, useNodesState, useEdgesState,
  ReactFlowProvider, useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Typography, Chip, CircularProgress, IconButton } from '@mui/material';
import { ChevronRight, ChevronDown, Loader2, Book, FileText, CheckSquare } from 'lucide-react';
import { useCodexGraph, fetchGraphChildren } from '../../hooks/useCodex';

// ────────────────────────────────────────────────────────
// Dimensions & gaps (px)
// ────────────────────────────────────────────────────────
const DIM = {
  part:    { w: 225, h: 88 },
  section: { w: 195, h: 74 },
  rule:    { w: 155, h: 58 },
  adr:     { w: 135, h: 52 },
};
const GAP   = { x: 30, y: 60 };   // between siblings / levels
const LEVEL_GAP = 55;              // extra vertical padding between levels
const RULE_COLS = 8;               // max rules per row in grid

const MODALITY_COLORS = {
  MUST: '#ef5350', SHOULD: '#ffa726', MAY: '#42a5f5',
  MUST_NOT: '#ec407a', SHOULD_NOT: '#ffca28', DESCRIPTIVE: '#78909c',
  mandatory: '#ef5350', recommended: '#ffa726', optional: '#42a5f5',
  prohibited: '#ec407a', mapping: '#66bb6a', descriptive: '#78909c',
};

// ────────────────────────────────────────────────────────
// Layout: circular (no expansion)
// ────────────────────────────────────────────────────────
function circularPositions(parts) {
  const cx = 600, cy = 500, r = 320;
  const pos = {};
  parts.forEach((p, i) => {
    const a = (i / parts.length) * 2 * Math.PI - Math.PI / 2;
    pos[p.partId] = { x: cx + r * Math.cos(a) - DIM.part.w / 2, y: cy + r * Math.sin(a) - DIM.part.h / 2 };
  });
  return pos;
}

function circularAdrPositions(adrLinks) {
  const unique = [...new Map(adrLinks.map(a => [a.adrId, a])).values()];
  const cx = 600, cy = 500, r = 520;
  const pos = {};
  unique.forEach((adr, i) => {
    const a = (i / Math.max(unique.length, 1)) * 2 * Math.PI - Math.PI / 2;
    pos[adr.adrId] = { x: cx + r * Math.cos(a) - DIM.adr.w / 2, y: cy + r * Math.sin(a) - DIM.adr.h / 2 };
  });
  return pos;
}

// ────────────────────────────────────────────────────────
// Layout: tree (with expansion) — subtree-width algorithm
// ────────────────────────────────────────────────────────
function treePositions(parts, adrLinks, expanded) {
  const pos = {};

  // ── Bottom-up: compute subtree widths ──

  /** Width needed for a section's rule grid */
  function ruleGridWidth(secId) {
    const e = expanded[secId];
    if (!e || e.childType !== 'rule') return 0;
    const n = (e.children || []).length;
    const cols = Math.min(n, RULE_COLS);
    return cols * (DIM.rule.w + GAP.x);
  }

  /** Width needed for a section subtree (itself + rules below) */
  function sectionWidth(secId) {
    return Math.max(DIM.section.w + GAP.x, ruleGridWidth(secId));
  }

  /** Width needed for a part subtree (itself + sections + rules) */
  function partWidth(partId) {
    const e = expanded[partId];
    if (!e || e.childType !== 'section') return DIM.part.w + GAP.x;
    const secs = e.children || [];
    const total = secs.reduce((sum, sec) => sum + sectionWidth(sec.sectionId || sec.codexId), 0);
    return Math.max(DIM.part.w + GAP.x, total);
  }

  // ── Top-down: assign positions ──

  const partWidths = parts.map(p => partWidth(p.partId));

  // Y levels
  const Y0 = 0;                                            // parts
  const Y1 = DIM.part.h + GAP.y + LEVEL_GAP;               // sections
  const Y2 = Y1 + DIM.section.h + GAP.y + LEVEL_GAP;       // rules

  let x = 0;
  parts.forEach((part, idx) => {
    const pw = partWidths[idx];
    // Centre the part node within its subtree band
    pos[part.partId] = { x: x + pw / 2 - DIM.part.w / 2, y: Y0 };

    const partExp = expanded[part.partId];
    if (partExp && partExp.childType === 'section') {
      let secX = x;
      for (const sec of partExp.children) {
        const secId = sec.sectionId || sec.codexId;
        const sw = sectionWidth(secId);
        pos[secId] = { x: secX + sw / 2 - DIM.section.w / 2, y: Y1 };

        // Rules grid
        const secExp = expanded[secId];
        if (secExp && secExp.childType === 'rule') {
          (secExp.children || []).forEach((rule, ri) => {
            const col = ri % RULE_COLS;
            const row = Math.floor(ri / RULE_COLS);
            pos[rule.ruleId || rule.codexId] = {
              x: secX + col * (DIM.rule.w + GAP.x),
              y: Y2 + row * (DIM.rule.h + GAP.y),
            };
          });
        }
        secX += sw;
      }
    }
    x += pw;
  });

  // ADRs — column to the right of the tree
  const rightEdge = x + GAP.x * 2;
  const unique = [...new Map(adrLinks.map(a => [a.adrId, a])).values()];
  unique.forEach((adr, i) => {
    pos[adr.adrId] = { x: rightEdge, y: i * (DIM.adr.h + GAP.y) };
  });

  return pos;
}

// ────────────────────────────────────────────────────────
// Node components (unchanged from previous version)
// ────────────────────────────────────────────────────────

function ExpandButton({ expanded, loading, hasChildren, onClick }) {
  if (!hasChildren) return null;
  return (
    <IconButton
      size="small"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      sx={{
        p: 0.25, ml: 0.5,
        color: expanded ? '#4fd1c5' : '#a0aec0',
        '&:hover': { color: '#81e6d9', bgcolor: 'rgba(79,209,197,0.12)' }
      }}
    >
      {loading
        ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
        : expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
    </IconButton>
  );
}

function PartNodeComponent({ data }) {
  return (
    <Box sx={{
      px: 2, py: 1.25, bgcolor: '#1a1a2e', border: '2px solid #4fd1c5', borderRadius: 2,
      minWidth: 170, maxWidth: 220, cursor: 'pointer',
      '&:hover': { borderColor: '#81e6d9', boxShadow: '0 0 14px rgba(79,209,197,0.3)' }
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25 }}>
            <Book size={12} style={{ color: '#4fd1c5', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '9px', color: '#4fd1c5', fontFamily: 'monospace' }}>{data.partId}</Typography>
          </Box>
          <Typography sx={{ fontSize: '11.5px', fontWeight: 600, color: '#e2e8f0', lineHeight: 1.25, mb: 0.5 }}>
            {data.title?.replace(/^CODEX-\w+:\s*/, '').slice(0, 45)}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip label={`${data.sectionCount || 0} sec`} size="small"
              sx={{ height: 16, fontSize: '8.5px', bgcolor: 'rgba(79,209,197,0.12)', color: '#4fd1c5' }} />
            <Chip label={`${data.ruleCount || 0} rules`} size="small"
              sx={{ height: 16, fontSize: '8.5px', bgcolor: 'rgba(79,209,197,0.12)', color: '#4fd1c5' }} />
          </Box>
        </Box>
        <ExpandButton
          expanded={data.expanded} loading={data.loadingChildren}
          hasChildren={(data.sectionCount || 0) > 0}
          onClick={() => data.onToggle(data.partId)}
        />
      </Box>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
    </Box>
  );
}

function SectionNodeComponent({ data }) {
  return (
    <Box sx={{
      px: 1.5, py: 1, bgcolor: '#142136', border: '1.5px solid #63b3ed', borderRadius: 1.5,
      minWidth: 140, maxWidth: 190, cursor: 'pointer',
      '&:hover': { borderColor: '#90cdf4', boxShadow: '0 0 10px rgba(99,179,237,0.25)' }
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        <Box sx={{ flex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.15 }}>
            <FileText size={11} style={{ color: '#63b3ed', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '8.5px', color: '#63b3ed', fontFamily: 'monospace' }}>{data.sectionId}</Typography>
          </Box>
          <Typography sx={{ fontSize: '10.5px', fontWeight: 500, color: '#e2e8f0', lineHeight: 1.25, mb: 0.3 }}>
            {data.title?.slice(0, 40)}
          </Typography>
          {(data.ruleCount || 0) > 0 && (
            <Chip label={`${data.ruleCount} rules`} size="small"
              sx={{ height: 15, fontSize: '8px', bgcolor: 'rgba(99,179,237,0.12)', color: '#63b3ed' }} />
          )}
        </Box>
        <ExpandButton
          expanded={data.expanded} loading={data.loadingChildren}
          hasChildren={(data.ruleCount || 0) > 0}
          onClick={() => data.onToggle(data.sectionId)}
        />
      </Box>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
    </Box>
  );
}

function RuleNodeComponent({ data }) {
  const modColor = MODALITY_COLORS[data.modality] || '#78909c';
  return (
    <Box sx={{
      px: 1.25, py: 0.75, bgcolor: '#1e1530', border: `1.5px solid ${modColor}`, borderRadius: 1,
      minWidth: 110, maxWidth: 160, cursor: 'pointer',
      '&:hover': { boxShadow: `0 0 8px ${modColor}40` }
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.15 }}>
        <CheckSquare size={10} style={{ color: modColor, flexShrink: 0 }} />
        <Typography sx={{ fontSize: '7.5px', color: modColor, fontFamily: 'monospace' }}>{data.ruleId}</Typography>
      </Box>
      <Typography sx={{ fontSize: '9.5px', color: '#e2e8f0', lineHeight: 1.2 }}>{data.title?.slice(0, 35)}</Typography>
      {data.modality && (
        <Chip label={data.modality} size="small"
          sx={{ height: 14, fontSize: '7.5px', mt: 0.3, bgcolor: `${modColor}20`, color: modColor, fontWeight: 700 }} />
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
    </Box>
  );
}

function ADRNodeComponent({ data }) {
  return (
    <Box sx={{
      px: 1.5, py: 1, bgcolor: '#1a2e1a', border: '1.5px solid #66bb6a',
      borderRadius: 1.5, minWidth: 100, textAlign: 'center'
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0, width: 1, height: 1 }} />
      <Typography sx={{ fontSize: '9px', color: '#66bb6a', fontFamily: 'monospace' }}>{data.adrId}</Typography>
      <Typography sx={{ fontSize: '10px', color: '#c8e6c9', lineHeight: 1.2 }}>{data.title?.slice(0, 30)}</Typography>
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0, width: 1, height: 1 }} />
    </Box>
  );
}

const nodeTypes = {
  partNode: PartNodeComponent,
  sectionNode: SectionNodeComponent,
  ruleNode: RuleNodeComponent,
  adrNode: ADRNodeComponent,
};

// ────────────────────────────────────────────────────────
// Inner component (uses useReactFlow for auto-fitView)
// ────────────────────────────────────────────────────────
function CodexGraphInner({ parts, crossRefs, adrLinks, loading, error, onSelectPart, onSelect }) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const [expanded, setExpanded] = useState({});
  const [loadingNodes, setLoadingNodes] = useState(new Set());
  const expandedRef = useRef({});
  useEffect(() => { expandedRef.current = expanded; }, [expanded]);

  // Stable toggle — reads from ref, never stale
  const handleToggle = useCallback(async (nodeId) => {
    if (expandedRef.current[nodeId]) {
      setExpanded(prev => {
        const next = { ...prev };
        const children = next[nodeId]?.children || [];
        for (const child of children) {
          const childId = child.sectionId || child.ruleId;
          if (childId && next[childId]) delete next[childId];
        }
        delete next[nodeId];
        return next;
      });
      return;
    }

    setLoadingNodes(prev => new Set(prev).add(nodeId));
    try {
      const data = await fetchGraphChildren(nodeId);
      if (data.children.length > 0) {
        setExpanded(prev => ({ ...prev, [nodeId]: data }));
      }
    } catch (err) {
      console.error('[CodexGraph] expand error:', err);
    } finally {
      setLoadingNodes(prev => { const n = new Set(prev); n.delete(nodeId); return n; });
    }
  }, []);

  // Track node count for fitView trigger
  const prevNodeCount = useRef(0);

  // ──────── Build graph whenever data/expansion changes ────────
  useEffect(() => {
    if (!parts.length) return;

    const hasExpansion = Object.keys(expanded).length > 0;
    const newNodes = [];
    const newEdges = [];

    // ── Compute positions ──
    let pos;
    if (hasExpansion) {
      pos = treePositions(parts, adrLinks, expanded);
    } else {
      pos = {
        ...circularPositions(parts),
        ...circularAdrPositions(adrLinks),
      };
    }

    // ── Parts ──
    parts.forEach(part => {
      newNodes.push({
        id: part.partId,
        type: 'partNode',
        position: pos[part.partId] || { x: 0, y: 0 },
        data: {
          ...part,
          expanded: !!expanded[part.partId],
          loadingChildren: loadingNodes.has(part.partId),
          onToggle: handleToggle,
        }
      });
    });

    // ── ADRs ──
    const uniqueAdrs = [...new Map(adrLinks.map(a => [a.adrId, a])).values()];
    uniqueAdrs.forEach(adr => {
      newNodes.push({
        id: adr.adrId,
        type: 'adrNode',
        position: pos[adr.adrId] || { x: 0, y: 0 },
        data: { adrId: adr.adrId, title: adr.adrTitle }
      });
    });

    // ── Cross-ref edges ──
    crossRefs.forEach((cr, i) => {
      newEdges.push({
        id: `cr-${i}`, source: cr.source, target: cr.target,
        animated: true, label: cr.reason?.slice(0, 25),
        labelStyle: { fontSize: 9, fill: '#a0aec0' },
        style: { stroke: '#4fd1c5', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#4fd1c5', width: 12, height: 12 }
      });
    });

    // ── ADR edges ──
    adrLinks.forEach((al, i) => {
      newEdges.push({
        id: `adr-${i}`, source: al.adrId, target: al.partId,
        style: { stroke: '#66bb6a', strokeWidth: 1, strokeDasharray: '4 2' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#66bb6a', width: 10, height: 10 }
      });
    });

    // ── Expanded sections + rules ──
    for (const [parentId, expData] of Object.entries(expanded)) {
      if (expData.childType === 'section') {
        const children = expData.children || [];
        children.forEach((sec, i) => {
          const secId = sec.sectionId || sec.codexId;
          newNodes.push({
            id: secId,
            type: 'sectionNode',
            position: pos[secId] || { x: 0, y: 0 },
            data: {
              ...sec,
              sectionId: secId,
              expanded: !!expanded[secId],
              loadingChildren: loadingNodes.has(secId),
              onToggle: handleToggle,
            }
          });
          newEdges.push({
            id: `hs-${parentId}-${secId}`,
            source: parentId, target: secId,
            style: { stroke: '#63b3ed', strokeWidth: 1.2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#63b3ed', width: 10, height: 10 },
            label: i === 0 ? 'HAS_SECTION' : undefined,
            labelStyle: { fontSize: 8, fill: '#63b3ed' },
          });
        });
      }

      if (expData.childType === 'rule') {
        const rules = expData.children || [];
        rules.forEach((rule, ri) => {
          const ruleId = rule.ruleId || rule.codexId;
          newNodes.push({
            id: ruleId,
            type: 'ruleNode',
            position: pos[ruleId] || { x: 0, y: 0 },
            data: { ...rule, ruleId }
          });
          newEdges.push({
            id: `cr-${parentId}-${ruleId}`,
            source: parentId, target: ruleId,
            style: { stroke: '#d6bcfa', strokeWidth: 1 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#d6bcfa', width: 8, height: 8 },
            label: ri === 0 ? 'CONTAINS_RULE' : undefined,
            labelStyle: { fontSize: 7, fill: '#d6bcfa' },
          });
        });
      }
    }

    setNodes(newNodes);
    setEdges(newEdges);

    // Auto-fit when node count changes (expansion/collapse)
    if (newNodes.length !== prevNodeCount.current) {
      prevNodeCount.current = newNodes.length;
      setTimeout(() => fitView({ duration: 350, padding: 0.15 }), 80);
    }
  }, [parts, crossRefs, adrLinks, expanded, loadingNodes, handleToggle, setNodes, setEdges, fitView]);

  // ──────── Node click ────────
  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'partNode' && onSelectPart) onSelectPart(node.id);
    if (onSelect) {
      const typeMap = { partNode: 'part', sectionNode: 'section', ruleNode: 'rule', adrNode: 'adr' };
      onSelect(node.data, typeMap[node.type] || node.type);
    }
  }, [onSelectPart, onSelect]);

  // ──────── Loading / error ────────
  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><CircularProgress size={30} /></Box>;
  }
  if (error) {
    return <Box sx={{ p: 2, color: 'error.main' }}>Error: {error}</Box>;
  }

  const expandedSections = Object.values(expanded).filter(e => e.childType === 'section').reduce((s, e) => s + e.children.length, 0);
  const expandedRules = Object.values(expanded).filter(e => e.childType === 'rule').reduce((s, e) => s + e.children.length, 0);

  return (
    <Box sx={{ height: '100%', position: 'relative' }}>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Legend */}
      <Box sx={{
        position: 'absolute', top: 10, left: 10, zIndex: 10,
        bgcolor: 'rgba(26,26,46,0.92)', p: 1.5, borderRadius: 1,
        border: '1px solid rgba(79,209,197,0.2)', backdropFilter: 'blur(4px)'
      }}>
        <Typography sx={{ fontSize: '11px', fontWeight: 600, color: '#e2e8f0', mb: 0.75 }}>Codex Architecture</Typography>
        {[
          { color: '#4fd1c5', label: 'Part' },
          { color: '#63b3ed', label: 'Section (HAS_SECTION)' },
          { color: '#d6bcfa', label: 'Rule (CONTAINS_RULE)' },
          { color: '#66bb6a', label: 'ADR (IMPLEMENTS)', dashed: true },
          { color: '#4fd1c5', label: 'RELATED_TO' },
        ].map(({ color, label, dashed }) => (
          <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.35 }}>
            <Box sx={{ width: 16, height: dashed ? 0 : 2, bgcolor: dashed ? 'transparent' : color, borderTop: dashed ? `2px dashed ${color}` : 'none' }} />
            <Typography sx={{ fontSize: '9.5px', color: '#a0aec0' }}>{label}</Typography>
          </Box>
        ))}
        <Typography sx={{ fontSize: '9px', color: '#718096', mt: 0.5 }}>
          {parts.length} parts
          {expandedSections > 0 && ` · ${expandedSections} sections`}
          {expandedRules > 0 && ` · ${expandedRules} rules`}
          {` · ${crossRefs.length} cross-refs`}
        </Typography>
        <Typography sx={{ fontSize: '8.5px', color: '#4a5568', mt: 0.25 }}>Click ▶ on nodes to expand</Typography>
      </Box>

      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes} onNodeClick={onNodeClick}
        fitView fitViewOptions={{ padding: 0.2 }}
        minZoom={0.08} maxZoom={2.5}
        defaultEdgeOptions={{ type: 'default' }}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#2d3748" gap={20} variant="dots" />
        <Controls position="bottom-right" />
        <MiniMap
          nodeColor={(n) => ({ partNode: '#4fd1c5', sectionNode: '#63b3ed', ruleNode: '#d6bcfa', adrNode: '#66bb6a' }[n.type] || '#4fd1c5')}
          maskColor="rgba(0,0,0,0.7)"
          style={{ backgroundColor: '#1a1a2e' }}
        />
      </ReactFlow>
    </Box>
  );
}

// ────────────────────────────────────────────────────────
// Outer wrapper — provides ReactFlowProvider
// ────────────────────────────────────────────────────────
export default function CodexGraphView({ onSelectPart, onSelect }) {
  const { parts, crossRefs, adrLinks, loading, error } = useCodexGraph();

  return (
    <ReactFlowProvider>
      <CodexGraphInner
        parts={parts} crossRefs={crossRefs} adrLinks={adrLinks}
        loading={loading} error={error}
        onSelectPart={onSelectPart} onSelect={onSelect}
      />
    </ReactFlowProvider>
  );
}
