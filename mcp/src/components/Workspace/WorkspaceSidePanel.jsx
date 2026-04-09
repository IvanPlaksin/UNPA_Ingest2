/**
 * WorkspaceSidePanel (WS2-008)
 *
 * Compact left-side panel for the Workbench layout.
 * Shows sources, draft summary, contradiction badge, and quick actions.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Chip, IconButton, Tooltip, CircularProgress,
  List, ListItem, ListItemText, Divider, Badge, Alert
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  InsertDriveFile as FileIcon,
  WarningAmber as WarningIcon,
  PsychologyAlt as AnalysisIcon,
  Upload as PromoteIcon,
  CheckCircle as ReadyIcon
} from '@mui/icons-material';
import {
  listSources,
  listDrafts
} from '../../services/workspace.service';
import { API_BASE_URL } from '../../config/api.config';
import axios from 'axios';
import SuggestionsPanel from './analysis/SuggestionsPanel';

const SidePanel = ({ workspaceId, onAnalyzeClick, onPromoteClick }) => {
  const [sources, setSources] = useState([]);
  const [draftStats, setDraftStats] = useState({ total: 0, byType: {} });
  const [contradictionStats, setContradictionStats] = useState({ total: 0, blocking: 0 });
  const [validationStatus, setValidationStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      const [srcResp, draftResp, contraResp, validResp] = await Promise.all([
        listSources(workspaceId),
        listDrafts(workspaceId, { limit: 200, offset: 0 }),
        axios.get(`${API_BASE_URL}/workspaces/${workspaceId}/contradictions/stats`).then(r => r.data).catch(() => ({ data: { total: 0, bySeverity: {} } })),
        axios.get(`${API_BASE_URL}/workspaces/${workspaceId}/validate/can-promote`).then(r => r.data).catch(() => ({ data: { allowed: true, blockers: [] } }))
      ]);

      setSources(srcResp?.data || []);

      const drafts = draftResp?.data || [];
      const byType = {};
      for (const d of drafts) byType[d.type] = (byType[d.type] || 0) + 1;
      setDraftStats({ total: drafts.length, byType });

      const cs = contraResp?.data || {};
      setContradictionStats({
        total: cs.total || 0,
        blocking: cs.bySeverity?.BLOCKING || 0
      });

      setValidationStatus(validResp?.data || { allowed: true, blockers: [] });
    } catch (err) {
      setError(err.message || 'Failed to load workspace summary');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  if (loading && sources.length === 0) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <Box sx={{ p: 1.25, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="overline" color="text.secondary" fontSize="0.65rem">
            WORKSPACE
          </Typography>
          <IconButton size="small" onClick={load}>
            <RefreshIcon fontSize="small" />
          </IconButton>
        </Stack>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 0, fontSize: '0.7rem' }}>
          {error}
        </Alert>
      )}

      <Box sx={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {/* Promotion gate banner — click to open wizard at validation step */}
        {validationStatus && !validationStatus.allowed && (
          <Box
            onClick={onPromoteClick}
            sx={{
              p: 1.25,
              bgcolor: 'error.main',
              color: 'error.contrastText',
              cursor: onPromoteClick ? 'pointer' : 'default',
              '&:hover': { bgcolor: onPromoteClick ? 'error.dark' : 'error.main' }
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <WarningIcon fontSize="small" />
              <Box>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                  Promotion blocked
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
                  {validationStatus.blockers?.length || 0} blocker(s) — click to review
                </Typography>
              </Box>
            </Stack>
          </Box>
        )}

        {/* Promotion ready banner */}
        {validationStatus && validationStatus.allowed && onPromoteClick && (
          <Box
            onClick={onPromoteClick}
            sx={{
              p: 1.25,
              bgcolor: 'success.main',
              color: 'success.contrastText',
              cursor: 'pointer',
              '&:hover': { bgcolor: 'success.dark' }
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <ReadyIcon fontSize="small" />
              <Box>
                <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                  Ready to promote
                </Typography>
                <Typography variant="caption" sx={{ fontSize: '0.65rem' }}>
                  Click to open promotion wizard
                </Typography>
              </Box>
            </Stack>
          </Box>
        )}

        {/* Sources */}
        <Box sx={{ p: 1.25 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
            <Typography variant="caption" color="text.secondary" fontWeight={600}>
              SOURCES ({sources.length})
            </Typography>
          </Stack>
          {sources.length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
              No sources
            </Typography>
          ) : (
            <List dense disablePadding>
              {sources.map(s => (
                <ListItem key={s.id} disablePadding sx={{ py: 0.25 }}>
                  <FileIcon sx={{ fontSize: 14, mr: 0.5, color: 'text.secondary' }} />
                  <ListItemText
                    primary={s.filename || s.name || s.id}
                    primaryTypographyProps={{
                      fontSize: '0.75rem',
                      noWrap: true,
                      title: s.filename || s.name || s.id
                    }}
                    secondary={s.status}
                    secondaryTypographyProps={{ fontSize: '0.65rem' }}
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>

        <Divider />

        {/* Drafts */}
        <Box sx={{ p: 1.25 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
            DRAFTS ({draftStats.total})
          </Typography>
          {Object.keys(draftStats.byType).length === 0 ? (
            <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
              No drafts yet
            </Typography>
          ) : (
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {Object.entries(draftStats.byType).map(([type, count]) => (
                <Chip
                  key={type}
                  size="small"
                  label={`${type}: ${count}`}
                  sx={{ height: 18, fontSize: '0.65rem' }}
                />
              ))}
            </Stack>
          )}
        </Box>

        <Divider />

        {/* Contradictions */}
        <Box sx={{ p: 1.25 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: 'block', mb: 0.5 }}>
            CONTRADICTIONS
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center">
            <Badge badgeContent={contradictionStats.total} color="default" max={99} showZero>
              <Chip label="Total" size="small" sx={{ height: 20, fontSize: '0.7rem' }} />
            </Badge>
            {contradictionStats.blocking > 0 && (
              <Badge badgeContent={contradictionStats.blocking} color="error" max={99}>
                <Chip label="Blocking" size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
              </Badge>
            )}
          </Stack>
        </Box>

        <Divider />

        {/* Quick action: Analyze sources */}
        <Box sx={{ p: 1.25 }}>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ cursor: 'pointer', '&:hover': { color: 'primary.main' } }} onClick={onAnalyzeClick}>
            <AnalysisIcon fontSize="small" />
            <Typography variant="caption" fontWeight={600}>
              Analyze sources
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontSize: '0.65rem', mt: 0.25 }}>
            Generate cross-source report
          </Typography>
        </Box>

        {/* Suggestions */}
        <SuggestionsPanel workspaceId={workspaceId} />
      </Box>
    </Box>
  );
};

export default SidePanel;
