/**
 * GapDetail — Extended gap detail with tabs
 *
 * Tabs:
 *   Details    — full gap info, status update
 *   Escalation — timeline, history, escalation form
 *
 * Props:
 *   gap         object (from gap list)
 *   onClose     () => void
 *   onUpdate    () => void   — called after status/escalation change
 *   onViewTriangle (processId) => void
 */
import React, { useState } from 'react';
import {
    Box, Typography, Stack, Chip, Tabs, Tab, Button,
    Divider, Alert
} from '@mui/material';
import { X, GitBranch } from 'lucide-react';
import axios from 'axios';
import { API_BASE_URL } from '../../config/api.config';
import GapPanel from '../Triangle/GapPanel';
import EscalationPanel from './EscalationPanel';

function TabPanel({ value, index, children }) {
    return value === index ? <Box sx={{ pt: 1.5 }}>{children}</Box> : null;
}

const SEVERITY_COLORS = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#22c55e' };

export default function GapDetail({ gap, onClose, onUpdate, onViewTriangle }) {
    const [tab, setTab] = useState(0);
    const [escalationData, setEscalationData] = useState(null);
    const [loadingEsc, setLoadingEsc] = useState(false);

    if (!gap) return null;

    async function loadEscalation() {
        if (escalationData) return;
        setLoadingEsc(true);
        try {
            const { data } = await axios.get(`${API_BASE_URL}/gaps/${gap.id}/escalation`);
            setEscalationData(data.data);
        } catch { setEscalationData(null); }
        setLoadingEsc(false);
    }

    function handleTabChange(_, v) {
        setTab(v);
        if (v === 1) loadEscalation();
    }

    async function handleStatusChange(gapId, newStatus, resolution) {
        await axios.patch(`${API_BASE_URL}/explorer/gaps/${gapId}/status`, { status: newStatus, resolution });
        onUpdate?.();
    }

    async function handleEscalate(target, notes) {
        await axios.post(`${API_BASE_URL}/gaps/${gap.id}/escalate`, { escalateTo: target, notes });
        setEscalationData(null);
        await loadEscalation();
        onUpdate?.();
    }

    async function handleSnooze(days) {
        await axios.post(`${API_BASE_URL}/gaps/${gap.id}/snooze`, { days });
        setEscalationData(null);
        await loadEscalation();
        onUpdate?.();
    }

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <Chip label={gap.severity || '?'} size="small"
                        sx={{ height: 20, fontSize: 11,
                              bgcolor: (SEVERITY_COLORS[gap.severity] || '#94a3b8') + '22',
                              color: SEVERITY_COLORS[gap.severity] || '#94a3b8' }} />
                    <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ maxWidth: 280 }}>
                        {gap.title || 'Untitled Gap'}
                    </Typography>
                </Stack>
                <Stack direction="row" spacing={0.5}>
                    {gap.affectedProcess && onViewTriangle && (
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<GitBranch size={12} />}
                            onClick={() => onViewTriangle(gap.affectedProcess)}
                            sx={{ fontSize: 11 }}
                        >
                            Triangle
                        </Button>
                    )}
                    {onClose && (
                        <Button size="small" onClick={onClose} variant="outlined">
                            <X size={14} />
                        </Button>
                    )}
                </Stack>
            </Stack>

            {/* Process context */}
            {gap.processName && (
                <Box sx={{ mb: 1, px: 1, py: 0.5, bgcolor: 'action.hover', borderRadius: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        Affects process: <strong>{gap.processName}</strong>
                    </Typography>
                </Box>
            )}

            <Tabs value={tab} onChange={handleTabChange} sx={{ borderBottom: 1, borderColor: 'divider', mb: 0 }}>
                <Tab label="Details"    sx={{ minHeight: 36, py: 0.5, fontSize: 12 }} />
                <Tab label="Escalation" sx={{ minHeight: 36, py: 0.5, fontSize: 12,
                    color: gap.isStale ? 'warning.main' : undefined }} />
            </Tabs>

            <TabPanel value={tab} index={0}>
                <GapPanel
                    gap={gap}
                    onStatusChange={handleStatusChange}
                    onClose={onClose}
                />
            </TabPanel>

            <TabPanel value={tab} index={1}>
                {loadingEsc ? (
                    <Typography variant="body2" color="text.secondary">Loading escalation data…</Typography>
                ) : (
                    <EscalationPanel
                        gap={escalationData || gap}
                        onEscalate={handleEscalate}
                        onSnooze={handleSnooze}
                        onClose={onClose}
                    />
                )}
            </TabPanel>
        </Box>
    );
}
