/**
 * TriangleDetail — Full Knowledge Triangle view for one process
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ Header: process name, completeness chip, close btn  │
 *   ├─────────────────────────────────────────────────────┤
 *   │ TriangleDiagram (SVG, centered)                     │
 *   ├─────────────────────────────────────────────────────┤
 *   │ Tabs: Normative | Operational | Empirical | Gaps    │
 *   ├─────────────────────────────────────────────────────┤
 *   │ DocumentVertex or GapList content                   │
 *   └─────────────────────────────────────────────────────┘
 *
 * Click on a triangle vertex → switches to that tab.
 * Click on a gap row → opens GapPanel.
 *
 * Props:
 *   processId       string
 *   onClose         () => void
 *   onViewDocument  (docId) => void
 *   onLinkDocument  (processId, vertexType) => void
 *   initialTab      number  — optional
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Stack, Chip, Tabs, Tab, Button,
    CircularProgress, Alert, Divider, IconButton,
    Paper
} from '@mui/material';
import { X, RefreshCw, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';
import TriangleDiagram from './TriangleDiagram';
import DocumentVertex from './DocumentVertex';
import GapPanel from './GapPanel';

const VERTEX_TAB_MAP = { normative: 0, operational: 1, empirical: 2 };
const COMPLETENESS_COLORS = { full: '#22c55e', partial: '#f59e0b', minimal: '#f97316', none: '#94a3b8' };

function TabPanel({ value, index, children }) {
    return value === index ? <Box sx={{ pt: 1.5 }}>{children}</Box> : null;
}

export default function TriangleDetail({ processId, onClose, onViewDocument, onLinkDocument, initialTab = 0 }) {
    const [data,        setData]        = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState(null);
    const [tab,         setTab]         = useState(initialTab);
    const [selectedGap, setSelectedGap] = useState(null);
    const [highlightV,  setHighlightV]  = useState(null);

    const load = useCallback(async () => {
        if (!processId) return;
        setLoading(true); setError(null);
        try {
            const { data: resp } = await axios.get(`${API_BASE_URL}/explorer/processes/${processId}/triangle`);
            setData(resp.data);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        }
        setLoading(false);
    }, [processId]);

    useEffect(() => { load(); }, [load]);

    function handleVertexClick(vertexType) {
        setHighlightV(vertexType);
        setTab(VERTEX_TAB_MAP[vertexType] ?? 0);
    }

    async function handleRemoveLink(docId) {
        try {
            await axios.delete(`${API_BASE_URL}/explorer/processes/${processId}/link/${docId}`);
            load();
        } catch (e) {
            console.error('Remove link failed:', e.message);
        }
    }

    async function handleGapStatusChange(gapId, newStatus, resolution) {
        try {
            await axios.patch(`${API_BASE_URL}/explorer/gaps/${gapId}/status`, { status: newStatus, resolution });
            setSelectedGap(null);
            load();
        } catch (e) {
            console.error('Gap update failed:', e.message);
        }
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 6, gap: 2 }}>
                <CircularProgress size={22} />
                <Typography variant="body2" color="text.secondary">Loading triangle…</Typography>
            </Box>
        );
    }
    if (error) return <Alert severity="error">{error}</Alert>;
    if (!data)  return <Alert severity="info">Process not found.</Alert>;

    const { process, completeness, normative, operational, empirical, gaps } = data;
    const compLabel  = completeness?.label || 'none';
    const compColor  = COMPLETENESS_COLORS[compLabel];
    const compPct    = Math.round((completeness?.score ?? 0) * 100);
    const openGaps   = gaps.filter(g => g.status === 'OPEN').length;

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            {/* ── Header ── */}
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between"
                sx={{ p: 2, pb: 1, flexShrink: 0 }}>
                <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
                    <Typography variant="subtitle1" fontWeight={700} noWrap gutterBottom>
                        {process.name}
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                        <Chip
                            label={`${compPct}% complete`}
                            size="small"
                            sx={{ bgcolor: compColor + '22', color: compColor,
                                  border: `1px solid ${compColor}66`, fontWeight: 700 }}
                        />
                        {openGaps > 0 && (
                            <Chip
                                icon={<AlertTriangle size={11} />}
                                label={`${openGaps} open gap${openGaps > 1 ? 's' : ''}`}
                                size="small"
                                color="warning"
                                variant="outlined"
                            />
                        )}
                        {completeness?.missingVertices?.map(v => (
                            <Chip key={v} label={`No ${v.toLowerCase()}`} size="small"
                                variant="outlined" color="error" sx={{ fontSize: 12 }} />
                        ))}
                    </Stack>
                </Box>
                <Stack direction="row" spacing={0.5}>
                    <IconButton size="small" onClick={load} title="Refresh">
                        <RefreshCw size={15} />
                    </IconButton>
                    {onClose && (
                        <IconButton size="small" onClick={onClose}>
                            <X size={15} />
                        </IconButton>
                    )}
                </Stack>
            </Stack>

            <Divider />

            {/* ── Gap panel overlay ── */}
            {selectedGap && (
                <Box sx={{ p: 2, flexShrink: 0, borderBottom: 1, borderColor: 'divider' }}>
                    <GapPanel
                        gap={selectedGap}
                        onStatusChange={handleGapStatusChange}
                        onClose={() => setSelectedGap(null)}
                    />
                </Box>
            )}

            {/* ── Triangle diagram ── */}
            {!selectedGap && (
                <Box sx={{ py: 2, flexShrink: 0 }}>
                    <TriangleDiagram
                        process={process}
                        completeness={completeness}
                        counts={{
                            normative:   normative.length,
                            operational: operational.length,
                            empirical:   empirical.length,
                            gaps:        openGaps
                        }}
                        onVertexClick={handleVertexClick}
                        highlightVertex={highlightV}
                    />
                </Box>
            )}

            <Divider />

            {/* ── Tabs ── */}
            <Tabs value={tab} onChange={(_, v) => { setTab(v); setHighlightV(null); }}
                sx={{ flexShrink: 0, borderBottom: 1, borderColor: 'divider', px: 1 }}>
                <Tab label={`Normative (${normative.length})`}    sx={{ minHeight: 40, py: 0.5, fontSize: 13 }} />
                <Tab label={`Operational (${operational.length})`} sx={{ minHeight: 40, py: 0.5, fontSize: 13 }} />
                <Tab label={`Empirical (${empirical.length})`}    sx={{ minHeight: 40, py: 0.5, fontSize: 13 }} />
                <Tab label={`Gaps (${gaps.length})`}              sx={{ minHeight: 40, py: 0.5, fontSize: 13,
                    color: gaps.length > 0 ? 'warning.main' : undefined }} />
            </Tabs>

            {/* ── Tab content ── */}
            <Box sx={{ flex: 1, overflow: 'auto', p: 2 }}>
                <TabPanel value={tab} index={0}>
                    <DocumentVertex
                        vertexType="normative"
                        documents={normative}
                        processId={processId}
                        onViewDocument={onViewDocument}
                        onRemoveLink={handleRemoveLink}
                        onAddDocument={() => onLinkDocument?.(processId, 'normative')}
                    />
                </TabPanel>
                <TabPanel value={tab} index={1}>
                    <DocumentVertex
                        vertexType="operational"
                        documents={operational}
                        processId={processId}
                        onViewDocument={onViewDocument}
                        onRemoveLink={handleRemoveLink}
                        onAddDocument={() => onLinkDocument?.(processId, 'operational')}
                    />
                </TabPanel>
                <TabPanel value={tab} index={2}>
                    <DocumentVertex
                        vertexType="empirical"
                        documents={empirical}
                        processId={processId}
                        onViewDocument={onViewDocument}
                        onRemoveLink={handleRemoveLink}
                        onAddDocument={() => onLinkDocument?.(processId, 'empirical')}
                    />
                </TabPanel>
                <TabPanel value={tab} index={3}>
                    <GapList
                        gaps={gaps}
                        onSelectGap={setSelectedGap}
                    />
                </TabPanel>
            </Box>
        </Box>
    );
}

