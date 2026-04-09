import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Chip, Stack, Alert, CircularProgress,
  List, ListItem, ListItemButton, ListItemText, IconButton, Divider,
  LinearProgress, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { Upload, CheckCircle, ArrowRight, X, Eye, FileText, GitMerge, AlertCircle, ChevronUp, ChevronDown } from 'lucide-react';
import StatusChip from './StatusChip';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import * as wsApi from '../../services/workspace.service';
import PromotionWizard from './PromotionWizard';

const TYPE_ICONS = {
  entity: '🏢', relationship: '🔗', business_rule: '📏', schema: '📊',
  workflow: '🔄', calculation: '🧮', concept: '💡', policy: '📋',
  decision: '⚖️', requirement: '📌', anomaly: '⚠️', api_contract: '🔌'
};

export default function PromotionTab({ workspaceId }) {
  const { updateDraft } = useWorkspaceStore();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [readyDrafts, setReadyDrafts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraft, setSelectedDraft] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusError, setStatusError] = useState(null);

  useEffect(() => { loadData(); }, [workspaceId]);

  // Cross-panel: SidePanel banner can launch the wizard via window event
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.workspaceId === workspaceId) {
        setWizardOpen(true);
      }
    };
    window.addEventListener('workspace:promotion:launch', handler);
    return () => window.removeEventListener('workspace:promotion:launch', handler);
  }, [workspaceId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await wsApi.listDrafts(workspaceId, { status: 'VALIDATED', limit: 200 });
      const validated = res.data || [];
      const res2 = await wsApi.listDrafts(workspaceId, { status: 'READY_TO_PROMOTE', limit: 200 });
      setReadyDrafts([...validated, ...(res2.data || [])]);
    } catch { setReadyDrafts([]); }
    finally { setLoading(false); }
  };

  const handleWizardClose = (result) => {
    setWizardOpen(false);
    if (result?.success) loadData();
  };

  const handleOpenDetail = (draft) => {
    setSelectedDraft(draft);
    setDetailOpen(true);
    setStatusError(null);
  };

  const handleStatusChange = async (draft, newStatus) => {
    setStatusError(null);
    try {
      await updateDraft(workspaceId, draft.id, { status: newStatus });
      await loadData();
      // Update selected draft if open
      if (selectedDraft?.id === draft.id) {
        setSelectedDraft(prev => ({ ...prev, status: newStatus }));
      }
    } catch (err) {
      setStatusError(err.response?.data?.error?.message || err.message);
    }
  };

  // Group by status, then by type
  const validated = readyDrafts.filter(d => d.status === 'VALIDATED');
  const readyToPromote = readyDrafts.filter(d => d.status === 'READY_TO_PROMOTE');
  const byType = readyDrafts.reduce((acc, d) => { acc[d.type] = (acc[d.type] || 0) + 1; return acc; }, {});

  return (
    <Box>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Box>
          <Typography variant="subtitle1" fontWeight={600} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Upload size={20} /> Promotion to Knowledge Base
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Promote validated drafts to the Global KB
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<Upload size={18} />}
          onClick={() => setWizardOpen(true)}
          disabled={readyDrafts.length === 0}
        >
          Start Promotion ({readyDrafts.length} ready)
        </Button>
      </Stack>

      {loading && <CircularProgress size={24} />}

      {/* Summary chips */}
      {readyDrafts.length > 0 && (
        <Paper sx={{ p: 2, mb: 3, borderLeft: 3, borderColor: 'success.main' }}>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
            <Typography variant="subtitle2">
              {readyDrafts.length} drafts ready
            </Typography>
            <Chip label={`${readyToPromote.length} READY_TO_PROMOTE`} size="small" color="primary" variant="outlined" />
            <Chip label={`${validated.length} VALIDATED`} size="small" color="info" variant="outlined" />
          </Stack>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {Object.entries(byType).map(([type, count]) => (
              <Chip key={type} label={`${TYPE_ICONS[type] || '📄'} ${type}: ${count}`} size="small" variant="outlined" />
            ))}
          </Stack>
        </Paper>
      )}

      {statusError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setStatusError(null)}>{statusError}</Alert>
      )}

      {/* READY_TO_PROMOTE section */}
      {readyToPromote.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <ArrowRight size={16} /> Ready to Promote ({readyToPromote.length})
          </Typography>
          <Paper variant="outlined">
            <List dense disablePadding>
              {readyToPromote.map(draft => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  onOpen={() => handleOpenDetail(draft)}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </List>
          </Paper>
        </Box>
      )}

      {/* VALIDATED section */}
      {validated.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CheckCircle size={16} /> Validated ({validated.length})
          </Typography>
          <Paper variant="outlined">
            <List dense disablePadding>
              {validated.map(draft => (
                <DraftRow
                  key={draft.id}
                  draft={draft}
                  onOpen={() => handleOpenDetail(draft)}
                  onStatusChange={handleStatusChange}
                />
              ))}
            </List>
          </Paper>
        </Box>
      )}

      {/* Empty state */}
      {readyDrafts.length === 0 && !loading && (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <AlertCircle size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
          <Typography color="text.secondary">
            No drafts ready for promotion.
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mt: 1 }}>
            Validate drafts first: DRAFT → VALIDATED → READY_TO_PROMOTE
          </Typography>
        </Paper>
      )}

      {/* Detail Dialog */}
      <DraftDetailDialog
        open={detailOpen}
        draft={selectedDraft}
        drafts={readyDrafts}
        onNavigate={(draft) => setSelectedDraft(draft)}
        onClose={() => { setDetailOpen(false); setSelectedDraft(null); }}
        onStatusChange={handleStatusChange}
      />

      <PromotionWizard open={wizardOpen} workspaceId={workspaceId} initialDrafts={readyDrafts} onClose={handleWizardClose} />
    </Box>
  );
}

