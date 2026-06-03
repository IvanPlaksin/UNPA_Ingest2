/**
 * ClassificationReview
 *
 * Side-panel that shows classification result, confidence, layers,
 * alternatives, provenance. Allows override, re-classify, extract.
 *
 * Process log: every operation (classify / extract / override) is recorded
 * with timestamps, before/after stats, and full error text.
 * The log is preserved while the drawer is open for the same document.
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    Drawer, Box, Typography, Stack, Chip, Divider,
    Button, Select, MenuItem, FormControl, InputLabel,
    TextField, Alert, IconButton, LinearProgress, Tooltip,
    CircularProgress, Collapse, Paper
} from '@mui/material';
import {
    X, CheckCircle, AlertCircle, Edit2, Play,
    RotateCcw, FileText, Layers, ExternalLink,
    ChevronDown, ChevronUp, XCircle, Clock, Zap
} from 'lucide-react';
import {
    overrideClassification, extractDocument, classifyDocument, getDocumentStatus
} from '../../services/documentProcessing.service';

const LAYER_COLORS = { L0: '#7c3aed', L1: '#2563eb', L2: '#0891b2', L3: '#059669', L4: '#d97706', L5: '#9333ea' };
const DEFAULT_MODEL = 'claude-code';
const LAYER_LABELS = {
    L0: 'L0 — Constitutional / Charter',
    L1: 'L1 — Regulatory / Statutory',
    L2: 'L2 — Administrative / Policy',
    L3: 'L3 — Operational / Procedural',
    L4: 'L4 — Empirical / Audit',
    L5: 'L5 — Strategic / Informational',
};

function fmt(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function LogEntryIcon({ status }) {
    if (status === 'success') return <CheckCircle size={14} color="#22c55e" />;
    if (status === 'error')   return <XCircle size={14} color="#ef4444" />;
    if (status === 'running') return <CircularProgress size={12} />;
    if (status === 'started') return <Clock size={14} color="#2563eb" />;
    return <Clock size={14} style={{ opacity: 0.4 }} />;
}

function LogEntry({ entry }) {
    const isError = entry.status === 'error';
    return (
        <Box sx={{
            p: 1, borderRadius: 1,
            bgcolor: isError ? 'error.50' : 'action.hover',
            border: '1px solid',
            borderColor: isError ? 'error.200' : 'divider',
        }}>
            <Stack direction="row" spacing={1} alignItems="flex-start">
                <Box sx={{ pt: '2px' }}><LogEntryIcon status={entry.status} /></Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                        <Typography variant="caption" fontWeight={700} sx={{ fontSize: '0.72rem' }}>
                            {entry.label}
                        </Typography>
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                            {fmt(entry.timestamp)}
                        </Typography>
                        <Chip
                            label={entry.status}
                            size="small"
                            color={entry.status === 'success' ? 'success' : entry.status === 'error' ? 'error' : 'default'}
                            variant="outlined"
                            sx={{ height: 16, fontSize: '0.6rem' }}
                        />
                    </Stack>

                    {/* Stats row */}
                    {entry.stats && (
                        <Stack direction="row" spacing={1.5} sx={{ mt: 0.5 }} flexWrap="wrap">
                            {entry.stats.prevType != null && entry.stats.newType != null && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    Type: <b>{entry.stats.prevType || '—'}</b> → <b>{entry.stats.newType || '—'}</b>
                                </Typography>
                            )}
                            {entry.stats.prevConfidence != null && entry.stats.newConfidence != null && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    Confidence: <b>{Math.round(entry.stats.prevConfidence * 100)}%</b>
                                    {' → '}
                                    <b style={{ color: entry.stats.newConfidence >= 0.7 ? '#22c55e' : '#f59e0b' }}>
                                        {Math.round(entry.stats.newConfidence * 100)}%
                                    </b>
                                </Typography>
                            )}
                            {entry.stats.layer != null && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    Layer: <b>{entry.stats.layer}</b>
                                </Typography>
                            )}
                            {entry.stats.model != null && (
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                    Model: <b>{entry.stats.model}</b>
                                </Typography>
                            )}
                        </Stack>
                    )}

                    {/* Error message */}
                    {entry.message && (
                        <Typography variant="caption" color={isError ? 'error.main' : 'text.secondary'}
                            sx={{ display: 'block', mt: 0.5, fontSize: '0.68rem', wordBreak: 'break-word' }}>
                            {entry.message}
                        </Typography>
                    )}
                </Box>
            </Stack>
        </Box>
    );
}

