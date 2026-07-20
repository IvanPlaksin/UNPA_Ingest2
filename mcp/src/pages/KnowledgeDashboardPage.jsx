/**
 * Knowledge Dashboard (/knowledge-dashboard) — composition of the knowledge base:
 * graph side (nodes/relationships/namespaces/structure/temporal) and vector side
 * (collections/linkage/storage). Data from /api/v1/knowledge-dashboard/{graph,vector}-stats.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Box, Paper, Typography, Card, CardContent, Stack, CircularProgress,
    IconButton, Tooltip, Switch, FormControlLabel, Alert, Chip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
    Tooltip as RTooltip, ResponsiveContainer,
} from 'recharts';
import { getGraphStats, getVectorStats } from '../services/knowledgeDashboard.service';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString() : (n ?? '—'));
const mb = (bytes) => (bytes ? (bytes / 1024 / 1024).toFixed(1) : '0');

function SummaryCard({ title, value, subtitle, icon }) {
    return (
        <Card variant="outlined" sx={{ flex: 1, minWidth: 180 }}>
            <CardContent sx={{ textAlign: 'center' }}>
                <Typography variant="h4">{icon}</Typography>
                <Typography variant="h5" fontWeight={700}>{value ?? '—'}</Typography>
                <Typography variant="subtitle2">{title}</Typography>
                <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
            </CardContent>
        </Card>
    );
}

function Panel({ title, children }) {
    return (
        <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Typography variant="subtitle2" gutterBottom>{title}</Typography>
            {children}
        </Paper>
    );
}

export default function KnowledgeDashboardPage() {
    const [graph, setGraph] = useState(null);
    const [vector, setVector] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [auto, setAuto] = useState(false);
    const [updated, setUpdated] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const [g, v] = await Promise.all([getGraphStats(), getVectorStats()]);
            setGraph(g); setVector(v); setUpdated(new Date());
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        if (!auto) return undefined;
        const t = setInterval(load, 60000);
        return () => clearInterval(t);
    }, [auto, load]);

    if (loading && !graph) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', mt: 10 }}><CircularProgress /></Box>;
    }

    return (
        <Box sx={{ p: 3, height: '100%', overflow: 'auto' }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="h5" fontWeight={700}>Knowledge Dashboard</Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                    {updated && <Typography variant="caption" color="text.secondary">Updated {updated.toLocaleTimeString()}</Typography>}
                    <FormControlLabel control={<Switch size="small" checked={auto} onChange={(e) => setAuto(e.target.checked)} />} label="Auto 60s" />
                    <Tooltip title="Refresh"><span><IconButton onClick={load} disabled={loading}><RefreshIcon /></IconButton></span></Tooltip>
                </Stack>
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Summary cards */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 3 }}>
                <SummaryCard icon="📊" title="Total Nodes" value={fmt(graph?.summary?.totalNodes)} subtitle={`${fmt(graph?.summary?.totalLabels)} labels`} />
                <SummaryCard icon="🔗" title="Relationships" value={fmt(graph?.summary?.totalRelationships)} subtitle={`${fmt(graph?.summary?.totalRelTypes)} types`} />
                <SummaryCard icon="📦" title="Vector Points" value={fmt(vector?.summary?.totalPoints)} subtitle={`${fmt(vector?.summary?.totalCollections)} collections`} />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                {/* Graph column */}
                <Box sx={{ flex: 1.4, minWidth: 0 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>Graph data</Typography>

                    <Panel title="Nodes by label (top 10)">
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={(graph?.nodesByLabel || []).slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                                <YAxis type="category" dataKey="label" width={130} tick={{ fontSize: 11 }} />
                                <RTooltip formatter={(v, n, p) => [`${fmt(p.payload.count)} (${v}%)`, p.payload.label]} />
                                <Bar dataKey="percentage" fill="#3b82f6" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Panel>

                    <Panel title="Nodes by namespace">
                        <Stack direction="row" flexWrap="wrap" gap={1}>
                            {(graph?.nodesByNamespace || []).slice(0, 8).map((ns, i) => (
                                <Box key={ns.namespace} sx={{ textAlign: 'center', p: 1, minWidth: 90, bgcolor: 'action.hover', borderRadius: 1 }}>
                                    <Typography variant="h6" sx={{ color: COLORS[i % COLORS.length] }}>{fmt(ns.count)}</Typography>
                                    <Typography variant="caption">{ns.namespace} · {ns.percentage}%</Typography>
                                </Box>
                            ))}
                        </Stack>
                    </Panel>

                    <Panel title="Relationships by type (top 10)">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={(graph?.relationshipsByType || []).slice(0, 10)} layout="vertical" margin={{ left: 8, right: 16 }}>
                                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                                <YAxis type="category" dataKey="type" width={130} tick={{ fontSize: 10 }} />
                                <RTooltip formatter={(v, n, p) => [`${fmt(p.payload.count)} (${v}%)`, p.payload.type]} />
                                <Bar dataKey="percentage" fill="#10b981" />
                            </BarChart>
                        </ResponsiveContainer>
                    </Panel>

                    <Panel title="Structure">
                        <Stack direction="row" spacing={4}>
                            <Box><Typography variant="caption" color="text.secondary">Avg degree</Typography><Typography variant="h6">{graph?.structure?.avgDegree ?? '—'}</Typography></Box>
                            <Box><Typography variant="caption" color="text.secondary">Isolated nodes</Typography><Typography variant="h6">{fmt(graph?.structure?.isolatedNodes)}</Typography></Box>
                            {graph?.structure?.maxDegree != null && (
                                <Box><Typography variant="caption" color="text.secondary">Max degree</Typography><Typography variant="h6">{fmt(graph.structure.maxDegree)}</Typography></Box>
                            )}
                        </Stack>
                    </Panel>
                </Box>

                {/* Vector column */}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="h6" sx={{ mb: 1 }}>Vector data</Typography>

                    <Panel title="Points by collection">
                        <ResponsiveContainer width="100%" height={230}>
                            <PieChart>
                                <Pie data={(vector?.collections || []).slice(0, 6)} dataKey="pointsCount" nameKey="name"
                                    cx="50%" cy="50%" outerRadius={78}
                                    label={({ name, percentage }) => `${String(name).slice(0, 10)}… ${percentage}%`} labelLine={false}>
                                    {(vector?.collections || []).slice(0, 6).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                </Pie>
                                <RTooltip formatter={(v, n) => [fmt(v), n]} />
                            </PieChart>
                        </ResponsiveContainer>
                    </Panel>

                    <Panel title="Linkage overview">
                        <Stack spacing={0.5}>
                            <Typography variant="body2"><span style={{ color: '#10b981' }}>●</span> {fmt(vector?.summary?.linkedCollections)} linked</Typography>
                            <Typography variant="body2"><span style={{ color: '#6b7280' }}>○</span> {fmt(vector?.summary?.unlinkedCollections)} unlinked</Typography>
                            <Typography variant="body2"><span style={{ color: '#9ca3af' }}>○</span> {fmt(vector?.summary?.emptyCollections)} empty</Typography>
                        </Stack>
                    </Panel>

                    <Panel title="Storage estimate">
                        <Typography variant="body2">Vectors: {mb(vector?.storage?.estimatedVectorBytes)} MB</Typography>
                        <Typography variant="body2">Payload: {mb(vector?.storage?.estimatedPayloadBytes)} MB</Typography>
                        <Typography variant="h6" sx={{ mt: 0.5 }}>Total ≈ {vector?.storage?.totalEstimatedMB ?? '—'} MB</Typography>
                    </Panel>

                    {(vector?.pointsByNamespace || []).length > 0 && (
                        <Panel title="Vector points by namespace">
                            <Stack direction="row" flexWrap="wrap" gap={0.5}>
                                {vector.pointsByNamespace.slice(0, 8).map((n) => (
                                    <Chip key={n.namespace} size="small" variant="outlined" label={`${n.namespace}: ${fmt(n.count)} (${n.percentage}%)`} />
                                ))}
                            </Stack>
                        </Panel>
                    )}

                    {graph?.temporal && (
                        <Panel title="Recent graph activity">
                            <Typography variant="body2">Last 24h: {fmt(graph.temporal.nodesCreatedLast24h)} nodes</Typography>
                            <Typography variant="body2">Last 7d: {fmt(graph.temporal.nodesCreatedLast7d)} nodes</Typography>
                            <Typography variant="body2">Last 30d: {fmt(graph.temporal.nodesCreatedLast30d)} nodes</Typography>
                        </Panel>
                    )}
                </Box>
            </Stack>
        </Box>
    );
}
