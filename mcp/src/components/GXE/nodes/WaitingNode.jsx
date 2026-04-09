import React from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Typography, Chip, LinearProgress, Tooltip } from '@mui/material';
import { HourglassEmpty, Person, Groups, HowToVote, Warning } from '@mui/icons-material';

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
  if (time.hours > 24) return `${Math.floor(time.hours / 24)}d ${time.hours % 24}h`;
  if (time.hours > 0) return `${time.hours}h ${time.minutes}m`;
  return `${time.minutes}m`;
}

/**
 * Custom ReactFlow node for WAITING/WAITING_INPUT state.
 * Shows signal status, participants, vote progress.
 */
export default function WaitingNode({ data, selected }) {
  const {
    label,
    signalType,
    resolutionMode,
    participants,
    votesReceived = 0,
    votesRequired = 0,
    timeoutAt,
    hasContradiction,
    contextMessage,
    onResume
  } = data;

  const progress = votesRequired > 0 ? (votesReceived / votesRequired) * 100 : 0;
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
    <Box
      sx={{
        minWidth: 200,
        maxWidth: 280,
        bgcolor: 'var(--nexus-node-waiting-bg, #FFF8E1)',
        border: `2px solid ${selected ? 'var(--nexus-accent, #1976d2)' : hasContradiction ? '#F44336' : '#FFB300'}`,
        borderRadius: 2,
        boxShadow: selected ? '0 0 12px rgba(255,179,0,0.5)' : 1,
        overflow: 'hidden',
        transition: 'all 0.2s ease'
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex', alignItems: 'center', gap: 1,
          px: 1.5, py: 1,
          bgcolor: hasContradiction ? '#FFEBEE' : '#FFF3E0',
          borderBottom: '1px solid rgba(0,0,0,0.1)'
        }}
      >
        <HourglassEmpty
          sx={{
            color: hasContradiction ? '#F44336' : '#FF9800',
            animation: 'pulse 2s infinite'
          }}
        />
        <Typography variant="subtitle2" fontWeight="medium" sx={{ flex: 1 }}>
          {label || 'Waiting for Input'}
        </Typography>
        {hasContradiction && (
          <Tooltip title="Contradiction detected">
            <Warning sx={{ color: '#F44336' }} fontSize="small" />
          </Tooltip>
        )}
      </Box>

      {/* Content */}
      <Box sx={{ p: 1.5 }}>
        {/* Signal type and mode */}
        <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
          <Chip label={signalType || 'USER_INPUT'} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
          <Chip
            icon={getModeIcon()}
            label={resolutionMode || 'SINGLE'}
            size="small"
            color={resolutionMode === 'VOTE' ? 'primary' : 'default'}
            sx={{ fontSize: '0.7rem' }}
          />
        </Box>

        {/* Context message */}
        {contextMessage && (
          <Typography
            variant="caption" color="text.secondary"
            sx={{ display: 'block', mb: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {contextMessage}
          </Typography>
        )}

        {/* Vote progress */}
        {resolutionMode !== 'SINGLE' && votesRequired > 0 && (
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption">Responses: {votesReceived}/{votesRequired}</Typography>
              <Typography variant="caption" color="text.secondary">{Math.round(progress)}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6, borderRadius: 3, bgcolor: 'rgba(0,0,0,0.1)',
                '& .MuiLinearProgress-bar': { bgcolor: hasContradiction ? '#F44336' : '#4CAF50' }
              }}
            />
          </Box>
        )}

        {/* Participants */}
        {participants && participants.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
            {participants.slice(0, 4).map((p, i) => (
              <Tooltip key={i} title={p.refId}>
                <Chip
                  size="small"
                  label={p.refId.split('@')[0]}
                  color={p.hasResponded ? 'success' : 'default'}
                  variant={p.hasResponded ? 'filled' : 'outlined'}
                  sx={{ fontSize: '0.65rem', height: 20 }}
                />
              </Tooltip>
            ))}
            {participants.length > 4 && (
              <Chip size="small" label={`+${participants.length - 4}`} sx={{ fontSize: '0.65rem', height: 20 }} />
            )}
          </Box>
        )}

        {/* Timeout */}
        {timeRemaining && (
          <Typography variant="caption" color={isUrgent ? 'error' : 'text.secondary'} sx={{ display: 'block' }}>
            ⏱ {formatTimeRemaining(timeRemaining)}
          </Typography>
        )}
      </Box>

      {/* Resume button */}
      {onResume && (
        <Box sx={{ p: 1, borderTop: '1px solid rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <Chip label="Respond" color="primary" size="small" onClick={onResume} sx={{ cursor: 'pointer' }} />
        </Box>
      )}

      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Bottom} />
    </Box>
  );
}
