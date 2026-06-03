import React, { useState, useRef } from 'react';
import {
  Box, Typography, Button, List, ListItem, ListItemIcon, ListItemText,
  Stack, Paper, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, MenuItem, IconButton, Chip, Alert, LinearProgress,
  Tabs, Tab, Divider, Tooltip
} from '@mui/material';
import {
  Plus, FileText, Database as DbIcon, Globe, FolderOpen, Type,
  Upload, Trash2, Eye, Sparkles, Play, X, Clock, Hash, AlertTriangle
} from 'lucide-react';
import StatusChip from './StatusChip';
import ExtractionProgress from './ExtractionProgress';
import DataSourceCreateDialog from './DataSourceCreateDialog';
import AddDocumentSourceDialog from './AddDocumentSourceDialog';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import * as wsApi from '../../services/workspace.service';

const SOURCE_ICONS = {
  FILE: FileText,
  URL: Globe,
  TEXT: Type,
  DATABASE: DbIcon,
  API: Globe,
  FILESYSTEM: FolderOpen,
  DOCUMENT: FileText,
};

// Document-style sources — uploaded files, URLs, raw text. These go through
// the existing simple "Add Source" dialog and produce a SourceReference that
// the extraction pipeline can read from.
//
// Connection-style sources (SQL, REST API, KB query, file path lookup,
// composite) are added via the unified DataSourceCreateDialog (the same
// editor that the Form Builder uses) — they produce BOTH a v2 DataSource and
// a paired SourceReference.
const SOURCE_TYPE_OPTIONS = [
  { value: 'FILE', label: 'File Upload', icon: Upload },
  { value: 'URL', label: 'URL', icon: Globe },
  { value: 'TEXT', label: 'Text Input', icon: Type },
];

