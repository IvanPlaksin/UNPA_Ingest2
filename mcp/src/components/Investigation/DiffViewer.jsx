/**
 * DiffViewer — shows semantic diff between two versions.
 *
 * Sections:
 *   • Header: from → to version summary
 *   • Artifacts: added (green) / removed (red) / modified (yellow, always empty for append-only)
 *   • Evidence: new KB sources (teal) / dropped (orange)
 *   • Drift warning when kbSnapshotId differs
 */
import React from 'react';
import {
  Box, Stack, Typography, Chip, Divider, CircularProgress,
  List, ListItem, ListItemIcon, ListItemText, Alert,
  IconButton, Paper,
} from '@mui/material';
import {
  Plus, Minus, AlertTriangle, Database, GitCommit, Bookmark,
  ScanSearch, X,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PRIMITIVE_COLORS = {
  LOCATE:    '#3b82f6',
  CONNECT:   '#8b5cf6',
  EXPAND:    '#06b6d4',
  SYNTHESIZE:'#a78bfa',
};

function PrimitiveChip({ type }) {
  return (
    <Chip
      label={type}
      size="small"
      sx={{
        height: 16,
        fontSize: '0.6rem',
        bgcolor: `${PRIMITIVE_COLORS[type] || '#6b7280'}22`,
        color: PRIMITIVE_COLORS[type] || '#6b7280',
        border: `1px solid ${PRIMITIVE_COLORS[type] || '#6b7280'}44`,
        fontWeight: 700,
      }}
    />
  );
}

function VersionLabel({ version }) {
  if (!version) return null;
  const isEv = version.type === 'EVIDENTIARY';
  const Icon = isEv ? GitCommit : Bookmark;
  const color = isEv ? '#3b82f6' : '#6b7280';
  return (
    <Stack direction="row" spacing={0.5} alignItems="center">
      <Icon size={12} style={{ color }} />
      <Typography variant="caption" fontWeight={700} sx={{ color }}>
        {isEv ? 'EVIDENTIARY' : 'LOGICAL'}
      </Typography>
      {version.message && (
        <Typography variant="caption" color="text.secondary">
          · {version.message}
        </Typography>
      )}
    </Stack>
  );
}

function ArtifactRow({ artifact, change }) {
  const color = change === 'added' ? '#10b981' : change === 'removed' ? '#ef4444' : '#f59e0b';
  const Icon  = change === 'added' ? Plus : change === 'removed' ? Minus : null;
  return (
    <ListItem dense disableGutters sx={{ py: 0.25 }}>
      <ListItemIcon sx={{ minWidth: 20 }}>
        {Icon && <Icon size={12} style={{ color }} />}
      </ListItemIcon>
      <ListItemText
        primary={
          <Stack direction="row" spacing={0.75} alignItems="center">
            <PrimitiveChip type={artifact.primitiveType} />
            <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }}>
              {artifact.artifactId.slice(0, 8)}…
            </Typography>
          </Stack>
        }
        secondary={artifact.summary}
        secondaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
      />
    </ListItem>
  );
}

function EvidenceRow({ entityId, isNew }) {
  const color = isNew ? '#0d9488' : '#ea580c';
  const Icon  = isNew ? Plus : Minus;
  return (
    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ py: 0.25 }}>
      <Icon size={12} style={{ color }} />
      <Database size={11} style={{ color: '#6b7280' }} />
      <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem', color: '#6b7280' }}>
        {entityId}
      </Typography>
    </Stack>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * @param {object|null} diff     — result from GET /versions/diff
 * @param {boolean}     loading
 * @param {Function}    onClose
 */
