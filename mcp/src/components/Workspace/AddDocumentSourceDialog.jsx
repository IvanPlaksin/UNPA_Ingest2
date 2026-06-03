import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, Box, Typography, Stack, Chip, Alert,
  List, ListItemButton, ListItemText, CircularProgress,
  InputAdornment, Divider
} from '@mui/material';
import { Search, FileText, CheckCircle } from 'lucide-react';
import { listDocuments } from '../../services/documentProcessing.service';
import { addSourceFromDocument } from '../../services/workspace.service';

const LAYER_COLORS = {
  EMPIRICAL: 'primary',
  NORMATIVE: 'secondary',
  ANALYTICAL: 'warning',
};

const AddDocumentSourceDialog = ({ open, onClose, workspaceId, onAdded }) => {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    setSearch('');
    setError('');
    setLoading(true);
    listDocuments({ status: 'COMPLETED' })
      .then(res => setDocs(Array.isArray(res) ? res : (res.data || [])))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter(d =>
      (d.filename || d.title || '').toLowerCase().includes(q) ||
      (d.documentType || '').toLowerCase().includes(q) ||
      (d.namespace || '').toLowerCase().includes(q)
    );
  }, [docs, search]);

  const handleConfirm = async () => {
    if (!selected) return;
    setAdding(true);
    setError('');
    try {
      await addSourceFromDocument(workspaceId, selected.id);
      onAdded?.();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setAdding(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add Extracted Document as Source</DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ px: 2, pt: 2, pb: 1 }}>
          <TextField
            placeholder="Search by name, type, namespace…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            size="small"
            fullWidth
            InputProps={{
              startAdornment: (
                <InputAdornment position="start"><Search size={16} /></InputAdornment>
              )
            }}
          />
        </Box>

        {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }}>{error}</Alert>}

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={32} />
          </Box>
        ) : filtered.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <FileText size={36} style={{ opacity: 0.3 }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {docs.length === 0 ? 'No completed documents found' : 'No documents match your search'}
            </Typography>
          </Box>
        ) : (
          <List disablePadding sx={{ maxHeight: 380, overflow: 'auto' }}>
            {filtered.map((doc, i) => (
              <React.Fragment key={doc.id}>
                {i > 0 && <Divider component="li" />}
                <ListItemButton
                  selected={selected?.id === doc.id}
                  onClick={() => setSelected(doc)}
                  sx={{ px: 2, py: 1.5 }}
                >
                  <ListItemText
                    primary={
                      <Stack direction="row" alignItems="center" spacing={1}>
                        {selected?.id === doc.id && <CheckCircle size={14} color="green" />}
                        <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 280 }}>
                          {doc.filename || doc.title || doc.id}
                        </Typography>
                      </Stack>
                    }
                    secondary={
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.4 }}>
                        {doc.documentType && doc.documentType !== 'UNKNOWN' && (
                          <Chip label={doc.documentType} size="small" color="info" variant="outlined"
                            sx={{ height: 18, fontSize: '0.62rem' }} />
                        )}
                        {doc.epistemicLayer && (
                          <Chip label={doc.epistemicLayer}
                            size="small"
                            color={LAYER_COLORS[doc.epistemicLayer] || 'default'}
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.62rem' }} />
                        )}
                        {doc.namespace && doc.namespace !== 'DEFAULT' && (
                          <Chip label={doc.namespace} size="small" variant="outlined"
                            sx={{ height: 18, fontSize: '0.62rem' }} />
                        )}
                        {doc.entityCount != null && (
                          <Typography variant="caption" color="text.secondary">
                            {doc.entityCount} entities
                          </Typography>
                        )}
                        {doc.kqsScore != null && (
                          <Typography variant="caption" color="text.secondary">
                            • KQS {(doc.kqsScore * 100).toFixed(0)}%
                          </Typography>
                        )}
                      </Stack>
                    }
                  />
                </ListItemButton>
              </React.Fragment>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={!selected || adding}
        >
          {adding ? 'Adding…' : 'Add as Source'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddDocumentSourceDialog;
