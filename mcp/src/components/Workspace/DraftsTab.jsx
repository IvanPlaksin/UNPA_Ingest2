import React, { useEffect, useState } from 'react';
import { Box, Typography, Stack, TextField, MenuItem, Paper, List, ListItem, ListItemButton, ListItemText, Chip, LinearProgress, IconButton, Drawer, Divider, Button, Alert } from '@mui/material';
import { Search, X, Trash2, Edit2, CheckCircle, ArrowRight, XCircle, GitMerge, RotateCcw, ChevronUp, ChevronDown } from 'lucide-react';
import StatusChip from './StatusChip';
import { useWorkspaceStore } from '../../stores/workspaceStore';

/** FSM: allowed transitions per status */
const STATUS_TRANSITIONS = {
  DRAFT:            ['VALIDATED', 'REJECTED'],
  VALIDATED:        ['READY_TO_PROMOTE', 'DRAFT', 'REJECTED'],
  READY_TO_PROMOTE: ['VALIDATED'],
  CONFLICT:         ['MERGED', 'REJECTED', 'READY_TO_PROMOTE'],
  MERGED:           [],
  PROMOTED:         [],
  REJECTED:         [],
};

const TRANSITION_META = {
  VALIDATED:        { label: 'Validate',         icon: CheckCircle, color: 'success' },
  READY_TO_PROMOTE: { label: 'Ready to Promote', icon: ArrowRight,  color: 'primary' },
  DRAFT:            { label: 'Back to Draft',     icon: RotateCcw,   color: 'warning' },
  REJECTED:         { label: 'Reject',            icon: XCircle,     color: 'error' },
  MERGED:           { label: 'Mark Merged',       icon: GitMerge,    color: 'info' },
};

const DRAFT_TYPES = ['', 'entity', 'relationship', 'business_rule', 'schema', 'workflow', 'calculation', 'concept', 'policy', 'decision', 'requirement', 'anomaly', 'api_contract'];
const DRAFT_STATUSES = ['', 'DRAFT', 'VALIDATED', 'READY_TO_PROMOTE', 'PROMOTED', 'REJECTED', 'CONFLICT', 'MERGED'];

const TYPE_ICONS = {
  entity: '🏢', relationship: '🔗', business_rule: '📏', schema: '📊',
  workflow: '🔄', calculation: '🧮', concept: '💡', policy: '📋',
  decision: '⚖️', requirement: '📌', anomaly: '⚠️', api_contract: '🔌'
};

