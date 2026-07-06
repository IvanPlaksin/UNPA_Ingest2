/**
 * SnapshotBanner — read-only mode indicator shown when viewing a historical version.
 *
 * Rendered at the top of InvestigationGraph area when isSnapshotMode = true.
 * Shows: version type + timestamp + artifact count + "Exit snapshot" button.
 */
import React from 'react';
import { Box, Stack, Typography, Chip, Button } from '@mui/material';
import { ScanSearch, GitCommit, Bookmark, X } from 'lucide-react';

export default function SnapshotBanner({ versionState, onExit }) {
  if (!versionState) return null;

  const isEv = versionState.type === 'EVIDENTIARY';
  const Icon = isEv ? GitCommit : Bookmark;
  const color = isEv ? '#3b82f6' : '#6b7280';

  return (
    <Box sx={{
      px: 2,
      py: 0.75,
      bgcolor: '#fef3c7',
      borderBottom: 1,
      borderColor: 'warning.light',
      display: 'flex',
      alignItems: 'center',
      gap: 1.5,
    }}>
      <ScanSearch size={14} style={{ color: '#92400e', flexShrink: 0 }} />

      <Typography variant="caption" fontWeight={700} sx={{ color: '#92400e', flexShrink: 0 }}>
        Snapshot view
      </Typography>

      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flex: 1 }}>
        <Icon size={12} style={{ color }} />
        <Typography variant="caption" sx={{ color: '#92400e' }}>
          {isEv ? 'EVIDENTIARY' : 'LOGICAL'}
          {versionState.message ? ` · ${versionState.message}` : ''}
        </Typography>

        <Typography variant="caption" color="text.secondary">
          ·
        </Typography>

        <Typography variant="caption" sx={{ color: '#92400e', opacity: 0.8 }}>
          {new Date(versionState.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
        </Typography>

        {typeof versionState.artifactCount === 'number' && (
          <Chip
            label={`${versionState.artifactCount} artifact${versionState.artifactCount !== 1 ? 's' : ''}`}
            size="small"
            sx={{ height: 16, fontSize: '0.6rem', bgcolor: '#fde68a', color: '#92400e', border: '1px solid #f59e0b' }}
          />
        )}
      </Stack>

      <Typography variant="caption" sx={{ color: '#92400e', opacity: 0.7, flexShrink: 0 }}>
        Read-only — changes disabled
      </Typography>

      <Button
        size="small"
        variant="outlined"
        startIcon={<X size={12} />}
        onClick={onExit}
        sx={{
          flexShrink: 0,
          height: 24,
          fontSize: '0.7rem',
          borderColor: '#f59e0b',
          color: '#92400e',
          '&:hover': { borderColor: '#92400e', bgcolor: '#fde68a' },
        }}
      >
        Exit snapshot
      </Button>
    </Box>
  );
}
