/**
 * OverviewTab — Basic task information (migrated from TaskDetailDialog)
 */
import React from 'react';
import { Box, Typography, Chip, Stack, Divider } from '@mui/material';

const PRIORITY_COLORS = {
  P0_CRITICAL: '#d32f2f', P1_HIGH: '#f57c00', P2_MEDIUM: '#1976d2', P3_LOW: '#757575'
};

export default function OverviewTab({ task }) {
  if (!task) return null;

  const criteria = Array.isArray(task.acceptanceCriteria)
    ? task.acceptanceCriteria
    : typeof task.acceptanceCriteria === 'string'
      ? (() => { try { return JSON.parse(task.acceptanceCriteria); } catch { return []; } })()
      : [];

  const tags = Array.isArray(task.tags)
    ? task.tags
    : typeof task.tags === 'string'
      ? (() => { try { return JSON.parse(task.tags); } catch { return []; } })()
      : [];

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>{task.title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
        {task.description}
      </Typography>

      <Divider sx={{ my: 1.5 }} />

      <Typography variant="caption" color="text.disabled" fontWeight={700}>Target</Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        {task.targetType} — <code>{task.targetPath || 'N/A'}</code>
      </Typography>

      {criteria.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.disabled" fontWeight={700}>
            Acceptance Criteria ({criteria.length})
          </Typography>
          <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
            {criteria.map((c, i) => (
              <Typography component="li" variant="body2" key={i} sx={{ mb: 0.25 }}>{c}</Typography>
            ))}
          </Box>
        </Box>
      )}

      {tags.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.disabled" fontWeight={700} sx={{ display: 'block', mb: 0.5 }}>
            Tags
          </Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {tags.map((t, i) => (
              <Chip key={i} label={t} size="small" variant="outlined" sx={{ fontSize: 13 }} />
            ))}
          </Stack>
        </Box>
      )}

      <Divider sx={{ my: 1.5 }} />

      <Stack spacing={0.5}>
        <Typography variant="caption" color="text.disabled">
          Created by {task.createdBy} at {new Date(task.createdAt).toLocaleString()}
        </Typography>
        {task.assignedTo && (
          <Typography variant="caption" color="text.disabled">
            Assigned to {task.assignedTo}
          </Typography>
        )}
        {task.parentId && (
          <Typography variant="caption" color="text.disabled">
            Parent: <Chip label={task.parentId} size="small" variant="outlined" sx={{ fontSize: 12, height: 18 }} />
          </Typography>
        )}
        {task.childCount > 0 && (
          <Typography variant="caption" color="text.disabled">
            Subtasks: {task.childCount} (Level {task.level || 1}/3)
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
