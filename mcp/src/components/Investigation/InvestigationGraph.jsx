/**
 * InvestigationGraph — ReactFlow visualization of an investigation session.
 *
 * Nodes:
 *   ArtifactNode — colored by primitiveType, shows the computed result
 *   KBNode       — grey, represents an KB Entity that provides evidence
 *
 * Edges:
 *   STEP_FOLLOWS  — solid arrow between sequential artifact nodes (program chain)
 *   EVIDENCED_BY  — dashed arrow from artifact to its KB evidence nodes
 */
import React, { useCallback, useMemo, memo } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap,
  Handle, Position, MarkerType,
  useNodesState, useEdgesState,
  BaseEdge, getBezierPath, EdgeLabelRenderer,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Typography, Tooltip } from '@mui/material';
import { Search, Link2, Network, FileText, BookOpen, Cpu, Clock, ScanLine, Braces, Bot, StickyNote } from 'lucide-react';

// ─── Colour palette by primitiveType ────────────────────────────────────────

const ARTIFACT_COLORS = {
  LOCATE:    { bg: '#0f2040', border: '#3b82f6', text: '#93c5fd', icon: Search },
  CONNECT:   { bg: '#1a0f40', border: '#8b5cf6', text: '#c4b5fd', icon: Link2 },
  EXPAND:    { bg: '#0f2a2a', border: '#06b6d4', text: '#67e8f9', icon: Network },
  PROFILE:   { bg: '#2a200f', border: '#f59e0b', text: '#fde047', icon: BookOpen },
  MATRIX:    { bg: '#0f2a1a', border: '#10b981', text: '#6ee7b7', icon: Braces },
  STRUCTURE: { bg: '#2a0f2a', border: '#ec4899', text: '#f9a8d4', icon: Cpu },
  TIMELINE:  { bg: '#2a1a0f', border: '#f97316', text: '#fdba74', icon: Clock },
  RESOLVE:   { bg: '#1a2a0f', border: '#84cc16', text: '#bef264', icon: ScanLine },
  SYNTHESIZE:{ bg: '#1a0f2a', border: '#a78bfa', text: '#ddd6fe', icon: FileText },
  TEXT:      { bg: '#151c28', border: '#475569', text: '#94a3b8', icon: StickyNote },
  FREEFORM:  { bg: '#1e1e2e', border: '#6b7280', text: '#9ca3af', icon: Bot },
};
const KB_COLOR = { bg: '#111827', border: '#374151', text: '#6b7280' };

// ─── ArtifactNode ────────────────────────────────────────────────────────────

