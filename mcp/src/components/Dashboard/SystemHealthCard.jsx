/**
 * SystemHealthCard — system-wide health overview
 *
 * Shows a circular progress ring with health score, health level label,
 * and 4 metric chips: Documents, Classified %, Avg KQS, Open Gaps.
 *
 * Props:
 *   healthScore     number (0-100)
 *   healthLevel     'EXCELLENT'|'GOOD'|'FAIR'|'POOR'|'CRITICAL'
 *   metrics         { totalDocuments, classifiedPercent, avgKQS, openGaps, totalProcesses }
 *   loading         boolean
 */
import React from 'react';
import { Box, Typography, Stack, Paper, Skeleton, Chip } from '@mui/material';
import { FileText, CheckCircle, BarChart3, AlertTriangle, Network } from 'lucide-react';

const LEVEL_COLOR = {
    EXCELLENT: '#22c55e',
    GOOD:      '#14b8a6',
    FAIR:      '#f59e0b',
    POOR:      '#f97316',
    CRITICAL:  '#ef4444'
};

function Ring({ score, color, size = 120 }) {
    const r  = (size - 16) / 2;
    const cx = size / 2;
    const circ = 2 * Math.PI * r;
    const dash = (score / 100) * circ;

    return (
        <svg width={size} height={size}>
            <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={10} />
            <circle
                cx={cx} cy={cx} r={r}
                fill="none"
                stroke={color}
                strokeWidth={10}
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform={`rotate(-90 ${cx} ${cx})`}
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
            />
        </svg>
    );
}

function MetricCard({ icon: Icon, label, value, color }) {
    return (
        <Paper variant="outlined" sx={{ p: 1.5, flex: 1, minWidth: 80, borderRadius: 2 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                <Icon size={14} color={color || 'inherit'} />
                <Typography variant="caption" color="text.secondary" noWrap>{label}</Typography>
            </Stack>
            <Typography variant="h6" fontWeight={700} sx={{ color: color || 'text.primary', fontSize: '1.1rem' }}>
                {value}
            </Typography>
        </Paper>
    );
}

export default function SystemHealthCard({ healthScore = 0, healthLevel = 'FAIR', metrics = {}, loading = false }) {
    const color = LEVEL_COLOR[healthLevel] || LEVEL_COLOR.FAIR;

    if (loading) {
        return (
            <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
                <Skeleton variant="circular" width={120} height={120} sx={{ mx: 'auto', mb: 2 }} />
                <Stack direction="row" spacing={1}>
                    {[1,2,3,4].map(i => <Skeleton key={i} variant="rectangular" height={64} sx={{ flex: 1, borderRadius: 1 }} />)}
                </Stack>
            </Paper>
        );
    }

    return (
        <Paper variant="outlined" sx={{ p: 2.5, borderRadius: 2 }}>
            <Typography variant="subtitle2" fontWeight={700} gutterBottom>System Health</Typography>

            {/* Ring */}
            <Box sx={{ position: 'relative', width: 120, height: 120, mx: 'auto', mb: 2 }}>
                <Ring score={healthScore} color={color} size={120} />
                <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                           alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="h5" fontWeight={800} sx={{ color, lineHeight: 1 }}>
                        {healthScore}%
                    </Typography>
                    <Typography variant="caption" sx={{ color, fontWeight: 600, fontSize: 9 }}>
                        {healthLevel}
                    </Typography>
                </Box>
            </Box>

            {/* Metric cards */}
            <Stack direction="row" spacing={1} flexWrap="wrap">
                <MetricCard icon={FileText}      label="Documents"    value={metrics.totalDocuments ?? '—'} />
                <MetricCard icon={CheckCircle}   label="Classified"   value={`${metrics.classifiedPercent ?? 0}%`} color="#14b8a6" />
                <MetricCard icon={BarChart3}     label="Avg KQS"      value={metrics.avgKQS ?? '—'} color="#3b82f6" />
                <MetricCard icon={AlertTriangle} label="Open Gaps"    value={metrics.openGaps ?? '—'} color={metrics.openGaps > 0 ? '#f59e0b' : undefined} />
            </Stack>

            {metrics.totalProcesses !== undefined && (
                <Box sx={{ mt: 1, textAlign: 'center' }}>
                    <Chip
                        icon={<Network size={12} />}
                        label={`${metrics.totalProcesses} processes`}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: 11 }}
                    />
                </Box>
            )}
        </Paper>
    );
}