const SourcesTab = ({ workspaceId }) => {
  const { sources, fetchWorkspace } = useWorkspaceStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [dataSourceCreateOpen, setDataSourceCreateOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const [sourceDetails, setSourceDetails] = useState(null);
  const [analyzing, setAnalyzing] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ── CREATE DIALOG STATE ──
  const [sourceType, setSourceType] = useState('FILE');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const fileInputRef = useRef(null);

  const resetCreateForm = () => {
    setSourceType('FILE');
    setFile(null);
    setUrl('');
    setText('');
    setTitle('');
    setDescription('');
    setError('');
  };

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      if (sourceType === 'FILE') {
        if (!file) { setError('Please select a file'); setLoading(false); return; }
        await wsApi.uploadFileSource(workspaceId, file, description);
      } else if (sourceType === 'URL') {
        if (!url.trim()) { setError('URL is required'); setLoading(false); return; }
        await wsApi.addSource(workspaceId, { sourceType: 'URL', url, title: title || url, description });
      } else if (sourceType === 'TEXT') {
        if (!text.trim()) { setError('Text content is required'); setLoading(false); return; }
        await wsApi.addSource(workspaceId, { sourceType: 'TEXT', text, title: title || 'Text Input', description });
      } else {
        // Anything else is a connection — should go through DataSourceCreateDialog
        setError(`Source type ${sourceType} must be added via "Add DataSource" instead`);
        setLoading(false);
        return;
      }
      setCreateOpen(false);
      resetCreateForm();
      await fetchWorkspace(workspaceId);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDataSourceCreated = async () => {
    setDataSourceCreateOpen(false);
    await fetchWorkspace(workspaceId);
  };

  const handleAnalyze = async (sourceId) => {
    setAnalyzing(sourceId);
    try {
      await wsApi.analyzeSource(workspaceId, sourceId);
      await fetchWorkspace(workspaceId);
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(null);
    }
  };

  const [extracting, setExtracting] = useState(null); // sourceId currently extracting
  const [activeJobs, setActiveJobs] = useState({}); // sourceId → jobId

  const handleExtract = async (sourceId) => {
    setExtracting(sourceId);
    try {
      const res = await wsApi.startExtraction(workspaceId, sourceId);
      const jobId = res.data?.jobId;
      if (jobId) {
        setActiveJobs(prev => ({ ...prev, [sourceId]: jobId }));
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setExtracting(null);
    }
  };

  const handleExtractionComplete = (sourceId) => {
    setActiveJobs(prev => { const n = { ...prev }; delete n[sourceId]; return n; });
    fetchWorkspace(workspaceId);
  };

  const handleOpenDetails = async (source) => {
    setSelectedSource(source);
    setDetailOpen(true);
    try {
      const res = await wsApi.getSourceDetails(workspaceId, source.id);
      setSourceDetails(res.data);
    } catch {
      setSourceDetails(source);
    }
  };

  const handleDelete = async (sourceId) => {
    if (!window.confirm('Delete this source?')) return;
    try {
      await wsApi.deleteSource(workspaceId, sourceId);
      await fetchWorkspace(workspaceId);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Sources ({sources.length})
        </Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Upload a document, URL, or paste text">
            <Button size="small" variant="outlined" startIcon={<Plus size={16} />} onClick={() => { resetCreateForm(); setCreateOpen(true); }}>
              Add Document
            </Button>
          </Tooltip>
          <Tooltip title="Link an already-extracted document from the Documents section">
            <Button size="small" variant="outlined" startIcon={<FileText size={16} />} onClick={() => setAddDocOpen(true)}>
              From Documents
            </Button>
          </Tooltip>
          <Tooltip title="Add a SQL/REST/KB/file/composite DataSource (uses the same editor as the Form Builder)">
            <Button size="small" variant="contained" startIcon={<DbIcon size={16} />} onClick={() => setDataSourceCreateOpen(true)}>
              Add DataSource
            </Button>
          </Tooltip>
        </Stack>
      </Stack>

      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}

      {/* SOURCE LIST */}
      {sources.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <FileText size={40} style={{ opacity: 0.3 }} />
          <Typography color="text.secondary" sx={{ mt: 1 }}>No sources added yet</Typography>
          <Typography variant="caption" color="text.disabled">Upload a file, paste a URL, or enter text to start</Typography>
        </Paper>
      ) : (
        <List>
          {sources.map(source => {
            const Icon = SOURCE_ICONS[source.sourceType] || FileText;
            const isAnalyzing = analyzing === source.id;
            return (
              <React.Fragment key={source.id}>
              <ListItem
                sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    {source.status === 'PENDING' && (
                      <Tooltip title="Analyze: detect type, generate summary, check duplicates">
                        <IconButton size="small" onClick={() => handleAnalyze(source.id)} disabled={isAnalyzing}>
                          {isAnalyzing ? <Clock size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        </IconButton>
                      </Tooltip>
                    )}
                    {(source.status === 'ANALYZED' || source.status === 'PROFILED') && (
                      <Tooltip title="Extract: run full knowledge extraction pipeline">
                        <IconButton size="small" color="primary" onClick={() => handleExtract(source.id)} disabled={extracting === source.id}>
                          {extracting === source.id ? <Clock size={16} className="animate-spin" /> : <Play size={16} />}
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="View details">
                      <IconButton size="small" onClick={() => handleOpenDetails(source)}>
                        <Eye size={16} />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                      <IconButton size="small" onClick={() => handleDelete(source.id)}>
                        <Trash2 size={16} />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                }
              >
                <ListItemIcon><Icon size={20} /></ListItemIcon>
                <ListItemText
                  primary={
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography variant="body2" fontWeight={500}>{source.filename}</Typography>
                      {source.documentType && source.documentType !== 'UNKNOWN' && (
                        <Chip label={source.documentType} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )}
                      {source.duplicateOf && source.duplicateOf.length > 0 && (
                        <Tooltip title="Potential duplicate detected">
                          <AlertTriangle size={14} color="orange" />
                        </Tooltip>
                      )}
                    </Stack>
                  }
                  secondary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="caption" color="text.secondary">
                        {source.sourceType} {source.mimeType ? `• ${source.mimeType}` : ''}
                        {source.sizeBytes ? ` • ${(source.sizeBytes / 1024).toFixed(1)} KB` : ''}
                      </Typography>
                      <StatusChip status={source.status} size="small" />
                    </Stack>
                  }
                />
              </ListItem>
              {activeJobs[source.id] && (
                <Box sx={{ ml: 2, mr: 2, mb: 1 }}>
                  <ExtractionProgress
                    workspaceId={workspaceId}
                    jobId={activeJobs[source.id]}
                    onComplete={() => handleExtractionComplete(source.id)}
                    onCancel={() => handleExtractionComplete(source.id)}
                  />
                </Box>
              )}
            </React.Fragment>
            );
          })}
        </List>
      )}

      {/* ═══ CREATE SOURCE DIALOG ═══ */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Source</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} sx={{ mt: 1 }}>
            {/* Source Type Selector */}
            <TextField
              select
              label="Source Type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value)}
              fullWidth
            >
              {SOURCE_TYPE_OPTIONS.map(opt => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Stack direction="row" alignItems="center" spacing={1}>
                    <opt.icon size={16} />
                    <span>{opt.label}</span>
                  </Stack>
                </MenuItem>
              ))}
            </TextField>

            {/* ── FILE fields ── */}
            {sourceType === 'FILE' && (
              <>
                <Box>
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      setFile(e.target.files[0] || null);
                      if (e.target.files[0] && !title) setTitle(e.target.files[0].name);
                    }}
                  />
                  <Button
                    variant="outlined"
                    startIcon={<Upload size={16} />}
                    onClick={() => fileInputRef.current?.click()}
                    fullWidth
                    sx={{ py: 2, borderStyle: 'dashed' }}
                  >
                    {file ? file.name : 'Choose file to upload'}
                  </Button>
                  {file && (
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      {file.type || 'unknown type'} • {(file.size / 1024).toFixed(1)} KB
                    </Typography>
                  )}
                </Box>
                <TextField
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                  helperText="Optional: describe what this file contains"
                />
              </>
            )}

            {/* ── URL fields ── */}
            {sourceType === 'URL' && (
              <>
                <TextField
                  label="URL"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  fullWidth
                  required
                  placeholder="https://example.com/document"
                  helperText="Web page, API endpoint, or document URL"
                />
                <TextField
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  fullWidth
                  helperText="Display name for this source"
                />
                <TextField
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                />
              </>
            )}

            {/* ── TEXT fields ── */}
            {sourceType === 'TEXT' && (
              <>
                <TextField
                  label="Title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  fullWidth
                  helperText="Name for this text source"
                />
                <TextField
                  label="Text Content"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  fullWidth
                  required
                  multiline
                  rows={8}
                  placeholder="Paste or type the source text here..."
                  helperText={`${text.length} characters`}
                />
                <TextField
                  label="Description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  fullWidth
                  multiline
                  rows={2}
                />
              </>
            )}

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateOpen(false)} color="inherit">Cancel</Button>
          <Button onClick={handleCreate} variant="contained" disabled={loading}>
            {loading ? 'Adding...' : 'Add Source'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ═══ UNIFIED DATASOURCE CREATE DIALOG ═══ */}
      {/* Same editor used by Form Builder. Creates a v2 DataSource (in the
          workspace namespace) AND a paired SourceReference visible in this list. */}
      <DataSourceCreateDialog
        open={dataSourceCreateOpen}
        onClose={() => setDataSourceCreateOpen(false)}
        workspaceId={workspaceId}
        initialType="SQL"
        onSaved={handleDataSourceCreated}
      />

      {/* ═══ ADD FROM DOCUMENTS DIALOG ═══ */}
      <AddDocumentSourceDialog
        open={addDocOpen}
        onClose={() => setAddDocOpen(false)}
        workspaceId={workspaceId}
        onAdded={async () => { await fetchWorkspace(workspaceId); }}
      />

      {/* ═══ SOURCE DETAIL DIALOG ═══ */}
      <Dialog open={detailOpen} onClose={() => { setDetailOpen(false); setSourceDetails(null); }} maxWidth="md" fullWidth>
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Stack direction="row" alignItems="center" spacing={1}>
              {selectedSource && React.createElement(SOURCE_ICONS[selectedSource.sourceType] || FileText, { size: 20 })}
              <Typography variant="h6">{selectedSource?.filename}</Typography>
            </Stack>
            <IconButton onClick={() => setDetailOpen(false)}><X size={18} /></IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {sourceDetails ? (
            <SourceDetailContent source={sourceDetails} workspaceId={workspaceId} onAnalyze={handleAnalyze} analyzing={analyzing} onExtract={handleExtract} extracting={extracting} />
          ) : (
            <LinearProgress />
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

// ══════════ SOURCE DETAIL CONTENT ══════════

const SourceDetailContent = ({ source, workspaceId, onAnalyze, analyzing, onExtract, extracting }) => {
  const [detailTab, setDetailTab] = useState(0);

  return (
    <Box>
      {/* Header info */}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <StatusChip status={source.status} />
        {source.documentType && source.documentType !== 'UNKNOWN' && (
          <Chip label={source.documentType} color="info" size="small" />
        )}
        <Chip label={source.sourceType} size="small" variant="outlined" />
        {source.language && <Chip label={source.language} size="small" variant="outlined" />}
      </Stack>

      {source.summary && (
        <Paper variant="outlined" sx={{ p: 2, mb: 2, bgcolor: 'action.hover' }}>
          <Typography variant="body2"><strong>Summary:</strong> {source.summary}</Typography>
        </Paper>
      )}

      {source.duplicateOf && source.duplicateOf.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Potential duplicate of: {source.duplicateOf.map(d => d.filename).join(', ')}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {source.status === 'PENDING' && (
          <Button
            variant="contained"
            startIcon={<Sparkles size={16} />}
            onClick={() => onAnalyze(source.id)}
            disabled={analyzing === source.id}
          >
            {analyzing === source.id ? 'Analyzing...' : 'Analyze Source'}
          </Button>
        )}
        {(source.status === 'ANALYZED' || source.status === 'PROFILED') && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<Play size={16} />}
            onClick={() => onExtract?.(source.id)}
            disabled={extracting === source.id}
          >
            {extracting === source.id ? 'Extracting...' : 'Run Full Extraction'}
          </Button>
        )}
        {source.status === 'EXTRACTED' && (
          <Chip label="Extraction Complete" color="success" />
        )}
      </Stack>

      {/* Tabs */}
      <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)} sx={{ mb: 2 }}>
        <Tab label="Metadata" />
        <Tab label={`Entities (${source.extractedEntities?.length || 0})`} />
        <Tab label="Extraction Log" />
        <Tab label="AI Chat History" />
      </Tabs>

      {/* Metadata Tab */}
      {detailTab === 0 && (
        <Stack spacing={1}>
          <InfoRow label="ID" value={source.id} mono />
          <InfoRow label="Type" value={source.sourceType} />
          <InfoRow label="MIME Type" value={source.mimeType} />
          <InfoRow label="Size" value={source.sizeBytes ? `${(source.sizeBytes / 1024).toFixed(1)} KB` : '-'} />
          <InfoRow label="Document Type" value={source.documentType || 'Not classified'} />
          <InfoRow label="Language" value={source.language || '-'} />
          <InfoRow label="Domain" value={source.domain || '-'} />
          <InfoRow label="Complexity" value={source.complexity || '-'} />
          <InfoRow label="Content Hash" value={source.contentHash} mono />
          {source.url && <InfoRow label="URL" value={source.url} />}
          {source.keywords?.length > 0 && (
            <Box>
              <Typography variant="caption" color="text.secondary">Keywords</Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                {source.keywords.map((kw, i) => <Chip key={i} label={kw} size="small" />)}
              </Stack>
            </Box>
          )}
          <InfoRow label="Uploaded" value={source.uploadedAt} />
          <InfoRow label="Analyzed" value={source.analyzedAt || '-'} />
        </Stack>
      )}

      {/* Entities Tab */}
      {detailTab === 1 && (
        <Box>
          {(!source.extractedEntities || source.extractedEntities.length === 0) ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>No entities extracted yet. Run ingestion to extract knowledge.</Typography>
          ) : (
            <List dense>
              {source.extractedEntities.map((ent, i) => (
                <ListItem key={ent.id || i} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                  <ListItemText
                    primary={ent.name}
                    secondary={
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Chip label={ent.type} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                        <StatusChip status={ent.status} size="small" />
                        <Typography variant="caption">{((ent.confidence || 0) * 100).toFixed(0)}%</Typography>
                      </Stack>
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}
        </Box>
      )}

      {/* Extraction Log Tab */}
      {detailTab === 2 && (
        <Box>
          {(!source.extractionLog || source.extractionLog.length === 0) ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>No extraction log yet.</Typography>
          ) : (
            <Paper variant="outlined" sx={{ p: 1.5, maxHeight: 400, overflow: 'auto', bgcolor: 'grey.900' }}>
              {source.extractionLog.map((entry, i) => (
                <Typography key={i} variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', mb: 0.5, color: entry.step?.includes('ERROR') ? 'error.main' : 'text.secondary' }}>
                  <span style={{ color: '#666' }}>[{entry.timestamp?.split('T')[1]?.split('.')[0] || ''}]</span>{' '}
                  <strong>{entry.step}</strong>: {entry.message}
                </Typography>
              ))}
            </Paper>
          )}
        </Box>
      )}

      {/* AI Chat History Tab */}
      {detailTab === 3 && (
        <Box>
          {(!source.chatHistory || source.chatHistory.length === 0) ? (
            <Typography color="text.secondary" sx={{ py: 2 }}>No AI chat history yet. Will be populated when extraction agent runs.</Typography>
          ) : (
            <Stack spacing={1.5} sx={{ maxHeight: 400, overflow: 'auto' }}>
              {source.chatHistory.map((msg, i) => (
                <Paper key={i} variant="outlined" sx={{ p: 1.5, bgcolor: msg.role === 'assistant' ? 'action.hover' : 'transparent' }}>
                  <Typography variant="caption" color="text.disabled">{msg.role || 'system'} • {msg.timestamp}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>{msg.content || msg.message}</Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Box>
  );
};

const InfoRow = ({ label, value, mono = false }) => (
  <Stack direction="row" spacing={2}>
    <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }}>{label}</Typography>
    <Typography variant="body2" sx={mono ? { fontFamily: 'monospace', fontSize: '0.75rem' } : {}}>{value || '-'}</Typography>
  </Stack>
);

export default SourcesTab;
