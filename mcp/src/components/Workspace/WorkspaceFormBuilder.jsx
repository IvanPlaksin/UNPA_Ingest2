/**
 * WorkspaceFormBuilder
 *
 * Embeds the existing global Structural Editor inside a workspace tab and
 * adds an "Import to workspace" action that converts the current editor
 * graph into workspace drafts via the structural-import endpoint.
 *
 * The structural editor itself still saves its graph globally via
 * `/api/v1/structural` (so the form can be reused across workspaces).
 * Importing into the workspace is an explicit, separate action.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Stack, Typography, Snackbar, Alert, Tooltip,
  CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  List, ListItem, ListItemText, Chip, Divider
} from '@mui/material';
import { CloudDownload as ImportIcon, Visibility as PreviewIcon } from '@mui/icons-material';
import StructuralFormEditor from '../StructuralEditor/StructuralFormEditor';
import useStructuralEditorStore from '../../stores/structuralEditorStore';
import useDataSourceCatalogStore from '../../stores/dataSourceCatalogStore';
import api from '../../services/api';

/**
 * One-button banner that floats above the editor.
 */
function ImportBanner({ workspaceId }) {
  const graphId = useStructuralEditorStore(s => s.graphId);
  const graphName = useStructuralEditorStore(s => s.graphName);
  const isDirty = useStructuralEditorStore(s => s.isDirty);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState(null);

  const cannotImport = !graphId || isDirty;

  const handlePreview = useCallback(async () => {
    if (!graphId) return;
    setLoading(true);
    setPreview(null);
    try {
      const { data } = await api.get(`/workspaces/${workspaceId}/structural-import/preview`, {
        params: { graphId }
      });
      setPreview(data?.data || null);
      setPreviewOpen(true);
    } catch (err) {
      setToast({
        severity: 'error',
        message: err.response?.data?.error?.message || err.message || 'Preview failed'
      });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, graphId]);

  const handleImport = useCallback(async () => {
    if (!graphId) return;
    setImporting(true);
    try {
      const { data } = await api.post(`/workspaces/${workspaceId}/structural-import`, { graphId });
      const stats = data?.data?.stats || {};
      setToast({
        severity: 'success',
        message: `Imported ${stats.draftsCreated || 0} drafts and ${stats.edgesCreated || 0} edges into the workspace`
      });
      setPreviewOpen(false);
    } catch (err) {
      setToast({
        severity: 'error',
        message: err.response?.data?.error?.message || err.message || 'Import failed'
      });
    } finally {
      setImporting(false);
    }
  }, [workspaceId, graphId]);

  return (
    <>
      <Box sx={{
        px: 2, py: 0.75,
        bgcolor: '#0d1117',
        borderBottom: '1px solid #30363d',
        display: 'flex', alignItems: 'center', gap: 1.5,
        flexShrink: 0
      }}>
        <Typography variant="caption" sx={{ color: '#8b949e', flex: 1 }}>
          {graphId ? (
            <>
              Editing <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{graphName}</span>
              {isDirty && <span style={{ color: '#f0883e', marginLeft: 6 }}>• unsaved</span>}
            </>
          ) : (
            <>Create or open a structural form to import it into this workspace</>
          )}
        </Typography>

        <Tooltip title={cannotImport ? 'Save the form first' : 'Preview what will be imported'}>
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={loading ? <CircularProgress size={14} /> : <PreviewIcon fontSize="small" />}
              onClick={handlePreview}
              disabled={cannotImport || loading}
              sx={{
                fontSize: '0.7rem', py: 0.25, textTransform: 'none',
                color: '#e2e8f0', borderColor: '#30363d',
                '&:hover': { borderColor: '#58a6ff', bgcolor: '#161b22' }
              }}
            >
              Preview Import
            </Button>
          </span>
        </Tooltip>

        <Tooltip title={cannotImport ? 'Save the form first (the import reads the saved version)' : 'Import this form as workspace drafts'}>
          <span>
            <Button
              size="small"
              variant="contained"
              startIcon={importing ? <CircularProgress size={14} /> : <ImportIcon fontSize="small" />}
              onClick={handleImport}
              disabled={cannotImport || importing}
              sx={{
                fontSize: '0.7rem', py: 0.25, textTransform: 'none',
                bgcolor: '#238636', '&:hover': { bgcolor: '#2ea043' }
              }}
            >
              Import to WorkSpace
            </Button>
          </span>
        </Tooltip>
      </Box>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onClose={() => setPreviewOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Import Preview</DialogTitle>
        <DialogContent dividers>
          {preview ? (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                {preview.structuralGraph.name}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
                <Chip size="small" label={`${preview.structuralGraph.nodeCount} structural nodes`} />
                <Chip size="small" label={`${preview.structuralGraph.edgeCount} structural edges`} />
                <Chip size="small" color="primary" label={`${preview.plan.draftCount} drafts will be created`} />
                <Chip size="small" color="primary" label={`${preview.plan.edgeCount} edges will be created`} />
              </Stack>

              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                BREAKDOWN BY DRAFT TYPE
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ mb: 2, flexWrap: 'wrap', gap: 0.5 }}>
                {Object.entries(preview.plan.byType || {}).map(([type, count]) => (
                  <Chip key={type} size="small" label={`${type}: ${count}`} variant="outlined" />
                ))}
              </Stack>

              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                DRAFTS TO BE CREATED
              </Typography>
              <List dense sx={{ maxHeight: 280, overflow: 'auto' }}>
                {(preview.plan.drafts || []).map(d => (
                  <ListItem key={d.structuralNodeId} sx={{ py: 0 }}>
                    <ListItemText
                      primary={d.name}
                      secondary={`${d.draftType}${d.fieldCount > 0 ? ` • ${d.fieldCount} inline fields` : ''}`}
                      primaryTypographyProps={{ fontSize: '0.8rem' }}
                      secondaryTypographyProps={{ fontSize: '0.7rem' }}
                    />
                  </ListItem>
                ))}
              </List>

              <Alert severity="info" sx={{ mt: 1.5, fontSize: '0.75rem' }}>
                Field nodes are folded into the parent draft as inline properties — they don't become separate drafts.
              </Alert>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress size={20} />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={importing ? <CircularProgress size={14} /> : <ImportIcon fontSize="small" />}
            onClick={handleImport}
            disabled={importing || !preview}
          >
            Import {preview?.plan?.draftCount ?? 0} drafts
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {toast && (
          <Alert
            onClose={() => setToast(null)}
            severity={toast.severity}
            variant="filled"
            sx={{ width: '100%' }}
          >
            {toast.message}
          </Alert>
        )}
      </Snackbar>
    </>
  );
}

export default function WorkspaceFormBuilder({ workspaceId }) {
  // Scope the DataSource catalog (used by the editor's "DataSources" tab) to
  // this workspace. The store will then fetch /workspaces/:id/datasources
  // (workspace-private + global) instead of the unfiltered global catalog.
  const setWorkspaceContext = useDataSourceCatalogStore(s => s.setWorkspaceContext);
  const clearWorkspaceContext = useDataSourceCatalogStore(s => s.clearWorkspaceContext);

  useEffect(() => {
    setWorkspaceContext(workspaceId);
    return () => clearWorkspaceContext();
  }, [workspaceId, setWorkspaceContext, clearWorkspaceContext]);

  return (
    <Box sx={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      bgcolor: '#0d1117'
    }}>
      <ImportBanner workspaceId={workspaceId} />
      <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <StructuralFormEditor />
      </Box>
    </Box>
  );
}