/** Individual draft row in the list */
function DraftRow({ draft, onOpen, onStatusChange }) {
  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Stack direction="row" spacing={0.5} alignItems="center">
          {draft.status === 'VALIDATED' && (
            <Button
              size="small"
              variant="outlined"
              color="primary"
              startIcon={<ArrowRight size={14} />}
              onClick={(e) => { e.stopPropagation(); onStatusChange(draft, 'READY_TO_PROMOTE'); }}
              sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.2, minWidth: 0 }}
            >
              Promote
            </Button>
          )}
          <IconButton size="small" onClick={onOpen} title="Open details">
            <Eye size={16} />
          </IconButton>
        </Stack>
      }
    >
      <ListItemButton onClick={onOpen} sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <ListItemText
          primary={
            <Stack direction="row" alignItems="center" spacing={1}>
              <span>{TYPE_ICONS[draft.type] || '📄'}</span>
              <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 300 }}>
                {draft.name}
              </Typography>
            </Stack>
          }
          secondary={
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
              <Chip label={draft.type} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
              <StatusChip status={draft.status} size="small" />
              <Typography variant="caption" color="text.disabled">
                {(draft.confidence * 100).toFixed(0)}%
              </Typography>
              {draft.extractedAt && (
                <Typography variant="caption" color="text.disabled">
                  {new Date(draft.extractedAt).toLocaleDateString()}
                </Typography>
              )}
            </Stack>
          }
        />
      </ListItemButton>
    </ListItem>
  );
}

