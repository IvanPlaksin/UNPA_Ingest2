/**
 * NamespaceDetail — detailed view for a selected namespace
 *
 * Tabs:
 *   Overview   — doc coverage by layer, triangle distribution, KQS distribution, gap summary
 *   Processes  — process list with completeness + links to Triangle Explorer
 *   Documents  — document count summary + link to Document Processing
 *   Activity   — ActivityFeed for this namespace
 *
 * Props:
 *   namespace    string
 *   onClose      () => void
 *   onNavigate   (page: string, params?: object) => void
 */
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Stack, Chip, Tabs, Tab, Button,
    Paper, LinearProgress, Divider, Skeleton, Alert
} from '@mui/material';
import { X, ExternalLink, Download, AlertTriangle, Network } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';
import ActivityFeed from './ActivityFeed';

const LEVEL_COLOR = {
    EXCELLENT: '#22c55e', GOOD: '#14b8a6', FAIR: '#f59e0b', POOR: '#f97316', CRITICAL: '#ef4444'
};

const LAYER_LABELS = {
    L0: 'L0 Constitutional', L1: 'L1 Regulatory', L2: 'L2 Administrative',
    L3: 'L3 Operational', L4: 'L4 Empirical', L5: 'L5 Strategic', UNKNOWN: 'Unclassified'
};

function TabPanel({ value, index, children }) {
    return value === index ? <Box sx={{ pt: 1.5, overflow: 'auto', flex: 1 }}>{children}</Box> : null;
}

function LayerBar({ label, count, max }) {
    const pct = max > 0 ? Math.round(count / max * 100) : 0;
    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 130, fontSize: 13 }}>
                {label}
            </Typography>
            <Box sx={{ flex: 1 }}>
                <LinearProgress variant="determinate" value={pct}
                    sx={{ height: 7, borderRadius: 4,
                          '& .MuiLinearProgress-bar': { bgcolor: '#3b82f6' } }} />
            </Box>
            <Typography variant="caption" sx={{ minWidth: 28, textAlign: 'right' }}>{count}</Typography>
        </Stack>
    );
}

function DistBar({ label, count, total, color }) {
    const pct = total > 0 ? Math.round(count / total * 100) : 0;
    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 100, fontSize: 13 }}>
                {label}
            </Typography>
            <Box sx={{ flex: 1 }}>
                <LinearProgress variant="determinate" value={pct}
                    sx={{ height: 7, borderRadius: 4,
                          '& .MuiLinearProgress-bar': { bgcolor: color || '#3b82f6' } }} />
            </Box>
            <Typography variant="caption" sx={{ minWidth: 48, textAlign: 'right' }}>
                {count} ({pct}%)
            </Typography>
        </Stack>
    );
}

