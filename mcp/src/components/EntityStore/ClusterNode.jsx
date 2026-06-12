import React, { useCallback } from 'react';
import { Handle, Position } from 'reactflow';
import { Typography, IconButton, Tooltip, Chip } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { LEVEL_NAMES } from './LodController';
import { useEntityStore } from '../../stores/entityStore.store';

/**
 * Dominant-type colour map shared with ESNode palette.
 * Muted compared to entity nodes to visually distinguish cluster level.
 */
const CLUSTER_PALETTE = {
  ACTOR:        { bg: '#0f1923', border: '#1d4ed8', text: '#60a5fa' },
  ORGANIZATION: { bg: '#0f1923', border: '#1d4ed8', text: '#60a5fa' },
  CONCEPT:      { bg: '#0f1a1a', border: '#0e7490', text: '#22d3ee' },
  DOCUMENT:     { bg: '#0f0f1e', border: '#6d28d9', text: '#a78bfa' },
  EVENT:        { bg: '#1a1600', border: '#a16207', text: '#fbbf24' },
  PROCESS:      { bg: '#1a1600', border: '#a16207', text: '#fbbf24' },
  PERSON:       { bg: '#0f1a0f', border: '#166534', text: '#4ade80' },
  TECHNOLOGY:   { bg: '#1a0f1a', border: '#7e22ce', text: '#c084fc' },
  POLICY:       { bg: '#1a0f0f', border: '#991b1b', text: '#f87171' },
  SYSTEM:       { bg: '#0f1a1a', border: '#0e7490', text: '#22d3ee' },
  default:      { bg: '#111827', border: '#374151', text: '#9ca3af' },
};

/** Level-band accent so nested levels are distinguishable */
const LEVEL_ACCENT = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b'];

function levelAccent(level) {
  return LEVEL_ACCENT[level] || LEVEL_ACCENT[0];
}

export default function ClusterNode({ data, selected }) {
  const expandCluster = useEntityStore(s => s.expandCluster);

  const c = CLUSTER_PALETTE[(data.dominantType || '').toUpperCase()] || CLUSTER_PALETTE.default;
  const accent = levelAccent(data.level ?? 1);
  const levelName = LEVEL_NAMES[data.level ?? 1] || 'Cluster';

  const handleExpand = useCallback((e) => {
    e.stopPropagation();
    expandCluster(data.id);
  }, [expandCluster, data.id]);

  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: 10,
      border: `2px dashed ${c.border}`,
      backgroundColor: c.bg,
      boxShadow: selected
        ? `0 0 0 2px #fff, 0 0 20px ${accent}60`
        : `0 0 12px ${accent}30`,
      minWidth: 150,
      maxWidth: 240,
      cursor: 'pointer',
      position: 'relative',
    }}>
      <Handle type="target" position={Position.Top}
        style={{ width: 7, height: 7, background: accent, border: 'none' }} />

      {/* Level badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <span style={{
          fontSize: '0.52rem', fontWeight: 700, textTransform: 'uppercase',
          color: accent, background: `${accent}20`,
          padding: '1px 5px', borderRadius: 3, letterSpacing: '0.08em',
        }}>
          {levelName}
        </span>

        {/* Expand button */}
        {data.expandable !== false && (
          <Tooltip title={`Expand (${data.memberCount ?? '?'} members)`} placement="top">
            <IconButton
              size="small"
              onClick={handleExpand}
              sx={{
                p: 0.25, ml: 0.5,
                color: accent,
                '&:hover': { background: `${accent}20` },
              }}>
              <AccountTreeIcon sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
      </div>

      {/* Cluster label */}
      <Typography sx={{
        fontSize: '0.8rem', fontWeight: 600, color: '#f1f5f9',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        mt: 0.5,
      }}>
        {data.label}
      </Typography>

      {/* Member count + dominant type row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        {data.memberCount != null && (
          <span style={{
            fontSize: '0.6rem', color: '#94a3b8',
            background: '#ffffff0d', padding: '1px 5px', borderRadius: 3,
          }}>
            {data.memberCount.toLocaleString()} nodes
          </span>
        )}
        {data.dominantType && (
          <span style={{
            fontSize: '0.55rem', color: c.text,
            background: `${c.border}18`, padding: '1px 5px', borderRadius: 3,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {data.dominantType}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom}
        style={{ width: 7, height: 7, background: accent, border: 'none' }} />
    </div>
  );
}
