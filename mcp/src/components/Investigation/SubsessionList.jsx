/**
 * SubsessionList — shows subsessions for a parent investigation session.
 *
 * Features:
 *   - List of subsessions with status, artifact count, created date
 *   - "Create Subsession" dialog
 *   - Open subsession (navigate to its page)
 *   - Confluence/Merge action with confirmation dialog
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Stack, Typography, Button, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, List, ListItem, ListItemText, ListItemSecondaryAction,
  IconButton, Chip, Alert, CircularProgress, Divider, Tooltip,
} from '@mui/material';
import {
  GitBranch, ExternalLink, Merge, Plus, AlertTriangle, CheckCircle,
  XCircle, Clock,
} from 'lucide-react';
import { useInvestigationStore } from '../../stores/investigationStore';

// ─── Status chip ──────────────────────────────────────────────────────────────

function StatusChip({ status }) {
  const cfg = {
    ACTIVE:   { color: 'success', icon: <Clock size={10} />, label: 'Active' },
    MERGED:   { color: 'info',    icon: <CheckCircle size={10} />, label: 'Merged' },
    CLOSED:   { color: 'default', icon: <XCircle size={10} />, label: 'Closed' },
    ABANDONED:{ color: 'warning', icon: <AlertTriangle size={10} />, label: 'Abandoned' },
  }[status] || { color: 'default', label: status };

  return (
    <Chip
      size="small"
      icon={cfg.icon}
      label={cfg.label}
      color={cfg.color}
      sx={{ height: 18, fontSize: '0.62rem' }}
    />
  );
}

// ─── Create Subsession Dialog ─────────────────────────────────────────────────

function CreateSubsessionDialog({ open, onClose, onConfirm, parentName }) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await onConfirm(name.trim());
      setName('');
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <GitBranch size={18} />
          <span>Create Subsession</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          The subsession will inherit all artifacts and evidence from <strong>{parentName}</strong>.
          Run deep investigations without affecting the main session — merge results back with Confluence.
        </Typography>
        <TextField
          label="Subsession name"
          fullWidth
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
          placeholder="e.g., Deep dive into OICT relationships"
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={creating}>Cancel</Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={!name.trim() || creating}
          startIcon={creating ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <Plus size={14} />}
        >
          Create & Open
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Confluence Dialog ────────────────────────────────────────────────────────

function ConfluenceDialog({ open, subsession, onClose, onConfirm }) {
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState(null);

  const handleMerge = async () => {
    setMerging(true);
    setError(null);
    try {
      await onConfirm(subsession.sessionId);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setMerging(false);
    }
  };

  if (!subsession) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <Merge size={18} />
          <span>Merge Subsession Results</span>
        </Stack>
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Import <strong>{subsession.artifactCount || 0} artifact(s)</strong> from{' '}
          <strong>"{subsession.name}"</strong> into the current session.
        </Typography>
        <Alert severity="info" sx={{ '& .MuiAlert-message': { fontSize: '0.8rem' } }}>
          A new evidentiary version will be created with the merged evidence.
          The subsession will become read-only after merging.
        </Alert>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={merging}>Cancel</Button>
        <Button
          variant="contained"
          color="primary"
          onClick={handleMerge}
          disabled={merging}
          startIcon={merging ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : <Merge size={14} />}
        >
          Merge
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SubsessionList({ sessionId, sessionName, sessionStatus }) {
  const navigate = useNavigate();
  const {
    subsessions, subsessionsLoading,
    fetchSubsessions, createSubsession, confluenceSubsession,
  } = useInvestigationStore();

  const [createOpen, setCreateOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState(null);

  useEffect(() => {
    if (sessionId) fetchSubsessions(sessionId);
  }, [sessionId]);

  const handleCreate = async (name) => {
    const subsession = await createSubsession(sessionId, name);
    // Navigate to new subsession immediately
    navigate(`/investigation/${subsession.sessionId}`);
  };

  const handleMerge = async (subsessionId) => {
    await confluenceSubsession(sessionId, subsessionId);
    setMergeTarget(null);
  };

  const isParentActive = sessionStatus === 'ACTIVE';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 1.5, py: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" spacing={0.75} alignItems="center">
          <GitBranch size={13} style={{ opacity: 0.5 }} />
          <Typography variant="caption" fontWeight={700}>Subsessions</Typography>
          {subsessions.length > 0 && (
            <Chip size="small" label={subsessions.length} sx={{ height: 16, fontSize: '0.6rem' }} />
          )}
        </Stack>
        {isParentActive && (
          <Tooltip title="Create a focused subsession">
            <Button
              size="small"
              startIcon={<Plus size={12} />}
              onClick={() => setCreateOpen(true)}
              sx={{ fontSize: '0.7rem', height: 24, px: 1 }}
            >
              New
            </Button>
          </Tooltip>
        )}
      </Stack>

      {/* List */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {subsessionsLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress size={18} />
          </Box>
        ) : subsessions.length === 0 ? (
          <Box sx={{ px: 2, py: 3, textAlign: 'center', opacity: 0.4 }}>
            <GitBranch size={24} />
            <Typography variant="caption" display="block" sx={{ mt: 1 }}>
              No subsessions yet.{isParentActive ? ' Create one to explore a focused thread.' : ''}
            </Typography>
          </Box>
        ) : (
          <List dense disablePadding>
            {subsessions.map((sub, i) => (
              <React.Fragment key={sub.sessionId}>
                {i > 0 && <Divider />}
                <ListItem
                  sx={{
                    py: 1, px: 1.5,
                    '&:hover': { bgcolor: 'action.hover' },
                    alignItems: 'flex-start',
                  }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.25 }}>
                        <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 140 }}>
                          {sub.name}
                        </Typography>
                        <StatusChip status={sub.status} />
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={1} sx={{ mt: 0.25 }}>
                        <Typography variant="caption" color="text.secondary">
                          {sub.artifactCount || 0} artifact{sub.artifactCount !== 1 ? 's' : ''}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(sub.createdAt).toLocaleDateString()}
                        </Typography>
                      </Stack>
                    }
                  />
                  <Stack direction="column" spacing={0.5} sx={{ ml: 1, flexShrink: 0 }}>
                    {/* Open */}
                    <Tooltip title="Open subsession">
                      <IconButton
                        size="small"
                        onClick={() => navigate(`/investigation/${sub.sessionId}`)}
                        sx={{ width: 24, height: 24 }}
                      >
                        <ExternalLink size={12} />
                      </IconButton>
                    </Tooltip>
                    {/* Merge */}
                    {sub.status === 'ACTIVE' && isParentActive && (
                      <Tooltip title="Merge results into parent">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => setMergeTarget(sub)}
                          sx={{ width: 24, height: 24 }}
                        >
                          <Merge size={12} />
                        </IconButton>
                      </Tooltip>
                    )}
                  </Stack>
                </ListItem>
              </React.Fragment>
            ))}
          </List>
        )}
      </Box>

      {/* Dialogs */}
      <CreateSubsessionDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onConfirm={handleCreate}
        parentName={sessionName}
      />
      <ConfluenceDialog
        open={Boolean(mergeTarget)}
        subsession={mergeTarget}
        onClose={() => setMergeTarget(null)}
        onConfirm={handleMerge}
      />
    </Box>
  );
}
