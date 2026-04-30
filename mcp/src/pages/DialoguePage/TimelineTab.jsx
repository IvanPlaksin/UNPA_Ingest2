import React, { useState, useEffect } from 'react';
import {
  Box, List, ListItemButton, ListItemText, Chip, Select, MenuItem,
  FormControl, InputLabel, Pagination, CircularProgress, Typography, Stack,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import { useDialogueSessions } from '../../hooks/useDialogue';
import SessionDetailDrawer from '../../components/Dialogue/SessionDetailDrawer';

const PLATFORM_LABELS = { claude_code: 'Claude Code', claude_ai: 'Claude.ai' };
const PLATFORM_COLORS = { claude_code: 'primary', claude_ai: 'secondary' };

export default function TimelineTab() {
  const [filters, setFilters] = useState({ platform: '', limit: 20, offset: 0, sort: 'startedAt_desc' });
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const { sessions, loading, pagination } = useDialogueSessions(filters);
  const location = useLocation();

  // Open session drawer when navigated here with state.openSession
  useEffect(() => {
    if (location.state?.openSession) {
      setSelectedSessionId(location.state.openSession);
    }
  }, [location.state]);

  const pageCount = pagination ? Math.ceil(pagination.total / filters.limit) : 0;
  const currentPage = Math.floor(filters.offset / filters.limit) + 1;

  return (
    <Box>
      {/* Filter row */}
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>Platform</InputLabel>
          <Select
            value={filters.platform}
            label="Platform"
            onChange={e => setFilters(f => ({ ...f, platform: e.target.value, offset: 0 }))}
          >
            <MenuItem value="">All platforms</MenuItem>
            <MenuItem value="claude_code">Claude Code</MenuItem>
            <MenuItem value="claude_ai">Claude.ai</MenuItem>
          </Select>
        </FormControl>

        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Sort</InputLabel>
          <Select
            value={filters.sort}
            label="Sort"
            onChange={e => setFilters(f => ({ ...f, sort: e.target.value, offset: 0 }))}
          >
            <MenuItem value="startedAt_desc">Newest first</MenuItem>
            <MenuItem value="startedAt_asc">Oldest first</MenuItem>
            <MenuItem value="messageCount_desc">Most messages</MenuItem>
          </Select>
        </FormControl>

        {pagination && (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {pagination.total} sessions total
          </Typography>
        )}
      </Stack>

      {/* Sessions list */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : sessions.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 4, textAlign: 'center' }}>
          No sessions found
        </Typography>
      ) : (
        <List disablePadding sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
          {sessions.map((session, idx) => (
            <ListItemButton
              key={session.sessionId}
              divider={idx < sessions.length - 1}
              sx={{ gap: 1.5, alignItems: 'flex-start', py: 1.5 }}
              onClick={() => setSelectedSessionId(session.sessionId)}
            >
              <Chip
                label={PLATFORM_LABELS[session.platform] || session.platform || 'unknown'}
                size="small"
                color={PLATFORM_COLORS[session.platform] || 'default'}
                sx={{ mt: 0.3, flexShrink: 0 }}
              />
              <ListItemText
                primary={session.title || 'Untitled session'}
                secondary={
                  <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                    <Typography variant="caption" component="span">
                      {session.startedAt ? new Date(session.startedAt).toLocaleDateString() : '—'}
                    </Typography>
                    <Typography variant="caption" component="span" color="text.disabled">·</Typography>
                    <Typography variant="caption" component="span">
                      {session.messageCount ?? 0} messages
                    </Typography>
                    {session.gitBranch && (
                      <>
                        <Typography variant="caption" component="span" color="text.disabled">·</Typography>
                        <Typography variant="caption" component="span" color="text.secondary">
                          {session.gitBranch}
                        </Typography>
                      </>
                    )}
                  </Stack>
                }
                primaryTypographyProps={{ fontWeight: 500 }}
              />
            </ListItemButton>
          ))}
        </List>
      )}

      {/* Pagination */}
      {pageCount > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Pagination
            count={pageCount}
            page={currentPage}
            onChange={(_e, page) => setFilters(f => ({ ...f, offset: (page - 1) * f.limit }))}
            color="primary"
            size="small"
          />
        </Box>
      )}

      <SessionDetailDrawer
        sessionId={selectedSessionId}
        onClose={() => setSelectedSessionId(null)}
      />
    </Box>
  );
}
