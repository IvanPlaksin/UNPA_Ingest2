/**
 * DocumentProcessingPage  /documents
 *
 * End-to-end UN document lifecycle UI:
 *   1. Upload zone (drag-and-drop)
 *   2. Document list with status, filters, sorting
 *   3. Classification review side-panel
 *   4. Extraction progress dialog (live pipeline steps)
 *   5. Extraction results dialog (Summary / Entities / Relations / Triangle tabs)
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header: title + namespace selector + stats chips             │
 *   ├──────────────┬───────────────────────────────────────────────┤
 *   │ Upload zone  │ Document list (table + filters)               │
 *   │ (left col)   │ (right, main area)                            │
 *   └──────────────┴───────────────────────────────────────────────┘
 *   ClassificationReview — right-side drawer (classification)
 *   ExtractionDialog      — centered dialog (progress → results)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Box, Typography, Stack, Chip, Divider, FormControl,
    InputLabel, Select, MenuItem, Alert, Paper,
    Dialog, DialogTitle, DialogContent, IconButton
} from '@mui/material';
import { FileText, CheckCircle, AlertCircle, Clock, XCircle, X } from 'lucide-react';

import DocumentUpload from '../components/Documents/DocumentUpload';
import DocumentList from '../components/Documents/DocumentList';
import ClassificationReview from '../components/Documents/ClassificationReview';
import ExtractionProgress from '../components/Documents/ExtractionProgress';
import ExtractionResults from '../components/Documents/ExtractionResults';
import {
    listDocuments, getDocumentStats, listDocumentTypes,
    classifyDocument, extractDocument, getExtractionModels
} from '../services/documentProcessing.service';

const NAMESPACES = ['', 'DEFAULT', 'INEED', 'KM', 'HR', 'FINANCE', 'PROCUREMENT', 'LEGAL', 'IT', 'AUDIT'];

const STATS_CONFIG = [
    { key: 'CLASSIFIED',   label: 'Classified',    color: 'success', Icon: CheckCircle },
    { key: 'NEEDS_REVIEW', label: 'Needs Review',  color: 'warning', Icon: AlertCircle },
    { key: 'EXTRACTING',   label: 'Extracting',    color: 'info',    Icon: Clock },
    { key: 'COMPLETED',    label: 'Completed',      color: 'success', Icon: CheckCircle },
    { key: 'FAILED',       label: 'Failed',         color: 'error',   Icon: XCircle },
];

// Extraction dialog state: { open, documentId, documentName, mode: 'progress'|'results' }
const EXTR_CLOSED = { open: false, documentId: null, documentName: '', mode: 'progress' };

export default function DocumentProcessingPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [namespace,        setNamespace]        = useState(searchParams.get('namespace') || '');
    const [documents,        setDocuments]        = useState([]);
    const [loading,          setLoading]          = useState(false);
    const [stats,            setStats]            = useState(null);
    const [docTypes,         setDocTypes]         = useState([]);
    const [reviewDoc,        setReviewDoc]        = useState(null);
    const [reviewOpen,       setReviewOpen]       = useState(false);
    const [notification,     setNotification]     = useState(null);
    const [extrDialog,       setExtrDialog]       = useState(EXTR_CLOSED);
    const [extractionModel,  setExtractionModel]  = useState('claude-code');
    const [availableModels,  setAvailableModels]  = useState([
        { id: 'claude-code',              displayName: 'Claude Code',        tier: 'recommended', isDefault: true },
        { id: 'claude-sonnet-4-6',        displayName: 'Claude Sonnet 4.6',  tier: 'sonnet' },
        { id: 'claude-opus-4-7',          displayName: 'Claude Opus 4.7',    tier: 'premium' },
        { id: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', tier: 'fast' },
        { id: 'regex',                    displayName: 'Pattern Matching',   tier: 'offline' },
    ]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [docsResp, statsResp] = await Promise.all([
                listDocuments({ namespace: namespace || null, limit: 200 }),
                getDocumentStats(namespace || null)
            ]);
            setDocuments(docsResp.data || []);
            setStats(statsResp);
        } catch (e) {
            setNotification({ type: 'error', msg: 'Failed to load documents: ' + (e.response?.data?.error || e.message) });
        }
        setLoading(false);
    }, [namespace]);

    // Load document types + extraction models once on mount
    useEffect(() => {
        listDocumentTypes().then(setDocTypes).catch(() => {});
        getExtractionModels()
            .then(setAvailableModels)
            .catch(() => {});
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Poll while any document is in a transient state
    useEffect(() => {
        const transient = documents.filter(d => ['UPLOADED', 'CLASSIFYING', 'EXTRACTING'].includes(d.status));
        if (!transient.length) return;
        const timer = setInterval(loadData, 3000);
        return () => clearInterval(timer);
    }, [documents, loadData]);

    function notify(type, msg) {
        setNotification({ type, msg });
        setTimeout(() => setNotification(null), 5000);
    }

    function handleUploadComplete(doc) {
        notify('success', `Uploaded "${doc.filename}" — classification in progress`);
        loadData();
    }

    function handleReview(doc) {
        setReviewDoc(doc);
        setReviewOpen(true);
    }

    async function handleExtract(doc, modelOverride) {
        const model = modelOverride || extractionModel;
        try {
            await extractDocument(doc.id, { model });
            notify('info', `Extraction started for "${doc.originalname}"`);
            loadData();
            setExtrDialog({ open: true, documentId: doc.id, documentName: doc.originalname, mode: 'progress' });
        } catch (e) {
            notify('error', e.response?.data?.error || e.message);
        }
    }

    async function handleForceExtract(doc) {
        try {
            await extractDocument(doc.id, { model: extractionModel, force: true });
            notify('info', `Re-extraction started for "${doc.originalname}"`);
            loadData();
            // Switch to progress mode (keeps dialog open if already showing results)
            setExtrDialog(prev =>
                prev.open && prev.documentId === doc.id
                    ? { ...prev, mode: 'progress' }
                    : { open: true, documentId: doc.id, documentName: doc.originalname, mode: 'progress' }
            );
        } catch (e) {
            notify('error', e.response?.data?.error || e.message);
        }
    }

    function handleExtractionComplete(summary) {
        // Switch from progress → results view without closing the dialog
        setExtrDialog(prev => ({ ...prev, mode: 'results' }));
        notify('success', 'Extraction completed successfully');
        loadData();
    }

    function handleViewTriangle(documentId) {
        setExtrDialog(EXTR_CLOSED);
        navigate('/knowledge-triangle', { state: { highlightDocumentId: documentId } });
    }

    async function handleReclassify(doc) {
        try {
            await classifyDocument(doc.id);
            notify('info', `Re-classification started for "${doc.originalname}"`);
            loadData();
        } catch (e) {
            notify('error', e.response?.data?.error || e.message);
        }
    }

    const getStatCount = (key) => {
        if (!stats?.byStatus) return 0;
        const row = stats.byStatus.find(r => r.status === key);
        return row ? Number(row.count) : 0;
    };

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: 2.5, overflow: 'hidden' }}>

            {/* ── Header ── */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" spacing={1} sx={{ mb: 2 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <FileText size={22} />
                    <Typography variant="h6" fontWeight={700}>Document Processing</Typography>
                    {stats?.total != null && (
                        <Chip label={`${stats.total} total`} size="small" variant="outlined" />
                    )}
                </Stack>

                <Stack direction="row" spacing={1} alignItems="center">
                    {STATS_CONFIG.map(({ key, label, color, Icon }) => {
                        const count = getStatCount(key);
                        if (!count) return null;
                        return (
                            <Chip
                                key={key}
                                icon={<Icon size={13} />}
                                label={`${count} ${label}`}
                                color={color}
                                size="small"
                                variant="outlined"
                            />
                        );
                    })}
                    <Divider orientation="vertical" flexItem />
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel>Extraction Model</InputLabel>
                        <Select value={extractionModel} label="Extraction Model" onChange={e => setExtractionModel(e.target.value)}>
                            {availableModels.map(m => (
                                <MenuItem key={m.id} value={m.id}>
                                    <Stack direction="row" spacing={0.75} alignItems="center">
                                        <Typography variant="body2">{m.displayName}</Typography>
                                        {m.isDefault && (
                                            <Chip label="default" size="small"
                                                sx={{ height: 16, fontSize: '0.6rem',
                                                    bgcolor: '#2563eb',
                                                    color: '#fff' }} />
                                        )}
                                    </Stack>
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel>Namespace</InputLabel>
                        <Select value={namespace} label="Namespace" onChange={e => setNamespace(e.target.value)}>
                            {NAMESPACES.map(ns => <MenuItem key={ns} value={ns}>{ns || 'All namespaces'}</MenuItem>)}
                        </Select>
                    </FormControl>
                </Stack>
            </Stack>

            {/* ── Notification ── */}
            {notification && (
                <Alert
                    severity={notification.type}
                    onClose={() => setNotification(null)}
                    sx={{ mb: 1.5 }}
                >
                    {notification.msg}
                </Alert>
            )}

            {/* ── Main content ── */}
            <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', gap: 2 }}>

                {/* Left: Upload zone */}
                <Box sx={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Upload Documents</Typography>
                        <DocumentUpload
                            namespace={namespace}
                            onUploadComplete={handleUploadComplete}
                            onError={e => notify('error', e.response?.data?.error || e.message)}
                        />
                    </Paper>

                    {/* Quick guide */}
                    <Paper variant="outlined" sx={{ p: 2 }}>
                        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Processing Flow</Typography>
                        {[
                            { step: '1', label: 'Upload', desc: 'File stored, auto-classify starts' },
                            { step: '2', label: 'Classify', desc: 'UN type + L0-L5 layer detected' },
                            { step: '3', label: 'Review', desc: 'Override if confidence < 70%' },
                            { step: '4', label: 'Extract', desc: 'Knowledge triangle built in Memgraph' },
                        ].map(({ step, label, desc }) => (
                            <Stack key={step} direction="row" spacing={1} sx={{ mb: 1 }} alignItems="flex-start">
                                <Chip label={step} size="small" sx={{ minWidth: 24, height: 20, fontSize: '0.7rem' }} />
                                <Box>
                                    <Typography variant="caption" fontWeight={700}>{label}</Typography>
                                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{desc}</Typography>
                                </Box>
                            </Stack>
                        ))}
                    </Paper>
                </Box>

                {/* Right: Document list */}
                <Paper variant="outlined" sx={{ flex: 1, p: 2, overflow: 'auto' }}>
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>
                        Documents{namespace ? ` — ${namespace}` : ' — All namespaces'}
                    </Typography>
                    <DocumentList
                        documents={documents}
                        loading={loading}
                        onReview={handleReview}
                        onExtract={handleExtract}
                        onForceExtract={handleForceExtract}
                        onReclassify={handleReclassify}
                        onRefresh={loadData}
                    />
                </Paper>
            </Box>

            {/* ── Classification Review drawer ── */}
            <ClassificationReview
                open={reviewOpen}
                document={reviewDoc}
                documentTypes={docTypes}
                selectedModel={extractionModel}
                onClose={() => setReviewOpen(false)}
                onOverride={(doc) => { notify('success', 'Classification overridden'); loadData(); }}
                onExtract={(doc) => {
                    // extraction already triggered inside ClassificationReview — just show progress
                    setReviewOpen(false);
                    setExtrDialog({ open: true, documentId: doc.id, documentName: doc.originalname, mode: 'progress' });
                    loadData();
                }}
                onViewResults={(doc) => {
                    setReviewOpen(false);
                    setExtrDialog({ open: true, documentId: doc.id, documentName: doc.originalname, mode: 'results' });
                }}
                onForceExtract={(doc) => {
                    setReviewOpen(false);
                    handleForceExtract(doc);
                }}
            />

            {/* ── Extraction dialog (progress → results) ── */}
            <Dialog
                open={extrDialog.open}
                onClose={() => { setExtrDialog(EXTR_CLOSED); loadData(); }}
                maxWidth="sm"
                fullWidth
                PaperProps={{ sx: { borderRadius: 2 } }}
            >
                <DialogTitle sx={{ pb: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <FileText size={18} />
                        <Typography variant="subtitle1" fontWeight={700} noWrap sx={{ maxWidth: 380 }}>
                            {extrDialog.documentName || 'Extraction'}
                        </Typography>
                        <Chip
                            label={extrDialog.mode === 'progress' ? 'Running' : 'Complete'}
                            size="small"
                            color={extrDialog.mode === 'progress' ? 'info' : 'success'}
                        />
                    </Stack>
                    <IconButton size="small" onClick={() => { setExtrDialog(EXTR_CLOSED); loadData(); }}>
                        <X size={16} />
                    </IconButton>
                </DialogTitle>

                <DialogContent sx={{ pt: 1 }}>
                    {extrDialog.mode === 'progress' && extrDialog.documentId && (
                        <ExtractionProgress
                            documentId={extrDialog.documentId}
                            onComplete={handleExtractionComplete}
                            onClose={() => { setExtrDialog(EXTR_CLOSED); loadData(); }}
                        />
                    )}
                    {extrDialog.mode === 'results' && extrDialog.documentId && (
                        <ExtractionResults
                            documentId={extrDialog.documentId}
                            documentName={extrDialog.documentName}
                            onClose={() => { setExtrDialog(EXTR_CLOSED); loadData(); }}
                            onViewTriangle={handleViewTriangle}
                            onReExtract={(docId) => {
                                const doc = documents.find(d => d.id === docId);
                                if (doc) handleForceExtract(doc);
                                // dialog stays open — handleForceExtract switches mode to 'progress'
                            }}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
}
