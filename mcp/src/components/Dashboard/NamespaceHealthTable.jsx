/**
 * NamespaceHealthTable — sortable namespace overview table
 *
 * Columns: Namespace | Docs | Completeness (bar) | Avg KQS | Gaps | Health
 * Click row → onSelect(namespace)
 *
 * Props:
 *   namespaces         array of namespace summary objects
 *   selectedNamespace  string | null
 *   onSelect           (namespace: string) => void
 *   loading            boolean
 */
import React, { useState, useMemo } from 'react';
import {
    Box, Table, TableHead, TableBody, TableRow, TableCell,
    TableSortLabel, LinearProgress, Typography, Chip, Skeleton, Paper
} from '@mui/material';

const LEVEL_COLOR = {
    EXCELLENT: '#22c55e',
    GOOD:      '#14b8a6',
    FAIR:      '#f59e0b',
    POOR:      '#f97316',
    CRITICAL:  '#ef4444'
};

const LEVEL_EMOJI = {
    EXCELLENT: '🟢',
    GOOD:      '🟢',
    FAIR:      '🟡',
    POOR:      '🟠',
    CRITICAL:  '🔴'
};

const COLS = [
    { id: 'namespace',    label: 'Namespace',     numeric: false },
    { id: 'documentCount', label: 'Docs',         numeric: true  },
    { id: 'completeness', label: 'Completeness',  numeric: true  },
    { id: 'avgKQS',       label: 'Avg KQS',       numeric: true  },
    { id: 'openGaps',     label: 'Gaps',          numeric: true  },
    { id: 'healthScore',  label: 'Health',        numeric: true  }
];

export default function NamespaceHealthTable({ namespaces = [], selectedNamespace, onSelect, loading = false }) {
    const [order,   setOrder]   = useState('desc');
    const [orderBy, setOrderBy] = useState('healthScore');

    function handleSort(col) {
        const isAsc = orderBy === col && order === 'asc';
        setOrder(isAsc ? 'desc' : 'asc');
        setOrderBy(col);
    }

    const sorted = useMemo(() => {
        return [...namespaces].sort((a, b) => {
            const av = a[orderBy], bv = b[orderBy];
            if (av === bv) return 0;
            const cmp = av < bv ? -1 : 1;
            return order === 'asc' ? cmp : -cmp;
        });
    }, [namespaces, order, orderBy]);

    if (loading) {
        return (
            <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
                {[1,2,3,4,5].map(i => (
                    <Skeleton key={i} variant="rectangular" height={44} sx={{ mb: 0.5 }} />
                ))}
            </Paper>
        );
    }

    if (namespaces.length === 0) {
        return (
            <Paper variant="outlined" sx={{ p: 3, borderRadius: 2, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                    No namespaces found. Documents and processes will appear here once imported.
                </Typography>
            </Paper>
        );
    }

    return (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Table size="small" stickyHeader>
                <TableHead>
                    <TableRow>
                        {COLS.map(col => (
                            <TableCell
                                key={col.id}
                                align={col.numeric ? 'right' : 'left'}
                                sortDirection={orderBy === col.id ? order : false}
                                sx={{ fontWeight: 700, fontSize: 12 }}
                            >
                                <TableSortLabel
                                    active={orderBy === col.id}
                                    direction={orderBy === col.id ? order : 'asc'}
                                    onClick={() => handleSort(col.id)}
                                >
                                    {col.label}
                                </TableSortLabel>
                            </TableCell>
                        ))}
                    </TableRow>
                </TableHead>
                <TableBody>
                    {sorted.map(ns => {
                        const selected = ns.namespace === selectedNamespace;
                        const color    = LEVEL_COLOR[ns.healthLevel] || LEVEL_COLOR.FAIR;
                        return (
                            <TableRow
                                key={ns.namespace}
                                hover
                                selected={selected}
                                onClick={() => onSelect?.(ns.namespace)}
                                sx={{ cursor: 'pointer',
                                      '&.Mui-selected': { bgcolor: 'primary.main' + '22' } }}
                            >
                                <TableCell sx={{ fontWeight: selected ? 700 : 400, fontSize: 12 }}>
                                    {ns.namespace}
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: 12 }}>{ns.documentCount}</TableCell>
                                <TableCell align="right" sx={{ width: 140 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'flex-end' }}>
                                        <Box sx={{ width: 80 }}>
                                            <LinearProgress
                                                variant="determinate"
                                                value={Math.round(ns.completeness * 100)}
                                                sx={{ height: 6, borderRadius: 3,
                                                      '& .MuiLinearProgress-bar': { bgcolor: color } }}
                                            />
                                        </Box>
                                        <Typography variant="caption" sx={{ minWidth: 32, textAlign: 'right' }}>
                                            {Math.round(ns.completeness * 100)}%
                                        </Typography>
                                    </Box>
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: 12 }}>
                                    {ns.avgKQS.toFixed(2)}
                                </TableCell>
                                <TableCell align="right">
                                    {ns.openGaps > 0 ? (
                                        <Chip label={ns.openGaps} size="small"
                                            sx={{ height: 18, fontSize: 10, bgcolor: '#f59e0b22', color: '#f59e0b' }} />
                                    ) : (
                                        <Typography variant="caption" color="text.disabled">0</Typography>
                                    )}
                                </TableCell>
                                <TableCell align="right">
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                                        <Typography sx={{ fontSize: 14 }}>{LEVEL_EMOJI[ns.healthLevel] || '⚪'}</Typography>
                                        <Typography variant="caption" sx={{ color, fontWeight: 600 }}>
                                            {ns.healthScore}
                                        </Typography>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>

            {/* Legend */}
            <Box sx={{ px: 2, py: 1, borderTop: 1, borderColor: 'divider' }}>
                <Typography variant="caption" color="text.disabled">
                    Health: 🟢 ≥70 &nbsp; 🟡 ≥50 &nbsp; 🟠 ≥30 &nbsp; 🔴 &lt;30
                </Typography>
            </Box>
        </Paper>
    );
}
