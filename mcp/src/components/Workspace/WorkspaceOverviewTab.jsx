import React from 'react';
import { Box, Grid, Paper, Typography, Stack } from '@mui/material';
import { FileText, FileCheck, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useWorkspaceStore } from '../../stores/workspaceStore';

const StatCard = ({ icon: Icon, label, value, color = 'text.primary' }) => (
  <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
    <Icon size={24} style={{ opacity: 0.6 }} />
    <Typography variant="h4" fontWeight={700} color={color} sx={{ mt: 1 }}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{label}</Typography>
  </Paper>
);

const WorkspaceOverviewTab = ({ workspaceId }) => {
  const { stats, currentWorkspace } = useWorkspaceStore();

  if (!stats) return <Typography color="text.secondary">Loading stats...</Typography>;

  const draftsByStatus = stats.drafts?.byStatus || {};
  const sourcesByStatus = stats.sources?.byStatus || {};

  return (
    <Box>
      {/* Stats Grid */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6} sm={3}>
          <StatCard icon={FileText} label="Sources" value={stats.sources?.total || 0} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard icon={FileCheck} label="Total Drafts" value={stats.drafts?.total || 0} />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard icon={CheckCircle2} label="Validated" value={draftsByStatus.VALIDATED || 0} color="info.main" />
        </Grid>
        <Grid item xs={6} sm={3}>
          <StatCard icon={AlertTriangle} label="Conflicts" value={draftsByStatus.CONFLICT || 0} color="warning.main" />
        </Grid>
      </Grid>

      {/* Details */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Drafts by Status</Typography>
            <Stack spacing={1}>
              {Object.entries(draftsByStatus).map(([status, count]) => (
                <Stack key={status} direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">{status}</Typography>
                  <Typography variant="body2" fontWeight={600}>{count}</Typography>
                </Stack>
              ))}
              {Object.keys(draftsByStatus).length === 0 && (
                <Typography variant="body2" color="text.disabled">No drafts yet</Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Sources by Status</Typography>
            <Stack spacing={1}>
              {Object.entries(sourcesByStatus).map(([status, count]) => (
                <Stack key={status} direction="row" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">{status}</Typography>
                  <Typography variant="body2" fontWeight={600}>{count}</Typography>
                </Stack>
              ))}
              {Object.keys(sourcesByStatus).length === 0 && (
                <Typography variant="body2" color="text.disabled">No sources yet</Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>Workspace Info</Typography>
            <Stack spacing={0.5}>
              <Typography variant="body2"><strong>ID:</strong> {currentWorkspace?.id}</Typography>
              <Typography variant="body2"><strong>Namespace:</strong> {currentWorkspace?.namespace}</Typography>
              <Typography variant="body2"><strong>Domain:</strong> {currentWorkspace?.domain || 'Not set'}</Typography>
              <Typography variant="body2"><strong>Created:</strong> {currentWorkspace?.createdAt}</Typography>
              <Typography variant="body2"><strong>Updated:</strong> {currentWorkspace?.updatedAt}</Typography>
              <Typography variant="body2"><strong>KB References:</strong> {stats.kbReferences || 0}</Typography>
              <Typography variant="body2"><strong>Promotions:</strong> {stats.promotions || 0}</Typography>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default WorkspaceOverviewTab;
