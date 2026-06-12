/**
 * EntityStorePage — central entity knowledge store.
 * Left panel: entity list with filters + CRUD.
 * Right panel: 2D ReactFlow (EntityGraph2D) or 3D Singularity graph.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import EntityGraph2D, { PALETTE as ES_PALETTE } from '../components/EntityStore/EntityGraph2D';
import LayoutControlPanel from '../components/EntityStore/LayoutControlPanel';
import {
    Box, Typography, Stack, Chip, Divider,
    IconButton, Tooltip, Button, TextField, Select, MenuItem,
    FormControl, InputLabel, Dialog, DialogTitle, DialogContent,
    DialogActions, Alert, CircularProgress, InputAdornment,
    List, ListItemButton, ListItemText, Badge,
    Autocomplete, Checkbox, LinearProgress,
} from '@mui/material';
import {
    Archive, Network, Box as Box3D, Plus, Upload,
    Pencil, Trash2, Search, X, ChevronDown,
    RefreshCw, AlertTriangle, CheckCircle2, Filter,
    FileText,
} from 'lucide-react';
import SingularityGraph from '../components/Singularity/SingularityGraph';
import {
    importFromDocument, createEntity, listEntities, listNamespaces,
    getEntityGraph, updateEntity, deleteEntity, deleteNamespace,
    getPyramidStatus,
} from '../services/entityStore.service';
import { listDocuments, getDocumentEntities } from '../services/documentProcessing.service';
import { useEntityStore } from '../stores/entityStore.store';
import Layers from '@mui/icons-material/Layers';

const PALETTE = ES_PALETTE;

const SING_COLORS = {
    ACTOR:'#3b82f6', ORGANIZATION:'#3b82f6', CONCEPT:'#06b6d4',
    DOCUMENT:'#8b5cf6', EVENT:'#eab308', PROCESS:'#eab308',
    PERSON:'#22c55e', TECHNOLOGY:'#a855f7', POLICY:'#ef4444',
    SYSTEM:'#0891b2', WORK_ITEM:'#6b7280', default:'#6b7280',
};
const ENTITY_TYPES = ['ACTOR','CONCEPT','DOCUMENT','EVENT','PERSON','POLICY','PROCESS','SYSTEM','TECHNOLOGY','WORK_ITEM'];
const LAYERS = ['L0','L1','L2','L3','L4','L5'];

/* ── Import Dialog ────────────────────────────────────────────────────────── */

