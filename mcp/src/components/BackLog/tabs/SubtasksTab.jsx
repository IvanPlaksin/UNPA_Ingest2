/**
 * SubtasksTab — Task hierarchy (children + completion status)
 */
import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Stack,
  CircularProgress, Alert, LinearProgress
} from '@mui/material';
import { AccountTree } from '@mui/icons-material';
import api from '../../../services/api';

const PRIORITY_COLORS = {
  P0_CRITICAL: '#d32f2f', P1_HIGH: '#f57c00', P2_MEDIUM: '#1976d2', P3_LOW: '#757575'
};

const STATUS_COLORS = {
  PROPOSED: 'default', APPROVED: 'info', IN_PROGRESS: 'primary',
  REVIEW: 'warning', DONE: 'success', BLOCKED: 'error', CANCELLED: 'default'
};

export default function SubtasksTab({ backlogId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!backlogId) return;
    setLoading(true);
    setError(null);
    api.get(`/backlog/items/${backlogId}/hierarchy`)
      .then(res => setData(res.data?.data))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [backlogId]);

  if (loading) return <Box sx={{ p: 3, textAlign: 'center' }}><CircularProgress size={24} /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>Failed to load hierarchy: {error}</Alert>;

  const children = data?.children || [];

  if (children.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <AccountTree sx={{ fontSize: 48, opacity: 0.3 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No subtasks</Typography>
        <Typography variant="caption" color="text.disabled">
          Use backlog.split_task to decompose this task
        </Typography>
      </Box>
    );
  }

  const doneCount = children.filter(c => c.status === 'DONE').length;
  const progress = (doneCount / children.length) * 100;

  return (
    <Box sx={{ p: 2 }}>
      {/* Progress bar */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2">Subtasks ({children.length})</Typography>
        <Typography variant="caption" color="text.secondary">{doneCount}/{children.length} done</Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={progress}
        color={progress === 100 ? 'success' : 'primary'}
        sx={{ mb: 2, height: 6, borderRadius: 1 }}
      />

      {/* Subtask cards */}
      {children.map((child, i) => (
        <Card key={child.backlogId || i} variant="outlined" sx={{
          mb: 1,
          borderLeft: `3px solid ${PRIORITY_COLORS[child.priority] || '#555'}`,
          opacity: child.status === 'DONE' ? 0.7 : 1
        }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
              <Chip label={child.backlogId} size="small" variant="outlined" sx={{ fontSize: 12, height: 20 }} />
              <Chip label={child.status} size="small" color={STATUS_COLORS[child.status] || 'default'} sx={{ fontSize: 12, height: 20 }} />
              {child._order && (
                <Typography variant="caption" color="text.disabled">#{child._order}</Typography>
              )}
            </Stack>
            <Typography variant="body2" fontWeight={600}>{child.title}</Typography>
            {child.taskType && (
              <Typography variant="caption" color="text.secondary">{child.taskType} | {child.effort || 'M'}</Typography>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Can complete check */}
      {doneCount === children.length && (
        <Alert severity="success" sx={{ mt: 1 }}>
          All subtasks completed — parent task can be marked as DONE
        </Alert>
      )}
      {doneCount < children.length && (
        <Alert severity="info" sx={{ mt: 1 }}>
          {children.length - doneCount} subtask(s) still pending
        </Alert>
      )}
    </Box>
  );
}
