/**
 * DocumentCardDialog
 * Full card for an imported/processed document, organised into tabs:
 *   Overview       — Identity, Source, Processing, KQS
 *   Classification — ClassificationReview inline (type, layer, confidence, override, actions)
 *   Knowledge      — Document Structure + Extracted Entities
 *   MARC21         — Full MARC21 metadata (when available)
 *
 * Deep-linking: /documents/:id opens this dialog.
 * Tab deep-linking: pass initialTab='classification' to pre-select a tab.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Typography, Stack, Chip, Divider, Box, IconButton,
    Tooltip, Paper, LinearProgress, Grid, CircularProgress, Alert,
    Tabs, Tab, Autocomplete, TextField
} from '@mui/material';
import {
    X, FileText, Hash, Globe, ExternalLink,
    CheckCircle, AlertCircle, Clock, XCircle, Play, RotateCcw,
    Zap, Tag, Layers, ShieldCheck, Link2, BookOpen, BarChart2,
    RefreshCw, DatabaseZap, Network, AlignLeft, Archive
} from 'lucide-react';
import {
    refetchMetadata, analyzeStructure, getDocumentEntities, listDocumentTypes
} from '../../services/documentProcessing.service';
import { importFromDocument, listNamespaces } from '../../services/entityStore.service';
import ClassificationReview from './ClassificationReview';
import DocumentGraphTab from './DocumentGraphTab';

/* ── constants ─────────────────────────────────────────────────────────── */

const STATUS_CONFIG = {
    UPLOADED:    { color: 'default',  Icon: Clock,        label: 'Uploaded' },
    CLASSIFYING: { color: 'info',     Icon: Clock,        label: 'Classifying…' },
    CLASSIFIED:  { color: 'success',  Icon: CheckCircle,  label: 'Classified' },
    NEEDS_REVIEW:{ color: 'warning',  Icon: AlertCircle,  label: 'Needs Review' },
    EXTRACTING:  { color: 'info',     Icon: Clock,        label: 'Extracting…' },
    COMPLETED:   { color: 'success',  Icon: CheckCircle,  label: 'Completed' },
    FAILED:      { color: 'error',    Icon: XCircle,      label: 'Failed' },
};

const LAYER_COLORS = { L0: '#7c3aed', L1: '#2563eb', L2: '#0891b2', L3: '#059669', L4: '#d97706', L5: '#9333ea' };
const REPO_COLORS  = { ODS: '#2563eb', OIOS: '#dc2626', JIU: '#7c3aed', POLICY_PORTAL: '#059669', MANUAL: '#6b7280' };

const LANG_LABELS = {
    ara: 'Arabic', chi: 'Chinese', eng: 'English', fre: 'French',
    rus: 'Russian', spa: 'Spanish', ger: 'German', por: 'Portuguese',
};

const ENTITY_TYPE_COLORS = {
    Organization: '#1d4ed8', ORGANIZATION: '#1d4ed8',
    System:       '#0891b2', SYSTEM:       '#0891b2',
    DocumentRef:  '#7c3aed', DOCUMENT:     '#7c3aed',
    Person:       '#065f46', PERSON:       '#065f46',
    Technology:   '#9333ea', TECHNOLOGY:   '#9333ea',
    Policy:       '#dc2626', POLICY:       '#dc2626',
    Process:      '#d97706', PROCESS:      '#d97706',
    WorkItem:     '#6b7280', WORK_ITEM:    '#6b7280',
    ACTOR:        '#1d4ed8', EVENT:        '#d97706', CONCEPT: '#059669',
};

const STRUCTURE_TYPE_LABELS = {
    section: 'Section', preamble: 'Preamble', operative: 'Operative',
    annex: 'Annex', body: 'Body', executive_summary: 'Executive Summary',
};

/* ── helpers ────────────────────────────────────────────────────────────── */

function formatBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(v, opts = { dateStyle: 'medium', timeStyle: 'short' }) {
    if (!v) return '—';
    try { return new Date(v).toLocaleString('en-US', opts); } catch { return v; }
}

function groupByType(entities) {
    const groups = {};
    for (const e of entities) {
        const t = e.type || 'Other';
        if (!groups[t]) groups[t] = [];
        groups[t].push(e);
    }
    return groups;
}

/* ── sub-components ─────────────────────────────────────────────────────── */

function CardSection({ title, icon: Icon, children }) {
    return (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.25 }}>
                <Icon size={14} style={{ opacity: 0.6 }} />
                <Typography variant="caption" fontWeight={700} color="text.secondary"
                    sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>
                    {title}
                </Typography>
            </Stack>
            <Stack spacing={1}>{children}</Stack>
        </Paper>
    );
}