const DraftsTab = ({ workspaceId }) => {
  const {
    drafts, totalDrafts, selectedDraft, draftEdges, loading,
    filters, setFilter, fetchDrafts, selectDraft, deleteDraft, searchDrafts,
    updateDraft
  } = useWorkspaceStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusError, setStatusError] = useState(null);

  const handleStatusChange = async (newStatus) => {
    if (!selectedDraft) return;
    setStatusError(null);
    try {
      await updateDraft(workspaceId, selectedDraft.id, { status: newStatus });
    } catch (err) {
      setStatusError(err.response?.data?.error?.message || err.message);
    }
  };

  const allowedTransitions = selectedDraft
    ? (STATUS_TRANSITIONS[selectedDraft.status] || [])
    : [];

  useEffect(() => {
    if (workspaceId) fetchDrafts(workspaceId);
  }, [workspaceId, filters.draftType, filters.draftStatus]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchDrafts(workspaceId, searchQuery);
    } else {
      fetchDrafts(workspaceId);
    }
  };

  const handleDelete = async (draftId) => {
    if (window.confirm('Delete this draft?')) {
      await deleteDraft(workspaceId, draftId);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 250px)' }}>
      {/* Left: List */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', mr: selectedDraft ? 2 : 0 }}>
        {/* Filters */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder="Search drafts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            sx={{ flex: 1 }}
            InputProps={{
              endAdornment: <IconButton size="small" onClick={handleSearch}><Search size={16} /></IconButton>
            }}
          />
          <TextField select size="small" label="Type" value={filters.draftType} onChange={(e) => setFilter('draftType', e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="">All Types</MenuItem>
            {DRAFT_TYPES.filter(Boolean).map(t => <MenuItem key={t} value={t}>{TYPE_ICONS[t]} {t}</MenuItem>)}
          </TextField>
          <TextField select size="small" label="Status" value={filters.draftStatus} onChange={(e) => setFilter('draftStatus', e.target.value)} sx={{ minWidth: 130 }}>
            <MenuItem value="">All</MenuItem>
            {DRAFT_STATUSES.filter(Boolean).map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
          {totalDrafts} drafts
        </Typography>

        {loading && <LinearProgress sx={{ mb: 1 }} />}

        {/* Draft List */}
        <Paper variant="outlined" sx={{ flex: 1, overflow: 'auto' }}>
          <List dense disablePadding>
            {drafts.map(draft => (
              <ListItem
                key={draft.id}
                disablePadding
                secondaryAction={
                  <IconButton size="small" onClick={() => handleDelete(draft.id)}>
                    <Trash2 size={14} />
                  </IconButton>
                }
              >
                <ListItemButton
                  selected={selectedDraft?.id === draft.id}
                  onClick={() => selectDraft(workspaceId, draft.id)}
                  sx={{ borderBottom: 1, borderColor: 'divider' }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <span>{TYPE_ICONS[draft.type] || '📄'}</span>
                        <Typography variant="body2" fontWeight={500} noWrap>{draft.name}</Typography>
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        <Chip label={draft.type} size="small" variant="outlined" sx={{ fontSize: '0.7rem', height: 20 }} />
                        <StatusChip status={draft.status} size="small" />
                        <Typography variant="caption" color="text.disabled">
                          {(draft.confidence * 100).toFixed(0)}%
                        </Typography>
                      </Stack>
                    }
                  />
                </ListItemButton>
              </ListItem>
            ))}
            {drafts.length === 0 && !loading && (
              <Box sx={{ p: 4, textAlign: 'center' }}>
                <Typography color="text.secondary">No drafts found</Typography>
              </Box>
            )}
          </List>
        </Paper>
      </Box>

      {/* Right: Detail Panel */}
      {selectedDraft && (() => {
        const currentIdx = drafts.findIndex(d => d.id === selectedDraft.id);
        const hasPrev = currentIdx > 0;
        const hasNext = currentIdx >= 0 && currentIdx < drafts.length - 1;
        return (
        <Paper variant="outlined" sx={{ width: 380, overflow: 'auto', p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={600} noWrap>{selectedDraft.name}</Typography>
              {drafts.length > 1 && (
                <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
                  {currentIdx + 1}/{drafts.length}
                </Typography>
              )}
            </Stack>
            <Stack direction="row" spacing={0}>
              <IconButton size="small" disabled={!hasPrev} onClick={() => selectDraft(workspaceId, drafts[currentIdx - 1].id)} title="Previous">
                <ChevronUp size={16} />
              </IconButton>
              <IconButton size="small" disabled={!hasNext} onClick={() => selectDraft(workspaceId, drafts[currentIdx + 1].id)} title="Next">
                <ChevronDown size={16} />
              </IconButton>
              <IconButton size="small" onClick={() => selectDraft(workspaceId, null)} title="Close">
                <X size={16} />
              </IconButton>
            </Stack>
          </Stack>

          <Stack direction="row" spacing={1} sx={{ mt: 1, mb: 1.5 }}>
            <StatusChip status={selectedDraft.status} />
            <Chip label={selectedDraft.type} size="small" variant="outlined" />
            <Chip label={selectedDraft.knowledgeFamily} size="small" variant="outlined" color="info" />
          </Stack>

          {/* Status transition buttons */}
          {allowedTransitions.length > 0 && (
            <Stack direction="row" spacing={1} sx={{ mb: 1.5 }} flexWrap="wrap" useFlexGap>
              {allowedTransitions.map(target => {
                const meta = TRANSITION_META[target] || { label: target, color: 'inherit' };
                const Icon = meta.icon;
                return (
                  <Button
                    key={target}
                    size="small"
                    variant="outlined"
                    color={meta.color}
                    startIcon={Icon ? <Icon size={14} /> : null}
                    onClick={() => handleStatusChange(target)}
                    sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.3 }}
                  >
                    {meta.label}
                  </Button>
                );
              })}
            </Stack>
          )}
          {selectedDraft.status === 'PROMOTED' && (
            <Alert severity="success" sx={{ mb: 1.5, py: 0 }} variant="outlined">Promoted to Global KB</Alert>
          )}
          {selectedDraft.status === 'REJECTED' && (
            <Alert severity="error" sx={{ mb: 1.5, py: 0 }} variant="outlined">Rejected</Alert>
          )}
          {statusError && (
            <Alert severity="error" sx={{ mb: 1.5, py: 0 }} onClose={() => setStatusError(null)}>{statusError}</Alert>
          )}

          <Divider sx={{ mb: 2 }} />

          {selectedDraft.description && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">Description</Typography>
              <Typography variant="body2">{selectedDraft.description}</Typography>
            </Box>
          )}

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Confidence</Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <LinearProgress variant="determinate" value={selectedDraft.confidence * 100} sx={{ flex: 1 }} />
              <Typography variant="body2">{(selectedDraft.confidence * 100).toFixed(0)}%</Typography>
            </Stack>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Content</Typography>
            <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, maxHeight: 200, overflow: 'auto', bgcolor: 'action.hover' }}>
              <Typography variant="body2" component="pre" sx={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                {JSON.stringify(selectedDraft.content, null, 2)}
              </Typography>
            </Paper>
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Content Hash</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{selectedDraft.contentHash}</Typography>
          </Box>

          {draftEdges.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" color="text.secondary">Relationships ({draftEdges.length})</Typography>
              {draftEdges.map((edge, i) => (
                <Chip key={i} label={`${edge.edgeType} → ${edge.targetId?.slice(0, 8)}...`} size="small" sx={{ mr: 0.5, mt: 0.5 }} />
              ))}
            </Box>
          )}

          <Typography variant="caption" color="text.disabled">
            Extracted by {selectedDraft.extractedBy} at {selectedDraft.extractedAt}
          </Typography>
        </Paper>
        );
      })()}
    </Box>
  );
};

export default DraftsTab;
