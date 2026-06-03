/**
 * EscalationPanel — Gap escalation view and actions
 *
 * Shows:
 *   - Warning banner referencing KM-019 (gaps > 90d require escalation)
 *   - Timeline: Created → 90d mark → Today → 180d mark
 *   - Escalation history list
 *   - Escalation form: target selector + notes
 *   - Snooze button: 7 / 14 / 30 days
 *
 * Props:
 *   gap            { id, title, status, severity, ageDays, isStale, identifiedAt,
 *                    staleAt, reviewAt, snoozedUntil, history }
 *   onEscalate     (target, notes) => void
 *   onSnooze       (days) => void
 *   onClose        () => void
 */
import React, { useState } from 'react';
import {
    Box, Typography, Stack, Chip, Button, TextField,
    Alert, Divider, MenuItem, Select, FormControl, InputLabel,
    Paper
} from '@mui/material';
import { AlertTriangle, Clock, CheckCircle, ArrowRight } from 'lucide-react';

const ESCALATION_TARGETS = [
    'SECTION_CHIEF',
    'DEPARTMENT_HEAD',
    'MANAGEMENT',
    'OIOS',
    'AUDIT_COMMITTEE',
    'EXTERNAL'
];

function Timeline({ identifiedAt, staleAt, reviewAt, ageDays }) {
    if (!identifiedAt) return null;

    const created  = new Date(identifiedAt).getTime();
    const stale    = staleAt  ? new Date(staleAt).getTime()  : null;
    const review   = reviewAt ? new Date(reviewAt).getTime() : null;
    const today    = Date.now();

    const totalSpan = review ? (review - created) : (90 * 86400000 * 2);
    const todayPct  = Math.min(100, Math.round(((today - created) / totalSpan) * 100));
    const stalePct  = stale  ? Math.min(100, Math.round(((stale - created) / totalSpan) * 100))  : 50;
    const reviewPct = review ? Math.min(100, Math.round(((review - created) / totalSpan) * 100)) : 100;

    function fmt(ts) { return new Date(ts).toLocaleDateString(); }

    const todayColor = ageDays > 180 ? '#dc2626' : ageDays > 90 ? '#f97316' : '#64748b';

    return (
        <Box sx={{ mb: 2 }}>
            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 1 }}>
                ESCALATION TIMELINE
            </Typography>
            <Box sx={{ position: 'relative', height: 32 }}>
                {/* Track */}
                <Box sx={{ position: 'absolute', top: 14, left: 0, right: 0, height: 4, bgcolor: '#e2e8f0', borderRadius: 2 }} />
                {/* Progress */}
                <Box sx={{ position: 'absolute', top: 14, left: 0, height: 4, width: `${todayPct}%`, bgcolor: todayColor, borderRadius: 2 }} />
                {/* 90-day marker */}
                {stale && (
                    <Box sx={{ position: 'absolute', top: 8, left: `${stalePct}%`, transform: 'translateX(-50%)' }}>
                        <Box sx={{ width: 2, height: 16, bgcolor: '#f97316', mx: 'auto' }} />
                    </Box>
                )}
                {/* Today marker */}
                <Box sx={{ position: 'absolute', top: 6, left: `${Math.min(97, todayPct)}%`, transform: 'translateX(-50%)' }}>
                    <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: todayColor,
                               border: '2px solid white', boxShadow: `0 0 0 2px ${todayColor}44` }} />
                </Box>
            </Box>
            {/* Labels */}
            <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                <Box>
                    <Typography variant="caption" color="text.disabled" display="block">Created</Typography>
                    <Typography variant="caption" fontWeight={600}>{fmt(created)}</Typography>
                </Box>
                {stale && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="caption" color="warning.main" display="block">Escalate</Typography>
                        <Typography variant="caption">{fmt(stale)}</Typography>
                    </Box>
                )}
                <Box sx={{ textAlign: 'center' }}>
                    <Typography variant="caption" color={todayColor} fontWeight={700} display="block">Today (day {ageDays})</Typography>
                </Box>
                {review && (
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" color="error.main" display="block">Mgmt Review</Typography>
                        <Typography variant="caption">{fmt(review)}</Typography>
                    </Box>
                )}
            </Stack>
        </Box>
    );
}

