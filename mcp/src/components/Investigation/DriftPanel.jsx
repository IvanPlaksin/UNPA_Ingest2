/**
 * DriftPanel — slide-out Drawer showing KB drift details.
 *
 * Features:
 *   - Summary: overall drift status + last checked timestamp
 *   - Per-artifact: type chip, severity badge, affected entities (expandable)
 *   - Single artifact refresh (re-execute primitive with current KB data)
 *   - Refresh All button
 *   - Marks refreshed artifacts as superseded on the graph
 */
import React, { useState } from 'react';
import {
  Drawer, Box, Stack, Typography, Button, IconButton, Chip,
  List, ListItem, Alert, CircularProgress, Divider, Collapse,
  Tooltip,
} from '@mui/material';
import {
  AlertTriangle, RefreshCw, ChevronDown, ChevronRight, X,
  Database, Edit3, Trash2, CheckCircle,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIMITIVE_COLORS = {
  LOCATE:    '#3b82f6',
  CONNECT:   '#8b5cf6',
  EXPAND:    '#06b6d4',
  MATRIX:    '#10b981',
  STRUCTURE: '#ec4899',
  TIMELINE:  '#f97316',
  RESOLVE:   '#84cc16',
  SYNTHESIZE:'#a78bfa',
  TEXT:      '#64748b',
};

function PrimitiveTag({ type }) {
  const color = PRIMITIVE_COLORS[type] || '#6b7280';
  return (
    <Chip
      label={type}
      size="small"
      sx={{
        height: 18, fontSize: '0.6rem', fontWeight: 700,
        bgcolor: `${color}22`, color, border: `1px solid ${color}44`,
      }}
    />
  );
}

function SeverityBadge({ severity }) {
  return (
    <Chip
      label={severity}
      size="small"
      color={severity === 'HIGH' ? 'error' : 'warning'}
      sx={{ height: 16, fontSize: '0.6rem' }}
    />
  );
}

// ─── Single drifted artifact row ──────────────────────────────────────────────

function DriftedArtifactItem({ artifact, onRefresh, refreshedIds }) {
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isRefreshed = refreshedIds.has(artifact.artifactId);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh(artifact.artifactId);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Box
      sx={{
        border: 1,
        borderColor: isRefreshed ? 'success.light' : 'divider',
        borderRadius: 1.5,
        mb: 1,
        overflow: 'hidden',
        opacity: isRefreshed ? 0.6 : 1,
      }}
    >
      {/* Header row */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1 }}>
        <PrimitiveTag type={artifact.primitiveType} />
        <SeverityBadge severity={artifact.severity} />
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {artifact.title || artifact.artifactId.slice(0, 8) + '…'}
        </Typography>
        <Box sx={{ flex: 1 }} />
        {isRefreshed ? (
          <CheckCircle size={14} style={{ color: '#10b981' }} />
        ) : (
          <>
            <Tooltip title="Expand affected entities">
              <IconButton size="small" onClick={() => setExpanded(e => !e)} sx={{ width: 22, height: 22 }}>
                {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Re-execute with current KB data">
              <IconButton
                size="small"
                color="primary"
                onClick={handleRefresh}
                disabled={refreshing}
                sx={{ width: 22, height: 22 }}
              >
                {refreshing
                  ? <CircularProgress size={12} sx={{ color: 'inherit' }} />
                  : <RefreshCw size={12} />}
              </IconButton>
            </Tooltip>
          </>
        )}
      </Stack>

      {/* Expanded entity list */}
      <Collapse in={expanded && !isRefreshed}>
        <Box sx={{ px: 1.5, pb: 1, bgcolor: 'action.hover' }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5, fontSize: '0.6rem', fontWeight: 700 }}>
            Affected KB entities:
          </Typography>
          {(artifact.affectedEntities || []).map((e, i) => (
            <Stack key={i} direction="row" spacing={0.75} alignItems="center" sx={{ py: 0.25 }}>
              {e.changeType === 'DELETED'
                ? <Trash2 size={11} style={{ color: '#ef4444', flexShrink: 0 }} />
                : <Edit3 size={11} style={{ color: '#f59e0b', flexShrink: 0 }} />}
              <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.entityName || e.entityId}
              </Typography>
              <Chip
                label={e.changeType}
                size="small"
                color={e.changeType === 'DELETED' ? 'error' : 'warning'}
                sx={{ height: 14, fontSize: '0.55rem', flexShrink: 0 }}
              />
            </Stack>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ─── Main drawer component ────────────────────────────────────────────────────

/**
 * @param {boolean}  open
 * @param {function} onClose
 * @param {object}   driftData     — { hasDrift, driftedArtifacts, checkedAt }
 * @param {boolean}  driftLoading
 * @param {function} onRefreshArtifact  — (artifactId) → Promise
 * @param {function} onRefreshAll
 */
export default function DriftPanel({ open, onClose, driftData, driftLoading, onRefreshArtifact, onRefreshAll }) {
  const [refreshedIds, setRefreshedIds] = useState(new Set());
  const [refreshingAll, setRefreshingAll] = useState(false);

  const handleRefresh = async (artifactId) => {
    await onRefreshArtifact(artifactId);
    setRefreshedIds(ids => new Set([...ids, artifactId]));
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      await onRefreshAll();
      const allIds = (driftData?.driftedArtifacts || []).map(a => a.artifactId);
      setRefreshedIds(new Set(allIds));
    } finally {
      setRefreshingAll(false);
    }
  };

  const drifted = driftData?.driftedArtifacts || [];
  const pendingCount = drifted.filter(a => !refreshedIds.has(a.artifactId)).length;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{
        sx: {
          width: 380,
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
          <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
            KB Drift Detected
          </Typography>
          <IconButton size="small" onClick={onClose}><X size={14} /></IconButton>
        </Stack>
        {driftData?.checkedAt && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, fontSize: '0.65rem' }}>
            Checked: {new Date(driftData.checkedAt).toLocaleTimeString()}
          </Typography>
        )}
      </Box>

      {/* Body */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
        {driftLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : !driftData?.hasDrift ? (
          <Alert severity="success" icon={<CheckCircle size={16} />}>
            No drift detected. All artifacts are consistent with the current KB state.
          </Alert>
        ) : (
          <>
            <Alert
              severity="warning"
              icon={<AlertTriangle size={16} />}
              sx={{ mb: 1.5, '& .MuiAlert-message': { fontSize: '0.8rem' } }}
            >
              {drifted.length} artifact{drifted.length !== 1 ? 's' : ''} may be outdated. The Knowledge Base has
              changed since these results were computed. Refresh to incorporate the latest data.
            </Alert>

            {driftData?.summary && (
              <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                {driftData.summary.modifiedEntities > 0 && (
                  <Chip size="small" label={`${driftData.summary.modifiedEntities} modified`} color="warning" variant="outlined" />
                )}
                {driftData.summary.deletedEntities > 0 && (
                  <Chip size="small" label={`${driftData.summary.deletedEntities} deleted`} color="error" variant="outlined" />
                )}
                <Chip size="small" label={`${driftData.summary.totalArtifacts} total artifacts`} variant="outlined" />
              </Stack>
            )}

            {drifted.map(artifact => (
              <DriftedArtifactItem
                key={artifact.artifactId}
                artifact={artifact}
                onRefresh={handleRefresh}
                refreshedIds={refreshedIds}
              />
            ))}
          </>
        )}
      </Box>

      {/* Footer */}
      {driftData?.hasDrift && pendingCount > 0 && (
        <Box sx={{ px: 2, py: 1.5, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
          <Button
            variant="contained"
            fullWidth
            startIcon={refreshingAll ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <RefreshCw size={14} />}
            onClick={handleRefreshAll}
            disabled={refreshingAll}
            sx={{ mb: 1 }}
          >
            {refreshingAll ? 'Refreshing…' : `Refresh All (${pendingCount})`}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center', fontSize: '0.65rem' }}>
            Re-executes primitives with current KB data and creates new evidentiary versions.
          </Typography>
        </Box>
      )}
    </Drawer>
  );
}
