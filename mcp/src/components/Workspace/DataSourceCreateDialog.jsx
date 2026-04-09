/**
 * DataSourceCreateDialog
 *
 * Unified DataSource create/edit dialog used by both:
 *   - WorkSpace > Sources tab  (this consumer)
 *   - WorkSpace > Form Builder > DataSources tab (already uses the editor inline)
 *
 * Reuses the existing `DataSourceEditor` and per-type config panels from
 * `StructuralEditor/tabs/DataSourceCatalog.jsx`. The Zustand
 * `useDataSourceCatalogStore` is the single source of truth — when this dialog
 * mounts it puts the store into "create" mode, scoped to the current workspace,
 * and tears it down on close.
 *
 * The same dialog can be used for editing — pass `editingId` to load an
 * existing DataSource into edit mode.
 */

import React, { useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, IconButton, Button,
  Box, Typography, CircularProgress, Alert
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import useDataSourceCatalogStore from '../../stores/dataSourceCatalogStore';
import { DataSourceEditor } from '../StructuralEditor/tabs/DataSourceCatalog';

/**
 * @param {Object} props
 * @param {boolean} props.open
 * @param {Function} props.onClose
 * @param {string} props.workspaceId
 * @param {string} [props.initialType='SQL']  Pre-select source type when creating
 * @param {Object} [props.editingDataSource]   If set, opens the dialog in edit mode
 * @param {Function} [props.onSaved]           Called after successful save with the created/updated record
 */
export default function DataSourceCreateDialog({
  open,
  onClose,
  workspaceId,
  initialType = 'SQL',
  editingDataSource = null,
  onSaved
}) {
  const setWorkspaceContext = useDataSourceCatalogStore(s => s.setWorkspaceContext);
  const clearWorkspaceContext = useDataSourceCatalogStore(s => s.clearWorkspaceContext);
  const startCreate = useDataSourceCatalogStore(s => s.startCreate);
  const startEdit = useDataSourceCatalogStore(s => s.startEdit);
  const cancelEdit = useDataSourceCatalogStore(s => s.cancelEdit);
  const fetchAll = useDataSourceCatalogStore(s => s.fetchAll);
  const draft = useDataSourceCatalogStore(s => s.draft);
  const editMode = useDataSourceCatalogStore(s => s.editMode);
  const loading = useDataSourceCatalogStore(s => s.loading);
  const error = useDataSourceCatalogStore(s => s.error);
  const clearError = useDataSourceCatalogStore(s => s.clearError);
  const save = useDataSourceCatalogStore(s => s.save);

  // Initialize store on dialog open, tear down on close
  useEffect(() => {
    if (!open) return;
    setWorkspaceContext(workspaceId);
    if (editingDataSource) {
      startEdit(editingDataSource);
    } else {
      startCreate(initialType);
    }
    return () => {
      cancelEdit();
      clearWorkspaceContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workspaceId, editingDataSource]);

  const handleSave = async () => {
    try {
      await save();
      // After save the store has cleared editMode/draft and reloaded the list.
      await fetchAll();
      if (onSaved) onSaved(draft);
      onClose();
    } catch {
      // error is already in the store; UI will display it
    }
  };

  const isEditing = !!editingDataSource;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#0d1117',
          color: '#e2e8f0',
          minHeight: '70vh'
        }
      }}
    >
      <DialogTitle sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        bgcolor: '#161b22', color: '#e2e8f0', borderBottom: '1px solid #30363d',
        py: 1.5
      }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {isEditing ? `Edit DataSource: ${editingDataSource.name || editingDataSource.graphId}` : 'Create New DataSource'}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: '#8b949e' }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        dividers
        sx={{
          bgcolor: '#0d1117',
          borderColor: '#30363d',
          // The reused editor uses inline styles with #0d1117 bg + #e2e8f0 text — no overrides needed
          p: 2
        }}
      >
        {error && (
          <Alert
            severity="error"
            onClose={clearError}
            sx={{ mb: 2, bgcolor: '#3a1d1d', color: '#fca5a5', '& .MuiAlert-icon': { color: '#fca5a5' } }}
          >
            {typeof error === 'string' ? error : (error.message || 'Save failed')}
          </Alert>
        )}

        {!draft || !editMode ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <DataSourceEditor />
        )}
      </DialogContent>

      <DialogActions sx={{ bgcolor: '#161b22', borderTop: '1px solid #30363d', px: 2, py: 1 }}>
        <Button onClick={onClose} sx={{ color: '#8b949e' }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || !draft?.name}
          sx={{
            bgcolor: '#238636',
            '&:hover': { bgcolor: '#2ea043' },
            '&.Mui-disabled': { bgcolor: '#21262d', color: '#484f58' }
          }}
          startIcon={loading ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : null}
        >
          {loading ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
