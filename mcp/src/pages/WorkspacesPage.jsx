import React, { useEffect } from 'react';
import { Box, Typography, Button, Grid, Stack, TextField, MenuItem, Alert, CircularProgress } from '@mui/material';
import { Plus, FolderKanban } from 'lucide-react';
import WorkspaceCard from '../components/Workspace/WorkspaceCard';
import WorkspaceCreateDialog from '../components/Workspace/WorkspaceCreateDialog';
import { useWorkspaceStore } from '../stores/workspaceStore';

const STATUS_OPTIONS = ['', 'CREATED', 'PROFILING', 'READY', 'EXTRACTING', 'PAUSED', 'REVIEW', 'PROMOTED', 'ARCHIVED'];
const DOMAIN_OPTIONS = ['', 'IT', 'HR', 'FINANCE', 'LEGAL', 'PROCUREMENT', 'LOGISTICS', 'ADMINISTRATION', 'OTHER'];

const WorkspacesPage = () => {
  const {
    workspaces, totalWorkspaces, loading, error,
    filters, setFilter,
    fetchWorkspaces, archiveWorkspace,
    setCreateDialogOpen, clearError
  } = useWorkspaceStore();

  useEffect(() => {
    fetchWorkspaces();
  }, [filters.status, filters.domain]);

  const handleArchive = async (id) => {
    if (window.confirm('Archive this workspace?')) {
      try {
        await archiveWorkspace(id);
      } catch {
        // Error handled in store
      }
    }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1400, mx: 'auto' }}>
      {/* Header */}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 3 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <FolderKanban size={28} />
          <Box>
            <Typography variant="h5" fontWeight={700}>WorkSpaces</Typography>
            <Typography variant="body2" color="text.secondary">
              Isolated knowledge extraction sandboxes ({totalWorkspaces} total)
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="contained"
          startIcon={<Plus size={18} />}
          onClick={() => setCreateDialogOpen(true)}
        >
          New WorkSpace
        </Button>
      </Stack>

      {/* Filters */}
      <Stack direction="row" spacing={2} sx={{ mb: 3 }}>
        <TextField
          select
          label="Status"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          size="small"
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All Statuses</MenuItem>
          {STATUS_OPTIONS.filter(Boolean).map(s => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <TextField
          select
          label="Domain"
          value={filters.domain}
          onChange={(e) => setFilter('domain', e.target.value)}
          size="small"
          sx={{ minWidth: 150 }}
        >
          <MenuItem value="">All Domains</MenuItem>
          {DOMAIN_OPTIONS.filter(Boolean).map(d => (
            <MenuItem key={d} value={d}>{d}</MenuItem>
          ))}
        </TextField>
      </Stack>

      {/* Error */}
      {error && (
        <Alert severity="error" onClose={clearError} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      )}

      {/* Grid */}
      {!loading && workspaces.length > 0 && (
        <Grid container spacing={2}>
          {workspaces.map(ws => (
            <Grid item xs={12} sm={6} md={4} lg={3} key={ws.id}>
              <WorkspaceCard workspace={ws} onArchive={handleArchive} />
            </Grid>
          ))}
        </Grid>
      )}

      {/* Empty state */}
      {!loading && workspaces.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <FolderKanban size={48} style={{ opacity: 0.3 }} />
          <Typography variant="h6" color="text.secondary" sx={{ mt: 2 }}>
            No workspaces yet
          </Typography>
          <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
            Create a workspace to start extracting knowledge from your sources
          </Typography>
          <Button variant="outlined" startIcon={<Plus size={18} />} onClick={() => setCreateDialogOpen(true)}>
            Create First WorkSpace
          </Button>
        </Box>
      )}

      {/* Create Dialog */}
      <WorkspaceCreateDialog />
    </Box>
  );
};

export default WorkspacesPage;
