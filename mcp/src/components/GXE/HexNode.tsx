/**
 * HexNode.tsx — Hexagonal ReactFlow node with PortHub strips
 *
 * Ports live on narrow rectangular strips (PortHub) at the top (incoming)
 * and bottom (outgoing) flat edges of the hexagon.
 *
 * Handle IDs: hex-in-{i} for incoming, hex-out-{i} for outgoing.
 *
 * PortHub styling: light background, border color matches hex node border.
 * Click on PortHub opens a tooltip showing port/edge details.
 */

import React, { memo, useState, useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { HexGridConfig } from '../../utils/hex-coords';

// ── Types ────────────────────────────────────────────────────────────────

export type HexNodeType =
  | 'business' | 'executor' | 'actor' | 'ai'
  | 'input' | 'output' | 'condition' | 'tool' | 'subgraph';

export type HexNodeStatus = 'idle' | 'running' | 'done' | 'error' | 'selected' | 'waiting';

export interface PortEdgeInfo {
  id: string;
  label?: string;
  sourceLabel?: string;
  targetLabel?: string;
  type?: string;
  data?: Record<string, any>;
}

export interface HexNodeData {
  label: string;
  kind?: string;
  nodeType?: HexNodeType;
  hexConfig?: HexGridConfig;
  status?: HexNodeStatus;
  description?: string;
  toolId?: string;
  executorType?: string;
  duration?: number;
  highlighted?: boolean;
  dimmed?: boolean;
  isToolRef?: boolean;
  hasSubGraph?: boolean;
  _inCount?: number;
  _outCount?: number;
  _inEdges?: PortEdgeInfo[];
  _outEdges?: PortEdgeInfo[];
  [key: string]: any;
}

// ── Constants ────────────────────────────────────────────────────────────

const SQRT3 = Math.sqrt(3);
const PORT_DOT_SIZE = 5;
const STRIP_HEIGHT = 12;

// ── Handle ID helpers (exported for useHexLayout routing) ────────────────

export function hexInHandleId(index: number): string {
  return `hex-in-${index}`;
}

export function hexOutHandleId(index: number): string {
  return `hex-out-${index}`;
}

// ── Port pixel position in WORLD coordinates (exported for routing) ──────

export function hexPortPixel(
  hexCenter: { x: number; y: number },
  hexSize: number,
  portType: 'source' | 'target',
  portIndex: number,
  portCount: number,
): { x: number; y: number } {
  const count = Math.max(portCount, 1);
  const stripWidth = hexSize;
  return {
    x: hexCenter.x - stripWidth / 2 + (portIndex + 0.5) * stripWidth / count,
    y: portType === 'target'
      ? hexCenter.y - hexSize * SQRT3 / 2
      : hexCenter.y + hexSize * SQRT3 / 2,
  };
}

// ── Style Maps ───────────────────────────────────────────────────────────

const NODE_TYPE_STYLES: Record<string, {
  bg: string; border: string; text: string; glow: string;
}> = {
  business:  { bg: '#1e293b', border: '#3b82f6', text: '#93c5fd', glow: 'rgba(59,130,246,.5)' },
  executor:  { bg: '#1a2e1a', border: '#22c55e', text: '#86efac', glow: 'rgba(34,197,94,.5)' },
  actor:     { bg: '#2e1a2e', border: '#a855f7', text: '#d8b4fe', glow: 'rgba(168,85,247,.5)' },
  ai:        { bg: '#2e2a1a', border: '#eab308', text: '#fde047', glow: 'rgba(234,179,8,.5)' },
  input:     { bg: '#1a2e2e', border: '#06b6d4', text: '#67e8f9', glow: 'rgba(6,182,212,.5)' },
  output:    { bg: '#2e1a2a', border: '#ec4899', text: '#f9a8d4', glow: 'rgba(236,72,153,.5)' },
  condition: { bg: '#2e2e1a', border: '#f59e0b', text: '#fcd34d', glow: 'rgba(245,158,11,.5)' },
  tool:      { bg: '#1a1a0e', border: '#d97706', text: '#fbbf24', glow: 'rgba(217,119,6,.5)' },
  subgraph:  { bg: '#1a1a2e', border: '#8b5cf6', text: '#c4b5fd', glow: 'rgba(139,92,246,.5)' },
};

const DEFAULT_STYLE = NODE_TYPE_STYLES.executor;

// ── Helpers ──────────────────────────────────────────────────────────────

function hexagonPath(size: number): string {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i);
    pts.push({ x: size * Math.cos(angle), y: size * Math.sin(angle) });
  }
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x},${p.y}`).join(' ') + ' Z';
}

function getStatusColor(status: string): string | null {
  switch (status) {
    case 'done': return '#22c55e';
    case 'error': return '#ef4444';
    case 'waiting': return '#f59e0b';
    default: return null;
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'running': return '⟳';
    case 'done': return '✓';
    case 'error': return '✗';
    case 'waiting': return '⏳';
    default: return '';
  }
}

// ── PortHub Tooltip — shows port/edge details on click ───────────────────

const PortHubTooltip: React.FC<{
  edges: PortEdgeInfo[];
  type: 'source' | 'target';
  color: string;
  hexSize: number;
  onClose: () => void;
}> = ({ edges, type, color, hexSize, onClose }) => {
  const isTarget = type === 'target';
  const hexH = hexSize * SQRT3;
  const stripLeft = hexSize / 2;

  return (
    <div
      style={{
        position: 'absolute',
        left: stripLeft - 20,
        top: isTarget ? -STRIP_HEIGHT - 6 : hexH + STRIP_HEIGHT / 2 + 4,
        width: hexSize + 40,
        maxHeight: 180,
        overflowY: 'auto',
        backgroundColor: 'rgba(240, 246, 252, 0.97)',
        border: `1.5px solid ${color}`,
        borderRadius: 6,
        padding: '6px 8px',
        zIndex: 100,
        fontSize: 10,
        color: '#1e293b',
        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        pointerEvents: 'all',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{isTarget ? 'Incoming' : 'Outgoing'} Ports ({edges.length})</span>
        <span onClick={onClose} style={{ cursor: 'pointer', fontSize: 12, opacity: 0.6 }}>x</span>
      </div>
      {edges.length === 0 && <div style={{ opacity: 0.5 }}>No connections</div>}
      {edges.map((edge, i) => (
        <div key={edge.id || i} style={{
          padding: '3px 0',
          borderTop: i > 0 ? '1px solid rgba(0,0,0,0.08)' : 'none',
        }}>
          <div style={{ fontWeight: 600 }}>
            Port {i}: {edge.label || edge.id}
          </div>
          {edge.type && (
            <div style={{ opacity: 0.7 }}>Type: {edge.type}</div>
          )}
          <div style={{ opacity: 0.6 }}>
            {isTarget
              ? `From: ${edge.sourceLabel || '?'}`
              : `To: ${edge.targetLabel || '?'}`}
          </div>
        </div>
      ))}
    </div>
  );
};

// ── HexPortHub — narrow strip with individual port handles ───────────────

const HexPortHub: React.FC<{
  type: 'source' | 'target';
  count: number;
  hexSize: number;
  color: string;
  edges?: PortEdgeInfo[];
  isConnectable?: boolean;
}> = ({ type, count, hexSize, color, edges, isConnectable }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isTarget = type === 'target';
  const prefix = isTarget ? 'hex-in' : 'hex-out';
  const portCount = count || 0;
  const hexH = hexSize * SQRT3;
  const stripWidth = hexSize;
  const stripLeft = hexSize / 2;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowTooltip(prev => !prev);
  }, []);

  // No ports → no PortHub
  if (portCount === 0) return null;

  // 1+ ports — light strip with colored border
  const stripTop = isTarget
    ? -STRIP_HEIGHT / 2
    : hexH - STRIP_HEIGHT / 2;

  return (
    <>
      <div
        onClick={handleClick}
        style={{
          position: 'absolute',
          left: stripLeft,
          top: stripTop,
          width: stripWidth,
          height: STRIP_HEIGHT,
          borderRadius: 4,
          backgroundColor: 'rgba(240, 246, 252, 0.92)',
          border: `1.5px solid ${color}`,
          zIndex: 5,
          cursor: 'pointer',
        }}
      >
        {Array.from({ length: portCount }, (_, i) => {
          const portX = (i + 0.5) * stripWidth / portCount - PORT_DOT_SIZE / 2;
          const portY = (STRIP_HEIGHT - PORT_DOT_SIZE) / 2;
          return (
            <Handle
              key={`${prefix}-${i}`}
              type={type}
              position={isTarget ? Position.Top : Position.Bottom}
              id={`${prefix}-${i}`}
              isConnectable={isConnectable}
              style={{
                position: 'absolute',
                left: portX,
                top: portY,
                width: PORT_DOT_SIZE,
                height: PORT_DOT_SIZE,
                background: color,
                border: `1px solid ${color}`,
                borderRadius: '50%',
                transform: 'none',
              }}
            />
          );
        })}
      </div>
      {showTooltip && edges && (
        <PortHubTooltip
          edges={edges}
          type={type}
          color={color}
          hexSize={hexSize}
          onClose={() => setShowTooltip(false)}
        />
      )}
    </>
  );
};

// ── Component ────────────────────────────────────────────────────────────

const HexNode: React.FC<NodeProps<HexNodeData>> = ({
  data,
  selected,
  isConnectable,
}) => {
  const kind = data.kind || data.nodeType || 'executor';
  const status = selected ? 'selected' : (data.status || 'idle');
  const hexSize = data.hexConfig?.hexSize || 100;
  const styles = NODE_TYPE_STYLES[kind] || DEFAULT_STYLE;

  const hexW = hexSize * 2;
  const hexH = hexSize * SQRT3;

  const inCount = data._inCount ?? 0;
  const outCount = data._outCount ?? 0;

  const isRunning = status === 'running' || status === 'waiting';
  const statusBorder = getStatusColor(status);
  const glowIntensity = isRunning ? 0.6 : status === 'selected' ? 0.5 : status === 'done' ? 0.3 : 0.1;
  const glowShadow = `0 0 ${20 * glowIntensity}px ${styles.glow}`;

  const maxLabelLen = Math.floor(hexSize / 6);
  const displayLabel = data.label.length > maxLabelLen
    ? data.label.slice(0, maxLabelLen - 1) + '\u2026'
    : data.label;

  const statusIcon = getStatusIcon(status);
  const execId = data.toolId || data.executorType;

  return (
    <div
      className={`relative ${isRunning ? 'animate-pulse' : ''}`}
      style={{ width: hexW, height: hexH, opacity: data.dimmed ? 0.25 : 1 }}
    >
      {/* Hexagon SVG — exact match to background cell */}
      <svg
        width={hexW}
        height={hexH}
        viewBox={`${-hexW / 2} ${-hexH / 2} ${hexW} ${hexH}`}
        style={{ filter: `drop-shadow(${glowShadow})` }}
        className="absolute inset-0"
      >
        {selected && (
          <path d={hexagonPath(hexSize + 4)} fill="none" stroke="white"
            strokeWidth={2} strokeOpacity={0.6} />
        )}
        {data.highlighted && (
          <path d={hexagonPath(hexSize + 3)} fill="none" stroke="#d4a017"
            strokeWidth={2} strokeOpacity={0.7} />
        )}
        <path
          d={hexagonPath(hexSize)}
          fill={status === 'error' ? '#3f1e1e' : status === 'waiting' ? '#3f2e1e' : styles.bg}
          stroke={statusBorder || (data.highlighted ? '#d4a017' : styles.border)}
          strokeWidth={2}
        />

        <text
          x={0} y={-hexH / 2 + 22}
          textAnchor="middle" fill={styles.text}
          fontSize={9} fontWeight={700} letterSpacing="0.05em"
          className="uppercase pointer-events-none select-none"
        >{kind}</text>

        {statusIcon && (
          <text
            x={hexSize * 0.55} y={-hexH / 2 + 22}
            textAnchor="middle" fill={statusBorder || styles.text}
            fontSize={11} className="pointer-events-none select-none"
          >{statusIcon}</text>
        )}

        <text
          x={0} y={-2}
          textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize={12} fontWeight={600}
          className="pointer-events-none select-none"
        >{displayLabel}</text>

        {execId && (
          <text
            x={0} y={14}
            textAnchor="middle" fill={styles.text}
            fontSize={8} fontFamily="monospace" opacity={0.8}
            className="pointer-events-none select-none"
          >{execId.length > maxLabelLen ? execId.slice(0, maxLabelLen - 1) + '\u2026' : execId}</text>
        )}

        {data.description && (
          <text
            x={0} y={execId ? 28 : 16}
            textAnchor="middle" fill={styles.text}
            fontSize={9} opacity={0.6}
            className="pointer-events-none select-none"
          >{data.description.length > maxLabelLen + 4
            ? data.description.slice(0, maxLabelLen + 3) + '\u2026'
            : data.description}</text>
        )}

        {data.duration != null && (
          <text
            x={0} y={hexH / 2 - 16}
            textAnchor="middle" fill="#9ca3af"
            fontSize={9} className="pointer-events-none select-none"
          >{data.duration}ms</text>
        )}
      </svg>

      {/* PortHub strips — top (incoming) and bottom (outgoing) */}
      <HexPortHub type="target" count={inCount} hexSize={hexSize}
        color={styles.border} edges={data._inEdges} isConnectable={isConnectable} />
      <HexPortHub type="source" count={outCount} hexSize={hexSize}
        color={styles.border} edges={data._outEdges} isConnectable={isConnectable} />
    </div>
  );
};

export default memo(HexNode);