function Field({ label, children }) {
    return (
        <Stack spacing={0.2}>
            <Typography variant="caption" color="text.disabled"
                sx={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {label}
            </Typography>
            <Box sx={{ fontSize: '0.82rem' }}>{children}</Box>
        </Stack>
    );
}

function TextValue({ v, mono = false, color }) {
    if (!v && v !== 0) return <Typography variant="body2" color="text.disabled">—</Typography>;
    return (
        <Typography variant="body2" sx={{ fontFamily: mono ? 'monospace' : 'inherit', color: color || 'text.primary' }}>
            {v}
        </Typography>
    );
}

/* ── tab indicator dot ──────────────────────────────────────────────────── */

function TabLabel({ label, warn }) {
    return (
        <Stack direction="row" spacing={0.5} alignItems="center">
            <span>{label}</span>
            {warn && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0 }} />}
        </Stack>
    );
}

/* ── main component ─────────────────────────────────────────────────────── */

export default function DocumentCardDialog({
    open, onClose, doc,
    onExtract, onForceExtract,
    extractionModel = 'claude-code',
    initialTab = 'overview',
}) {
    const [activeTab,          setActiveTab]          = useState(initialTab);
    const [refetching,         setRefetching]         = useState(false);
    const [refetchStatus,      setRefetchStatus]      = useState(null);
    const [refetchError,       setRefetchError]       = useState(null);
    const [freshDoc,           setFreshDoc]           = useState(null);
    const [entities,           setEntities]           = useState(null);
    const [entitiesLoading,    setEntitiesLoading]    = useState(false);
    const [structureAnalyzing, setStructureAnalyzing] = useState(false);
    const [structureStatus,    setStructureStatus]    = useState(null);
    const [docTypes,           setDocTypes]           = useState([]);
    // Entity Store push
    const [pushDialogOpen,     setPushDialogOpen]     = useState(false);
    const [pushNamespace,      setPushNamespace]      = useState('DEFAULT');
    const [esNamespaces,       setEsNamespaces]       = useState([]);
    const [pushing,            setPushing]            = useState(false);
    const [pushResult,         setPushResult]         = useState(null);

    // Reset per-document state when a different document is opened
    useEffect(() => {
        setFreshDoc(null);
        setRefetchStatus(null);
        setRefetchError(null);
        setRefetching(false);
        setEntities(null);
        setEntitiesLoading(false);
        setStructureAnalyzing(false);
        setStructureStatus(null);
        setActiveTab(initialTab || 'overview');
        setPushResult(null);
    }, [doc?.id, initialTab]);

    // Lazy-load document types when Classification tab is first shown
    useEffect(() => {
        if (activeTab === 'classification' && docTypes.length === 0) {
            listDocumentTypes().then(setDocTypes).catch(() => {});
        }
    }, [activeTab, docTypes.length]);

    // Auto-load entities for COMPLETED documents
    useEffect(() => {
        if (doc?.status === 'COMPLETED' && !entities && open) {
            setEntitiesLoading(true);
            getDocumentEntities(doc.id)
                .then(data => setEntities(data || []))
                .catch(() => setEntities([]))
                .finally(() => setEntitiesLoading(false));
        }
    }, [doc?.id, doc?.status, open]);

    if (!open) return null;

    const activeDoc = freshDoc || doc;

    /* ── handlers ─────────────────────────────────────────────────────── */

    const handleRefetchMetadata = async () => {
        setRefetching(true);
        setRefetchStatus(null);
        setRefetchError(null);
        try {
            const updated = await refetchMetadata(activeDoc.id);
            setFreshDoc(updated);
            setRefetchStatus('success');
        } catch (e) {
            setRefetchStatus('error');
            setRefetchError(e.response?.data?.error || e.message);
        } finally {
            setRefetching(false);
        }
    };

    const handleAnalyzeStructure = async () => {
        setStructureAnalyzing(true);
        setStructureStatus(null);
        try {
            const structure = await analyzeStructure(activeDoc.id);
            setFreshDoc(prev => ({
                ...(prev || activeDoc),
                documentStructure: structure,
                structureAnalyzedAt: structure.analyzedAt,
            }));
            setStructureStatus('success');
        } catch {
            setStructureStatus('error');
        } finally {
            setStructureAnalyzing(false);
        }
    };

    const handleLoadEntities = async () => {
        setEntitiesLoading(true);
        try {
            const data = await getDocumentEntities(activeDoc.id);
            setEntities(data || []);
        } catch {
            setEntities([]);
        } finally {
            setEntitiesLoading(false);
        }
    };

    const copyLink = () => {
        navigator.clipboard.writeText(`${window.location.origin}/documents/${activeDoc?.id}`).catch(() => {});
    };

    const handleOpenPush = async () => {
        setPushResult(null);
        setPushNamespace('DEFAULT');
        try {
            const nss = await listNamespaces();
            setEsNamespaces(nss.map(n => n.namespace));
        } catch (_) {}
        setPushDialogOpen(true);
    };

    const handlePushToES = async () => {
        if (!activeDoc?.id) return;
        setPushing(true);
        try {
            const result = await importFromDocument(activeDoc.id, { namespace: pushNamespace });
            setPushResult({ success: true, ...result });
            // Reload entities to show ES links
            const fresh = await getDocumentEntities(activeDoc.id).catch(() => null);
            if (fresh) setEntities(fresh);
        } catch (e) {
            setPushResult({ success: false, error: e.response?.data?.error || e.message });
        } finally {
            setPushing(false);
        }
    };

    /* ── skeleton while loading ───────────────────────────────────────── */

    if (!doc) {
        return (
            <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
                PaperProps={{ sx: { borderRadius: 2, maxHeight: '90vh' } }}>
                <DialogTitle>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="subtitle1" color="text.secondary">Loading document…</Typography>
                        <IconButton size="small" onClick={onClose}><X size={16} /></IconButton>
                    </Stack>
                </DialogTitle>
                <DialogContent sx={{ py: 3, textAlign: 'center' }}>
                    <LinearProgress />
                </DialogContent>
            </Dialog>
        );
    }

    const cfg = STATUS_CONFIG[activeDoc.status] || { color: 'default', Icon: FileText, label: activeDoc.status };
    const { Icon: StatusIcon } = cfg;

    const isProcessing = ['CLASSIFYING', 'EXTRACTING'].includes(activeDoc.status);
    const isExtracting = activeDoc.status === 'EXTRACTING';
    const kqsPct       = activeDoc.kqsScore != null ? Math.round(activeDoc.kqsScore * 100) : null;
    const marc         = activeDoc.marcData || null;

    const classificationNeedsAttention = activeDoc.status === 'NEEDS_REVIEW'
        || (activeDoc.classificationConfidence != null && activeDoc.classificationConfidence < 0.7);

    /* ── render ───────────────────────────────────────────────────────── */

    return (
        <>
        <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth
            PaperProps={{ sx: { borderRadius: 2, maxHeight: '95vh', height: activeTab === 'graph' ? '95vh' : undefined, display: 'flex', flexDirection: 'column' } }}>

            {/* ── Header ── */}
            <DialogTitle sx={{ pb: 0 }}>
                <Stack spacing={0.75}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                        <Stack direction="row" spacing={1} alignItems="flex-start" flex={1} minWidth={0}>
                            <FileText size={20} style={{ opacity: 0.6, flexShrink: 0, marginTop: 2 }} />
                            <Box minWidth={0}>
                                <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.3, wordBreak: 'break-word' }}>
                                    {activeDoc.documentTitle || activeDoc.originalname}
                                </Typography>
                                {activeDoc.documentTitle && activeDoc.originalname !== activeDoc.documentTitle && (
                                    <Typography variant="caption" color="text.secondary"
                                        sx={{ fontFamily: 'monospace', fontSize: '0.7rem', display: 'block' }}>
                                        {activeDoc.originalname}
                                    </Typography>
                                )}
                            </Box>
                        </Stack>
                        <Stack direction="row" spacing={0.25} flexShrink={0}>
                            <Tooltip title="Copy direct link">
                                <IconButton size="small" onClick={copyLink}><Link2 size={15} /></IconButton>
                            </Tooltip>
                            <IconButton size="small" onClick={onClose}><X size={16} /></IconButton>
                        </Stack>
                    </Stack>

                    {/* Key chips */}
                    <Stack direction="row" spacing={0.75} flexWrap="wrap" alignItems="center">
                        <Chip icon={<StatusIcon size={13} />} label={cfg.label}
                            color={cfg.color} size="small" variant="outlined" />
                        {activeDoc.unSymbol && (
                            <Chip icon={<Hash size={12} />} label={activeDoc.unSymbol} size="small"
                                variant="outlined" sx={{ fontFamily: 'monospace', fontWeight: 600 }} />
                        )}
                        {activeDoc.epistemicLayer && (
                            <Chip label={activeDoc.epistemicLayer} size="small"
                                sx={{ bgcolor: LAYER_COLORS[activeDoc.epistemicLayer] || 'grey.500', color: '#fff', fontWeight: 700, fontSize: '0.7rem' }} />
                        )}
                        {activeDoc.namespace && (
                            <Chip label={activeDoc.namespace} size="small" variant="outlined" sx={{ fontSize: '0.7rem' }} />
                        )}
                        {activeDoc.classificationOverridden && (
                            <Chip icon={<AlertCircle size={11} />} label="overridden" size="small"
                                color="warning" variant="outlined" sx={{ fontSize: '0.65rem' }} />
                        )}
                    </Stack>
                </Stack>
            </DialogTitle>

            {/* ── Tab bar ── */}
            <Box sx={{ px: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                    value={activeTab}
                    onChange={(_, v) => setActiveTab(v)}
                    sx={{ minHeight: 38 }}
                    TabIndicatorProps={{ style: { height: 2 } }}
                >
                    <Tab value="overview" iconPosition="start" icon={<FileText size={13} />}
                        label="Overview"
                        sx={{ minHeight: 38, fontSize: '0.8rem', textTransform: 'none', py: 0.5 }} />
                    <Tab value="classification" iconPosition="start" icon={<ShieldCheck size={13} />}
                        label={<TabLabel label="Classification" warn={classificationNeedsAttention} />}
                        sx={{ minHeight: 38, fontSize: '0.8rem', textTransform: 'none', py: 0.5 }} />
                    <Tab value="knowledge" iconPosition="start" icon={<Network size={13} />}
                        label="Knowledge"
                        sx={{ minHeight: 38, fontSize: '0.8rem', textTransform: 'none', py: 0.5 }} />
                    <Tab value="graph" iconPosition="start" icon={<Zap size={13} />}
                        label="Graph"
                        sx={{ minHeight: 38, fontSize: '0.8rem', textTransform: 'none', py: 0.5 }} />
                    {marc && (
                        <Tab value="marc21" iconPosition="start" icon={<DatabaseZap size={13} />}
                            label="MARC21"
                            sx={{ minHeight: 38, fontSize: '0.8rem', textTransform: 'none', py: 0.5 }} />
                    )}
                </Tabs>
            </Box>

            {/* ── Tab content ── */}
            <DialogContent sx={{
                flex: 1,
                overflowY: activeTab === 'graph' ? 'hidden' : 'auto',
                display: 'flex',
                flexDirection: 'column',
                py: 2,
            }}>

                {/* ── OVERVIEW TAB ── */}
                {activeTab === 'overview' && (
                    <Grid container spacing={2}>

                        {/* Column 1 — Identity + Source */}
                        <Grid item xs={12} md={6}>
                            <Stack spacing={2}>

                                <CardSection title="Document Identity" icon={Tag}>
                                    <Field label="Document Title">
                                        <TextValue v={activeDoc.documentTitle} />
                                    </Field>
                                    <Field label="UN Symbol">
                                        <TextValue v={activeDoc.unSymbol} mono />
                                    </Field>
                                    <Field label="Published Date">
                                        <TextValue v={activeDoc.publishedDate ? fmtDate(activeDoc.publishedDate, { dateStyle: 'medium' }) : null} />
                                    </Field>
                                    <Field label="Namespace">
                                        {activeDoc.namespace ? (
                                            <Chip label={activeDoc.namespace} size="small" variant="outlined"
                                                sx={{ fontSize: '0.7rem', height: 20, width: 'fit-content' }} />
                                        ) : <TextValue />}
                                    </Field>
                                    <Field label="Filename">
                                        <Tooltip title={activeDoc.filename || activeDoc.originalname}>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.72rem',
                                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {activeDoc.originalname || '—'}
                                            </Typography>
                                        </Tooltip>
                                    </Field>
                                </CardSection>

                                <CardSection title="Source" icon={Globe}>
                                    <Field label="Repository">
                                        {activeDoc.sourceRepository ? (
                                            <Chip label={activeDoc.sourceRepository} size="small"
                                                sx={{ bgcolor: REPO_COLORS[activeDoc.sourceRepository] || '#6b7280',
                                                     color: '#fff', fontWeight: 700, fontSize: '0.68rem', height: 20, width: 'fit-content' }} />
                                        ) : <TextValue />}
                                    </Field>
                                    {activeDoc.sourceUrl ? (
                                        <Field label="Source URL">
                                            <Stack direction="row" spacing={0.5} alignItems="flex-start">
                                                <Typography variant="caption" color="primary.light"
                                                    sx={{ fontFamily: 'monospace', fontSize: '0.62rem',
                                                         wordBreak: 'break-all', lineHeight: 1.6, flex: 1 }}>
                                                    {activeDoc.sourceUrl}
                                                </Typography>
                                                <IconButton size="small" component="a" href={activeDoc.sourceUrl}
                                                    target="_blank" rel="noopener" sx={{ p: 0.2, flexShrink: 0 }}>
                                                    <ExternalLink size={11} />
                                                </IconButton>
                                            </Stack>
                                        </Field>
                                    ) : <TextValue />}
                                </CardSection>

                            </Stack>
                        </Grid>

                        {/* Column 2 — Processing + KQS + Doc ID */}
                        <Grid item xs={12} md={6}>
                            <Stack spacing={2}>

                                <CardSection title="Processing" icon={Layers}>
                                    <Field label="Status">
                                        <Chip icon={<StatusIcon size={13} />} label={cfg.label}
                                            color={cfg.color} size="small" variant="outlined"
                                            sx={{ fontSize: '0.7rem', height: 22, width: 'fit-content' }} />
                                    </Field>
                                    <Field label="Uploaded">
                                        <TextValue v={fmtDate(activeDoc.uploadedAt)} />
                                    </Field>
                                    <Field label="Last Updated">
                                        <TextValue v={fmtDate(activeDoc.updatedAt)} />
                                    </Field>
                                    <Field label="File Size">
                                        <TextValue v={formatBytes(activeDoc.fileSize)} />
                                    </Field>
                                </CardSection>

                                {kqsPct != null && (
                                    <CardSection title="Knowledge Quality Score" icon={BarChart2}>
                                        <Field label={`KQS — ${kqsPct}%`}>
                                            <LinearProgress variant="determinate" value={kqsPct}
                                                color={kqsPct >= 70 ? 'success' : kqsPct >= 40 ? 'warning' : 'error'}
                                                sx={{ height: 8, borderRadius: 4, mt: 0.25 }} />
                                        </Field>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
                                            Reflects knowledge triangle completeness and extraction quality.
                                        </Typography>
                                    </CardSection>
                                )}

                                <CardSection title="Document ID" icon={BookOpen}>
                                    <Field label="Internal ID">
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontSize: '0.65rem',
                                            color: 'text.secondary', wordBreak: 'break-all' }}>
                                            {activeDoc.id}
                                        </Typography>
                                    </Field>
                                </CardSection>

                            </Stack>
                        </Grid>
                    </Grid>
                )}

                {/* ── CLASSIFICATION TAB ── */}
                {activeTab === 'classification' && (
                    <Box sx={{ maxWidth: 680, mx: 'auto' }}>
                        <ClassificationReview
                            variant="inline"
                            document={activeDoc}
                            documentTypes={docTypes}
                            selectedModel={extractionModel}
                            onExtract={(doc, opts) => { onExtract?.(doc, opts); onClose(); }}
                            onForceExtract={(doc, opts) => { onForceExtract?.(doc, opts); onClose(); }}
                            onOverride={() => {}}
                        />
                    </Box>
                )}

                {/* ── KNOWLEDGE TAB ── */}
                {activeTab === 'knowledge' && (
                    <Stack spacing={2}>

                        {/* Document Structure */}
                        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1 }}>
                                <AlignLeft size={14} style={{ opacity: 0.6 }} />
                                <Typography variant="caption" fontWeight={700} color="text.secondary"
                                    sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>
                                    Document Structure
                                </Typography>
                                {activeDoc.documentStructure && (
                                    <Chip label={activeDoc.documentStructure.format || 'unknown'} size="small"
                                        variant="outlined" sx={{ ml: 'auto !important', fontSize: '0.6rem', height: 18 }} />
                                )}
                            </Stack>

                            {!activeDoc.documentStructure ? (
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.72rem' }}>
                                    Structure not yet analysed. Use "Analyse Structure" below.
                                </Typography>
                            ) : (
                                <>
                                    <Stack direction="row" spacing={3} sx={{ mb: 1 }}>
                                        <Box>
                                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Segments</Typography>
                                            <Typography variant="body2" fontWeight={600}>{activeDoc.documentStructure.stats?.totalSegments ?? '—'}</Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Important</Typography>
                                            <Typography variant="body2" fontWeight={600} color="success.main">
                                                {activeDoc.documentStructure.stats?.importantSegments ?? '—'}
                                            </Typography>
                                        </Box>
                                        <Box>
                                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Words</Typography>
                                            <Typography variant="body2" fontWeight={600}>
                                                {activeDoc.documentStructure.stats?.totalWords
                                                    ? activeDoc.documentStructure.stats.totalWords.toLocaleString()
                                                    : '—'}
                                            </Typography>
                                        </Box>
                                        {activeDoc.structureAnalyzedAt && (
                                            <Box sx={{ ml: 'auto !important' }}>
                                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Analysed</Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: '0.7rem' }}>
                                                    {fmtDate(activeDoc.structureAnalyzedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                                                </Typography>
                                            </Box>
                                        )}
                                    </Stack>

                                    {/* Segment type breakdown */}
                                    {activeDoc.documentStructure.segments?.length > 0 && (() => {
                                        const types = {};
                                        activeDoc.documentStructure.segments.forEach(s => {
                                            types[s.type] = (types[s.type] || 0) + 1;
                                        });
                                        return (
                                            <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                                {Object.entries(types).map(([type, count]) => (
                                                    <Chip key={type} size="small"
                                                        label={`${STRUCTURE_TYPE_LABELS[type] || type} (${count})`}
                                                        variant={['operative', 'executive_summary'].includes(type) ? 'filled' : 'outlined'}
                                                        sx={{ fontSize: '0.6rem', height: 18,
                                                            ...(type === 'operative' ? { bgcolor: '#15803d', color: '#fff' } : {}),
                                                        }} />
                                                ))}
                                            </Stack>
                                        );
                                    })()}
                                </>
                            )}
                        </Paper>

                        {/* Extracted Entities */}
                        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.25 }}>
                                <Network size={14} style={{ opacity: 0.6 }} />
                                <Typography variant="caption" fontWeight={700} color="text.secondary"
                                    sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>
                                    Extracted Entities
                                    {entities?.length > 0 && ` (${entities.length})`}
                                </Typography>
                                {entitiesLoading && <CircularProgress size={12} sx={{ ml: 1 }} />}
                                {!entitiesLoading && !entities && (
                                    <Button size="small" variant="text" sx={{ ml: 'auto !important', fontSize: '0.68rem', py: 0 }}
                                        onClick={handleLoadEntities}>
                                        Load
                                    </Button>
                                )}
                                {!entitiesLoading && entities && (
                                    <>
                                        <Tooltip title="Refresh entity list">
                                            <IconButton size="small" sx={{ ml: 'auto !important', p: 0.25 }} onClick={handleLoadEntities}>
                                                <RefreshCw size={11} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Push all entities to Entity Store">
                                            <IconButton size="small" sx={{ p: 0.25, color: 'primary.main' }} onClick={handleOpenPush}>
                                                <Archive size={13} />
                                            </IconButton>
                                        </Tooltip>
                                    </>
                                )}
                            </Stack>

                            {entities && entities.length === 0 && (
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.72rem' }}>
                                    No entities extracted yet. Run extraction to populate the knowledge graph.
                                </Typography>
                            )}

                            {entities && entities.length > 0 && (() => {
                                const esCount = entities.filter(e => e.esEntityId).length;
                                return (
                                    <>
                                        {esCount > 0 && (
                                            <Typography variant="caption" color="text.disabled"
                                                sx={{ fontSize: '0.62rem', display: 'block', mb: 0.75 }}>
                                                <Box component="span" sx={{ color: 'primary.light', textDecoration: 'underline' }}>underlined</Box>
                                                {' = '}in Entity Store ({esCount}/{entities.length})
                                            </Typography>
                                        )}
                                        <Stack spacing={1}>
                                        {Object.entries(groupByType(entities)).map(([type, list]) => (
                                        <Box key={type}>
                                            <Typography variant="caption" color="text.disabled"
                                                sx={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', mb: 0.4 }}>
                                                {type} ({list.length})
                                            </Typography>
                                            <Stack direction="row" spacing={0.4} flexWrap="wrap">
                                                {list.map(e => (
                                                    <Chip key={e.id} label={e.name} size="small"
                                                        variant={e.isExisting ? 'filled' : 'outlined'}
                                                        sx={{
                                                            textDecoration: e.esEntityId ? 'underline' : 'none',
                                                            fontSize: '0.62rem', height: 20,
                                                            bgcolor: e.isExisting ? (ENTITY_TYPE_COLORS[e.type] || '#6b7280') : undefined,
                                                            color:   e.isExisting ? '#fff' : undefined,
                                                            borderColor: ENTITY_TYPE_COLORS[e.type] || undefined,
                                                        }} />
                                                ))}
                                            </Stack>
                                        </Box>
                                    ))}
                                </Stack>
                                    </>
                                );
                            })()}
                        </Paper>

                    </Stack>
                )}

                {/* ── GRAPH TAB ── */}
                {activeTab === 'graph' && (
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                        <DocumentGraphTab doc={activeDoc} />
                    </Box>
                )}

                {/* ── MARC21 TAB ── */}
                {activeTab === 'marc21' && marc && (
                    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 1 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 1.25 }}>
                            <DatabaseZap size={14} style={{ opacity: 0.6 }} />
                            <Typography variant="caption" fontWeight={700} color="text.secondary"
                                sx={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: '0.65rem' }}>
                                MARC21 Metadata
                            </Typography>
                            {activeDoc.metaRefreshedAt && (
                                <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.6rem', ml: 'auto !important' }}>
                                    refreshed {fmtDate(activeDoc.metaRefreshedAt)}
                                </Typography>
                            )}
                        </Stack>
                        <Grid container spacing={1.5}>
                            {marc.fullTitle && (
                                <Grid item xs={12}>
                                    <Stack spacing={0.2}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Full Title</Typography>
                                        <Typography variant="body2" sx={{ lineHeight: 1.5 }}>{marc.fullTitle}</Typography>
                                    </Stack>
                                </Grid>
                            )}
                            {(marc.pubPlace || marc.publisher || marc.pubDate) && (
                                <Grid item xs={12} sm={6}>
                                    <Stack spacing={0.2}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Published</Typography>
                                        <Typography variant="body2">{[marc.pubPlace, marc.publisher, marc.pubDate].filter(Boolean).join(' — ')}</Typography>
                                    </Stack>
                                </Grid>
                            )}
                            {(marc.seriesSymbol || marc.sessionNumber) && (
                                <Grid item xs={12} sm={6}>
                                    <Stack spacing={0.2}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Series / Session</Typography>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                            {[marc.seriesSymbol, marc.sessionNumber && `Session ${marc.sessionNumber}`].filter(Boolean).join(' — ')}
                                        </Typography>
                                    </Stack>
                                </Grid>
                            )}
                            {marc.bodyName && (
                                <Grid item xs={12} sm={6}>
                                    <Stack spacing={0.2}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Issuing Body</Typography>
                                        <Typography variant="body2" fontWeight={600}>{marc.bodyName}</Typography>
                                    </Stack>
                                </Grid>
                            )}
                            {marc.votingRecord && (
                                <Grid item xs={12} sm={6}>
                                    <Stack spacing={0.2}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Voting Record</Typography>
                                        <Typography variant="body2">{marc.votingRecord}</Typography>
                                    </Stack>
                                </Grid>
                            )}
                            {marc.subjects?.length > 0 && (
                                <Grid item xs={12} sm={6}>
                                    <Stack spacing={0.4}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Subjects</Typography>
                                        <Stack direction="row" spacing={0.4} flexWrap="wrap">
                                            {marc.subjects.map((s, i) => (
                                                <Chip key={i} label={s} size="small"
                                                    sx={{ fontSize: '0.6rem', height: 18, bgcolor: '#1d4ed8', color: '#fff' }} />
                                            ))}
                                        </Stack>
                                    </Stack>
                                </Grid>
                            )}
                            {marc.corpSubjects?.length > 0 && (
                                <Grid item xs={12} sm={6}>
                                    <Stack spacing={0.4}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Corporate Subjects</Typography>
                                        <Stack direction="row" spacing={0.4} flexWrap="wrap">
                                            {marc.corpSubjects.map((s, i) => (
                                                <Chip key={i} label={s} size="small"
                                                    sx={{ fontSize: '0.6rem', height: 18, bgcolor: '#0f766e', color: '#fff' }} />
                                            ))}
                                        </Stack>
                                    </Stack>
                                </Grid>
                            )}
                            {marc.agendaItems?.filter(a => a.situation).length > 0 && (
                                <Grid item xs={12}>
                                    <Stack spacing={0.4}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Agenda Items</Typography>
                                        <Stack spacing={0.4}>
                                            {marc.agendaItems.map((a, i) => (
                                                <Stack key={i} direction="row" spacing={0.75} alignItems="center">
                                                    {a.symbol && <Chip label={a.symbol} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.62rem', flexShrink: 0 }} />}
                                                    {a.situation && <Typography variant="caption" color="text.secondary">{a.situation}</Typography>}
                                                </Stack>
                                            ))}
                                        </Stack>
                                    </Stack>
                                </Grid>
                            )}
                            {(marc.draftDoc || marc.verbatimRecord) && (
                                <Grid item xs={12}>
                                    <Stack spacing={0.4}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Related Documents</Typography>
                                        <Stack direction="row" spacing={1} flexWrap="wrap">
                                            {marc.draftDoc && (
                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                    <Typography variant="caption" color="text.disabled">Draft:</Typography>
                                                    <Chip label={marc.draftDoc} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }} />
                                                </Stack>
                                            )}
                                            {marc.verbatimRecord && (
                                                <Stack direction="row" spacing={0.5} alignItems="center">
                                                    <Typography variant="caption" color="text.disabled">Verbatim:</Typography>
                                                    <Chip label={marc.verbatimRecord} size="small" variant="outlined" sx={{ fontFamily: 'monospace', fontSize: '0.65rem' }} />
                                                </Stack>
                                            )}
                                        </Stack>
                                    </Stack>
                                </Grid>
                            )}
                            {marc.langCodes?.length > 0 && (
                                <Grid item xs={12} sm={6}>
                                    <Stack spacing={0.4}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>Languages</Typography>
                                        <Stack direction="row" spacing={0.4} flexWrap="wrap">
                                            {marc.langCodes.map((c, i) => (
                                                <Chip key={i} label={LANG_LABELS[c] || c} size="small"
                                                    sx={{ fontSize: '0.6rem', height: 18,
                                                         bgcolor: c === 'eng' ? 'primary.main' : 'action.selected',
                                                         color:   c === 'eng' ? 'primary.contrastText' : 'text.primary' }} />
                                            ))}
                                        </Stack>
                                    </Stack>
                                </Grid>
                            )}
                            {marc.files?.length > 0 && (
                                <Grid item xs={12}>
                                    <Stack spacing={0.4}>
                                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem', textTransform: 'uppercase' }}>
                                            File Versions ({marc.files.length})
                                        </Typography>
                                        <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                            {marc.files.map((f, i) => (
                                                <Chip key={i} label={f.lang || f.name || `File ${i + 1}`} size="small"
                                                    component="a" href={f.url} target="_blank" rel="noopener" clickable
                                                    icon={<ExternalLink size={10} />}
                                                    sx={{ fontSize: '0.6rem', height: 18 }} />
                                            ))}
                                        </Stack>
                                    </Stack>
                                </Grid>
                            )}
                        </Grid>
                    </Paper>
                )}

            </DialogContent>

            <Divider />

            {/* ── Feedback alerts ── */}
            {refetchStatus === 'success' && (
                <Box sx={{ px: 2.5, pt: 1 }}>
                    <Alert severity="success" sx={{ py: 0.25, fontSize: '0.78rem' }}>
                        Metadata refreshed — UN Symbol, Title, Date and full MARC21 data updated.
                    </Alert>
                </Box>
            )}
            {refetchStatus === 'error' && (
                <Box sx={{ px: 2.5, pt: 1 }}>
                    <Alert severity="error" sx={{ py: 0.25, fontSize: '0.78rem' }}>
                        {refetchError ?? 'Failed to fetch metadata from source.'}
                    </Alert>
                </Box>
            )}
            {structureStatus === 'success' && (
                <Box sx={{ px: 2.5, pt: 1 }}>
                    <Alert severity="success" sx={{ py: 0.25, fontSize: '0.78rem' }}>
                        Structure analysed — {activeDoc.documentStructure?.stats?.totalSegments} segments,{' '}
                        {activeDoc.documentStructure?.stats?.importantSegments} important.
                    </Alert>
                </Box>
            )}

            {/* ── Global actions ── */}
            <DialogActions sx={{ px: 2.5, py: 1.5, gap: 1, flexWrap: 'wrap' }}>

                {isExtracting && (
                    <Chip icon={<Clock size={13} />} label="Extraction in progress…" size="small" color="info" />
                )}

                <Box flex={1} />

                <Tooltip title={activeDoc.documentStructure
                    ? `Re-analyse document structure (${activeDoc.documentStructure.stats?.totalSegments} segments found)`
                    : 'Analyse document structure for selective extraction mode'}>
                    <span>
                        <Button variant="outlined" size="small"
                            disabled={structureAnalyzing}
                            color={structureStatus === 'success' ? 'success' : 'primary'}
                            startIcon={structureAnalyzing ? <CircularProgress size={13} /> : <AlignLeft size={14} />}
                            onClick={handleAnalyzeStructure}>
                            {structureAnalyzing
                                ? 'Analysing…'
                                : activeDoc.documentStructure ? 'Re-analyse Structure' : 'Analyse Structure'}
                        </Button>
                    </span>
                </Tooltip>

                <Tooltip title={activeDoc.sourceUrl
                    ? 'Re-fetch MARC21 metadata from source URL and save to card'
                    : 'No source URL — cannot fetch metadata'}>
                    <span>
                        <Button variant="outlined" size="small"
                            disabled={refetching || !activeDoc.sourceUrl}
                            color={refetchStatus === 'success' ? 'success' : 'primary'}
                            startIcon={refetching
                                ? <CircularProgress size={13} />
                                : refetchStatus === 'success'
                                    ? <CheckCircle size={14} />
                                    : <RefreshCw size={14} />}
                            onClick={handleRefetchMetadata}>
                            {refetching ? 'Fetching…' : refetchStatus === 'success' ? 'Refreshed' : 'Refresh Metadata'}
                        </Button>
                    </span>
                </Tooltip>

                <Tooltip title="Copy direct link to this document card">
                    <Button variant="outlined" size="small" startIcon={<Link2 size={13} />} onClick={copyLink}>
                        Copy link
                    </Button>
                </Tooltip>

                <Button size="small" onClick={onClose}>Close</Button>
            </DialogActions>
        </Dialog>

        {/* ── Push to Entity Store dialog (conditionally mounted) ── */}
        {pushDialogOpen && <Dialog open={true} onClose={() => setPushDialogOpen(false)}
            maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2 } }}>
            <DialogTitle>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Archive size={17} />
                        <Typography variant="subtitle1" fontWeight={700}>Push to Entity Store</Typography>
                    </Stack>
                    <IconButton size="small" onClick={() => setPushDialogOpen(false)}><X size={16} /></IconButton>
                </Stack>
            </DialogTitle>
            <DialogContent sx={{ pt: 2 }}>
                <Stack spacing={2}>
                    {pushResult && (
                        pushResult.success ? (
                            <Alert severity="success" sx={{ py: 0.25, fontSize: '0.78rem' }}>
                                Pushed: {pushResult.created} new · {pushResult.linked} linked · {pushResult.skipped} skipped
                            </Alert>
                        ) : (
                            <Alert severity="error" sx={{ py: 0.25, fontSize: '0.78rem' }}>
                                {pushResult.error}
                            </Alert>
                        )
                    )}
                    {!pushResult && (
                        <>
                            <Typography variant="body2" color="text.secondary">
                                All extracted entities from this document will be imported into the Entity Store.
                                Entities already in ES will be linked (not duplicated).
                            </Typography>
                            <Autocomplete freeSolo options={Array.isArray(esNamespaces) ? esNamespaces : []}
                                value={pushNamespace}
                                onInputChange={(_, v) => setPushNamespace(v)}
                                renderInput={p => <TextField {...p} label="Target namespace" size="small" />}
                            />
                        </>
                    )}
                </Stack>
            </DialogContent>
            <DialogActions sx={{ px: 2, py: 1.5 }}>
                <Button onClick={() => setPushDialogOpen(false)} size="small">
                    {pushResult ? 'Close' : 'Cancel'}
                </Button>
                {!pushResult && (
                    <Button variant="contained" size="small" onClick={handlePushToES} disabled={pushing}
                        startIcon={pushing ? <CircularProgress size={13} /> : <Archive size={14} />}>
                        {pushing ? 'Pushing…' : 'Push to ES'}
                    </Button>
                )}
            </DialogActions>
        </Dialog>}
        </>
    );
}
