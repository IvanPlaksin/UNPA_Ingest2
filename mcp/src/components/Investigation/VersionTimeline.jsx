/**
 * VersionTimeline — horizontal dot timeline showing version history.
 *
 * Dot legend:
 *   ● filled   = EVIDENTIARY (KB-touching, pins snapshot)
 *   ○ outline  = LOGICAL (user checkpoint)
 *   ◉ current  = active version (filled + ring)
 *
 * Click         → snapshot mode (view session state at that version)
 * Shift+Click   → select diff endpoint (first click = from, second = to, fires onDiff)
 */
import React, { useState, useCallback } from 'react';
import {
  Box, Stack, Typography, Tooltip, CircularProgress,
  Chip, IconButton, Divider, ButtonBase,
} from '@mui/material';
import { GitCommit, Bookmark, Clock, ScanSearch, GitCompare } from 'lucide-react';

const EVIDENTIARY_COLOR = '#3b82f6';
const LOGICAL_COLOR     = '#6b7280';
const CURRENT_RING      = '#f59e0b';

// ─── Single dot ───────────────────────────────────────────────────────────────

function VersionDot({ version, isCurrent, isSelected, selectionIndex, onClick, onShiftClick }) {
  const isEv = version.type === 'EVIDENTIARY';
  const color = isEv ? EVIDENTIARY_COLOR : LOGICAL_COLOR;
  const dotSize = 14;

  const handleClick = (e) => {
    if (e.shiftKey) onShiftClick(version);
    else onClick(version);
  };

  const tooltipContent = (
    <Box sx={{ p: 0.5, maxWidth: 220 }}>
      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.5 }}>
        {isEv
          ? <GitCommit size={12} style={{ color: EVIDENTIARY_COLOR }} />
          : <Bookmark size={12} style={{ color: LOGICAL_COLOR }} />}
        <Typography variant="caption" fontWeight={700}>
          {isEv ? 'EVIDENTIARY' : 'LOGICAL'}
        </Typography>
        {isCurrent && <Chip label="current" size="small" sx={{ height: 14, fontSize: '0.6rem', bgcolor: CURRENT_RING, color: 'white', ml: 0.5 }} />}
      </Stack>
      {version.message && (
        <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', mb: 0.5 }}>
          {version.message}
        </Typography>
      )}
      <Stack direction="row" spacing={1}>
        {typeof version.artifactCount === 'number' && (
          <Typography variant="caption" color="text.secondary">
            {version.artifactCount} artifact{version.artifactCount !== 1 ? 's' : ''}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          <Clock size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
          {new Date(version.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Typography>
      </Stack>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary', fontSize: '0.6rem' }}>
        {isCurrent ? 'Click to view snapshot' : 'Click · snapshot  |  Shift+Click · diff'}
      </Typography>
    </Box>
  );

  return (
    <Tooltip title={tooltipContent} arrow placement="top">
      <ButtonBase
        onClick={handleClick}
        sx={{
          borderRadius: '50%',
          p: 0.25,
          position: 'relative',
          '&:hover .dot': { transform: 'scale(1.25)' },
        }}
      >
        {/* Outer selection ring */}
        {isSelected && (
          <Box sx={{
            position: 'absolute', inset: -3,
            borderRadius: '50%',
            border: `2px solid ${selectionIndex === 0 ? '#10b981' : '#f59e0b'}`,
            pointerEvents: 'none',
          }} />
        )}

        {/* Current ring */}
        {isCurrent && !isSelected && (
          <Box sx={{
            position: 'absolute', inset: -3,
            borderRadius: '50%',
            border: `2px solid ${CURRENT_RING}`,
            pointerEvents: 'none',
          }} />
        )}

        <Box className="dot" sx={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          bgcolor: isEv ? color : 'transparent',
          border: `2px solid ${color}`,
          transition: 'transform 0.15s',
          flexShrink: 0,
        }} />
      </ButtonBase>
    </Tooltip>
  );
}

// ─── Timeline connector ────────────────────────────────────────────────────────

function Connector() {
  return (
    <Box sx={{
      height: 2,
      width: 20,
      bgcolor: 'divider',
      flexShrink: 0,
      alignSelf: 'center',
    }} />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {Array}    versions       sorted by createdAt ASC
 * @param {string}   currentVersionId
 * @param {string|null} viewingVersionId  — snapshot mode
 * @param {Function} onViewVersion  — (versionId|null) → enter/exit snapshot mode
 * @param {Function} onDiff         — (fromVersionId, toVersionId) → show diff
 */
export default function VersionTimeline({
  versions = [],
  currentVersionId,
  viewingVersionId,
  onViewVersion,
  onDiff,
  loading = false,
}) {
  const [diffPair, setDiffPair] = useState([]);   // [fromId] or [fromId, toId]

  const handleClick = useCallback((version) => {
    // Clear diff pair
    setDiffPair([]);
    if (viewingVersionId === version.versionId) {
      onViewVersion(null);    // exit snapshot mode
    } else {
      onViewVersion(version.versionId);
    }
  }, [viewingVersionId, onViewVersion]);

  const handleShiftClick = useCallback((version) => {
    onViewVersion(null);    // exit snapshot mode while selecting diff
    if (diffPair.length === 0) {
      setDiffPair([version.versionId]);
    } else if (diffPair.length === 1) {
      const from = diffPair[0];
      const to   = version.versionId;
      setDiffPair([]);
      if (from !== to) onDiff(from, to);
    } else {
      setDiffPair([version.versionId]);
    }
  }, [diffPair, onDiff, onViewVersion]);

  const clearDiff = () => setDiffPair([]);

  if (loading) {
    return (
      <Box sx={{ px: 2, py: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">Loading versions…</Typography>
      </Box>
    );
  }

  if (versions.length === 0) {
    return (
      <Box sx={{ px: 2, py: 0.5 }}>
        <Typography variant="caption" color="text.secondary">No versions yet — run a primitive to create the first.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      overflowX: 'auto',
      px: 1.5,
      py: 0.75,
      bgcolor: 'background.paper',
      borderTop: 1,
      borderColor: 'divider',
      minHeight: 40,
    }}>
      {/* Legend + controls */}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mr: 2, flexShrink: 0 }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <GitCompare size={12} style={{ color: '#6b7280' }} />
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
            Versions
          </Typography>
        </Stack>
        <Divider orientation="vertical" flexItem />
        {diffPair.length > 0 && (
          <Chip
            label={diffPair.length === 1 ? 'Select 2nd…' : 'Comparing…'}
            size="small"
            color="warning"
            onDelete={clearDiff}
            sx={{ height: 18, fontSize: '0.6rem' }}
          />
        )}
        {viewingVersionId && (
          <Chip
            label="Snapshot view"
            size="small"
            color="info"
            icon={<ScanSearch size={10} />}
            onDelete={() => onViewVersion(null)}
            sx={{ height: 18, fontSize: '0.6rem' }}
          />
        )}
      </Stack>

      {/* Dots + connectors */}
      {versions.map((v, i) => (
        <React.Fragment key={v.versionId}>
          {i > 0 && <Connector />}
          <VersionDot
            version={v}
            isCurrent={v.versionId === currentVersionId}
            isSelected={diffPair.includes(v.versionId)}
            selectionIndex={diffPair.indexOf(v.versionId)}
            onClick={handleClick}
            onShiftClick={handleShiftClick}
          />
        </React.Fragment>
      ))}

      {/* Diff hint */}
      <Typography variant="caption" color="text.secondary" sx={{ ml: 2, flexShrink: 0, fontSize: '0.6rem', opacity: 0.6 }}>
        Click → snapshot · Shift+Click → diff
      </Typography>
    </Box>
  );
}