export default function EscalationPanel({ gap, onEscalate, onSnooze, onClose }) {
    const [target,  setTarget]  = useState('MANAGEMENT');
    const [notes,   setNotes]   = useState('');
    const [saving,  setSaving]  = useState(false);

    if (!gap) return null;

    const history = gap.history || [];

    async function handleEscalate() {
        setSaving(true);
        try { await onEscalate?.(target, notes); setNotes(''); }
        finally { setSaving(false); }
    }

    async function handleSnooze(days) {
        setSaving(true);
        try { await onSnooze?.(days); }
        finally { setSaving(false); }
    }

    return (
        <Box>
            {/* Header */}
            <Stack direction="row" alignItems="flex-start" justifyContent="space-between" sx={{ mb: 1.5 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                    <AlertTriangle size={18} color="#f97316" />
                    <Typography variant="subtitle2" fontWeight={700}>
                        Escalation — {gap.title || gap.id}
                    </Typography>
                </Stack>
            </Stack>

            {/* Warning banner */}
            {gap.isStale && (
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                    <Typography variant="body2" gutterBottom>
                        <strong>This gap has been OPEN for {gap.ageDays} days</strong>
                    </Typography>
                    <Typography variant="caption" display="block">
                        Per Codex KM-019: gaps open &gt; 90 days require escalation.
                        {gap.ageDays > 180 && ' Gaps open > 180 days require management review.'}
                    </Typography>
                </Alert>
            )}
            {gap.snoozedUntil && new Date(gap.snoozedUntil) > new Date() && (
                <Alert severity="info" sx={{ mb: 1.5 }} icon={<Clock size={16} />}>
                    Snoozed until {new Date(gap.snoozedUntil).toLocaleDateString()}
                </Alert>
            )}

            {/* Timeline */}
            <Timeline
                identifiedAt={gap.identifiedAt}
                staleAt={gap.staleAt}
                reviewAt={gap.reviewAt}
                ageDays={gap.ageDays || 0}
            />

            {/* Escalation history */}
            {history.length > 0 && (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 0.75 }}>
                        ESCALATION HISTORY
                    </Typography>
                    <Stack spacing={0.5}>
                        {history.map((e, i) => (
                            <Paper key={i} variant="outlined" sx={{ p: 1, borderRadius: 1 }}>
                                <Stack direction="row" spacing={1} alignItems="flex-start">
                                    {e.type === 'SNOOZE'
                                        ? <Clock size={13} color="#64748b" />
                                        : <ArrowRight size={13} color="#ef4444" />}
                                    <Box>
                                        <Typography variant="caption" fontWeight={600}>
                                            {e.type === 'SNOOZE' ? `Snoozed ${e.snoozeDays}d` : `Escalated to ${e.escalatedTo}`}
                                        </Typography>
                                        <Typography variant="caption" color="text.disabled" display="block">
                                            {e.escalatedAt ? new Date(e.escalatedAt).toLocaleDateString() : ''}
                                            {e.notes ? ` — ${e.notes}` : ''}
                                        </Typography>
                                    </Box>
                                </Stack>
                            </Paper>
                        ))}
                    </Stack>
                </Box>
            )}
            {history.length === 0 && (
                <Box sx={{ p: 1.5, mb: 2, bgcolor: 'action.hover', borderRadius: 1, textAlign: 'center' }}>
                    <Typography variant="caption" color="text.disabled">No escalations recorded</Typography>
                </Box>
            )}

            <Divider sx={{ mb: 1.5 }} />

            {/* Escalation form */}
            <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" sx={{ mb: 1 }}>
                RECORD ESCALATION
            </Typography>
            <FormControl size="small" fullWidth sx={{ mb: 1 }}>
                <InputLabel>Escalate to</InputLabel>
                <Select value={target} label="Escalate to" onChange={e => setTarget(e.target.value)}>
                    {ESCALATION_TARGETS.map(t => <MenuItem key={t} value={t}>{t.replace(/_/g, ' ')}</MenuItem>)}
                </Select>
            </FormControl>
            <TextField
                size="small" fullWidth multiline rows={2}
                label="Notes" placeholder="Context, urgency, prior actions taken…"
                value={notes} onChange={e => setNotes(e.target.value)}
                sx={{ mb: 1.5 }}
            />

            {/* Actions */}
            <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button
                    variant="contained" size="small"
                    onClick={handleEscalate}
                    disabled={saving}
                    color="warning"
                    sx={{ flex: 1 }}
                >
                    {saving ? 'Saving…' : 'Record Escalation'}
                </Button>
                {[7, 14, 30].map(days => (
                    <Button key={days} variant="outlined" size="small"
                        onClick={() => handleSnooze(days)}
                        disabled={saving}
                        sx={{ fontSize: 11, px: 1 }}>
                        Snooze {days}d
                    </Button>
                ))}
                <Button variant="outlined" size="small" onClick={onClose}>Cancel</Button>
            </Stack>
        </Box>
    );
}
