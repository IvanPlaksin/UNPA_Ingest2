/**
 * SourceCatalogTab
 * Lists all configured external information sources and lets the user
 * browse, edit, or delete each one.  Also hosts AddSourceDialog + BrowseDialog.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Stack, Typography, Button, Chip, IconButton,
  Card, CardContent, CardActions, Grid, TextField,
  FormControl, InputLabel, Select, MenuItem,
  CircularProgress, Alert, Tooltip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Collapse
} from '@mui/material';
import {
  Plus, Search, Globe, Rss, Database, FileText,
  Edit2, Trash2, RefreshCw, ExternalLink, BookOpen,
  ChevronDown, ChevronRight, FileCheck, Link
} from 'lucide-react';
import { listSources, deleteSource } from '../../../services/sourceCatalog.service';
import AddSourceDialog from './AddSourceDialog';
import BrowseDialog from './BrowseDialog';

const NAMESPACES = ['', 'DEFAULT', 'INEED', 'KM', 'HR', 'FINANCE', 'PROCUREMENT', 'LEGAL', 'IT', 'AUDIT'];

const TYPE_META = {
  URL_CATALOG:  { label: 'Web Catalog',       color: 'primary',   Icon: Globe },
  REST_API:     { label: 'REST API',           color: 'secondary', Icon: Database },
  RSS_FEED:     { label: 'RSS / Atom',         color: 'info',      Icon: Rss },
  ODS_API:      { label: 'UN Official Docs',   color: 'warning',   Icon: FileText },
  OIOS_PORTAL:  { label: 'OIOS Portal',        color: 'success',   Icon: ExternalLink },
  OAI_PMH:      { label: 'OAI-PMH',           color: 'error',     Icon: Database },
};

// Short labels for capability chips shown on each source card.
const CAP_SHORT = {
  search: 'search', browseAll: 'browse', paginate: 'pages', filter: 'filters',
  sort: 'sort', download: 'download', enrich: 'metadata', fulltext: 'full-text',
};

function SourceCard({ source, onEdit, onDelete, onBrowse, onCopyLink }) {
  const meta = TYPE_META[source.type] || { label: source.type, color: 'default', Icon: Globe };
  const { Icon } = meta;
  const [methodologyOpen, setMethodologyOpen] = useState(false);

  return (
    <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column',
      transition: 'box-shadow 0.15s', '&:hover': { boxShadow: 2 },
      opacity: source.enabled === false ? 0.55 : 1 }}>
      <CardContent sx={{ flex: 1, pb: 1 }}>
        <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mb: 0.75 }}>
          <Icon size={17} style={{ marginTop: 3, flexShrink: 0, opacity: 0.7 }} />
          <Box flex={1} minWidth={0}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <Typography variant="subtitle2" fontWeight={700} noWrap title={source.name} sx={{ flex: 1 }}>
                {source.name}
              </Typography>
              {source.enabled === false && (
                <Chip label="disabled" size="small" color="default"
                  sx={{ fontSize: '0.58rem', height: 16 }} />
              )}
            </Stack>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mt: 0.25 }}>
              <Chip label={meta.label} color={meta.color} size="small" variant="outlined"
                sx={{ fontSize: '0.62rem', height: 18 }} />
              {source.namespace && source.namespace !== 'DEFAULT' && (
                <Chip label={source.namespace} size="small" variant="outlined"
                  sx={{ fontSize: '0.62rem', height: 18 }} />
              )}
            </Stack>
          </Box>
        </Stack>

        {source.description && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>
            {source.description.length > 90
              ? source.description.substring(0, 90) + '…'
              : source.description}
          </Typography>
        )}

        {/* Stats row */}
        <Stack direction="row" spacing={1.5} sx={{ mb: 0.75 }}>
          {source.documentCount > 0 && (
            <Stack direction="row" spacing={0.25} alignItems="center">
              <FileCheck size={12} opacity={0.6} />
              <Typography variant="caption" color="text.secondary">
                {source.documentCount} imported
              </Typography>
            </Stack>
          )}
          {source.lastBrowsedAt && (
            <Typography variant="caption" color="text.disabled">
              browsed {new Date(source.lastBrowsedAt).toLocaleDateString()}
            </Typography>
          )}
        </Stack>

        {source.tags?.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 0.5 }}>
            {source.tags.slice(0, 4).map(t => (
              <Chip key={t} label={t} size="small"
                sx={{ fontSize: '0.6rem', height: 16, bgcolor: 'action.hover' }} />
            ))}
            {source.tags.length > 4 && (
              <Chip label={`+${source.tags.length - 4}`} size="small"
                sx={{ fontSize: '0.6rem', height: 16 }} />
            )}
          </Stack>
        )}

        {/* Capability chips */}
        {source.capabilities?.capabilities?.length > 0 && (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 0.5 }}>
            {source.capabilities.capabilities.map(c => (
              <Chip key={c} label={CAP_SHORT[c] || c} size="small" variant="outlined" color="success"
                sx={{ fontSize: '0.55rem', height: 15 }} />
            ))}
          </Stack>
        )}

        {/* Methodology accordion */}
        {source.methodology && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <Stack direction="row" alignItems="center" spacing={0.5}
              onClick={() => setMethodologyOpen(v => !v)}
              sx={{ cursor: 'pointer', py: 0.25, '&:hover': { color: 'primary.main' } }}>
              <BookOpen size={12} opacity={0.7} />
              <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>Processing Methodology</Typography>
              {methodologyOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </Stack>
            <Collapse in={methodologyOpen}>
              <Box sx={{ mt: 0.5, p: 1, bgcolor: 'action.hover', borderRadius: 1, maxHeight: 160, overflow: 'auto' }}>
                <Typography variant="caption" color="text.secondary"
                  sx={{ display: 'block', whiteSpace: 'pre-wrap', fontSize: '0.65rem', lineHeight: 1.5 }}>
                  {source.methodology.length > 600
                    ? source.methodology.substring(0, 600) + '\n…'
                    : source.methodology}
                </Typography>
              </Box>
            </Collapse>
          </>
        )}
      </CardContent>

      <Divider />

      <CardActions sx={{ px: 1.5, py: 0.75, justifyContent: 'space-between' }}>
        <Button size="small" variant="contained" startIcon={<Search size={13} />}
          onClick={() => onBrowse(source)} sx={{ fontSize: '0.72rem' }}
          disabled={source.enabled === false}>
          Browse
        </Button>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Copy direct link">
            <IconButton size="small" onClick={() => onCopyLink(source)}>
              <Link size={14} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Edit source">
            <IconButton size="small" onClick={() => onEdit(source)}>
              <Edit2 size={14} />
            </IconButton>
          </Tooltip>
          <Tooltip title="Delete source">
            <IconButton size="small" color="error" onClick={() => onDelete(source)}>
              <Trash2 size={14} />
            </IconButton>
          </Tooltip>
        </Stack>
      </CardActions>
    </Card>
  );
}

