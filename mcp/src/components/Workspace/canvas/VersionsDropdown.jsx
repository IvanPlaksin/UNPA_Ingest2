/**
 * VersionsDropdown (WS3-001)
 *
 * Toolbar dropdown showing recent graph versions with restore + diff actions.
 * Backed by GET /workspaces/:id/versions.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Menu, MenuItem, Typography, Stack, Chip, Divider,
  ListItemText, ListItemIcon, Tooltip, CircularProgress
} from '@mui/material';
import {
  History as HistoryIcon,
  Restore as RestoreIcon,
  CompareArrows as DiffIcon,
  Person as UserIcon,
  SmartToy as AgentIcon,
  AutoAwesome as AutoIcon
} from '@mui/icons-material';
import { listGraphVersions, restoreGraphVersion } from '../../../services/workspace.service';

const SOURCE_ICONS = {
  user: UserIcon,
  auto: AutoIcon,
  agent: AgentIcon
};

function formatRelativeTime(iso) {
  if (!iso) return '';
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diff = Math.floor((now - t) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const VersionsDropdown = ({ workspaceId, onRestored, onCompare }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(null);

  const open = Boolean(anchorEl);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const resp = await listGraphVersions(workspaceId, { limit: 10 });
      setVersions(resp?.data || []);
    } catch (err) {
      console.warn('VersionsDropdown load failed', err);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Load on open
  useEffect(() => { if (open) load(); }, [open, load]);

  const handleRestore = useCallback(async (version) => {
    const ok = window.confirm(
      `Restore graph to version #${version.versionNumber}?\n\n` +
      `Note: ${version.note || '(no note)'}\n` +
      `Created: ${version.createdAt}\n\n` +
      `Current state will be saved as a safety checkpoint before restore.`
    );
    if (!ok) return;
    setRestoring(version.id);
    try {
      const resp = await restoreGraphVersion(workspaceId, version.id);
      const data = resp?.data || {};
      setAnchorEl(null);
      onRestored?.(data);
    } catch (err) {
      window.alert(`Restore failed: ${err.message}`);
    } finally {
      setRestoring(null);
    }
  }, [workspaceId, onRestored]);

  const handleCompare = useCallback(() => {
    setAnchorEl(null);
    onCompare?.(versions);
  }, [versions, onCompare]);

  const currentVersion = versions[0];

  return (
    <>
      <Tooltip title="Version history">
        <Button
          size="small"
          variant="text"
          onClick={(e) => setAnchorEl(e.currentTarget)}
          startIcon={<HistoryIcon fontSize="small" />}
          sx={{ minWidth: 0, textTransform: 'none', fontSize: '0.75rem' }}
        >
          {currentVersion ? `v${currentVersion.versionNumber}` : 'Versions'}
        </Button>
      </Tooltip>

      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => setAnchorEl(null)}
        PaperProps={{ sx: { minWidth: 320, maxHeight: 460 } }}
      >
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
            <CircularProgress size={18} />
          </Box>
        )}

        {!loading && versions.length === 0 && (
          <Box sx={{ px: 2, py: 1.5 }}>
            <Typography variant="caption" color="text.secondary">
              No versions yet. Create a checkpoint to save the current state.
            </Typography>
          </Box>
        )}

        {!loading && versions.map((v, idx) => {
          const SourceIcon = SOURCE_ICONS[v.createdBy] || UserIcon;
          const isCurrent = idx === 0;
          return (
            <MenuItem
              key={v.id}
              onClick={() => handleRestore(v)}
              disabled={restoring === v.id}
              sx={{ alignItems: 'flex-start', py: 0.75 }}
            >
              <ListItemIcon sx={{ minWidth: 28 }}>
                <SourceIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      v{v.versionNumber}
                    </Typography>
                    {isCurrent && (
                      <Chip label="latest" size="small" color="primary" sx={{ height: 14, fontSize: '0.55rem' }} />
                    )}
                    {v.metadata && (
                      <Chip
                        label={`${v.metadata.nodeCount}n / ${v.metadata.edgeCount}e`}
                        size="small"
                        variant="outlined"
                        sx={{ height: 14, fontSize: '0.55rem' }}
                      />
                    )}
                  </Stack>
                }
                secondary={
                  <>
                    <Typography variant="caption" sx={{ display: 'block', fontSize: '0.7rem', color: 'text.secondary' }}>
                      {v.note || '(no note)'}
                    </Typography>
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>
                      {formatRelativeTime(v.createdAt)} • {v.createdBy}
                    </Typography>
                  </>
                }
              />
              {restoring === v.id ? (
                <CircularProgress size={14} sx={{ ml: 1 }} />
              ) : (
                <RestoreIcon fontSize="small" sx={{ color: 'text.disabled', ml: 1 }} />
              )}
            </MenuItem>
          );
        })}

        {!loading && versions.length >= 2 && (
          <>
            <Divider />
            <MenuItem onClick={handleCompare}>
              <ListItemIcon sx={{ minWidth: 28 }}>
                <DiffIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText
                primary="Compare versions…"
                primaryTypographyProps={{ variant: 'body2', fontSize: '0.8rem' }}
              />
            </MenuItem>
          </>
        )}
      </Menu>
    </>
  );
};

export default VersionsDropdown;
