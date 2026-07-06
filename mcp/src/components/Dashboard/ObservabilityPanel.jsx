import React, { useState, useEffect, useCallback } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    CircularProgress,
    Chip,
    Table,
    TableBody,
    TableRow,
    TableCell
} from '@mui/material';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import api from '../../services/api';

const COLORS = ['#1976d2', '#f57c00', '#388e3c', '#d32f2f', '#7b1fa2', '#00796b', '#c62828', '#283593'];
const REFRESH_INTERVAL = 30000;

// ── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ title, value, unit, color }) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                    {title}
                </Typography>
                <Typography variant="h4" sx={{ mt: 1, fontWeight: 700, color: color || 'text.primary' }}>
                    {value}
                    {unit && (
                        <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                            {unit}
                        </Typography>
                    )}
                </Typography>
            </CardContent>
        </Card>
    );
}

// ── Top Tools Bar Chart ──────────────────────────────────────────────────────

function TopToolsChart({ data }) {
    if (!data || data.length === 0) {
        return <EmptyState label="No tool usage data" />;
    }

    const chartData = data.slice(0, 10).map((item) => ({
        name: item.name.length > 20 ? item.name.slice(0, 18) + '...' : item.name,
        calls: item.calls
    }));

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Top 10 Tools by Usage</Typography>
                <Box sx={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                            <XAxis type="number" tick={{ fontSize: 13 }} />
                            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 13 }} />
                            <Tooltip />
                            <Bar dataKey="calls" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Box>
            </CardContent>
        </Card>
    );
}

// ── Top Codex Rules Bar Chart ────────────────────────────────────────────────

function TopCodexRulesChart({ data }) {
    if (!data || data.length === 0) {
        return <EmptyState label="No codex rule data" />;
    }

    const chartData = data.slice(0, 10).map((item) => ({
        name: item.rule.length > 20 ? item.rule.slice(0, 18) + '...' : item.rule,
        hits: item.hits
    }));

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Top 10 Codex Rules Accessed</Typography>
                <Box sx={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                            <XAxis type="number" tick={{ fontSize: 13 }} />
                            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 13 }} />
                            <Tooltip />
                            <Bar dataKey="hits" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </Box>
            </CardContent>
        </Card>
    );
}

// ── Sessions Pie Chart ───────────────────────────────────────────────────────

function SessionsByTypeChart({ data }) {
    if (!data || data.length === 0) {
        return <EmptyState label="No session data" />;
    }

    const chartData = data.map((item) => ({
        name: item.type,
        value: item.count
    }));

    const renderLabel = ({ name, percent }) =>
        `${name} (${(percent * 100).toFixed(0)}%)`;

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Sessions by Agent Type</Typography>
                <Box sx={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                dataKey="value"
                                label={renderLabel}
                                labelLine={true}
                            >
                                {chartData.map((_, idx) => (
                                    <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </Box>
            </CardContent>
        </Card>
    );
}

// ── Performance Stats Table ──────────────────────────────────────────────────

function PerformanceTable({ toolDuration, promptTokens }) {
    const rows = [];

    if (toolDuration) {
        rows.push({ label: 'Tool Call Duration (avg)', value: `${toolDuration.avg} ms` });
        rows.push({ label: 'Tool Call Duration (p95)', value: `${toolDuration.p95} ms` });
        rows.push({ label: 'Tool Call Duration (max)', value: `${toolDuration.max} ms` });
    }

    if (promptTokens) {
        rows.push({ label: 'Prompt Tokens (avg)', value: promptTokens.avg?.toLocaleString() });
        rows.push({ label: 'Prompt Tokens (p95)', value: promptTokens.p95?.toLocaleString() });
    }

    if (rows.length === 0) {
        return <EmptyState label="No performance data" />;
    }

    return (
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Performance Stats</Typography>
                <Table size="small">
                    <TableBody>
                        {rows.map((row, idx) => (
                            <TableRow key={idx}>
                                <TableCell sx={{ border: 'none', pl: 0, color: 'text.secondary', fontSize: '0.85rem' }}>
                                    {row.label}
                                </TableCell>
                                <TableCell align="right" sx={{ border: 'none', pr: 0, fontWeight: 600, fontSize: '0.85rem' }}>
                                    {row.value}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

// ── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ label }) {
    return (
        <Card sx={{ height: '100%' }}>
            <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
                <Typography variant="body2" color="text.disabled">{label}</Typography>
            </CardContent>
        </Card>
    );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export default function ObservabilityPanel() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const response = await api.get('/metrics/summary');
            setData(response.data);
            setError(null);
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to fetch metrics summary:', err);
            setError(err.message || 'Failed to load metrics');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, REFRESH_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchData]);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <CircularProgress />
            </Box>
        );
    }

    const uptime = data?.uptime ?? '--';
    const totalToolCalls = data?.agents?.totalToolCalls ?? '--';
    const codexSearches = data?.codex?.totalSearches ?? '--';
    const cacheHitRate = data?.cache?.hitRate != null ? `${data.cache.hitRate}` : '--';

    return (
        <Box sx={{ p: 3, overflow: 'auto', height: '100%' }}>
            {/* Title row */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h5" fontWeight={700}>Observability</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {error && <Chip label={error} color="error" size="small" variant="outlined" />}
                    {lastUpdated && (
                        <Chip
                            label={`Updated ${lastUpdated.toLocaleTimeString()}`}
                            size="small"
                            variant="outlined"
                            color="default"
                        />
                    )}
                </Box>
            </Box>

            {/* Header stat cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Uptime" value={uptime} unit="hrs" color={COLORS[2]} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Total Tool Calls" value={totalToolCalls} color={COLORS[0]} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Codex Searches" value={codexSearches} color={COLORS[4]} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <StatCard title="Cache Hit Rate" value={cacheHitRate} unit="%" color={COLORS[1]} />
                </Grid>
            </Grid>

            {/* Charts row */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} md={6}>
                    <TopToolsChart data={data?.agents?.topTools} />
                </Grid>
                <Grid item xs={12} md={6}>
                    <TopCodexRulesChart data={data?.codex?.topRules} />
                </Grid>
            </Grid>

            {/* Bottom row */}
            <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                    <SessionsByTypeChart data={data?.agents?.sessionsByType} />
                </Grid>
                <Grid item xs={12} md={6}>
                    <PerformanceTable
                        toolDuration={data?.performance?.toolDuration}
                        promptTokens={data?.performance?.promptTokens}
                    />
                </Grid>
            </Grid>
        </Box>
    );
}
