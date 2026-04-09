import React, { useState } from 'react';
import {
  Box, Typography, List, ListItem, ListItemIcon, ListItemText,
  Chip, IconButton, Collapse, Badge, Tooltip, Paper, Divider
} from '@mui/material';
import {
  HourglassEmpty, ExpandMore, ExpandLess, Refresh,
  Person, Groups, HowToVote, Warning, CheckCircle
} from '@mui/icons-material';
import { usePendingSignals } from '../hooks/usePendingSignals';

function getTimeRemaining(timeoutAt) {
  if (!timeoutAt) return null;
  const diff = new Date(timeoutAt).getTime() - Date.now();
  if (diff <= 0) return { expired: true };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes };
}

function formatTimeRemaining(time) {
  if (time.expired) return 'Expired';
  if (time.hours > 24) return `${Math.floor(time.hours / 24)}d`;
  if (time.hours > 0) return `${time.hours}h ${time.minutes}m`;
  return `${time.minutes}m`;
}

function SignalListItem({ signal, onSelect, onResume }) {
  const {
    nodeId, status, signalType, resolutionMode,
    votesReceived, votesRequired, hasContradiction, timeoutAt
  } = signal;

  const isResolved = status === 'RESOLVED';
  const timeRemaining = getTimeRemaining(timeoutAt);
  const isUrgent = timeRemaining && !timeRemaining.expired && timeRemaining.hours < 1;

  const getModeIcon = () => {
    switch (resolutionMode) {
      case 'VOTE': return <HowToVote fontSize="small" />;
      case 'QUORUM': return <Groups fontSize="small" />;
      default: return <Person fontSize="small" />;
    }
  };

  return (
    <>
      <ListItem
        button
        onClick={onSelect}
        sx={{
          borderLeft: `3px solid ${
            isResolved ? '#4CAF50' :
            hasContradiction ? '#F44336' :
            isUrgent ? '#FF9800' : '#2196F3'
          }`,
          bgcolor: isResolved ? 'rgba(76,175,80,0.05)' : 'transparent',
          '&:hover': { bgcolor: 'action.hover' }
        }}
      >
        <ListItemIcon sx={{ minWidth: 36 }}>
          {isResolved ? (
            <CheckCircle color="success" fontSize="small" />
          ) : hasContradiction ? (
            <Warning color="error" fontSize="small" />
          ) : (
            getModeIcon()
          )}
        </ListItemIcon>

        <ListItemText
          primary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                {nodeId || 'Signal'}
              </Typography>
              <Chip label={signalType} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
            </Box>
          }
          secondary={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              {resolutionMode !== 'SINGLE' && (
                <Typography variant="caption">{votesReceived}/{votesRequired}</Typography>
              )}
              {timeRemaining && !isResolved && (
                <Typography variant="caption" color={isUrgent ? 'error' : 'text.secondary'}>
                  ⏱ {formatTimeRemaining(timeRemaining)}
                </Typography>
              )}
            </Box>
          }
        />

        {!isResolved && onResume && (
          <Chip
            label="Respond"
            size="small"
            color="primary"
            onClick={(e) => { e.stopPropagation(); onResume(); }}
            sx={{ cursor: 'pointer', ml: 1 }}
          />
        )}
      </ListItem>
      <Divider />
    </>
  );
}

/**
 * Panel showing all pending signals for current execution or graph.
 */
export default function PendingSignalsPanel({
  executionId, graphId, onSignalSelect, onResume, apiBaseUrl = '/api/v1'
}) {
  const [expanded, setExpanded] = useState(true);
  const { signals, loading, error, refresh } = usePendingSignals(executionId, graphId, apiBaseUrl);
  const pendingCount = signals.filter(s => s.status === 'WAITING').length;

  return (
    <Paper
      variant="outlined"
      sx={{ width: 300, maxHeight: 400, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, p: 1.5,
          bgcolor: 'grey.100', borderBottom: '1px solid', borderColor: 'divider', cursor: 'pointer'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <Badge badgeContent={pendingCount} color="warning">
          <HourglassEmpty />
        </Badge>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>Pending Signals</Typography>
        <Tooltip title="Refresh">
          <IconButton size="small" onClick={(e) => { e.stopPropagation(); refresh(); }}>
            <Refresh fontSize="small" />
          </IconButton>
        </Tooltip>
        {expanded ? <ExpandLess /> : <ExpandMore />}
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ overflow: 'auto', maxHeight: 320 }}>
          {loading && (
            <Typography variant="caption" sx={{ p: 2, display: 'block' }}>Loading...</Typography>
          )}
          {error && (
            <Typography variant="caption" color="error" sx={{ p: 2, display: 'block' }}>
              Error: {error.message}
            </Typography>
          )}
          {!loading && signals.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ p: 2, display: 'block' }}>
              No pending signals
            </Typography>
          )}
          <List dense disablePadding>
            {signals.map((signal) => (
              <SignalListItem
                key={signal.resumeToken || signal.id}
                signal={signal}
                onSelect={() => onSignalSelect?.(signal)}
                onResume={() => onResume?.(signal)}
              />
            ))}
          </List>
        </Box>
      </Collapse>
    </Paper>
  );
}