export default function ClassificationReview({
    open, document: doc, documentTypes = [],
    selectedModel: selectedModelProp,
    onClose, onConfirm, onOverride, onExtract, onViewResults, onForceExtract
}) {
    const [overriding,     setOverriding]     = useState(false);
    const [overrideType,   setOverrideType]   = useState('');
    const [overrideReason, setOverrideReason] = useState('');
    const [saving,         setSaving]         = useState(false);
    const [extracting,     setExtracting]     = useState(false);
    const [localDoc,       setLocalDoc]       = useState(doc);
    const [processLog,     setProcessLog]     = useState([]);
    const [logsOpen,       setLogsOpen]       = useState(false);

    const selectedModel = selectedModelProp || DEFAULT_MODEL;
    const prevDocId = useRef(null);

    // Reset state when a new document is opened
    useEffect(() => {
        if (doc?.id !== prevDocId.current) {
            prevDocId.current = doc?.id || null;
            setLocalDoc(doc);
            setOverriding(false);
            setOverrideType('');
            setOverrideReason('');
            setProcessLog([]);
            setLogsOpen(false);
        } else {
            setLocalDoc(doc);
        }
    }, [doc]);

    // Poll while classifying / extracting
    useEffect(() => {
        if (!localDoc || !['CLASSIFYING', 'EXTRACTING'].includes(localDoc.status)) return;
        const timer = setInterval(async () => {
            try {
                const updated = await getDocumentStatus(localDoc.id);
                setLocalDoc(updated);
                if (!['CLASSIFYING', 'EXTRACTING'].includes(updated.status)) {
                    clearInterval(timer);
                    // Update the last running log entry when operation completes
                    setProcessLog(prev => {
                        const copy = [...prev];
                        const last = copy.findLastIndex(e => e.status === 'running' || e.status === 'started');
                        if (last !== -1) {
                            copy[last] = {
                                ...copy[last],
                                status: updated.status === 'FAILED' ? 'error' : 'success',
                                message: updated.status === 'FAILED' ? 'Process failed — check extraction log' : undefined,
                                stats: {
                                    ...copy[last].stats,
                                    newType:       updated.documentType,
                                    newConfidence: updated.classificationConfidence,
                                    layer:         updated.epistemicLayer,
                                },
                            };
                        }
                        return copy;
                    });
                    if (updated.status === 'FAILED') setLogsOpen(true);
                }
            } catch { clearInterval(timer); }
        }, 2000);
        return () => clearInterval(timer);
    }, [localDoc?.id, localDoc?.status]);

    if (!doc) return null;

    const confidence    = localDoc?.classificationConfidence ?? 0;
    const confidencePct = Math.round(confidence * 100);
    const isLowConf     = confidencePct < 70;
    const canExtract    = ['CLASSIFIED', 'NEEDS_REVIEW'].includes(localDoc?.status);
    const canForce      = ['FAILED', 'COMPLETED'].includes(localDoc?.status);
    const isProcessing  = ['CLASSIFYING', 'EXTRACTING'].includes(localDoc?.status);
    const alts          = localDoc?.classificationAlternatives || [];
    const layer         = localDoc?.epistemicLayer;

    function appendLog(entry) {
        const e = { id: Date.now(), timestamp: new Date().toISOString(), ...entry };
        setProcessLog(prev => [...prev, e]);
        return e.id;
    }
    function updateLog(id, updates) {
        setProcessLog(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
    }

    async function handleOverride() {
        if (!overrideType) return;
        setSaving(true);
        const id = appendLog({ label: `Override → ${overrideType}`, status: 'running',
            stats: { prevType: localDoc.documentType } });
        try {
            await overrideClassification(localDoc.id, overrideType, overrideReason);
            const updated = await getDocumentStatus(localDoc.id);
            setLocalDoc(updated);
            setOverriding(false);
            updateLog(id, { status: 'success',
                stats: { prevType: localDoc.documentType, newType: updated.documentType,
                         prevConfidence: localDoc.classificationConfidence,
                         newConfidence: updated.classificationConfidence } });
            onOverride?.(updated);
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            updateLog(id, { status: 'error', message: msg });
            setLogsOpen(true);
        }
        setSaving(false);
    }

    async function handleReclassify() {
        setSaving(true);
        const id = appendLog({ label: 'Re-classify', status: 'running',
            stats: { prevType: localDoc.documentType,
                     prevConfidence: localDoc.classificationConfidence } });
        try {
            await classifyDocument(localDoc.id);
            const updated = await getDocumentStatus(localDoc.id);
            setLocalDoc(updated);
            updateLog(id, { status: 'success',
                stats: { prevType: localDoc.documentType, newType: updated.documentType,
                         prevConfidence: localDoc.classificationConfidence,
                         newConfidence: updated.classificationConfidence,
                         layer: updated.epistemicLayer } });
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            updateLog(id, { status: 'error', message: msg });
            setLogsOpen(true);
        }
        setSaving(false);
    }

    async function handleExtract() {
        setExtracting(true);
        const id = appendLog({ label: `Extract — ${selectedModel}`, status: 'running',
            stats: { model: selectedModel } });
        try {
            await extractDocument(localDoc.id, { model: selectedModel });
            const updated = await getDocumentStatus(localDoc.id);
            setLocalDoc(updated);
            updateLog(id, { status: 'started', message: 'Extraction pipeline started' });
            onExtract?.(updated);
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            updateLog(id, { status: 'error', message: msg });
            setLogsOpen(true);
        }
        setExtracting(false);
    }

    const hasErrors = processLog.some(e => e.status === 'error');

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={onClose}
            PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, p: 0, display: 'flex', flexDirection: 'column' } }}
        >
            {/* Header */}
            <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Stack direction="row" spacing={1} alignItems="center">
                        <FileText size={20} />
                        <Typography variant="h6" fontSize="1rem" fontWeight={700}>
                            Classification Review
                        </Typography>
                    </Stack>
                    <IconButton size="small" onClick={onClose}><X size={18} /></IconButton>
                </Stack>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block', wordBreak: 'break-all' }}>
                    {localDoc?.originalname}
                </Typography>
            </Box>

            {/* Body */}
            <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>

                {/* Status banner */}
                {isProcessing && (
                    <Alert severity="info" icon={<CircularProgress size={16} />} sx={{ mb: 2 }}>
                        {localDoc.status === 'CLASSIFYING' ? 'Classification in progress…' : 'Extraction in progress…'}
                    </Alert>
                )}
                {localDoc?.status === 'FAILED' && (
                    <Alert severity="error" sx={{ mb: 2 }}>Process failed — see log below.</Alert>
                )}

                {/* Detected type */}
                <Typography variant="overline" color="text.disabled" fontWeight={700}>Detected Type</Typography>
                <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, mb: 2, mt: 0.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>
                            {localDoc?.documentType || '—'}
                        </Typography>
                        {localDoc?.classificationOverridden && (
                            <Chip label="Overridden" size="small" color="warning" variant="outlined" />
                        )}
                    </Stack>
                </Box>

                {/* Epistemic Layer */}
                <Typography variant="overline" color="text.disabled" fontWeight={700}>Epistemic Layer</Typography>
                <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, mb: 2, mt: 0.5 }}>
                    {layer ? (
                        <Stack direction="row" spacing={1.5} alignItems="center">
                            <Chip label={layer} size="small"
                                sx={{ bgcolor: LAYER_COLORS[layer] || 'grey.500', color: '#fff', fontWeight: 700 }} />
                            <Typography variant="body2">{LAYER_LABELS[layer] || layer}</Typography>
                        </Stack>
                    ) : (
                        <Typography variant="body2" color="text.secondary">Not determined</Typography>
                    )}
                    {localDoc?.normativeWeight != null && (
                        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                            Normative weight: {localDoc.normativeWeight}
                        </Typography>
                    )}
                </Box>

                {/* Confidence */}
                <Typography variant="overline" color="text.disabled" fontWeight={700}>Confidence</Typography>
                <Box sx={{ mb: 2, mt: 0.5 }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <LinearProgress
                            variant="determinate"
                            value={confidencePct}
                            color={isLowConf ? 'warning' : 'success'}
                            sx={{ flex: 1, height: 8, borderRadius: 4 }}
                        />
                        <Typography variant="body2" fontWeight={700}>{confidencePct}%</Typography>
                        {isLowConf && (
                            <Tooltip title="Confidence below 70% — manual review recommended">
                                <AlertCircle size={16} style={{ color: '#f59e0b' }} />
                            </Tooltip>
                        )}
                    </Stack>
                </Box>

                {/* Alternatives */}
                {alts.length > 0 && (
                    <>
                        <Typography variant="overline" color="text.disabled" fontWeight={700}>Alternative Classifications</Typography>
                        <Stack spacing={0.5} sx={{ mb: 2, mt: 0.5 }}>
                            {alts.map((a, i) => (
                                <Stack key={i} direction="row" justifyContent="space-between" alignItems="center"
                                    sx={{ px: 1.5, py: 0.75, bgcolor: 'action.hover', borderRadius: 1 }}>
                                    <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{a.document_type_id}</Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {Math.round((a.confidence || 0) * 100)}%
                                    </Typography>
                                </Stack>
                            ))}
                        </Stack>
                    </>
                )}

                {/* Provenance */}
                {(localDoc?.unSymbol || localDoc?.sourceUrl || localDoc?.sourceRepository || localDoc?.documentTitle || localDoc?.publishedDate) && (
                    <>
                        <Divider sx={{ my: 2 }} />
                        <Typography variant="overline" color="text.disabled" fontWeight={700}>Provenance</Typography>
                        <Box sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1, mt: 0.5, mb: 2 }}>
                            {localDoc.documentTitle && (
                                <Typography variant="body2" fontWeight={600} gutterBottom>{localDoc.documentTitle}</Typography>
                            )}
                            <Stack spacing={0.5}>
                                {localDoc.unSymbol && (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>UN Symbol</Typography>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{localDoc.unSymbol}</Typography>
                                    </Stack>
                                )}
                                {localDoc.sourceRepository && (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>Repository</Typography>
                                        <Chip label={localDoc.sourceRepository} size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                                    </Stack>
                                )}
                                {localDoc.publishedDate && (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>Published</Typography>
                                        <Typography variant="caption">{localDoc.publishedDate}</Typography>
                                    </Stack>
                                )}
                                {localDoc.sourceUrl && (
                                    <Stack direction="row" spacing={1} alignItems="center">
                                        <Typography variant="caption" color="text.secondary" sx={{ minWidth: 90 }}>Source URL</Typography>
                                        <a href={localDoc.sourceUrl} target="_blank" rel="noopener noreferrer"
                                            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', color: '#2563eb', textDecoration: 'none' }}>
                                            <ExternalLink size={12} /> View original
                                        </a>
                                    </Stack>
                                )}
                            </Stack>
                        </Box>
                    </>
                )}

                <Divider sx={{ my: 2 }} />

                {/* Override section */}
                {!overriding ? (
                    <Button variant="outlined" size="small" startIcon={<Edit2 size={14} />}
                        onClick={() => setOverriding(true)} disabled={isProcessing} fullWidth>
                        Override Classification
                    </Button>
                ) : (
                    <Box sx={{ p: 2, border: 1, borderColor: 'primary.main', borderRadius: 1, bgcolor: 'action.hover' }}>
                        <Typography variant="subtitle2" fontWeight={700} gutterBottom>Override Classification</Typography>
                        <FormControl fullWidth size="small" sx={{ mb: 1.5 }}>
                            <InputLabel>Document Type</InputLabel>
                            <Select value={overrideType} label="Document Type" onChange={e => setOverrideType(e.target.value)}>
                                {documentTypes.map(t => (
                                    <MenuItem key={t.id} value={t.id}>
                                        <Stack>
                                            <Typography variant="body2" fontWeight={600}>{t.id}</Typography>
                                            {t.epistemicLayer && (
                                                <Typography variant="caption" color="text.secondary">
                                                    {LAYER_LABELS[t.epistemicLayer] || t.epistemicLayer}
                                                </Typography>
                                            )}
                                        </Stack>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField fullWidth size="small" label="Reason (optional)"
                            value={overrideReason} onChange={e => setOverrideReason(e.target.value)} sx={{ mb: 1.5 }} />
                        <Stack direction="row" spacing={1}>
                            <Button size="small" variant="contained" onClick={handleOverride} disabled={!overrideType || saving}>
                                {saving ? 'Saving…' : 'Apply Override'}
                            </Button>
                            <Button size="small" onClick={() => setOverriding(false)}>Cancel</Button>
                        </Stack>
                    </Box>
                )}

                {/* ── Process Log ── */}
                {processLog.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                        <Divider />
                        <Stack direction="row" alignItems="center" justifyContent="space-between"
                            sx={{ mt: 1, cursor: 'pointer', userSelect: 'none' }}
                            onClick={() => setLogsOpen(v => !v)}>
                            <Stack direction="row" spacing={1} alignItems="center">
                                {hasErrors
                                    ? <XCircle size={14} color="#ef4444" />
                                    : <CheckCircle size={14} color="#22c55e" />}
                                <Typography variant="caption" fontWeight={600}>
                                    Process Log — {processLog.length} operation(s)
                                    {hasErrors && (
                                        <span style={{ color: '#ef4444' }}>
                                            {' '}· {processLog.filter(e => e.status === 'error').length} error(s)
                                        </span>
                                    )}
                                </Typography>
                            </Stack>
                            <IconButton size="small">
                                {logsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </IconButton>
                        </Stack>

                        <Collapse in={logsOpen}>
                            <Stack spacing={0.75} sx={{ mt: 0.75 }}>
                                {processLog.map(entry => (
                                    <LogEntry key={entry.id} entry={entry} />
                                ))}
                            </Stack>
                        </Collapse>
                    </Box>
                )}
            </Box>

            {/* Footer actions */}
            <Box sx={{ p: 2, borderTop: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Stack spacing={1}>
                    {canExtract && (
                        <Button variant="contained" color="primary"
                            startIcon={extracting ? <CircularProgress size={14} color="inherit" /> : <Play size={14} />}
                            onClick={handleExtract} disabled={extracting || isProcessing} fullWidth>
                            {extracting ? 'Starting extraction…'
                                : selectedModel === 'regex' ? 'Extract (Pattern Matching)'
                                : 'Extract with Claude Code'}
                        </Button>
                    )}
                    {canForce && (
                        <Button variant="contained" color="warning"
                            startIcon={<Zap size={14} />}
                            onClick={() => onForceExtract?.(localDoc)} fullWidth>
                            Re-extract (force)
                        </Button>
                    )}
                    {localDoc?.status === 'COMPLETED' && onViewResults && (
                        <Button variant="outlined" color="success"
                            startIcon={<Layers size={14} />}
                            onClick={() => onViewResults(localDoc)} fullWidth>
                            View Extraction Results
                        </Button>
                    )}
                    <Button variant="outlined" startIcon={<RotateCcw size={14} />}
                        onClick={handleReclassify} disabled={isProcessing || saving} fullWidth>
                        Re-classify
                    </Button>
                </Stack>
            </Box>
        </Drawer>
    );
}
