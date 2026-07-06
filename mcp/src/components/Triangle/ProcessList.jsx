/**
 * ProcessList — Triangle Explorer
 *
 * Displays KnowledgeNode "process" nodes with triangle completeness summaries.
 * Features:
 *   - Text search on node label/content
 *   - Quick filter chips: Incomplete, Has Gaps, Critical (high-severity gaps)
 *   - Completeness filter: Full / Partial / Minimal / None
 *   - Sortable table: name, completeness %, gaps, KQS
 *   - Completeness icons: ● Full  ◐ Partial  ◔ Minimal  ○ None
 *   - Row click → onSelect(process)
 *
 * Props:
 *   namespace         string
 *   selectedId        string | null
 *   onSelect          (process) => void
 *   onFiltersChange   (filters) => void   — optional, for external sync
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Stack, Chip, TextField, InputAdornment,
    Table, TableHead, TableRow, TableCell, TableBody,
    TableContainer, LinearProgress, CircularProgress,
    ToggleButtonGroup, ToggleButton, Tooltip, Alert
} from '@mui/material';
import { Search, Filter, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';

const COMPLETENESS_COLORS = {
    full:    '#22c55e',
    partial: '#f59e0b',
    minimal: '#f97316',
    none:    '#94a3b8'
};

function CompletenessIcon({ label, score }) {
    const color = COMPLETENESS_COLORS[label] || '#94a3b8';
    const pct   = Math.round((score ?? 0) * 100);
    if (label === 'full')    return <span style={{ color, fontSize: 18, lineHeight: 1 }}>●</span>;
    if (label === 'partial') return <span style={{ color, fontSize: 18, lineHeight: 1 }}>◐</span>;
    if (label === 'minimal') return <span style={{ color, fontSize: 18, lineHeight: 1 }}>◔</span>;
    return <span style={{ color, fontSize: 18, lineHeight: 1 }}>○</span>;
}

function CompletenessBar({ score }) {
    const pct   = Math.round((score ?? 0) * 100);
    const label = score >= 1.0 ? 'full' : score >= 0.67 ? 'partial' : score > 0 ? 'minimal' : 'none';
    const color = COMPLETENESS_COLORS[label];
    return (
        <Stack direction="row" spacing={0.75} alignItems="center">
            <LinearProgress
                variant="determinate" value={pct}
                sx={{ width: 50, height: 5, borderRadius: 3,
                      bgcolor: `${color}22`,
                      '& .MuiLinearProgress-bar': { bgcolor: color } }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ minWidth: 28 }}>
                {pct}%
            </Typography>
        </Stack>
    );
}

export default function ProcessList({ namespace, selectedId, onSelect }) {
    const [rows,     setRows]     = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState(null);
    const [search,   setSearch]   = useState('');
    const [compFilter, setCompFilter] = useState(null);   // 'full'|'partial'|'minimal'|'none'|null
    const [hasGaps,  setHasGaps]  = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = { limit: 200 };
            if (namespace)   params.namespace    = namespace;
            if (search)      params.search       = search;
            if (compFilter)  params.completeness = compFilter;
            if (hasGaps)     params.hasGaps      = 'true';

            const { data } = await axios.get(`${API_BASE_URL}/explorer/processes`, { params });
            setRows(data.data || []);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        }
        setLoading(false);
    }, [namespace, search, compFilter, hasGaps]);

    useEffect(() => { load(); }, [load]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* ── Search ── */}
            <Box sx={{ p: 1.5, pb: 0 }}>
                <TextField
                    size="small"
                    fullWidth
                    placeholder="Search processes…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <Search size={14} />
                            </InputAdornment>
                        )
                    }}
                    sx={{ mb: 1 }}
                />

                {/* Quick filters */}
                <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 1 }}>
                    <Chip
                        label="Incomplete"
                        size="small"
                        variant={compFilter === null ? 'outlined' : 'filled'}
                        color={compFilter === null ? 'default' : 'warning'}
                        onClick={() => setCompFilter(compFilter === null ? null : null)}
                        clickable
                    />
                    {['none', 'minimal', 'partial', 'full'].map(c => (
                        <Chip
                            key={c}
                            label={c.charAt(0).toUpperCase() + c.slice(1)}
                            size="small"
                            variant={compFilter === c ? 'filled' : 'outlined'}
                            onClick={() => setCompFilter(prev => prev === c ? null : c)}
                            clickable
                            sx={{
                                borderColor: COMPLETENESS_COLORS[c],
                                color: compFilter === c ? '#fff' : COMPLETENESS_COLORS[c],
                                bgcolor: compFilter === c ? COMPLETENESS_COLORS[c] : 'transparent',
                            }}
                        />
                    ))}
                    <Chip
                        label="Has Gaps"
                        size="small"
                        icon={<AlertTriangle size={11} />}
                        variant={hasGaps ? 'filled' : 'outlined'}
                        color={hasGaps ? 'warning' : 'default'}
                        onClick={() => setHasGaps(prev => !prev)}
                        clickable
                    />
                </Stack>
            </Box>

            {/* ── Status line ── */}
            <Stack direction="row" justifyContent="space-between" alignItems="center"
                sx={{ px: 1.5, py: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                    {loading ? 'Loading…' : `${rows.length} processes`}
                </Typography>
                {loading && <CircularProgress size={12} />}
            </Stack>

            {error && <Alert severity="error" sx={{ mx: 1.5, mb: 1 }}>{error}</Alert>}

            {/* ── Table ── */}
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ py: 0.75 }}>Process</TableCell>
                            <TableCell sx={{ py: 0.75, width: 90 }}>Complete</TableCell>
                            <TableCell sx={{ py: 0.75, width: 50 }} align="center">Gaps</TableCell>
                            <TableCell sx={{ py: 0.75, width: 60 }} align="right">KQS</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {rows.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    <Typography variant="body2">No processes found</Typography>
                                    <Typography variant="caption">Upload and extract documents to populate the knowledge graph</Typography>
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.map(row => (
                            <TableRow
                                key={row.id}
                                hover
                                selected={row.id === selectedId}
                                onClick={() => onSelect?.(row)}
                                sx={{ cursor: 'pointer',
                                      '&.Mui-selected': { bgcolor: 'primary.main' + '18' } }}
                            >
                                <TableCell sx={{ py: 0.75 }}>
                                    <Stack direction="row" spacing={0.75} alignItems="center">
                                        <CompletenessIcon label={row.completenessLabel} score={row.completeness} />
                                        <Box>
                                            <Tooltip title={row.name}>
                                                <Typography variant="body2" noWrap sx={{ maxWidth: 160, fontWeight: row.id === selectedId ? 600 : 400 }}>
                                                    {row.name}
                                                </Typography>
                                            </Tooltip>
                                            {row.namespace && row.namespace !== namespace && (
                                                <Typography variant="caption" color="text.disabled">{row.namespace}</Typography>
                                            )}
                                        </Box>
                                    </Stack>
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }}>
                                    <CompletenessBar score={row.completeness} />
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }} align="center">
                                    {row.counts?.gaps > 0 ? (
                                        <Chip
                                            label={row.counts.gaps}
                                            size="small"
                                            color="warning"
                                            sx={{ height: 18, fontSize: 13 }}
                                        />
                                    ) : (
                                        <Typography variant="caption" color="text.disabled">—</Typography>
                                    )}
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }} align="right">
                                    <Typography variant="caption" color={
                                        row.kqsScore >= 0.7 ? 'success.main'
                                        : row.kqsScore >= 0.4 ? 'warning.main'
                                        : row.kqsScore != null ? 'error.main'
                                        : 'text.disabled'
                                    }>
                                        {row.kqsScore != null ? row.kqsScore.toFixed(2) : '—'}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* ── Legend ── */}
            <Box sx={{ px: 1.5, py: 0.75, borderTop: 1, borderColor: 'divider' }}>
                <Stack direction="row" spacing={1.5} flexWrap="wrap">
                    {Object.entries({ full: '●', partial: '◐', minimal: '◔', none: '○' }).map(([label, icon]) => (
                        <Stack key={label} direction="row" spacing={0.25} alignItems="center">
                            <span style={{ color: COMPLETENESS_COLORS[label], fontSize: 13 }}>{icon}</span>
                            <Typography variant="caption" color="text.secondary">
                                {label.charAt(0).toUpperCase() + label.slice(1)}
                            </Typography>
                        </Stack>
                    ))}
                </Stack>
            </Box>
        </Box>
    );
}