// ─── Gap list sub-component ────────────────────────────────────────────────────

const SEVERITY_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e' };
const STATUS_COLORS   = { OPEN: '#ef4444', ACKNOWLEDGED: '#f59e0b', ADDRESSED: '#3b82f6', CLOSED: '#22c55e' };

function GapList({ gaps, onSelectGap }) {
    if (gaps.length === 0) {
        return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary" gutterBottom>No gaps detected</Typography>
                <Typography variant="caption" color="text.disabled">
                    Gaps are created when L4 empirical documents reveal deficiencies in process coverage.
                </Typography>
            </Box>
        );
    }

    return (
        <Stack spacing={0.75}>
            {gaps.map(gap => (
                <Paper key={gap.id} variant="outlined"
                    onClick={() => onSelectGap(gap)}
                    sx={{ p: 1.25, cursor: 'pointer', borderRadius: 1.5,
                          '&:hover': { borderColor: 'primary.main' } }}>
                    <Stack direction="row" alignItems="flex-start" justifyContent="space-between">
                        <Stack direction="row" spacing={1} alignItems="flex-start">
                            <AlertTriangle size={14} color={SEVERITY_COLORS[gap.severity]} style={{ marginTop: 2 }} />
                            <Box>
                                <Typography variant="body2" fontWeight={600}>{gap.title || 'Untitled Gap'}</Typography>
                                <Stack direction="row" spacing={0.75} sx={{ mt: 0.25 }}>
                                    <Chip label={gap.severity || '?'} size="small"
                                        sx={{ height: 16, fontSize: 12,
                                              bgcolor: (SEVERITY_COLORS[gap.severity] || '#94a3b8') + '22',
                                              color: SEVERITY_COLORS[gap.severity] || '#94a3b8' }} />
                                    {gap.ageDays != null && (
                                        <Typography variant="caption" color={gap.isStale ? 'warning.main' : 'text.disabled'}>
                                            {gap.ageDays}d old{gap.isStale ? ' ⚠' : ''}
                                        </Typography>
                                    )}
                                </Stack>
                            </Box>
                        </Stack>
                        <Chip label={gap.status} size="small"
                            sx={{ fontSize: 12, height: 18,
                                  color: STATUS_COLORS[gap.status] || '#94a3b8',
                                  bgcolor: (STATUS_COLORS[gap.status] || '#94a3b8') + '18' }} />
                    </Stack>
                </Paper>
            ))}
        </Stack>
    );
}
