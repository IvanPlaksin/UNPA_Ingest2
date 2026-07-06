/**
 * ExtractionResults
 *
 * Displays the completed extraction result for a document.
 * Fetches GET /api/v1/documents/:id/extraction/result on mount.
 *
 * Tabs:
 *   Summary        — stats, KQS, duration, triangle edge counts
 *   Entities       — table of extracted knowledge nodes
 *   Relations      — table of extracted edges
 *   Knowledge Triangle — visual breakdown of GOVERNS / OPERATIONALIZES / REVEALS_GAP_IN edges
 *
 * Props:
 *   documentId   string
 *   documentName string          — display name for header
 *   onClose      () => void
 *   onViewTriangle (documentId) => void   — navigate to triangle explorer
 */
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Stack, Chip, Button, CircularProgress, Alert,
    Tabs, Tab, Divider, Table, TableHead, TableRow, TableCell,
    TableBody, TableContainer, Paper, LinearProgress, Tooltip,
    Collapse, IconButton
} from '@mui/material';
import {
    CheckCircle, FileText, Network, GitBranch, BarChart3,
    Clock, AlertTriangle, ExternalLink, Zap,
    XCircle, ChevronDown, ChevronUp
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

function coerceMsg(v) {
    if (!v && v !== 0) return null;
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.message || v.toString();
    try { return JSON.stringify(v); } catch { return String(v); }
}

function buildErrorLog(steps = [], summaryErrors = []) {
    const entries = [];
    for (const step of steps) {
        // Use status === 'failed' as trigger — avoids missing "" error messages
        if (step.status === 'failed' || step.error != null) {
            const msg = coerceMsg(step.error) || 'Step failed (no error details)';
            entries.push({ step: step.name, message: msg, level: 'error' });
        }
        if (step.result?.method?.includes('fallback')) {
            entries.push({ step: step.name, message: `AI fallback to regex (method: ${step.result.method})`, level: 'warn' });
        }
    }
    for (const e of (summaryErrors || [])) {
        const msg = coerceMsg(e.message) || 'Unknown error';
        const dup = entries.some(x => x.step === e.step && x.message === msg);
        if (!dup) entries.push({ step: e.step || '?', message: msg, level: 'error' });
    }
    return entries;
}

function ErrorLogPanel({ documentId }) {
    const [entries,   setEntries]   = useState(null);
    const [open,      setOpen]      = useState(true);
    const [loading,   setLoading]   = useState(true);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/documents/${documentId}/extraction/progress`)
            .then(({ data }) => {
                const prog = data.data;
                setEntries(buildErrorLog(prog?.steps || [], prog?.summary?.errors));
            })
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, [documentId]);

    if (loading) return null;
    if (!entries || entries.length === 0) return null;

    return (
        <Box sx={{ mb: 1.5 }}>
            <Alert
                severity="warning"
                icon={<AlertTriangle size={16} />}
                action={
                    <IconButton size="small" onClick={() => setOpen(v => !v)}>
                        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </IconButton>
                }
                sx={{ cursor: 'pointer' }}
                onClick={() => setOpen(v => !v)}
            >
                {entries.filter(e => e.level === 'error').length} error(s),{' '}
                {entries.filter(e => e.level === 'warn').length} warning(s) during extraction
            </Alert>
            <Collapse in={open}>
                <Paper variant="outlined" sx={{
                    p: 1.5, maxHeight: 240, overflowY: 'auto',
                    bgcolor: 'grey.50', fontFamily: 'monospace',
                    borderTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0
                }}>
                    <Stack spacing={0.75}>
                        {entries.map((entry, i) => (
                            <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                                {entry.level === 'error'
                                    ? <XCircle size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                                    : <AlertTriangle size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                                }
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Typography variant="caption" sx={{
                                        color: entry.level === 'error' ? 'error.main' : 'warning.main',
                                        fontWeight: 700, fontSize: '0.68rem'
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
                </Paper>
            </Collapse>
        </Box>
    );
}

const LAYER_COLORS = {
    L0: '#7c3aed', L1: '#2563eb', L2: '#0891b2',
    L3: '#059669', L4: '#d97706', L5: '#9333ea'
};

function StatCard({ label, value, sub, color }) {
    return (
        <Box sx={{
            p: 1.5, borderRadius: 2, flex: 1, minWidth: 100,
            border: '1px solid', borderColor: 'divider', bgcolor: 'background.paper'
        }}>
            <Typography variant="h5" fontWeight={700} color={color || 'text.primary'}>{value ?? '—'}</Typography>
            <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
            {sub && <Typography variant="caption" color="text.disabled">{sub}</Typography>}
        </Box>
    );
}

function TabPanel({ value, index, children }) {
    return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

function formatDuration(ms) {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function TriangleEdgeRow({ edgeType, count, color, description }) {
    const pct = Math.min(100, (count || 0) * 10);
    return (
        <Box sx={{ mb: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: color }} />
                    <Typography variant="body2" fontWeight={600}>{edgeType}</Typography>
                    <Typography variant="caption" color="text.secondary">{description}</Typography>
                </Stack>
                <Chip label={count ?? 0} size="small" sx={{ bgcolor: color, color: '#fff', fontWeight: 700, height: 20 }} />
            </Stack>
            <LinearProgress
                variant="determinate"
                value={pct}
                sx={{ height: 6, borderRadius: 3, bgcolor: `${color}22`,
                      '& .MuiLinearProgress-bar': { bgcolor: color } }}
            />
        </Box>
    );
}

export default function ExtractionResults({ documentId, documentName, onClose, onViewTriangle, onReExtract }) {
    const [tab,     setTab]     = useState(0);
    const [result,  setResult]  = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        axios.get(`${API_BASE_URL}/documents/${documentId}/extraction/result`)
            .then(({ data }) => { if (!cancelled) setResult(data.data); })
            .catch(e => { if (!cancelled) setError(e.response?.data?.error || e.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [documentId]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4, gap: 2 }}>
                <CircularProgress size={20} />
                <Typography variant="body2" color="text.secondary">Loading extraction results…</Typography>
            </Box>
        );
    }

    if (error) return <Alert severity="error">{error}</Alert>;
    if (!result) return <Alert severity="info">No extraction result found for this document.</Alert>;

    const { summary, startedAt, completedAt, duration, errorCount, aiModel, aiSummary } = result;
    const tri = summary?.triangleEdgesCreated || {};

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <CheckCircle size={18} color="#22c55e" />
                    <Typography variant="subtitle2" fontWeight={700}>
                        {documentName ? `Results: ${documentName}` : 'Extraction Results'}
                    </Typography>
                    {aiModel && aiModel !== 'regex' && (
                        <Chip
                            label={aiModel.replace('claude-', '').replace('-20', ' 20')}
                            size="small"
                            sx={{ bgcolor: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.65rem', height: 18 }}
                        />
                    )}
                    {(!aiModel || aiModel === 'regex') && (
                        <Chip label="regex" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18 }} />
                    )}
                </Stack>
                <Stack direction="row" spacing={1}>
                    {onReExtract && (
                        <Button
                            size="small"
                            variant="outlined"
                            color="warning"
                            startIcon={<Zap size={13} />}
                            onClick={() => onReExtract(documentId)}
                        >
                            Re-extract
                        </Button>
                    )}
                    {onViewTriangle && (
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<ExternalLink size={13} />}
                            onClick={() => onViewTriangle(documentId)}
                        >
                            Triangle Explorer
                        </Button>
                    )}
                    {onClose && (
                        <Button size="small" onClick={onClose} variant="outlined">Close</Button>
                    )}
                </Stack>
            </Stack>

            {errorCount > 0 && (
                <ErrorLogPanel documentId={documentId} />
            )}

            {/* Tabs */}
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
                <Tab label="Summary"           icon={<BarChart3 size={14} />} iconPosition="start" sx={{ minHeight: 40, py: 0.5 }} />
                <Tab label={`Entities (${summary?.entitiesExtracted ?? 0})`} icon={<FileText size={14} />} iconPosition="start" sx={{ minHeight: 40, py: 0.5 }} />
                <Tab label={`Relations (${summary?.relationsFound ?? 0})`}   icon={<Network size={14} />} iconPosition="start" sx={{ minHeight: 40, py: 0.5 }} />
                <Tab label="Knowledge Triangle" icon={<GitBranch size={14} />} iconPosition="start" sx={{ minHeight: 40, py: 0.5 }} />
            </Tabs>

            {/* ── Tab 0: Summary ─────────────────────────────────────────────── */}
            <TabPanel value={tab} index={0}>
                {/* Key stats row */}
                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                    <StatCard label="Entities" value={summary?.entitiesExtracted} color="#2563eb" />
                    <StatCard label="Relations" value={summary?.relationsFound} color="#0891b2" />
                    <StatCard label="Processes Linked" value={summary?.processesLinked} color="#059669" />
                    <StatCard label="Gaps Detected" value={summary?.gapsDetected} color="#d97706" />
                    <StatCard
                        label="KQS Score"
                        value={summary?.kqsScore != null ? summary.kqsScore.toFixed(3) : '—'}
                        color={summary?.kqsScore >= 0.7 ? '#22c55e' : summary?.kqsScore >= 0.4 ? '#d97706' : '#ef4444'}
                    />
                </Stack>

                {/* Timing */}
                <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: 'action.hover', mb: 2 }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                        <Clock size={14} />
                        <Typography variant="caption" fontWeight={600} color="text.secondary">TIMING</Typography>
                    </Stack>
                    <Stack direction="row" spacing={3} flexWrap="wrap">
                        <Box>
                            <Typography variant="caption" color="text.disabled" display="block">Duration</Typography>
                            <Typography variant="body2" fontWeight={600}>{formatDuration(duration)}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.disabled" display="block">Started</Typography>
                            <Typography variant="body2">{startedAt ? new Date(startedAt).toLocaleTimeString() : '—'}</Typography>
                        </Box>
                        <Box>
                            <Typography variant="caption" color="text.disabled" display="block">Completed</Typography>
                            <Typography variant="body2">{completedAt ? new Date(completedAt).toLocaleTimeString() : '—'}</Typography>
                        </Box>
                    </Stack>
                </Box>

                {/* AI summary */}
                {aiSummary && (
                    <Box sx={{ p: 1.5, borderRadius: 1, border: '1px solid', borderColor: '#2563eb33', bgcolor: '#2563eb08', mb: 2 }}>
                        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mb: 0.75 }}>
                            <Chip label={aiModel || 'AI'} size="small"
                                sx={{ bgcolor: '#2563eb', color: '#fff', fontWeight: 700, fontSize: '0.62rem', height: 18 }} />
                            <Typography variant="caption" fontWeight={600} color="#2563eb">AI SUMMARY</Typography>
                        </Stack>
                        <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                            {aiSummary}
                        </Typography>
                    </Box>
                )}

                {/* Triangle contribution summary */}
                <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 1 }}>
                    KNOWLEDGE TRIANGLE CONTRIBUTIONS
                </Typography>
                <TriangleEdgeRow edgeType="GOVERNS"          count={tri.governs}          color="#7c3aed" description="Normative coverage (L0-L2)" />
                <TriangleEdgeRow edgeType="OPERATIONALIZES"  count={tri.operationalizes}  color="#059669" description="Operational coverage (L3)" />
                <TriangleEdgeRow edgeType="REVEALS_GAP_IN"   count={tri.revealsGapIn}     color="#ef4444" description="Gap evidence (L4)" />
            </TabPanel>

            {/* ── Tab 1: Entities ────────────────────────────────────────────── */}
            <TabPanel value={tab} index={1}>
                <EntityTable documentId={documentId} />
            </TabPanel>

            {/* ── Tab 2: Relations ───────────────────────────────────────────── */}
            <TabPanel value={tab} index={2}>
                <RelationTable documentId={documentId} />
            </TabPanel>

            {/* ── Tab 3: Knowledge Triangle ──────────────────────────────────── */}
            <TabPanel value={tab} index={3}>
                <TriangleTab documentId={documentId} tri={tri} />
            </TabPanel>
        </Box>
    );
}

// ─── Entities sub-component ────────────────────────────────────────────────────

function EntityTable({ documentId }) {
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/documents/${documentId}/extraction/entities`)
            .then(({ data }) => {
                const raw = data.data || [];
                // Client-side dedup by type+name (safety net for pre-migration data)
                const seen = new Set();
                const deduped = raw.filter(e => {
                    const key = `${e.type}::${(e.name || '').toLowerCase()}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
                setRows(deduped);
            })
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    }, [documentId]);

    if (loading) return <CircularProgress size={18} />;
    if (error)   return <Alert severity="error">{error}</Alert>;

    if (rows.length === 0) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    Entity detail is not available. The summary count is shown in the Summary tab.
                </Typography>
                <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                    Entities were written to the knowledge graph during extraction.
                </Typography>
            </Box>
        );
    }

    return (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>Name</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Category</TableCell>
                        <TableCell align="right">Relevance</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row, i) => {
                        const relColor = row.relevance === 'HIGH' ? '#22c55e' : row.relevance === 'MEDIUM' ? '#f59e0b' : '#94a3b8';
                        return (
                            <TableRow key={row.id || i} hover>
                                <TableCell>
                                    <Typography variant="body2" noWrap sx={{ maxWidth: 220 }}>
                                        {row.name || row.label || '—'}
                                    </Typography>
                                    {row.match && row.match !== row.name && (
                                        <Typography variant="caption" color="text.disabled" sx={{ display: 'block', fontFamily: 'monospace' }}>
                                            {row.match}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <Chip label={row.type || '—'} size="small" variant="outlined" />
                                </TableCell>
                                <TableCell>
                                    <Typography variant="caption" color="text.secondary">{row.category || '—'}</Typography>
                                </TableCell>
                                <TableCell align="right">
                                    {row.relevance
                                        ? <Chip label={row.relevance} size="small"
                                            sx={{ bgcolor: relColor + '22', color: relColor, fontWeight: 700, fontSize: '0.65rem', height: 18 }} />
                                        : row.confidence != null
                                            ? <Typography variant="body2">{(row.confidence * 100).toFixed(0)}%</Typography>
                                            : '—'}
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

// ─── Relations sub-component ───────────────────────────────────────────────────

function RelationTable({ documentId }) {
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        axios.get(`${API_BASE_URL}/documents/${documentId}/extraction/relations`)
            .then(({ data }) => setRows(data.data || []))
            .catch(() => setRows([]))
            .finally(() => setLoading(false));
    }, [documentId]);

    if (loading) return <CircularProgress size={18} />;

    if (rows.length === 0) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    Relation detail is not available. The summary count is shown in the Summary tab.
                </Typography>
                <Typography variant="caption" color="text.disabled" display="block" sx={{ mt: 0.5 }}>
                    Relations were written to the knowledge graph during extraction.
                </Typography>
            </Box>
        );
    }

    return (
        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        <TableCell>Source</TableCell>
                        <TableCell>Relation</TableCell>
                        <TableCell>Target</TableCell>
                        <TableCell align="right">Confidence</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {rows.map((row, i) => (
                        <TableRow key={i} hover>
                            <TableCell>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                                    {row.source || row.sourceName || '—'}
                                </Typography>
                            </TableCell>
                            <TableCell>
                                <Chip label={row.relation || row.type || '—'} size="small"
                                    color="primary" variant="outlined" sx={{ fontSize: 12 }} />
                            </TableCell>
                            <TableCell>
                                <Typography variant="body2" noWrap sx={{ maxWidth: 160 }}>
                                    {row.target || row.targetName || '—'}
                                </Typography>
                            </TableCell>
                            <TableCell align="right">
                                {row.confidence != null
                                    ? `${(row.confidence * 100).toFixed(0)}%`
                                    : '—'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
}

// ─── Triangle visualization sub-component ─────────────────────────────────────

const EDGE_DEFS = [
    {
        key:   'governs',
        label: 'GOVERNS',
        color: '#7c3aed',
        layers: 'L0, L1, L2',
        desc:  'Normative coverage — this document provides regulatory/policy authority over processes.',
        bg:    '#7c3aed11'
    },
    {
        key:   'operationalizes',
        label: 'OPERATIONALIZES',
        color: '#059669',
        layers: 'L3',
        desc:  'Operational coverage — this document provides procedural guidance for processes.',
        bg:    '#05966911'
    },
    {
        key:   'revealsGapIn',
        label: 'REVEALS_GAP_IN',
        color: '#ef4444',
        layers: 'L4',
        desc:  'Gap evidence — this document reveals knowledge gaps in processes.',
        bg:    '#ef444411'
    },
];

function TriangleTab({ documentId, tri }) {
    const total = (tri.governs || 0) + (tri.operationalizes || 0) + (tri.revealsGapIn || 0);

    return (
        <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                During extraction, the document was linked to process nodes via Knowledge Triangle edges.
                The edge type was determined by the document's epistemic layer.
            </Typography>

            <Stack spacing={1.5}>
                {EDGE_DEFS.map(def => {
                    const count = tri[def.key] || 0;
                    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                        <Box key={def.key} sx={{ p: 1.5, borderRadius: 2, border: '1px solid', borderColor: def.color + '44', bgcolor: def.bg }}>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: def.color }} />
                                    <Typography variant="body2" fontWeight={700} color={def.color}>{def.label}</Typography>
                                    <Chip label={`Layers: ${def.layers}`} size="small" variant="outlined"
                                        sx={{ fontSize: 12, height: 18, borderColor: def.color + '66', color: def.color }} />
                                </Stack>
                                <Stack direction="row" spacing={1} alignItems="center">
                                    <Typography variant="h6" fontWeight={700} color={def.color}>{count}</Typography>
                                    <Typography variant="caption" color="text.secondary">edges</Typography>
                                </Stack>
                            </Stack>
                            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                                {def.desc}
                            </Typography>
                            {total > 0 && (
                                <LinearProgress
                                    variant="determinate" value={pct}
                                    sx={{ height: 5, borderRadius: 3,
                                          bgcolor: def.color + '22',
                                          '& .MuiLinearProgress-bar': { bgcolor: def.color } }}
                                />
                            )}
                        </Box>
                    );
                })}
            </Stack>

            {total === 0 && (
                <Alert severity="info" sx={{ mt: 2 }}>
                    No triangle edges were created. This happens when the document has no epistemic layer
                    set, or when no matching process/procedure entities were extracted.
                </Alert>
            )}

            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" color="text.secondary">
                Total triangle edges created: <strong>{total}</strong>
                {' · '}Linked to process nodes in the knowledge graph.
            </Typography>
        </Box>
    );
}