/** Detail dialog for a single draft with prev/next navigation */
function DraftDetailDialog({ open, draft, drafts = [], onNavigate, onClose, onStatusChange }) {
  if (!draft) return null;

  const currentIndex = drafts.findIndex(d => d.id === draft.id);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < drafts.length - 1;

  const goPrev = () => { if (hasPrev) onNavigate(drafts[currentIndex - 1]); };
  const goNext = () => { if (hasNext) onNavigate(drafts[currentIndex + 1]); };

  const transitions = {
    VALIDATED: ['READY_TO_PROMOTE', 'DRAFT', 'REJECTED'],
    READY_TO_PROMOTE: ['VALIDATED'],
    DRAFT: ['VALIDATED', 'REJECTED'],
  };
  const allowed = transitions[draft.status] || [];

  const btnMeta = {
    VALIDATED:        { label: 'Validate',          color: 'success' },
    READY_TO_PROMOTE: { label: 'Ready to Promote',  color: 'primary' },
    DRAFT:            { label: 'Back to Draft',      color: 'warning' },
    REJECTED:         { label: 'Reject',             color: 'error' },
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1} sx={{ minWidth: 0 }}>
          <span>{TYPE_ICONS[draft.type] || '📄'}</span>
          <Typography variant="subtitle1" fontWeight={600} noWrap>{draft.name}</Typography>
          {drafts.length > 1 && (
            <Typography variant="caption" color="text.disabled" sx={{ whiteSpace: 'nowrap' }}>
              {currentIndex + 1}/{drafts.length}
            </Typography>
          )}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={0.25}>
          <IconButton onClick={goPrev} disabled={!hasPrev} size="small" title="Previous">
            <ChevronUp size={18} />
          </IconButton>
          <IconButton onClick={goNext} disabled={!hasNext} size="small" title="Next">
            <ChevronDown size={18} />
          </IconButton>
          <IconButton onClick={onClose} size="small" title="Close">
            <X size={18} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {/* Status & Type */}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <StatusChip status={draft.status} />
          <Chip label={draft.type} size="small" variant="outlined" />
          {draft.knowledgeFamily && (
            <Chip label={draft.knowledgeFamily} size="small" variant="outlined" color="info" />
          )}
        </Stack>

        {/* Status transition buttons */}
        {allowed.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mb: 2 }} flexWrap="wrap" useFlexGap>
            {allowed.map(target => {
              const meta = btnMeta[target] || { label: target, color: 'inherit' };
              return (
                <Button
                  key={target}
                  size="small"
                  variant="outlined"
                  color={meta.color}
                  onClick={() => onStatusChange(draft, target)}
                  sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                >
                  {meta.label}
                </Button>
              );
            })}
          </Stack>
        )}

        {draft.status === 'PROMOTED' && <Alert severity="success" variant="outlined" sx={{ mb: 2 }}>Promoted to Global KB</Alert>}
        {draft.status === 'REJECTED' && <Alert severity="error" variant="outlined" sx={{ mb: 2 }}>Rejected</Alert>}

        <Divider sx={{ mb: 2 }} />

        {/* Description */}
        {draft.description && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Description</Typography>
            <Typography variant="body2">{draft.description}</Typography>
          </Box>
        )}

        {/* Confidence */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">Confidence</Typography>
          <Stack direction="row" alignItems="center" spacing={1}>
            <LinearProgress variant="determinate" value={(draft.confidence || 0) * 100} sx={{ flex: 1 }} />
            <Typography variant="body2">{((draft.confidence || 0) * 100).toFixed(0)}%</Typography>
          </Stack>
        </Box>

        {/* Content */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">Content</Typography>
          <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, maxHeight: 250, overflow: 'auto', bgcolor: 'action.hover' }}>
            <Typography variant="body2" component="pre" sx={{ fontSize: '0.75rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace', m: 0 }}>
              {JSON.stringify(draft.content, null, 2)}
            </Typography>
          </Paper>
        </Box>

        {/* Content Hash */}
        {draft.contentHash && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" color="text.secondary">Content Hash</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{draft.contentHash}</Typography>
          </Box>
        )}

        {/* Metadata */}
        <Stack direction="row" spacing={2}>
          {draft.extractedBy && (
            <Typography variant="caption" color="text.disabled">By: {draft.extractedBy}</Typography>
          )}
          {draft.extractedAt && (
            <Typography variant="caption" color="text.disabled">At: {new Date(draft.extractedAt).toLocaleString()}</Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
