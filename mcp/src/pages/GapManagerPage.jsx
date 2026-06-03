/**
 * GapManagerPage  /gaps
 *
 * Centralised gap management across all processes and namespaces.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ Header: title + namespace + Export button                    │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ GapDashboard (collapsible summary)                           │
 *   ├──────────────────────────────────────────────────────────────┤
 *   │ GapList (flex, with bulk actions)   │ GapDetail (side panel)│
 *   └──────────────────────────────────────────────────────────────┘
 *
 * URL state: /gaps?status=OPEN&severity=HIGH
 */
import React, { useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Box, Typography, Stack, Chip, Divider, FormControl,
    InputLabel, Select, MenuItem, Paper, Button, Alert,
    Collapse, IconButton
} from '@mui/material';
import { AlertTriangle, Download, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';

import GapDashboard from '../components/Gaps/GapDashboard';
import GapList from '../components/Gaps/GapList';
import GapDetail from '../components/Gaps/GapDetail';
import { API_BASE_URL } from '../config/api.config';

const NAMESPACES = ['', 'DEFAULT', 'KM', 'HR', 'FINANCE', 'PROCUREMENT', 'LEGAL', 'IT', 'AUDIT', 'CORE'];

export default function GapManagerPage() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();

    const [namespace,     setNamespace]     = useState(params.get('namespace') || '');
    const [selectedGap,   setSelectedGap]   = useState(null);
    const [selectedIds,   setSelectedIds]   = useState([]);
    const [dashExpanded,  setDashExpanded]  = useState(true);
    const [notification,  setNotification]  = useState(null);
    const [listFilters,   setListFilters]   = useState({
        status:   params.get('status')   || '',
        severity: params.get('severity') || ''
    });

    function notify(type, msg) {
        setNotification({ type, msg });
        setTimeout(() => setNotification(null), 5000);
    }

    function handleSelectGap(gap) {
        setSelectedGap(gap);
    }

    function handleFilterChange(filters) {
        setListFilters(prev => ({ ...prev, ...filters }));
        const next = new URLSearchParams(params);
        Object.entries(filters).forEach(([k, v]) => {
            if (v) next.set(k, String(v)); else next.delete(k);
        });
        setParams(next, { replace: true });
    }

    async function handleBulkAction(action, gapIds, actionParams) {
        try {
            const { data } = await axios.post(`${API_BASE_URL}/gaps/bulk`, {
                gapIds, action, params: actionParams
            });
            notify('success', `Bulk ${action}: ${data.data.succeeded} succeeded, ${data.data.failed} failed`);
            setSelectedGap(null);
        } catch (e) {
            notify('error', e.response?.data?.error || e.message);
        }
    }

    async function handleExport() {
        try {
            const params = new URLSearchParams({ format: 'csv', namespace });
            if (listFilters.status)   params.set('status', listFilters.status);
            if (listFilters.severity) params.set('severity', listFilters.severity);
            const url = `${API_BASE_URL}/gaps/export?${params}`;
            window.open(url, '_blank');
        } catch (e) {
            notify('error', 'Export failed: ' + e.message);
        }
    }

    function handleViewTriangle(processId) {
        navigate('/knowledge-triangle', { state: { highlightDocumentId: processId } });
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* ── Header ── */}
            <Stack direction="row" alignItems="center" justifyContent="space-between"
                sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <AlertTriangle size={20} />
                    <Typography variant="h6" fontWeight={700}>Gap Manager</Typography>
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Button
                        size="small"
                        variant="outlined"
                        startIcon={<Download size={13} />}
                        onClick={handleExport}
                    >
                        Export CSV
                    </Button>
                    <Divider orientation="vertical" flexItem />
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel>Namespace</InputLabel>
                        <Select value={namespace} label="Namespace" onChange={e => setNamespace(e.target.value)}>
                            <MenuItem value=""><em>All namespaces</em></MenuItem>
                            {NAMESPACES.filter(Boolean).map(ns => (
                                <MenuItem key={ns} value={ns}>{ns}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
            </Stack>

            {notification && (
                <Alert severity={notification.type} sx={{ mx: 2.5, mt: 1 }} onClose={() => setNotification(null)}>
                    {notification.msg}
                </Alert>
            )}

            {/* ── Dashboard ── */}
            <Box sx={{ px: 2.5, pt: 1.5, flexShrink: 0 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2" fontWeight={700}>Overview</Typography>
                    <IconButton size="small" onClick={() => setDashExpanded(v => !v)}>
                        {dashExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </IconButton>
                </Stack>
                <Collapse in={dashExpanded}>
                    <GapDashboard namespace={namespace || undefined} onFilterChange={handleFilterChange} />
                </Collapse>
            </Box>

            <Divider sx={{ mt: 1.5 }} />

            {/* ── Main: List + Detail ── */}
            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', gap: 0 }}>

                {/* Left: Gap list */}
                <Box sx={{ flex: selectedGap ? '0 0 60%' : 1, overflow: 'hidden', display: 'flex',
                           flexDirection: 'column', p: 2 }}>
                    <Typography variant="subtitle2" fontWeight={700} gutterBottom>Gaps</Typography>
                    <Box sx={{ flex: 1, overflow: 'hidden' }}>
                        <GapList
                            namespace={namespace || undefined}
                            initialFilters={listFilters}
                            onSelectGap={handleSelectGap}
                            selectedGapIds={selectedIds}
                            onSelectionChange={setSelectedIds}
                            onBulkAction={handleBulkAction}
                        />
                    </Box>
                </Box>

                {/* Right: Gap detail */}
                {selectedGap && (
                    <>
                        <Divider orientation="vertical" flexItem />
                        <Box sx={{ flex: '0 0 40%', overflow: 'auto', p: 2 }}>
                            <GapDetail
                                gap={selectedGap}
                                onClose={() => setSelectedGap(null)}
                                onUpdate={() => {
                                    setSelectedGap(null);
                                }}
                                onViewTriangle={handleViewTriangle}
                            />
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}
