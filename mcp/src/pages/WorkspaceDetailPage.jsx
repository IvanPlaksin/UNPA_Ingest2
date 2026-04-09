import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, Typography, Stack, IconButton, Tabs, Tab, Alert, CircularProgress, Chip, Button, Menu, MenuItem } from '@mui/material';
import { ArrowLeft, MoreVertical, Play, Pause, CheckCircle, Archive } from 'lucide-react';
import StatusChip from '../components/Workspace/StatusChip';
import WorkspaceOverviewTab from '../components/Workspace/WorkspaceOverviewTab';
import SourcesTab from '../components/Workspace/SourcesTab';
import DraftsTab from '../components/Workspace/DraftsTab';
import KBSearchTab from '../components/Workspace/KBSearchTab';
import AuditTab from '../components/Workspace/AuditTab';
import PromotionTab from '../components/Workspace/PromotionTab';
import WorkspaceCanvas from '../components/Workspace/WorkspaceCanvas';
import WorkspaceWorkbench from '../components/Workspace/WorkspaceWorkbench';
import WorkspaceFormBuilder from '../components/Workspace/WorkspaceFormBuilder';
import { useWorkspaceStore } from '../stores/workspaceStore';
import ErrorBoundary from '../components/common/ErrorBoundary';

const STATUS_TRANSITIONS = {
  CREATED:    ['PROFILING', 'ARCHIVED'],
  PROFILING:  ['READY', 'PAUSED', 'ARCHIVED'],
  READY:      ['EXTRACTING', 'REVIEW', 'ARCHIVED'],
  EXTRACTING: ['READY', 'PAUSED', 'REVIEW'],
  PAUSED:     ['EXTRACTING', 'READY', 'ARCHIVED'],
  REVIEW:     ['PROMOTED', 'READY', 'ARCHIVED'],
  PROMOTED:   ['READY', 'ARCHIVED'],
  ARCHIVED:   []
};

const WorkspaceDetailPage = () => {
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const {
    currentWorkspace, stats, loading, error, activeTab,
    fetchWorkspace, updateStatus, setActiveTab, reset, clearError
  } = useWorkspaceStore();

  const [statusMenuAnchor, setStatusMenuAnchor] = React.useState(null);

  useEffect(() => {
    if (workspaceId) fetchWorkspace(workspaceId);
    return () => reset();
  }, [workspaceId]);

  const handleStatusChange = async (newStatus) => {
    setStatusMenuAnchor(null);
    try {
      await updateStatus(workspaceId, newStatus);
      await fetchWorkspace(workspaceId);
    } catch {
      // Error handled in store
    }
  };

  const allowedTransitions = currentWorkspace ? (STATUS_TRANSITIONS[currentWorkspace.status] || []) : [];

  if (loading && !currentWorkspace) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!currentWorkspace && !loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">WorkSpace not found: {workspaceId}</Alert>
        <Button onClick={() => navigate('/workspaces')} sx={{ mt: 2 }}>Back to WorkSpaces</Button>
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Box sx={{ px: 3, pt: 2, pb: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" spacing={2}>
          <IconButton onClick={() => navigate('/workspaces')} size="small">
            <ArrowLeft size={20} />
          </IconButton>
          <Box sx={{ flex: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Typography variant="h6" fontWeight={700}>{currentWorkspace?.name}</Typography>
              <StatusChip status={currentWorkspace?.status} />
              {currentWorkspace?.domain && <Chip label={currentWorkspace.domain} size="small" variant="outlined" />}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Created by {currentWorkspace?.createdBy} &bull; {currentWorkspace?.sourceCount || 0} sources &bull; {currentWorkspace?.draftCount || 0} drafts
            </Typography>
          </Box>

          {/* Status actions */}
          {allowedTransitions.length > 0 && (
            <>
              <Button
                size="small"
                variant="outlined"
                onClick={(e) => setStatusMenuAnchor(e.currentTarget)}
                endIcon={<MoreVertical size={14} />}
              >
                Change Status
              </Button>
              <Menu
                anchorEl={statusMenuAnchor}
                open={Boolean(statusMenuAnchor)}
                onClose={() => setStatusMenuAnchor(null)}
              >
                {allowedTransitions.map(s => (
                  <MenuItem key={s} onClick={() => handleStatusChange(s)}>
                    {s === 'EXTRACTING' && <Play size={14} style={{ marginRight: 8 }} />}
                    {s === 'PAUSED' && <Pause size={14} style={{ marginRight: 8 }} />}
                    {s === 'REVIEW' && <CheckCircle size={14} style={{ marginRight: 8 }} />}
                    {s === 'ARCHIVED' && <Archive size={14} style={{ marginRight: 8 }} />}
                    {s}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
        </Stack>

        {error && <Alert severity="error" onClose={clearError} sx={{ mt: 1 }}>{error}</Alert>}

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v) => setActiveTab(v)}
          sx={{ mt: 1 }}
        >
          <Tab label="Workbench" />
          <Tab label="Overview" />
          <Tab label="Sources" />
          <Tab label="Drafts" />
          <Tab label="Canvas" />
          <Tab label="Form Builder" />
          <Tab label="KB Search" />
          <Tab label="Promotion" />
          <Tab label="Audit" />
        </Tabs>
      </Box>

      {/* Tab Content */}
      <Box sx={{
        flex: 1,
        position: 'relative',
        overflow: (activeTab === 0 || activeTab === 4 || activeTab === 5) ? 'hidden' : 'auto',
        p: (activeTab === 0 || activeTab === 4 || activeTab === 5) ? 0 : 3,
        display: 'flex',
        minHeight: 0
      }}>
        {activeTab === 0 && <WorkspaceWorkbench workspaceId={workspaceId} />}
        {activeTab === 1 && <WorkspaceOverviewTab workspaceId={workspaceId} />}
        {activeTab === 2 && <SourcesTab workspaceId={workspaceId} />}
        {activeTab === 3 && <DraftsTab workspaceId={workspaceId} />}
        {activeTab === 4 && <WorkspaceCanvas workspaceId={workspaceId} />}
        {activeTab === 5 && <WorkspaceFormBuilder workspaceId={workspaceId} />}
        {activeTab === 6 && <KBSearchTab workspaceId={workspaceId} />}
        {activeTab === 7 && <PromotionTab workspaceId={workspaceId} />}
        {activeTab === 8 && <AuditTab workspaceId={workspaceId} />}
      </Box>
    </Box>
  );
};

const WorkspaceDetailPageWrapped = () => (
  <ErrorBoundary name="WorkSpace" level="page" onReset={() => window.location.reload()}>
    <WorkspaceDetailPage />
  </ErrorBoundary>
);

export default WorkspaceDetailPageWrapped;