const ArtifactNode = memo(({ data, selected }) => {
  const c = ARTIFACT_COLORS[data.primitiveType] || ARTIFACT_COLORS.FREEFORM;
  const Icon = c.icon;
  return (
    <div
      style={{
        background: c.bg,
        border: `2px solid ${selected ? '#ffffff' : c.border}`,
        borderRadius: 10,
        padding: '8px 12px',
        minWidth: 130,
        maxWidth: 180,
        boxShadow: selected
          ? `0 0 0 3px ${c.border}55, 0 0 20px ${c.border}33`
          : `0 0 10px ${c.border}22`,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'box-shadow 0.15s',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <Icon size={12} style={{ color: c.border, flexShrink: 0 }} />
        <span style={{ fontSize: 10, color: c.border, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {data.primitiveType}
        </span>
      </div>
      <div style={{ fontSize: 11, color: c.text, lineHeight: 1.4, wordBreak: 'break-word' }}>
        {data.label}
      </div>
      {data.evidenceCount > 0 && (
        <div style={{ marginTop: 4, fontSize: 9, color: '#64748b' }}>
          {data.evidenceCount} KB ref{data.evidenceCount !== 1 ? 's' : ''}
        </div>
      )}
      {data.isTransplanted && (
        <div style={{ marginTop: 3, fontSize: 9, color: '#818cf8', display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{ fontSize: 8 }}>↗</span> merged from subsession
        </div>
      )}
      {data.supersededBy && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 9, pointerEvents: 'none',
        }}>
          <span style={{ color: '#94a3b8', fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}>SUPERSEDED</span>
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="source" id="evidence" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  );
});
ArtifactNode.displayName = 'ArtifactNode';

// ─── KBNode ──────────────────────────────────────────────────────────────────

const KBNode = memo(({ data, selected }) => (
  <div
    style={{
      background: KB_COLOR.bg,
      border: `1.5px solid ${selected ? '#9ca3af' : KB_COLOR.border}`,
      borderRadius: 6,
      padding: '5px 10px',
      minWidth: 90,
      maxWidth: 140,
      boxShadow: selected ? '0 0 0 2px #374151, 0 0 12px #1f293744' : '0 0 6px #0f172a',
      cursor: 'pointer',
      userSelect: 'none',
      opacity: selected ? 1 : 0.7,
    }}
  >
    <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
    <div style={{ fontSize: 9, color: '#4b5563', fontWeight: 700, letterSpacing: 0.5, marginBottom: 2 }}>
      KB ENTITY
    </div>
    <div style={{ fontSize: 11, color: KB_COLOR.text, lineHeight: 1.4, wordBreak: 'break-word' }}>
      {data.label}
    </div>
  </div>
));
KBNode.displayName = 'KBNode';

// ─── EvidencedByEdge (dashed) ────────────────────────────────────────────────

function EvidencedByEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }) {
  const [path] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <BaseEdge
      id={id}
      path={path}
      style={{ stroke: '#374151', strokeWidth: 1, strokeDasharray: '4 3', opacity: 0.5 }}
    />
  );
}

// ─── Node/Edge type registry ─────────────────────────────────────────────────

const NODE_TYPES = { artifact: ArtifactNode, kb: KBNode };
const EDGE_TYPES = { evidencedBy: EvidencedByEdge };

// ─── Layout helpers ──────────────────────────────────────────────────────────

function buildGraph(artifacts) {
  if (!artifacts.length) return { nodes: [], edges: [] };

  const NODE_W = 160, NODE_H = 80, H_GAP = 220, V_GAP = 140;
  const nodes = [];
  const edges = [];
  const kbPlaced = new Map(); // entityId → position index

  // Artifact nodes in a horizontal chain
  artifacts.forEach((a, i) => {
    const label = _artifactLabel(a);
    nodes.push({
      id: `art-${a.artifactId}`,
      type: 'artifact',
      position: { x: i * H_GAP, y: 0 },
      data: {
        label,
        primitiveType: a.primitiveType,
        artifactId: a.artifactId,
        evidenceCount: (a.evidenceEntityIds || []).filter(id => id !== '__no-evidence__').length,
        isTransplanted: a.isTransplanted || false,
        supersededBy: a.supersededBy || null,
      },
    });

    // STEP_FOLLOWS edge
    if (i > 0) {
      const prev = artifacts[i - 1];
      edges.push({
        id: `step-${prev.artifactId}-${a.artifactId}`,
        source: `art-${prev.artifactId}`,
        target: `art-${a.artifactId}`,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#4b5563', strokeWidth: 1.5 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#4b5563', width: 14, height: 14 },
      });
    }

    // KB nodes + EVIDENCED_BY edges
    const evidenceIds = (a.evidenceEntityIds || []).filter(id => id && id !== '__no-evidence__');
    evidenceIds.forEach((eid, j) => {
      const kbId = `kb-${eid}`;
      if (!kbPlaced.has(eid)) {
        const col = kbPlaced.size;
        nodes.push({
          id: kbId,
          type: 'kb',
          position: { x: col * (NODE_W + 20), y: V_GAP + 50 },
          data: { label: eid.slice(0, 16) + '…', entityId: eid },
        });
        kbPlaced.set(eid, col);
      }
      edges.push({
        id: `ev-${a.artifactId}-${eid}`,
        source: `art-${a.artifactId}`,
        sourceHandle: 'evidence',
        target: kbId,
        type: 'evidencedBy',
      });
    });
  });

  return { nodes, edges };
}

function _artifactLabel(a) {
  switch (a.primitiveType) {
    case 'LOCATE':    return `"${a.content?.query || '?'}"`;
    case 'CONNECT':   return `${(a.content?.fromEntityId || '?').slice(0, 8)}→${(a.content?.toEntityId || '?').slice(0, 8)}`;
    case 'EXPAND':    return `depth ${a.content?.depth || '?'} · ${a.content?.nodeCount || 0} nodes`;
    case 'SYNTHESIZE':return `${a.content?.narrative?.slice(0, 40) || 'synthesis'}…`;
    default:          return a.primitiveType;
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function InvestigationGraph({ artifacts, selectedArtifactId, onSelectArtifact }) {
  const { nodes: initNodes, edges: initEdges } = useMemo(
    () => buildGraph(artifacts),
    [artifacts]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // Sync when artifacts change
  React.useEffect(() => {
    const { nodes: n, edges: e } = buildGraph(artifacts);
    setNodes(n);
    setEdges(e);
  }, [artifacts]);

  // Highlight selected
  React.useEffect(() => {
    setNodes(ns =>
      ns.map(n => ({
        ...n,
        selected: n.id === `art-${selectedArtifactId}`,
      }))
    );
  }, [selectedArtifactId]);

  const onNodeClick = useCallback((_, node) => {
    if (node.type === 'artifact') {
      onSelectArtifact(node.data.artifactId);
    }
  }, [onSelectArtifact]);

  if (!artifacts.length) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
        <div style={{ textAlign: 'center' }}>
          <Network size={40} />
          <p style={{ marginTop: 12, fontSize: 13 }}>Run a primitive to build the investigation graph</p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={onNodeClick}
      nodeTypes={NODE_TYPES}
      edgeTypes={EDGE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.2 }}
      minZoom={0.2}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#1e293b" gap={20} />
      <Controls showInteractive={false} style={{ bottom: 8, right: 8, left: 'auto' }} />
      <MiniMap
        nodeColor={n => {
          if (n.type === 'artifact') return (ARTIFACT_COLORS[n.data?.primitiveType] || ARTIFACT_COLORS.FREEFORM).border;
          return KB_COLOR.border;
        }}
        style={{ background: '#0f172a', border: '1px solid #1e293b' }}
        maskColor="#0f172a99"
      />
    </ReactFlow>
  );
}