export default function NamespaceDetail({ namespace, onClose, onNavigate }) {
    const [tab,      setTab]      = useState(0);
    const [detail,   setDetail]   = useState(null);
    const [activity, setActivity] = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [actLoading, setActLoading] = useState(false);
    const [error,    setError]    = useState(null);

    useEffect(() => {
        if (!namespace) return;
        setLoading(true);
        setError(null);
        axios.get(`${API_BASE_URL}/knowledge-health/namespaces/${namespace}`)
            .then(r => setDetail(r.data.data))
            .catch(e => setError(e.response?.data?.error || e.message))
            .finally(() => setLoading(false));
    }, [namespace]);

    useEffect(() => {
        if (tab !== 3 || !namespace) return;
        setActLoading(true);
        axios.get(`${API_BASE_URL}/knowledge-health/namespaces/${namespace}/activity?limit=30`)
            .then(r => setActivity(r.data.data || []))
            .catch(() => setActivity([]))
            .finally(() => setActLoading(false));
    }, [tab, namespace]);

    async function handleExport() {
        window.open(`${API_BASE_URL}/knowledge-health/namespaces/${namespace}/export?format=csv`, '_blank');
    }

    if (!namespace) return null;

    const color = detail ? (LEVEL_COLOR[detail.healthLevel] || LEVEL_COLOR.FAIR) : '#94a3b8';

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1, flexShrink: 0 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle1" fontWeight={700}>{namespace}</Typography>
                    {detail && (
                        <Chip
                            label={`${detail.healthScore} — ${detail.healthLevel}`}
                            size="small"
                            sx={{ bgcolor: color + '22', color, fontWeight: 700, fontSize: 13 }}
                        />
                    )}
                </Stack>
                <Stack direction="row" spacing={0.5}>
                    <Button size="small" variant="outlined" startIcon={<Download size={12} />}
                        onClick={handleExport} sx={{ fontSize: 13 }}>
                        Export
                    </Button>
                    {onClose && (
                        <Button size="small" variant="outlined" onClick={onClose}>
                            <X size={14} />
                        </Button>
                    )}
                </Stack>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

            <Tabs value={tab} onChange={(_, v) => setTab(v)}
                sx={{ borderBottom: 1, borderColor: 'divider', mb: 0, flexShrink: 0 }}>
                <Tab label="Overview"  sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
                <Tab label="Processes" sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
                <Tab label="Documents" sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
                <Tab label="Activity"  sx={{ minHeight: 36, py: 0.5, fontSize: 13 }} />
            </Tabs>

            {/* ── Overview ── */}
            <TabPanel value={tab} index={0}>
                {loading ? (
                    <Box>
                        {[1,2,3].map(i => <Skeleton key={i} height={40} sx={{ mb: 1 }} />)}
                    </Box>
                ) : detail ? (
                    <Stack spacing={2}>
                        {/* Document coverage by layer */}
                        <Box>
                            <Typography variant="caption" fontWeight={700} sx={{ mb: 1, display: 'block' }}>
                                Document Coverage by Layer
                            </Typography>
                            {Object.entries(detail.documentsByLayer).length > 0 ? (
                                (() => {
                                    const maxCount = Math.max(...Object.values(detail.documentsByLayer), 1);
                                    return Object.entries(detail.documentsByLayer)
                                        .sort(([a], [b]) => a.localeCompare(b))
                                        .map(([layer, count]) => (
                                            <LayerBar key={layer}
                                                label={LAYER_LABELS[layer] || layer}
                                                count={count}
                                                max={maxCount} />
                                        ));
                                })()
                            ) : (
                                <Typography variant="caption" color="text.disabled">No classified documents</Typography>
                            )}
                        </Box>

                        <Divider />

                        {/* Triangle distribution + KQS side by side */}
                        <Stack direction="row" spacing={2}>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" fontWeight={700} sx={{ mb: 1, display: 'block' }}>
                                    Triangle Completeness
                                </Typography>
                                {(() => {
                                    const dist = detail.triangleDistribution;
                                    const total = (dist.full + dist.partial + dist.minimal + dist.none) || 1;
                                    return (
                                        <>
                                            <DistBar label="● Full"    count={dist.full}    total={total} color="#22c55e" />
                                            <DistBar label="◐ Partial" count={dist.partial} total={total} color="#14b8a6" />
                                            <DistBar label="◔ Minimal" count={dist.minimal} total={total} color="#f59e0b" />
                                            <DistBar label="○ None"    count={dist.none}    total={total} color="#ef4444" />
                                        </>
                                    );
                                })()}
                            </Box>
                            <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" fontWeight={700} sx={{ mb: 1, display: 'block' }}>
                                    KQS Distribution
                                </Typography>
                                {(() => {
                                    const kqs = detail.kqsDistribution;
                                    const total = (kqs.high + kqs.good + kqs.fair + kqs.poor) || 1;
                                    return (
                                        <>
                                            <DistBar label="High ≥0.8"  count={kqs.high} total={total} color="#22c55e" />
                                            <DistBar label="Good 0.6-0.8" count={kqs.good} total={total} color="#14b8a6" />
                                            <DistBar label="Fair 0.4-0.6" count={kqs.fair} total={total} color="#f59e0b" />
                                            <DistBar label="Poor <0.4"  count={kqs.poor} total={total} color="#ef4444" />
                                        </>
                                    );
                                })()}
                            </Box>
                        </Stack>

                        <Divider />

                        {/* Gap summary */}
                        <Box>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                                <Typography variant="caption" fontWeight={700}>Gaps Summary</Typography>
                                <Button size="small" variant="text" endIcon={<ExternalLink size={10} />}
                                    onClick={() => onNavigate?.('gaps', { namespace })}
                                    sx={{ fontSize: 12 }}>
                                    Gap Manager
                                </Button>
                            </Stack>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                                <Chip label={`${detail.gapSummary.open} open`} size="small"
                                    icon={<AlertTriangle size={10} />}
                                    sx={{ bgcolor: detail.gapSummary.open > 0 ? '#f59e0b22' : undefined,
                                          color: detail.gapSummary.open > 0 ? '#f59e0b' : undefined,
                                          fontSize: 13 }} />
                                {detail.gapSummary.stale > 0 && (
                                    <Chip label={`${detail.gapSummary.stale} stale`} size="small"
                                        sx={{ bgcolor: '#ef444422', color: '#ef4444', fontSize: 13 }} />
                                )}
                                {detail.gapSummary.bySeverity.high > 0 && (
                                    <Chip label={`${detail.gapSummary.bySeverity.high} HIGH`} size="small"
                                        sx={{ bgcolor: '#ef444422', color: '#ef4444', fontSize: 13 }} />
                                )}
                            </Stack>
                        </Box>
                    </Stack>
                ) : null}
            </TabPanel>

            {/* ── Processes ── */}
            <TabPanel value={tab} index={1}>
                {loading ? (
                    <Skeleton height={200} />
                ) : detail ? (
                    <Box>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                                {detail.processes.length} process{detail.processes.length !== 1 ? 'es' : ''}
                            </Typography>
                            <Button size="small" variant="text" endIcon={<ExternalLink size={10} />}
                                onClick={() => onNavigate?.('knowledge-triangle', { namespace })}
                                sx={{ fontSize: 12 }}>
                                Triangle Explorer
                            </Button>
                        </Stack>
                        {detail.processes.length === 0 ? (
                            <Typography variant="caption" color="text.disabled">No processes</Typography>
                        ) : detail.processes.map(p => (
                            <Paper key={p.id} variant="outlined"
                                sx={{ p: 1, mb: 0.75, borderRadius: 1 }}>
                                <Stack direction="row" alignItems="center" justifyContent="space-between">
                                    <Box sx={{ flex: 1, mr: 1 }}>
                                        <Typography variant="caption" fontWeight={600} noWrap
                                            sx={{ display: 'block', maxWidth: 180 }}>
                                            {p.name || p.id}
                                        </Typography>
                                        <LinearProgress
                                            variant="determinate"
                                            value={Math.round(p.completeness * 100)}
                                            sx={{ height: 4, borderRadius: 2, mt: 0.5,
                                                  '& .MuiLinearProgress-bar': {
                                                      bgcolor: p.completeness >= 0.67 ? '#22c55e' : p.completeness > 0 ? '#f59e0b' : '#ef4444'
                                                  } }}
                                        />
                                    </Box>
                                    <Stack direction="row" spacing={0.5} alignItems="center">
                                        <Chip label={`KQS ${p.kqs}`} size="small"
                                            sx={{ height: 18, fontSize: 11 }} />
                                        {p.openGaps > 0 && (
                                            <Chip label={`${p.openGaps} gap${p.openGaps !== 1 ? 's' : ''}`}
                                                size="small"
                                                sx={{ height: 18, fontSize: 11, bgcolor: '#f59e0b22', color: '#f59e0b' }} />
                                        )}
                                    </Stack>
                                </Stack>
                            </Paper>
                        ))}
                    </Box>
                ) : null}
            </TabPanel>

            {/* ── Documents ── */}
            <TabPanel value={tab} index={2}>
                {loading ? (
                    <Skeleton height={120} />
                ) : detail ? (
                    <Box>
                        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                            <Typography variant="body2" color="text.secondary">
                                {Object.values(detail.documentsByLayer).reduce((a, b) => a + b, 0)} documents total
                            </Typography>
                            <Button size="small" variant="text" endIcon={<ExternalLink size={10} />}
                                onClick={() => onNavigate?.('documents', { namespace })}
                                sx={{ fontSize: 12 }}>
                                Document Processing
                            </Button>
                        </Stack>
                        {Object.entries(detail.documentsByLayer).map(([layer, count]) => (
                            <Stack key={layer} direction="row" alignItems="center"
                                justifyContent="space-between" sx={{ py: 0.5, borderBottom: 1, borderColor: 'divider' }}>
                                <Typography variant="body2" sx={{ fontSize: 13 }}>
                                    {LAYER_LABELS[layer] || layer}
                                </Typography>
                                <Chip label={count} size="small" sx={{ height: 18, fontSize: 12 }} />
                            </Stack>
                        ))}
                    </Box>
                ) : null}
            </TabPanel>

            {/* ── Activity ── */}
            <TabPanel value={tab} index={3}>
                <ActivityFeed activities={activity} loading={actLoading} />
            </TabPanel>
        </Box>
    );
}