export default function DiffViewer({ diff, loading, onClose }) {
  if (loading) {
    return (
      <Paper elevation={2} sx={{ p: 2, borderRadius: 2 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={14} />
          <Typography variant="body2" color="text.secondary">Computing diff…</Typography>
        </Stack>
      </Paper>
    );
  }

  if (!diff) return null;

  const { fromVersion, toVersion, artifacts, evidence, summary } = diff;
  const totalChanges = (summary?.artifactsAdded || 0) + (summary?.artifactsRemoved || 0) + (summary?.newEvidenceCount || 0) + (summary?.droppedEvidenceCount || 0);

  return (
    <Paper
      elevation={3}
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: summary?.mayContainDrift ? 'warning.main' : 'divider',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, py: 1, bgcolor: 'action.hover', borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>Version diff</Typography>
            <Stack direction="row" spacing={1} alignItems="center">
              <VersionLabel version={fromVersion} />
              <Typography variant="caption" color="text.secondary">→</Typography>
              <VersionLabel version={toVersion} />
            </Stack>
          </Box>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip label={`${totalChanges} changes`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
            {onClose && (
              <IconButton size="small" onClick={onClose}><X size={14} /></IconButton>
            )}
          </Stack>
        </Stack>
      </Box>

      {/* Drift warning */}
      {summary?.mayContainDrift && (
        <Alert severity="warning" icon={<AlertTriangle size={14} />} sx={{ px: 2, py: 0.5, borderRadius: 0, '& .MuiAlert-message': { fontSize: '0.7rem' } }}>
          KB snapshot changed between versions — evidence may have drifted.
        </Alert>
      )}

      {/* Body */}
      <Box sx={{ p: 1.5, maxHeight: 350, overflowY: 'auto' }}>
        {totalChanges === 0 ? (
          <Typography variant="caption" color="text.secondary">No changes between these versions.</Typography>
        ) : (
          <Stack spacing={1.5}>

            {/* Artifacts */}
            {((artifacts?.added?.length || 0) + (artifacts?.removed?.length || 0) > 0) && (
              <Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: 1 }}>
                  Artifacts
                </Typography>
                <Divider sx={{ mt: 0.5, mb: 0.5 }} />
                <List dense disablePadding>
                  {(artifacts?.added || []).map(a => <ArtifactRow key={a.artifactId} artifact={a} change="added" />)}
                  {(artifacts?.removed || []).map(a => <ArtifactRow key={a.artifactId} artifact={a} change="removed" />)}
                </List>
              </Box>
            )}

            {/* Evidence */}
            {((evidence?.newSources?.length || 0) + (evidence?.droppedSources?.length || 0) > 0) && (
              <Box>
                <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', fontSize: '0.6rem', letterSpacing: 1 }}>
                  KB Evidence
                </Typography>
                <Divider sx={{ mt: 0.5, mb: 0.5 }} />
                <Stack>
                  {(evidence?.newSources || []).map(e => <EvidenceRow key={e.entityId} entityId={e.entityId} isNew />)}
                  {(evidence?.droppedSources || []).map(e => <EvidenceRow key={e.entityId} entityId={e.entityId} isNew={false} />)}
                </Stack>
              </Box>
            )}
          </Stack>
        )}
      </Box>

      {/* Footer summary */}
      <Box sx={{ px: 2, py: 0.75, bgcolor: 'action.hover', borderTop: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={1.5}>
          {summary?.artifactsAdded > 0 && (
            <Typography variant="caption" sx={{ color: '#10b981' }}>+{summary.artifactsAdded} added</Typography>
          )}
          {summary?.artifactsRemoved > 0 && (
            <Typography variant="caption" sx={{ color: '#ef4444' }}>-{summary.artifactsRemoved} removed</Typography>
          )}
          {summary?.newEvidenceCount > 0 && (
            <Typography variant="caption" sx={{ color: '#0d9488' }}>+{summary.newEvidenceCount} evidence</Typography>
          )}
          {summary?.droppedEvidenceCount > 0 && (
            <Typography variant="caption" sx={{ color: '#ea580c' }}>-{summary.droppedEvidenceCount} evidence</Typography>
          )}
        </Stack>
      </Box>
    </Paper>
  );
}
