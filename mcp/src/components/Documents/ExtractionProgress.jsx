/**
 * ExtractionProgress
 *
 * Shows live extraction pipeline progress for a document.
 * Polls GET /api/v1/documents/:id/extraction/progress every 1.5s.
 * Includes a collapsible log panel showing all step errors and warnings.
 *
 * Props:
 *   documentId   string
 *   onComplete   (result) => void   — called when status becomes 'completed'
 *   onClose      () => void
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    Box, Typography, Stack, LinearProgress, Chip,
    Button, CircularProgress, Alert, Collapse,
    IconButton, Divider, Paper
} from '@mui/material';
import {
    CheckCircle, XCircle, Clock, AlertCircle,
    ChevronDown, ChevronUp, AlertTriangle, Info
} from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';

const STEP_LABELS = {
    'parse-document':       'Parse Document',
    'extract-entities':     'Extract Entities & Relations',
    'build-triangle':       'Build Knowledge Triangle',
    'detect-gaps':          'Detect Knowledge Gaps',
    'calculate-kqs':        'Calculate KQS Scores',
    'deduplicate-entities': 'Deduplicate Entities',
    'store-results':        'Store Results',
};

function StepIcon({ status }) {
    if (status === 'completed') return <CheckCircle size={16} color="#22c55e" />;
    if (status === 'failed')    return <XCircle size={16} color="#ef4444" />;
    if (status === 'running')   return <CircularProgress size={14} />;
    return <Clock size={16} style={{ opacity: 0.3 }} />;
}

function formatMs(ms) {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
}

function coerceMsg(v) {
    if (!v && v !== 0) return null;
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.message || v.toString();
    try { return JSON.stringify(v); } catch { return String(v); }
}

function buildLogEntries(steps, summary) {
    const entries = [];

    for (const step of steps) {
        if (step.status === 'failed' || step.error != null) {
            const msg = coerceMsg(step.error) || 'Step failed (no error details)';
            entries.push({ level: 'error', step: step.name, message: msg });
        }
        if (step.result?.method?.includes('fallback')) {
            entries.push({ level: 'warn', step: step.name, message: `AI fallback to regex (method: ${step.result.method})` });
        }
    }

    if (summary?.errors) {
        for (const e of summary.errors) {
            const msg = coerceMsg(e.message) || 'Unknown error';
            const alreadyShown = entries.some(x => x.step === e.step && x.message === msg);
            if (!alreadyShown) {
                entries.push({ level: 'error', step: e.step || '?', message: msg });
            }
        }
    }

    return entries;
}

export default function ExtractionProgress({ documentId, onComplete, onClose }) {
    const [progress,    setProgress]    = useState(null);
    const [error,       setError]       = useState(null);
    const [logsOpen,    setLogsOpen]    = useState(false);
    const pollRef = useRef(null);

    const fetchProgress = async () => {
        try {
            const { data } = await axios.get(`${API_BASE_URL}/documents/${documentId}/extraction/progress`);
            const prog = data.data;
            setProgress(prog);

            // Auto-open logs if there are errors
            const logs = buildLogEntries(prog.steps || [], prog.summary);
            if (logs.some(l => l.level === 'error')) setLogsOpen(true);

            if (prog.status === 'completed') {
                clearInterval(pollRef.current);
                onComplete?.(prog.summary);
            } else if (prog.status === 'failed') {
                clearInterval(pollRef.current);
                setLogsOpen(true);
            }
        } catch (e) {
            if (e.response?.status !== 404) {
                setError(e.response?.data?.error || e.message);
                clearInterval(pollRef.current);
            }
        }
    };

    useEffect(() => {
        setProgress(null);
        setError(null);
        setLogsOpen(false);
        fetchProgress();
        pollRef.current = setInterval(fetchProgress, 1500);
        return () => clearInterval(pollRef.current);
    }, [documentId]);

    const overall  = progress?.overallProgress ?? 0;
    const steps    = progress?.steps ?? [];
    const isDone   = progress?.status === 'completed';
    const isFailed = progress?.status === 'failed';
    const logEntries = buildLogEntries(steps, progress?.summary);

    return (
        <Box>
            {/* Overall progress */}
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>Extraction Progress</Typography>
                <Typography variant="caption" color="text.secondary">{overall}%</Typography>
            </Stack>
            <LinearProgress
                variant="determinate"
                value={overall}
                color={isFailed ? 'error' : isDone ? 'success' : 'primary'}
                sx={{ mb: 2, height: 8, borderRadius: 4 }}
            />

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Steps list */}
            <Stack spacing={0.5}>
                {steps.length === 0 && !progress && (
                    Array.from({ length: 6 }).map((_, i) => (
                        <Stack key={i} direction="row" spacing={1.5} alignItems="center"
                            sx={{ py: 0.75, px: 1, borderRadius: 1, bgcolor: 'action.hover' }}>
                            <Clock size={16} style={{ opacity: 0.3 }} />
                            <Typography variant="body2" color="text.disabled">Initializing…</Typography>
                        </Stack>
                    ))
                )}
                {steps.map((step, i) => (
                    <Stack key={i} direction="row" spacing={1.5} alignItems="center"
                        sx={{
                            py: 0.75, px: 1, borderRadius: 1,
                            bgcolor: step.status === 'running'  ? 'action.selected'
                                   : step.status === 'failed'   ? 'error.50'
                                   : 'action.hover',
                        }}>
                        <StepIcon status={step.status} />
                        <Typography variant="body2" sx={{ flex: 1, fontWeight: step.status === 'running' ? 600 : 400 }}>
                            {STEP_LABELS[step.name] || step.name}
                        </Typography>
                        {step.duration && (
                            <Typography variant="caption" color="text.secondary">{formatMs(step.duration)}</Typography>
                        )}
                        {step.result && step.status === 'completed' && (
                            <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 120, textAlign: 'right' }}>
                                {step.name === 'extract-entities' && `${step.result.entities ?? 0} entities`}
                                {step.name === 'build-triangle'   && `${step.result.processesLinked ?? 0} linked`}
                                {step.name === 'parse-document'   && `${(step.result.chars / 1000).toFixed(0)}K chars`}
                            </Typography>
                        )}
                        {step.error && (
                            <Chip label="Error" size="small" color="error" variant="outlined"
                                sx={{ fontSize: '0.6rem', height: 18 }} />
                        )}
                        {step.result?.method?.includes('fallback') && (
                            <Chip label="fallback" size="small" color="warning" variant="outlined"
                                sx={{ fontSize: '0.6rem', height: 18 }} />
                        )}
                    </Stack>
                ))}
            </Stack>

            {/* Completion summary */}
            {isDone && progress.summary && (
                <Box sx={{ mt: 2, p: 1.5, bgcolor: 'success.main', borderRadius: 1, color: 'success.contrastText' }}>
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>Extraction Complete</Typography>
                    <Stack direction="row" spacing={2} flexWrap="wrap">
                        <Typography variant="caption">{progress.summary.entitiesExtracted} entities</Typography>
                        <Typography variant="caption">{progress.summary.relationsFound} relations</Typography>
                        <Typography variant="caption">{progress.summary.processesLinked} processes linked</Typography>
                        {progress.summary.kqsScore != null && (
                            <Typography variant="caption">KQS: {progress.summary.kqsScore?.toFixed(3)}</Typography>
                        )}
                        {progress.summary.aiModel && (
                            <Typography variant="caption">Model: {progress.summary.aiModel}</Typography>
                        )}
                    </Stack>
                </Box>
            )}

            {isFailed && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    Extraction failed — see logs below for details.
                </Alert>
            )}

            {/* ── Collapsible log panel ── */}
            {(logEntries.length > 0 || isDone || isFailed) && (
                <Box sx={{ mt: 2 }}>
                    <Divider />
                    <Stack
                        direction="row" alignItems="center" justifyContent="space-between"
                        sx={{ mt: 1, cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => setLogsOpen(v => !v)}
                    >
                        <Stack direction="row" spacing={1} alignItems="center">
                            {logEntries.some(l => l.level === 'error')
                                ? <XCircle size={14} color="#ef4444" />
                                : logEntries.some(l => l.level === 'warn')
                                    ? <AlertTriangle size={14} color="#f59e0b" />
                                    : <Info size={14} style={{ opacity: 0.5 }} />
                            }
                            <Typography variant="caption" fontWeight={600}>
                                Extraction Log
                                {logEntries.length > 0 && (
                                    <> &mdash; {logEntries.filter(l => l.level === 'error').length} error(s),{' '}
                                    {logEntries.filter(l => l.level === 'warn').length} warning(s)</>
                                )}
                            </Typography>
                        </Stack>
                        <IconButton size="small">
                            {logsOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        </IconButton>
                    </Stack>

                    <Collapse in={logsOpen}>
                        <Paper variant="outlined" sx={{
                            mt: 0.5, p: 1, maxHeight: 220, overflowY: 'auto',
                            bgcolor: 'grey.50', fontFamily: 'monospace'
                        }}>
                            {logEntries.length === 0 ? (
                                <Typography variant="caption" color="text.secondary">No errors or warnings.</Typography>
                            ) : (
                                <Stack spacing={0.5}>
                                    {logEntries.map((entry, i) => (
                                        <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                                            {entry.level === 'error'
                                                ? <XCircle size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                                                : <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                                            }
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography variant="caption" sx={{
                                                    color: entry.level === 'error' ? 'error.main' : 'warning.main',
                                                    fontWeight: 600, fontSize: '0.68rem'
                                                }}>
                                                    [{STEP_LABELS[entry.step] || entry.step}]
                                                </Typography>
                                                <Typography variant="caption" component="div" sx={{
                                                    mt: 0.25, fontSize: '0.72rem', lineHeight: 1.5,
                                                    color: entry.level === 'error' ? 'error.dark' : 'text.primary',
                                                    wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                                                    fontFamily: 'monospace'
                                                }}>
                                                    {entry.message || '(no error details)'}
                                                </Typography>
                                            </Box>
                                        </Stack>
                                    ))}
                                </Stack>
                            )}
                        </Paper>
                    </Collapse>
                </Box>
            )}

            {onClose && (
                <Button size="small" onClick={onClose} sx={{ mt: 2 }} fullWidth variant="outlined">
                    {isDone || isFailed ? 'Close' : 'Minimize'}
                </Button>
            )}
        </Box>
    );
}
