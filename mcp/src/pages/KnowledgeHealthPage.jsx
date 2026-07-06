/**
 * KnowledgeHealthPage  /knowledge-health
 *
 * Executive dashboard for Knowledge Graph health across namespaces.
 *
 * Layout:
 *   ┌──────────────────────────────────────────────────────────┐
 *   │ Header: title + auto-refresh toggle + last updated       │
 *   ├─────────────────────────┬────────────────────────────────┤
 *   │ SystemHealthCard (top)  │ (selected namespace detail)    │
 *   ├─────────────────────────┤                                │
 *   │ NamespaceHealthTable    │                                │
 *   └─────────────────────────┴────────────────────────────────┘
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Box, Typography, Stack, Button, Paper, Divider, Switch,
    FormControlLabel, Chip
} from '@mui/material';
import { BarChart3, RefreshCw } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

import SystemHealthCard from '../components/Dashboard/SystemHealthCard';
import NamespaceHealthTable from '../components/Dashboard/NamespaceHealthTable';
import NamespaceDetail from '../components/Dashboard/NamespaceDetail';

const REFRESH_INTERVAL_MS = 30000;

export default function KnowledgeHealthPage() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();

    const [system,     setSystem]     = useState(null);
    const [namespaces, setNamespaces] = useState([]);
    const [selectedNs, setSelectedNs] = useState(params.get('ns') || null);
    const [sysLoading, setSysLoading] = useState(true);
    const [nsLoading,  setNsLoading]  = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    const intervalRef = useRef(null);

    const loadData = useCallback(async () => {
        setSysLoading(true);
        setNsLoading(true);
        try {
            const [sysRes, nsRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/knowledge-health/system`),
                axios.get(`${API_BASE_URL}/knowledge-health/namespaces`)
            ]);
            setSystem(sysRes.data.data);
            setNamespaces(nsRes.data.data || []);
            setLastUpdated(new Date());
        } catch (e) {
            console.error('[KnowledgeHealthPage] load error', e.message);
        } finally {
            setSysLoading(false);
            setNsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(loadData, REFRESH_INTERVAL_MS);
        } else {
            clearInterval(intervalRef.current);
        }
        return () => clearInterval(intervalRef.current);
    }, [autoRefresh, loadData]);

    function handleSelectNs(ns) {
        const next = ns === selectedNs ? null : ns;
        setSelectedNs(next);
        const p = new URLSearchParams(params);
        if (next) p.set('ns', next); else p.delete('ns');
        setParams(p, { replace: true });
    }

    function handleNavigate(page, navParams) {
        const search = navParams
            ? '?' + new URLSearchParams(Object.entries(navParams).filter(([, v]) => v)).toString()
            : '';
        navigate(`/${page}${search}`);
    }

    function fmtUpdated(d) {
        if (!d) return '';
        return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between"
                sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: 'divider', flexShrink: 0 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <BarChart3 size={20} />
                    <Typography variant="h6" fontWeight={700}>Knowledge Health</Typography>
                    {system && (
                        <Chip
                            label={`${system.healthLevel} — ${system.healthScore}%`}
                            size="small"
                            sx={{ fontSize: 13, fontWeight: 600 }}
                        />
                    )}
                </Stack>
                <Stack direction="row" spacing={1} alignItems="center">
                    {lastUpdated && (
                        <Typography variant="caption" color="text.disabled">
                            Updated {fmtUpdated(lastUpdated)}
                        </Typography>
                    )}
                    <FormControlLabel
                        control={
                            <Switch
                                size="small"
                                checked={autoRefresh}
                                onChange={e => setAutoRefresh(e.target.checked)}
                            />
                        }
                        label={<Typography variant="caption">Auto-refresh</Typography>}
                        sx={{ m: 0 }}
                    />
                    <Button size="small" variant="outlined" startIcon={<RefreshCw size={12} />}
                        onClick={loadData}>
                        Refresh
                    </Button>
                </Stack>
            </Stack>

            {/* Body */}
            <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

                {/* Left: health card + namespace table */}
                <Box sx={{
                    width: selectedNs ? 420 : '100%',
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    p: 2,
                    gap: 2
                }}>
                    <SystemHealthCard
                        healthScore={system?.healthScore || 0}
                        healthLevel={system?.healthLevel || 'FAIR'}
                        metrics={system?.metrics || {}}
                        loading={sysLoading}
                    />

                    <Box sx={{ flex: 1, overflow: 'auto' }}>
                        <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1 }}>
                            Namespace Health
                        </Typography>
                        <NamespaceHealthTable
                            namespaces={namespaces}
                            selectedNamespace={selectedNs}
                            onSelect={handleSelectNs}
                            loading={nsLoading}
                        />
                    </Box>
                </Box>

                {/* Right: namespace detail */}
                {selectedNs && (
                    <>
                        <Divider orientation="vertical" flexItem />
                        <Box sx={{ flex: 1, overflow: 'hidden', p: 2, display: 'flex', flexDirection: 'column' }}>
                            <NamespaceDetail
                                namespace={selectedNs}
                                onClose={() => handleSelectNs(selectedNs)}
                                onNavigate={handleNavigate}
                            />
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}