function ImportDialog({ open, onClose, onImported, existingNamespaces }) {
    const [docs,          setDocs]          = useState([]);
    const [docsLoading,   setDocsLoading]   = useState(true); // starts true — loads immediately on mount
    const [searchQuery,   setSearchQuery]   = useState('');
    const [checkedDocs,   setCheckedDocs]   = useState(new Set()); // selected doc IDs
    const [focusedDoc,    setFocusedDoc]    = useState(null);      // doc shown in right panel
    const [focusedEnts,   setFocusedEnts]   = useState([]);
    const [entLoading,    setEntLoading]    = useState(false);
    const [namespace,     setNamespace]     = useState('DEFAULT');
    const [importing,     setImporting]     = useState(false);
    const [importResult,  setImportResult]  = useState(null);

    useEffect(() => {
        if (!open) return;
        setDocsLoading(true);
        listDocuments({ limit: 200 })
            .then(d => setDocs(Array.isArray(d?.data) ? d.data : Array.isArray(d) ? d : []))
            .catch(() => setDocs([]))
            .finally(() => setDocsLoading(false));
    }, [open]);

    useEffect(() => {
        if (!focusedDoc) { setFocusedEnts([]); return; }
        setEntLoading(true);
        getDocumentEntities(focusedDoc.id)
            .then(ents => setFocusedEnts(Array.isArray(ents) ? ents : []))
            .catch(() => setFocusedEnts([]))
            .finally(() => setEntLoading(false));
    }, [focusedDoc]);

    const filteredDocs = useMemo(() => {
        if (!searchQuery.trim()) return docs;
        const q = searchQuery.toLowerCase();
        return docs.filter(d =>
            (d.documentTitle || '').toLowerCase().includes(q) ||
            (d.originalname  || '').toLowerCase().includes(q) ||
            (d.unSymbol      || '').toLowerCase().includes(q) ||
            (d.documentType  || '').toLowerCase().includes(q) ||
            (d.bodyOrOrgan   || '').toLowerCase().includes(q) ||
            (d.language      || '').toLowerCase().includes(q)
        );
    }, [docs, searchQuery]);

    const toggleDoc = docId => setCheckedDocs(prev => {
        const next = new Set(prev); next.has(docId) ? next.delete(docId) : next.add(docId); return next;
    });

    const toggleAll = () => setCheckedDocs(
        checkedDocs.size === filteredDocs.length
            ? new Set()
            : new Set(filteredDocs.map(d => d.id))
    );

    const handleImport = async () => {
        if (checkedDocs.size === 0) return;
        setImporting(true);
        try {
            const results = await Promise.all(
                [...checkedDocs].map(docId => importFromDocument(docId, { namespace }))
            );
            const totals = results.reduce(
                (acc, r) => ({ created: acc.created + (r?.created||0), linked: acc.linked + (r?.linked||0), skipped: acc.skipped + (r?.skipped||0) }),
                { created: 0, linked: 0, skipped: 0 }
            );
            setImportResult({ ...totals, docsCount: checkedDocs.size });
            onImported();
        } catch (e) {
            setImportResult({ error: e.response?.data?.error || e.message });
        } finally {
            setImporting(false);
        }
    };

    const handleClose = () => {
        setSearchQuery(''); setCheckedDocs(new Set()); setFocusedDoc(null);
        setFocusedEnts([]); setImportResult(null); setNamespace('DEFAULT');
        onClose();
    };

    const DOC_FIELDS = focusedDoc ? [
        { label: 'Status',           value: focusedDoc.status,          chip: true },
        { label: 'Type',             value: focusedDoc.documentType },
        { label: 'Language',         value: focusedDoc.language },
        { label: 'Publication Date', value: focusedDoc.publicationDate },
        { label: 'Meeting Date',     value: focusedDoc.meetingDate },
        { label: 'Body / Organ',     value: focusedDoc.bodyOrOrgan },
        { label: 'Agenda',           value: focusedDoc.agenda },
        { label: 'Epistemic Layer',  value: focusedDoc.epistemicLayer },
        { label: 'Namespace',        value: focusedDoc.namespace },
        { label: 'Pages',            value: focusedDoc.pageCount },
        { label: 'Words',            value: focusedDoc.wordCount },
    ].filter(f => f.value) : [];

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth
            PaperProps={{ sx: { borderRadius: 2, height: '82vh', maxHeight: '82vh', display: 'flex', flexDirection: 'column' } }}>

            <DialogTitle sx={{ pb: 1, flexShrink: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Upload size={18} />
                        <Typography variant="subtitle1" fontWeight={700}>Import Entities from Documents</Typography>
                        {checkedDocs.size > 0 && (
                            <Chip label={`${checkedDocs.size} selected`} size="small" color="primary"
                                sx={{ fontSize: '0.7rem', height: 20 }} />
                        )}
                    </Stack>
                    <IconButton size="small" onClick={handleClose}><X size={16} /></IconButton>
                </Stack>
            </DialogTitle>

            {importResult ? (
                <DialogContent sx={{ display: 'flex', alignItems: 'flex-start', pt: 2 }}>
                    {importResult.error ? (
                        <Alert severity="error" sx={{ width: '100%' }}>{importResult.error}</Alert>
                    ) : (
                        <Alert severity="success" icon={<CheckCircle2 size={18} />} sx={{ width: '100%' }}>
                            Imported from <strong>{importResult.docsCount}</strong> document{importResult.docsCount > 1 ? 's' : ''}:&nbsp;
                            <strong>{importResult.created}</strong> new entities created,&nbsp;
                            <strong>{importResult.linked}</strong> linked to existing,&nbsp;
                            <strong>{importResult.skipped}</strong> already in ES.
                        </Alert>
                    )}
                </DialogContent>
            ) : (
                <DialogContent sx={{ p: 0, display: 'flex', overflow: 'hidden', flex: 1 }}>

                    {/* ── LEFT: document list ── */}
                    <Box sx={{ width: 320, flexShrink: 0, borderRight: 1, borderColor: 'divider',
                        display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                        {/* search */}
                        <Box sx={{ p: 1.25, borderBottom: 1, borderColor: 'divider' }}>
                            <TextField size="small" fullWidth placeholder="Search by title, symbol, type, body…"
                                value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Search size={13} /></InputAdornment>,
                                    endAdornment: searchQuery ? (
                                        <InputAdornment position="end">
                                            <IconButton size="small" onClick={() => setSearchQuery('')}><X size={11} /></IconButton>
                                        </InputAdornment>
                                    ) : null,
                                }} />
                        </Box>

                        {/* select-all row */}
                        <Box sx={{ px: 1.25, py: 0.6, borderBottom: 1, borderColor: 'divider',
                            display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Checkbox size="small" sx={{ p: 0.25 }}
                                indeterminate={checkedDocs.size > 0 && checkedDocs.size < filteredDocs.length}
                                checked={filteredDocs.length > 0 && checkedDocs.size === filteredDocs.length}
                                onChange={toggleAll} />
                            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
                                {searchQuery ? ' (filtered)' : ''}
                            </Typography>
                        </Box>

                        {/* list body */}
                        <Box sx={{ flex: 1, overflowY: 'auto' }}>
                            {docsLoading ? (
                                <Box sx={{ p: 2 }}><LinearProgress /></Box>
                            ) : filteredDocs.length === 0 ? (
                                <Box sx={{ p: 3, textAlign: 'center' }}>
                                    <Typography variant="body2" color="text.disabled">
                                        {searchQuery ? 'No matching documents' : 'No documents found'}
                                    </Typography>
                                </Box>
                            ) : filteredDocs.map(doc => {
                                const isChecked = checkedDocs.has(doc.id);
                                const isFocused = focusedDoc?.id === doc.id;
                                const statusColor = {
                                    COMPLETED:    '#4ade80',
                                    CLASSIFIED:   '#60a5fa',
                                    NEEDS_REVIEW: '#fb923c',
                                    FAILED:       '#f87171',
                                    EXTRACTING:   '#a78bfa',
                                    CLASSIFYING:  '#a78bfa',
                                    UPLOADED:     '#6b7280',
                                }[doc.status] || '#6b7280';
                                return (
                                    <Box key={doc.id} onClick={() => setFocusedDoc(doc)}
                                        sx={{
                                            display: 'flex', alignItems: 'flex-start', gap: 0.5,
                                            px: 1, py: 0.85, cursor: 'pointer',
                                            borderBottom: '1px solid', borderColor: 'divider',
                                            bgcolor: isFocused ? 'action.selected' : 'transparent',
                                            '&:hover': { bgcolor: isFocused ? 'action.selected' : 'action.hover' },
                                        }}>
                                        <Checkbox size="small" checked={isChecked}
                                            onClick={e => { e.stopPropagation(); toggleDoc(doc.id); }}
                                            sx={{ mt: 0, p: 0.25, flexShrink: 0 }} />
                                        <Box flex={1} minWidth={0}>
                                            <Typography variant="body2" noWrap
                                                sx={{ fontSize: '0.79rem', fontWeight: isFocused ? 600 : 400,
                                                    color: isFocused ? 'primary.main' : 'text.primary' }}>
                                                {doc.documentTitle || doc.originalname || doc.id}
                                            </Typography>
                                            <Stack direction="row" spacing={0.5} mt={0.3} alignItems="center" flexWrap="wrap">
                                                {doc.unSymbol && (
                                                    <Typography sx={{ fontSize: '0.62rem', color: '#93c5fd',
                                                        fontFamily: 'monospace', bgcolor: '#1e3a5f40',
                                                        px: 0.5, borderRadius: 0.4, lineHeight: 1.6 }}>
                                                        {doc.unSymbol}
                                                    </Typography>
                                                )}
                                                {doc.documentType && (
                                                    <Typography sx={{ fontSize: '0.62rem', color: '#6b7280' }}>
                                                        {doc.documentType}
                                                    </Typography>
                                                )}
                                                {doc.language && (
                                                    <Chip label={doc.language} size="small"
                                                        sx={{ fontSize: '0.58rem', height: 15, px: 0.25 }} />
                                                )}
                                                <Tooltip title={doc.status || ''} placement="top">
                                                    <Box sx={{ width: 6, height: 6, borderRadius: '50%',
                                                        bgcolor: statusColor, flexShrink: 0 }} />
                                                </Tooltip>
                                            </Stack>
                                        </Box>
                                    </Box>
                                );
                            })}
                        </Box>
                    </Box>

                    {/* ── RIGHT: document detail card ── */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        {!focusedDoc ? (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Stack alignItems="center" spacing={1.5} sx={{ opacity: 0.35 }}>
                                    <FileText size={44} />
                                    <Typography variant="body2" color="text.disabled">
                                        Click a document to preview details
                                    </Typography>
                                </Stack>
                            </Box>
                        ) : (
                            <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5 }}>

                                {/* title block */}
                                <Stack spacing={0.75} mb={2}>
                                    <Typography variant="subtitle2" fontWeight={700}
                                        sx={{ fontSize: '0.95rem', lineHeight: 1.35 }}>
                                        {focusedDoc.documentTitle || focusedDoc.originalname}
                                    </Typography>
                                    {focusedDoc.unSymbol && (
                                        <Box sx={{ display: 'inline-flex' }}>
                                            <Typography sx={{ fontSize: '0.76rem', fontFamily: 'monospace',
                                                color: '#93c5fd', bgcolor: '#1e3a5f', px: 1, py: 0.35,
                                                borderRadius: 0.75, letterSpacing: '0.03em' }}>
                                                {focusedDoc.unSymbol}
                                            </Typography>
                                        </Box>
                                    )}
                                </Stack>

                                {/* metadata fields */}
                                <Stack spacing={0} divider={<Divider sx={{ opacity: 0.4 }} />}>
                                    {DOC_FIELDS.map(f => (
                                        <Box key={f.label}
                                            sx={{ display: 'flex', gap: 1.5, py: 0.7, alignItems: 'flex-start' }}>
                                            <Typography variant="caption" color="text.disabled"
                                                sx={{ minWidth: 120, fontSize: '0.68rem', pt: 0.15, flexShrink: 0 }}>
                                                {f.label}
                                            </Typography>
                                            {f.chip ? (
                                                <Chip label={f.value} size="small" color="success"
                                                    sx={{ fontSize: '0.65rem', height: 18 }} />
                                            ) : (
                                                <Typography variant="caption"
                                                    sx={{ fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.4 }}>
                                                    {f.value}
                                                </Typography>
                                            )}
                                        </Box>
                                    ))}
                                    {focusedDoc.description && (
                                        <Box sx={{ py: 0.85 }}>
                                            <Typography variant="caption" color="text.disabled"
                                                sx={{ fontSize: '0.68rem', display: 'block', mb: 0.5 }}>
                                                Description
                                            </Typography>
                                            <Typography variant="caption"
                                                sx={{ fontSize: '0.76rem', color: 'text.secondary', lineHeight: 1.5,
                                                    display: '-webkit-box', WebkitLineClamp: 5,
                                                    WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                                {focusedDoc.description}
                                            </Typography>
                                        </Box>
                                    )}
                                </Stack>

                                {/* entity preview */}
                                <Divider sx={{ my: 2 }} />
                                <Typography variant="caption" color="text.disabled"
                                    sx={{ fontSize: '0.65rem', textTransform: 'uppercase',
                                        fontWeight: 700, letterSpacing: '0.06em' }}>
                                    Extracted Entities
                                </Typography>

                                {entLoading ? (
                                    <LinearProgress sx={{ mt: 1 }} />
                                ) : focusedEnts.length === 0 ? (
                                    <Typography variant="caption" color="text.disabled"
                                        sx={{ display: 'block', mt: 0.75, fontSize: '0.73rem' }}>
                                        No entities extracted yet
                                    </Typography>
                                ) : (
                                    <>
                                        <Typography variant="caption" color="text.secondary"
                                            sx={{ display: 'block', mt: 0.5, mb: 1.25, fontSize: '0.72rem' }}>
                                            {focusedEnts.length} entities
                                            {focusedEnts.filter(e => e.esEntityId).length > 0 &&
                                                ` · ${focusedEnts.filter(e => e.esEntityId).length} already in ES`}
                                        </Typography>
                                        <Stack direction="row" flexWrap="wrap" gap={0.6}>
                                            {focusedEnts.slice(0, 50).map(e => {
                                                const c = PALETTE[(e.type||'').toUpperCase()] || PALETTE.default;
                                                return (
                                                    <Chip key={e.id} label={e.name} size="small" sx={{
                                                        fontSize: '0.63rem', height: 20,
                                                        bgcolor: c.border + '25',
                                                        border: `1px solid ${c.border}55`,
                                                        color: c.text,
                                                        textDecoration: e.esEntityId ? 'underline' : 'none',
                                                    }} />
                                                );
                                            })}
                                            {focusedEnts.length > 50 && (
                                                <Typography variant="caption" color="text.disabled"
                                                    sx={{ fontSize: '0.65rem', alignSelf: 'center' }}>
                                                    +{focusedEnts.length - 50} more
                                                </Typography>
                                            )}
                                        </Stack>
                                    </>
                                )}
                            </Box>
                        )}
                    </Box>
                </DialogContent>
            )}

            <DialogActions sx={{ px: 2, py: 1.25, borderTop: 1, borderColor: 'divider', gap: 1, flexShrink: 0 }}>
                {!importResult && (() => {
                    const opts = Array.isArray(existingNamespaces) ? existingNamespaces : [];
                    const allOpts = opts.length === 0 || !opts.includes('DEFAULT') ? ['DEFAULT', ...opts] : opts;
                    return (
                        <FormControl size="small" sx={{ width: 210 }}>
                            <InputLabel>Target namespace</InputLabel>
                            <Select label="Target namespace" value={allOpts.includes(namespace) ? namespace : allOpts[0]}
                                onChange={e => setNamespace(e.target.value)}>
                                {allOpts.map(ns => (
                                    <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    );
                })()}
                <Box flex={1} />
                <Button onClick={handleClose} size="small">
                    {importResult ? 'Close' : 'Cancel'}
                </Button>
                {!importResult && (
                    <Button variant="contained" size="small" onClick={handleImport}
                        disabled={importing || checkedDocs.size === 0}
                        startIcon={importing ? <CircularProgress size={14} /> : <Upload size={14} />}>
                        {importing
                            ? 'Importing…'
                            : `Import from ${checkedDocs.size} doc${checkedDocs.size !== 1 ? 's' : ''}`}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
}

/* ── Edit/Create Dialog ───────────────────────────────────────────────────── */

function EntityDialog({ open, entity, namespaces, onClose, onSaved }) {
    const isNew = !entity?.id;
    const [form, setForm] = useState({ name:'', type:'CONCEPT', namespace:'DEFAULT', description:'', epistemicLayer:'', category:'' });
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState(null);

    useEffect(() => {
        if (entity) setForm({ name: entity.name||'', type: entity.type||'CONCEPT',
            namespace: entity.namespace||'DEFAULT', description: entity.description||'',
            epistemicLayer: entity.epistemicLayer||'', category: entity.category||'' });
        else setForm({ name:'', type:'CONCEPT', namespace:'DEFAULT', description:'', epistemicLayer:'', category:'' });
        setError(null);
    }, [entity, open]);

    const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

    const handleSave = async () => {
        if (!form.name.trim()) { setError('Name is required'); return; }
        setSaving(true); setError(null);
        try {
            if (isNew)  await createEntity(form);
            else        await updateEntity(entity.id, form);
            onSaved();
            onClose();
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth
            PaperProps={{ sx: { borderRadius: 2 } }}>
            <DialogTitle>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle1" fontWeight={700}>{isNew ? 'New Entity' : 'Edit Entity'}</Typography>
                    <IconButton size="small" onClick={onClose}><X size={16} /></IconButton>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Stack spacing={2}>
                    {error && <Alert severity="error" sx={{ py: 0.25 }}>{error}</Alert>}
                    <TextField label="Name" value={form.name} onChange={set('name')} fullWidth size="small" required />
                    <FormControl fullWidth size="small">
                        <InputLabel>Type</InputLabel>
                        <Select label="Type" value={form.type} onChange={set('type')}>
                            {ENTITY_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <Autocomplete freeSolo options={Array.isArray(namespaces) ? namespaces : []} value={form.namespace}
                        onInputChange={(_, v) => setForm(p => ({ ...p, namespace: v }))}
                        renderInput={p => <TextField {...p} label="Namespace" size="small" />} />
                    <TextField label="Description" value={form.description} onChange={set('description')}
                        fullWidth size="small" multiline rows={2} />
                    <FormControl fullWidth size="small">
                        <InputLabel>Epistemic Layer</InputLabel>
                        <Select label="Epistemic Layer" value={form.epistemicLayer} onChange={set('epistemicLayer')}>
                            <MenuItem value="">—</MenuItem>
                            {LAYERS.map(l => <MenuItem key={l} value={l}>{l}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2, py: 1.5 }}>
                <Button onClick={onClose} size="small">Cancel</Button>
                <Button variant="contained" size="small" onClick={handleSave} disabled={saving}
                    startIcon={saving ? <CircularProgress size={14} /> : null}>
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ── Delete Namespace Dialog ──────────────────────────────────────────────── */

function DeleteNsDialog({ open, namespace, onClose, onDeleted }) {
    const [loading, setLoading] = useState(false);
    const handleDelete = async () => {
        setLoading(true);
        try { await deleteNamespace(namespace); onDeleted(); onClose(); }
        catch (_) { setLoading(false); }
    };
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
            <DialogTitle>Delete Namespace</DialogTitle>
            <DialogContent>
                <Alert severity="warning" icon={<AlertTriangle size={18} />}>
                    Delete namespace <strong>{namespace}</strong>? All entities in it will be permanently removed and
                    their document links cleared.
                </Alert>
            </DialogContent>
            <DialogActions sx={{ px: 2, py: 1.5 }}>
                <Button onClick={onClose} size="small">Cancel</Button>
                <Button variant="contained" color="error" size="small" onClick={handleDelete} disabled={loading}>
                    {loading ? 'Deleting…' : 'Delete'}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/* ── Main Page ────────────────────────────────────────────────────────────── */

export default function EntityStorePage() {
    /* ── state ── */
    const [entities,       setEntities]       = useState([]);
    const [graphData,      setGraphData]       = useState(null);
    const [namespaces,     setNamespaces]      = useState([]);
    const [loading,        setLoading]         = useState(false);
    const [graphLoading,   setGraphLoading]    = useState(false);
    const [filterNs,       setFilterNs]        = useState('');
    const [filterType,     setFilterType]      = useState('');
    const [search,         setSearch]          = useState('');
    const [viewMode,       setViewMode]        = useState('reactflow');
    const [selectedId,     setSelectedId]      = useState(null);
    const [importOpen,     setImportOpen]      = useState(false);
    const [editEntity,     setEditEntity]      = useState(null); // null=closed, {}=new, entity=edit
    const [deleteNs,       setDeleteNs]        = useState(null);
    const [deleteEntityId, setDeleteEntityId]  = useState(null);
    const [deleteLoading,  setDeleteLoading]   = useState(false);

    /* ── LOD / Pyramid ── */
    const pyramidStatus       = useEntityStore(s => s.pyramidStatus);
    const setPyramidStatus    = useEntityStore(s => s.setPyramidStatus);
    const buildAndLayoutStore = useEntityStore(s => s.buildAndLayoutPyramid);
    const isBuilding          = useEntityStore(s => s.isLoading);

    const pyramidExists = !!(pyramidStatus?.levels?.length);
    const activeNs      = filterNs || (namespaces[0] ?? null);

    // Check pyramid status whenever namespace changes
    useEffect(() => {
        if (!activeNs) return;
        getPyramidStatus(activeNs)
            .then(s => setPyramidStatus(s))
            .catch(() => setPyramidStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeNs]);

    const handleBuildPyramid = useCallback(async () => {
        if (!activeNs) return;
        await buildAndLayoutStore(activeNs);
    }, [activeNs, buildAndLayoutStore]);

    /* ── data loading ── */

    const loadAll = useCallback(async () => {
        setLoading(true);
        const [ents, nss] = await Promise.all([
            listEntities({ namespace: filterNs || null, type: filterType || null, search: search || null })
                .catch(() => null),
            listNamespaces()
                .catch(() => null),
        ]);
        if (Array.isArray(ents)) setEntities(ents);
        if (Array.isArray(nss))  setNamespaces(nss.map(n => n.namespace));
        setLoading(false);
    }, [filterNs, filterType, search]);

    const loadGraph = useCallback(async () => {
        setGraphLoading(true);
        const gd = await getEntityGraph(filterNs || null).catch(() => null);
        if (gd) setGraphData(gd);
        setGraphLoading(false);
    }, [filterNs]);

    useEffect(() => { loadAll(); }, [loadAll]);
    useEffect(() => { loadGraph(); }, [loadGraph]);

    /* ── Singularity data ── */
    const singularityData = useMemo(() => {
        if (!graphData) return null;
        return {
            nodes: graphData.entities.map(e => ({
                id:         e.id,
                name:       e.name,
                type:       (e.type || 'workItem').toLowerCase(),
                val:        e.mentionCount > 0 ? 10 : 6,
                color:      SING_COLORS[(e.type || '').toUpperCase()] || '#6b7280',
                level:      0,
                loaded:     true,
                hasSubGraph: false,
                data:       e,
            })),
            links: graphData.relationships
                .filter(r => r.sourceId && r.targetId)
                .map(r => ({ source: r.sourceId, target: r.targetId, type: r.relType || 'RELATED_TO' })),
        };
    }, [graphData]);

    /* ── node click from EntityGraph2D ── */
    const handleNodeSelect = useCallback((nodeId) => {
        setSelectedId(nodeId);
        const el = document.getElementById(`es-item-${nodeId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, []);

    /* ── delete entity ── */
    const handleDeleteEntity = async id => {
        setDeleteLoading(true);
        try { await deleteEntity(id); await Promise.all([loadAll(), loadGraph()]); }
        catch (_) {}
        setDeleteLoading(false);
        setDeleteEntityId(null);
    };

    const nsOptions = namespaces;
    const allNamespaces = ['', ...nsOptions];

    /* ── render ── */
    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

            {/* Header */}
            <Box sx={{ px: 3, py: 1.5, borderBottom: 1, borderColor: 'divider',
                display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
                <Archive size={22} style={{ opacity: 0.7 }} />
                <Typography variant="h6" fontWeight={700}>Entity Store</Typography>
                <Divider orientation="vertical" flexItem />

                {/* Namespace tabs */}
                <Stack direction="row" spacing={0.5} flexWrap="wrap" alignItems="center">
                    {allNamespaces.map(ns => (
                        <Chip key={ns || '_all'} label={ns || 'All'} size="small"
                            onClick={() => setFilterNs(ns)}
                            variant={filterNs === ns ? 'filled' : 'outlined'}
                            color={filterNs === ns ? 'primary' : 'default'}
                            sx={{ fontSize: '0.72rem', cursor: 'pointer' }}
                            onDelete={ns && filterNs !== ns ? () => setDeleteNs(ns) : undefined}
                        />
                    ))}
                </Stack>

                <Box flex={1} />

                <Tooltip title="Refresh">
                    <IconButton size="small" onClick={() => { loadAll(); loadGraph(); }} disabled={loading}>
                        <RefreshCw size={15} />
                    </IconButton>
                </Tooltip>
                <Button size="small" variant="outlined" startIcon={<Plus size={14} />}
                    onClick={() => setEditEntity({})}>
                    New Entity
                </Button>
                <Button size="small" variant="contained" startIcon={<Upload size={14} />}
                    onClick={() => setImportOpen(true)}>
                    Import from Doc
                </Button>
            </Box>

            {/* Body */}
            <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ── LEFT PANEL ── */}
                <Box sx={{ width: 310, flexShrink: 0, borderRight: 1, borderColor: 'divider',
                    display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Filters */}
                    <Box sx={{ p: 1.5, borderBottom: 1, borderColor: 'divider' }}>
                        <TextField size="small" fullWidth placeholder="Search entities…"
                            value={search} onChange={e => setSearch(e.target.value)}
                            InputProps={{
                                startAdornment: <InputAdornment position="start"><Search size={14} /></InputAdornment>,
                                endAdornment: search ? (
                                    <InputAdornment position="end">
                                        <IconButton size="small" onClick={() => setSearch('')}><X size={12} /></IconButton>
                                    </InputAdornment>
                                ) : null,
                            }}
                            sx={{ mb: 1 }}
                        />
                        <FormControl fullWidth size="small">
                            <InputLabel sx={{ fontSize: '0.8rem' }}>Type filter</InputLabel>
                            <Select label="Type filter" value={filterType} onChange={e => setFilterType(e.target.value)}
                                sx={{ fontSize: '0.8rem' }}>
                                <MenuItem value="">All types</MenuItem>
                                {ENTITY_TYPES.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                            </Select>
                        </FormControl>
                    </Box>

                    {/* Stats */}
                    <Box sx={{ px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                            {loading ? 'Loading…' : `${entities.length} entities`}
                            {filterNs && ` in ${filterNs}`}
                            {filterType && ` · type: ${filterType}`}
                        </Typography>
                    </Box>

                    {/* Entity list */}
                    <Box sx={{ flex: 1, overflowY: 'auto' }}>
                        {loading && <LinearProgress />}
                        {!loading && entities.length === 0 && (
                            <Box sx={{ p: 3, textAlign: 'center' }}>
                                <Archive size={32} style={{ opacity: 0.15, marginBottom: 8 }} />
                                <Typography variant="body2" color="text.disabled" sx={{ mb: 0.5 }}>
                                    {filterNs || filterType || search ? 'No entities match the filter' : 'Entity Store is empty'}
                                </Typography>
                                <Typography variant="caption" color="text.disabled">
                                    {filterNs || filterType || search
                                        ? 'Try clearing the filters'
                                        : 'Use "Import from Doc" to add entities from processed documents'}
                                </Typography>
                                {!filterNs && !filterType && !search && (
                                    <Box mt={1.5}>
                                        <Button size="small" variant="outlined" startIcon={<Upload size={13} />}
                                            onClick={() => setImportOpen(true)}>
                                            Import from Doc
                                        </Button>
                                    </Box>
                                )}
                            </Box>
                        )}
                        {entities.map(e => {
                            const c = PALETTE[(e.type || '').toUpperCase()] || PALETTE.default;
                            const isSelected = e.id === selectedId;
                            return (
                                <Box key={e.id} id={`es-item-${e.id}`}
                                    onClick={() => setSelectedId(e.id)}
                                    sx={{
                                        px: 1.5, py: 1, cursor: 'pointer', borderLeft: '3px solid',
                                        borderLeftColor: isSelected ? c.border : 'transparent',
                                        bgcolor: isSelected ? `${c.border}12` : 'transparent',
                                        '&:hover': { bgcolor: `${c.border}08` },
                                        borderBottom: '1px solid', borderBottomColor: 'divider',
                                    }}>
                                    <Stack direction="row" alignItems="flex-start" spacing={0.75}>
                                        <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.border,
                                            flexShrink: 0, mt: 0.75 }} />
                                        <Box flex={1} minWidth={0}>
                                            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                                                <Typography variant="body2" sx={{ fontSize: '0.82rem', fontWeight: 500,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    maxWidth: 150 }} title={e.name}>
                                                    {e.name}
                                                </Typography>
                                                {e.mentionCount > 0 && (
                                                    <Typography sx={{ fontSize: '0.6rem', color: '#64748b',
                                                        bgcolor: 'action.selected', px: 0.5, py: 0.1, borderRadius: 0.5 }}>
                                                        {e.mentionCount}
                                                    </Typography>
                                                )}
                                            </Stack>
                                            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                                                <Chip label={e.type} size="small"
                                                    sx={{ fontSize: '0.58rem', height: 16,
                                                        bgcolor: `${c.border}25`, color: c.text, border: 'none' }} />
                                                {e.namespace && e.namespace !== filterNs && (
                                                    <Typography sx={{ fontSize: '0.6rem', color: 'text.disabled' }}>
                                                        {e.namespace}
                                                    </Typography>
                                                )}
                                                {e.epistemicLayer && (
                                                    <Typography sx={{ fontSize: '0.58rem', color: '#7c3aed',
                                                        bgcolor: '#7c3aed15', px: 0.5, borderRadius: 0.5 }}>
                                                        {e.epistemicLayer}
                                                    </Typography>
                                                )}
                                                {e.provenanceDocTitle && (
                                                    <Tooltip placement="top" arrow
                                                        title={
                                                            <Stack spacing={0.25}>
                                                                <Typography sx={{ fontSize: '0.72rem', fontWeight: 600 }}>
                                                                    Source document
                                                                </Typography>
                                                                {e.provenanceDocSymbol && (
                                                                    <Typography sx={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#93c5fd' }}>
                                                                        {e.provenanceDocSymbol}
                                                                    </Typography>
                                                                )}
                                                                <Typography sx={{ fontSize: '0.68rem', color: '#cbd5e1' }}>
                                                                    {e.provenanceDocTitle}
                                                                </Typography>
                                                                {e.provenanceImportedAt && (
                                                                    <Typography sx={{ fontSize: '0.62rem', color: '#64748b' }}>
                                                                        {new Date(e.provenanceImportedAt).toLocaleDateString()}
                                                                    </Typography>
                                                                )}
                                                            </Stack>
                                                        }>
                                                        <FileText size={10} style={{ color: '#64748b', cursor: 'help', flexShrink: 0 }} />
                                                    </Tooltip>
                                                )}
                                            </Stack>
                                        </Box>
                                        <Stack direction="row" spacing={0} sx={{ flexShrink: 0 }}>
                                            <Tooltip title="Edit">
                                                <IconButton size="small" sx={{ p: 0.25 }}
                                                    onClick={ev => { ev.stopPropagation(); setEditEntity(e); }}>
                                                    <Pencil size={12} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton size="small" sx={{ p: 0.25, color: 'error.main' }}
                                                    onClick={ev => { ev.stopPropagation(); setDeleteEntityId(e.id); }}>
                                                    <Trash2 size={12} />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </Stack>
                                </Box>
                            );
                        })}
                    </Box>
                </Box>

                {/* ── GRAPH PANEL ── */}
                <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                    {/* Graph toolbar */}
                    <Box sx={{ px: 2, py: 1, borderBottom: 1, borderColor: 'divider',
                        display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                        {graphLoading && <CircularProgress size={14} />}
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                            {graphData ? `${graphData.entities.length} nodes · ${graphData.relationships.length} edges` : ''}
                        </Typography>
                        <Box flex={1} />
                        {viewMode === 'reactflow' && <LayoutControlPanel namespace={filterNs || null} />}
                        {viewMode === 'reactflow' && <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />}
                        <Tooltip title="2D flow graph">
                            <IconButton size="small" onClick={() => setViewMode('reactflow')}
                                sx={{ border: '1px solid',
                                    borderColor: viewMode === 'reactflow' ? 'primary.main' : 'divider',
                                    bgcolor: viewMode === 'reactflow' ? 'primary.dark' : 'transparent' }}>
                                <Network size={15} />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={pyramidExists ? 'LOD Knowledge Map (viewport-based)' : 'Build pyramid first to use LOD Map'}>
                            <span>
                                <IconButton size="small" onClick={() => setViewMode('lod')}
                                    disabled={!pyramidExists && viewMode !== 'lod'}
                                    sx={{ border: '1px solid',
                                        borderColor: viewMode === 'lod' ? '#6366f1' : 'divider',
                                        bgcolor: viewMode === 'lod' ? '#6366f120' : 'transparent',
                                        color: viewMode === 'lod' ? '#6366f1' : undefined }}>
                                    <Layers sx={{ fontSize: 15 }} />
                                </IconButton>
                            </span>
                        </Tooltip>
                        <Tooltip title="3D force graph">
                            <IconButton size="small" onClick={() => setViewMode('singularity')}
                                sx={{ border: '1px solid',
                                    borderColor: viewMode === 'singularity' ? 'primary.main' : 'divider',
                                    bgcolor: viewMode === 'singularity' ? 'primary.dark' : 'transparent' }}>
                                <Box3D size={15} />
                            </IconButton>
                        </Tooltip>
                    </Box>

                    {/* Graph view */}
                    {viewMode === 'lod' ? (
                        pyramidExists ? (
                            <Box sx={{ flex: 1, bgcolor: '#0d1117', position: 'relative', overflow: 'hidden' }}>
                                <EntityGraph2D
                                    lodMode={true}
                                    namespace={activeNs}
                                    selectedId={selectedId}
                                    onNodeSelect={handleNodeSelect}
                                />
                            </Box>
                        ) : (
                            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Stack alignItems="center" spacing={2} sx={{ maxWidth: 360, textAlign: 'center' }}>
                                    <Layers sx={{ fontSize: 48, opacity: 0.2 }} />
                                    <Typography variant="body1" fontWeight={600}>No Knowledge Map</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Build the cluster pyramid to enable LOD viewport rendering.
                                        This precomputes entity coordinates and community hierarchy.
                                    </Typography>
                                    {activeNs && (
                                        <Button variant="contained" size="small" onClick={handleBuildPyramid}
                                            disabled={isBuilding}
                                            startIcon={isBuilding ? <CircularProgress size={14} /> : <Layers sx={{ fontSize: 14 }} />}>
                                            {isBuilding ? 'Building…' : `Build Map for "${activeNs}"`}
                                        </Button>
                                    )}
                                </Stack>
                            </Box>
                        )
                    ) : graphData && graphData.entities.length === 0 ? (
                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Stack alignItems="center" spacing={1}>
                                <Network size={36} style={{ opacity: 0.2 }} />
                                <Typography variant="body2" color="text.disabled">
                                    No entities to display
                                </Typography>
                            </Stack>
                        </Box>
                    ) : viewMode === 'reactflow' ? (
                        <Box sx={{ flex: 1, bgcolor: '#0d1117', position: 'relative', overflow: 'hidden' }}>
                            <EntityGraph2D
                                graphData={graphData}
                                selectedId={selectedId}
                                onNodeSelect={handleNodeSelect}
                            />
                        </Box>
                    ) : (
                        singularityData && (
                            <Box sx={{ flex: 1, overflow: 'hidden' }}>
                                <SingularityGraph externalData={singularityData} />
                            </Box>
                        )
                    )}
                </Box>
            </Box>

            {/* ── Dialogs (conditionally mounted to avoid Autocomplete rendering with uninitialized options) ── */}
            {importOpen && (
                <ImportDialog open={true} onClose={() => setImportOpen(false)}
                    onImported={() => { loadAll(); loadGraph(); }}
                    existingNamespaces={nsOptions} />
            )}

            {editEntity !== null && (
                <EntityDialog open={true} entity={editEntity?.id ? editEntity : null}
                    namespaces={nsOptions} onClose={() => setEditEntity(null)}
                    onSaved={() => { loadAll(); loadGraph(); }} />
            )}

            {deleteNs !== null && (
                <DeleteNsDialog open={true} namespace={deleteNs}
                    onClose={() => setDeleteNs(null)}
                    onDeleted={() => { setFilterNs(''); loadAll(); loadGraph(); }} />
            )}

            {/* Delete entity confirm */}
            <Dialog open={!!deleteEntityId} onClose={() => setDeleteEntityId(null)}
                maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
                <DialogTitle>Delete Entity?</DialogTitle>
                <DialogContent>
                    <Alert severity="warning" icon={<AlertTriangle size={18} />}>
                        This will permanently remove the entity from the store and unlink all document mentions.
                    </Alert>
                </DialogContent>
                <DialogActions sx={{ px: 2, py: 1.5 }}>
                    <Button onClick={() => setDeleteEntityId(null)} size="small">Cancel</Button>
                    <Button variant="contained" color="error" size="small"
                        disabled={deleteLoading}
                        onClick={() => handleDeleteEntity(deleteEntityId)}>
                        {deleteLoading ? 'Deleting…' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
