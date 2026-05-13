import React from 'react';
import {
  Box, Typography, List, ListItemButton, ListItemText,
  Chip, Stack, CircularProgress, Alert,
} from '@mui/material';
import { Forum, OpenInNew } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useRelatedDialoguesForBacklog } from '../../../hooks/useDialogue';

const PLATFORM_LABELS = { claude_code: 'Claude Code', claude_ai: 'Claude.ai' };
const PLATFORM_COLORS = { claude_code: 'primary', claude_ai: 'secondary' };

export default function DialoguesTab({ backlogId }) {
  const { sessions, loading, error } = useRelatedDialoguesForBacklog(backlogId);
  const navigate = useNavigate();

  const handleOpen = (sessionId) => {
    navigate('/dialogue', { state: { openSession: sessionId } });
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="warning" sx={{ m: 2 }}>{error}</Alert>;
  }

  if (!sessions.length) {
    return (
      <Box sx={{ py: 4, px: 2, textAlign: 'center' }}>
        <Forum sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
        <Typography color="text.secondary" variant="body2">
          No related dialogues found for {backlogId}
        </Typography>
        <Typography color="text.disabled" variant="caption" display="block" sx={{ mt: 0.5 }}>
          Dialogues are linked when sessions mention this task ID in conversation
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
        {sessions.length} session{sessions.length !== 1 ? 's' : ''} mention {backlogId}
      </Typography>

      <List disablePadding sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        {sessions.map((s, idx) => (
          <ListItemButton
            key={s.sessionId}
            divider={idx < sessions.length - 1}
            onClick={() => handleOpen(s.sessionId)}
            sx={{ gap: 1.5, alignItems: 'flex-start', py: 1.5 }}
          >
            <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Chip
                  label={PLATFORM_LABELS[s.platform] || s.platform || 'unknown'}
                  size="small"
                  color={PLATFORM_COLORS[s.platform] || 'default'}
                  sx={{ flexShrink: 0 }}
                />
                {s.mentions != null && (
                  <Chip
                    label={`${s.mentions} mention${s.mentions !== 1 ? 's' : ''}`}
                    size="small"
                    variant="outlined"
                    color="warning"
                    sx={{ flexShrink: 0, fontSize: '0.7rem' }}
                  />
                )}
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {s.startedAt ? new Date(s.startedAt).toLocaleDateString() : '—'}
                </Typography>
                {s.gitBranch && (
                  <Typography variant="caption" color="text.disabled" noWrap>
                    {s.gitBranch}
                  </Typography>
                )}
              </Stack>

              <Typography variant="body2" fontWeight={500} noWrap>
                {s.title || 'Untitled session'}
              </Typography>

              {s.summary && (
                <Typography variant="caption" color="text.secondary"
                  sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                >
                  {s.summary}
                </Typography>
              )}

              <Typography variant="caption" color="text.disabled">
                {s.messageCount} messages
              </Typography>
            </Stack>

            <OpenInNew fontSize="small" sx={{ color: 'text.disabled', flexShrink: 0, mt: 0.3 }} />
          </ListItemButton>
        ))}
      </List>
    </Box>
  );
}
