import React from 'react';
import {
  Card, CardContent, CardActions, Typography, Chip, Stack, IconButton, Tooltip, Box,
} from '@mui/material';
import { PlayCircle, Edit, MoreVertical, CheckCircle, AlertCircle, FileText, GitGraph } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STATUS_COLOR = {
  DRAFT:      'default',
  ACTIVE:     'success',
  DEPRECATED: 'error',
};

const STATUS_ICON = {
  DRAFT:      <FileText size={13} />,
  ACTIVE:     <CheckCircle size={13} />,
  DEPRECATED: <AlertCircle size={13} />,
};

export default function MethodologyCard({ methodology, onStatusChange }) {
  const navigate = useNavigate();
  const { id, name, userCase, description, status, version, graphId, parameterSchema } = methodology;

  const paramCount = Object.keys(parameterSchema || {}).length;

  return (
    <Card sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CardContent sx={{ flex: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" sx={{ mb: 1 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ pr: 1, lineHeight: 1.3 }}>
            {name}
          </Typography>
          <Chip
            size="small"
            icon={STATUS_ICON[status]}
            label={status}
            color={STATUS_COLOR[status] || 'default'}
          />
        </Stack>

        {userCase && (
          <Typography variant="caption" color="primary.main" sx={{ display: 'block', mb: 0.5, fontWeight: 600 }}>
            {userCase}
          </Typography>
        )}

        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {description}
          </Typography>
        )}

        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" label={`v${version}`} variant="outlined" />
          {paramCount > 0 && (
            <Chip size="small" label={`${paramCount} param${paramCount > 1 ? 's' : ''}`} variant="outlined" />
          )}
          {graphId && (
            <Chip size="small" icon={<GitGraph size={12} />} label="Graph linked" variant="outlined" color="info" />
          )}
        </Stack>
      </CardContent>

      <CardActions sx={{ px: 2, pb: 1.5, pt: 0 }}>
        <Tooltip title={status === 'DEPRECATED' ? 'Deprecated — cannot run' : !graphId ? 'No graph linked' : 'Run methodology'}>
          <span>
            <IconButton
              size="small"
              color="primary"
              disabled={status === 'DEPRECATED' || !graphId}
              onClick={() => navigate(`/investigation/methodologies/${id}/run`)}
            >
              <PlayCircle size={20} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton size="small" onClick={() => navigate(`/investigation/methodologies/${id}/edit`)}>
            <Edit size={18} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        {onStatusChange && (
          <Tooltip title={status === 'ACTIVE' ? 'Deprecate' : status === 'DRAFT' ? 'Activate' : 'Reactivate'}>
            <IconButton size="small" onClick={() => onStatusChange(id, status)}>
              <MoreVertical size={18} />
            </IconButton>
          </Tooltip>
        )}
      </CardActions>
    </Card>
  );
}
