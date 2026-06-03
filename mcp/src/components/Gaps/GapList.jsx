/**
 * GapList — Paginated, filterable gap table with bulk operations
 *
 * Features:
 *   - Text search
 *   - Filter dropdowns: Status, Severity, Age range
 *   - Checkbox row selection for bulk actions
 *   - Sortable columns: ID, Process, Type, Severity, Age, Status
 *   - Severity indicators: ● HIGH (red), ◐ MEDIUM (amber), ◔ LOW (green)
 *   - Stale warning (⚠) for > 90 days
 *   - Pagination (25 per page)
 *   - Bulk action menu: Acknowledge / Snooze (7/14/30d) / Close / Escalate
 *
 * Props:
 *   namespace          string
 *   initialFilters     object
 *   onSelectGap        (gap) => void
 *   selectedGapIds     string[]
 *   onSelectionChange  (ids) => void
 *   onBulkAction       (action, gapIds, params) => void
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Stack, Chip, TextField, InputAdornment,
    Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
    Checkbox, CircularProgress, Alert, MenuItem, Select, FormControl,
    InputLabel, Button, Menu, LinearProgress, Tooltip, Divider,
    TablePagination
} from '@mui/material';
import { Search, ChevronDown, AlertTriangle, Clock } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';

const SEVERITY_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e' };
const STATUS_COLORS   = {
    OPEN:         '#ef4444',
    ACKNOWLEDGED: '#f59e0b',
    ADDRESSED:    '#3b82f6',
    CLOSED:       '#22c55e'
};

function SevIcon({ severity }) {
    const color = SEVERITY_COLORS[severity] || '#94a3b8';
    if (severity === 'HIGH')   return <span style={{ color, fontSize: 14 }}>●</span>;
    if (severity === 'MEDIUM') return <span style={{ color, fontSize: 14 }}>◐</span>;
    if (severity === 'LOW')    return <span style={{ color, fontSize: 14 }}>◔</span>;
    return <span style={{ color, fontSize: 14 }}>○</span>;
}

const BULK_ACTIONS = [
    { key: 'acknowledge', label: 'Acknowledge Selected' },
    { key: 'address',     label: 'Mark as Addressed' },
    { divider: true },
    { key: 'snooze7',     label: 'Snooze 7 days',   sub: { action: 'snooze', params: { days: 7 } } },
    { key: 'snooze14',    label: 'Snooze 14 days',  sub: { action: 'snooze', params: { days: 14 } } },
    { key: 'snooze30',    label: 'Snooze 30 days',  sub: { action: 'snooze', params: { days: 30 } } },
    { divider: true },
    { key: 'escalate',    label: 'Escalate Selected' },
    { key: 'close',       label: 'Close Selected',  danger: true },
];

export default function GapList({ namespace, initialFilters = {}, onSelectGap, selectedGapIds = [], onSelectionChange, onBulkAction }) {
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState(null);
    const [page,    setPage]    = useState(0);
    const [rowsPerPage]         = useState(25);

    // Filters
    const [search,   setSearch]   = useState(initialFilters.search   || '');
    const [status,   setStatus]   = useState(initialFilters.status   || '');
    const [severity, setSeverity] = useState(initialFilters.severity || '');
    const [minAge,   setMinAge]   = useState(initialFilters.minAgeDays || '');

    // Bulk menu
    const [bulkAnchor, setBulkAnchor] = useState(null);

    const load = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const params = { limit: 200, offset: 0 };
            if (namespace) params.namespace = namespace;
            if (search)    params.search    = search;
            if (status)    params.status    = status;
            if (severity)  params.severity  = severity;
            if (minAge)    params.minAgeDays = minAge;
            const { data } = await axios.get(`${API_BASE_URL}/gaps/list`, { params });
            setRows(data.data || []);
            setPage(0);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        }
        setLoading(false);
    }, [namespace, search, status, severity, minAge]);

    useEffect(() => { load(); }, [load]);

    // Pagination
    const pageRows = rows.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

    // Selection helpers
    const allSelected  = pageRows.length > 0 && pageRows.every(r => selectedGapIds.includes(r.id));
    const someSelected = pageRows.some(r => selectedGapIds.includes(r.id));

    function toggleAll() {
        const pageIds = pageRows.map(r => r.id);
        if (allSelected) {
            onSelectionChange?.(selectedGapIds.filter(id => !pageIds.includes(id)));
        } else {
            onSelectionChange?.([...new Set([...selectedGapIds, ...pageIds])]);
        }
    }

    function toggleRow(id) {
        if (selectedGapIds.includes(id)) {
            onSelectionChange?.(selectedGapIds.filter(i => i !== id));
        } else {
            onSelectionChange?.([...selectedGapIds, id]);
        }
    }

    async function handleBulkAction(item) {
        setBulkAnchor(null);
        if (!selectedGapIds.length) return;
        const action = item.sub?.action || item.key;
        const params = item.sub?.params || {};
        await onBulkAction?.(action, selectedGapIds, params);
        onSelectionChange?.([]);
        load();
    }

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* ── Filters ── */}
            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 1.5 }}>
                <TextField
                    size="small"
                    placeholder="Search gaps…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    sx={{ width: 200 }}
                    InputProps={{
                        startAdornment: <InputAdornment position="start"><Search size={13} /></InputAdornment>
                    }}
                />
                <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>Status</InputLabel>
                    <Select value={status} label="Status" onChange={e => setStatus(e.target.value)}>
                        <MenuItem value="">All Statuses</MenuItem>
                        {['OPEN','ACKNOWLEDGED','ADDRESSED','CLOSED'].map(s => (
                            <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Severity</InputLabel>
                    <Select value={severity} label="Severity" onChange={e => setSeverity(e.target.value)}>
                        <MenuItem value="">All Severities</MenuItem>
                        {['HIGH','MEDIUM','LOW'].map(s => (
                            <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
                <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>Min Age</InputLabel>
                    <Select value={minAge} label="Min Age" onChange={e => setMinAge(e.target.value)}>
                        <MenuItem value="">Any Age</MenuItem>
                        <MenuItem value="30">30+ days</MenuItem>
                        <MenuItem value="60">60+ days</MenuItem>
                        <MenuItem value="90">90+ days (Stale)</MenuItem>
                        <MenuItem value="180">180+ days (Review)</MenuItem>
                    </Select>
                </FormControl>
            </Stack>

            {/* ── Toolbar ── */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="caption" color="text.secondary">
                        {loading ? 'Loading…' : `${rows.length} gaps`}
                    </Typography>
                    {loading && <CircularProgress size={12} />}
                </Stack>
                {selectedGapIds.length > 0 && (
                    <Stack direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="primary.main" fontWeight={600}>
                            {selectedGapIds.length} selected
                        </Typography>
                        <Button
                            size="small"
                            variant="outlined"
                            endIcon={<ChevronDown size={13} />}
                            onClick={e => setBulkAnchor(e.currentTarget)}
                        >
                            Bulk Actions
                        </Button>
                        <Menu anchorEl={bulkAnchor} open={Boolean(bulkAnchor)} onClose={() => setBulkAnchor(null)}>
                            {BULK_ACTIONS.map((item, i) => item.divider
                                ? <Divider key={i} />
                                : (
                                    <MenuItem key={item.key}
                                        onClick={() => handleBulkAction(item)}
                                        sx={{ color: item.danger ? 'error.main' : undefined, fontSize: 13 }}>
                                        {item.label}
                                    </MenuItem>
                                )
                            )}
                        </Menu>
                    </Stack>
                )}
            </Stack>

            {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

            {/* ── Table ── */}
            <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell padding="checkbox" sx={{ py: 0.75 }}>
                                <Checkbox size="small" checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} />
                            </TableCell>
                            <TableCell sx={{ py: 0.75 }}>Title / Process</TableCell>
                            <TableCell sx={{ py: 0.75, width: 100 }}>Type</TableCell>
                            <TableCell sx={{ py: 0.75, width: 80 }} align="center">Severity</TableCell>
                            <TableCell sx={{ py: 0.75, width: 70 }} align="right">Age</TableCell>
                            <TableCell sx={{ py: 0.75, width: 110 }}>Status</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {pageRows.length === 0 && !loading && (
                            <TableRow>
                                <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    No gaps found
                                </TableCell>
                            </TableRow>
                        )}
                        {pageRows.map(row => (
                            <TableRow key={row.id} hover
                                onClick={() => onSelectGap?.(row)}
                                sx={{ cursor: 'pointer' }}>
                                <TableCell padding="checkbox" onClick={e => { e.stopPropagation(); toggleRow(row.id); }}>
                                    <Checkbox size="small" checked={selectedGapIds.includes(row.id)} />
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }}>
                                    <Tooltip title={row.title || ''}>
                                        <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                                            {row.isStale && <AlertTriangle size={11} color="#f97316" style={{ marginRight: 4 }} />}
                                            {row.title || 'Untitled Gap'}
                                        </Typography>
                                    </Tooltip>
                                    {row.processName && (
                                        <Typography variant="caption" color="text.disabled" noWrap display="block">
                                            {row.processName}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }}>
                                    <Typography variant="caption" color="text.secondary">{row.gapType || '—'}</Typography>
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }} align="center">
                                    <Stack direction="row" spacing={0.5} alignItems="center" justifyContent="center">
                                        <SevIcon severity={row.severity} />
                                        <Typography variant="caption" color={SEVERITY_COLORS[row.severity] || '#94a3b8'}>
                                            {row.severity || '—'}
                                        </Typography>
                                    </Stack>
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }} align="right">
                                    <Typography variant="caption"
                                        color={row.isStale ? 'warning.main' : 'text.secondary'}>
                                        {row.ageDays != null ? `${row.ageDays}d` : '—'}
                                        {row.isStale ? ' ⚠' : ''}
                                    </Typography>
                                </TableCell>
                                <TableCell sx={{ py: 0.75 }}>
                                    <Chip label={row.status || '?'} size="small"
                                        sx={{ fontSize: 10, height: 18,
                                              color: STATUS_COLORS[row.status] || '#94a3b8',
                                              bgcolor: (STATUS_COLORS[row.status] || '#94a3b8') + '18' }} />
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <TablePagination
                component="div"
                count={rows.length}
                page={page}
                rowsPerPage={rowsPerPage}
                rowsPerPageOptions={[25]}
                onPageChange={(_, p) => setPage(p)}
            />
        </Box>
    );
}
