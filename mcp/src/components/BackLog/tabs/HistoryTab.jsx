/**
 * HistoryTab — Combined timeline: status transitions + agent action logs.
 * Shows chronological audit trail of all activity on a task.
 */
import React, { useState, useEffect } from 'react';
import { Box, Typography, Chip, Stack, CircularProgress, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { History, SmartToy, SwapVert } from '@mui/icons-material';
import api from '../../../services/api';

const EVENT_COLORS = {
  CREATED: 'default', APPROVED: 'success', REJECTED: 'error',
  STARTED: 'primary', BLOCKED: 'error', UNBLOCKED: 'info',
  REVIEW: 'warning', COMPLETED: 'success', CANCELLED: 'default',
  RETURNED: 'warning', UPDATED: 'default'
};

const CATEGORY_COLORS = {
  ANALYSIS: 'info', IMPLEMENTATION: 'primary', TESTING: 'success',
  DECISION: 'warning', COMMUNICATION: 'default', ERROR: 'error', NOTE: 'default'
};

function TimelineEntry({ event, isLast }) {
  const isAction = event.source === 'action-log';
  const chipColor = isAction ? (CATEGORY_COLORS[event.category] || 'default') : (EVENT_COLORS[event.type] || 'default');
  const chipLabel = isAction ? event.category : event.type;

  return (
    <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
      {/* Timeline dot + line */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20 }}>
        <Box sx={{
          width: isAction ? 8 : 10, height: isAction ? 8 : 10, borderRadius: '50%',
          bgcolor: isAction ? 'info.main' : `${chipColor}.main`,
          border: '2px solid',
          borderColor: isAction ? 'info.main' : `${chipColor}.main`
        }} />
        {!isLast && <Box sx={{ width: 2, flex: 1, bgcolor: 'divider', mt: 0.5 }} />}
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.25 }}>
          <Chip label={chipLabel} size="small" color={chipColor} sx={{ fontSize: 12, height: 20 }} />
          {isAction && <SmartToy sx={{ fontSize: 14, color: 'text.disabled' }} />}
          <Typography variant="caption" color="text.disabled">
            {new Date(event.at).toLocaleString()}
          </Typography>
        </Stack>
        <Typography variant="body2">{event.detail}</Typography>
        {isAction && event.motivation && (
          <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic', display: 'block' }}>
            Motivation: {event.motivation}
          </Typography>
        )}
        <Typography variant="caption" color="text.disabled">by {event.by}</Typography>
      </Box>
    </Stack>
  );
}

export default function HistoryTab({ task }) {
  const [actionLogs, setActionLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [filter, setFilter] = useState('all'); // 'all' | 'status' | 'actions'

  useEffect(() => {
    if (!task?.backlogId) return;
    setLoadingLogs(true);
    api.get(`/backlog/items/${task.backlogId}/action-log`)
      .then(res => setActionLogs(res.data?.data || []))
      .catch(() => setActionLogs([]))
      .finally(() => setLoadingLogs(false));
  }, [task?.backlogId]);

  // Build status transition events from task metadata
  const statusEvents = [];
  if (task.createdAt) statusEvents.push({ type: 'CREATED', at: task.createdAt, by: task.createdBy, detail: `Created as ${task.status}`, source: 'status' });
  if (task.approvedAt) statusEvents.push({ type: 'APPROVED', at: task.approvedAt, by: task.approvedBy || 'admin', detail: 'Task approved', source: 'status' });
  if (task.startedAt) statusEvents.push({ type: 'STARTED', at: task.startedAt, by: task.assignedTo || 'agent', detail: 'Work started', source: 'status' });
  if (task.rejectedAt) statusEvents.push({ type: 'REJECTED', at: task.rejectedAt, by: 'admin', detail: task.rejectionReason || 'Task rejected', source: 'status' });
  if (task.completedAt) statusEvents.push({ type: 'COMPLETED', at: task.completedAt, by: task.assignedTo || 'agent', detail: 'Task completed', source: 'status' });
  if (task.returnReason) statusEvents.push({ type: 'RETURNED', at: task.updatedAt, by: 'agent', detail: `Returned to Proposed: ${task.returnReason}`, source: 'status' });

  // Convert action log entries to timeline events
  const actionEvents = actionLogs.map(log => ({
    type: 'ACTION',
    category: log.category,
    at: log.timestamp,
    by: log.agentId,
    detail: log.action,
    motivation: log.motivation,
    source: 'action-log'
  }));

  // Merge and sort
  let allEvents = [...statusEvents, ...actionEvents];
  if (filter === 'status') allEvents = allEvents.filter(e => e.source === 'status');
  if (filter === 'actions') allEvents = allEvents.filter(e => e.source === 'action-log');
  allEvents.sort((a, b) => new Date(a.at) - new Date(b.at));

  if (allEvents.length === 0 && !loadingLogs) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <History sx={{ fontSize: 48, opacity: 0.3 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>No history available</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle2">
          Task History ({allEvents.length})
        </Typography>
        <ToggleButtonGroup size="small" value={filter} exclusive onChange={(_, v) => v && setFilter(v)}>
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="status"><SwapVert sx={{ fontSize: 16, mr: 0.5 }} />Status</ToggleButton>
          <ToggleButton value="actions"><SmartToy sx={{ fontSize: 16, mr: 0.5 }} />Actions</ToggleButton>
        </ToggleButtonGroup>
      </Stack>

      {loadingLogs && <Box sx={{ textAlign: 'center', mb: 2 }}><CircularProgress size={20} /></Box>}

      {allEvents.map((event, i) => (
        <TimelineEntry key={i} event={event} isLast={i === allEvents.length - 1} />
      ))}
    </Box>
  );
}