function DeleteConfirmDialog({ source, open, onClose, onConfirm, deleting }) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete Source</DialogTitle>
      <DialogContent>
        <Typography>
          Are you sure you want to delete <strong>{source?.name}</strong>?
          This will not affect already-imported documents.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={deleting}>Cancel</Button>
        <Button variant="contained" color="error" onClick={onConfirm} disabled={deleting}>
          {deleting ? <CircularProgress size={14} /> : 'Delete'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function SourceCatalogTab({ onDocumentImported, initialSourceId, onSourceBrowse, onBrowseClose }) {
  const [sources,      setSources]      = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [nsFilter,     setNsFilter]     = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [searchText,   setSearchText]   = useState('');

  // dialogs
  const [addOpen,      setAddOpen]      = useState(false);
  const [editSource,   setEditSource]   = useState(null);
  const [browseSource, setBrowseSource] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const resp = await listSources({
        namespace: nsFilter || undefined,
        type: typeFilter || undefined,
      });
      setSources(resp.data || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setLoading(false);
  }, [nsFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  // Deep-link: open BrowseDialog when initialSourceId is given
  useEffect(() => {
    if (!initialSourceId || !sources.length) return;
    const src = sources.find(s => s.id === initialSourceId);
    if (src && (!browseSource || browseSource.id !== src.id)) {
      setBrowseSource(src);
    }
  }, [initialSourceId, sources]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBrowse = (src) => {
    if (onSourceBrowse) onSourceBrowse(src.id);
    setBrowseSource(src);
  };

  const handleBrowseClose = () => {
    setBrowseSource(null);
    onBrowseClose?.();
  };

  const handleCopyLink = (src) => {
    const url = `${window.location.origin}/documents/sources/${src.id}`;
    navigator.clipboard.writeText(url).catch(() => {});
  };

  const handleSaved = () => {
    setAddOpen(false);
    setEditSource(null);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSource(deleteTarget.id);
      setDeleteTarget(null);
      load();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setDeleting(false);
  };

  const filtered = searchText.trim()
    ? sources.filter(s =>
        s.name.toLowerCase().includes(searchText.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchText.toLowerCase()) ||
        s.tags?.some(t => t.toLowerCase().includes(searchText.toLowerCase()))
      )
    : sources;

  const activeSources   = filtered.filter(s => s.enabled !== false);
  const disabledSources = filtered.filter(s => s.enabled === false);

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1.5, overflow: 'hidden' }}>

      {/* ── Toolbar ── */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <TextField
          value={searchText} onChange={e => setSearchText(e.target.value)}
          placeholder="Search sources…" size="small" sx={{ minWidth: 200 }}
          InputProps={{ startAdornment: <Search size={14} style={{ marginRight: 6, opacity: 0.5 }} /> }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Namespace</InputLabel>
          <Select value={nsFilter} label="Namespace" onChange={e => setNsFilter(e.target.value)}>
            {NAMESPACES.map(ns => <MenuItem key={ns} value={ns}>{ns || 'All'}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Type</InputLabel>
          <Select value={typeFilter} label="Type" onChange={e => setTypeFilter(e.target.value)}>
            <MenuItem value="">All types</MenuItem>
            {Object.entries(TYPE_META).map(([k, v]) => (
              <MenuItem key={k} value={k}>{v.label}</MenuItem>
            ))}
          </Select>
        </FormControl>

        <Box flex={1} />

        <Typography variant="caption" color="text.secondary">
          {activeSources.length} active{disabledSources.length > 0 ? ` · ${disabledSources.length} disabled` : ''}
        </Typography>

        <Tooltip title="Refresh">
          <IconButton size="small" onClick={load} disabled={loading}>
            <RefreshCw size={16} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </IconButton>
        </Tooltip>
        <Button variant="contained" size="small" startIcon={<Plus size={14} />}
          onClick={() => setAddOpen(true)}>
          Add Source
        </Button>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {/* ── Grid ── */}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {loading && !sources.length ? (
          <Stack alignItems="center" justifyContent="center" sx={{ height: 200 }}>
            <CircularProgress size={32} />
          </Stack>
        ) : filtered.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" sx={{ height: 200, color: 'text.secondary', gap: 1 }}>
            <Globe size={40} style={{ opacity: 0.2 }} />
            <Typography variant="body2">
              {sources.length === 0 ? 'No sources configured yet' : 'No sources match filters'}
            </Typography>
            {sources.length === 0 && (
              <Button variant="outlined" size="small" startIcon={<Plus size={14} />}
                onClick={() => setAddOpen(true)}>
                Add your first source
              </Button>
            )}
          </Stack>
        ) : (
          <Grid container spacing={2} sx={{ pb: 2 }}>
            {filtered.map(src => (
              <Grid item key={src.id} xs={12} sm={6} md={4} lg={3}>
                <SourceCard
                  source={src}
                  onEdit={s => setEditSource(s)}
                  onDelete={s => setDeleteTarget(s)}
                  onBrowse={handleBrowse}
                  onCopyLink={handleCopyLink}
                />
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* ── Dialogs ── */}
      <AddSourceDialog
        open={addOpen || Boolean(editSource)}
        source={editSource}
        onClose={() => { setAddOpen(false); setEditSource(null); }}
        onSaved={handleSaved}
      />

      <BrowseDialog
        open={Boolean(browseSource)}
        source={browseSource}
        onClose={handleBrowseClose}
        onImported={() => { onDocumentImported?.(); load(); }}
      />

      <DeleteConfirmDialog
        open={Boolean(deleteTarget)}
        source={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        deleting={deleting}
      />
    </Box>
  );
}
