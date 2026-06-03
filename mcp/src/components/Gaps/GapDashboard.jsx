/**
 * GapDashboard — Gap summary statistics
 *
 * Displays key metrics and distributions:
 *   - Summary cards: Open (with HIGH count), Stale, In Progress, Closed, Total
 *   - Aging distribution bars (0-30d, 31-60d, 61-90d, >90d)
 *   - Gap type breakdown bars
 *   - Severity badges
 *
 * Clicking a card filters the gap list (calls onFilterChange).
 *
 * Props:
 *   namespace       string
 *   onFilterChange  (filters) => void
 */
import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Stack, Chip, CircularProgress,
    LinearProgress, Alert
} from '@mui/material';
import { AlertTriangle, Clock, CheckCircle, XCircle, BarChart3 } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';

function StatCard({ label, value, sub, color, icon: Icon, active, onClick }) {
    return (
        <Box
            onClick={onClick}
            sx={{
                flex: 1, minWidth: 100, p: 1.5, borderRadius: 2, cursor: onClick ? 'pointer' : 'default',
                border: '1px solid',
                borderColor: active ? color : 'divider',
                bgcolor: active ? `${color}12` : 'background.paper',
                transition: 'all 0.15s',
                '&:hover': onClick ? { borderColor: color, bgcolor: `${color}08` } : {}
            }}
        >
            <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 0.5 }}>
                {Icon && <Icon size={14} color={color} />}
                <Typography variant="h5" fontWeight={700} color={color}>{value ?? '—'}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" display="block">{label}</Typography>
            {sub && <Typography variant="caption" color="text.disabled">{sub}</Typography>}
        </Box>
    );
}

function AgingBar({ label, count, total, color = '#64748b' }) {
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 80 }}>{label}</Typography>
            <Box sx={{ flex: 1 }}>
                <LinearProgress
                    variant="determinate" value={pct}
                    sx={{ height: 8, borderRadius: 4,
                          bgcolor: `${color}22`,
                          '& .MuiLinearProgress-bar': { bgcolor: color } }}
                />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 32, textAlign: 'right' }}>
                {count}
            </Typography>
        </Stack>
    );
}

function TypeBar({ type, count, total }) {
    const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
    const color = '#64748b';
    return (
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 120 }} noWrap>{type}</Typography>
            <Box sx={{ flex: 1 }}>
                <LinearProgress
                    variant="determinate" value={pct}
                    sx={{ height: 6, borderRadius: 3,
                          bgcolor: '#f1f5f9',
                          '& .MuiLinearProgress-bar': { bgcolor: '#475569' } }}
                />
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 24, textAlign: 'right' }}>
                {count}
            </Typography>
        </Stack>
    );
}

export default function GapDashboard({ namespace, onFilterChange }) {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState(null);
    const [active,  setActive]  = useState(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        const params = namespace ? { namespace } : {};
        axios.get(`${API_BASE_URL}/gaps/dashboard`, { params })
            .then(({ data: resp }) => { if (!cancelled) setData(resp.data); })
            .catch(e => { if (!cancelled) setError(e.response?.data?.error || e.message); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [namespace]);

    function handleCardClick(filterKey, filterValue) {
        const next = active === filterKey ? null : filterKey;
        setActive(next);
        onFilterChange?.(next ? { [filterKey]: filterValue } : {});
    }

    if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={18} /></Box>;
    if (error)   return <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>;
    if (!data)   return null;

    const { summary, aging, byType, bySeverity } = data;
    const agingTotal = Object.values(aging).reduce((s, v) => s + v, 0);

    return (
        <Box>
            {/* Summary cards */}
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                <StatCard
                    label="Open"
                    value={summary.open}
                    sub={summary.highOpen > 0 ? `${summary.highOpen} high severity` : ''}
                    color="#ef4444"
                    icon={AlertTriangle}
                    active={active === 'status'}
                    onClick={() => handleCardClick('status', 'OPEN')}
                />
                <StatCard
                    label="Stale"
                    value={summary.stale}
                    sub="> 90 days"
                    color="#f97316"
                    icon={Clock}
                    active={active === 'stale'}
                    onClick={() => handleCardClick('minAgeDays', 90)}
                />
                <StatCard
                    label="In Progress"
                    value={summary.inProgress}
                    sub="Ack + Addressed"
                    color="#3b82f6"
                    icon={BarChart3}
                />
                <StatCard
                    label="Closed"
                    value={summary.closed}
                    color="#22c55e"
                    icon={CheckCircle}
                    active={active === 'closed'}
                    onClick={() => handleCardClick('status', 'CLOSED')}
                />
                <StatCard label="Total" value={summary.total} color="#64748b" icon={XCircle} />
            </Stack>

            {/* Severity + Aging rows */}
            <Stack direction="row" spacing={2} sx={{ mb: 1.5 }}>
                {/* Severity */}
                <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                        SEVERITY
                    </Typography>
                    {[
                        { label: 'High',   count: bySeverity.high,   color: '#ef4444' },
                        { label: 'Medium', count: bySeverity.medium, color: '#f59e0b' },
                        { label: 'Low',    count: bySeverity.low,    color: '#22c55e' },
                    ].map(s => (
                        <Stack key={s.label} direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                            <Chip label={s.label} size="small"
                                sx={{ height: 18, fontSize: 10, minWidth: 54,
                                      bgcolor: s.color + '22', color: s.color }} />
                            <Typography variant="body2" fontWeight={700} color={s.color}>{s.count}</Typography>
                        </Stack>
                    ))}
                </Box>

                {/* Aging */}
                <Box sx={{ flex: 2 }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                        AGING DISTRIBUTION
                    </Typography>
                    <AgingBar label="0-30 days"  count={aging.days0_30}   total={agingTotal} color="#22c55e" />
                    <AgingBar label="31-60 days" count={aging.days31_60}  total={agingTotal} color="#f59e0b" />
                    <AgingBar label="61-90 days" count={aging.days61_90}  total={agingTotal} color="#f97316" />
                    <AgingBar label="> 90 days"  count={aging.daysOver90} total={agingTotal} color="#ef4444" />
                </Box>
            </Stack>

            {/* Gap types */}
            {byType?.length > 0 && (
                <Box>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                        BY TYPE
                    </Typography>
                    {byType.slice(0, 5).map(({ type, count }) => (
                        <TypeBar key={type} type={type} count={count} total={summary.total} />
                    ))}
                </Box>
            )}
        </Box>
    );
}
